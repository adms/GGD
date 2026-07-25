/**
 * Chase-to-ATTACK-RANGE + obstacle avoidance (task #60).
 *
 * Three failures used to make champions "擠在一起像是卡住沒動作":
 *   1. the chase closed to BODY CONTACT, so a range-12 mage walked 10 units
 *      past its own range and every ranged champion fought in melee;
 *   2. a melee unit could halt in the gap between contact and its own reach —
 *      order cleared, attack out of range, soft separation not engaged: a
 *      permanent freeze reproducible for ~15% of approach phases;
 *   3. steering straight into a pillar cancelled the whole step every tick, and
 *      the zone-centre pillar sits EXACTLY between the two middle spawn slots.
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import type { AbilitiesComp } from "./stats/statsComp";
import { steerAroundObstacles } from "./collision/avoid";
import * as V from "./math/vec2";

const Z0 = SKELETON_ARENA.zones[0]!;
/** Body contact for two 0.6-radius champions. */
const CONTACT = 1.2;

/** A minimal combat-capable unit: stats + abilities, no content doc needed. */
function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  range: number,
  moveSpeed = 5.8,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = moveSpeed;
  final[Stat.AttackRange] = range;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  return id;
}

/** Re-issues the attack target every tick, the way Tier0Brain does. */
function runDuel(
  world: SimWorld,
  pairs: [EntityId, EntityId][],
  ticks: number,
): { attacks: number; firstAttackTick: number } {
  let attacks = 0;
  let firstAttackTick = -1;
  for (let k = 0; k < ticks; k++) {
    for (const [a, b] of pairs) world.nav.get(a)!.attackTarget = b;
    world.step(new Map());
    const n = world.events.filter((e) => e.type === "basicAttack").length;
    if (n > 0 && firstAttackTick < 0) firstAttackTick = k;
    attacks += n;
  }
  return { attacks, firstAttackTick };
}

describe("chase stops at ATTACK RANGE, not body contact", () => {
  it("a range-12 champion holds near its range instead of walking into melee", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const a = spawnFighter(world, 0, 0, { x: Z0.center.x - 16, z: -12 }, 12);
    const b = spawnFighter(world, 1, 1, { x: Z0.center.x + 14, z: -12 }, 1.6);
    const { attacks } = runDuel(world, [[a, b]], 200);

    const d = V.dist(world.transform.get(a)!.pos, world.transform.get(b)!.pos);
    // inside its reach (so the auto fires) but nowhere near body contact
    expect(d).toBeLessThanOrEqual(12);
    expect(d).toBeGreaterThanOrEqual(0.8 * 12);
    expect(attacks).toBeGreaterThan(0);
    // the chase has genuinely stopped, not merely paused
    expect(world.nav.get(a)!.moveTarget).toBeNull();
  });

  it("range bands each hold at their own range (no band collapses to melee)", () => {
    for (const range of [6, 8.2, 11, 12]) {
      const world = new SimWorld(SKELETON_ARENA, 2);
      const a = spawnFighter(world, 0, 0, { x: Z0.center.x - 16, z: -12 }, range);
      const b = spawnFighter(world, 1, 1, { x: Z0.center.x + 14, z: -12 }, 1.6);
      runDuel(world, [[a, b]], 220);
      const d = V.dist(world.transform.get(a)!.pos, world.transform.get(b)!.pos);
      expect(d).toBeGreaterThanOrEqual(0.8 * range);
      expect(d).toBeLessThanOrEqual(range);
    }
  });

  it("melee never halts in the old dead band — every approach phase connects", () => {
    // The measured failure: 9 of these 60 phases produced ZERO attacks in 13 s
    // and 12 settled in the un-restorable (reach, contact] gap.
    let deadlocked = 0;
    let inDeadBand = 0;
    for (let i = 0; i < 60; i++) {
      const gap = 8 + i * 0.05; // 0.05-unit sweep of the approach phase
      const world = new SimWorld(SKELETON_ARENA, 7);
      const a = spawnFighter(world, 0, 0, { x: Z0.center.x - 16, z: 10 }, 1.6);
      const b = spawnFighter(world, 1, 1, { x: Z0.center.x - 16 + gap, z: 10 }, 1.6);
      const { attacks } = runDuel(world, [[a, b]], 120);
      const d = V.dist(world.transform.get(a)!.pos, world.transform.get(b)!.pos);
      if (attacks === 0) deadlocked++;
      if (d > 1.6) inDeadBand++; // outside reach = cannot attack from rest
      expect(d).toBeGreaterThan(CONTACT - 0.05); // and never overlapping
    }
    expect(deadlocked).toBe(0);
    expect(inDeadBand).toBe(0);
  });

  it("a chase that is already in range issues no move order at all", () => {
    const world = new SimWorld(SKELETON_ARENA, 4);
    const a = spawnFighter(world, 0, 0, { x: Z0.center.x - 16, z: 6 }, 9.2);
    const b = spawnFighter(world, 1, 1, { x: Z0.center.x - 10, z: 6 }, 1.6); // 6 units away
    world.nav.get(a)!.attackTarget = b;
    world.step(new Map());
    expect(world.nav.get(a)!.moveTarget).toBeNull();
    expect(world.transform.get(a)!.pos.x).toBeCloseTo(Z0.center.x - 16, 9);
  });
});

