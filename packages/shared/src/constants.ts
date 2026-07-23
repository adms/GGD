/** Global, engine-wide constants shared by server, client, and tools. */

/** Authoritative simulation tick rate (Hz). */
export const TICK_HZ = 30;
/** Milliseconds per authoritative tick. */
export const TICK_MS = 1000 / TICK_HZ;
/**
 * Network snapshot broadcast rate (Hz) — the Colyseus patch rate.
 *
 * This is TRANSPORT, not simulation: the sim always steps at TICK_HZ and is
 * byte-identical regardless of how often we serialize it. Raising this to
 * TICK_HZ means every authoritative tick is broadcast, so the client's
 * interpolation brackets span exactly one tick.
 *
 * LOAD-BEARING PAIRING with INTERP_DELAY_MS: the interpolation buffer needs
 * whole snapshot intervals of headroom, so these two move TOGETHER. See
 * INTERP_INTERVALS_OF_HEADROOM below.
 *
 * NOTE: MatchRoom must actually ASSIGN `this.patchRate = SNAPSHOT_MS`. Before
 * task-latency-01 nothing did, and the 20 Hz was silently coming from
 * Colyseus's own DEFAULT_PATCH_RATE (1000/20) rather than from this constant.
 */
export const SNAPSHOT_HZ = 30;
/** Milliseconds between snapshots. */
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

/** 4 teams of 3 = 12 seats. */
export const TEAM_COUNT = 4;
export const TEAM_SIZE = 3;
export const SEAT_COUNT = TEAM_COUNT * TEAM_SIZE;

/** How many ticks the AI brain waits between full re-plans. */
export const AI_REPLAN_INTERVAL_TICKS = 6;

/**
 * Remote-entity interpolation delay (ms) — render remotes this far in the past.
 *
 * Sized in SNAPSHOT INTERVALS, not in milliseconds. The InterpolationBuffer
 * never extrapolates (see apps/client/src/net/InterpolationBuffer.ts): once the
 * render clock passes the newest sample it CLAMPS and the remote FREEZES in
 * place until the next patch lands, then resumes. Two intervals of cushion is
 * what lets one dropped/late packet pass unnoticed.
 *
 *   before: 100 ms / 50.00 ms = 2.00 intervals
 *   after:   66 ms / 33.33 ms = 1.98 intervals   (same cushion, 34 ms sooner)
 *
 * 66 is the owner-approved round number; the arithmetically exact two-interval
 * value is 66.67. The 0.67 ms shortfall is ~2% of one interval and far below
 * the LAN jitter it is buffering against, but do not shave it further —
 * INTERP_INTERVALS_OF_HEADROOM is asserted >= 1.95 by the constants test.
 */
export const INTERP_DELAY_MS = 66;

/**
 * How many whole snapshot intervals of cushion the interpolation buffer has.
 * Derived, never hand-written: if someone lowers INTERP_DELAY_MS or the
 * snapshot rate in isolation this number drops and the guard test fails.
 */
export const INTERP_INTERVALS_OF_HEADROOM = INTERP_DELAY_MS / SNAPSHOT_MS;
