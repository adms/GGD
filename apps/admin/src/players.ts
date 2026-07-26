/** Pure helpers for the Players table (client-side refinement of the server
 * search: substring filter over username / email / id, case-insensitive). */
import type { AccountRow } from "./types";

export function filterAccounts(rows: AccountRow[], query: string): AccountRow[] {
  const q = query.trim().toLowerCase();
  if (q === "") return rows;
  return rows.filter(
    (r) =>
      r.username.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
  );
}

/** Compact win-rate string for the table (0 games → "—"). */
export function winRate(row: AccountRow): string {
  if (row.games <= 0) return "—";
  return `${Math.round((row.wins / row.games) * 100)}%`;
}

// ---- #246 上線燈號 ------------------------------------------------------------
//
// The owner asked for a light that answers ONE question: 「1小時內曾經有動作的
// 玩家」. Everything below exists to answer exactly that and to be honest about
// what it can and cannot mean.

/** The owner's threshold, verbatim: one hour of "有做任何 session 連線動作". */
export const SEEN_ACTIVE_MS = 60 * 60 * 1000;

/** How bright the dot is drawn. */
export type SeenTone = "live" | "active" | "dim" | "off";
/** Whether the last-seen stamp is inside the hour, outside it, or missing. */
export type SeenLevel = "active" | "stale" | "never";
/**
 * The live socket state. `unknown` is NOT `offline`: it means the server did
 * not report presence at all (Redis down, or a build that predates #246), and
 * the UI must then say nothing about connectivity rather than guess "no".
 */
export type PresenceKind = "in-match" | "in-lobby" | "online" | "offline" | "unknown";

export interface SeenState {
  level: SeenLevel;
  presence: PresenceKind;
  tone: SeenTone;
  /** The one-word cell label. */
  label: string;
  /** The approved two-line hover text (line 2 omitted when presence is unknown). */
  tooltip: string;
}

/** 剛剛 / N 分鐘前 / N 小時前 / N 天前 — the owner reads minutes, not timestamps. */
export function agoText(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/** Normalise whatever the server sent into the four states the UI knows. */
export function presenceKind(raw: string | undefined): PresenceKind {
  switch (raw) {
    case "in-match":
    case "in-lobby":
    case "online":
    case "offline":
      return raw;
    default:
      return "unknown";
  }
}

/**
 * The second tooltip line.
 *
 * It deliberately does NOT read a single 「目前連線中」. The platform sets
 * `in-lobby` the moment the lobby socket opens, so someone idling on the menu
 * who never starts a game is "connected" — one ambiguous string would let that
 * be misread as "playing". Since the platform already distinguishes the two
 * (`in-match` is set when a match starts), the console shows the real one.
 */
function presenceLine(p: PresenceKind): string {
  switch (p) {
    case "in-match":
      return "目前連線中 · 對戰中";
    case "in-lobby":
      return "目前連線中 · 在大廳";
    case "online":
      return "目前連線中";
    case "offline":
      return "目前沒有連線";
    case "unknown":
      return "";
  }
}

/**
 * Everything the light needs for one row.
 *
 * `now` is injected so this is testable and so a table full of rows renders
 * against ONE clock reading rather than drifting per row.
 */
export function seenState(row: AccountRow, now: number = Date.now()): SeenState {
  const parsed = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
  const seenAt = Number.isFinite(parsed) ? parsed : null;
  const presence = presenceKind(row.presence);

  const level: SeenLevel = seenAt === null ? "never" : now - seenAt <= SEEN_ACTIVE_MS ? "active" : "stale";

  // A held socket outranks the timestamp: it is the stronger, more current
  // signal, and it is the only one that can say WHICH kind of connected.
  const connected = presence === "in-match" || presence === "in-lobby" || presence === "online";
  const tone: SeenTone = connected ? "live" : level === "active" ? "active" : level === "stale" ? "dim" : "off";

  const label = connected
    ? presence === "in-match"
      ? "對戰中"
      : presence === "in-lobby"
        ? "大廳中"
        : "連線中"
    : seenAt === null
      ? "—"
      : agoText(now - seenAt);

  const lines = [seenAt === null ? "沒有任何連線動作記錄" : `最後動作 ${agoText(now - seenAt)}`];
  const second = presenceLine(presence);
  if (second !== "") lines.push(second);

  return { level, presence, tone, label, tooltip: lines.join("\n") };
}
