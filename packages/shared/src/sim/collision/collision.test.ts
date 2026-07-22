import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import * as V from "../math/vec2";
import { circle, capsule, cone, segment } from "./shapes";
import {
  circleVsCircle,
  circleVsSegment,
  closestPointOnSegment,
  sweptCircleVsCircle,
  pointInCone,
  rayVsSegment,
} from "./intersect";
import { SpatialHash } from "./spatialHash";
import { separatePair, pushOutOfObstacle, clampToBoundary, moveWithCollision } from "./resolve";
import { queryOverlap } from "./queries";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA, type ZoneDef } from "../world/ArenaDef";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import { startDash } from "../systems/MovementSystem";

const zone0 = (): ZoneDef => SKELETON_ARENA.zones[0]!;

describe("circle vs circle (col-01)", () => {
  it("detects overlap with penetration depth + normal", () => {
    cover("col-circle-circle");
    const a = circle(V.v2(0, 0), 1);
    const b = circle(V.v2(1.5, 0), 1);
    const ov = circleVsCircle(a, b);
    expect(ov.hit).toBe(true);
    expect(ov.depth).toBeCloseTo(0.5, 9);
    expect(ov.normal).toEqual({ x: -1, z: 0 }); // pushes a away from b

    expect(circleVsCircle(circle(V.v2(0, 0), 1), circle(V.v2(3, 0), 1)).hit).toBe(false);
    // coincident centers: deterministic +x normal
    const co = circleVsCircle(circle(V.v2(0, 0), 1), circle(V.v2(0, 0), 1));
    expect(co.hit).toBe(true);
    expect(co.normal).toEqual({ x: 1, z: 0 });
  });
});

describe("circle vs segment (col-02)", () => {
  it("closest point + overlap", () => {
    cover("col-circle-segment");
    const s = segment(V.v2(-5, 0), V.v2(5, 0));
    expect(closestPointOnSegment(V.v2(0, 3), s.a, s.b)).toEqual({ x: 0, z: 0 });
    expect(closestPointOnSegment(V.v2(9, 3), s.a, s.b)).toEqual({ x: 5, z: 0 }); // clamps to end

    const hit = circleVsSegment(circle(V.v2(0, 0.5), 1), s);
    expect(hit.hit).toBe(true);
    expect(hit.depth).toBeCloseTo(0.5, 9);
    expect(hit.normal).toEqual({ x: 0, z: 1 });

    expect(circleVsSegment(circle(V.v2(0, 2), 1), s).hit).toBe(false);
  });
});

describe("swept circle (col-03)", () => {
  it("returns earliest impact t for a moving projectile", () => {
    cover("col-swept-circle");
    // projectile radius .2 moving +x by 10 units; target circle r=.8 at x=5
    const t = sweptCircleVsCircle(V.v2(0, 0), V.v2(10, 0), 0.2, circle(V.v2(5, 0), 0.8));
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(0.4, 5); // impact at x = 5 - (0.8+0.2) = 4 -> t = 0.4

    // moving away -> no hit
    expect(sweptCircleVsCircle(V.v2(0, 0), V.v2(-10, 0), 0.2, circle(V.v2(5, 0), 0.8))).toBeNull();
    // starting overlapped -> t = 0
    expect(sweptCircleVsCircle(V.v2(5, 0), V.v2(1, 0), 0.5, circle(V.v2(5, 0), 0.8))).toBe(0);
    // perpendicular miss
    expect(sweptCircleVsCircle(V.v2(0, 5), V.v2(10, 0), 0.2, circle(V.v2(5, 0), 0.8))).toBeNull();
  });
});

