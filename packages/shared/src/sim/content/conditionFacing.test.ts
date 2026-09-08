import { beforeAll, describe, expect, it } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "./skeleton";
import { spawnChampion } from "../spawnChampion";
import { evaluateCondition, describeCondition, type EffectCondition } from "./condition";
import { zEffectCondition } from "../../content/schema/condition";
import { asSeatId, asTeamId } from "../../ids";

beforeAll(registerSkeletonContent);
function stage() {
  const world = new SimWorld(SKELETON_ARENA, 3208);
  const spawn = (seat: number) => spawnChampion(world, { championId: SELA.id, zone: 0,
    seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: seat * 2, z: 0 } });
  const self = spawn(0), target = spawn(1);
  world.transform.get(self)!.facing = { x: 3, z: 0 };
  world.transform.get(target)!.facing = { x: 2, z: 0 };
  return { world, self, target };
}
const forward: EffectCondition = { kind: "facing", subject: "self", arcDegrees: 120 };

describe("facing condition", () => {
  it.each([[0, true], [60, true], [-60, true], [60.001, false], [-60.001, false], [90, false], [180, false]])(
    "angle %s degrees, inclusive forward arc = %s", (angle, expected) => {
      const r = stage();
      r.world.transform.get(r.target)!.pos = { x: 2 * Math.cos(angle * Math.PI / 180), z: 2 * Math.sin(angle * Math.PI / 180) };
      expect(evaluateCondition(r.world, forward, r)).toBe(expected);
    });
  it("supports either subject and reads live facing rather than a cast snapshot", () => {
    const r = stage();
    const targetArc: EffectCondition = { kind: "facing", subject: "target", arcDegrees: 120 };
    expect(evaluateCondition(r.world, forward, r)).toBe(true);
    expect(evaluateCondition(r.world, targetArc, r)).toBe(false);
    r.world.transform.get(r.target)!.facing = { x: -4, z: 0 };
    expect(evaluateCondition(r.world, targetArc, r)).toBe(true);
    expect(evaluateCondition(r.world, { not: targetArc }, r)).toBe(false);
    expect(describeCondition(targetArc)).toContain("120°");
  });
  it.each(["missing-target", "missing-transform", "other-zone", "overlap", "zero-facing", "invalid-facing"])(
    "%s is not a usable direction", state => {
      const r = stage();
      if (state === "missing-target") {
        expect(evaluateCondition(r.world, forward, { self: r.self })).toBe(false); return;
      }
      if (state === "missing-transform") r.world.transform.delete(r.target);
      if (state === "other-zone") r.world.transform.get(r.target)!.zone = 1;
      if (state === "overlap") r.world.transform.get(r.target)!.pos = { x: 0, z: 0 };
      if (state === "zero-facing") r.world.transform.get(r.self)!.facing = { x: 0, z: 0 };
      if (state === "invalid-facing") r.world.transform.get(r.self)!.facing.x = NaN;
      expect(evaluateCondition(r.world, forward, r)).toBe(false);
    });
  it("accepts bounded arcs and rejects malformed authoring", () => {
    for (const arcDegrees of [1, 120, 360]) expect(zEffectCondition.safeParse({ ...forward, arcDegrees }).success).toBe(true);
    for (const arcDegrees of [0, -1, 361, NaN, Infinity]) expect(zEffectCondition.safeParse({ ...forward, arcDegrees }).success).toBe(false);
    expect(zEffectCondition.safeParse({ ...forward, subject: "attacker" }).success).toBe(false);
    expect(zEffectCondition.safeParse({ ...forward, angle: 90 }).success).toBe(false);
  });
});
