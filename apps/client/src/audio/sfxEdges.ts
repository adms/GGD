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

import { TICK_HZ } from "@ggd/shared/constants";
import { MULTIKILL_WINDOW_TICKS } from "@ggd/shared/sim/stats/matchStats";

/**
 * Two kills inside this window read as a multi-kill (one flows into the next).
 *
 * DERIVED FROM THE SIM, NOT CHOSEN (task #234). `matchStats.recordChampionDeath`
 * already keeps a per-killer streak — it is what credits `stats.multikills` on
 * the settlement scoreboard and feeds the #25 rating — and it chains on
 * `MULTIKILL_WINDOW_TICKS` (300 ticks = 10 s @30 Hz). This constant was an
 * independently authored 8_000 ms, so for a kill landing 8–10 s after the
 * previous one the two DISAGREED: the scoreboard counted a multikill while the
 * champion's own voice restarted the ladder at 「一殺」, and the crowd cheer
 * (which reads the same streak) dropped a tier with it.
 *
 * The sim is the authority — it is the counter that pays and scores — so this is
 * now its number, converted, rather than a second opinion about the same
 * question. Editing the sim's window moves the voice ladder with it. Read-only
 * dependency: nothing here writes sim state, and the ladder stays client-only.
 */
export const MULTIKILL_WINDOW_MS = (MULTIKILL_WINDOW_TICKS / TICK_HZ) * 1_000;

/**
 * HP fraction at or below which the local champion is "in danger" and the
 * `lowHealth` warning cue (task #51's staged `low-health` clip) should sound.
 * A single edge: it fires once when HP crosses DOWN through this line, not
 * every frame it sits below (the audio map's 3 s cooldown is a second guard).
 */
export const LOW_HEALTH_FRACTION = 0.3;

/** Local champion HP snapshot (discrete, change-guarded HudState projection). */
export interface HealthSnapshot {
  hp: number;
  maxHp: number;
  alive: boolean;
}

/**
 * Whether the transition `prev → next` crosses DOWN into the low-health band and
 * should fire the warning cue. True only when the champion is alive, `next` sits
 * at/below the threshold with real HP left, and `prev` was above it (or unknown
 * / dead / at full — e.g. a fresh spawn or respawn re-arms the warning). A max of
 * 0 (no champion yet) never fires.
 */
export function crossedIntoLowHealth(
  prev: HealthSnapshot,
  next: HealthSnapshot,
  fraction: number = LOW_HEALTH_FRACTION,
): boolean {
  if (!next.alive || next.maxHp <= 0 || next.hp <= 0) return false;
  const nextRatio = next.hp / next.maxHp;
  if (nextRatio > fraction) return false;
  // Above the line last time we looked (or not yet meaningfully alive) → this is
  // the downward crossing. Already below → hold, don't re-fire every tick.
  const prevArmed = !prev.alive || prev.maxHp <= 0 || prev.hp / prev.maxHp > fraction;
  return prevArmed;
}

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
  /** consecutive-kill streak carried forward (0 = none / reset). */
  killStreak?: number;
  /** whether ANY kill has landed this match (the first-blood latch). */
  everKilled?: boolean;
}

export interface TallyDiffResult {
  /** SFX event names to fire, in priority order. */
  events: string[];
  /** updated last-kill timestamp to carry forward. */
  lastKillMs: number | null;
  /** true when the seat changed (a new match): baseline reset, no events. */
  rebaselined: boolean;
  /** updated consecutive-kill streak to carry forward. */
  killStreak: number;
  /** updated first-blood latch to carry forward. */
  everKilled: boolean;
  /**
   * The CONTEXTUAL-VOICE category for this transition's kill, or null when no
   * kill landed: "first-blood" on the match's first kill, else "kill-1".."kill-5"
   * by streak, "unstoppable" past five. Consumed by AudioDirector to speak the
   * LOCAL champion's own cloned line; the SFX in `events` are unchanged.
   */
  killVoice: string | null;
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
    return {
      events: [],
      lastKillMs: null,
      rebaselined: true,
      killStreak: 0,
      everKilled: false,
      killVoice: null,
    };
  }

  const events: string[] = [];
  let lastKillMs = ctx.lastKillMs;
  const window = ctx.multiKillWindowMs ?? MULTIKILL_WINDOW_MS;
  let killStreak = ctx.killStreak ?? 0;
  let everKilled = ctx.everKilled ?? false;
  let killVoice: string | null = null;

  if (next.kills > prev.kills) {
    const isMulti = lastKillMs !== null && ctx.nowMs - lastKillMs <= window;
    events.push(isMulti ? "multiKill" : "kill");
    lastKillMs = ctx.nowMs;
    // Streak flows on a multi-kill window; a stale kill (or the first) restarts it.
    killStreak = isMulti ? killStreak + 1 : 1;
    if (!everKilled) {
      killVoice = "first-blood"; // the match's first kill — the loudest line
    } else if (killStreak > 5) {
      killVoice = "unstoppable";
    } else {
      killVoice = `kill-${killStreak}`;
    }
    everKilled = true;
  }
  // A local death and an ally death are distinct quips; both can land at once.
  if (next.deaths > prev.deaths) events.push("death");
  if (next.allyDeaths > prev.allyDeaths) events.push("allySlain");
  // level 1→2 is the first real level-up; a 0→1 "assignment" bump never fires.
  if (next.level > prev.level && prev.level >= 1) events.push("levelUp");
  // EX unlock is the one-way 0→1 rank flip.
  if (prev.exRank === 0 && next.exRank >= 1) events.push("exUnlock");

  return { events, lastKillMs, rebaselined: false, killStreak, everKilled, killVoice };
}
