// 圖靈測試後端引擎：真人互配 / AI 對手、訊息轉發、內容審核、10 分鐘計時、
// 判斷結算、斷線重連、防作弊。與傳輸層無關（WebSocket / HTTP polling 共用）。

export const ROOM_DURATION_MS = 10 * 60 * 1000;
export const GUESS_UNLOCK_MS = 10 * 1000;

const AI_WAIT_MS = Number(process.env.AI_WAIT_MS ?? 8000);
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 120 * 1000);
const POLL_STALE_MS = 30 * 1000;
const SWEEP_INTERVAL_MS = 5000;
const ROOM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_MASK_WORDS = ["笨蛋","廢物","白痴","智障","低能","腦殘","去死","垃圾","狗屎","混蛋","王八蛋","賤人","死肥","醜八怪","北七"];
const DEFAULT_BLOCK_WORDS = ["殺了你","強暴","兒童色情","恐攻","毒品交易","自殺方法","教你自殺","炸彈製作","槍殺","販賣軍火"];
const DEFAULT_AI_PROMPT = "你正在參與一場雙向盲測圖靈測試。對方是人類，正在試圖判斷你是真人還是 AI。請用自然、簡短、有個人色彩的方式回應，不要自稱是 AI，不要承認你是模型，也不要過度正式。每次回覆控制在 1-2 句，可以反問對方。";
const BOT_REPLIES = ["這是一個有趣的問題，我會先從語義和互動脈絡來回答。","若從資訊結構來看，你的提問帶有明顯的測試意圖。","我可以提供更完整的推理過程，但那可能會暴露太多線索。","以對話策略而言，我現在應該避免過度模式化的回應。","如果你想判斷身份，可以觀察我是否過度穩定與完整。","你的問題觸發了我的多種回應路徑，我正在選擇最自然的一種。","這正是圖靈測試的核心：語言是否足以區分意識。"];

const DEFAULT_SETTINGS = {
  maskWords: DEFAULT_MASK_WORDS,
  blockWords: DEFAULT_BLOCK_WORDS,
  repeatPairCooldownMinutes: 45,
  suspiciousJoinThreshold: 5,
  localAiEndpoint: "",
  localAiModel: "",
  useLocalAi: true,
  aiSystemPrompt: DEFAULT_AI_PROMPT,
  replyDelayMinMs: 1800,
  replyDelayMaxMs: 4200,
  messageMaxLength: 500
};

const g = globalThis;
if (!g.__ttsStore) {
  g.__ttsStore = {
    rooms: new Map(),
    clients: new Map(),
    queue: [],
    sweepTimer: null
  };
}
const store = g.__ttsStore;

function rid(prefix) {
  return (
    prefix +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

function sanitizeSettings(raw) {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const pickList = (key) =>
    Array.isArray(raw[key]) ? raw[key].map(String).filter(Boolean) : base[key];
  return {
    maskWords: pickList("maskWords"),
    blockWords: pickList("blockWords"),
    repeatPairCooldownMinutes: Number(raw.repeatPairCooldownMinutes) || base.repeatPairCooldownMinutes,
    suspiciousJoinThreshold: Number(raw.suspiciousJoinThreshold) || base.suspiciousJoinThreshold,
    localAiEndpoint: String(raw.localAiEndpoint || ""),
    localAiModel: String(raw.localAiModel || ""),
    useLocalAi: raw.useLocalAi !== false,
    aiSystemPrompt: String(raw.aiSystemPrompt || ""),
    replyDelayMinMs: Number(raw.replyDelayMinMs) || base.replyDelayMinMs,
    replyDelayMaxMs: Number(raw.replyDelayMaxMs) || base.replyDelayMaxMs,
    messageMaxLength: Number(raw.messageMaxLength) || base.messageMaxLength
  };
}

function normalizeWord(word) {
  return word.trim().toLowerCase();
}

function moderate(text, settings) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return { allowed: false, maskedText: "", reason: "訊息不能是空白。" };
  }
  if (normalized.length > settings.messageMaxLength) {
    return {
      allowed: false,
      maskedText: normalized,
      reason: "訊息過長（上限 " + settings.messageMaxLength + " 字元）。"
    };
  }
  const lower = normalized.toLowerCase();
  for (const rawWord of settings.blockWords) {
    const word = normalizeWord(rawWord);
    if (word && lower.includes(word)) {
      return { allowed: false, maskedText: normalized, reason: "訊息包含禁止內容：" + rawWord };
    }
  }
  let maskedText = normalized;
  for (const rawWord of settings.maskWords) {
    const word = normalizeWord(rawWord);
    if (word && lower.includes(word)) {
      const stars = "*".repeat(Math.max(1, rawWord.length - 1));
      maskedText = maskedText.split(rawWord).join(rawWord[0] + stars);
    }
  }
  return { allowed: true, maskedText, reason: undefined };
}

