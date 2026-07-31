export type Sender = "system" | "me" | "opponent";
export type OpponentKind = "human" | "ai";
export type GuessChoice = "human" | "ai";

export type ModerationResult = {
  allowed: boolean;
  maskedText: string;
  reason?: string;
};

export type Message = {
  id: string;
  sender: Sender;
  text: string;
  createdAt: number;
  blocked?: boolean;
  reason?: string;
};

export type PendingReply = {
  id: string;
  text: string;
  dueAt: number;
};

export type RoomState = {
  roomId: string;
  deviceId: string;
  createdAt: number;
  startedAt: number;
  expiresAt: number;
  guessUnlockedAt: number;
  opponentKind: OpponentKind;
  opponentId: string;
  fairnessFlags: string[];
  messages: Message[];
  pendingReply?: PendingReply;
  guess?: GuessChoice;
  resolvedAt?: number;
  endReason?: "guess" | "timeout";
  lastActiveAt: number;
  syncVersion: number;
};

export type AdminSettings = {
  maskWords: string[];
  blockWords: string[];
  repeatPairCooldownMinutes: number;
  suspiciousJoinThreshold: number;
  localAiEndpoint: string;
  localAiModel: string;
  useLocalAi: boolean;
  aiSystemPrompt: string;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  messageMaxLength: number;
};

export type LocalStats = {
  deviceId: string;
  roomCount: number;
  activeRoomCount: number;
  resolvedCount: number;
  humanMatches: number;
  aiMatches: number;
  suspiciousCount: number;
};

type RecentPair = {
  opponentId: string;
  finishedAt: number;
};

type DeviceMeta = {
  id: string;
  recentPairs: RecentPair[];
  recentStarts: number[];
  humanMatches: number;
  aiMatches: number;
};

const DEVICE_KEY = "turing-test-device";
const ROOMS_KEY = "turing-test-rooms";
const ADMIN_KEY = "turing-test-admin-settings";

export const ROOM_DURATION_MS = 10 * 60 * 1000;
export const GUESS_UNLOCK_MS = 10 * 1000;

export const defaultAdminSettings: AdminSettings = {
  maskWords: [
    "笨蛋",
    "廢物",
    "白痴",
    "智障",
    "低能",
    "腦殘",
    "去死",
    "垃圾",
    "狗屎",
    "混蛋",
    "王八蛋",
    "賤人",
    "死肥",
    "醜八怪",
    "北七"
  ],
  blockWords: [
    "殺了你",
    "強暴",
    "兒童色情",
    "恐攻",
    "毒品交易",
    "自殺方法",
    "教你自殺",
    "炸彈製作",
    "槍殺",
    "販賣軍火"
  ],
  repeatPairCooldownMinutes: 45,
  suspiciousJoinThreshold: 5,
  localAiEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
  localAiModel: "qwen2.5:7b",
  useLocalAi: true,
  aiSystemPrompt:
    "你正在參與一場雙向盲測圖靈測試。對方是人類，正在試圖判斷你是真人還是 AI。請用自然、簡短、有個人色彩的方式回應，不要自稱是 AI，不要承認你是模型，也不要過度正式。每次回覆控制在 1-2 句，可以反問對方。",
  replyDelayMinMs: 1800,
  replyDelayMaxMs: 4200,
  messageMaxLength: 500
};

const humanReplyBank = [
  "哈哈，你這問題好刁鑽，我反而更想知道你怎麼判斷我。",
  "我先喝口水再回你，這問題要想一下。",
  "唔……你這樣問很像在套話。",
  "我打字慢，你可別拿這點來判斷我。",
  "如果我是 AI，我現在應該會講得更工整一點吧？",
  "嗯嗯，然後呢？你還有什麼想問的？",
  "你猜啊，猜中算你厲害。",
  "說真的，跟你聊到現在我也有點好奇你是人是 AI 了。",
  "這局有意思，我故意不按套路出牌。",
  "等一下，你該不會是機器人吧？語氣也太穩了。"
];

