/**
 * tickHealth — the PROCESS-WIDE simulation health counter (task #272, plan
 * §1-1「伺服器 tick 健康度」).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * #46 fixed a real stall (the sim intermittently STOPPED TICKING mid-match)
 * with a catch-up clamp that SHEDS whole-tick backlog (match/tickLoop.ts). That
 * fix is correct, and it converted a loud failure into a silent one: instead of
 * freezing, the match now quietly skips sim time and carries on.
 *
 * The ONLY output of that shed was a single `console.warn` in
 * rooms/MatchRoom.ts. No counter, no metric, no endpoint. So the honest state of
 * the world before this module was: **if the server sheds ticks every minute we
 * would not know.** That is the gap the latency plan calls 「乙」, and it is the
 * one diagnosis that cannot be made from the client.
 *
 * Worse, that warn had NO throttle (unlike `onLoopFault`, three methods down in
 * the same file, which logs the first 5 then every 300th). A room that is
 * persistently behind would emit up to 60 lines/second — so the log is either
 * silent or unusable, and neither state answers the question.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY BOTH HALVES ARE NEEDED
 * ---------------------------------------------------------------------------
 * 1. SHEDS — how many shed EVENTS, how many whole TICKS they threw away, and
 *    when the last one was. This is the catastrophic-lateness signal.
 * 2. PER-TICK COST p50/p95/p99 — this is the signal that catches the shape the
 *    plan says is most likely: **not** a shed at all, but every tick running a
 *    little over budget and never reaching the clamp. MatchRoom drives the loop
 *    at `TICK_MS / 2` (~16.7 ms), so the accumulator must owe ~200 ms before a
 *    single shed is recorded. A room where every tick costs 40 ms against a
 *    33.3 ms budget is 20% behind real-time forever and sheds NOTHING. Counting
 *    sheds alone would report that room as perfectly healthy.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT MUST NOT BECOME THE COST
 * ---------------------------------------------------------------------------
 * `noteTick` runs inside the catch-up burst, up to MAX_CATCHUP_TICKS times per
 * frame per room. So it does ZERO allocation: durations land in a preallocated
 * ring buffer (`Float64Array`), and the percentile scratch buffer is allocated
 * once at construction, not per snapshot. The only per-tick cost at the call
 * site is two `performance.now()` reads.
 *
 * The ring is a ROLLING window over the whole process (all rooms interleaved),
 * not a per-room history: the question is "is this Node process keeping up",
 * and one room's stall starves every other room on the same event loop anyway.
 * `snapshot().window` names how many samples the percentiles were taken over so
 * the number is never read as more than it is.
 *
 * Placed beside `rooms/roomRegistry.ts` in spirit and shape: a pure class + a
 * process singleton + a `stats()`-style snapshot rendered by /healthz. That is
 * the third time this codebase has needed exactly this shape, so it copies it
 * rather than inventing a fourth.
 */

/**
 * The grep token. `/healthz` is the structured channel; this is the one for
 * `journalctl | grep`. It is a fixed, unique, machine-parseable prefix so
 * reading production logs for 「乙」 is ONE command with no guesswork:
 *
 *     ssh … 'docker logs ggd-game 2>&1 | grep ggd.tick.shed'
 *
 * The human sentence from #46 is kept at the end of the same line so the older
 * instruction in docs/_延遲改進計畫.md (grep `sim fell behind real-time`) still
 * finds it.
 */
export const TICK_SHED_LOG_TAG = "ggd.tick.shed";

/** Rolling per-tick-cost window. 512 × 8B = 4 KB, allocated once, forever. */
export const TICK_COST_WINDOW = 512;

/**
 * Log throttle, copied deliberately from `MatchRoom.onLoopFault`: the first few
 * in full, then every 300th (~10 s of a 30 Hz room). A persistent problem
 * leaves a trail without drowning the log — and the COUNTERS keep counting
 * every single event regardless of what got logged, which is exactly why the
 * counters had to exist before the throttle could be added.
 */
export const SHED_LOG_HEAD = 5;
export const SHED_LOG_EVERY = 300;

export interface TickHealthSnapshot {
  /** sim ticks executed since process start (across every room). */
  ticks: number;
  /** samples the percentiles below were computed over (<= TICK_COST_WINDOW). */
  window: number;
  /** per-tick cost percentiles over the rolling window, ms (0 with no samples). */
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** worst single tick since process start, ms. */
  maxMs: number;
  /** how many times the clamp shed backlog. */
  shedEvents: number;
  /** total whole sim ticks thrown away by those sheds. */
  shedTicks: number;
  /** wall-clock the sim silently skipped = shedTicks × tickMs, ms. */
  shedBehindMs: number;
  /** epoch ms of the most recent shed, or null when there has never been one. */
  lastShedAtMs: number | null;
  /** match id of the most recent shed, or null. */
  lastShedMatch: string | null;
  /** whole ticks the most recent shed threw away (0 when there has been none). */
  lastShedTicks: number;
}