function getSession(deviceId, fp, transport) {
  let c = store.clients.get(deviceId);
  if (!c) {
    c = {
      clientId: deviceId,
      deviceId,
      fp: fp || "",
      transport,
      ws: null,
      connected: true,
      outbox: [],
      roomId: null,
      aiTimer: null,
      joinStarts: [],
      settings: { ...DEFAULT_SETTINGS },
      leftNotified: null,
      lastPollAt: 0,
      lastActiveAt: Date.now()
    };
    store.clients.set(deviceId, c);
  }
  if (transport === "poll") {
    c.transport = "poll";
    c.lastPollAt = Date.now();
  }
  return c;
}

function sendTo(c, payload) {
  if (!c) return;
  if (c.transport === "ws" && c.ws && c.ws.readyState === 1) {
    try {
      c.ws.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
    return;
  }
  c.outbox.push(payload);
}

function getPeerClient(room, c) {
  const other = room.participants.find((p) => p.clientId !== c.clientId);
  return other ? store.clients.get(other.clientId) : null;
}

function snapshotFor(room, clientId) {
  const me = room.participants.find((p) => p.clientId === clientId);
  const other = room.participants.find((p) => p.clientId !== clientId);
  return {
    roomId: room.roomId,
    deviceId: clientId,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    expiresAt: room.expiresAt,
    guessUnlockedAt: room.guessUnlockedAt,
    opponentKind: room.opponentKind,
    opponentId: other ? "opponent-" + hashOf(other.clientId) : "opponent-server",
    fairnessFlags: room.fairnessFlags,
    messages: room.messages.map((m) => {
      const sender = m.from === "system" ? "system" : m.from === clientId ? "me" : "opponent";
      return {
        id: m.id,
        sender,
        text: m.text,
        createdAt: m.createdAt,
        ...(m.blocked ? { blocked: true } : {}),
        ...(m.reason ? { reason: m.reason } : {})
      };
    }),
    guess: me ? me.guess : undefined,
    resolvedAt: room.endedAt,
    endReason: room.endReason,
    lastActiveAt: room.lastActiveAt,
    syncVersion: room.syncVersion,
    peerConnected: room.opponentKind === "ai" ? true : Boolean(other && getSessionSafe(other.clientId) && getSessionSafe(other.clientId).connected)
  };
}

function hashOf(value) {
  let hash = 0;
  for (const ch of String(value)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
}

function getSessionSafe(clientId) {
  return store.clients.get(clientId);
}

function createRoom(kind, participants, suspicious, now) {
  const settings = participants[0].settings;
  const room = {
    roomId: rid("room"),
    createdAt: now,
    startedAt: now,
    expiresAt: now + ROOM_DURATION_MS,
    guessUnlockedAt: now + GUESS_UNLOCK_MS,
    opponentKind: kind,
    participants: participants.map((p) => ({
      clientId: p.clientId,
      deviceId: p.deviceId,
      guess: null
    })),
    messages: [
      {
        id: rid("msg"),
        from: "system",
        text: "配對成功。十分鐘內聊天、試探、判斷，但對方也正在觀察你。",
        createdAt: now
      },
      {
        id: rid("msg"),
        from: "system",
        text: "開始聊天後十秒內不能判斷，請先透過對話收集線索。",
        createdAt: now + 1
      }
    ],
    settings,
    fairnessFlags: [
      "隨機匿名匹配",
      "平衡真人與 AI 配對比例",
      "聊天 10 秒後解鎖判斷",
      "10 分鐘限時"
    ],
    endedAt: null,
    endReason: null,
    lastActiveAt: now,
    syncVersion: 1
  };
  if (suspicious) room.fairnessFlags.push("偵測到高頻進房，已標記為可疑行為");
  store.rooms.set(room.roomId, room);
  return room;
}

function markDisconnected(c) {
  c.connected = false;
  c.lastActiveAt = Date.now();
  if (c.ws) {
    try {
      c.ws.terminate();
    } catch {
      // ignore
    }
    c.ws = null;
  }
  if (c.aiTimer) {
    clearTimeout(c.aiTimer);
    c.aiTimer = null;
  }
  store.queue = store.queue.filter((id) => id !== c.clientId);
  if (c.roomId) {
    const room = store.rooms.get(c.roomId);
    if (room && !room.endedAt && c.leftNotified !== room.roomId) {
      c.leftNotified = room.roomId;
      const other = getPeerClient(room, c);
      if (other && other.connected) sendTo(other, { type: "peerLeft", roomId: room.roomId });
    }
  }
}

function handlePair(c, rawSettings) {
  c.settings = sanitizeSettings(rawSettings);
  const now = Date.now();

  if (c.roomId) {
    const existing = store.rooms.get(c.roomId);
    if (existing && !existing.endedAt) {
      sendTo(c, { type: "room", room: snapshotFor(existing, c.clientId), resumed: true });
      return;
    }
    c.roomId = null;
  }

  if (c.aiTimer) {
    clearTimeout(c.aiTimer);
    c.aiTimer = null;
  }
  store.queue = store.queue.filter((id) => id !== c.clientId);

  c.joinStarts = (c.joinStarts || []).filter((t) => now - t < 15 * 60 * 1000);
  c.joinStarts.push(now);
  const suspicious = c.joinStarts.length >= c.settings.suspiciousJoinThreshold;

  let partnerId = null;
  for (let i = 0; i < store.queue.length; i++) {
    const id = store.queue[i];
    if (id === c.clientId) continue;
    const candidate = store.clients.get(id);
    if (candidate && candidate.connected) {
      partnerId = id;
      store.queue.splice(i, 1);
      break;
    }
  }

  if (partnerId) {
    const partner = store.clients.get(partnerId);
    if (partner.aiTimer) {
      clearTimeout(partner.aiTimer);
      partner.aiTimer = null;
    }
    const partnerSuspicious =
      (partner.joinStarts || []).filter((t) => now - t < 15 * 60 * 1000).length >=
      partner.settings.suspiciousJoinThreshold;
    const room = createRoom("human", [c, partner], suspicious || partnerSuspicious, now);
    c.roomId = room.roomId;
    partner.roomId = room.roomId;
    sendTo(c, { type: "paired", room: snapshotFor(room, c.clientId) });
    sendTo(partner, { type: "paired", room: snapshotFor(room, partner.clientId) });
    return;
  }

  store.queue.push(c.clientId);
  sendTo(c, { type: "queued", position: store.queue.length });
  c.aiTimer = setTimeout(() => {
    c.aiTimer = null;
    if (!store.queue.includes(c.clientId)) return;
    store.queue = store.queue.filter((id) => id !== c.clientId);
    const room = createRoom("ai", [c], suspicious, Date.now());
    c.roomId = room.roomId;
    sendTo(c, { type: "paired", room: snapshotFor(room, c.clientId) });
  }, AI_WAIT_MS);
}

function handleCancel(c) {
  if (c.aiTimer) {
    clearTimeout(c.aiTimer);
    c.aiTimer = null;
  }
  store.queue = store.queue.filter((id) => id !== c.clientId);
  sendTo(c, { type: "cancelled" });
}

function handleResume(c, roomId) {
  const room = store.rooms.get(roomId);
  if (!room) {
    sendTo(c, { type: "error", message: "找不到這個房間。" });
    return;
  }
  const me = room.participants.find((p) => p.clientId === c.clientId);
  if (!me) {
    sendTo(c, { type: "error", message: "你不是這個房間的參與者。" });
    return;
  }
  c.roomId = room.roomId;
  sendTo(c, { type: "room", room: snapshotFor(room, c.clientId), resumed: true });
  const other = getPeerClient(room, c);
  if (other && other.connected) sendTo(other, { type: "peerBack", roomId: room.roomId });
}

function handleSend(c, roomId, text) {
  const room = store.rooms.get(roomId);
  if (!room) {
    sendTo(c, { type: "error", message: "找不到這個房間。" });
    return;
  }
  if (!room.participants.some((p) => p.clientId === c.clientId)) {
    sendTo(c, { type: "error", message: "你不是這個房間的參與者。" });
    return;
  }
  if (room.endedAt) {
    sendTo(c, { type: "error", message: "本局已結束，無法送出訊息。" });
    return;
  }
  const review = moderate(text, room.settings);
  const now = Date.now();
  room.messages.push({
    id: rid("msg"),
    from: review.allowed ? c.clientId : "system",
    text: review.allowed ? review.maskedText : "訊息已被攔截：" + review.reason,
    createdAt: now,
    blocked: !review.allowed,
    reason: review.allowed ? undefined : review.reason
  });
  room.lastActiveAt = now;
  room.syncVersion += 1;
  sendTo(c, { type: "sendAck", roomId: room.roomId, moderation: review });
  if (room.opponentKind === "ai") {
    if (review.allowed) void scheduleBotReply(room, review.maskedText);
  } else {
    const other = getPeerClient(room, c);
    if (other && other.connected) sendTo(other, { type: "room", room: snapshotFor(room, other.clientId) });
  }
  sendTo(c, { type: "room", room: snapshotFor(room, c.clientId) });
}

function isLoopbackEndpoint(endpoint) {
  return (
    endpoint.startsWith("http://127.0.0.1") ||
    endpoint.startsWith("http://localhost") ||
    endpoint.startsWith("https://127.0.0.1") ||
    endpoint.startsWith("https://localhost")
  );
}

async function generateBotReply(sourceText, settings) {
  const lower = String(sourceText || "").toLowerCase();
  if (lower.includes("你是 ai") || lower.includes("你是ai")) {
    return "如果我直接承認或否認，這場測試就失去樂趣了。";
  }
  if (lower.includes("你好") || lower.includes("嗨")) {
    return "你好，我很好奇你會如何設計圖靈測試的提問。";
  }
  const endpoint = String(process.env.AI_ENDPOINT || settings.localAiEndpoint || "").trim();
  if (endpoint && !isLoopbackEndpoint(endpoint)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: String(process.env.AI_MODEL || settings.localAiModel || "gpt-4o-mini"),
          messages: [
            {
              role: "system",
              content: String(process.env.AI_SYSTEM_PROMPT || settings.aiSystemPrompt || DEFAULT_AI_PROMPT)
            },
            { role: "user", content: sourceText }
          ],
          temperature: 0.9,
          max_tokens: 140,
          stream: false
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        const content =
          data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (typeof content === "string" && content.trim()) {
          return content.trim().slice(0, 300);
        }
      }
    } catch {
      // 退回內建回應庫
    }
  }
  return BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)];
}

