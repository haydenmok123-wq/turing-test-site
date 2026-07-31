"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRoomState,
  defaultAdminSettings,
  getAdminSettings,
  getLatestActiveRoom
} from "@/lib/site";

const ADMIN_PASSWORD = "398398";
const ADMIN_TRIGGER_CLICKS = 5;

export default function HomePage() {
  const router = useRouter();
  const [brandClicks, setBrandClicks] = useState(0);
  const [footerClicks, setFooterClicks] = useState(0);
  const [password, setPassword] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resumeRoomId, setResumeRoomId] = useState<string | null>(null);
  const [settingsSummary, setSettingsSummary] = useState(defaultAdminSettings);

  useEffect(() => {
    setSettingsSummary(getAdminSettings());
    const active = getLatestActiveRoom();
    setResumeRoomId(active?.roomId ?? null);
  }, []);

  useEffect(() => {
    if (brandClicks >= ADMIN_TRIGGER_CLICKS) {
      setAdminOpen(true);
      setBrandClicks(0);
      setFooterClicks(0);
    }
  }, [brandClicks]);

  useEffect(() => {
    if (footerClicks >= ADMIN_TRIGGER_CLICKS) {
      setAdminOpen(true);
      setFooterClicks(0);
      setBrandClicks(0);
    }
  }, [footerClicks]);

  const fairnessText = useMemo(
    () =>
      [
        `重複配對冷卻 ${settingsSummary.repeatPairCooldownMinutes} 分鐘`,
        `十五分鐘內超過 ${settingsSummary.suspiciousJoinThreshold} 次進房會標記可疑`
      ].join(" / "),
    [settingsSummary]
  );

  const adminProgress = useMemo(
    () => Array.from({ length: ADMIN_TRIGGER_CLICKS }, (_, index) => index < footerClicks),
    [footerClicks]
  );

  function handleStart() {
    const active = getLatestActiveRoom();
    if (active) {
      setNotice("偵測到一間進行中的房間，已幫你續接，聊天歷史不會丟失。");
      router.push(`/room?roomId=${active.roomId}`);
      return;
    }

    const room = createRoomState();
    if (!room) {
      setNotice("無法建立房間，請稍後再試。");
      return;
    }

    router.push(`/room?roomId=${room.roomId}`);
  }

  function handleAdminAccess() {
    if (password === ADMIN_PASSWORD) {
      try {
        window.sessionStorage.setItem("turing-test-admin-auth", "1");
      } catch {
        // ignore
      }
      setAdminOpen(false);
      setPassword("");
      setError("");
      router.push("/admin");
      return;
    }

    setError("管理員密碼不正確。");
  }

  function closeAdmin() {
    setAdminOpen(false);
    setPassword("");
    setError("");
    setBrandClicks(0);
    setFooterClicks(0);
  }

  return (
    <main className="page-shell">
      <div className="top-bar">
        <button
          aria-label="品牌標誌（連點五次開啟管理員入口）"
          className="brand ghost-button"
          onClick={() => setBrandClicks((count) => count + 1)}
          title="圖靈測試"
          type="button"
        >
          <span className="brand-mark" />
          圖靈測試
        </button>
        <span className="pill">真人 / AI 雙向盲測</span>
      </div>

      <section className="hero-grid">
        <div className="panel">
          <span className="eyebrow">螢幕那邊，是人嗎？</span>
          <h1 className="hero-title">
            真人 / AI
            <br />
            雙向盲測
          </h1>
          <p className="hero-copy">
            隨機配對一位匿名物件。十分鐘內聊天、試探、判斷，但別忘了，對方也在觀察你。這不只是你辨識對方的實驗，也是對方辨識你的圖靈測試。
          </p>

          <div className="stat-grid" style={{ marginTop: 24 }}>
            <div className="stat-card">
              <span className="stat-label">匹配模式</span>
              <div className="stat-value">真人或 AI 隨機匹配</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">判斷時機</span>
              <div className="stat-value">聊天 10 秒後才能按鈕判定</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">遊戲節奏</span>
              <div className="stat-value">10 分鐘限時雙向辨識</div>
            </div>
          </div>

          <div className="cta-row">
            <button className="primary-button" onClick={handleStart} type="button">
              開始盲測
            </button>
            {resumeRoomId ? (
              <button
                className="secondary-button"
                onClick={() => router.push(`/room?roomId=${resumeRoomId}`)}
                type="button"
              >
                回到進行中的房間
              </button>
            ) : null}
          </div>

          {notice ? (
            <p className="alert ok" role="status">
              {notice}
            </p>
          ) : null}
        </div>

        <aside className="stack">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>測試規則</h2>
            <div className="info-grid">
              <div className="info-card">
                <strong>雙方都在辨識對方</strong>
                <p className="muted">
                  你不知道對方是真人還是 AI，對方也不知道你是人還是機器。
                </p>
              </div>
              <div className="info-card">
                <strong>判斷按鈕延遲解鎖</strong>
                <p className="muted">
                  開始聊天 10 秒後，底部才會出現可用的「對方是真人」與「對方是 AI」按鈕。
                </p>
              </div>
              <div className="info-card">
                <strong>訊息安全過濾</strong>
                <p className="muted">
                  內建毒性與敏感詞過濾，必要時會遮蔽或直接阻擋訊息送出。
                </p>
              </div>
              <div className="info-card">
                <strong>斷線續接</strong>
                <p className="muted">
                  房間歷史、倒數計時、判斷狀態都會同步保存，重新進入也不會丟失上下文。
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>公平性與防作弊</h2>
            <p className="muted">{fairnessText}</p>
            <div className="button-row">
              <span className="status-pill success">避免同裝置重複濫用</span>
              <span className="status-pill">平衡真人 / AI 配對比例</span>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>本地 AI 介面</h2>
            <p className="muted">
              AI 對手優先走你設定的本地部署端點（Ollama / OpenAI 相容 API），連不到時自動退回內建回應庫，遊戲不會中斷。
            </p>
            <div className="pill" style={{ wordBreak: "break-all" }}>
              {settingsSummary.localAiEndpoint || "未設定本地端點"}
            </div>
          </div>
        </aside>
      </section>

      <footer className="footer-bar">
        <button
          aria-label="管理員入口（連點五次）"
          className="admin-trigger"
          onClick={() => setFooterClicks((count) => count + 1)}
          type="button"
        >
          <span className="admin-trigger-dots">
            {adminProgress.map((lit, index) => (
              <i aria-hidden="true" className={lit ? "dot lit" : "dot"} key={index} />
            ))}
          </span>
          管理員入口
        </button>
      </footer>

      {adminOpen ? (
        <div className="overlay">
          <div className="modal">
            <h2 style={{ marginTop: 0 }}>管理員驗證</h2>
            <p className="muted">
              輸入管理員密碼以進入管理中心。預設密碼為 <code>398398</code>。
            </p>
            <div className="field">
              <label className="field-label" htmlFor="admin-password">
                管理員密碼
              </label>
              <input
                autoFocus
                className="input"
                id="admin-password"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleAdminAccess();
                  }
                }}
                type="password"
                value={password}
              />
            </div>
            {error ? <p className="alert">{error}</p> : null}
            <div className="button-row">
              <button className="primary-button" onClick={handleAdminAccess} type="button">
                驗證並進入
              </button>
              <button className="ghost-button" onClick={closeAdmin} type="button">
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