describe("obstacle avoidance: units walk AROUND a pillar", () => {
  it("two melee champions split by the zone-centre pillar still fight", () => {
    // probe4 from the diagnosis: bit-identical positions for 270 ticks, 0 autos.
    const world = new SimWorld(SKELETON_ARENA, 3);
    const a = spawnFighter(world, 0, 0, { x: Z0.center.x - 6, z: 0 }, 1.6);
    const b = spawnFighter(world, 1, 1, { x: Z0.center.x + 6, z: 0 }, 1.6);
    const { attacks, firstAttackTick } = runDuel(
      world,
      [
        [a, b],
        [b, a],
      ],
      300,
    );
    expect(attacks).toBeGreaterThan(0);
    expect(firstAttackTick).toBeGreaterThan(0);
    const d = V.dist(world.transform.get(a)!.pos, world.transform.get(b)!.pos);
    expect(d).toBeLessThanOrEqual(1.6);
  });

  it("a blocked unit reports the velocity it ACTUALLY has, never the intent", () => {
    // t.vel used to report full speed while the body was pinned to a pillar,
    // so the animation layer was told "walking" for a motionless model.
    const world = new SimWorld(SKELETON_ARENA, 5);
    const id = spawnFighter(world, 0, 0, { x: Z0.center.x - 6, z: 0 }, 1.6);
    // order straight into the middle of the pillar (an unreachable point:
    // avoidance is deliberately skipped so the body parks against the wall)
    world.nav.get(id)!.moveTarget = { x: Z0.center.x, z: Z0.center.z };
    for (let k = 0; k < 60; k++) {
      world.nav.get(id)!.moveTarget = { x: Z0.center.x, z: Z0.center.z };
      world.step(new Map());
    }
    const t = world.transform.get(id)!;
    expect(V.dist(t.pos, Z0.center)).toBeCloseTo(2.5 + 0.6, 2); // flush on the pillar
    expect(V.len(t.vel)).toBeLessThan(0.05); // and honestly reported as stopped
  });

  it("steering is a no-op on a clear path and on an unreachable destination", () => {
    const dir = { x: 1, z: 0 };
    // clear path well clear of every pillar
    expect(
      steerAroundObstacles({ x: Z0.center.x - 6, z: 14 }, 0.6, dir, 12, Z0.obstacles),
    ).toEqual(dir);
    // destination INSIDE the pillar → walking in is the order's actual meaning
    expect(
      steerAroundObstacles({ x: Z0.center.x - 6, z: 0 }, 0.6, dir, 6, Z0.obstacles),
    ).toEqual(dir);
  });

  it("a dead-on approach picks a WORLD-SPACE side, so both sides converge", () => {
    // Body-relative tie-breaking ("always my left") sends two units charging
    // through the same pillar around OPPOSITE sides — a permanent 180° orbit.
    const R = 2.5 + 0.6 + 0.3;
    const east = steerAroundObstacles({ x: Z0.center.x - 6, z: 0 }, 0.6, { x: 1, z: 0 }, 12, Z0.obstacles);
    const west = steerAroundObstacles({ x: Z0.center.x + 6, z: 0 }, 0.6, { x: -1, z: 0 }, 12, Z0.obstacles);
    expect(east).not.toEqual({ x: 1, z: 0 });
    expect(west).not.toEqual({ x: -1, z: 0 });
    // both deflect to the SAME side of the pillar (+z here)
    expect(east.z).toBeGreaterThan(0);
    expect(west.z).toBeGreaterThan(0);
    // and both aim along a true tangent of the clearance circle
    for (const [from, d] of [
      [{ x: Z0.center.x - 6, z: 0 }, east],
      [{ x: Z0.center.x + 6, z: 0 }, west],
    ] as const) {
      expect(V.len(d)).toBeCloseTo(1, 9);
      const to = V.sub(Z0.center, from);
      expect(Math.abs(V.cross(d, to))).toBeCloseTo(R, 6); // perpendicular offset = clearance
    }
  });
});

describe("determinism is preserved (sim-04)", () => {
  it("same seed + same scripted chase replays byte-identically", () => {
    const run = (): number => {
      const world = new SimWorld(SKELETON_ARENA, 4242);
      const a = spawnFighter(world, 0, 0, { x: Z0.center.x - 6, z: 0 }, 1.6);
      const b = spawnFighter(world, 1, 1, { x: Z0.center.x + 6, z: 0 }, 11);
      runDuel(
        world,
        [
          [a, b],
          [b, a],
        ],
        150,
      );
      return world.digest();
    };
    expect(run()).toBe(run());
  });
});
