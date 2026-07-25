/**
 * Movement feel (arena-08, arena-09): smooth turning (bounded nlerp steps, no
 * snapping, opposite-direction pivot) + acceleration ramp + jitter-free arrival
 * + full-step determinism with the new movement code active.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { PILLAR_ARENA } from "../../testkit/arenas";
import { SimWorld } from "./SimWorld";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import { turnToward, TURN_FACTOR, ACCEL_TICKS } from "./systems/MovementSystem";
import * as V from "./math/vec2";

/**
 * These tests exercise the MOVEMENT ALGORITHM (bounded turning, accel ramp,
 * arrival) against an arena that contains a blocker. They used to lean on the
 * shipped skeleton arena's centre obstacle — so when task #218 deleted that
 * centre pillar from every map, they started failing for a reason that had
 * nothing to do with movement. `PILLAR_ARENA` (testkit) is the pre-#218 arena,
 * so the algorithm keeps its blocker while the shipped maps stay open.
 */
const Z0 = PILLAR_ARENA.zones[0]!;

/** Spawn one minimal champion-like unit (no stats comp -> base speed 6). */
function spawnUnit(world: SimWorld, seat: number, pos: V.Vec2, facing: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { ...facing }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 100, maxHp: 100, mana: 50, maxMana: 50, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(seat % 2), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  return id;
}

const moveOrder = (seat: number, point: V.Vec2): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(seat), { order: { kind: "move" as const, point }, commands: [] }]]);

describe("smooth turning (arena-08)", () => {
  it("facing converges to the move direction without ever snapping", () => {
    cover("move-turn-smooth");
    const world = new SimWorld(PILLAR_ARENA, 1);
    const id = spawnUnit(world, 0, { x: Z0.center.x - 14, z: -8 }, { x: 1, z: 0 });
    // order a move straight "up" (+z): desired facing is perpendicular to current
    const target = { x: Z0.center.x - 14, z: 8 };
    let prev = { ...world.transform.get(id)!.facing };
    world.step(moveOrder(0, target));
    let converged = -1;
    for (let k = 0; k < 40; k++) {
      const t = world.transform.get(id)!;
      // facing stays unit-length
      expect(V.len(t.facing)).toBeCloseTo(1, 6);
      // bounded step: never rotates more than ~35° in one tick (no snap)
      expect(V.dot(prev, t.facing)).toBeGreaterThan(0.8);
      const desired = V.normalize(V.sub(target, t.pos));
      if (converged < 0 && V.dot(t.facing, desired) > 0.999) converged = k;
      prev = { ...t.facing };
      world.step(new Map());
    }
    // converged within a reasonable number of ticks (nlerp factor ~0.35)
    expect(converged).toBeGreaterThanOrEqual(1); // took at least one blended step
    expect(converged).toBeLessThan(25);
  });

  it("an exactly-opposite order pivots through the perp and resolves", () => {
    cover("move-turn-smooth");
    const world = new SimWorld(PILLAR_ARENA, 2);
    const id = spawnUnit(world, 0, { x: Z0.center.x + 8, z: -12 }, { x: 1, z: 0 });
    // order a move exactly behind the unit (-x)
    const target = { x: Z0.center.x - 12, z: -12 };
    world.step(moveOrder(0, target));
    let prev = { ...world.transform.get(id)!.facing };
    let resolved = false;
    for (let k = 0; k < 60 && !resolved; k++) {
      const t = world.transform.get(id)!;
      expect(V.len(t.facing)).toBeCloseTo(1, 6); // never degenerates to zero
      expect(V.dot(prev, t.facing)).toBeGreaterThan(0.8); // still bounded steps
      if (t.facing.x < -0.999 && Math.abs(t.facing.z) < 0.05) resolved = true;
      prev = { ...t.facing };
      world.step(new Map());
    }
    expect(resolved).toBe(true);

    // pure-function edge: opposite vectors never produce a zero facing
    const spun = turnToward({ x: 1, z: 0 }, { x: -1, z: 0 }, TURN_FACTOR);
    expect(V.len(spun)).toBeCloseTo(1, 9);
    expect(spun.z).not.toBe(0); // pivoted to a side, deterministically
  });
});

describe("acceleration ramp + arrival (arena-09)", () => {
  it("speed ramps to full over ACCEL_TICKS and arrival does not oscillate", () => {
    cover("move-accel-ramp");
    const world = new SimWorld(PILLAR_ARENA, 3);
    const id = spawnUnit(world, 0, { x: Z0.center.x - 10, z: 5 }, { x: 1, z: 0 });
    const target = { x: Z0.center.x + 5, z: 5 };
    world.step(moveOrder(0, target));
    const speeds: number[] = [V.len(world.transform.get(id)!.vel)];
    for (let k = 0; k < ACCEL_TICKS + 2; k++) {
      world.step(new Map());
      speeds.push(V.len(world.transform.get(id)!.vel));
    }
    const full = 6; // BASE_MOVE_SPEED (no stats comp)
    expect(speeds[0]!).toBeLessThan(full * 0.5); // starts slow (ramp)
    expect(speeds[1]!).toBeGreaterThan(speeds[0]!); // monotonic ramp-up
    expect(speeds[ACCEL_TICKS - 1]!).toBeCloseTo(full, 6); // full speed reached
    expect(speeds[ACCEL_TICKS]!).toBeCloseTo(full, 6); // and held

    // run to arrival, then confirm the unit is at rest (no jitter loop)
    for (let k = 0; k < 300 && world.nav.get(id)!.moveTarget; k++) world.step(new Map());
    expect(world.nav.get(id)!.moveTarget).toBeNull();
    const rest = { ...world.transform.get(id)!.pos };
    for (let k = 0; k < 30; k++) world.step(new Map());
    expect(V.dist(rest, world.transform.get(id)!.pos)).toBeLessThan(1e-9);
    expect(V.len(world.transform.get(id)!.vel)).toBe(0);
    expect(V.dist(rest, target)).toBeLessThan(0.2); // actually arrived
  });

  it("movement with turning + ramp is replay-deterministic", () => {
    cover("move-accel-ramp");
    const run = (): number => {
      const world = new SimWorld(PILLAR_ARENA, 77);
      spawnUnit(world, 0, { x: Z0.center.x - 12, z: -6 }, { x: 1, z: 0 });
      spawnUnit(world, 1, { x: Z0.center.x + 12, z: 6 }, { x: -1, z: 0 });
      for (let k = 0; k < 200; k++) {
        const intents = new Map<SeatId, IntentFrame>();
        if (k === 0) {
          intents.set(asSeatId(0), { order: { kind: "move", point: { x: Z0.center.x + 10, z: 8 } }, commands: [] });
          intents.set(asSeatId(1), { order: { kind: "move", point: { x: Z0.center.x - 10, z: -8 } }, commands: [] });
        }
        if (k === 60) {
          // reverse both mid-run: exercises the opposite-direction pivot in-sim
          intents.set(asSeatId(0), { order: { kind: "move", point: { x: Z0.center.x - 12, z: -6 } }, commands: [] });
          intents.set(asSeatId(1), { order: { kind: "move", point: { x: Z0.center.x + 12, z: 6 } }, commands: [] });
        }
        world.step(intents);
      }
      return world.digest();
    };
    expect(run()).toBe(run());
  });
});
