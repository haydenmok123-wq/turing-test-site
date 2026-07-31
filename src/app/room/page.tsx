"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  appendUserMessage,
  formatClock,
  getAdminSettings,
  getGuessRemainingMs,
  getRemainingMs,
  getRoom,
  materializePendingReply,
  resolveGuess,
  type RoomState
} from "@/lib/site";

function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get("roomId") ?? "";
  const [room, setRoom] = useState<RoomState | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(0);
  const [guessClock, setGuessClock] = useState(0);

  useEffect(() => {
    const current = getRoom(roomId);
    if (!current) {
      return;
    }

    const hydrated = materializePendingReply(current);
    setRoom(hydrated);
    setClock(getRemainingMs(hydrated));
    setGuessClock(getGuessRemainingMs(hydrated));
  }, [roomId]);

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

  const roomEnded = useMemo(() => !room || clock <= 0 || Boolean(room.resolvedAt), [clock, room]);
  const guessLocked = guessClock > 0;
  const actualLabel = room?.opponentKind === "human" ? "真人" : "AI";

  function handleSend() {
    if (!room || roomEnded) {
      return;
    }

    const { room: nextRoom, moderation } = appendUserMessage(room, draft, getAdminSettings());
    setRoom(nextRoom);
    setDraft("");
    setNotice(
      moderation.allowed
        ? moderation.maskedText !== draft.trim()
          ? "訊息已遮蔽敏感詞後送出。"
          : "訊息已送出。"
        : moderation.reason ?? "訊息被攔截。"
    );
  }

  function handleGuess(guess: "human" | "ai") {
    if (!room || guessLocked || roomEnded) {
      return;
    }

    const nextRoom = resolveGuess(room, guess);
    setRoom(nextRoom);
    setNotice("判斷已提交，重新開始必須走結果頁按鈕，不會直接重置目前案例。");
  }

  if (!room) {
    return (
      <main className="page-shell">
        <div className="card">
          <h1>找不到房間</h1>
          <p className="muted">這個房間可能已經不存在，或尚未建立。</p>
          <Link className="primary-button" href="/">
            回首頁
          </Link>
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
          <span className={`status-pill ${clock <= 60_000 ? "danger" : ""}`}>剩餘時間 {formatClock(clock)}</span>
          <span className={`status-pill ${guessLocked ? "" : "success"}`}>
            {guessLocked ? `判斷按鈕 ${formatClock(guessClock)} 後解鎖` : "現在可以判斷身份"}
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
            <h2 style={{ marginTop: 0 }}>身份判斷</h2>
            <p className="muted">
              下方只有兩個按鈕：`對方是真人` 或 `對方是 AI`。按下之後不會偷偷重開案例；若要重新來過，必須等結果出現後由你手動開始下一局。
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
            <div className="card">
              <h2 style={{ marginTop: 0 }}>本局結果</h2>
              <p className={room.guess === room.opponentKind ? "alert ok" : "alert"}>
                你的判斷：{room.guess === "human" ? "真人" : "AI"}。實際身份：{actualLabel}。
              </p>
              <div className="button-row">
                <button className="primary-button" onClick={() => router.push("/")} type="button">
                  回首頁重新來過
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="panel chat-shell">
          <div>
            <h1 style={{ marginTop: 0 }}>聊天室</h1>
            <p className="muted">
              你可以繼續說話，直到時間結束或你送出判斷。若重新整理或斷線回來，聊天歷史仍會保留。
            </p>
          </div>

          <div className="message-list">
            {room.messages.map((message) => (
              <article className={`message ${message.sender}`} key={message.id}>
                <span className="message-meta">
                  {message.sender === "me"
                    ? "你"
                    : message.sender === "opponent"
                      ? "匿名對象"
                      : "系統"}
                </span>
                <div>{message.text}</div>
              </article>
            ))}
          </div>

          {notice ? <div className={notice.includes("送出") ? "alert ok" : "alert"}>{notice}</div> : null}

          <div className="composer">
            <label className="field" htmlFor="message">
              <span className="field-label">輸入訊息</span>
              <textarea
                className="textarea"
                disabled={roomEnded}
                id="message"
                onChange={(event) => setDraft(event.target.value)}
                placeholder="試探對方，但記得敏感訊息可能被遮蔽或攔截。"
                value={draft}
              />
            </label>
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
