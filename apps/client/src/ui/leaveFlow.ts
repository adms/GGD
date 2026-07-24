/**
 * useRequestLeave — the ONE leave callback both leave triggers share (the pause
 * menu's ⏻ 返回大廳 and the top-right Leave chip), so #193's rule lives in a
 * single place: a player whose team is eliminated passes through the settlement
 * screen before the lobby; everyone else leaves directly, exactly as before.
 *
 * The gate decision is the pure {@link shouldSettleBeforeLeave}; this hook only
 * feeds it the live HUD state and routes to the store.
 */
import { useHud } from "../net/RoomStore";
import { useApp } from "./platform/store";
import { localTeamEliminated, shouldSettleBeforeLeave } from "./panels/leaveSettlement";

export function useRequestLeave(): () => void {
  const phase = useHud((s) => s.phase);
  const teams = useHud((s) => s.teams);
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);
  const hasSettlement = useHud((s) => s.settlement !== null);
  const openLeaveGate = useApp((s) => s.openLeaveGate);
  const returnToLobby = useApp((s) => s.returnToLobby);

  return () => {
    const gate = shouldSettleBeforeLeave({
      phase,
      teamEliminated: localTeamEliminated(teams, seats, localSeatId),
      hasSettlement,
    });
    if (gate) openLeaveGate();
    else void returnToLobby();
  };
}
