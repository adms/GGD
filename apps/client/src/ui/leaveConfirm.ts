/**
 * leaveConfirm — the PURE half of task #271: "戰鬥中不應該讓手把按鍵一鍵退出,
 * 應該要移動過去甚至按 [確認/取消] 的確認後才能退回大廳".
 *
 * WHAT WAS ACTUALLY BROKEN. It was never a key BINDING. `ui/PadFocusNav`'s B
 * button ran a heuristic — scan every focusable in the scope, regex its
 * aria-label/title/textContent for 取消|關閉|返回|離開|leave|back|close|…, click
 * the first hit. With no modal open the scope is `document.body`, so in
 * champSelect and in every intermission the FIRST hit was the top-right Leave
 * chip (`title="leave the match"`, text `Leave` — two matches). One tap of B,
 * no focus needed, no A, no confirmation: the match was over. With the shop
 * open the first B closed the shop and the SECOND one hit Leave, which is the
 * exact "B backs out one level" reflex a pad player has. That heuristic is
 * fixed in input/padFocusNav (`backControlIndex`); this module is the second
 * half — the deliberate [確認 / 取消] step every leave path now passes through.
 *
 * PURE ON PURPOSE. The client's vitest env is `node`, and the predicate is the
 * part that decides whether a player can be trapped, so it is testable without
 * a browser, a store or a clock. `ui/leaveFlow` feeds it live HUD state and
 * `ui/LeaveConfirmDialog` renders the copy.
 */

/**
 * Phases in which an explicit leave needs NO confirmation, because there is
 * nothing to abandon and a prompt would be a trap rather than a guard:
 *
 *  • `connecting` — the client has not joined a match yet. This is also the
 *    state a WEDGED client sits in, and "you cannot get out without answering a
 *    dialog first" is precisely what must never happen there.
 *  • `matchEnd`   — the match is over. MatchEndPanel owns the screen and its own
 *    返回大廳; asking "確定要離開?" after the result is in is noise, and the
 *    owner's rule ("比賽已結束 → 直接離開,不問") says so outright.
 *
 * Everything else — champSelect, intermission, combat, resolution — is a live
 * match with real teammates in it, so it confirms. Note that champSelect and
 * intermission are NOT the safe phases: they are where the B-button defect
 * actually fired, because the pad focus layer stands down during live combat.
 */
export const LEAVE_NO_CONFIRM_PHASES: ReadonlySet<string> = new Set(["connecting", "matchEnd"]);

export interface LeaveConfirmInput {
  /** platform screen machine (`match` while a match is on screen) */
  screen: string;
  /** HUD match phase: champSelect | intermission | combat | resolution | matchEnd */
  phase: string;
}

/**
 * Does this leave request need the [確認 / 取消] dialog first?
 *
 * Only a VOLUNTARY leave reaches this: the top-right chip, the pause menu, the
 * pad and touch all route through `useRequestLeave`. A disconnect, a closed
 * room, a kick or a match-end teardown changes `screen`/`match` directly and
 * never asks — so those can never be blocked by a dialog, which is the owner's
 * rule 5 ("不可以把玩家鎖在裡面") held structurally rather than by a flag.
 */
export function shouldConfirmLeave(input: LeaveConfirmInput): boolean {
  if (input.screen !== "match") return false;
  return !LEAVE_NO_CONFIRM_PHASES.has(input.phase);
}

// ------------------------------------------------------------------ copy --

export const LEAVE_CONFIRM_TITLE = "確定要離開這場對戰？";
/**
 * The CANCEL label. It is deliberately first in the DOM and left-most on the
 * row: `input/padFocusNav.initialFocusIndex` picks top-most-then-left-most, so
 * the pad's first nudge lands here and A twice in a row can never leave.
 */
export const LEAVE_CONFIRM_CANCEL = "取消 · 留在對戰";
export const LEAVE_CONFIRM_ACCEPT = "確認離開";
/** Spelled out so a pad/keyboard player is never guessing which button is which. */
export const LEAVE_CONFIRM_HINT = "手把：← → 選擇 · A 確定 · B 取消　鍵盤：Tab 選擇 · Enter 確定 · Esc 取消";

/**
 * What leaving actually COSTS, stated from the code rather than invented.
 * Every line below is a claim about a specific place in the repo:
 *
 *  1. `apps/game-server/src/rooms/MatchRoom.ts:649` — onLeave immediately does
 *     `seat.setDriver(new AIDriver())`. Your champion keeps playing; a bot is
 *     driving it. Teammates finish the match with that bot.
 *  2. `MatchRoom.ts:654` — `if (consented) return;` runs BEFORE the
 *     `allowReconnection(client, RECONNECT_GRACE_SECS)` window. The 60-second
 *     grace exists only for a DROP; pressing Leave is consented
 *     (`net/RoomConnection.ts:333` calls `room.leave(true)`), so the seat stays
 *     AI for the rest of the match and there is no way back into it.
 *  3. `MatchRoom.ts:685-717` — 藍水晶 / 排名積分 / M COIN are granted by
 *     `settleToPlatform()`, which is reachable ONLY from `finishMatch()`, i.e.
 *     when the match actually reaches its result. Leaving does not settle
 *     anything, and the client that left never receives the settlement event,
 *     so the 賽後評價 screen is not shown to it.
 *  4. offline/solo: nobody else is holding the room open, so it is disposed
 *     without ever reaching `finishMatch` (`MatchRoom.onDispose`, :668) — the
 *     practice match simply ends.
 *
 * Deliberately NOT claimed: "你拿不到水晶". A seat keeps its `accountId` and its
 * `spec.isBot === false` (MatchController.ts:1356), so when OTHER humans finish
 * the match the leaver's seat is still in the settle payload. Saying otherwise
 * would be scarier than the truth, and the owner asked for neither.
 */
export function leaveConsequences(mode: string | undefined): string[] {
  if (mode === "offline") {
    return [
      "這場單機練習會直接結束，戰場立刻收掉。",
      "本場戰績、藍水晶與排名積分都不會結算 —— 獎勵只在整場打完時發放。",
    ];
  }
  return [
    "你的英雄會立刻交給 AI 接手，隊友要跟電腦打完剩下的回合。",
    "離開後回不去這一場：60 秒重連寬限只給「斷線」，主動離開不適用。",
    "賽後評價、藍水晶與排名積分要整場結束才結算，你不會看到自己的結算畫面。",
  ];
}
