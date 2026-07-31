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
};

export type AdminSettings = {
  maskWords: string[];
  blockWords: string[];
  repeatPairCooldownMinutes: number;
  suspiciousJoinThreshold: number;
  localAiEndpoint: string;
  localAiModel: string;
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
  maskWords: ["笨蛋", "廢物", "白痴", "去死", "垃圾"],
  blockWords: ["殺了你", "強暴", "兒童色情", "恐攻", "毒品交易"],
  repeatPairCooldownMinutes: 45,
  suspiciousJoinThreshold: 5,
  localAiEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
  localAiModel: "local-blind-test-model"
};

const humanReplyBank = [
  "我先不急著回答，你覺得我像真人還是像 AI？",
  "這問題有點賊，我反而更想知道你怎麼判斷。",
  "哈哈，你這樣問很像在套話。",
  "我打字其實有點慢，所以你別用這點判斷我。",
  "如果我是 AI，我現在應該會講得更工整一點吧。"
];

const aiReplyBank = [
  "這是一個有趣的問題，我會先從語義和互動脈絡來回答。",
  "若從資訊結構來看，你的提問帶有明顯的測試意圖。",
  "我可以提供更完整的推理過程，但那可能會暴露太多線索。",
  "以對話策略而言，我現在應該避免過度模式化的回應。",
  "如果你想判斷身份，可以觀察我是否過度穩定與完整。"
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
    id: saved.id ?? randomId("device"),
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

export function moderateText(text: string, settings: AdminSettings): ModerationResult {
  const normalized = text.trim();

  if (!normalized) {
    return {
      allowed: false,
      maskedText: "",
      reason: "訊息不能是空白。"
    };
  }

  for (const word of settings.blockWords) {
    if (normalized.includes(word)) {
      return {
        allowed: false,
        maskedText: normalized,
        reason: `訊息包含禁止詞：${word}`
      };
    }
  }

  let maskedText = normalized;
  for (const word of settings.maskWords) {
    if (maskedText.includes(word)) {
      maskedText = maskedText.replaceAll(word, `${word[0]}**`);
    }
  }

  return {
    allowed: true,
    maskedText
  };
}

function getRoomsMap(): Record<string, RoomState> {
  if (!hasWindow()) {
    return {};
  }

  return safeParse<Record<string, RoomState>>(window.localStorage.getItem(ROOMS_KEY), {});
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

export function createRoomState(): RoomState {
  const settings = getAdminSettings();
  const meta = getDeviceMeta();
  const now = Date.now();
  const recentStarts = meta.recentStarts.filter((stamp) => now - stamp < 15 * 60 * 1000);
  recentStarts.push(now);

  const fairnessFlags = [
    "避免同裝置短時間重複配對",
    "平衡真人與 AI 配對比例"
  ];

  if (recentStarts.length >= settings.suspiciousJoinThreshold) {
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

export function queueOpponentReply(room: RoomState, sourceText: string) {
  const reply = generateOpponentReply(room.opponentKind, sourceText);
  const nextRoom: RoomState = {
    ...room,
    pendingReply: {
      id: randomId("reply"),
      text: reply,
      dueAt: Date.now() + 1400 + Math.floor(Math.random() * 1600)
    }
  };

  saveRoom(nextRoom);
  return nextRoom;
}

export function materializePendingReply(room: RoomState) {
  if (!room.pendingReply || room.pendingReply.dueAt > Date.now()) {
    return room;
  }

  const nextRoom: RoomState = {
    ...room,
    pendingReply: undefined,
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

function generateOpponentReply(kind: OpponentKind, sourceText: string) {
  const lower = sourceText.toLowerCase();
  const bank = kind === "human" ? humanReplyBank : aiReplyBank;
  const picked = bank[Math.floor(Math.random() * bank.length)];

  if (lower.includes("你是 ai") || lower.includes("你是ai")) {
    return kind === "human"
      ? "你這麼直接問，我更不想讓你猜中了。"
      : "如果我直接承認或否認，這場測試就失去樂趣了。";
  }

  if (lower.includes("你好")) {
    return kind === "human" ? "嗨，你好。你會怎麼開始判斷一個陌生人？" : "你好，我很好奇你會如何設計圖靈測試的提問。";
  }

  return picked;
}

export function appendUserMessage(room: RoomState, text: string, settings: AdminSettings) {
  const review = moderateText(text, settings);
  const timestamp = Date.now();

  if (!review.allowed) {
    const blockedRoom: RoomState = {
      ...room,
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

  return {
    room: queueOpponentReply(nextRoom, review.maskedText),
    moderation: review
  };
}

export function resolveGuess(room: RoomState, guess: GuessChoice) {
  const meta = getDeviceMeta();
  const nextRoom: RoomState = {
    ...room,
    guess,
    resolvedAt: Date.now(),
    messages: [
      ...room.messages,
      {
        id: randomId("msg"),
        sender: "system",
        text:
          guess === room.opponentKind
            ? "判斷成功。你猜對了對方的身份。"
            : `判斷失敗。對方其實是${room.opponentKind === "human" ? "真人" : "AI"}。`,
        createdAt: Date.now()
      }
    ]
  };

  const prunedPairs = meta.recentPairs.filter(
    (pair) => Date.now() - pair.finishedAt < getAdminSettings().repeatPairCooldownMinutes * 60 * 1000
  );
  prunedPairs.push({
    opponentId: room.opponentId,
    finishedAt: Date.now()
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
