/**
 * autoScroll — PURE, DOM-free math + driver for "reveal a row in a long list by
 * scrolling to it for the player" (task #36). Built for the post-match flow:
 *
 *   settlement 本場排名  — the list appears pinned at RANK 1, holds ~0.9 s so the
 *                          top of the board is readable, then eases down until
 *                          the local player's row sits CENTERED, then pulses it.
 *   排位榜 (post-match)  — same behaviour on the ladder the "查看戰績變化" jump
 *                          lands on, with a longer duration cap (that board is
 *                          much taller).
 *
 * Nothing here imports React or touches `document`: geometry in, plan out, and a
 * driver that talks to a structurally-typed `AutoScrollTarget` (an HTMLElement
 * satisfies it) plus injected clock/frame callbacks. That keeps every rule —
 * centering math, end clamping, skip-when-visible, easing, cancel-on-input,
 * reduced motion, once-per-match — unit-testable in the node vitest env.
 * `useAutoScrollToRow` is the thin React/DOM shell over this.
 */

// ---------------------------------------------------------------- constants ---

/** Hold at the top (rank 1) before the scroll starts (ms). */
export const DEFAULT_HOLD_MS = 900;
/** Floor on the travel duration (ms) — a short hop still reads as a move. */
export const DEFAULT_MIN_DURATION_MS = 1500;
/** Ceiling on the travel duration (ms) for the per-match ranking list. */
export const DEFAULT_MAX_DURATION_MS = 2500;
/** Ceiling for the (much taller) post-match ladder — never crawl for 10 s. */
export const LEADERBOARD_MAX_DURATION_MS = 3000;
/** Nominal travel speed (px per ms) before the min/max clamp. */
export const DEFAULT_PX_PER_MS = 0.4;
/** Travel below this many px is not worth animating. */
export const MIN_TRAVEL_PX = 1;
/** Sub-pixel slack when deciding whether a row is fully visible. */
const VISIBLE_EPS = 0.5;

// ----------------------------------------------------------------- geometry ---

