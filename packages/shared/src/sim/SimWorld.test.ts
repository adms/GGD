import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { PILLAR_ARENA } from "../../testkit/arenas";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";
import { beginCombatCoins, coinRulesFromConfig, dropCoinCommand } from "./coins";

/** The shipped goldDrop contract (content/config/arena-rules.json). */
const RULES = coinRulesFromConfig({
  coinValue: 100,
  coinsPerRound: 10,
  dropRadius: 1.9,
  pickupRadius: 1.6,
  coinRadius: 0.31,
});

/** Spawn a 6-champion setup (3v3 in zone 0) deterministically. */
function setup(world: SimWorld): EntityId[] {
  const z = SKELETON_ARENA.zones[0]!;
  const ids: EntityId[] = [];
  for (let seat = 0; seat < 6; seat++) {
    const side = seat < 3 ? 0 : 1;
    const spawn = z.spawns[side]![seat % 3]!;
    const id = world.spawn();
    ids.push(id);
    world.transform.set(id, {
      pos: { x: spawn.x, z: spawn.z },
      vel: V.v2(),
      facing: V.v2(side === 0 ? 1 : -1, 0),
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, { hp: 100, maxHp: 100, mana: 50, maxMana: 50, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(side), seatId: asSeatId(seat) });
    world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
    world.status.set(id, { effects: [] });
  }
  return ids;
}

/** Deterministic scripted intent stream: seat s orders a move on tick k. */
function scriptedIntents(tick: number): Map<SeatId, IntentFrame> {
  const m = new Map<SeatId, IntentFrame>();
  const z = SKELETON_ARENA.zones[0]!;
  if (tick === 0) {
    for (let s = 0; s < 6; s++) {
      m.set(asSeatId(s), {
        order: { kind: "move", point: { x: z.center.x, z: z.center.z } },
        commands: [],
      });
    }
  }
  if (tick === 40) {
    m.set(asSeatId(0), {
      order: { kind: "move", point: { x: z.center.x - 10, z: z.center.z + 5 } },
      commands: [],
    });
  }
  return m;
}

function runScripted(seed: number, ticks: number): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, seed);
  setup(world);
  for (let k = 0; k < ticks; k++) world.step(scriptedIntents(k));
  return world;
}

describe("SimWorld replay determinism (sim-04)", () => {
  it("same seed + same intents -> identical state digests", () => {
    cover("sim-world-replay");
    const a = runScripted(1234, 120);
    const b = runScripted(1234, 120);
    expect(a.digest()).toBe(b.digest());
    // and positions match exactly, not just the hash
    for (const [id, t] of a.transform) {
      const t2 = b.transform.get(id)!;
      expect(t2.pos.x).toBe(t.pos.x);
      expect(t2.pos.z).toBe(t.pos.z);
    }
    // different seed diverges the RNG state digest (positions may match since
    // movement is input-driven; the digest includes rng state)
    const c = runScripted(9999, 120);
    expect(c.digest()).not.toBe(a.digest());
  });

  it("digest changes when inputs change", () => {
    const a = runScripted(1234, 120);
    const world = new SimWorld(SKELETON_ARENA, 1234);
    setup(world);
    for (let k = 0; k < 120; k++) {
      const intents = scriptedIntents(k);
      if (k === 60) {
        intents.set(asSeatId(2), { order: { kind: "stop" }, commands: [] });
      }
      world.step(intents);
    }
    expect(world.digest()).not.toBe(a.digest());
  });
});

/**
 * The NO-OP ARMING CONTRACT for 陣亡投幣 (task #191).
 *
 * Every coin code path opens with `if (!world.coinRules) return;`, and both new
 * stores are folded into `digest()` only by iteration — so a world with the
 * mechanic disarmed (unit tests, the client's PREDICTION SHADOW WORLD, any match
 * whose arena-rules doc has no `goldDrop` block) must hash EXACTLY as it did
 * before the feature existed. The golden below was taken from `main` before any
 * of this landed; it is the only thing that can catch a stray unconditional mix.
 *
 * It runs on `PILLAR_ARENA` (testkit), NOT on the shipped arena. The digest is a
 * hash over positions, so it moves whenever the map's geometry moves — task #218
 * removing the centre pillar invalidated it once, and re-baselining would have
 * quietly destroyed the golden's whole value (a number taken from today's code
 * proves nothing about a pre-feature contract). `PILLAR_ARENA` freezes the exact
 * geometry the golden was taken on, so the hash now answers only the question it
 * was written to answer.
 */
const PRE_COIN_GOLDEN_DIGEST = 0x9d9048c5;

