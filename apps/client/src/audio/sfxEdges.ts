/**
 * audio/sfxEdges — PURE edge detection for HUD-store-derived SFX. The
 * AudioDirector holds one previous snapshot of the discrete tally (K/D, level,
 * EX rank, ally deaths) and diffs it here to decide which one-shot SFX to fire.
 *
 * Kept out of React (and the AudioSystem) so "which sound does this transition
 * make" is a testable function of two discrete snapshots — never per-frame.
 *
 * Only signals that exist in the DISCRETE HudState live here: kills/deaths
 * (RoomStore K/D tally), level and exRank (seat projection), and ally deaths
 * (teammate deaths derived from the same tally). The low-level combat events
 * (attack/hit/cast/projectile/flower/damage) are NOT here — they only exist in
 * the per-frame MSG.EVENT drain, which this layer deliberately never touches.
 */

/** Two kills inside this window read as a multi-kill (one flows into the next). */
export const MULTIKILL_WINDOW_MS = 8_000;

/** Discrete per-player tally snapshot (all change-guarded HudState fields). */
export interface TallySnapshot {
  /** local seat id — a change means a fresh match: re-baseline, never fire. */
  seatId: number | null;
  kills: number;
  deaths: number;
  level: number;
  exRank: number;
  /** total deaths among living teammates (excludes the local player). */
  allyDeaths: number;
}

export interface TallyDiffCtx {
  nowMs: number;
  /** timestamp of the previous local kill (null = none yet this match). */
  lastKillMs: number | null;
  multiKillWindowMs?: number;
}

export interface TallyDiffResult {
  /** SFX event names to fire, in priority order. */
  events: string[];
  /** updated last-kill timestamp to carry forward. */
  lastKillMs: number | null;
  /** true when the seat changed (a new match): baseline reset, no events. */
  rebaselined: boolean;
}

/**
 * Diff two tally snapshots into the SFX events their transition should fire.
 * A seat change re-baselines silently (a new match resets K/D to 0 etc., which
 * must not be heard as a flurry of quips).
 */
export function diffTally(
  prev: TallySnapshot,
  next: TallySnapshot,
  ctx: TallyDiffCtx,
): TallyDiffResult {
  if (prev.seatId !== next.seatId) {
    return { events: [], lastKillMs: null, rebaselined: true };
  }

  const events: string[] = [];
  let lastKillMs = ctx.lastKillMs;
  const window = ctx.multiKillWindowMs ?? MULTIKILL_WINDOW_MS;

  if (next.kills > prev.kills) {
    const isMulti = lastKillMs !== null && ctx.nowMs - lastKillMs <= window;
    events.push(isMulti ? "multiKill" : "kill");
    lastKillMs = ctx.nowMs;
  }
  // A local death and an ally death are distinct quips; both can land at once.
  if (next.deaths > prev.deaths) events.push("death");
  if (next.allyDeaths > prev.allyDeaths) events.push("allySlain");
  // level 1→2 is the first real level-up; a 0→1 "assignment" bump never fires.
  if (next.level > prev.level && prev.level >= 1) events.push("levelUp");
  // EX unlock is the one-way 0→1 rank flip.
  if (prev.exRank === 0 && next.exRank >= 1) events.push("exUnlock");

  return { events, lastKillMs, rebaselined: false };
}
