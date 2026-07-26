/**
 * useRequestLeave — the ONE leave callback EVERY leave trigger shares: the
 * top-right Leave chip (platform/AppRoot), the pause menu's ⏻ 返回大廳
 * (ui/PauseMenu), the pad (which reaches both of those through the DOM focus
 * layer) and touch (which taps the same chip). Two rules live here, in one
 * place, so no trigger can diverge from another:
 *
 *   #193 — a player whose team is eliminated passes through the settlement
 *          screen before the lobby (`shouldSettleBeforeLeave`).
 *   #271 — a VOLUNTARY leave out of a live match must first be confirmed
 *          ([確認 / 取消], `shouldConfirmLeave`). Before this, the chip was one
 *          click, the pause item was two, and the pad's B button was ZERO —
 *          see ui/leaveConfirm's docblock for how B managed to click Leave
 *          without anything being focused.
 *
 * ORDER MATTERS, AND THERE IS ONLY EVER ONE PROMPT. Confirmation runs FIRST and
 * #193's settlement runs after it, on the confirmed path — never both as
 * "are you sure?" dialogs. An eliminated player is asked once (their card, with
 * 返回大廳 / 繼續觀戰); everyone else is asked once (this dialog). Nobody is
 * asked twice.
 *
 * WHY THE GATE IS HERE AND NOT IN `returnToLobby`. The store's `returnToLobby`
 * is ALSO called by machinery: an online Restart with no host authority bails to
 * the lobby with it (platform/store.ts:696-700), and 查看戰績變化 uses it to
 * navigate (store.ts:1025-1028). A confirmation inside it would block those and
 * strand the player. Equally, a disconnect / room close / kick never comes
 * through here at all — they move `screen`/`match` directly — so those paths
 * are structurally un-gateable, which is exactly the requirement.
 */
import { useCallback, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { useHud } from "../net/RoomStore";
import { useApp } from "./platform/store";
import { shouldConfirmLeave } from "./leaveConfirm";
import { localTeamEliminated, shouldSettleBeforeLeave } from "./panels/leaveSettlement";

interface LeaveConfirmState {
  /** is the [確認 / 取消] dialog on screen? */
  open: boolean;
  /**
   * What to run if the player confirms. Captured at ASK time from the live
   * store/HUD state, so the decision the dialog commits to is the one the
   * player was looking at — and so the dialog itself owns no leave logic.
   */
  commit: (() => void) | null;
  ask(commit: () => void): void;
  cancel(): void;
  confirm(): void;
}

/**
 * Vanilla store rather than component state: the dialog is rendered by
 * ui/LeaveConfirmDialog but ASKED for from anywhere `useRequestLeave` is called
 * (a chip in one subtree, a menu item in another), and ui/PauseMenu's Escape
 * handler needs to read it without a subscription.
 */
export const leaveConfirmStore = createStore<LeaveConfirmState>((set, get) => ({
  open: false,
  commit: null,
  ask(commit) {
    set({ open: true, commit });
  },
  cancel() {
    set({ open: false, commit: null });
  },
  confirm() {
    const run = get().commit;
    set({ open: false, commit: null });
    run?.();
  },
}));

/**
 * React hook over the confirm store. Hand-rolled for the same reason
 * platform/store's `useApp` is (see its docblock): zustand's `useStore` passes
 * `getInitialState` as the SERVER snapshot, and `react-dom/server`'s
 * renderToStaticMarkup is the only way this repo's `node`-env client tests
 * render React — so under the default, a test that opens the dialog and then
 * renders it would get the closed markup and prove nothing.
 */
export function useLeaveConfirm<T>(selector: (s: LeaveConfirmState) => T): T {
  const snap = useCallback(() => selector(leaveConfirmStore.getState()), [selector]);
  return useSyncExternalStore(leaveConfirmStore.subscribe, snap, snap);
}

export function useRequestLeave(): () => void {
  const screen = useApp((s) => s.screen);
  const phase = useHud((s) => s.phase);
  const teams = useHud((s) => s.teams);
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);
  const hasSettlement = useHud((s) => s.settlement !== null);
  const openLeaveGate = useApp((s) => s.openLeaveGate);
  const returnToLobby = useApp((s) => s.returnToLobby);

  return () => {
    // #193's routing, deferred until the player has actually said yes.
    const commit = (): void => {
      const gate = shouldSettleBeforeLeave({
        phase,
        teamEliminated: localTeamEliminated(teams, seats, localSeatId),
        hasSettlement,
      });
      if (gate) openLeaveGate();
      else void returnToLobby();
    };

    // An eliminated player's settlement card IS their confirmation — it already
    // offers 返回大廳 / 繼續觀戰. Prompting first would be two dialogs for one
    // decision, which is the worst outcome available here.
    const settles = shouldSettleBeforeLeave({
      phase,
      teamEliminated: localTeamEliminated(teams, seats, localSeatId),
      hasSettlement,
    });
    if (!settles && shouldConfirmLeave({ screen, phase })) {
      leaveConfirmStore.getState().ask(commit);
      return;
    }
    commit();
  };
}
