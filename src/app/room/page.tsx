"use client";

import Link from "next/link";
import { getBackendClient } from "@/lib/backend";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendUserMessage,
  createRoomState,
  formatClock,
  getAdminSettings,
  getDeviceMeta,
  getGuessRemainingMs,
  getRemainingMs,
  getRoom,
  materializePendingReply,
  resolveGuess,
  saveRoom,
  type RoomState
} from "@/lib/site";

function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get("roomId") ?? "";
  const [room, setRoom] = useState<RoomState | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [banner, setBanner] = useState("");
  const [clock, setClock] = useState(0);
  const [guessClock, setGuessClock] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const syncedRef = useRef(false);
  const roomIdRef = useRef(roomId);
  const lastSentRef = useRef("");
  const [connState, setConnState] = useState<"checking" | "online" | "offline">("checking");
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;

    const current = getRoom(roomId);
    if (current) {
      const hydrated = materializePendingReply(current);
      setRoom(hydrated);
      setClock(getRemainingMs(hydrated));
      setGuessClock(getGuessRemainingMs(hydrated));
      if (!syncedRef.current) {
        syncedRef.current = true;
        const historyCount = hydrated.messages.length;
        setBanner(
          historyCount > 2
            ? `已重新連線 · 聊天歷史已同步（${historyCount} 則訊息）`
            : "已重新連線 · 配對狀態已同步"
        );
      }
    }

    const client = getBackendClient();
    void (async () => {
      const meta = getDeviceMeta();
      const online = await client.probe();
      if (cancelled) return;
      if (!online) {
        setConnState("offline");
        return;
      }
      const serverRoom = await client.resume(meta.id, meta.id, roomId);
      if (cancelled) return;
      if (serverRoom) {
        saveRoom(serverRoom);
        setRoom(serverRoom);
        setClock(getRemainingMs(serverRoom));
        setGuessClock(getGuessRemainingMs(serverRoom));
        setConnState("online");
        setBanner("已連上伺服器 · 聊天歷史已同步");
      } else {
        setConnState("offline");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    const client = getBackendClient();
    return client.on((event) => {
      if (event.type === "room" && event.room.roomId === roomIdRef.current) {
        saveRoom(event.room);
        setRoom(event.room);
        setClock(getRemainingMs(event.room));
        setGuessClock(getGuessRemainingMs(event.room));
      } else if (event.type === "sendAck" && event.roomId === roomIdRef.current) {
        const moderation = event.moderation;
        if (moderation.allowed) {
          setNotice(
            moderation.maskedText !== lastSentRef.current
              ? "訊息已送出，部分敏感字詞已遮蔽。"
              : "訊息已送出。"
          );
        } else {
          setNotice(moderation.reason ?? "訊息被攔截。");
        }
      } else if (event.type === "peerLeft") {
        setBanner("對方已離開連線，正在等待對方恢復…");
      } else if (event.type === "peerBack") {
        setBanner("對方已恢復連線。");
      } else if (event.type === "error") {
        setNotice(event.message);
      }
    });
  }, []);

  useEffect(() => {
    if (!room) {
      return;
    }

    const timer = window.setInterval(() => {
      const latest = materializePendingReply(getRoom(room.roomId) ?? room);
      setRoom(latest);
      setClock(getRemainingMs(latest));
      setGuessClock(getGuessRemainingMs(latest));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [room]);

  useEffect(() => {
    function handleOnline() {
      const latest = getRoom(roomId);
      if (latest) {
        setRoom(materializePendingReply(latest));
        setBanner(`網路已恢復 · 聊天歷史已同步（${latest.messages.length} 則訊息）`);
      }
    }

    function handleOffline() {
      setBanner("網路連線中斷 · 本機資料已保留，恢復連線後自動同步");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [roomId]);

  useEffect(() => {
    if (!banner) {
      return;
    }

    const timer = window.setTimeout(() => setBanner(""), 4200);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [room?.messages.length, room?.pendingReply]);

  const roomEnded = useMemo(
    () => !room || clock <= 0 || Boolean(room.resolvedAt),
    [clock, room]
  );
  const timedOut = useMemo(() => Boolean(room) && !room?.resolvedAt && clock <= 0, [clock, room]);
  const guessLocked = guessClock > 0;
  const actualLabel = room?.opponentKind === "human" ? "真人" : "AI";
  const guessLabel = room?.guess === "human" ? "真人" : room?.guess === "ai" ? "AI" : null;
  const correct = room?.guess === room?.opponentKind;

  function handleRestart() {
    if (connState === "online") {
      if (restarting) {
        return;
      }
      setRestarting(true);
      setNotice("正在重新配對…");
      void (async () => {
        const client = getBackendClient();
        const meta = getDeviceMeta();
        const result = await client.pair(meta.id, meta.id, getAdminSettings());
        setRestarting(false);
        if (result?.roomId) {
          setNotice("");
          router.replace(`/room?roomId=${result.roomId}`);
        } else {
          setNotice("重新配對失敗，請回首頁再試。");
        }
      })();
      return;
    }

    const nextRoom = createRoomState();
    if (!nextRoom) {
      setNotice("無法建立新房間，請稍後再試。");
      return;
    }

    router.push(`/room?roomId=${nextRoom.roomId}`);
  }

  function handleSend() {
    if (!room || roomEnded) {
      return;
    }

    if (connState === "online") {
      const text = draft.trim();
      if (!text) {
        return;
      }
      lastSentRef.current = text;
      setDraft("");
      setNotice("訊息已送出，等待對方回覆…");
      getBackendClient().send(room.roomId, text);
      return;
    }

    const { room: nextRoom, moderation } = appendUserMessage(room, draft, getAdminSettings());
    setRoom(nextRoom);
    setDraft("");
    setNotice(
      moderation.allowed
        ? moderation.maskedText !== draft.trim()
          ? "訊息已送出，部分敏感字詞已遮蔽。"
          : "訊息已送出。"
        : moderation.reason ?? "訊息被攔截。"
    );
  }

  const handleGuess = useCallback(
    function handleGuess(guess: "human" | "ai") {
      if (!room || guessLocked || roomEnded) {
        return;
      }

      if (connState === "online") {
        setNotice("判斷已提交，正在等待結果…");
        getBackendClient().guess(room.roomId, guess);
        return;
      }

      const nextRoom = resolveGuess(room, guess);
      setRoom(nextRoom);
      setNotice("判斷已提交。結果已揭曉，聊天鎖定為唯讀。");
    },
    [connState, guessLocked, roomEnded, room]
  );

  if (!room) {
    return (
      <main className="page-shell">
        <div className="card">
          <h1>找不到房間</h1>
          <p className="muted">這個房間不存在或已被清除，可能是換了瀏覽器或清除了本機資料。</p>
          <div className="button-row">
            <button className="primary-button" disabled={restarting} onClick={handleRestart} type="button">
              重新來過
            </button>
            <Link className="secondary-button" href="/">
              回首頁
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="top-bar">
        <div className="brand">
          <span className="brand-mark" />
          圖靈測試 / 盲測房
        </div>
        <div className="button-row" style={{ marginTop: 0 }}>
          <span className={`status-pill ${connState === "online" ? "success" : ""}`}>
            {connState === "online"
              ? "伺服器連線中"
              : connState === "checking"
                ? "連線中…"
                : "本機模式"}
          </span>
          <span className={`status-pill ${clock <= 60_000 && !roomEnded ? "danger" : ""}`}>
            剩餘時間 {formatClock(clock)}
          </span>
          <span className={`status-pill ${guessLocked ? "" : "success"}`}>
            {guessLocked
              ? `判斷按鈕 ${formatClock(guessClock)} 後解鎖`
              : room.resolvedAt
                ? "已做出判斷"
                : "判斷按鈕已解鎖"}
          </span>
        </div>
      </div>

      <section className="room-grid">
        <aside className="stack">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>本局規則</h2>
            <div className="summary-grid">
              <div className="stat-card">
                <span className="stat-label">配對模式</span>
                <div className="stat-value">隨機匿名匹配</div>
              </div>
              <div className="stat-card">
                <span className="stat-label">猜測限制</span>
                <div className="stat-value">10 秒後才可判斷</div>
              </div>
              <div className="stat-card">
                <span className="stat-label">重連保護</span>
                <div className="stat-value">歷史會同步保存</div>
              </div>
            </div>
            <div className="divider" />
            <div className="stack" style={{ gap: 12 }}>
              {room.fairnessFlags.map((flag) => (
                <span className="pill" key={flag}>
                  {flag}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>你的判斷</h2>
            <p className="muted">
              開始聊天後十秒內不能判斷，請先透過對話收集線索。判斷送出後本局即結束、聊天鎖定為唯讀，可以在下方直接重新來過。
            </p>
            <div className="button-row">
              <button
                className={`guess-button ${room.guess === "human" ? "active" : ""}`}
                disabled={guessLocked || roomEnded}
                onClick={() => handleGuess("human")}
                type="button"
              >
                對方是真人
              </button>
              <button
                className={`guess-button ${room.guess === "ai" ? "active" : ""}`}
                disabled={guessLocked || roomEnded}
                onClick={() => handleGuess("ai")}
                type="button"
              >
                對方是 AI
              </button>
            </div>
          </div>

          {room.resolvedAt ? (
            <div className="card result-card">
              <h2 style={{ marginTop: 0 }}>結果揭曉</h2>
              <div className={`result-hero ${correct ? "ok" : "bad"}`}>
                <span className="result-label">實際身份</span>
                <strong className="result-value">{actualLabel}</strong>
                {guessLabel ? <em className="result-sub">你判斷：{guessLabel}</em> : null}
              </div>
              <p className={correct ? "alert ok" : "alert"}>
                {correct ? "判斷成功，你猜對了對方的身份。" : "判斷失敗，對方其實是" + actualLabel + "。"}
              </p>
              <div className="button-row">
                <button className="primary-button" disabled={restarting} onClick={handleRestart} type="button">
                  重新來過
                </button>
                <Link className="ghost-button" href="/">
                  回首頁
                </Link>
              </div>
            </div>
          ) : null}

          {timedOut ? (
            <div className="card result-card">
              <h2 style={{ marginTop: 0 }}>時間到</h2>
              <div className="result-hero bad">
                <span className="result-label">本局結束</span>
                <strong className="result-value">未做出判斷</strong>
                <em className="result-sub">十分鐘已屆滿，聊天已鎖定為唯讀</em>
              </div>
              <div className="button-row">
                <button className="primary-button" disabled={restarting} onClick={handleRestart} type="button">
                  重新來過
                </button>
                <Link className="ghost-button" href="/">
                  回首頁
                </Link>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="panel chat-shell">
          <div>
            <h1 style={{ marginTop: 0 }}>匿名對話</h1>
            <p className="muted">
              對方可能是真人，也可能是 AI。用對話收集線索，但小心：對方也在觀察你。敏感字詞會被遮蔽或攔截。
            </p>
          </div>

          {banner ? (
            <div className="banner" role="status">
              {banner}
            </div>
          ) : null}

          <div className="message-list" ref={listRef}>
            {room.messages.map((message) => (
              <article className={`message ${message.sender}`} key={message.id}>
                <span className="message-meta">
                  {message.sender === "me"
                    ? "你"
                    : message.sender === "opponent"
                      ? "對方"
                      : "系統"}
                </span>
                <div>{message.text}</div>
              </article>
            ))}
            {room.pendingReply ? (
              <article className="message opponent typing">
                <span className="message-meta">對方</span>
                <div className="typing-dots" aria-label="對方正在輸入">
                  <i />
                  <i />
                  <i />
                </div>
              </article>
            ) : null}
          </div>

          {notice ? (
            <div className={notice.includes("已送出") || notice.includes("已同步") ? "alert ok" : "alert"}>
              {notice}
            </div>
          ) : null}

          <div className="composer">
            <label className="field" htmlFor="message">
              <span className="field-label">輸入訊息</span>
              <textarea
                className="textarea"
                disabled={roomEnded}
                id="message"
                maxLength={getAdminSettings().messageMaxLength}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="試探對方，但記得敏感訊息可能被遮蔽或攔截。Ctrl+Enter 送出。"
                value={draft}
              />
            </label>
            {roomEnded ? (
              <p className="muted" style={{ margin: 0 }}>
                {room.resolvedAt ? "本局已結束，聊天為唯讀。可按「重新來過」開新局。" : "十分鐘已屆滿，聊天為唯讀。"}
              </p>
            ) : null}
            <div className="button-row">
              <button
                className="primary-button"
                disabled={!draft.trim() || roomEnded}
                onClick={handleSend}
                type="button"
              >
                送出訊息
              </button>
              <Link className="ghost-button" href="/">
                回首頁
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomContent />
    </Suspense>
  );
}
