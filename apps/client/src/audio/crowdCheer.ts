/**
 * audio/crowdCheer — PURE decision layer for the arena crowd's reaction to a
 * kill (task #234: 「打死對方英雄 … 周圍響起觀眾歡呼聲」).
 *
 * The kill VOICE half of #234 already existed: `sfxEdges.diffTally` computes the
 * escalating `killVoice` category and `AudioDirector` speaks it through
 * `playContextualVoice`, so it inherits the whole Tier-1 anti-pollution layer.
 * This module is the CHEER half, and it is deliberately a separate, self-owned
 * throttle rather than a second population of the announcer's `kill`/`multiKill`
 * keys — `SfxGate`'s cooldown is CROSS-FRAME and keyed on the string, so pouring
 * a new source into an existing key starves the incumbent (measured: eleven
 * footstep feeders once cut local footsteps to 21 %; see SfxPlayOptions.gateKey).
 *
 * THE OWNER'S CONSTRAINT, made structural. 「一次擊殺一次歡呼 … 連殺要更大聲更
 * 長，而不是 N 個疊在一起」:
 *   • escalation is a bigger CLIP plus a higher per-call `volume`, never a second
 *     simultaneous copy — `crowdCheerBig` is a 2.8 s roar with a brown-noise mass
 *     layer, `crowdCheer` a 1.6 s cheer;
 *   • a cheer inside `CHEER_MIN_GAP_MS` of the last one is DROPPED, with exactly
 *     one exception: it may ESCALATE (small → big) so a triple kill still gets
 *     its roar. It can never de-escalate past the gap, and it can never repeat
 *     the same tier past the gap, so a five-kill burst is at most two cheers.
 *   • both map entries additionally carry `maxConcurrent: 1` + a 2.4 s cooldown,
 *     so even a caller that ignored this module could not stack them.
 *
 * PURE ON PURPOSE. Client vitest is node with no DOM, and this is the only part
 * of the cheer that has interesting behaviour — same shape as `sfxEdges`,
 * `countdownCue` and `draftReveal`. The imperative shell (a ref pair + one
 * `audioSystem.playSfx`) lives in `ui/AudioDirector.tsx`, where it inherits the
 * #14 mute/slider and the #62 test-mode silence for free: `playSfx` returns
 * false while locked/disposed and the whole AudioContext is null in test mode.
 *
 * CLIENT-ONLY, like every other cue here: nothing in this file imports the sim,
 * and no decision here consumes randomness at all (never `world.rng`) — the tier
 * is a deterministic function of the streak, so a replay is untouched.
 */

/** SFX key for the ordinary single-kill cheer (1.6 s). */
export const CROWD_CHEER_EVENT = "crowdCheer";
/** SFX key for the multi-kill / first-blood roar (2.8 s, + a mass body layer). */
export const CROWD_CHEER_BIG_EVENT = "crowdCheerBig";

/**
 * A cheer may not re-fire inside this window unless it ESCALATES. Chosen to
 * outlast the small clip (1.6 s) so two cheers can never overlap in the common
 * case, while staying under `sfxEdges.MULTIKILL_WINDOW_MS` (8 s) so a real
 * spree can still reach its roar.
 */
export const CHEER_MIN_GAP_MS = 2_400;

/** Streak at which the crowd upgrades from a cheer to a roar (三殺). */
export const CHEER_BIG_STREAK = 3;

/** Per-call volume floor and ceiling (multiplies the map's authored `gain`). */
export const CHEER_BASE_VOLUME = 1.0;
export const CHEER_VOLUME_PER_STREAK = 0.1;
export const CHEER_BIG_BONUS = 0.15;
export const CHEER_MAX_VOLUME = 1.5;

/** 0 = silence, 1 = the ordinary cheer, 2 = the roar. Ordered: bigger is louder. */
export type CheerTier = 0 | 1 | 2;

export interface CheerInput {
  /**
   * The kill's contextual-voice category from `diffTally` — "first-blood",
   * "kill-1".."kill-5", "unstoppable" — or null when no kill landed on this
   * transition. Null is the ONLY "no kill" signal; the streak alone is not,
   * because it persists across renders that did not add a kill.
   */
  killVoice: string | null;
  /** the streak `diffTally` carried forward for this kill (1 = a fresh kill). */
  killStreak: number;
  nowMs: number;
  /** when the last cheer actually played, or null if none this session. */
  lastCheerMs: number | null;
  /** the tier of that last cheer (0 when none) — the escalation comparison. */
  lastCheerTier: CheerTier;
  minGapMs?: number;
}

export interface CheerDecision {
  /** audio-map SFX key to play. */
  event: string;
  /** per-call volume multiplier for `playSfx`. */
  volume: number;
  /** the tier played — carry it forward as `lastCheerTier`. */
  tier: CheerTier;
}

/**
 * Which tier the crowd owes this kill. First blood and an unstoppable spree are
 * roars regardless of the streak number (first blood IS the loud moment, and
 * `unstoppable` only exists past five); otherwise a triple kill and up roars.
 */
export function cheerTierFor(killVoice: string | null, killStreak: number): CheerTier {
  if (!killVoice) return 0;
  if (killVoice === "first-blood" || killVoice === "unstoppable") return 2;
  return killStreak >= CHEER_BIG_STREAK ? 2 : 1;
}

/**
 * Volume for a cheer at this tier/streak: rises with the streak and gets a fixed
 * bump for a roar, clamped so the crowd can never drown the champion's own kill
 * line. Monotonic in `killStreak` within a tier, by construction.
 */
export function cheerVolumeFor(tier: CheerTier, killStreak: number): number {
  if (tier === 0) return 0;
  const streakBump = CHEER_VOLUME_PER_STREAK * Math.max(0, killStreak - 1);
  const tierBump = tier === 2 ? CHEER_BIG_BONUS : 0;
  return Math.min(CHEER_MAX_VOLUME, CHEER_BASE_VOLUME + streakBump + tierBump);
}

/**
 * Decide whether the crowd cheers for this kill, and how. Returns null for "stay
 * quiet" — no kill on this transition, or the throttle blocked a non-escalating
 * repeat. The caller only updates its `lastCheer*` refs when a decision comes
 * back, so a suppressed cheer never pushes the window forward (the same
 * "don't burn throttle on a skip" rule the contextual-voice de-dup follows).
 */
export function decideCrowdCheer(input: CheerInput): CheerDecision | null {
  const tier = cheerTierFor(input.killVoice, input.killStreak);
  if (tier === 0) return null;

  const gap = input.minGapMs ?? CHEER_MIN_GAP_MS;
  const elapsed = input.lastCheerMs === null ? Infinity : input.nowMs - input.lastCheerMs;
  // Inside the window, only a strict ESCALATION is allowed through — that is
  // what turns "a burst of kills" into "one cheer that grows" instead of a wall.
  if (elapsed < gap && tier <= input.lastCheerTier) return null;

  return {
    event: tier === 2 ? CROWD_CHEER_BIG_EVENT : CROWD_CHEER_EVENT,
    volume: cheerVolumeFor(tier, input.killStreak),
    tier,
  };
}