const aiReplyBank = [
  "這是一個有趣的問題，我會先從語義和互動脈絡來回答。",
  "若從資訊結構來看，你的提問帶有明顯的測試意圖。",
  "我可以提供更完整的推理過程，但那可能會暴露太多線索。",
  "以對話策略而言，我現在應該避免過度模式化的回應。",
  "如果你想判斷身份，可以觀察我是否過度穩定與完整。",
  "你的問題觸發了我的多種回應路徑，我正在選擇最自然的一種。",
  "這正是圖靈測試的核心：語言是否足以區分意識。"
];

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hasWindow() {
  return typeof window !== "undefined";
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function deviceFingerprint(): string {
  if (!hasWindow() || typeof navigator === "undefined") {
    return "server-device";
  }

  const parts = [
    navigator.userAgent,
    window.screen?.width ?? "",
    window.screen?.height ?? "",
    window.screen?.colorDepth ?? "",
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    navigator.hardwareConcurrency ?? ""
  ];

  let hash = 0;
  for (const part of parts) {
    for (const ch of String(part)) {
      hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
  }

  return `fp-${(hash >>> 0).toString(36)}`;
}

export function getAdminSettings(): AdminSettings {
  if (!hasWindow()) {
    return defaultAdminSettings;
  }

  const saved = safeParse<Partial<AdminSettings>>(
    window.localStorage.getItem(ADMIN_KEY),
    {}
  );

  return {
    ...defaultAdminSettings,
    ...saved
  };
}

export function saveAdminSettings(settings: AdminSettings) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(ADMIN_KEY, JSON.stringify(settings));
}

export function getDeviceMeta(): DeviceMeta {
  if (!hasWindow()) {
    return {
      id: "server-device",
      recentPairs: [],
      recentStarts: [],
      humanMatches: 0,
      aiMatches: 0
    };
  }

  const saved = safeParse<Partial<DeviceMeta>>(window.localStorage.getItem(DEVICE_KEY), {});
  const meta: DeviceMeta = {
    id: saved.id ?? deviceFingerprint(),
    recentPairs: saved.recentPairs ?? [],
    recentStarts: saved.recentStarts ?? [],
    humanMatches: saved.humanMatches ?? 0,
    aiMatches: saved.aiMatches ?? 0
  };

  window.localStorage.setItem(DEVICE_KEY, JSON.stringify(meta));
  return meta;
}

export function saveDeviceMeta(meta: DeviceMeta) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(DEVICE_KEY, JSON.stringify(meta));
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

export function moderateText(text: string, settings: AdminSettings): ModerationResult {
  const normalized = text.trim();

  if (!normalized) {
    return {
      allowed: false,
      maskedText: "",
      reason: "訊息不能是空白。"
    };
  }

  if (normalized.length > settings.messageMaxLength) {
    return {
      allowed: false,
      maskedText: normalized,
      reason: `訊息過長（上限 ${settings.messageMaxLength} 字元）。`
    };
  }

  const lower = normalized.toLowerCase();

  for (const rawWord of settings.blockWords) {
    const word = normalizeWord(rawWord);
    if (word && lower.includes(word)) {
      return {
        allowed: false,
        maskedText: normalized,
        reason: `訊息包含禁止內容：${rawWord}`
      };
    }
  }

  let maskedText = normalized;
  let masked = false;
  for (const rawWord of settings.maskWords) {
    const word = normalizeWord(rawWord);
    if (word && lower.includes(word)) {
      masked = true;
      maskedText = maskedText.replaceAll(rawWord, `${rawWord[0]}${"*".repeat(Math.max(1, rawWord.length - 1))}`);
    }
  }

  return {
    allowed: true,
    maskedText,
    reason: masked ? "訊息已送出，部分敏感字詞已遮蔽。" : undefined
  };
}

function getRoomsMap(): Record<string, RoomState> {
  if (!hasWindow()) {
    return {};
  }

  const rooms = safeParse<Record<string, RoomState>>(window.localStorage.getItem(ROOMS_KEY), {});
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const entries = Object.entries(rooms)
    .filter(([, room]) => now - room.createdAt < sevenDays)
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
    .slice(0, 40);

  return Object.fromEntries(entries);
}

function saveRoomsMap(rooms: Record<string, RoomState>) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
}

export function getRoom(roomId: string) {
  const rooms = getRoomsMap();
  return rooms[roomId];
}

export function saveRoom(room: RoomState) {
  const rooms = getRoomsMap();
  rooms[room.roomId] = room;
  saveRoomsMap(rooms);
}

