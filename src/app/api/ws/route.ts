import { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { attachSocket } from "../../../../server/engine.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel / Next.js Node runtime：從 request 取出底層 socket 升級為 WebSocket。
// 若平台未提供底層 socket，回傳 426，前端會自動改用 HTTP polling（/api/sync）。
export function GET(request: Request) {
  const upgrade = request.headers.get("upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") || "";
  if (!deviceId) {
    return new Response("missing deviceId", { status: 400 });
  }

  // 平台注入的底層 socket（IncomingMessage 或 Duplex）
  const rawSocket: IncomingMessage | Duplex | undefined = (request as any).socket;
  if (!rawSocket) {
    return new Response("WebSocket upgrade unavailable, use /api/sync", { status: 426 });
  }

  const isDuplex = typeof (rawSocket as Duplex).write === "function" && typeof (rawSocket as Duplex).on === "function";

  if (isDuplex) {
    const wss = new WebSocketServer({ noServer: true });
    const socket = rawSocket as Duplex;
    // 以 fetch Request 模擬 IncomingMessage 給 ws 使用
    const fakeReq = {
      headers: Object.fromEntries(request.headers.entries()),
      rawHeaders: [] as string[],
      url: request.url,
      method: "GET",
      httpVersion: "1.1",
      socket
    } as unknown as IncomingMessage;
    wss.handleUpgrade(fakeReq, socket, Buffer.alloc(0), (ws) => {
      attachSocket(ws, deviceId, url.searchParams.get("fp") || "");
    });
    return new Response(null, { status: 101 });
  }

  const wss = new WebSocketServer({ noServer: true });
  wss.handleUpgrade(rawSocket as IncomingMessage, (rawSocket as IncomingMessage).socket, Buffer.alloc(0), (ws) => {
    attachSocket(ws, deviceId, url.searchParams.get("fp") || "");
  });
  return new Response(null, { status: 101 });
}