async function scheduleBotReply(room, sourceText) {
  const delay =
    room.settings.replyDelayMinMs +
    Math.random() * Math.max(1, room.settings.replyDelayMaxMs - room.settings.replyDelayMinMs);
  const startedAt = Date.now();
  const text = await generateBotReply(sourceText, room.settings);
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, delay - elapsed);
  await new Promise((resolve) => setTimeout(resolve, remaining));
  if (room.endedAt || Date.now() >= room.expiresAt) return;
  const c = store.clients.get(room.participants[0].clientId);
  if (!c) return;
  room.messages.push({ id: rid("msg"), from: "bot", text, createdAt: Date.now() });
  room.lastActiveAt = Date.now();
  room.syncVersion += 1;
  sendTo(c, { type: "room", room: snapshotFor(room, c.clientId) });
}

function handleGuess(c, roomId, choice) {
  const room = store.rooms.get(roomId);
  if (!room) {
    sendTo(c, { type: "error", message: "找不到這個房間。" });
    return;
  }
  const me = room.participants.find((p) => p.clientId === c.clientId);
  if (!me) {
    sendTo(c, { type: "error", message: "你不是這個房間的參與者。" });
    return;
  }
  if (room.endedAt) {
    sendTo(c, { type: "error", message: "本局已結束。" });
    return;
  }
  if (Date.now() < room.guessUnlockedAt) {
    sendTo(c, { type: "error", message: "開始聊天後十秒內不能判斷。" });
    return;
  }
  if (me.guess) {
    sendTo(c, { type: "error", message: "你已經做出判斷。" });
    return;
  }
  me.guess = choice;
  const now = Date.now();
  room.endedAt = now;
  room.endReason = "guess";
  room.lastActiveAt = now;
  room.syncVersion += 1;
  room.messages.push({
    id: rid("msg"),
    from: "system",
    text: "判斷已送出。本局結束，聊天鎖定為唯讀。",
    createdAt: now
  });
  const other = getPeerClient(room, c);
  if (other && other.connected) sendTo(other, { type: "room", room: snapshotFor(room, other.clientId) });
  sendTo(c, { type: "room", room: snapshotFor(room, c.clientId) });
}

