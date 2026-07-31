"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  defaultAdminSettings,
  getAdminSettings,
  saveAdminSettings,
  type AdminSettings
} from "@/lib/site";

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const [settings, setSettings] = useState<AdminSettings>(defaultAdminSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getAdminSettings());
  }, []);

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
            這個入口預設隱藏，必須在首頁連點品牌五下並輸入 `398398` 才能進來。你可以在這裡微調過濾、配對公平性，以及本地 AI 的設定欄位。
          </p>
          {saved ? <p className="alert ok">設定已保存到本機，重新整理後仍會保留。</p> : null}
        </div>

        <div className="admin-grid">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>敏感詞遮蔽</h2>
            <label className="field" htmlFor="maskWords">
              <span className="field-label">每行一個遮蔽詞</span>
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
            <label className="field" htmlFor="blockWords">
              <span className="field-label">每行一個禁止詞</span>
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
            <h2 style={{ marginTop: 0 }}>本地 AI 設定</h2>
            <label className="field" htmlFor="localAiEndpoint">
              <span className="field-label">本地端點</span>
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
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>保存設定</h2>
          <p className="muted">
            現在這個版本會把管理員設定、房間歷史和防作弊資料保存到瀏覽器本機。之後若要改成多人即時版，可以把相同欄位搬到資料庫與 WebSocket 服務。
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
      </section>
    </main>
  );
}
