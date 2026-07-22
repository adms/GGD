/**
 * rating — the pure post-match GRADE + per-match RANK functions.
 *
 * Deterministic, side-effect-free, no rng/trig: `grade(playerStats, lobbyStats,
 * role)` maps one player's scoreboard to a 12-step ladder S+ … C-, and
 * `perMatchRanks(entries)` sorts every player 1..N by the same composite score
 * with deterministic tie-breaks. Both consume PlayerMatchStats (matchStats.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMULA (documented so balance/tuning is auditable)
 *
 * Each player is reduced to nine sub-scores in [0,1], each a saturating ratio of
 * a raw scoreboard quantity against a reference cap (absolute skill anchors) —
 * except `surv`, which is normalised against the LOBBY's longest-lived player:
 *
 *   kda   = clamp((K+A)/max(1,D) / KDA_REF)          combat efficiency
 *   kp    = clamp(killParticipation / KP_REF)        presence in kills
 *   dmg   = clamp(damageDealt / DMG_REF)             damage output
 *   tank  = clamp((damageTaken+damageBlocked)/TANK_REF)  frontline soak
 *   acc   = abilityHits/(abilityHits+abilityWhiffs)  skillshot accuracy
 *           (0.5 neutral when the champion threw no skillshots)
 *   surv  = timeAliveTicks / lobby-max timeAliveTicks   staying alive
 *   heal  = clamp(healingDone / HEAL_REF)            sustain output
 *   cc    = clamp(ccAppliedTicks / CC_REF)           lockdown
 *   obj   = clamp(flowersEaten / OBJ_REF)            objective (flowers)
 *   resc  = clamp(revivesPerformed / RESCUE_REF)     teammates channelled back
 *           up out of a revive circle (task #84). Deliberately weighted like a
 *           SUPPORT axis (heaviest for support/tank, light for carries): a
 *           revive never erases the death or the enemy's kill, so rescuing has
 *           to be rewarded on its own line or it is invisible on the card.
 *
 * These are blended two ways and averaged:
 *
 *   roleScore   = Σ w_role[i]·sub[i]        — weighted by the player's ROLE, so a
 *                                             marksman is judged on damage/accuracy
 *                                             and a tank on soak/CC/participation.
 *   percentile  = |{ lobby players whose ROLE-AGNOSTIC baseScore ≤ mine }| / N
 *                                           — performance VS THIS LOBBY (a great
 *                                             game in a weak lobby still ranks high;
 *                                             a mediocre one in a stacked lobby dips).
 *   composite   = 0.5·roleScore + 0.5·percentile   (+0.05·multikill bonus, capped)
 *
 * `composite` ∈ [0,1] is cut into the 12-step ladder by GRADE_CUTS. perMatchRank
 * sorts descending by `composite`, ties broken by (kills, damageDealt, then the
 * stable entry order == ascending seat id) so the ordering is fully deterministic.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { PlayerMatchStats } from "./matchStats";

/** The 12-step grade ladder, best → worst. */
export type Grade = "S+" | "S" | "S-" | "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-";

export const GRADES: readonly Grade[] = [
  "S+",
  "S",
  "S-",
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
] as const;

/**
 * Lower composite bound for each grade (same order as GRADES). A composite below
 * the last cut is C-. Evenly spaced ~0.066 so the ladder is smooth.
 */
export const GRADE_CUTS: readonly number[] = [
  0.9, // S+
  0.83, // S
  0.76, // S-
  0.69, // A+
  0.62, // A
  0.55, // A-
  0.48, // B+
  0.41, // B
  0.34, // B-
  0.27, // C+
  0.2, // C
  0, // C-
] as const;

// Absolute reference caps (a "full marks" performance on each axis).
const KDA_REF = 5; // (K+A)/D of 5 saturates
const KP_REF = 8;
const DMG_REF = 12000;
const TANK_REF = 18000;
const HEAL_REF = 6000;
const CC_REF = 300; // 10s of applied CC @30Hz
const OBJ_REF = 6; // flowers eaten
/** Revives are capped at ONE per team per round, so 3 across a match is a lot. */
const RESCUE_REF = 3;

/** Sub-score index order shared by every weight vector. */
type Sub = { kda: number; kp: number; dmg: number; tank: number; acc: number; surv: number; heal: number; cc: number; obj: number; resc: number };

/** Per-role sub-score weights (need not sum to 1 — normalised at blend time). */
const ROLE_WEIGHTS: Record<string, Sub> = {
  marksman: { kda: 0.15, kp: 0.12, dmg: 0.3, tank: 0.03, acc: 0.15, surv: 0.1, heal: 0.0, cc: 0.05, obj: 0.1, resc: 0.03 },
  mage: { kda: 0.15, kp: 0.12, dmg: 0.28, tank: 0.03, acc: 0.12, surv: 0.08, heal: 0.02, cc: 0.12, obj: 0.08, resc: 0.03 },
  fighter: { kda: 0.18, kp: 0.12, dmg: 0.22, tank: 0.12, acc: 0.06, surv: 0.1, heal: 0.02, cc: 0.08, obj: 0.1, resc: 0.05 },
  bruiser: { kda: 0.16, kp: 0.1, dmg: 0.2, tank: 0.2, acc: 0.04, surv: 0.1, heal: 0.02, cc: 0.08, obj: 0.1, resc: 0.05 },
  tank: { kda: 0.1, kp: 0.14, dmg: 0.08, tank: 0.28, acc: 0.02, surv: 0.12, heal: 0.04, cc: 0.14, obj: 0.08, resc: 0.08 },
  support: { kda: 0.08, kp: 0.16, dmg: 0.06, tank: 0.1, acc: 0.04, surv: 0.1, heal: 0.26, cc: 0.16, obj: 0.04, resc: 0.12 },
  assassin: { kda: 0.22, kp: 0.12, dmg: 0.26, tank: 0.03, acc: 0.08, surv: 0.09, heal: 0.0, cc: 0.06, obj: 0.14, resc: 0.02 },
};

