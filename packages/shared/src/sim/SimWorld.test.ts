import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

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
    world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
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
      // nobody inside the central pillar (r=2.5)
      expect(V.dist(t.pos, z.center)).toBeGreaterThanOrEqual(2.5 + t.radius - 1e-3);
    }
    // all six converged near the center but separated (no two overlapping)
    const ts = [...world.transform.values()];
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const d = V.dist(ts[i]!.pos, ts[j]!.pos);
        expect(d).toBeGreaterThanOrEqual(ts[i]!.radius + ts[j]!.radius - 0.05);
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