export function getLatestActiveRoom(): RoomState | undefined {
  const rooms = Object.values(getRoomsMap());
  const now = Date.now();

  return rooms
    .filter((room) => room.expiresAt > now && !room.resolvedAt)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

function buildFairOpponentId(meta: DeviceMeta, cooldownMinutes: number) {
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const recentIds = meta.recentPairs
    .filter((pair) => Date.now() - pair.finishedAt < cooldownMs)
    .map((pair) => pair.opponentId);

  let nextId = randomId("opponent");
  while (recentIds.includes(nextId)) {
    nextId = randomId("opponent");
  }

  return nextId;
}

function pickOpponentKind(meta: DeviceMeta) {
  if (meta.humanMatches === meta.aiMatches) {
    return Math.random() > 0.5 ? "human" : "ai";
  }

  return meta.humanMatches > meta.aiMatches ? "ai" : "human";
}

export function createRoomState(force = false): RoomState | null {
  const settings = getAdminSettings();
  const meta = getDeviceMeta();
  const now = Date.now();

  if (!force) {
    const active = getLatestActiveRoom();
    if (active) {
      return active;
    }
  }

  const recentStarts = meta.recentStarts.filter((stamp) => now - stamp < 15 * 60 * 1000);
  recentStarts.push(now);

  const fairnessFlags = [
    "避免同裝置短時間重複配對",
    "平衡真人與 AI 配對比例"
  ];

  let suspicious = false;
  if (recentStarts.length >= settings.suspiciousJoinThreshold) {
    suspicious = true;
    fairnessFlags.push("偵測到高頻進房，已標記為可疑行為");
  }

  const opponentKind = pickOpponentKind(meta);
  const opponentId = buildFairOpponentId(meta, settings.repeatPairCooldownMinutes);
  const roomId = randomId("room");

  const room: RoomState = {
    roomId,
    deviceId: meta.id,
    createdAt: now,
    startedAt: now,
    expiresAt: now + ROOM_DURATION_MS,
    guessUnlockedAt: now + GUESS_UNLOCK_MS,
    opponentKind,
    opponentId,
    fairnessFlags,
    lastActiveAt: now,
    syncVersion: 1,
    messages: [
      {
        id: randomId("msg"),
        sender: "system",
        text: "配對成功。十分鐘內聊天、試探、判斷，但對方也正在觀察你。",
        createdAt: now
      },
      {
        id: randomId("msg"),
        sender: "system",
        text: "開始聊天後十秒內不能判斷，請先透過對話收集線索。",
        createdAt: now + 1
      }
    ]
  };

  saveRoom(room);
  saveDeviceMeta({
    ...meta,
    recentStarts,
    humanMatches: opponentKind === "human" ? meta.humanMatches + 1 : meta.humanMatches,
    aiMatches: opponentKind === "ai" ? meta.aiMatches + 1 : meta.aiMatches
  });

  return room;
}

async function fetchLocalAiReply(text: string, settings: AdminSettings): Promise<string | null> {
  const endpoint = settings.localAiEndpoint.trim();
  if (!endpoint) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.localAiModel,
        messages: [
          {
            role: "system",
            content: settings.aiSystemPrompt
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.9,
        max_tokens: 140,
        stream: false
      }),
      signal: controller.signal
    });

    window.clearTimeout(timer);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim().slice(0, 300);
    }

    return null;
  } catch {
    return null;
  }
}

async function generateReply(
  kind: OpponentKind,
  sourceText: string,
  settings: AdminSettings
): Promise<string> {
  const lower = sourceText.toLowerCase();

  if (lower.includes("你是 ai") || lower.includes("你是ai")) {
    return kind === "human"
      ? "你這麼直接問，我更不想讓你猜中了。"
      : "如果我直接承認或否認，這場測試就失去樂趣了。";
  }

  if (lower.includes("你好") || lower.includes("嗨")) {
    return kind === "human"
      ? "嗨，你好。你會怎麼開始判斷一個陌生人？"
      : "你好，我很好奇你會如何設計圖靈測試的提問。";
  }

  if (kind === "ai" && settings.useLocalAi) {
    const local = await fetchLocalAiReply(sourceText, settings);
    if (local) {
      return local;
    }
  }

  const bank = kind === "human" ? humanReplyBank : aiReplyBank;
  return bank[Math.floor(Math.random() * bank.length)];
}

