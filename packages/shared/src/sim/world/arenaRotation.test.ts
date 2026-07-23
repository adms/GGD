/**
 * Per-round arena selection (task #145) — the PURE picker. Pins the four
 * properties the feature promises: deterministic + reproducible from
 * (seed, round), stable within a round, varied across rounds, and identical
 * under same-seed replay. The controller wiring is pinned in
 * apps/game-server/src/match/arenaRotation.test.ts.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { pickRoundArena, arenaRotationOrder } from "./ArenaDef";

const POOL = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

describe("pickRoundArena (arena-rotation)", () => {
  it("is a pure function of (seed, round) — same inputs, same arena", () => {
    cover("arena-rotation-deterministic");
    for (const seed of [1, 42, 9999, 0xdeadbeef]) {
      for (let round = 1; round <= 20; round++) {
        const first = pickRoundArena(POOL, seed, round);
        const again = pickRoundArena(POOL, seed, round);
        expect(again).toBe(first); // stable within a round (identical re-pick)
      }
    }
  });

  it("varies across rounds — consecutive rounds never repeat, first cycle covers every arena", () => {
    cover("arena-rotation-varies");
    const seed = 4242;
    const picks: string[] = [];
    for (let round = 1; round <= POOL.length; round++) {
      picks.push(pickRoundArena(POOL, seed, round)!.id);
    }
    // one full cycle visits every arena exactly once (maximal variety)
    expect(new Set(picks).size).toBe(POOL.length);
    // and no two adjacent rounds land on the same map
    for (let round = 1; round <= 30; round++) {
      const a = pickRoundArena(POOL, seed, round)!.id;
      const b = pickRoundArena(POOL, seed, round + 1)!.id;
      expect(a).not.toBe(b);
    }
  });

  it("is identical under same-seed replay and generally differs across seeds", () => {
    cover("arena-rotation-replay");
    const seq = (seed: number): string =>
      Array.from({ length: 12 }, (_, i) => pickRoundArena(POOL, seed, i + 1)!.id).join(",");
    // same seed → byte-identical sequence
    expect(seq(777)).toBe(seq(777));
    // different seeds mostly diverge (not a hard guarantee for every pair, but
    // the rotation ORDER is seed-derived, so a spread of seeds must produce >1
    // distinct sequence)
    const distinct = new Set([seq(1), seq(2), seq(3), seq(4), seq(5)]);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("handles the degenerate pools without throwing", () => {
    cover("arena-rotation-edge");
    expect(pickRoundArena([], 5, 3)).toBeNull(); // empty → caller keeps its arena
    const one = [{ id: "solo" }];
    expect(pickRoundArena(one, 5, 1)).toBe(one[0]); // singleton → always that one
    expect(pickRoundArena(one, 5, 99)).toBe(one[0]);
    // round 0 (champ select, never used in practice) is still a valid index
    expect(pickRoundArena(POOL, 5, 0)).not.toBeNull();
  });

  it("the rotation order is a genuine permutation of the pool indices", () => {
    cover("arena-rotation-permutation");
    for (const seed of [0, 1, 123, 98765]) {
      const order = arenaRotationOrder(POOL.length, seed);
      expect(order).toHaveLength(POOL.length);
      expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
    }
  });
});
