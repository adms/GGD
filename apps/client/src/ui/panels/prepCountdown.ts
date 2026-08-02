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

/**
 * Where the pill sits WHILE A 三選一 DRAFT OWNS THE SCREEN.
 *
 * Priority 2 in intermissionLayout.ts is right that the clock must stay visible
 * over the focus scrim — a scrim that hides the deadline tells the player
 * "answer this" while hiding how long they have. What it got wrong is the
 * sentence after: "costs the focus surface nothing: this pill is
 * pointerEvents:none". pointerEvents:none buys the draft its CLICKS back. It
 * does not buy back the pixels. AugmentDraftPanel is centred (`top: 50%`,
 * `translate(-50%, -50%)`, width 460) and the pill was centred at
 * `bottom: 262` — which lands inside the panel's lower half and covered the
 * middle weapon card's name and description outright. The owner hit it on a
 * real draft: 「倒數擋到了」.
 *
 * So the clock keeps its z-index and moves instead. Pinned to the TOP edge, it
 * clears a vertically-centred panel on any viewport where that panel fits at
 * all, and it stays the most legible thing on screen.
 */
export const PREP_CLOCK_TOP_WHEN_DRAFTING = 12;

/** The draft panel's header band — title + 三選一 label, no card content. */
export const DRAFT_HEADER_HEIGHT = 44;

/** Half the draft panel's declared width (AugmentDraftPanel `width: 460`). */
const DRAFT_PANEL_WIDTH = 460;

/**
 * The pill's box and the draft panel's box, in CSS pixels, for a viewport.
 * Exported so the test can assert they do not intersect rather than eyeballing
 * a screenshot — the way this collision reached a live match in the first place.
 */
export const PILL_FULL = { w: 150, h: 56 } as const;

/**
 * The COMPACT pill: the number alone, no 「備戰時間」 caption, sized to fit
 * inside DRAFT_HEADER_HEIGHT.
 *
 * Needed because on a phone in landscape the panel does not merely sit in the
 * middle of the screen, it very nearly IS the screen: a 420–460 px card stack on
 * a 390 px viewport fills it top to bottom. There is no band above, none below,
 * and none beside. The only region that is not a card is the panel's own header,
 * so on those viewports the clock shrinks to fit there rather than pretending a
 * gap exists.
 */
export const PILL_COMPACT = { w: 92, h: 30 } as const;

/**
 * True when the draft leaves no room for the full pill outside the cards.
 *
 * Two callers, deliberately the same predicate: the geometry test knows the
 * panel's height and passes it, while the component cannot measure the panel
 * before laying itself out and passes the viewport instead. A viewport shorter
 * than COMPACT_VIEWPORT_H cannot hold a centred card stack AND a 56 px pill
 * clear of it — that is the phone-landscape case #151 already established as
 * the tight one — so the component's proxy is sound where it matters and errs
 * toward compact, which is never wrong, only smaller.
 */
export const COMPACT_VIEWPORT_H = 560;

/**
 * ⚠️ 名字不能以 `use` 開頭 —— 這是一個**純函式**，不是 React hook。
 *
 * 它原本叫 `useCompactClock`，而 `PrepClock` 在一個 `return null` **之後**
 * 才呼叫它。那正是 2026-08-02 讓整個 HUD 消失四個版本的形狀
 * （見 `ui/hud/hookOrder.test.ts` 的檔頭）—— 只是這一支剛好裡面沒有 hook，
 * 所以還沒炸。今天補上的 `react-hooks/rules-of-hooks` 兩處都報了它。
 *
 * 改名不是為了讓 linter 閉嘴：只要它還叫 `use*`，任何人哪天在裡面加一個
 * `useState`（很合理 —— 「量一下 viewport」本來就想變成 hook），
 * 這一支就會在條件式後面多長出 hook，重演同一個 T0。
 */
export function isCompactClock(vh: number, panelHeight = 0): boolean {
  if (panelHeight <= 0) return vh < COMPACT_VIEWPORT_H;
  const panelTop = (vh - Math.min(panelHeight, vh)) / 2;
  return panelTop < PREP_CLOCK_TOP_WHEN_DRAFTING + PILL_FULL.h;
}

export function prepClockRect(
  vw: number,
  vh: number,
  drafting: boolean,
  panelHeight = 0,
): { top: number; bottom: number; left: number; right: number } {
  const compact = drafting && isCompactClock(vh, panelHeight);
  const pill = compact ? PILL_COMPACT : PILL_FULL;
  const top = drafting
    ? compact
      ? (DRAFT_HEADER_HEIGHT - pill.h) / 2 + (vh - Math.min(panelHeight, vh)) / 2
      : PREP_CLOCK_TOP_WHEN_DRAFTING
    : vh - PREP_CLOCK_BOTTOM - pill.h;
  return { top, bottom: top + pill.h, left: (vw - pill.w) / 2, right: (vw + pill.w) / 2 };
}

/**
 * The draft panel's HEADER band — title + 三選一 label, no card content.
 *
 * The contract is not "the clock may not touch the panel". On a phone in
 * landscape (390 px tall) a centred 320–460 px panel leaves ~35 px above and
 * below, and a 56 px pill fits in neither: there is nowhere on that screen that
 * clears the panel, so demanding it would be demanding the impossible and the
 * only way to satisfy it would be to hide the clock — the exact thing priority 2
 * forbids.
 *
 * What actually matters is that the pill never covers a CARD, because a card is
 * what the player has to read to answer. Landing on the header costs a title
 * they have already read. So the guard is written against the card grid, and
 * this band is explicitly conceded.
 */
/** The centred draft panel's box, given the height it renders at. */
export function draftPanelRect(
  vw: number,
  vh: number,
  panelHeight: number,
): { top: number; bottom: number; left: number; right: number } {
  const w = Math.min(DRAFT_PANEL_WIDTH, vw * 0.92);
  return {
    top: (vh - panelHeight) / 2,
    bottom: (vh + panelHeight) / 2,
    left: (vw - w) / 2,
    right: (vw + w) / 2,
  };
}

/** The panel minus its header — the region the clock must never cover. */
export function draftCardGridRect(
  vw: number,
  vh: number,
  panelHeight: number,
): { top: number; bottom: number; left: number; right: number } {
  const panel = draftPanelRect(vw, vh, panelHeight);
  return { ...panel, top: panel.top + DRAFT_HEADER_HEIGHT };
}

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
   * what restarts the CSS animation exactly once per tick — a snapshot-rate
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