export async function scheduleOpponentReply(room: RoomState, sourceText: string) {
  const settings = getAdminSettings();
  const delayMin = Math.min(settings.replyDelayMinMs, settings.replyDelayMaxMs);
  const delayMax = Math.max(settings.replyDelayMinMs, settings.replyDelayMaxMs);
  const delay = delayMin + Math.random() * (delayMax - delayMin);
  const text = await generateReply(room.opponentKind, sourceText, settings);

  const current = getRoom(room.roomId) ?? room;
  if (current.resolvedAt || Date.now() >= current.expiresAt) {
    return;
  }

  const nextRoom: RoomState = {
    ...current,
    lastActiveAt: Date.now(),
    pendingReply: {
      id: randomId("reply"),
      text,
      dueAt: Date.now() + delay
    }
  };

  saveRoom(nextRoom);
}

export function materializePendingReply(room: RoomState) {
  if (!room.pendingReply || room.pendingReply.dueAt > Date.now()) {
    return room;
  }

  const nextRoom: RoomState = {
    ...room,
    pendingReply: undefined,
    lastActiveAt: Date.now(),
    messages: [
      ...room.messages,
      {
        id: room.pendingReply.id,
        sender: "opponent",
        text: room.pendingReply.text,
        createdAt: room.pendingReply.dueAt
      }
    ]
  };

  saveRoom(nextRoom);
  return nextRoom;
}

export function appendUserMessage(room: RoomState, text: string, settings: AdminSettings) {
  const review = moderateText(text, settings);
  const timestamp = Date.now();

  if (!review.allowed) {
    const blockedRoom: RoomState = {
      ...room,
      lastActiveAt: timestamp,
      messages: [
        ...room.messages,
        {
          id: randomId("msg"),
          sender: "system",
          text: `訊息已被攔截：${review.reason}`,
          createdAt: timestamp,
          blocked: true,
          reason: review.reason
        }
      ]
    };

    saveRoom(blockedRoom);
    return {
      room: blockedRoom,
      moderation: review
    };
  }

  const nextRoom: RoomState = {
    ...room,
    lastActiveAt: timestamp,
    messages: [
      ...room.messages,
      {
        id: randomId("msg"),
        sender: "me",
        text: review.maskedText,
        createdAt: timestamp
      }
    ]
  };

  saveRoom(nextRoom);
  void scheduleOpponentReply(nextRoom, review.maskedText);

  return {
    room: nextRoom,
    moderation: review
  };
}

export function resolveGuess(room: RoomState, guess: GuessChoice) {
  const meta = getDeviceMeta();
  const now = Date.now();
  const nextRoom: RoomState = {
    ...room,
    guess,
    resolvedAt: now,
    endReason: "guess",
    lastActiveAt: now,
    messages: [
      ...room.messages,
      {
        id: randomId("msg"),
        sender: "system",
        text:
          guess === room.opponentKind
            ? "判斷成功。你猜對了對方的身份。"
            : `判斷失敗。對方其實是${room.opponentKind === "human" ? "真人" : "AI"}。`,
        createdAt: now
      }
    ]
  };

  const cooldownMinutes = getAdminSettings().repeatPairCooldownMinutes;
  const prunedPairs = meta.recentPairs.filter(
    (pair) => Date.now() - pair.finishedAt < cooldownMinutes * 60 * 1000
  );
  prunedPairs.push({
    opponentId: room.opponentId,
    finishedAt: now
  });

  saveDeviceMeta({
    ...meta,
    recentPairs: prunedPairs
  });
  saveRoom(nextRoom);
  return nextRoom;
}

export function getRemainingMs(room: RoomState) {
  return Math.max(0, room.expiresAt - Date.now());
}

export function getGuessRemainingMs(room: RoomState) {
  return Math.max(0, room.guessUnlockedAt - Date.now());
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function getLocalStats(): LocalStats {
  const rooms = Object.values(getRoomsMap());
  const meta = getDeviceMeta();
  const now = Date.now();

  return {
    deviceId: meta.id,
    roomCount: rooms.length,
    activeRoomCount: rooms.filter((room) => room.expiresAt > now && !room.resolvedAt).length,
    resolvedCount: rooms.filter((room) => Boolean(room.resolvedAt)).length,
    humanMatches: meta.humanMatches,
    aiMatches: meta.aiMatches,
    suspiciousCount: rooms.filter((room) =>
      room.fairnessFlags.some((flag) => flag.includes("可疑"))
    ).length
  };
}

export function clearLocalData() {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(ROOMS_KEY);
  window.localStorage.removeItem(DEVICE_KEY);
}
