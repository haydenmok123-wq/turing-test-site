"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRoomState,
  defaultAdminSettings,
  getAdminSettings,
  getLatestActiveRoom,
  getLocalStats,
  type LocalStats
} from "@/lib/site";

const ADMIN_PASSWORD = "398398";
const ADMIN_TRIGGER_CLICKS = 5;
const SCAN_DURATION_MS = 2200;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

export default function HomePage() {
  const router = useRouter();
  const [brandClicks, setBrandClicks] = useState(0);
  const [footerClicks, setFooterClicks] = useState(0);
  const [password, setPassword] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resumeRoomId, setResumeRoomId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [queueCount, setQueueCount] = useState(1);
  const [settingsSummary, setSettingsSummary] = useState(defaultAdminSettings);
  const [stats, setStats] = useState<LocalStats | null>(null);

  useEffect(() => {
    setSettingsSummary(getAdminSettings());
    setStats(getLocalStats());
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

  useEffect(() => {
    if (!scanning) {
      return;
    }

    const stepTimer = window.setInterval(() => {
      setScanStep((step) => Math.min(step + 1, 2));
    }, 700);
    const queueTimer = window.setInterval(() => {
      setQueueCount((count) => {
        const delta = Math.random() > 0.5 ? 1 : -1;
        return Math.max(3, Math.min(16, count + delta));
      });
    }, 420);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(queueTimer);
    };
  }, [scanning]);

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

  const scanSteps = [
    "建立匿名通道",
    "隱藏你的身分",
    "開始對話試探"
  ];

  function handleStart() {
    if (scanning) {
      return;
    }

    const active = getLatestActiveRoom();
    if (active) {
      setNotice("偵測到一間進行中的房間，已幫你續接，聊天歷史不會丟失。");
      router.push(`/room?roomId=${active.roomId}`);
      return;
    }

    setScanning(true);
    setScanFailed(false);
    setScanStep(0);
    setQueueCount(3);

    window.setTimeout(() => {
      const room = createRoomState();
      setScanning(false);
      if (!room) {
        setScanFailed(true);
        setNotice("無法建立房間，請稍後再試。");
        return;
      }
      router.push(`/room?roomId=${room.roomId}`);
    }, SCAN_DURATION_MS);
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

  const guessRate = stats?.guessRate ?? null;

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

      <section className="lobby-hero panel">
        <span className="eyebrow">準備好被懷疑了嗎？</span>
        <h1 className="hero-title">十分鐘內給出答案</h1>
        <p className="hero-copy">
          隨機配對一位匿名對象，十分鐘內聊天、試探、判斷——但別忘了，對方也在觀察你。
          這不只是你辨識對方的實驗，也是對方辨識你的圖靈測試。真人或 AI，由你揭曉。
        </p>

        <div className="cta-row lobby-cta">
          <button
            className="primary-button lobby-start"
            disabled={scanning}
            onClick={handleStart}
            type="button"
          >
            <span className="start-glyph" aria-hidden="true" />
            開始配對
          </button>
          {resumeRoomId ? (
            <button
              className="secondary-button"
              onClick={() => router.push(`/room?roomId=${resumeRoomId}`)}
              type="button"
            >
              回到進行中的對話
            </button>
          ) : null}
        </div>

        <div className="step-row" aria-label="配對步驟">
          <span className="step-caption">配對流程</span>
          {["建立匿名通道", "隱藏你的身分", "開始對話試探"].map((step, index) => (
            <span className="step-chip" key={step}>
              <b>{index + 1}</b>
              {step}
            </span>
          ))}
        </div>

        {notice ? (
          <p className={`alert ${notice.includes("已") ? "ok" : ""}`} role="status">
            {notice}
          </p>
        ) : null}
      </section>

      <section className="lobby-grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>你的紀錄</h2>
          <div className="record-grid">
            <div className="stat-card">
              <span className="stat-label">總場次</span>
              <div className="stat-value">{stats?.roomCount ?? 0}</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">已揭曉</span>
              <div className="stat-value">{stats?.resolvedCount ?? 0}</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">命中</span>
              <div className="stat-value">
                {stats?.correctCount ?? 0}
                {guessRate !== null ? (
                  <small className="stat-note">命中率 {guessRate}%</small>
                ) : null}
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-label">進行中</span>
              <div className="stat-value">{stats?.activeRoomCount ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>排行榜</h2>
          <div className="record-grid">
            <div className="stat-card">
              <span className="stat-label">最佳連勝</span>
              <div className="stat-value">
                {stats?.bestStreak ?? 0}
                <small className="stat-note">連勝</small>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-label">最快揭曉</span>
              <div className="stat-value stat-value-sm">
                {stats?.fastestGuessMs != null
                  ? formatDuration(stats.fastestGuessMs)
                  : "—"}
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-label">真人匹配</span>
              <div className="stat-value">{stats?.humanMatches ?? 0}</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">AI 匹配</span>
              <div className="stat-value">{stats?.aiMatches ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>配對狀態</h2>
          <div className="queue-status">
            <span className="status-pill success">
              真人 / AI 隨機匹配
            </span>
            <span className="status-pill">重複配對防護</span>
            <span className="status-pill">聊天 10 秒後解鎖判斷</span>
            <span className="status-pill">10 分鐘限時</span>
          </div>
          <div className="divider" />
          <p className="muted" style={{ margin: 0 }}>
            公平性保障：{fairnessText}
            {stats && stats.suspiciousCount > 0
              ? `偵測到 ${stats.suspiciousCount} 次可疑行為`
              : ""}
            所有配對與判斷都在本機匿名處理，不上傳任何對話內容。
          </p>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
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
      </section>

      <section className="lobby-bottom">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>公平性與防作弊</h2>
          <p className="muted">{fairnessText}</p>
          <div className="button-row">
            <span className="status-pill success">避免同裝置重複濫用</span>
            <span className="status-pill">平衡真人 / AI 配對比例</span>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>本機 AI 設定</h2>
          <p className="muted">
            AI 對手優先走你設定的本機端點（Ollama / OpenAI 相容 API），連不到時自動退回內建回應庫，遊戲不會中斷。
          </p>
          <div className="pill" style={{ wordBreak: "break-all" }}>
            {settingsSummary.localAiEndpoint || "未設定本機端點"}
          </div>
        </div>
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

      {scanning ? (
        <div className="overlay scan-overlay" role="dialog" aria-label="掃描中">
          <div className="scan-panel">
            <div className="radar" aria-hidden="true">
              <span className="radar-ring" />
              <span className="radar-ring" />
              <span className="radar-sweep" />
              <span className="radar-dot" />
            </div>
            <h2 style={{ marginTop: 18 }}>正在尋找對象</h2>
            <p className="muted">正在掃描線上對象，請稍候…</p>
            <div className="queue-line">
              <span className="queue-label">目前同時排隊人數</span>
              <span className="queue-number">{queueCount}</span>
            </div>
            <div className="scan-steps" aria-label="掃描進度">
              {scanSteps.map((step, index) => (
                <span
                  className={`scan-step ${index <= scanStep ? "active" : ""}`}
                  key={step}
                >
                  {index < scanStep ? "✓ " : index === scanStep ? "● " : ""}
                  {step}
                </span>
              ))}
            </div>
            <button className="ghost-button" onClick={() => setScanning(false)} type="button">
              取消
            </button>
          </div>
        </div>
      ) : null}

      {scanFailed ? (
        <div className="overlay" role="dialog" aria-label="配對失敗">
          <div className="modal">
            <h2 style={{ marginTop: 0 }}>配對失敗</h2>
            <p className="muted">暫時無法建立匿名通道，請稍後再試。</p>
            <div className="button-row">
              <button className="primary-button" onClick={handleStart} type="button">
                再試一次
              </button>
              <button className="ghost-button" onClick={() => setScanFailed(false)} type="button">
                關閉
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
