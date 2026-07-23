/**
 * PrepClock — the prep window's countdown, made visible (task #95).
 *
 * 「shop 頁面也是有限時，一樣進入要有倒數計時的畫面跟音效提示」. The bells already
 * rang (task #30 built them for champ select, task #38 added `intermission` to
 * COUNTDOWN_PHASES) — nothing showed the player that the shop was on a clock.
 *
 * This is the imperative shell only. EVERY decision — the ramp, the colours,
 * the sentences, what Ready does, why the defeated shopper gets no countdown,
 * why the pill lives here and not inside the shop card — is in the pure
 * `prepCountdown.ts` next door, and is unit-tested headlessly. Read that file
 * first; this one just paints what it is told.
 *
 * MOUNTED BY HudRoot AS A SIBLING OF <MerchantShop/>, on purpose: the shop card
 * is closable, and a countdown that lives inside a closable card is invisible
 * exactly when it matters. prepCountdown.test.ts scans HudRoot's source to keep
 * it that way.
 */
import { useHud } from "../../net/RoomStore";
import { PANEL_BG, TEXT_DIM } from "../theme";
import { PREP_CLOCK_BOTTOM, prepClockView } from "./prepCountdown";

/**
 * `ggdPrepEnter` is the ANSWER TO 「進入要有倒數計時的畫面」: the pill rises into
 * place as the phase opens, so entering prep is visibly the start of a timer
 * rather than a number that was always sitting there. (The entry SOUND already
 * exists — the shop auto-opens on the same edge and plays `panelOpen`.)
 *
 * `ggdPrepPop` is the per-second beat of the urgent window. Scale only, on four
 * glyphs, 200 ms: it cannot move the layout and it cannot be mistaken for a
 * hit-flash. Both are @keyframes because a transform animation runs on the
 * compositor — this must never cost the 60 fps frame budget.
 */
const PREP_CSS =
  "@keyframes ggdPrepEnter{from{opacity:0;transform:translate(-50%,12px)}" +
  "to{opacity:1;transform:translate(-50%,0)}}" +
  "@keyframes ggdPrepPop{0%{transform:scale(1.16)}62%{transform:scale(0.99)}100%{transform:scale(1)}}";

export function PrepClock(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const secondsLeft = useHud((s) => s.phaseSecondsLeft);
  const ready = useHud((s) =>
    s.localSeatId === null ? false : (s.seats.find((v) => v.seatId === s.localSeatId)?.ready ?? false),
  );

  const view = prepClockView({ phase, secondsLeft, ready });
  if (!view.visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: PREP_CLOCK_BOTTOM,
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        padding: "6px 22px",
        borderRadius: 999,
        background: PANEL_BG,
        border: `1px solid ${view.color}55`,
        // informational chrome: it must never eat a click meant for the shop
        pointerEvents: "none",
        whiteSpace: "nowrap",
        animation: "ggdPrepEnter 420ms ease-out both",
      }}
    >
      <style>{PREP_CSS}</style>
      <div
        // the key IS the beat: a new whole second re-mounts the node and so
        // restarts the pop exactly once — snapshot-rate repeats keep the same
        // key and stay still.
        key={view.beat}
        style={{
          fontSize: 26,
          fontWeight: "bold",
          lineHeight: 1.1,
          color: view.color,
          fontVariantNumeric: "tabular-nums",
          textShadow: view.tone === "urgent" ? `0 0 12px ${view.color}66` : "none",
          animation: view.pulse ? "ggdPrepPop 200ms ease-out" : undefined,
        }}
      >
        {view.clock}
      </div>
      <div style={{ fontSize: 11, color: view.tone === "calm" ? TEXT_DIM : view.color }}>{view.label}</div>
    </div>
  );
}
