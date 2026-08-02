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
import { INTERMISSION_Z } from "./intermissionLayout";
import {
  PREP_CLOCK_BOTTOM,
  PREP_CLOCK_TOP_WHEN_DRAFTING,
  isCompactClock,
  prepClockView,
} from "./prepCountdown";

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

  // Same signal AugmentDraftPanel gates on. When a draft owns the screen the
  // pill moves to the top edge instead of sitting on the cards — see
  // PREP_CLOCK_TOP_WHEN_DRAFTING for why moving beats hiding.
  const drafting = useHud((s) => {
    if (s.localSeatId === null) return false;
    return (s.seats.find((v) => v.seatId === s.localSeatId)?.offers ?? []).length > 0;
  });

  const view = prepClockView({ phase, secondsLeft, ready });
  if (!view.visible) return null;

  // On a phone in landscape the card stack very nearly IS the screen, so the
  // only non-card region is the panel's own header. Shrink to fit it rather
  // than pretend a gap exists.
  // ⚠️ `isCompactClock` 是純函式，不是 hook —— 所以它待在 early return 之後
  // 是安全的。它原本叫 `useCompactClock`，那個名字讓這一行讀起來就是
  // 2026-08-02 的 T0 形狀（見 ui/hud/hookOrder.test.ts）。名字改掉之後，
  // 哪天真的有人想在裡面放 hook，`react-hooks/rules-of-hooks` 會在那一刻紅。
  const compact = drafting && isCompactClock(typeof window === "undefined" ? 1080 : window.innerHeight);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        ...(drafting ? { top: compact ? 6 : PREP_CLOCK_TOP_WHEN_DRAFTING } : { bottom: PREP_CLOCK_BOTTOM }),
        transform: "translateX(-50%)",
        // THE ONE SURFACE THAT RIDES OVER A FOCUS SCRIM (playtest P2, priority
        // 2 in panels/intermissionLayout.ts). While the 三選一 draft owns the
        // screen everything else is demoted behind its scrim — but hiding the
        // clock would demand an answer while hiding how long there is to give
        // it. Costs the draft nothing: this pill is pointerEvents:none.
        zIndex: INTERMISSION_Z.deadline,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        padding: compact ? "2px 12px" : "6px 22px",
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
          fontSize: compact ? 17 : 26,
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
