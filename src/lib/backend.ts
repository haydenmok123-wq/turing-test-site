import type { AdminSettings, GuessChoice, ModerationResult, RoomState } from "@/lib/site";

export type BackendEvent =
  | { type: "queued"; position: number }
  | { type: "paired"; room: RoomState }
  | { type: "room"; room: RoomState; resumed?: boolean }
  | { type: "sendAck"; roomId: string; moderation: ModerationResult }
  | { type: "peerLeft"; roomId: string }
  | { type: "peerBack"; roomId: string }
  | { type: "cancelled" }
  | { type: "error"; message: string };

type Op = Record<string, unknown>;
type Listener = (event: BackendEvent) => void;

const WS_TIMEOUT_MS = 2500;
const POLL_INTERVAL_MS = 1500;
const PAIR_TIMEOUT_MS = 25000;
const RESUME_TIMEOUT_MS = 8000;

class BackendClient {
  private mode: "idle" | "probing" | "ws" | "poll" | "offline" = "idle";
  private probePromise: Promise<boolean> | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pendingOps: Op[] = [];
  private pollTimer: number | null = null;
  private pollFails = 0;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private deviceId = "";
  private fp = "";

  private endpoints(): { ws: string; poll: string } {
    if (typeof window === "undefined") {
      return { ws: "", poll: "" };
    }
    const override = (process.env.NEXT_PUBLIC_BACKEND_URL || "").trim().replace(/\/+$/, "");
    let base = override;
    let proto = "https";
    if (!base) {
      base = window.location.host;
      proto = window.location.protocol === "https:" ? "https" : "http";
    }
    const wsProto = proto === "https" ? "wss" : "ws";
    return {
      ws: wsProto + "://" + base + "/api/ws",
      poll: proto + "://" + base + "/api/sync"
    };
  }

  private configure(deviceId: string, fp: string) {
    this.deviceId = deviceId || "anon";
    this.fp = fp || "";
  }

  getMode(): string {
    return this.mode;
  }

  on(listener: Listener) {
    this.listeners.add(listener);
    return () => this.off(listener);
  }

  off(listener: Listener) {
    this.listeners.delete(listener);
  }

