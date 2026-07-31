export const ROOM_DURATION_MS: number;
export const GUESS_UNLOCK_MS: number;

export type EngineOp = {
  type: string;
  roomId?: string;
  text?: string;
  choice?: string;
  settings?: Record<string, unknown>;
};

export function dispatch(client: unknown, msg: EngineOp): void;
export function attachSocket(ws: unknown, deviceId: string, fp: string): void;
export function processPoll(body: Record<string, unknown>): { serverTime: number; messages: unknown[] };
export function startSweeper(): void;
export function getStoreSnapshot(): { roomCount: number; clientCount: number; queueLength: number };