describe("point in cone (col-04)", () => {
  it("cos-based containment, range-limited, no trig", () => {
    cover("col-cone");
    // 90° cone (half-angle 45°, cos = √2/2) facing +x, range 10
    const c = cone(V.v2(0, 0), V.v2(1, 0), Math.SQRT1_2, 10);
    expect(pointInCone(V.v2(5, 0), c)).toBe(true); // straight ahead
    expect(pointInCone(V.v2(5, 4.9), c)).toBe(true); // inside 45°
    expect(pointInCone(V.v2(5, 5.1), c)).toBe(false); // outside 45°
    expect(pointInCone(V.v2(11, 0), c)).toBe(false); // out of range
    expect(pointInCone(V.v2(-1, 0), c)).toBe(false); // behind
    expect(pointInCone(V.v2(0, 0), c)).toBe(true); // apex
    // radius expansion: center outside but circle edge reaches
    expect(pointInCone(V.v2(5, 5.4), c, 1)).toBe(true);
  });
});

describe("unit separation (col-05)", () => {
  it("pushes overlapping bodies apart symmetrically and converges", () => {
    cover("col-separation");
    const a = { pos: V.v2(0, 0), radius: 1 };
    const b = { pos: V.v2(0.5, 0), radius: 1 };
    for (let i = 0; i < 30; i++) separatePair(a, b, 0.6);
    const gap = V.dist(a.pos, b.pos);
    expect(gap).toBeGreaterThanOrEqual(1.99); // converged to ~sum of radii
    // symmetric: midpoint preserved
    expect((a.pos.x + b.pos.x) / 2).toBeCloseTo(0.25, 6);
  });
});

describe("wall push-out + slide (col-06)", () => {
  it("pushes out of a pillar and slides along it instead of sticking", () => {
    cover("col-wall-slide");
    const zone: ZoneDef = {
      id: "z",
      center: V.v2(0, 0),
      boundaryRadius: 50,
      obstacles: [{ kind: "circle", center: V.v2(5, 0), radius: 2 }],
      spawns: [[], []],
    };
    // body walking +x straight into the pillar, slightly offset in z
    const body = { pos: V.v2(2.6, 0.4), radius: 0.5 };
    for (let i = 0; i < 40; i++) moveWithCollision(body, V.v2(0.25, 0), zone);
    // never inside the pillar
    expect(V.dist(body.pos, V.v2(5, 0))).toBeGreaterThanOrEqual(2.5 - 1e-6);
    // slid past it (made forward progress beyond the pillar center)
    expect(body.pos.x).toBeGreaterThan(5);
  });
});

describe("boundary clamp (col-07)", () => {
  it("keeps entities inside the circular zone", () => {
    cover("col-boundary");
    const z = zone0();
    const body = { pos: V.v2(z.center.x + 100, z.center.z), radius: 0.5 };
    clampToBoundary(body, z);
    expect(V.dist(body.pos, z.center)).toBeCloseTo(z.boundaryRadius - 0.5, 6);
  });
});

describe("spatial hash parity (col-08)", () => {
  it("grid query returns exactly the brute-force candidate set", () => {
    cover("col-spatial-hash-parity");
    // deterministic pseudo-random layout
    const grid = new SpatialHash(4);
    const pts: { id: EntityId; x: number; z: number; r: number }[] = [];
    let s = 1;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 1; i <= 200; i++) {
      const p = { id: i as EntityId, x: rnd() * 100 - 50, z: rnd() * 100 - 50, r: 0.3 + rnd() };
      pts.push(p);
      grid.insertCircle(p.id, { x: p.x, z: p.z }, p.r);
    }
    for (const q of [
      { c: V.v2(0, 0), r: 5 },
      { c: V.v2(-30, 22), r: 12 },
      { c: V.v2(49, -49), r: 3 },
    ]) {
      const fromGrid = grid.queryCircle(q.c, q.r);
      const brute = pts
        .filter(
          (p) =>
            p.x + p.r >= q.c.x - q.r &&
            p.x - p.r <= q.c.x + q.r &&
            p.z + p.r >= q.c.z - q.r &&
            p.z - p.r <= q.c.z + q.r,
        )
        .map((p) => p.id)
        .sort((a, b) => a - b);
      expect(fromGrid).toEqual(brute);
    }
  });
});

