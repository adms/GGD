/**
 * editor-08 (editor-decor-transform): arena decor placement math — authored
 * {x, z, rotQuarter 0-3, scale} -> ground-plane world transform with
 * rotation.y in radians (quarter turns, no radians in data).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { zDecor } from "@ggd/shared/content";
import { decorTransform, QUARTER_TURN, TEAM_SPAWN_COLORS } from "./decor";

describe("decorTransform", () => {
  it("maps rotQuarter 0..3 to 0, PI/2, PI, 3PI/2 around +Y", () => {
    cover("editor-decor-transform");
    expect(decorTransform({ x: 0, z: 0, rotQuarter: 0 }).rotationY).toBe(0);
    expect(decorTransform({ x: 0, z: 0, rotQuarter: 1 }).rotationY).toBeCloseTo(Math.PI / 2, 12);
    expect(decorTransform({ x: 0, z: 0, rotQuarter: 2 }).rotationY).toBeCloseTo(Math.PI, 12);
    expect(decorTransform({ x: 0, z: 0, rotQuarter: 3 }).rotationY).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(QUARTER_TURN).toBe(Math.PI / 2);
  });

  it("keeps x/z, pins props to the ground plane, defaults rot/scale", () => {
    const t = decorTransform({ x: -40, z: 23.2, rotQuarter: 2, scale: 1.5 });
    expect(t).toEqual({ x: -40, y: 0, z: 23.2, rotationY: Math.PI, scale: 1.5 });
    // schema defaults flow through (rotQuarter/scale optional in the fn input)
    expect(decorTransform({ x: 1, z: 2 })).toEqual({ x: 1, y: 0, z: 2, rotationY: 0, scale: 1 });
  });

  it("accepts real schema-parsed decor entries (arena@1 zDecor)", () => {
    const d = zDecor.parse({ model: "assets/models/props/pillar.glb", x: -49, z: 8, rotQuarter: 3, scale: 1.8 });
    const t = decorTransform(d);
    expect(t.rotationY).toBeCloseTo(3 * QUARTER_TURN, 12);
    expect(t.scale).toBe(1.8);
  });

  it("side spawn colors: one per spawns tuple side", () => {
    expect(TEAM_SPAWN_COLORS).toHaveLength(2);
    expect(TEAM_SPAWN_COLORS[0]).not.toBe(TEAM_SPAWN_COLORS[1]);
  });
});
