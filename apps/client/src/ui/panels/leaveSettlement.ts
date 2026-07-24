/**
 * leaveSettlement — the PURE decision behind task #193: when a player whose team
 * is eliminated chooses to leave, the evaluation/settlement screen must appear
 * FIRST, then confirm → lobby. A direct "return to lobby" (from the pause menu
 * or the top-right Leave chip) that skipped the settlement is the bug this
 * closes. No React, no store, no clock — just the boolean the leave-flow reads,
 * so it can be unit-tested in isolation.
 */

/** Minimal shapes lifted from RoomStore's SeatView / TeamView. */
export interface LeaveSeat {
  seatId: number;
  teamId: number;
}
export interface LeaveTeam {
  teamId: number;
  eliminated: boolean;
}

/**
 * Is the LOCAL player's team eliminated (its shared life pool spent)? Derived
 * from the authoritative snapshot's `teams[].eliminated`, resolved through the
 * local seat's team. A spectator with no seat, or a team not yet in the snapshot,
 * is treated as NOT eliminated — the leave chip then behaves as it always did.
 */
export function localTeamEliminated(
  teams: readonly LeaveTeam[],
  seats: readonly LeaveSeat[],
  localSeatId: number | null,
): boolean {
  if (localSeatId === null) return false;
  const seat = seats.find((s) => s.seatId === localSeatId);
  if (!seat) return false;
  const team = teams.find((t) => t.teamId === seat.teamId);
  return team?.eliminated === true;
}

export interface LeaveGateInput {
  /** current match phase from the HUD store */
  phase: string;
  /** result of {@link localTeamEliminated} */
  teamEliminated: boolean;
  /** a settlement payload is present (the per-team broadcast, or the final one) */
  hasSettlement: boolean;
}

/**
 * Should a Leave click pass THROUGH the settlement screen before the lobby?
 *
 * True only when three things hold at once:
 *   1. the local team is out (its life is gone) — an alive player abandoning a
 *      match still leaves directly, nothing to settle;
 *   2. a settlement payload exists to render — without the server's per-team
 *      broadcast there is no card, so gating would trap the player on a blank;
 *   3. the phase is not already `matchEnd` — there MatchEndPanel owns the whole
 *      screen and its own 返回大廳, so re-gating would double the settlement.
 *
 * When false the caller returns to the lobby immediately, exactly as before.
 */
export function shouldSettleBeforeLeave(input: LeaveGateInput): boolean {
  return input.teamEliminated && input.hasSettlement && input.phase !== "matchEnd";
}
