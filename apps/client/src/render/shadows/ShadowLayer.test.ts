/**
 * vfx-shadow (task #147): the pooled blob-shadow shell on NullEngine. One disc
 * per live body, following it every frame; a body that vanishes releases its
 * disc back to a free list (reused, not re-allocated); the pool is hard-capped;
 * dispose tears every mesh down. Textures are stubbed (NullEngine loads none).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ShadowLayer, MAX_SHADOWS, type ShadowInput } from "./ShadowLayer";
import { SHADOW_Y } from "./shadowMath";

let engine: NullEngine;

beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => {
  engine.dispose();
});

function withScene<T>(fn: (scene: Scene) => T): T {
  const scene = new Scene(engine);
  try {
    return fn(scene);
  } finally {
    scene.dispose();
  }
}

/** NullEngine can't load a real texture — stub the seam. */
function layer(scene: Scene): ShadowLayer {
  return new ShadowLayer(scene, { createTexture: () => null });
}

const body = (id: number, x: number, z: number, radius = 0.55): ShadowInput => ({ id, x, z, radius });

describe("ShadowLayer (vfx-shadow)", () => {
  it("draws one disc per live body and follows it", () => {
    cover("vfx-shadow");
    withScene((scene) => {
      const layers = layer(scene);
      layers.sync([body(1, 3, -2), body(2, -4, 5)], 0);
      expect(layers.activeCount).toBe(2);
      expect(layers.positionOf(1)).toEqual({ x: 3, z: -2 });
      // the disc sits just above the floor
      const disc = scene.meshes.find((m) => m.name === "blob-shadow");
      expect(disc!.position.y).toBeCloseTo(SHADOW_Y);

      // it FOLLOWS the body next frame (same disc, new position)
      layers.sync([body(1, 3.5, -2.25), body(2, -4, 5)], 16);
      expect(layers.activeCount).toBe(2);
      expect(layers.positionOf(1)).toEqual({ x: 3.5, z: -2.25 });
    });
  });

  it("scales the disc to the footprint (diameter = 2·radius)", () => {
    cover("vfx-shadow");
    withScene((scene) => {
      const layers = layer(scene);
      layers.sync([body(1, 0, 0, 0.55)], 0);
      const disc = scene.meshes.find((m) => m.name === "blob-shadow")!;
      expect(disc.scaling.x).toBeCloseTo(1.1);
      expect(disc.scaling.z).toBeCloseTo(1.1);
      expect(disc.scaling.y).toBe(1);
    });
  });

  it("releases + REUSES a disc when a body vanishes (no per-body allocation)", () => {
    cover("vfx-shadow");
    withScene((scene) => {
      const layers = layer(scene);
      layers.sync([body(1, 1, 1), body(2, 2, 2)], 0);
      expect(layers.poolSize).toBe(2);

      // body 2 leaves — its disc is disabled + freed, pool size unchanged
      layers.sync([body(1, 1, 1)], 16);
      expect(layers.activeCount).toBe(1);
      expect(layers.poolSize).toBe(2);
      expect(layers.positionOf(2)).toBeNull();

      // a NEW body reuses the freed disc rather than allocating a third
      layers.sync([body(1, 1, 1), body(3, 9, 9)], 32);
      expect(layers.activeCount).toBe(2);
      expect(layers.poolSize).toBe(2);
      expect(layers.positionOf(3)).toEqual({ x: 9, z: 9 });
    });
  });

  it("ignores a non-finite body position (never parks a disc off-world)", () => {
    cover("vfx-shadow");
    withScene((scene) => {
      const layers = layer(scene);
      layers.sync([body(1, Number.NaN, 0), body(2, 5, 5)], 0);
      expect(layers.activeCount).toBe(1);
      expect(layers.positionOf(2)).toEqual({ x: 5, z: 5 });
    });
  });

  it("is hard-capped at MAX_SHADOWS discs", () => {
    cover("vfx-shadow");
    withScene((scene) => {
      const layers = layer(scene);
      const many: ShadowInput[] = [];
      for (let i = 0; i < MAX_SHADOWS + 8; i++) many.push(body(i, i, 0));
      layers.sync(many, 0);
      expect(layers.poolSize).toBeLessThanOrEqual(MAX_SHADOWS);
      expect(layers.activeCount).toBeLessThanOrEqual(MAX_SHADOWS);
    });
  });

  it("dispose tears every disc mesh down", () => {
    cover("vfx-shadow");
    withScene((scene) => {
      const layers = layer(scene);
      layers.sync([body(1, 1, 1), body(2, 2, 2)], 0);
      layers.sync([body(1, 1, 1)], 16); // frees one
      const before = scene.meshes.filter((m) => m.name === "blob-shadow").length;
      expect(before).toBe(2);
      layers.dispose();
      expect(scene.meshes.filter((m) => m.name === "blob-shadow").length).toBe(0);
      expect(layers.activeCount).toBe(0);
      expect(layers.poolSize).toBe(0);
    });
  });
});