  private emit(event: BackendEvent) {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      } catch {
        // 忽略單一監聽器錯誤
      }
    }
  }

  async probe(): Promise<boolean> {
    if (this.mode === "ws" || this.mode === "poll") return true;
    if (this.mode === "offline") return false;
    if (this.probePromise) return this.probePromise;
    this.mode = "probing";
    this.probePromise = (async () => {
      const wsOk = await this.tryWebSocket();
      if (wsOk) {
        this.mode = "ws";
        return true;
      }
      const pollOk = await this.tryPoll();
      if (pollOk) {
        this.mode = "poll";
        this.startPolling();
        return true;
      }
      this.mode = "offline";
      return false;
    })();
    return this.probePromise;
  }

  private flushPending() {
    if (!this.ws || this.ws.readyState !== 1) return;
    const ops = this.pendingOps.splice(0, this.pendingOps.length);
    for (const op of ops) {
      try {
        this.ws.send(JSON.stringify(op));
      } catch {
        this.pendingOps.unshift(op);
      }
    }
  }

  private tryWebSocket(): Promise<boolean> {
    const endpoints = this.endpoints();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      try {
        const ws = new WebSocket(
          endpoints.ws +
            "?deviceId=" +
            encodeURIComponent(this.deviceId || "anon") +
            "&fp=" +
            encodeURIComponent(this.fp || "")
        );
        const timer = window.setTimeout(() => {
          try {
            ws.close();
          } catch {
            // ignore
          }
          finish(false);
        }, WS_TIMEOUT_MS);
        ws.onopen = () => {
          window.clearTimeout(timer);
          this.ws = ws;
          this.reconnectAttempts = 0;
          this.flushPending();
          finish(true);
        };
        ws.onerror = () => {
          window.clearTimeout(timer);
          try {
            ws.close();
          } catch {
            // ignore
          }
          finish(false);
        };
        ws.onmessage = (event) => {
          let msg: BackendEvent | null = null;
          try {
            msg = JSON.parse(String(event.data)) as BackendEvent;
          } catch {
            return;
          }
          if (!msg) return;
          this.emit(msg);
        };
        ws.onclose = () => {
          window.clearTimeout(timer);
          if (this.ws === ws) this.ws = null;
          if (this.mode === "ws") this.scheduleReconnect();
          finish(false);
        };
      } catch {
        finish(false);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(8000, 600 * Math.pow(2, this.reconnectAttempts));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void (async () => {
        const ok = await this.tryWebSocket();
        if (ok) return;
        this.reconnectAttempts += 1;
        if (this.reconnectAttempts >= 4) {
          const pollOk = await this.tryPoll();
          if (pollOk) {
            this.mode = "poll";
            this.startPolling();
            return;
          }
          this.reconnectAttempts = 0;
        }
        this.scheduleReconnect();
      })();
    }, delay);
  }

  private async fetchPoll(ops: Op[]): Promise<BackendEvent[] | null> {
    const endpoints = this.endpoints();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoints.poll, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: this.deviceId || "anon",
          fp: this.fp || "",
          ops
        }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { messages?: BackendEvent[] };
      return data.messages || [];
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private async tryPoll(): Promise<boolean> {
    const messages = await this.fetchPoll([]);
    return messages !== null;
  }

  private startPolling() {
    if (this.pollTimer) return;
    const tick = () => {
      void (async () => {
        const ops = this.pendingOps.splice(0, this.pendingOps.length);
        const messages = await this.fetchPoll(ops);
        if (messages === null) {
          this.pollFails += 1;
          if (this.pollFails > 5) {
            if (this.pollTimer) {
              window.clearInterval(this.pollTimer);
              this.pollTimer = null;
            }
            this.mode = "idle";
            this.probePromise = null;
          }
          return;
        }
        this.pollFails = 0;
        for (const message of messages) this.emit(message);
      })();
    };
    void tick();
    this.pollTimer = window.setInterval(tick, POLL_INTERVAL_MS);
  }

  private sendOp(op: Op) {
    if (this.mode === "ws" && this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify(op));
        return;
      } catch {
        // 改走佇列
      }
    }
    this.pendingOps.push(op);
  }

  async pair(deviceId: string, fp: string, settings: AdminSettings): Promise<{ roomId: string } | null> {
    this.configure(deviceId, fp);
    if (this.mode === "offline") return null;
    return new Promise((resolve) => {
      let settled = false;
      const listener: Listener = (event) => {
        if (event.type === "paired") {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.off(listener);
            resolve({ roomId: event.room.roomId });
          }
        } else if (event.type === "error") {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.off(listener);
            resolve(null);
          }
        }
      };
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.off(listener);
          resolve(null);
        }
      }, PAIR_TIMEOUT_MS);
      this.on(listener);
      this.sendOp({ type: "pair", settings });
    });
  }

  async resume(deviceId: string, fp: string, roomId: string): Promise<RoomState | null> {
    this.configure(deviceId, fp);
    if (this.mode === "offline") return null;
    return new Promise((resolve) => {
      let settled = false;
      const listener: Listener = (event) => {
        if (event.type === "room" && event.resumed && event.room.roomId === roomId) {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.off(listener);
            resolve(event.room);
          }
        } else if (event.type === "error") {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.off(listener);
            resolve(null);
          }
        }
      };
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.off(listener);
          resolve(null);
        }
      }, RESUME_TIMEOUT_MS);
      this.on(listener);
      this.sendOp({ type: "resume", roomId });
    });
  }

  cancelPair() {
    this.sendOp({ type: "cancel" });
  }

  send(roomId: string, text: string) {
    this.sendOp({ type: "send", roomId, text });
  }

  guess(roomId: string, choice: GuessChoice) {
    this.sendOp({ type: "guess", roomId, choice });
  }

  disconnect() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.mode = "idle";
    this.probePromise = null;
  }
}

let sharedClient: BackendClient | null = null;

export function getBackendClient(): BackendClient {
  if (!sharedClient) sharedClient = new BackendClient();
  return sharedClient;
}