/** Everything the plan needs about a scrollable list and the row to reveal. */
export interface RowScrollGeometry {
  /** Row top edge measured from the top of the scrollable CONTENT (px). */
  rowTop: number;
  rowHeight: number;
  /** Visible height of the scroll viewport (element.clientHeight). */
  viewportHeight: number;
  /** Total content height (element.scrollHeight). */
  contentHeight: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** 0..1 clamp. */
export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** Symmetric ease-in-out (cubic): gentle start, gentle stop. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** The largest legal scrollTop for a list (0 when it does not overflow). */
export function maxScrollTop(g: RowScrollGeometry): number {
  return Math.max(0, g.contentHeight - g.viewportHeight);
}

/**
 * scrollTop that puts the row's CENTER on the viewport's center, clamped to
 * both ends of the list — so rank 1 never scrolls above the top and the last
 * row never scrolls past the bottom (it just rests as low as the list allows).
 */
export function centeredScrollTop(g: RowScrollGeometry): number {
  const ideal = g.rowTop + g.rowHeight / 2 - g.viewportHeight / 2;
  return clamp(ideal, 0, maxScrollTop(g));
}

/** Whether the whole row is inside the viewport at the given scroll offset. */
export function isRowFullyVisible(g: RowScrollGeometry, scrollTop: number): boolean {
  return (
    g.rowTop >= scrollTop - VISIBLE_EPS &&
    g.rowTop + g.rowHeight <= scrollTop + g.viewportHeight + VISIBLE_EPS
  );
}

/**
 * Travel time for `distance` px: linear in the distance at `pxPerMs`, clamped
 * into [minMs, maxMs]. Monotonic — a longer scroll is never quicker.
 */
export function scrollDurationMs(
  distance: number,
  opts: { minMs?: number; maxMs?: number; pxPerMs?: number } = {},
): number {
  const minMs = opts.minMs ?? DEFAULT_MIN_DURATION_MS;
  const maxMs = Math.max(minMs, opts.maxMs ?? DEFAULT_MAX_DURATION_MS);
  const pxPerMs = opts.pxPerMs ?? DEFAULT_PX_PER_MS;
  const d = Math.abs(distance);
  if (!(d > 0) || !(pxPerMs > 0)) return minMs;
  return Math.round(clamp(d / pxPerMs, minMs, maxMs));
}

// --------------------------------------------------------------------- plan ---

/** Row already readable where the list sits — highlight only, never scroll. */
export interface SkipPlan {
  kind: "skip";
  scrollTop: number;
}
/** prefers-reduced-motion: land on the final offset immediately, no animation. */
export interface JumpPlan {
  kind: "jump";
  scrollTop: number;
}
/** Hold at `from` for `holdMs`, then ease to `to` over `durationMs`. */
export interface AnimateScrollPlan {
  kind: "animate";
  from: number;
  to: number;
  holdMs: number;
  durationMs: number;
}
export type AutoScrollPlan = SkipPlan | JumpPlan | AnimateScrollPlan;

export interface AutoScrollPlanOptions {
  /** Where the list starts; defaults to 0 = pinned at rank 1. */
  startScrollTop?: number;
  holdMs?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  pxPerMs?: number;
  /** OS "reduce motion" preference → the jump plan. */
  reducedMotion?: boolean;
}

/**
 * Decide what to do for one list + row. Order matters:
 *   1. reduced motion  → jump straight to the centered offset (static highlight),
 *   2. row already fully visible from the start offset (small list / top rank)
 *      or the travel is sub-pixel → skip (pulse only),
 *   3. otherwise animate: hold at the start, then ease to centered.
 */
export function planRowAutoScroll(
  g: RowScrollGeometry,
  opts: AutoScrollPlanOptions = {},
): AutoScrollPlan {
  const to = centeredScrollTop(g);
  const from = clamp(opts.startScrollTop ?? 0, 0, maxScrollTop(g));

  if (opts.reducedMotion === true) return { kind: "jump", scrollTop: to };
  if (isRowFullyVisible(g, from) || Math.abs(to - from) < MIN_TRAVEL_PX) {
    return { kind: "skip", scrollTop: from };
  }

  const durationOpts: { minMs?: number; maxMs?: number; pxPerMs?: number } = {};
  if (opts.minDurationMs !== undefined) durationOpts.minMs = opts.minDurationMs;
  if (opts.maxDurationMs !== undefined) durationOpts.maxMs = opts.maxDurationMs;
  if (opts.pxPerMs !== undefined) durationOpts.pxPerMs = opts.pxPerMs;

  return {
    kind: "animate",
    from,
    to,
    holdMs: Math.max(0, opts.holdMs ?? DEFAULT_HOLD_MS),
    durationMs: scrollDurationMs(to - from, durationOpts),
  };
}

// ------------------------------------------------------------------- runner ---

export type AutoScrollPhase = "idle" | "holding" | "scrolling" | "arrived" | "cancelled";

/**
 * Time-stepped animation state. `frame(now)` returns the scrollTop to apply, or
 * null once the run is over (arrived / cancelled / not started) — so a caller
 * can drive it from requestAnimationFrame, a test can drive it from an array of
 * timestamps, and both see identical output.
 */
export class AutoScrollRun {
  private phaseValue: AutoScrollPhase = "idle";
  private startedAt = 0;

  constructor(readonly plan: AnimateScrollPlan) {}

  get phase(): AutoScrollPhase {
    return this.phaseValue;
  }

  /** Still animating (started, not arrived, not cancelled). */
  get running(): boolean {
    return this.phaseValue === "holding" || this.phaseValue === "scrolling";
  }

  get arrived(): boolean {
    return this.phaseValue === "arrived";
  }

  /** Total wall time of the run (hold + travel), ms. */
  get totalMs(): number {
    return this.plan.holdMs + this.plan.durationMs;
  }

  start(nowMs: number): void {
    if (this.phaseValue !== "idle") return;
    this.startedAt = nowMs;
    this.phaseValue = "holding";
  }

  /** scrollTop for this instant, or null when there is nothing to apply. */
  frame(nowMs: number): number | null {
    if (!this.running) return null;
    const elapsed = Math.max(0, nowMs - this.startedAt);
    const { from, to, holdMs, durationMs } = this.plan;
    if (elapsed < holdMs) {
      this.phaseValue = "holding";
      return from;
    }
    const t = durationMs > 0 ? clamp01((elapsed - holdMs) / durationMs) : 1;
    if (t >= 1) {
      this.phaseValue = "arrived";
      return to;
    }
    this.phaseValue = "scrolling";
    return from + (to - from) * easeInOutCubic(t);
  }

