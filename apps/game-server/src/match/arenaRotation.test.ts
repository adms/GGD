/**
 * Per-round arena rotation (task #145), through the real MatchController.
 *
 * The pure picker is pinned in packages/shared/src/sim/world/arenaRotation.test.ts;
 * this file pins the WIRING: a match given a rotation pool picks a NEW arena each
 * combat round, keeps it stable for the whole round, exposes the chosen id on the
 * broadcast state (`mapId`) for the client-render agent, and replays byte-identically
 * under the same seed. It also proves a match with NO pool stays on its fixed map.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { zArenaDoc, type ArenaDoc } from "@ggd/shared/content";
import { Arenas } from "@ggd/shared/content";
import { SKELETON_ARENA, ROYALE_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MatchController, type SeatSpec } from "./MatchController";
import { FINAL_ROUND } from "./PairedDuels";
import { resolveArenaPool } from "./arenaSelect";
import { projectSnapshot } from "../net/snapshot";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const loadArena = (id: string): ArenaDoc =>
  zArenaDoc.parse(JSON.parse(readFileSync(join(CONTENT, "arenas", `${id}.json`), "utf8")));

const FAST = { champSelectTicks: 5, intermissionTicks: 8, combatMaxTicks: 1200, resolutionTicks: 3 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

beforeAll(() => {
  // register the four themed arenas so resolveArenaPool() returns the full pool
  // (skeleton is the built-in). Champions come from the controller's skeleton
  // content registration.
  for (const id of ["arena.castle", "arena.colosseum", "arena.dota", "arena.godie"]) {
    Arenas.register(loadArena(id));
  }
});

/**
 * Run a match to matchEnd, recording the active arena id at the start of every
 * combat round and cross-checking it stays fixed for the whole round + shows up
 * on the projected snapshot.
 */
function runRecordingArenas(ctl: MatchController): { perRound: Map<number, string>; digest: number } {
  const perRound = new Map<number, string>();
  const state = new MatchState();
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n++ < 60_000) {
    ctl.tick();
    if (ctl.phase.phase === "combat") {
      const round = ctl.phase.round;
      const arenaId = ctl.arena.id;
      if (!perRound.has(round)) {
        perRound.set(round, arenaId);
      } else {
        // STABLE within the round: never re-picked mid-combat
        expect(arenaId, `arena changed mid-round ${round}`).toBe(perRound.get(round));
      }
      // BROADCAST: the chosen id rides the snapshot the client reads
      projectSnapshot(ctl, state, new Map());
      expect(state.mapId).toBe(arenaId);
    }
  }
  return { perRound, digest: ctl.world.digest() };
}

describe("per-round arena rotation (arena-rotation-e2e)", () => {
  it("picks a NEW arena per combat round from the pool, stable within each round", () => {
    cover("arena-rotation-perround");
    const pool = resolveArenaPool();
    expect(pool.length, "the pool should contain all five arenas").toBe(5);

    const ctl = new MatchController("rot-1", 12345, allBots(), FAST, 3, undefined, SKELETON_ARENA, undefined, undefined, null, pool);
    const { perRound } = runRecordingArenas(ctl);

    expect(perRound.size, "the match ran several combat rounds").toBeGreaterThanOrEqual(2);
    // THE FINALE IS NOT PART OF THE ROTATION. Round FINAL_ROUND is the twelve-player
    // royale and always uses `arena.royale` — a single 42-radius zone with four
    // spawn clusters — so it is excluded from ARENA_ROTATION_IDS and asserted
    // separately here rather than being allowed to weaken the pool assertion.
    expect(perRound.get(FINAL_ROUND)).toBe(ROYALE_ARENA.id);
    const duelRounds = [...perRound.entries()].filter(([r]) => r < FINAL_ROUND);
    expect(duelRounds.length).toBeGreaterThanOrEqual(2);
    // every recorded DUEL-round arena is a real member of the pool
    const poolIds = new Set(pool.map((a) => a.id));
    expect(poolIds.has(ROYALE_ARENA.id), "the finale map must stay OUT of the rotation").toBe(false);
    for (const [, id] of duelRounds) expect(poolIds.has(id)).toBe(true);
    // ACROSS rounds the arena actually VARIES (the whole point of #145)
    expect(new Set(duelRounds.map(([, id]) => id)).size, "arena never changed across rounds").toBeGreaterThan(1);
    // consecutive rounds never repeat the same map
    const rounds = duelRounds.map(([r]) => r).sort((a, b) => a - b);
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i] === rounds[i - 1]! + 1) {
        expect(perRound.get(rounds[i]!)).not.toBe(perRound.get(rounds[i - 1]!));
      }
    }
  });

  it("is identical under same-seed replay (byte-identical sim + same arena sequence)", () => {
    cover("arena-rotation-replay-e2e");
    const run = (): { seq: string; digest: number } => {
      const pool = resolveArenaPool();
      const ctl = new MatchController("rot-r", 999, allBots(), FAST, 3, undefined, SKELETON_ARENA, undefined, undefined, null, pool);
      const { perRound, digest } = runRecordingArenas(ctl);
      const seq = [...perRound.entries()].sort((a, b) => a[0] - b[0]).map(([r, id]) => `${r}:${id}`).join(",");
      return { seq, digest };
    };
    const a = run();
    const b = run();
    expect(a.seq).toBe(b.seq); // same arenas, same rounds
    expect(a.digest).toBe(b.digest); // and a byte-identical simulation
    expect(a.seq.length, "the replay produced no rounds").toBeGreaterThan(0);
  });

  it("selects deterministically from the seed — a different seed can pick a different opener", () => {
    cover("arena-rotation-seeded");
    const opener = (seed: number): string => {
      const pool = resolveArenaPool();
      const ctl = new MatchController(`rot-s${seed}`, seed, allBots(), FAST, 3, undefined, SKELETON_ARENA, undefined, undefined, null, pool);
      let n = 0;
      while (ctl.phase.phase !== "combat" && n++ < 500) ctl.tick();
      return ctl.arena.id;
    };
    // round-1 arena is a pure function of the seed
    expect(opener(1)).toBe(opener(1));
    // and the seed genuinely drives the choice (a spread of seeds is not all one map)
    const openers = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(opener));
    expect(openers.size).toBeGreaterThan(1);
  });

  it("with NO pool a match keeps its fixed arena for the whole game (pre-#145 behaviour)", () => {
    cover("arena-rotation-nopool");
    // default arenaPool is empty → no rotation
    const ctl = new MatchController("rot-fixed", 555, allBots(), FAST);
    const { perRound } = runRecordingArenas(ctl);
    expect(perRound.size).toBeGreaterThanOrEqual(1);
    // …for every DUEL round. The finale still switches to the royale map: it is
    // not a rotation pick, it is the shape round FINAL_ROUND is played in, and a
    // match "with no rotation" still has to be playable by twelve champions at once.
    const duelMaps = new Set([...perRound.entries()].filter(([r]) => r < FINAL_ROUND).map(([, id]) => id));
    expect(duelMaps).toEqual(new Set([SKELETON_ARENA.id]));
    expect(perRound.get(FINAL_ROUND)).toBe(ROYALE_ARENA.id);
  });
});