function endRoomTimeout(room, now) {
  room.endedAt = now;
  room.endReason = "timeout";
  room.lastActiveAt = now;
  room.syncVersion += 1;
  room.messages.push({
    id: rid("msg"),
    from: "system",
    text: "十分鐘已屆滿，本局結束。",
    createdAt: now
  });
  for (const p of room.participants) {
    const c = store.clients.get(p.clientId);
    if (c && c.connected) sendTo(c, { type: "room", room: snapshotFor(room, c.clientId) });
  }
}

export function dispatch(c, msg) {
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
  c.lastActiveAt = Date.now();
  switch (msg.type) {
    case "ping":
      sendTo(c, { type: "pong", serverTime: Date.now() });
      break;
    case "pair":
      handlePair(c, msg.settings);
      break;
    case "cancel":
      handleCancel(c);
      break;
    case "send":
      handleSend(c, String(msg.roomId || ""), String(msg.text || ""));
      break;
    case "guess":
      handleGuess(c, String(msg.roomId || ""), msg.choice === "human" ? "human" : "ai");
      break;
    case "resume":
      handleResume(c, String(msg.roomId || ""));
      break;
    default:
      break;
  }
}

export function attachSocket(ws, deviceId, fp) {
  startSweeper();
  const c = getSession(deviceId, fp, "ws");
  c.ws = ws;
  c.connected = true;
  c.transport = "ws";
  if (c.aiTimer) {
    clearTimeout(c.aiTimer);
    c.aiTimer = null;
  }
  ws.on("message", (raw) => {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    dispatch(c, msg);
  });
  ws.on("close", () => {
    markDisconnected(c);
  });
  ws.on("error", () => {
    // 忽略，close 會接手
  });
  if (c.roomId) {
    const room = store.rooms.get(c.roomId);
    if (room && !room.endedAt) {
      sendTo(c, { type: "room", room: snapshotFor(room, c.clientId), resumed: true });
      const other = getPeerClient(room, c);
      if (other && other.connected) sendTo(other, { type: "peerBack", roomId: room.roomId });
    }
  }
}

