import { describe, it, expect } from "vitest";
import * as V from "./vec2";
import { cover } from "../../../testkit/cover";

describe("vec2 (planar, x/z)", () => {
  it("basic arithmetic", () => {
    expect(V.add(V.v2(1, 2), V.v2(3, 4))).toEqual({ x: 4, z: 6 });
    expect(V.sub(V.v2(3, 4), V.v2(1, 1))).toEqual({ x: 2, z: 3 });
    expect(V.scale(V.v2(2, -3), 2)).toEqual({ x: 4, z: -6 });
    expect(V.addScaled(V.v2(1, 1), V.v2(2, 0), 3)).toEqual({ x: 7, z: 1 });
  });

  it("dot, cross, length", () => {
    expect(V.dot(V.v2(1, 0), V.v2(0, 1))).toBe(0);
    expect(V.cross(V.v2(1, 0), V.v2(0, 1))).toBe(1);
    expect(V.len(V.v2(3, 4))).toBe(5);
    expect(V.dist(V.v2(0, 0), V.v2(0, 5))).toBe(5);
  });

  it("normalize returns a unit vector; zero stays zero", () => {
    cover("sim-vec2-normalize"); // docs/todo/sim-determinism.md sim-03
    const n = V.normalize(V.v2(0, 10));
    expect(V.len(n)).toBeCloseTo(1, 9);
    expect(V.normalize(V.v2(0, 0))).toEqual({ x: 0, z: 0 });
  });

  it("clampLen caps magnitude but keeps direction", () => {
    const c = V.clampLen(V.v2(6, 8), 5); // len 10 -> 5
    expect(V.len(c)).toBeCloseTo(5, 9);
    expect(V.normalize(c)).toEqual(V.normalize(V.v2(6, 8)));
    // already-short vectors are unchanged
    expect(V.clampLen(V.v2(1, 0), 5)).toEqual({ x: 1, z: 0 });
  });

  it("perp is orthogonal", () => {
    const a = V.v2(3, 5);
    expect(V.dot(a, V.perp(a))).toBe(0);
  });
});
