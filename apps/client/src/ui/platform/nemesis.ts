/**
 * nemesis — the data + decision layer behind the lobby's 宿敵排行榜 (GH#454).
 *
 * owner 2026-08-19:「大廳新增 **宿敵排行榜**，把**最多輸贏的宿敵**列在**朋友列表
 * 跟積分排行榜之間**」
 *
 * Same split as ./onlinePlayers: everything the panel has to DECIDE is a pure
 * function here, and the one network call is a thin wrapper over the app-wide
 * ApiClient so a test reads the REAL request rather than a stand-in (failure
 * form ⑤).
 *
 * ---- THE ONE DECISION THAT IS NOT COSMETIC ---------------------------------
 * 「沒有宿敵」 and 「我讀不到宿敵」 are DIFFERENT FACTS and only one of them is a
 * reason to go play a match. On this board the empty case is also the NORMAL
 * case right now — the record only counts human-vs-human matches (bots never
 * reach data/headtohead, see the platform's nemesis.go), and most matches
 * today are bot matches. So an empty board gets a sentence explaining how to
 * fill it, a failed read gets a different sentence, and neither renders blank.
 */
import { api } from "./api";
import type { NemesisResp, NemesisRow } from "./types";
import type { NemesisSortMode } from "./lobbyLayout";

export type { NemesisRow, NemesisResp };

/**
 * GET /ranking/me/nemesis. Authenticated, and the account is taken from the
 * TOKEN on the server — there is no id parameter to point at somebody else.
 */
export function fetchNemesis(sort: NemesisSortMode, limit: number): Promise<NemesisResp> {
  const q = new URLSearchParams({ sort, limit: String(limit) });
  return api.request<NemesisResp>(`/ranking/me/nemesis?${q.toString()}`);
}

/** Whether there is a session to ask WITH (never a reason to claim "no rivals"). */
export function canReadNemesis(): boolean {
  return api.hasSession;
}

/** What the board says when it has no rows to draw. */
export type NemesisEmptyState = "loading" | "failed" | "empty";

/**
 * The copy for a board with nothing in it. ⛔ Never returns "" — a blank panel
 * under a heading is the shape of failure form ③ (deletable, nothing goes red).
 */
export function nemesisEmptyReason(state: NemesisEmptyState): string {
  switch (state) {
    case "loading":
      return "讀取中…";
    case "failed":
      return "宿敵紀錄暫時讀不到 —— 這不代表你沒有宿敵。";
    default:
      return "還沒有宿敵。跟真人對戰過就會出現在這裡（BOT 不算）。";
  }
}

/** 「2-1」 — the caller's wins first, exactly as the row is stated. */
export function formatRecord(row: NemesisRow): string {
  return `${row.wins}-${row.losses}`;
}

/** 「67%」 — the caller's win rate against this rival, rounded to a whole point. */
export function formatWinRate(row: NemesisRow): string {
  return `${Math.round(row.winRate * 100)}%`;
}

/**
 * 「剛剛 / 3 小時前 / 5 天前」 for the 最近一次交手 column.
 *
 * `now` is a parameter rather than a `Date.now()` inside, so the branches are
 * testable without freezing the clock. An unparseable/absent timestamp reads
 * 「—」 instead of 「Invalid Date」 or 「NaN 天前」.
 */
export function formatLastSeen(iso: string | undefined, now: number): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 個月前`;
}

/**
 * The display name for a rival. The id fallback is deliberate: a row whose
 * account has since been deleted still describes real matches, and 「(已刪除)」
 * would claim more than we know.
 */
export function rivalName(row: NemesisRow): string {
  return row.username || row.accountId;
}
