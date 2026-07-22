/**
 * PairedDuels round format: each round the surviving teams split into
 * simultaneous 3v3 duels across the arena's two zones, following a rotating
 * round-robin schedule. A duel is won when the opposing three are down; the
 * losing team loses lives (scaling with round). Last team standing wins.
 */
import type { TeamId } from "@ggd/shared/ids";

export interface DuelPairing {
  zone: number;
  sideA: TeamId; // spawns[0]
  sideB: TeamId; // spawns[1]
}

/** Classic 4-team round-robin rotation (circle method), repeats every 3 rounds. */
const FOUR_TEAM_SCHEDULE: [number, number][][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

/**
 * Pair the alive teams for `round` (1-based). 4 alive → two duels; 3 alive →
 * one duel + a bye (rotating); 2 alive → one duel.
 */
export function pairTeams(aliveTeams: readonly TeamId[], round: number): { pairings: DuelPairing[]; bye: TeamId | null } {
  const teams = [...aliveTeams].sort((a, b) => a - b);
  if (teams.length === 4) {
    const sched = FOUR_TEAM_SCHEDULE[(round - 1) % 3]!;
    return {
      pairings: sched.map(([ia, ib], zi) => ({
        zone: zi,
        sideA: teams[ia]!,
        sideB: teams[ib]!,
      })),
      bye: null,
    };
  }
  if (teams.length === 3) {
    const byeIdx = (round - 1) % 3;
    const bye = teams[byeIdx]!;
    const fighters = teams.filter((t) => t !== bye);
    return {
      pairings: [{ zone: 0, sideA: fighters[0]!, sideB: fighters[1]! }],
      bye,
    };
  }
  if (teams.length === 2) {
    return { pairings: [{ zone: 0, sideA: teams[0]!, sideB: teams[1]! }], bye: null };
  }
  return { pairings: [], bye: teams[0] ?? null };
}

/** Lives lost by a duel's losing team, scaling so matches converge. */
export function livesLost(round: number): number {
  if (round <= 2) return 1;
  if (round <= 4) return 2;
  return 3;
}