function makeWorldWithUnits(): { world: SimWorld; ids: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 42);
  const z = zone0();
  const ids: EntityId[] = [];
  const spots = [V.v2(z.center.x, z.center.z + 6), V.v2(z.center.x + 3, z.center.z + 6), V.v2(z.center.x + 10, z.center.z - 8)];
  for (let i = 0; i < spots.length; i++) {
    const id = world.spawn();
    ids.push(id);
    world.transform.set(id, { pos: spots[i]!, vel: V.v2(), facing: V.v2(1, 0), radius: 0.6, zone: 0 });
    world.health.set(id, { hp: 100, maxHp: 100, mana: 50, maxMana: 50, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(i % 2), seatId: asSeatId(i) });
    world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
    world.status.set(id, { effects: [] });
  }
  return { world, ids };
}

describe("queryOverlap (col-09)", () => {
  it("returns sorted ids for circle/capsule/cone shapes with filters", () => {
    cover("col-query-overlap");
    const { world, ids } = makeWorldWithUnits();
    world.step(new Map()); // builds the grid
    const z = zone0();

    // circle catching the two clustered units, not the far one
    const hits = queryOverlap(world, circle(V.v2(z.center.x + 1.5, z.center.z + 6), 3));
    expect(hits).toEqual([ids[0], ids[1]]);

    // capsule (beam) from unit0 through unit1
    const beam = capsule(V.v2(z.center.x - 1, z.center.z + 6), V.v2(z.center.x + 5, z.center.z + 6), 0.4);
    expect(queryOverlap(world, beam, { exclude: new Set([ids[0]!]) })).toEqual([ids[1]]);

    // cone from unit0 facing +x catches unit1 only
    const c = cone(V.v2(z.center.x, z.center.z + 6), V.v2(1, 0), Math.SQRT1_2, 6);
    expect(queryOverlap(world, c, { exclude: new Set([ids[0]!]) })).toEqual([ids[1]]);

    // aliveOnly filter
    world.health.get(ids[1]!)!.alive = false;
    expect(queryOverlap(world, circle(V.v2(z.center.x + 1.5, z.center.z + 6), 3), { aliveOnly: true })).toEqual([
      ids[0],
    ]);
  });
});

describe("dash stops at wall (col-10)", () => {
  it("a dash aimed into a pillar terminates at its surface", () => {
    cover("col-dash-wall");
    const { world, ids } = makeWorldWithUnits();
    const z = zone0();
    const id = ids[2]!; // unit at (cx+10, -8); pillar at (cx+9, -8) r=1.8
    const t = world.transform.get(id)!;
    t.pos = { x: z.center.x + 14, z: z.center.z - 8 };
    // dash straight -x into the pillar at (cx+9,-8)
    startDash(world, id, { x: -1, z: 0 }, 40, 12);
    for (let i = 0; i < 30; i++) world.step(new Map());
    const dTo = V.dist(t.pos, { x: z.center.x + 9, z: z.center.z - 8 });
    expect(dTo).toBeGreaterThanOrEqual(1.8 + t.radius - 1e-3); // stopped at surface
    expect(world.nav.get(id)!.override).toBeNull(); // dash ended
  });
});

describe("rayVsSegment", () => {
  it("hits a crossing wall at the right distance and misses parallels", () => {
    const wall = segment(V.v2(5, -2), V.v2(5, 2));
    expect(rayVsSegment(V.v2(0, 0), V.v2(1, 0), 10, wall)).toBeCloseTo(5, 9);
    expect(rayVsSegment(V.v2(0, 0), V.v2(1, 0), 4, wall)).toBeNull(); // out of reach
    expect(rayVsSegment(V.v2(0, 5), V.v2(1, 0), 10, wall)).toBeNull(); // passes beside
    expect(rayVsSegment(V.v2(0, 0), V.v2(0, 1), 10, wall)).toBeNull(); // parallel
  });
});