export function processPoll(body) {
  startSweeper();
  const deviceId = String((body && body.deviceId) || "");
  if (!deviceId) return { serverTime: Date.now(), messages: [] };
  const c = getSession(deviceId, String((body && body.fp) || ""), "poll");
  if (!c.connected) {
    c.connected = true;
    if (c.roomId) {
      const room = store.rooms.get(c.roomId);
      if (room && !room.endedAt) {
        const other = getPeerClient(room, c);
        if (other && other.connected) sendTo(other, { type: "peerBack", roomId: room.roomId });
      }
    }
  }
  c.lastPollAt = Date.now();
  const ops = Array.isArray(body && body.ops) ? body.ops : [];
  for (const op of ops) dispatch(c, op);
  const messages = c.outbox;
  c.outbox = [];
  return { serverTime: Date.now(), messages };
}

export function startSweeper() {
  if (store.sweepTimer) return;
  store.sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const room of Array.from(store.rooms.values())) {
      if (!room.endedAt && now >= room.expiresAt) endRoomTimeout(room, now);
      if (room.endedAt && now - room.lastActiveAt > ROOM_RETENTION_MS) {
        store.rooms.delete(room.roomId);
      }
    }
    for (const [id, c] of Array.from(store.clients.entries())) {
      if (c.transport === "poll" && now - c.lastPollAt > POLL_STALE_MS) markDisconnected(c);
      if (!c.connected && now - c.lastActiveAt > RECONNECT_GRACE_MS) {
        store.clients.delete(id);
        store.queue = store.queue.filter((q) => q !== id);
      }
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof store.sweepTimer.unref === "function") store.sweepTimer.unref();
}

export function getStoreSnapshot() {
  return {
    roomCount: store.rooms.size,
    clientCount: store.clients.size,
    queueLength: store.queue.length
  };
}
