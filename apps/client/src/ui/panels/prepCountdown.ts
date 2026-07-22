/**
 * prepCountdown — the PURE decision for what the player SEES about the prep
 * window's clock (task #95). The audio half already existed: task #30 built the
 * last-5s bells for champ select and task #38 added `intermission` to
 * `COUNTDOWN_PHASES`, so the prep window has rung for a while. What was missing
 * is the picture — 「shop 頁面也是有限時，一樣進入要有倒數計時的畫面跟音效提示」.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PREP CLOCK IS NOT CHAMP SELECT'S CLOCK
 * ---------------------------------------------------------------------------
 * Champ select's deadline is UNFORGIVING and fires ONCE per match: run it out
 * and you are handed a random champion for the next twenty minutes. The prep
 * window's deadline is SOFT and fires EVERY ROUND: run it out and you simply
 * stop shopping, keep your gold, and fight. Cloning champ select's intensity
 * six to ten times a match is crying wolf — by round three the player has
 * learned the alarm means nothing, which is worse than no alarm at all.
 *
 * So the escalation is a RAMP, and the loud part is short:
 *
 *   > 10 s   calm       plain clock. It is just information.
 *   10 → 6 s warn       gold. COLOUR ONLY: no motion, no sound. The shop is a
 *                       reading task — a player mid-sentence in an item
 *                       tooltip gets a beat to finish it before the bells.
 *   5 → 1 s  urgent     red, the number pops once per second, and the existing
 *                       countTick / countFinal bells ring. Same 5 s window as
 *                       the audio (PREP_URGENT_SEC IS COUNTDOWN_LEAD_SEC — one
 *                       constant, so eye and ear can never disagree).
 *   any time committed  green, no pop, no bells: you pressed Ready.
 *
 * TOLERABLE ON ROUND SIX, by construction:
 *   - nothing NEW appears at 5 s. The pill is on screen from the moment the
 *     phase starts, so the escalation is a change of colour in something the
 *     eye has already filed away — never a jump scare.
 *   - no screen flash, no shake, no vignette, no layout movement. The pop is a
 *     1.14x scale on four glyphs.
 *   - it self-limits: a player who readies early sees the calm green state for
 *     the rest of the window, and readying early is what experienced players do.
 *
 * ---------------------------------------------------------------------------
 * THE CARD MAY BE CLOSED — SO THE CLOCK DOES NOT LIVE IN THE CARD
 * ---------------------------------------------------------------------------
 * The shop card is closable and the player may be watching the merchant scene
 * instead; before this task the CLOSED state showed no time at all, so the
 * countdown would have been invisible exactly when it mattered. Two surfaces,
 * one module:
 *
 *   prepClockView()  → the standing pill, mounted by HudRoot as a SIBLING of
 *                      MerchantShop. It knows nothing about the card and the
 *                      card cannot hide it. This is the countdown.
 *   shopClockChip()  → the small line inside the shop card's header AND on the
 *                      closed re-open button, so the shop's own chrome agrees
 *                      with the pill instead of drifting from it.
 *
 * WHY THE PILL SITS ABOVE THE READY BUTTON, not next to PhaseTimer.
 * `components/PhaseTimer.tsx` is generic top-centre chrome that reads as a
 * stopwatch for whatever phase is running — it says the same number in combat,
 * in resolution, at match end. This pill says something PhaseTimer never says:
 * "the clock and the Ready button are one decision — spend the time, or end it
 * early". That is why it is pinned to the Ready button rather than to the
 * match clock, and why the mild redundancy between the two is deliberate.
 *
 * ---------------------------------------------------------------------------
 * THE DEFEATED SHOPPER DOES NOT GET A COUNTDOWN
 * ---------------------------------------------------------------------------
 * A champion already down this round keeps the shop through COMBAT
 * (「本回合已陣亡 · 回合結束前仍可採購」, see shopGate). It is tempting to count
 * that phase down too — but their deadline is NOT the combat clock. The round
 * usually ends when the last enemy dies, at an unknowable moment; combat
 * expiring on time is the rare draw-on-HP case. A countdown there would be
 * counting down to something that normally does not happen, i.e. a lie. They
 * get the honest sentence and no clock, no colour ramp, no bells — which is
 * also why `combat` is (still) not in COUNTDOWN_PHASES.
 *
 * Pure + node-testable: no React, no DOM, no store.
 */
import { COUNTDOWN_LEAD_SEC } from "../../audio/countdownCue";
import { GOLD, TEXT_DIM } from "../theme";

/**
 * Seconds at or below which the countdown is URGENT — red, pulsing, audible.
 * Deliberately the audio's own window: one constant means the picture and the
 * bells start together, and a future retune moves both.
 */
export const PREP_URGENT_SEC = COUNTDOWN_LEAD_SEC;

/** Seconds at or below which the clock turns gold — colour only, still silent. */
export const PREP_WARN_SEC = 10;