  /** User took over (or the view went away): stop for good. Idempotent. */
  cancel(): void {
    if (this.phaseValue === "arrived") return;
    this.phaseValue = "cancelled";
  }
}

// ------------------------------------------------------------ cancel inputs ---

/**
 * Pointer/touch/wheel events that mean "the player is scrolling this list
 * themselves". `keydown` is filtered further by isScrollCancelKey.
 */
export const CANCEL_EVENT_TYPES = [
  "wheel",
  "touchstart",
  "touchmove",
  "pointerdown",
  "mousedown",
] as const;

/** Keys that scroll a list — typing an unrelated key must NOT cancel. */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
]);

/** Whether a keydown is a scroll gesture (arrows / page / home-end / space). */
export function isScrollCancelKey(key: string): boolean {
  return SCROLL_KEYS.has(key);
}

/** Whether an observed event should cancel the auto-scroll for good. */
export function shouldCancelForEvent(type: string, key?: string): boolean {
  if (type === "keydown") return key !== undefined && isScrollCancelKey(key);
  return (CANCEL_EVENT_TYPES as readonly string[]).includes(type);
}

// -------------------------------------------------------------- once guard ---

/**
 * "Exactly once per match": claim(key) is true the FIRST time a given non-null
 * key is seen and false forever after (including after a cancel — a cancelled
 * auto-scroll never re-triggers for that match). A null key re-arms the guard,
 * which is how the next match gets its own single shot.
 */
export class OnceGuard {
  private claimed: string | null = null;

  claim(key: string | null): boolean {
    if (key === null) {
      this.claimed = null;
      return false;
    }
    if (this.claimed === key) return false;
    this.claimed = key;
    return true;
  }

  /** The key currently held (null when disarmed). Test/debug aid. */
  get held(): string | null {
    return this.claimed;
  }
}

// ------------------------------------------------------------------ driver ---

/** Listener shape the driver registers (a plain DOM-style event handler). */
export type ScrollEventListener = (event: Event) => void;

/** Minimal listener surface — `window` and any HTMLElement satisfy this. */
export interface EventTargetLike {
  addEventListener(type: string, listener: ScrollEventListener, options?: unknown): void;
  removeEventListener(type: string, listener: ScrollEventListener, options?: unknown): void;
}

/** The scrollable list itself: a settable scrollTop + listeners. */
export interface AutoScrollTarget extends EventTargetLike {
  scrollTop: number;
}

export interface AutoScrollDeps {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(handle: number): void;
  /** Extra target for keyboard scrolls (the window, typically). */
  keyTarget?: EventTargetLike | null;
  /** Fired once when the row lands centered (drives the highlight pulse). */
  onArrive?: () => void;
  /** Fired once if the player takes over the scroll. */
  onCancel?: () => void;
}

/**
 * Drive `plan` on `target`. Attaches the cancel listeners, steps the run from
 * the injected frame callback, and returns a stop() that is safe to call any
 * number of times (React effect cleanup calls it on unmount).
 */
export function runAutoScroll(
  target: AutoScrollTarget,
  plan: AnimateScrollPlan,
  deps: AutoScrollDeps,
): () => void {
  const run = new AutoScrollRun(plan);
  let frameHandle: number | null = null;
  let stopped = false;

  const detach = (): void => {
    for (const type of CANCEL_EVENT_TYPES) target.removeEventListener(type, onInput);
    target.removeEventListener("keydown", onKey);
    deps.keyTarget?.removeEventListener("keydown", onKey);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (frameHandle !== null) deps.cancelFrame(frameHandle);
    frameHandle = null;
    detach();
  };

  function onInput(): void {
    if (stopped || !run.running) return;
    run.cancel();
    stop();
    deps.onCancel?.();
  }

  function onKey(event: Event): void {
    const key = (event as Partial<KeyboardEvent>).key;
    if (!shouldCancelForEvent("keydown", key)) return;
    onInput();
  }

  for (const type of CANCEL_EVENT_TYPES) {
    target.addEventListener(type, onInput, { passive: true });
  }
  target.addEventListener("keydown", onKey);
  deps.keyTarget?.addEventListener("keydown", onKey);

  const step = (): void => {
    frameHandle = null;
    if (stopped) return;
    const value = run.frame(deps.now());
    if (value !== null) target.scrollTop = value;
    if (run.running) {
      frameHandle = deps.requestFrame(step);
      return;
    }
    const landed = run.arrived;
    stop();
    if (landed) deps.onArrive?.();
  };

  // pin to the top (rank 1) before the first frame so the hold is visible even
  // if the list was already scrolled by a previous render.
  target.scrollTop = plan.from;
  run.start(deps.now());
  frameHandle = deps.requestFrame(step);

  return stop;
}
