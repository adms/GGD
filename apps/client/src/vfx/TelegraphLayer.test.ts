/**
 * telegraph-layer-lifecycle (task #228) — the per-caster telegraph on a real
 * NullEngine scene.
 *
 * These cover the three things the OLD path got wrong and no test caught:
 *   1. it never cancelled — `this.telegraphs` was push-only, so a caster stunned
 *      out of a cast kept a filling ring that still fired its "it lands HERE"
 *      pop for damage that never happened;
 *   2. it filled on a wall clock that cannot see the sim's hitstop/hitstun
 *      pauses, so the ring and the cast bar drifted apart;
 *   3. it had no budget, so a teamfight covered the floor.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  CORRIDOR_EDGE_MAX_WIDTH,
  CORRIDOR_EDGE_MIN_WIDTH,
  TelegraphLayer,
  FLASH_HOLD_MS,
} from "./TelegraphLayer";
import { FULL_TIER_CAP, TOTAL_TIER_CAP } from "./telegraphChannel";
import type { TelegraphShape } from "./telegraphShape";

let engine: NullEngine;

beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => engine.dispose());

const circle = (x = 0, z = 0, radius = 2): TelegraphShape => ({ kind: "circle", x, z, radius });
const line = (): TelegraphShape => ({
  kind: "line",
  fromX: 0,
  fromZ: 0,
  dirX: 0,
  dirZ: 1,
  length: 8,
  width: 1,
});

interface Rig {
  scene: Scene;
  layer: TelegraphLayer;
  progress: Map<number, number | null>;
}

function rig(): Rig {
  const scene = new Scene(engine);
  const progress = new Map<number, number | null>();
  const layer = new TelegraphLayer(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    castProgress: (id) => progress.get(id) ?? null,
  });
  return { scene, layer, progress };
}

describe("the telegraph tracks the SIM's wind-up, not a clock of its own", () => {
  it("a hitstop-paused wind-up pauses the ring instead of running ahead", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer, progress } = rig();
    progress.set(1, 0.25);
    layer.begin(1, circle(), "enemy", 900, 0);
    const fill = scene.meshes.find((m) => m.name === "telegraph-fill")!;

    layer.update(100);
    const paused = fill.scaling.x;
    // 700 ms of WALL CLOCK go by while `ticksLeft` does not move
    layer.update(800);
    expect(fill.scaling.x).toBeCloseTo(paused, 6);

    progress.set(1, 0.9);
    layer.update(850);
    expect(fill.scaling.x).toBeGreaterThan(paused);
    layer.dispose();
    scene.dispose();
  });

  it("castEnd resolves it — castInterrupt kills it with no pop", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer, progress } = rig();
    const psBefore = scene.particleSystems.length;
    progress.set(2, 0.5);
    layer.begin(2, circle(), "enemy", 600, 0);
    layer.update(100);
    expect(layer.activeCount).toBe(1);

    layer.interrupt(2);
    expect(layer.activeCount).toBe(0);
    layer.update(5000);
    // no resolve kick was ever fired: nothing landed
    expect(scene.particleSystems.length).toBe(psBefore);

    // …and the resolve path DOES pay off
    progress.set(3, 0.5);
    layer.begin(3, circle(0, 0, 2.5), "enemy", 600, 0);
    layer.update(100);
    layer.resolve(3, 200);
    expect(scene.particleSystems.length).toBeGreaterThan(psBefore);
    layer.dispose();
    scene.dispose();
  });

  it("a dropped castEnd still reaps the ring instead of leaving it burning", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer, progress } = rig();
    progress.set(4, 0.6);
    layer.begin(4, circle(), "enemy", 600, 0);
    layer.update(50);
    expect(layer.activeCount).toBe(1);
    // the tracker cleared the cast (grace expired) but no event reached us
    progress.set(4, null);
    layer.update(100);
    layer.update(3000);
    expect(layer.activeCount).toBe(0);
    layer.dispose();
    scene.dispose();
  });

  it("re-casting replaces — one caster is never two telegraphs", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer, progress } = rig();
    progress.set(5, 0.2);
    layer.begin(5, circle(1, 1, 2), "enemy", 500, 0);
    layer.begin(5, circle(7, 7, 3), "enemy", 500, 10);
    expect(layer.activeCount).toBe(1);
    expect(layer.shapeOf(5)).toMatchObject({ x: 7, z: 7, radius: 3 });
    layer.dispose();
    scene.dispose();
  });
});

describe("an INSTANT cast gets a landing flash, never a fake fill", () => {
  it("routes the rune opacity mask through the host content resolver", () => {
    const scene = new Scene(engine);
    const layer = new TelegraphLayer(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      resolveTextureUrl: (path) => `/content-api/${path}`,
    });
    layer.begin(60, circle(), "enemy", 0, 0);
    const fill = scene.meshes.find((mesh) => mesh.name === "telegraph-fill")!;
    const material = fill.material as StandardMaterial;
    expect((material.opacityTexture as Texture | null)?.url).toBe(
      "/content-api/assets/textures/particles/magic_02.png",
    );
    layer.dispose();
    scene.dispose();
  });

  it("resolves immediately, stays quiet, and reaps itself", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer } = rig();
    const psBefore = scene.particleSystems.length;
    layer.begin(6, circle(), "enemy", 0, 0); // castTimeSec 0 → no castBegin
    expect(layer.activeCount).toBe(1);
    layer.update(16);
    // an ability with no wind-up has no dodge window; a filling ring would be a
    // lie about a reaction the player cannot make. It also spends no particles:
    // the #33/#39 impact layers already fire on this exact frame.
    expect(scene.particleSystems.length).toBe(psBefore);
    layer.update(FLASH_HOLD_MS + 200);
    expect(layer.activeCount).toBe(0);
    layer.dispose();
    scene.dispose();
  });
});

describe("the corridor SWEEPS over the wind-up so its timing is readable", () => {
  it("a skillshot line grows from the caster to its full reach", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer, progress } = rig();
    progress.set(7, 0.25);
    layer.begin(7, line(), "enemy", 800, 0);
    const quads = scene.meshes.filter((m) => m.name === "telegraph-corridor");
    expect(quads).toHaveLength(2);
    const quad = quads[0]!;
    const material = quad.material as StandardMaterial;
    // A large transparent corridor is a UI overlay. Babylon's default white
    // diffuse channel would add to the emissive channel and turn it into a
    // screen-filling white card at gameplay camera scale.
    expect([material.diffuseColor.r, material.diffuseColor.g, material.diffuseColor.b]).toEqual([0, 0, 0]);
    expect([material.specularColor.r, material.specularColor.g, material.specularColor.b]).toEqual([0, 0, 0]);
    layer.update(10);
    const quarter = quad.scaling.y;
    expect(quarter).toBeCloseTo(8 * 0.25, 5);
    for (const edge of quads) {
      expect(edge.scaling.x).toBeGreaterThanOrEqual(CORRIDOR_EDGE_MIN_WIDTH);
      expect(edge.scaling.x).toBeLessThanOrEqual(CORRIDOR_EDGE_MAX_WIDTH);
    }
    expect(quads[0]!.position.x).not.toBeCloseTo(quads[1]!.position.x, 5);
    progress.set(7, 1);
    layer.update(20);
    expect(quad.scaling.y).toBeCloseTo(8, 5);
    // …and it is aimed, not axis-locked
    expect(quad.scaling.x).toBeLessThanOrEqual(CORRIDOR_EDGE_MAX_WIDTH);
    layer.dispose();
    scene.dispose();
  });
});

describe("the screen budget degrades gracefully instead of fogging the floor", () => {
  it("past the full-tier cap new telegraphs are outline-only; past the ceiling allies drop", () => {
    cover("telegraph-layer-lifecycle");
    const { scene, layer, progress } = rig();
    for (let i = 0; i < FULL_TIER_CAP; i++) {
      progress.set(i, 0.3);
      layer.begin(i, circle(i, 0, 2), "enemy", 500, 0);
    }
    expect(layer.tierOf(0)).toBe("full");
    expect(layer.activeCount).toBe(FULL_TIER_CAP);

    progress.set(50, 0.3);
    layer.begin(50, circle(9, 0, 2), "enemy", 500, 0);
    expect(layer.tierOf(50)).toBe("outline");
    // an outline telegraph draws its ring and NOTHING else
    const fills = scene.meshes.filter((m) => m.name === "telegraph-fill" && m.isEnabled());
    expect(fills).toHaveLength(FULL_TIER_CAP);

    for (let i = 60; i < 60 + (TOTAL_TIER_CAP - FULL_TIER_CAP); i++) {
      progress.set(i, 0.3);
      layer.begin(i, circle(i, 0, 2), "enemy", 500, 0);
    }
    // at the ceiling: an ally's cast is context and is dropped…
    layer.begin(900, circle(1, 1, 2), "ally", 500, 0);
    expect(layer.tierOf(900)).toBeNull();
    // …but an incoming one is never dropped, because that IS the bug
    layer.begin(901, circle(2, 2, 2), "enemy", 500, 0);
    expect(layer.tierOf(901)).toBe("outline");
    layer.dispose();
    scene.dispose();
  });
});