/** Fallback role weights: a balanced generalist. Also the role-AGNOSTIC vector
 *  used for the lobby percentile so any player is scorable without their role. */
const DEFAULT_WEIGHTS: Sub = { kda: 0.16, kp: 0.12, dmg: 0.18, tank: 0.12, acc: 0.08, surv: 0.1, heal: 0.06, cc: 0.1, obj: 0.08, resc: 0.05 };

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function weightsFor(role: string): Sub {
  return ROLE_WEIGHTS[role.toLowerCase()] ?? DEFAULT_WEIGHTS;
}

/** Longest time-alive across the lobby (survival denominator). */
function lobbyMaxAlive(lobby: readonly PlayerMatchStats[]): number {
  let m = 0;
  for (const p of lobby) if (p.timeAliveTicks > m) m = p.timeAliveTicks;
  return m;
}

/** The nine sub-scores for one player, each in [0,1]. */
function subScores(stats: PlayerMatchStats, maxAlive: number): Sub {
  const kda = (stats.kills + stats.assists) / Math.max(1, stats.deaths);
  const shots = stats.abilityHits + stats.abilityWhiffs;
  return {
    kda: clamp01(kda / KDA_REF),
    kp: clamp01(stats.killParticipation / KP_REF),
    dmg: clamp01(stats.damageDealt / DMG_REF),
    tank: clamp01((stats.damageTaken + stats.damageBlocked) / TANK_REF),
    acc: shots > 0 ? clamp01(stats.abilityHits / shots) : 0.5,
    surv: maxAlive > 0 ? clamp01(stats.timeAliveTicks / maxAlive) : 1,
    heal: clamp01(stats.healingDone / HEAL_REF),
    cc: clamp01(stats.ccAppliedTicks / CC_REF),
    obj: clamp01(stats.flowersEaten / OBJ_REF),
    resc: clamp01(stats.revivesPerformed / RESCUE_REF),
  };
}

/** Weighted, normalised blend of sub-scores → [0,1]. */
function weightedScore(sub: Sub, w: Sub): number {
  const num =
    w.kda * sub.kda +
    w.kp * sub.kp +
    w.dmg * sub.dmg +
    w.tank * sub.tank +
    w.acc * sub.acc +
    w.surv * sub.surv +
    w.heal * sub.heal +
    w.cc * sub.cc +
    w.obj * sub.obj +
    w.resc * sub.resc;
  const den = w.kda + w.kp + w.dmg + w.tank + w.acc + w.surv + w.heal + w.cc + w.obj + w.resc;
  return den > 0 ? num / den : 0;
}

/** Role-agnostic baseline (used to percentile-rank the whole lobby). */
function baseScore(stats: PlayerMatchStats, maxAlive: number): number {
  return weightedScore(subScores(stats, maxAlive), DEFAULT_WEIGHTS);
}

/**
 * The composite [0,1] that both grade() and perMatchRanks() sort on:
 * 0.5·role-weighted + 0.5·lobby-percentile, plus a small multikill bonus.
 */
export function compositeScore(stats: PlayerMatchStats, lobby: readonly PlayerMatchStats[], role: string): number {
  const maxAlive = lobbyMaxAlive(lobby);
  const roleScore = weightedScore(subScores(stats, maxAlive), weightsFor(role));

  const mine = baseScore(stats, maxAlive);
  const n = Math.max(1, lobby.length);
  let atOrBelow = 0;
  for (const p of lobby) if (baseScore(p, maxAlive) <= mine + 1e-9) atOrBelow += 1;
  // when the player is not part of the passed lobby, count them implicitly
  const percentile = lobby.length > 0 ? atOrBelow / n : 1;

  const multiBonus = clamp01(stats.multikills / 4) * 0.05;
  return clamp01(0.5 * roleScore + 0.5 * percentile + multiBonus);
}

/** Map a composite score in [0,1] to a grade. */
export function gradeFromScore(score: number): Grade {
  for (let i = 0; i < GRADES.length; i++) {
    if (score >= GRADE_CUTS[i]!) return GRADES[i]!;
  }
  return "C-";
}

/**
 * Grade one player against the lobby, weighted by their role. `lobbyStats`
 * should include every player in the match (including this one).
 */
export function grade(playerStats: PlayerMatchStats, lobbyStats: readonly PlayerMatchStats[], role: string): Grade {
  const lobby = lobbyStats.length > 0 ? lobbyStats : [playerStats];
  return gradeFromScore(compositeScore(playerStats, lobby, role));
}

export interface RankEntry {
  stats: PlayerMatchStats;
  role: string;
}

/**
 * Per-match placement 1..N for every entry, sorted by composite score. Returns
 * ranks aligned to the INPUT order (entries[i] → returned[i]). Ties break by
 * kills, then damageDealt, then the stable input order (ascending seat id), so
 * the ranking is fully deterministic.
 */
export function perMatchRanks(entries: readonly RankEntry[]): number[] {
  const lobby = entries.map((e) => e.stats);
  const scored = entries.map((e, i) => ({ i, score: compositeScore(e.stats, lobby, e.role), stats: e.stats }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.stats.kills !== a.stats.kills) return b.stats.kills - a.stats.kills;
    if (b.stats.damageDealt !== a.stats.damageDealt) return b.stats.damageDealt - a.stats.damageDealt;
    return a.i - b.i; // stable: lower seat id wins the tie
  });
  const ranks = new Array<number>(entries.length);
  scored.forEach((s, place) => {
    ranks[s.i] = place + 1;
  });
  return ranks;
}
