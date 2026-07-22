/**
 * Healing flowers (task #34, docs/todo/flowers.md): the MSG.EVENT
 * fanout maps "flowerSpawn"/"flowerBurst" to EXISTING hand-authored green
 * vfx docs (fx.root-snare / fx.barkskin) played at the event's own x/z (the
 * flower entity may already be despawned on burst), with the HitSpark
 * fallback when the content mount never delivered the docs. NullEngine.
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
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { VfxDoc } from "@ggd/shared/content";
import { impactComposerFor } from "./HitSpark";
import { VfxSystem, FLOWER_BURST_VFX, FLOWER_SPAWN_VFX } from "./VfxSystem";

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

const greenDoc = (id: string): VfxDoc => ({
  id,
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 8,
  lifetimeSec: { min: 0.2, max: 0.5 },
  size: { start: 0.4, end: 0.1 },
  color: { start: [0.45, 0.7, 0.3, 0.9], end: [0.25, 0.45, 0.15, 0] },
  blendMode: "alpha",
});

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

describe("VfxSystem flower events (flower-vfx-events)", () => {
  it("flowerBurst plays the heal-green doc at the event position", () => {
    cover("flower-vfx-events");
    const requested: string[] = [];
    const vfx = new VfxSystem(scene, {
      entityPos: () => null, // burst must NOT need a live entity
      vfxDoc: (key) => {
        requested.push(key);
        return greenDoc(key);
      },
    });
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("flowerBurst", { id: 44, x: 7, z: -3, teamId: 1 }), 1000);
    expect(requested).toContain(FLOWER_BURST_VFX);
    // the heal pop is LAYERED (task #33): pooled core flash + sparks + smoke +
    // ground shockwave fire under the doc's green mote burst
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]!.slice(0, 3)).toEqual(["heavy", 7, -3]);
    fire.mockRestore();
    const doc = scene.particleSystems.find((p) => p.name === `vfx-${FLOWER_BURST_VFX}`)!;
    expect(doc).toBeDefined();
    const emitter = doc.emitter as Vector3;
    expect(emitter.x).toBe(7);
    expect(emitter.z).toBe(-3);
    vfx.dispose();
  });

  it("flowerSpawn plays the sprout doc at the spawn position", () => {
    cover("flower-vfx-events");
    const requested: string[] = [];
    const vfx = new VfxSystem(scene, {
      entityPos: () => null,
      vfxDoc: (key) => {
        requested.push(key);
        return greenDoc(key);
      },
    });
    const before = scene.particleSystems.length;
    vfx.handleEvent(ev("flowerSpawn", { id: 45, x: -12, z: 8 }), 2000);
    expect(requested).toContain(FLOWER_SPAWN_VFX);
    // the spawn cue stays cheap: the dirt-kick doc alone, no layered pop
    expect(scene.particleSystems.length).toBe(before + 1);
    const emitter = scene.particleSystems[scene.particleSystems.length - 1]!.emitter as Vector3;
    expect(emitter.x).toBe(-12);
    expect(emitter.z).toBe(8);
    vfx.dispose();
  });

  it("flowerBurst without the doc falls back to a layered HitSpark impact", () => {
    cover("flower-vfx-events");
    const vfx = new VfxSystem(scene, { entityPos: () => null, vfxDoc: () => null });
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("flowerBurst", { id: 46, x: 1, z: 2, teamId: 0 }), 3000);
    // no doc → the pooled layered impact kit alone still reads as a heal pop
    // (its systems are POOLED: reused from the earlier burst, not re-created)
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]!.slice(0, 3)).toEqual(["heavy", 1, 2]);
    const used = fire.mock.results[0]!.value as { emitter: Vector3 }[];
    expect(used.length).toBe(3); // flash + sparks + smoke
    for (const ps of used) {
      expect(ps.emitter.x).toBe(1);
      expect(ps.emitter.z).toBe(2);
    }
    fire.mockRestore();
    vfx.dispose();
  });

  it("malformed flower events (missing x/z) are ignored", () => {
    cover("flower-vfx-events");
    const vfx = new VfxSystem(scene, { entityPos: () => null, vfxDoc: (k) => greenDoc(k) });
    const systemsBefore = scene.particleSystems.length;
    const meshesBefore = scene.meshes.length;
    vfx.handleEvent(ev("flowerBurst", { id: 47 }), 4000);
    vfx.handleEvent(ev("flowerSpawn", { id: 48, x: 3 }), 4001);
    expect(scene.particleSystems.length).toBe(systemsBefore);
    expect(scene.meshes.length).toBe(meshesBefore);
    vfx.dispose();
  });
});
