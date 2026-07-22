/**
 * pooling-multi (task #30): the VfxSystem particle pool is a per-doc-id
 * FREE-LIST — the same doc can play multiple times in the same frame (each
 * play gets its own ParticleSystem), the list is capped at MAX_POOL_PER_DOC,
 * and beyond the cap the least-recently-used instance is stolen. Idle
 * instances (particles expired) are reused instead of growing the list.
 * Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time (Node
// exposes a non-functional localStorage global) — stub the live params
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VfxDoc } from "@ggd/shared/content";
import { VfxSystem, MAX_POOL_PER_DOC } from "./VfxSystem";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const BURST_DOC: VfxDoc = {
  id: "fx.test-pool",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 8,
  lifetimeSec: { min: 0.2, max: 0.5 },
  size: { start: 0.4, end: 0.1 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
  blendMode: "additive",
};

const CTX = { entityPos: (): null => null };

describe("VfxSystem per-doc free-list pooling (pooling-multi)", () => {
  it("same-frame replays get DISTINCT particle systems", () => {
    cover("pooling-multi");
    const vfx = new VfxSystem(scene, CTX);
    const a = vfx.play(BURST_DOC, 0, 0, 1000);
    const b = vfx.play(BURST_DOC, 5, 5, 1000);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    // each fired at its own position
    expect((a!.emitter as Vector3).x).toBe(0);
    expect((b!.emitter as Vector3).x).toBe(5);
    vfx.dispose();
  });

  it("caps the list at MAX_POOL_PER_DOC and LRU-steals beyond it", () => {
    cover("pooling-multi");
    const vfx = new VfxSystem(scene, CTX);
    const systems = [];
    for (let i = 0; i < MAX_POOL_PER_DOC; i++) {
      systems.push(vfx.play(BURST_DOC, i, 0, 1000 + i));
    }
    const unique = new Set(systems);
    expect(unique.size).toBe(MAX_POOL_PER_DOC);
    // all 4 are busy (lifetime 500ms) → the 5th play steals the LRU (t=1000)
    const stolen = vfx.play(BURST_DOC, 99, 0, 1100);
    expect(stolen).toBe(systems[0]);
    // …and the next steal takes the SECOND-oldest, not the same one again
    const stolen2 = vfx.play(BURST_DOC, 98, 0, 1101);
    expect(stolen2).toBe(systems[1]);
    vfx.dispose();
  });

  it("reuses an idle instance (particles expired) instead of growing", () => {
    cover("pooling-multi");
    const vfx = new VfxSystem(scene, CTX);
    const a = vfx.play(BURST_DOC, 0, 0, 1000);
    // 600ms later the burst (max life 500ms) is over → same system reused
    const b = vfx.play(BURST_DOC, 1, 0, 1600);
    expect(b).toBe(a);
    vfx.dispose();
  });

  it("null doc is a no-op", () => {
    cover("pooling-multi");
    const vfx = new VfxSystem(scene, CTX);
    expect(vfx.play(null, 0, 0, 0)).toBeNull();
    vfx.dispose();
  });
});
