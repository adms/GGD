/**
 * Replay browser types + api (task #175).
 *
 * The owner's playtest feedback channel is 「用回放重播的方式即可」: when a family
 * member says a round felt off, he finds that match here and watches it. The
 * list, per-recording detail, and view-ticket all proxy through the platform
 * admin API to the game server, because recordings carry player names and must
 * stay behind admin auth.
 */
import { api } from "./api";

/** One row in the 對戰回放 table — mirrors the game server's ReplaySummary. */
export interface ReplaySummary {
  id: string;
  matchId: string;
  startedAt: string;
  endedAt: string | null;
  complete: boolean;
  bytes: number;
  seed: number;
  contentVersion: string;
  buildStamp: string;
  arenaId: string;
  rounds: number;
  ticks: number;
  durationSec: number;
  players: { seatId: number; teamId: number; displayName: string; isBot: boolean; championId: string }[];
  winnerTeamId: number | null;
  faultCount: number;
}

export interface ReplayIdentity {
  contentVersion: string;
  registryFingerprint: string;
  buildStamp: string;
}

/**
 * 錄影目錄佔了多少碟 (GH#498)。
 *
 * ⚠️ 這一格存在的理由是**保留量的出貨值改成了「不刪」**。不刪 = 無限成長，
 * 而正式機的 docker data-root 和錄影目錄在同一顆碟（2026-08-16 那次 build cache
 * 把碟塞爆 → 網站 502）。⛔ 沒有這個顯示就不該有那個預設值。
 *
 * 舊版 game-server 不回這一格（欄位是後加的），所以型別是 optional，
 * 畫面上少一行而不是整頁失敗。
 */
export interface ReplayStorage {
  dir: string;
  files: number;
  bytes: number;
  freeBytes: number | null;
  totalBytes: number | null;
  retainMaxFiles: number;
  retainMaxAgeDays: number;
}

export interface ReplayListResp {
  replays: ReplaySummary[];
  identity: ReplayIdentity;
  storage?: ReplayStorage;
}

export interface ReplayDetailResp {
  summary: ReplaySummary;
  header: unknown;
  truncated: boolean;
  /** false when this recording cannot be replayed on the running build. */
  compatible: boolean;
  refusal: { code: string; message: string; expected?: string; actual?: string } | null;
  identity: ReplayIdentity;
}

export interface ReplayTicketResp {
  replayId: string;
  ticket: string;
  expiresInSecs: number;
}

export function listReplays(): Promise<ReplayListResp> {
  return api.request<ReplayListResp>("/admin/replays");
}

export function getReplay(id: string): Promise<ReplayDetailResp> {
  return api.request<ReplayDetailResp>(`/admin/replays/${encodeURIComponent(id)}`);
}

export function mintReplayTicket(id: string): Promise<ReplayTicketResp> {
  return api.request<ReplayTicketResp>(`/admin/replays/${encodeURIComponent(id)}/ticket`, { body: {} });
}

/** The client URL that opens the reused-renderer replay viewer. */
export function replayWatchUrl(clientBase: string, id: string, ticket: string): string {
  const base = clientBase.replace(/\/+$/, "");
  const q = ticket ? `#replay=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}` : `#replay=${encodeURIComponent(id)}`;
  return `${base}/${q}`;
}

/**
 * Human-readable file size.
 *
 * ⚠️ GB/TB 是 GH#498 加的，⛔ 不是裝飾：保留量出貨改成「不刪」之後，這一頁要印的
 * 不只是一場 60 KB 的錄影，還有整個目錄的佔用與**整顆碟的剩餘空間**（幾百 GB）。
 * 停在 MB 的話「剩 292 GB」會印成「299008.00 MB」，而那個數字沒有人讀得出意思。
 */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${(n / 1024 ** 4).toFixed(2)} TB`;
}

/** 保留量欄位的人話（0 = 不限／不刪，GH#498 的出貨值）。 */
export function fmtRetention(maxFiles: number, maxAgeDays: number): string {
  const files = maxFiles > 0 ? `最多 ${maxFiles} 份` : "份數不限";
  const days = maxAgeDays > 0 ? `超過 ${maxAgeDays} 天刪除` : "不因天數刪除";
  return `${files} · ${days}`;
}

/** m:ss from a duration in seconds. */
export function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