describe("coin arming is a strict no-op when disabled (task #191)", () => {
  it("600 disarmed ticks hash tick-for-tick to the pre-feature golden", () => {
    cover("coin-digest-noop");
    const a = new SimWorld(PILLAR_ARENA, 1234);
    const b = new SimWorld(PILLAR_ARENA, 1234);
    setup(a);
    setup(b);
    expect(a.coinRules).toBeNull();
    for (let k = 0; k < 600; k++) {
      a.step(scriptedIntents(k));
      b.step(scriptedIntents(k));
      // two independently constructed worlds agree on EVERY tick, not just the last
      expect(a.digest()).toBe(b.digest());
    }
    expect(a.coin.size).toBe(0);
    expect(a.coinBudget.size).toBe(0);
    expect(a.digest()).toBe(PRE_COIN_GOLDEN_DIGEST);
  });

  it("arming and throwing ONE coin changes the digest on the spawn tick", () => {
    // the other half of the contract: the coin store really is folded in, so a
    // replica that spawned a coin the other did not diverges immediately —
    // which matters because `champion.gold` is not in this digest at all
    const plain = new SimWorld(SKELETON_ARENA, 99);
    const armed = new SimWorld(SKELETON_ARENA, 99);
    const plainIds = setup(plain);
    const armedIds = setup(armed);
    for (const w of [plain, armed]) w.step(new Map());
    expect(armed.digest()).toBe(plain.digest());

    // give both a champion component so the throw has gold to spend
    for (const [w, ids] of [
      [plain, plainIds],
      [armed, armedIds],
    ] as const) {
      w.champion.set(ids[0]!, {
        championId: "x" as never,
        level: 1,
        xp: 0,
        gold: 500,
        items: [],
        augments: [],
        statStacks: 0,
        statCapstonePct: 0,
        pendingOrbSlots: 0,
        undoStack: [],
      });
      w.health.get(ids[0]!)!.alive = false;
      w.combatActive = true;
    }
    expect(armed.digest()).toBe(plain.digest()); // gold/alive alone: still equal

    beginCombatCoins(armed, RULES, [armedIds[0]!]);
    expect(armed.digest()).not.toBe(plain.digest()); // the budget map is hashed
    expect(dropCoinCommand(armed, armedIds[0]!, asSeatId(0))).toBe("ok");
    expect(armed.coin.size).toBe(1);
    expect(armed.digest()).not.toBe(plain.digest());
  });
});

describe("stable iteration order (sim-05)", () => {
  it("entity stores iterate in ascending id order", () => {
    cover("sim-stable-order");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const ids = setup(world);
    expect([...world.transform.keys()]).toEqual(ids);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // separation processed via sorted grid queries — after many ticks with all
    // units piled at the center, the state is still identical across runs
    const w2 = new SimWorld(SKELETON_ARENA, 7);
    setup(w2);
    for (let k = 0; k < 200; k++) {
      world.step(scriptedIntents(k));
      w2.step(scriptedIntents(k));
    }
    expect(w2.digest()).toBe(world.digest());
  });
});

describe("rng fork independence (sim-08)", () => {
  it("forked streams are reproducible and don't disturb the parent", () => {
    cover("sim-rng-fork");
    const w1 = new SimWorld(SKELETON_ARENA, 55);
    const w2 = new SimWorld(SKELETON_ARENA, 55);
    const f1 = w1.rng.fork(3);
    const f2 = w2.rng.fork(3);
    expect(f1.next()).toBe(f2.next());
    expect(w1.rng.next()).toBe(w2.rng.next());
  });
});

describe("movement basics through the full step", () => {
  it("units walk to the ordered point, separate, and stay in bounds", () => {
    const world = runScripted(1, 400);
    const z = SKELETON_ARENA.zones[0]!;
    for (const [, t] of world.transform) {
      // everyone inside the boundary
      expect(V.dist(t.pos, z.center)).toBeLessThanOrEqual(z.boundaryRadius - t.radius + 1e-6);
      // There is deliberately NO "outside the central pillar" assertion any more:
      // task #218 removed the centre obstacle from every shipped arena, so units
      // ordered to the centre are now SUPPOSED to reach it. The pathing-around-a-
      // blocker contract lives in chaseRange.test.ts against PILLAR_ARENA.
    }
    // All six converged near the centre and still push each other apart.
    //
    // The bound is 83% of contact, not 96%. Separation is a SOFT force and this
    // script orders all six champions onto the *identical* point — the worst
    // case there is. Before #218 that case was unreachable: the centre pillar
    // spread them onto a ring, so the tight 96% held by accident of the map.
    // With the pillar gone six bodies really do stack on one coordinate and
    // settle at a measured min pair distance of 1.016831u = 84.7% of the 1.2u
    // contact distance (deterministic). A live match does not hit this either —
    // the #89/#105 neutral guardian stands on that centre. What the assertion
    // still protects is the part that matters: bodies never tunnel through each
    // other or collapse onto one point.
    const MIN_SEPARATION_FRACTION = 0.83;
    const ts = [...world.transform.values()];
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const d = V.dist(ts[i]!.pos, ts[j]!.pos);
        expect(d).toBeGreaterThanOrEqual((ts[i]!.radius + ts[j]!.radius) * MIN_SEPARATION_FRACTION);
      }
    }
  });

  it("root status stops movement; slow reduces it", () => {
    const world = new SimWorld(SKELETON_ARENA, 3);
    const ids = setup(world);
    const z = SKELETON_ARENA.zones[0]!;
    const id = ids[0]!;
    world.status.get(id)!.effects.push({
      statusId: "root" as never,
      sourceId: "test",
      expiresAtTick: 50,
      root: true,
    });
    const before = { ...world.transform.get(id)!.pos };
    const intents = new Map<SeatId, IntentFrame>([
      [asSeatId(0), { order: { kind: "move", point: { x: z.center.x, z: z.center.z } }, commands: [] }],
    ]);
    world.step(intents);
    for (let k = 0; k < 20; k++) world.step(new Map());
    const after = world.transform.get(id)!.pos;
    expect(V.dist(before, after)).toBeLessThan(0.01); // rooted: didn't move

    // after root expires it moves again
    for (let k = 0; k < 40; k++) world.step(new Map());
    expect(V.dist(before, world.transform.get(id)!.pos)).toBeGreaterThan(1);
  });
});
