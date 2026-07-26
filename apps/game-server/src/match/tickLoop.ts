/**
 * tickLoop — the fixed-timestep pacing math for the MatchRoom simulation loop,
 * extracted as a PURE function so the anti-stall behavior is unit-testable
 * without a live Colyseus room.
 *
 * ---------------------------------------------------------------------------
 * WHY (task #46): the sim intermittently STOPS TICKING mid-match
 * ---------------------------------------------------------------------------
 * MatchRoom drives the authoritative sim from a real-time accumulator:
 *
 *     accumulator += dtMs;
 *     while (accumulator >= TICK_MS) { accumulator -= TICK_MS; ctl.tick(); }
 *     projectSnapshot(...);
 *
 * The `while` had NO upper bound. A fixed-timestep loop with an unbounded
 * catch-up is the classic "spiral of death": the moment one frame runs slower
 * than the wall-clock it represents — a GC pause, an OS deschedule, a heavier
 * tick once combat + flowers + the fire ring + guardians are all live — the
 * accumulator grows, so the NEXT frame runs even more ticks, which takes even
 * longer, so it grows further… Each `loop()` invocation runs a longer and
 * longer synchronous burst that pins the Node event loop, and because the
 * snapshot is only projected AFTER the burst drains, NOTHING is broadcast for
 * the whole stretch. From the client the sim has frozen solid while its
 * renderer keeps extrapolating the last snapshot at 60fps — exactly the
 * reported symptom (3 sightings).
 *
 * THE FIX is the textbook one: CLAMP the number of ticks advanced per frame and
 * SHED the whole-tick backlog past the clamp. The server then runs at
 * real-time under load (the match slips a few ms behind rather than trying to
 * replay a stall it can never catch), always returns to project a snapshot, and
 * can never wedge.
 *
 * DETERMINISM IS UNAFFECTED. The sim advances in fixed TICK_MS steps regardless
 * of how many run per real frame; this math only decides WHEN they run in wall
 * time, and wall time is not part of the sim. Same-seed replay stays byte
 * identical (a replay drives the sim directly, not through this pacing at all).
 */

/**
 * Max sim ticks advanced per real animation frame. At TICK_MS≈33.3ms this is
 * ~167ms of catch-up per frame — ample headroom to ride out a GC pause or a
 * scheduling hiccup, while hard-bounding the synchronous work one `loop()`
 * invocation can do so the event loop is never starved of a snapshot.
 */
export const MAX_CATCHUP_TICKS = 5;

export interface TickPlan {
  /** fixed sim ticks to advance this frame (0..maxCatchup). */
  steps: number;
  /** accumulator carried into the next frame (always < tickMs). */
  accumulator: number;
  /**
   * true when the backlog exceeded the clamp and whole-tick debt was dropped —
   * i.e. the server fell behind real-time and shed the surplus to avoid a
   * spiral. The caller logs this (it is a health signal), it is NOT an error.
   */
  dropped: boolean;
  /**
   * HOW MANY whole ticks were shed (0 whenever `dropped` is false). Task #272.
   *
   * `dropped` alone cannot answer the only question an operator actually asks —
   * 「伺服器落後多少？」 — because one shed event may throw away one tick or a
   * hundred, and both read as `true`. This is the sim-time debt abandoned this
   * frame; × TICK_MS it is the wall-clock the match silently skipped.
   *
   * OBSERVATION ONLY. It is derived from the accumulator BEFORE the shed and
   * changes neither `steps` nor `accumulator` — #272 is explicitly forbidden
   * from touching the clamp's behaviour ("改行為要等有資料").
   */
  droppedTicks: number;
}

/**
 * Fold `dtMs` of elapsed wall-clock into `accumulator` and decide how many
 * fixed sim ticks to run this frame. Advances at most `maxCatchup` ticks and
 * sheds any whole-tick backlog beyond that (keeping only the sub-tick remainder
 * so pacing stays smooth), so the loop can never spiral. Pure: no clock, no
 * mutation, no I/O.
 */
export function planTicks(
  accumulator: number,
  dtMs: number,
  tickMs: number,
  maxCatchup: number = MAX_CATCHUP_TICKS,
): TickPlan {
  // Guard against a bad dt (negative / NaN from a paused-then-resumed timer):
  // treat it as no elapsed time rather than corrupting the accumulator.
  let acc = accumulator + (Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0);
  let steps = 0;
  while (acc >= tickMs && steps < maxCatchup) {
    acc -= tickMs;
    steps++;
  }
  // Spiral guard: if we hit the clamp and still owe a full tick or more, the
  // server is behind real-time. Drop the whole-tick debt (run at real-time from
  // here) and keep only the sub-tick remainder — replaying the debt would only
  // fall further behind and pin the event loop, the very stall we prevent.
  let dropped = false;
  let droppedTicks = 0;
  if (acc >= tickMs) {
    // The count is derived from the SAME `%` the shed performs, so it can never
    // disagree with what was actually thrown away: `acc − rem` is an exact
    // multiple of tickMs, and rounding it removes float noise (a plain
    // `Math.floor(acc / tickMs)` reports 24 for a 1-second stall at 33.333ms
    // because 25 × TICK_MS lands a whole ulp above the accumulator).
    // Purely observational (task #272) — `acc` is reduced by exactly the same
    // `%` as before, so the pacing is bit-for-bit unchanged.
    const rem = acc % tickMs;
    droppedTicks = Math.round((acc - rem) / tickMs);
    acc = rem;
    dropped = true;
  }
  return { steps, accumulator: acc, dropped, droppedTicks };
}
