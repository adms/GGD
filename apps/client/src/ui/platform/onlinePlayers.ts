/**
 * onlinePlayers — the data + decision layer behind the lobby's 線上玩家 panel
 * (owner 2026-08-03:「多出一個區域顯示所有大廳正在線上的玩家列表，並且名字旁邊有
 * 按鈕可以一鍵加入朋友」).
 *
 * Everything the panel has to DECIDE lives here as a pure function, so the
 * decisions are testable without a DOM and without a network:
 *
 *  · `visibleRows`   — which rows are shown at all (`alreadyFriendMode`)
 *  · `addButtonFor`  — what the button says AND whether pressing it does
 *                      anything (the part a "the button exists" assertion
 *                      cannot see — CLAUDE.md failure form ⑦)
 *
 * The two network calls are thin wrappers over the app-wide ApiClient, so a
 * test can stub `fetch` and read the REAL request that goes on the wire rather
 * than a hand-rolled stand-in of it (failure form ⑤).
 */
import { api } from "./api";
import type { AlreadyFriendMode } from "./lobbyLayout";

/**
 * This row's edge to the VIEWER, as the platform reports it
 * (apps/platform/internal/friend/online.go).
 */
export type OnlineRelation = "none" | "friend" | "outgoing" | "incoming";

export interface OnlinePlayer {
  id: string;
  username: string;
  /** live presence: "online" | "in-lobby" | "in-match" — never "offline". */
  state: string;
  relation: OnlineRelation;
}

export interface OnlinePlayersResp {
  players: OnlinePlayer[];
  /** How many were online BEFORE the server's cap. */
  total: number;
  truncated: boolean;
}

/**
 * GET /lobby/online. Authenticated AND playable-gated on the server (a banned
 * or not-yet-approved account gets 403, not a roster) — see online.go.
 */
export function listOnlinePlayers(): Promise<OnlinePlayersResp> {
  return api.request<OnlinePlayersResp>("/lobby/online");
}

/**
 * Whether there is a session to ask WITH. The panel checks this before its
 * poll so a signed-out render (only reachable from a test harness — the lobby
 * itself is behind auth) does not fire a request that can only 401.
 *
 * It is a reason to skip the CALL, never a reason to claim the roster is
 * empty: the panel renders the same 「讀不到」 line, because 「沒有人在線上」 would
 * be a different and false statement.
 */
export function canReadRoster(): boolean {
  return api.hasSession;
}

/**
 * One-click add. Sends `accountId`, not `username`: the panel already holds the
 * id, and two accounts can present the same NAME to the eye (full-width vs
 * half-width characters, trailing spaces) while being different rows. Sending
 * the id is the only version of 「一鍵」 that cannot befriend the wrong person.
 */
export function addFriendById(accountId: string): Promise<{ status: string }> {
  return api.request<{ status: string }>("/friends/requests", { body: { accountId } });
}

/** How the panel renders one row's add button. */
export interface AddButtonState {
  label: string;
  /** True = pressing it must do NOTHING (and it is `disabled` in the DOM). */
  inert: boolean;
  /** Hover text explaining why, when inert. */
  title: string;
}

/**
 * The add button for one row.
 *
 * `pending` is the ids this session has already pressed. It exists because the
 * server's `relation` only moves on the next poll, and a button that stays live
 * for ten seconds after a successful press invites a double request — harmless
 * on the server (Request is idempotent) but it reads as "nothing happened".
 */
export function addButtonFor(
  player: OnlinePlayer,
  pending: ReadonlySet<string> = new Set(),
): AddButtonState {
  if (player.relation === "friend") {
    return { label: "已加入", inert: true, title: `${player.username} 已經是你的朋友` };
  }
  if (player.relation === "incoming") {
    return { label: "待回應", inert: true, title: `${player.username} 已經邀請你 —— 到上面的 Friends 收下` };
  }
  if (player.relation === "outgoing" || pending.has(player.id)) {
    return { label: "邀請已送出", inert: true, title: `已送出好友邀請給 ${player.username}` };
  }
  return { label: "加好友", inert: false, title: `送出好友邀請給 ${player.username}` };
}

/**
 * The rows the panel renders, honouring `alreadyFriendMode`.
 *
 * owner's default is `greyed-button`: an existing friend STAYS on the list with
 * an inert button. Dropping the row (the `hide-row` alternative) is the obvious
 * tidy-up and the reason it is not the default is that it lies — a friend who
 * disappears from 線上玩家 looks exactly like a friend who logged off.
 */
export function visibleRows(
  players: readonly OnlinePlayer[],
  mode: AlreadyFriendMode,
): OnlinePlayer[] {
  if (mode === "hide-row") return players.filter((p) => p.relation !== "friend");
  return [...players];
}
