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

export interface ReplayListResp {
  replays: ReplaySummary[];
  identity: ReplayIdentity;
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

/** Human-readable file size. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** m:ss from a duration in seconds. */
export function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
