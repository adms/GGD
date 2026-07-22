/** Global, engine-wide constants shared by server, client, and tools. */

/** Authoritative simulation tick rate (Hz). */
export const TICK_HZ = 30;
/** Milliseconds per authoritative tick. */
export const TICK_MS = 1000 / TICK_HZ;
/** Network snapshot broadcast rate (Hz). */
export const SNAPSHOT_HZ = 20;
/** Milliseconds between snapshots. */
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

/** 4 teams of 3 = 12 seats. */
export const TEAM_COUNT = 4;
export const TEAM_SIZE = 3;
export const SEAT_COUNT = TEAM_COUNT * TEAM_SIZE;

/** How many ticks the AI brain waits between full re-plans. */
export const AI_REPLAN_INTERVAL_TICKS = 6;

/** Remote-entity interpolation delay (ms) — render remotes this far in the past. */
export const INTERP_DELAY_MS = 100;