/** The phase the pill belongs to (the prep window; NOT combat — see module doc). */
export const PREP_PHASE = "intermission";

export type PrepClockTone = "calm" | "warn" | "urgent" | "committed";

/** Text colour per tone. `committed` matches ReadyButton's own ready green. */
export const PREP_TONE_COLOR: Record<PrepClockTone, string> = {
  calm: "#cfd8ea",
  warn: GOLD,
  urgent: "#ff6a5a",
  committed: "#7fd898",
};

/** The sentence under the clock — what the player should DO with this number. */
export const PREP_TONE_LABEL: Record<PrepClockTone, string> = {
  calm: "備戰時間 · 買完可按 Ready 提前開打",
  warn: "時間快到了 · 準備開打",
  urgent: "即將開打",
  committed: "已準備 · 等待其他玩家",
};

/**
 * Geometry. NOT a hudLayout slot: task #42's registry models the four CORNERS,
 * and this is centre-bottom chrome like PhaseTimer / ReadyButton /
 * AugmentDraftPanel, none of which claim a corner either. It takes no corner
 * space, so registering it would mean inventing a fifth "corner" for one panel.
 *
 * `ReadyButton` pins its block at `bottom: 190`; that block is a
 * ~40 px button + 4 px gap + a ~15 px 「n/m ready」 counter ≈ 60 px tall, so the
 * pill's own bottom edge must clear 250. 262 leaves ~12 px of air.
 * prepCountdown.test.ts asserts the two bands do not touch.
 */
export const READY_BLOCK_BOTTOM = 190;
export const READY_BLOCK_HEIGHT = 60;
export const PREP_CLOCK_BOTTOM = 262;

export interface PrepClockInput {
  /** HUD store `phase` */
  phase: string;
  /** HUD store `phaseSecondsLeft` (whole seconds) */
  secondsLeft: number;
  /** the local seat has pressed Ready */
  ready: boolean;
}

export interface PrepClockView {
  /** render the pill at all? False outside the prep window. */
  visible: boolean;
  /** whole seconds remaining, clamped at 0 */
  seconds: number;
  /** the clock face, m:ss */
  clock: string;
  tone: PrepClockTone;
  color: string;
  label: string;
  /** does the number pop this second? (urgent window only, never after Ready) */
  pulse: boolean;
  /**
   * Re-mount key for the pulsing number. Changing it once per whole second is
   * what restarts the CSS animation exactly once per tick — a 20 Hz snapshot
   * repeat or a React re-render keeps the same key and never re-pops.
   */
  beat: number;
}

/** m:ss, the same shape PhaseTimer uses, so the two clocks read identically. */
export function prepClockFace(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Which band of the ramp a given second is in (before the Ready override). */
export function prepTone(secondsLeft: number, ready: boolean): PrepClockTone {
  if (ready) return "committed";
  const s = Math.max(0, Math.floor(Number.isFinite(secondsLeft) ? secondsLeft : 0));
  if (s <= PREP_URGENT_SEC) return "urgent";
  if (s <= PREP_WARN_SEC) return "warn";
  return "calm";
}

/**
 * The standing prep pill. Visible for the WHOLE window — the user asked for a
 * countdown on ENTRY, not a jump scare at the end — and completely independent
 * of whether the shop card is open, closed, or was never opened.
 */
export function prepClockView(input: PrepClockInput): PrepClockView {
  const seconds = Math.max(0, Math.floor(Number.isFinite(input.secondsLeft) ? input.secondsLeft : 0));
  const tone = prepTone(seconds, input.ready);
  return {
    visible: input.phase === PREP_PHASE,
    seconds,
    clock: prepClockFace(seconds),
    tone,
    color: PREP_TONE_COLOR[tone],
    label: PREP_TONE_LABEL[tone],
    // 0 s holds the red but stops moving: the phase is over, there is nothing
    // left to hurry for, and a pop landing on the scene cut looks like a glitch.
    pulse: tone === "urgent" && seconds >= 1,
    beat: seconds,
  };
}

export interface ShopClockChip {
  text: string;
  color: string;
}

/**
 * The shop card's own time line — header when open, a chip above the re-open
 * button when closed. Same numbers and same colours as the pill, so the two can
 * never drift; the defeated-in-combat branch deliberately carries NO clock.
 */
export function shopClockChip(input: PrepClockInput): ShopClockChip {
  if (input.phase !== PREP_PHASE) {
    // combat, for a champion already down this round: the deadline is the last
    // enemy dying, not this clock (module doc). Say so, and show no number.
    return { text: "陣亡中 · 可繼續採購", color: TEXT_DIM };
  }
  const view = prepClockView(input);
  const prefix = view.tone === "committed" ? "已準備" : "備戰時間";
  return { text: `${prefix} ${view.clock}`, color: view.color };
}
