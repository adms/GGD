/**
 * LeaveConfirmDialog — the [確認 / 取消] step of task #271. One dialog, for
 * every leave trigger, because ui/leaveFlow is the single callback all of them
 * share (chip · pause menu · keyboard · pad · touch).
 *
 * THE THREE THINGS IT HAS TO GET RIGHT, and how:
 *
 *  1. IT MUST BE DRIVEABLE BY A PAD. The focus layer stands down during live
 *     combat unless a `data-pad-scope` is on screen (input/padFocusNav
 *     `focusNavActive`), so a modal that forgets to declare one is a modal a pad
 *     player CANNOT TOUCH — that is a real, live defect on
 *     panels/LeaveSettlementOverlay today. This one declares the scope, at a
 *     priority ABOVE the pause menu's 50, because it opens over it.
 *
 *  2. CANCEL IS THE DEFAULT, ON PURPOSE. `initialFocusIndex` picks
 *     top-most-then-left-most, so 取消 is first in the DOM and left on the row;
 *     the dialog also plants real DOM focus + the pad glow on it when it opens.
 *     Two taps of A therefore cancel — they can never leave — which is the
 *     "連按兩下 A 不應該就離開" rule. 取消 carries `data-pad-back`, so B is
 *     cancel too (and `backControlIndex` would never pick 確認離開 anyway: the
 *     veto list exists exactly so B can't fire a destructive control).
 *
 *  3. IT MUST NOT BECOME A CAGE. If the match ends, the room closes, the player
 *     is kicked or dropped while this is open, the leave stops being a
 *     confirmable voluntary act — so the dialog closes ITSELF and the teardown
 *     proceeds. Escape cancels (handled in ui/PauseMenu, which owns the one
 *     Escape listener, so Escape never both cancels this AND toggles the pause
 *     menu underneath).
 *
 * Mounted by ui/PauseMenu — the in-match menu layer, which platform/AppRoot
 * already renders on every match surface. It is match-scoped chrome, so it does
 * NOT belong in ui/GlobalChrome (a replay page has no match to leave).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { hudStore } from "../net/RoomStore";
import { useApp } from "./platform/store";
import { leaveConfirmStore, useLeaveConfirm } from "./leaveFlow";
import {
  LEAVE_CONFIRM_ACCEPT,
  LEAVE_CONFIRM_CANCEL,
  LEAVE_CONFIRM_HINT,
  LEAVE_CONFIRM_TITLE,
  leaveConsequences,
  shouldConfirmLeave,
} from "./leaveConfirm";
import { SfxButton } from "./SfxButton";
import { applyPadFocus } from "./focusGlow";
import { HUD_Z } from "./hud/hudLayout";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

const TITLE_ID = "leave-confirm-title";
const BODY_ID = "leave-confirm-body";
/** Marks the cancel button so the open-effect can plant focus on it. */
const CANCEL_ATTR = "data-leave-confirm-cancel";

const readPhase = (): string => hudStore.getState().phase;
/**
 * The match phase, read so that a TEST CAN SEE IT.
 *
 * `net/RoomStore`'s `useHud` is zustand's `useStore`, which hands
 * `getInitialState` to React's server-snapshot slot — and `renderToStaticMarkup`
 * is the only way this repo's `node`-env client tests render React at all. So a
 * component gated on `useHud(s => s.phase)` renders as though the phase were
 * still `connecting`, whatever the store actually holds, and the assertion "the
 * dialog disappears when the match ends" could not be written truthfully.
 * `ui/platform/store`'s `useApp` was hand-rolled for exactly this reason (see
 * its docblock); `useHud` has not been, and changing it is a whole-HUD change
 * that does not belong to this task, so the narrow version lives here.
 * Browser behaviour is identical — only the server snapshot differs.
 */
function usePhase(): string {
  return useSyncExternalStore(hudStore.subscribe, readPhase, readPhase);
}

const btn: React.CSSProperties = {
  minHeight: 46,
  padding: "12px 20px",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
  border: "1px solid #2c3448",
  background: "#1b2233",
  color: TEXT_MAIN,
};

export function LeaveConfirmDialog(): React.JSX.Element | null {
  const open = useLeaveConfirm((s) => s.open);
  const screen = useApp((s) => s.screen);
  const mode = useApp((s) => s.match?.mode);
  const phase = usePhase();
  // SfxButton is a plain React-18 function component, so it cannot take a ref.
  // The row holds the ref and the cancel button is found by its test id.
  const rowRef = useRef<HTMLDivElement | null>(null);
  // the dialog only ever guards a VOLUNTARY leave; the moment that stops being
  // true (match over, kicked, dropped, room closed → screen/phase move under
  // us) it must get out of the way rather than hold the player behind a prompt
  const stillGating = shouldConfirmLeave({ screen, phase });

  useEffect(() => {
    if (open && !stillGating) leaveConfirmStore.getState().cancel();
  }, [open, stillGating]);

  // open → focus 取消, for real (keyboard Enter/Space) and for the pad glow
  // (so a pad player can SEE the safe default without touching the stick).
  useEffect(() => {
    if (!open) return;
    const el = rowRef.current?.querySelector<HTMLElement>(`[${CANCEL_ATTR}]`);
    if (!el) return;
    applyPadFocus(el);
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [open]);

  if (!open || !stillGating) return null;

  const lines = leaveConsequences(mode);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,9,15,0.66)",
        pointerEvents: "auto",
        padding: 16,
        boxSizing: "border-box",
        // above the pause menu it can open from, and above the HUD it guards
        zIndex: HUD_Z.modal + 1,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={BODY_ID}
        // #197 — a pad-operable modal MUST declare its scope, or the focus layer
        // stands down in combat and the pad cannot reach these buttons at all.
        // 60 > the pause menu's 50 (ui/PauseMenu) because this opens over it.
        data-pad-scope="leave-confirm"
        data-pad-scope-priority="60"
        style={{
          width: 420,
          maxWidth: "94vw",
          padding: 22,
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 14,
          color: TEXT_MAIN,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div id={TITLE_ID} style={{ fontSize: 19, fontWeight: 900 }}>
          {LEAVE_CONFIRM_TITLE}
        </div>

        <ul id={BODY_ID} style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {lines.map((line) => (
            <li key={line} style={{ fontSize: 13, lineHeight: 1.55, color: TEXT_MAIN }}>
              {line}
            </li>
          ))}
        </ul>

        {/* 取消 FIRST and LEFT: initialFocusIndex picks top-most-then-left-most,
            so the pad's very first nudge lands on the safe choice. */}
        <div ref={rowRef} style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <SfxButton
            onClick={() => leaveConfirmStore.getState().cancel()}
            aria-label={LEAVE_CONFIRM_CANCEL}
            data-pad-back
            {...{ [CANCEL_ATTR]: "" }}
            style={{ ...btn, flex: 1 }}
          >
            {LEAVE_CONFIRM_CANCEL}
          </SfxButton>
          <SfxButton
            kind="danger"
            onClick={() => leaveConfirmStore.getState().confirm()}
            aria-label={LEAVE_CONFIRM_ACCEPT}
            style={{ ...btn, flex: 1, background: "#3a1d22", borderColor: "#6b2b34" }}
          >
            {LEAVE_CONFIRM_ACCEPT}
          </SfxButton>
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM }}>{LEAVE_CONFIRM_HINT}</div>
      </div>
    </div>
  );
}
