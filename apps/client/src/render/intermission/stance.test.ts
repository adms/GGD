/**
 * stance — the intermission champion's grounding shift (task #111). Pure, so
 * the "feet on the floor" decision is pinned without a GPU.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { groundShiftY } from "./stance";

describe("intermission stance grounding", () => {
  it("lifts a hero whose bind box dips below the origin onto the floor", () => {
    cover("intermission-champion-grounded");
    // imported.picacugy spans y∈[-0.58, 1.71] — grounding lifts feet to y=0
    const shift = groundShiftY({ x: -2, y: -0.58, z: 0 }, { x: 0.47, y: 1.71, z: 1 });
    expect(shift).toBeCloseTo(0.58, 6);
    // applied: the new lowest point sits exactly on the floor
    expect(-0.58 + shift).toBeCloseTo(0, 6);
  });

  it("drops a hero that floats above the floor back down onto it", () => {
    cover("intermission-champion-grounded");
    const shift = groundShiftY({ x: 0, y: 0.4, z: 0 }, { x: 1, y: 2.1, z: 1 });
    expect(shift).toBeCloseTo(-0.4, 6);
  });

  it("is a no-op for a rig already grounded at y=0", () => {
    cover("intermission-champion-grounded");
    expect(groundShiftY({ x: 0, y: 0, z: 0 }, { x: 1, y: 1.7, z: 1 })).toBeCloseTo(0, 6);
  });

  it("leaves a bone-only / empty hierarchy where it is (no NaN teleport)", () => {
    cover("intermission-champion-grounded");
    const NEG = Number.POSITIVE_INFINITY;
    const POS = Number.NEGATIVE_INFINITY;
    // Babylon returns an inverted box for an empty hierarchy
    expect(groundShiftY({ x: NEG, y: NEG, z: NEG }, { x: POS, y: POS, z: POS })).toBe(0);
    expect(groundShiftY({ x: 0, y: NaN, z: 0 }, { x: 1, y: 1, z: 1 })).toBe(0);
  });
});
