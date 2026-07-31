"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearLocalData,
  defaultAdminSettings,
  getAdminSettings,
  getLocalStats,
  saveAdminSettings,
  type AdminSettings,
  type LocalStats
} from "@/lib/site";

const ADMIN_PASSWORD = "398398";
const AUTH_KEY = "turing-test-admin-auth";

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function AdminGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleUnlock() {
    if (password === ADMIN_PASSWORD) {
      try {
        window.sessionStorage.setItem(AUTH_KEY, "1");
      } catch {
        // ignore
      }
      onUnlocked();
      return;
    }

    setError("管理員密碼不正確。");
  }

  return (
    <main className="page-shell">
      <div className="top-bar">
        <div className="brand">
          <span className="brand-mark" />
          圖靈測試 / 管理員中心
        </div>
        <Link className="ghost-button" href="/">
          回首頁
        </Link>
      </div>
      <section className="stack">
        <div className="panel">
          <h1 style={{ marginTop: 0 }}>管理員驗證</h1>
          <p className="hero-copy">
            這個入口預設隱藏：在首頁連點「管理員入口」或品牌標誌五下，再輸入密碼
            <code> 398398 </code> 即可進入。直接輸入網址也必須先通過密碼驗證。
          </p>
          <div className="field" style={{ maxWidth: 380 }}>
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
                  handleUnlock();
                }
              }}
              type="password"
              value={password}
            />
          </div>
          {error ? <p className="alert">{error}</p> : null}
          <div className="button-row">
            <button className="primary-button" onClick={handleUnlock} type="button">
              驗證並進入
            </button>
            <Link className="ghost-button" href="/">
              回首頁
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>(defaultAdminSettings);
  const [stats, setStats] = useState<LocalStats | null>(null);
  const [saved, setSaved] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    let allowed = false;
    try {
      allowed = window.sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      // ignore
    }
    setAuthed(allowed);
  }, []);

  useEffect(() => {
    if (!authed) {
      return;
    }

    setSettings(getAdminSettings());
    setStats(getLocalStats());
  }, [authed]);

  function update<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) {
    setSaved(false);
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleSave() {
    saveAdminSettings(settings);
    setSaved(true);
    setStats(getLocalStats());
  }

  function handleReset() {
    clearLocalData();
    setResetConfirm(false);
    setSaved(false);
    setSettings(defaultAdminSettings);
    setStats(getLocalStats());
  }

  if (!authed) {
    return <AdminGate onUnlocked={() => setAuthed(true)} />;
  }

  return (
    <main className="page-shell">
      <div className="top-bar">
        <div className="brand">
          <span className="brand-mark" />
          圖靈測試 / 管理員中心
        </div>
        <Link className="ghost-button" href="/">
          回首頁
        </Link>
      </div>

      <section className="stack">
        <div className="panel">
          <h1 style={{ marginTop: 0 }}>管理員中心</h1>
          <p className="hero-copy">
            在首頁連點「管理員入口」五下並輸入 <code>398398</code> 進入。你可以在這裡微調過濾、
            配對公平性與本地 AI 設定。所有資料保存在這台裝置的瀏覽器本機。
          </p>
          {saved ? <p className="alert ok">設定已保存到本機，重新整理後仍會保留。</p> : null}
        </div>

        {stats ? (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>本機統計</h2>
            <div className="summary-grid">
              <div className="stat-card">
                <span className="stat-label">裝置 ID</span>
                <div className="stat-value" style={{ fontSize: "0.9rem", wordBreak: "break-all" }}>
                  {stats.deviceId}
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-label">房間總數</span>
                <div className="stat-value">{stats.roomCount}</div>
              </div>
              <div className="stat-card">
                <span className="stat-label">進行中</span>
                <div className="stat-value">{stats.activeRoomCount}</div>
              </div>
              <div className="stat-card">
                <span className="stat-label">已結束</span>
                <div className="stat-value">{stats.resolvedCount}</div>
              </div>
              <div className="stat-card">
                <span className="stat-label">配對統計</span>
                <div className="stat-value" style={{ fontSize: "0.95rem" }}>
                  真人 {stats.humanMatches} / AI {stats.aiMatches}
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-label">可疑標記</span>
                <div className="stat-value">{stats.suspiciousCount}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="admin-grid">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>敏感詞遮蔽</h2>
            <p className="muted">每行一個。命中後送出前會以星號遮蔽。</p>
            <label className="field" htmlFor="maskWords">
              <span className="field-label">遮蔽詞清單</span>
              <textarea
                className="textarea"
                id="maskWords"
                onChange={(event) => update("maskWords", textToList(event.target.value))}
                value={listToText(settings.maskWords)}
              />
            </label>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>高風險阻擋</h2>
            <p className="muted">每行一個。命中後整則訊息攔截、不會送出。</p>
            <label className="field" htmlFor="blockWords">
              <span className="field-label">禁止詞清單</span>
              <textarea
                className="textarea"
                id="blockWords"
                onChange={(event) => update("blockWords", textToList(event.target.value))}
                value={listToText(settings.blockWords)}
              />
            </label>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>配對公平性</h2>
            <label className="field" htmlFor="repeatPairCooldownMinutes">
              <span className="field-label">重複配對冷卻分鐘數</span>
              <input
                className="input"
                id="repeatPairCooldownMinutes"
                min={1}
                onChange={(event) => update("repeatPairCooldownMinutes", Number(event.target.value))}
                type="number"
                value={settings.repeatPairCooldownMinutes}
              />
            </label>
            <label className="field" htmlFor="suspiciousJoinThreshold">
              <span className="field-label">十五分鐘內可疑進房次數門檻</span>
              <input
                className="input"
                id="suspiciousJoinThreshold"
                min={1}
                onChange={(event) => update("suspiciousJoinThreshold", Number(event.target.value))}
                type="number"
                value={settings.suspiciousJoinThreshold}
              />
            </label>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>訊息安全</h2>
            <label className="field" htmlFor="messageMaxLength">
              <span className="field-label">單則訊息字數上限</span>
              <input
                className="input"
                id="messageMaxLength"
                min={20}
                max={2000}
                onChange={(event) => update("messageMaxLength", Number(event.target.value))}
                type="number"
                value={settings.messageMaxLength}
              />
            </label>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>本地 AI 設定</h2>
            <label className="field" htmlFor="useLocalAi">
              <span className="field-label">使用本地 AI 生成對手回覆</span>
              <select
                className="input"
                id="useLocalAi"
                onChange={(event) => update("useLocalAi", event.target.value === "true")}
                value={String(settings.useLocalAi)}
              >
                <option value="true">開啟（連不到時自動退回內建回應）</option>
                <option value="false">關閉（只用內建回應庫）</option>
              </select>
            </label>
            <label className="field" htmlFor="localAiEndpoint">
              <span className="field-label">本地端點（OpenAI 相容 /v1/chat/completions）</span>
              <input
                className="input"
                id="localAiEndpoint"
                onChange={(event) => update("localAiEndpoint", event.target.value)}
                value={settings.localAiEndpoint}
              />
            </label>
            <label className="field" htmlFor="localAiModel">
              <span className="field-label">模型名稱</span>
              <input
                className="input"
                id="localAiModel"
                onChange={(event) => update("localAiModel", event.target.value)}
                value={settings.localAiModel}
              />
            </label>
            <label className="field" htmlFor="aiSystemPrompt">
              <span className="field-label">系統提示詞</span>
              <textarea
                className="textarea"
                id="aiSystemPrompt"
                onChange={(event) => update("aiSystemPrompt", event.target.value)}
                value={settings.aiSystemPrompt}
              />
            </label>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>回覆節奏</h2>
            <p className="muted">真人與 AI 對手的回覆延遲範圍（毫秒）。</p>
            <label className="field" htmlFor="replyDelayMinMs">
              <span className="field-label">最短延遲 (ms)</span>
              <input
                className="input"
                id="replyDelayMinMs"
                min={300}
                onChange={(event) => update("replyDelayMinMs", Number(event.target.value))}
                type="number"
                value={settings.replyDelayMinMs}
              />
            </label>
            <label className="field" htmlFor="replyDelayMaxMs">
              <span className="field-label">最長延遲 (ms)</span>
              <input
                className="input"
                id="replyDelayMaxMs"
                min={300}
                onChange={(event) => update("replyDelayMaxMs", Number(event.target.value))}
                type="number"
                value={settings.replyDelayMaxMs}
              />
            </label>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>保存設定</h2>
          <p className="muted">
            管理員設定、房間歷史與防作弊資料都保存在瀏覽器本機（localStorage）。重新進入房間會自動同步聊天歷史，換裝置不會帶過去。
          </p>
          <div className="button-row">
            <button className="primary-button" onClick={handleSave} type="button">
              保存設定
            </button>
            <Link className="secondary-button" href="/">
              回首頁
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>危險區域</h2>
          <p className="muted">
            清除所有本機資料（房間歷史、裝置 ID、防作弊記錄）。管理員設定也會一併還原預設。此動作無法復原。
          </p>
          {resetConfirm ? (
            <div className="button-row">
              <button className="guess-button active" onClick={handleReset} type="button">
                確認清除全部本機資料
              </button>
              <button className="ghost-button" onClick={() => setResetConfirm(false)} type="button">
                取消
              </button>
            </div>
          ) : (
            <button className="ghost-button" onClick={() => setResetConfirm(true)} type="button">
              清除本機資料
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