export class TickHealth {
  private readonly costs = new Float64Array(TICK_COST_WINDOW);
  /** reused by `snapshot()` so percentile maths allocates nothing either. */
  private readonly scratch = new Float64Array(TICK_COST_WINDOW);
  private costCount = 0;
  private costIdx = 0;

  private tickCount = 0;
  private worstMs = 0;

  private shedEvents = 0;
  private shedTicks = 0;
  private shedBehindMs = 0;
  private lastShedAtMs: number | null = null;
  private lastShedMatch: string | null = null;
  private lastShedTicks = 0;
  private loggedSheds = 0;

  /**
   * Record one executed sim tick and what it cost. Called from inside the
   * catch-up burst — allocation-free by construction (see the module doc).
   * A non-finite / negative duration is counted as a tick but contributes no
   * sample, so a bad clock cannot poison the percentiles.
   */
  noteTick(durationMs: number): void {
    this.tickCount++;
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.costs[this.costIdx] = durationMs;
    this.costIdx = (this.costIdx + 1) % TICK_COST_WINDOW;
    if (this.costCount < TICK_COST_WINDOW) this.costCount++;
    if (durationMs > this.worstMs) this.worstMs = durationMs;
  }

  /**
   * Record one shed event (the clamp abandoned `ticks` whole sim ticks in
   * `matchId` at `nowEpochMs`). Returns whether THIS event should be logged —
   * the throttle lives here, next to the counter it protects, so a caller can
   * never accidentally ship an unthrottled log again (which is the bug this
   * module was written for).
   */
  noteShed(matchId: string, ticks: number, nowEpochMs: number, tickMs: number): boolean {
    const whole = Number.isFinite(ticks) && ticks > 0 ? Math.floor(ticks) : 0;
    this.shedEvents++;
    this.shedTicks += whole;
    this.shedBehindMs += whole * tickMs;
    this.lastShedAtMs = nowEpochMs;
    this.lastShedMatch = matchId;
    this.lastShedTicks = whole;
    if (this.loggedSheds < SHED_LOG_HEAD || this.shedEvents % SHED_LOG_EVERY === 0) {
      this.loggedSheds++;
      return true;
    }
    return false;
  }

  /** Operator-facing snapshot — rendered by /healthz beside `rooms`. */
  snapshot(): TickHealthSnapshot {
    const n = this.costCount;
    for (let i = 0; i < n; i++) this.scratch[i] = this.costs[i]!;
    // insertion sort over <= 512 numbers: no allocation, and `snapshot()` is
    // called by a health probe, never on the tick path.
    for (let i = 1; i < n; i++) {
      const v = this.scratch[i]!;
      let j = i - 1;
      while (j >= 0 && this.scratch[j]! > v) {
        this.scratch[j + 1] = this.scratch[j]!;
        j--;
      }
      this.scratch[j + 1] = v;
    }
    const pct = (p: number): number => {
      if (n === 0) return 0;
      const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
      return round3(this.scratch[idx]!);
    };
    return {
      ticks: this.tickCount,
      window: n,
      p50Ms: pct(50),
      p95Ms: pct(95),
      p99Ms: pct(99),
      maxMs: round3(this.worstMs),
      shedEvents: this.shedEvents,
      shedTicks: this.shedTicks,
      shedBehindMs: round3(this.shedBehindMs),
      lastShedAtMs: this.lastShedAtMs,
      lastShedMatch: this.lastShedMatch,
      lastShedTicks: this.lastShedTicks,
    };
  }

  /** Test-only: drop every counter (the process singleton never calls this). */
  reset(): void {
    this.costs.fill(0);
    this.costCount = 0;
    this.costIdx = 0;
    this.tickCount = 0;
    this.worstMs = 0;
    this.shedEvents = 0;
    this.shedTicks = 0;
    this.shedBehindMs = 0;
    this.lastShedAtMs = null;
    this.lastShedMatch = null;
    this.lastShedTicks = 0;
    this.loggedSheds = 0;
  }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * ONE fixed-format line. Every field is `key=value`, space separated, after a
 * unique tag — so `grep ggd.tick.shed` gives an operator the whole picture
 * (this event, the running totals, and the per-tick cost distribution that says
 * whether the room is merely late or genuinely overloaded) without opening a
 * dashboard. Kept pure so its shape is asserted by a test rather than by eye.
 */
export function formatShedLog(
  matchId: string,
  droppedTicks: number,
  s: TickHealthSnapshot,
): string {
  return (
    `[${TICK_SHED_LOG_TAG}] match=${matchId} shedTicks=${droppedTicks} ` +
    `shedEvents=${s.shedEvents} totalShedTicks=${s.shedTicks} behindMs=${s.shedBehindMs} ` +
    `tickP50Ms=${s.p50Ms} tickP99Ms=${s.p99Ms} tickMaxMs=${s.maxMs} window=${s.window} ` +
    "— sim fell behind real-time; shed tick backlog to avoid a loop stall"
  );
}

/** The process-wide counter MatchRoom feeds and /healthz reads. */
export const tickHealth = new TickHealth();
