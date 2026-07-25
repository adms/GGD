/**
 * editor-09 (editor-vfx-particles): toParticleSystem maps a vfx@1 doc onto a
 * real Babylon ParticleSystem — emitter shape, mode (burst/continuous),
 * lifetime, size/color-over-life, blend mode, texture URL — under NullEngine
 * (no canvas, no network: texture creation is injected).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { PointParticleEmitter } from "@babylonjs/core/Particles/EmitterTypes/pointParticleEmitter";
import { SphereParticleEmitter } from "@babylonjs/core/Particles/EmitterTypes/sphereParticleEmitter";
import { ConeParticleEmitter } from "@babylonjs/core/Particles/EmitterTypes/coneParticleEmitter";
import { cover } from "@ggd/shared/testkit/cover";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { toParticleSystem, burstNow, capacityFor } from "./particles";
import { assetUrl, glbUrlParts } from "./assetUrl";

const BURST_DOC: VfxDoc = zVfxDoc.parse({
  id: "fx.test-burst",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 24,
  lifetimeSec: { min: 0.2, max: 0.6 },
  size: { start: 0.45, end: 0.1 },
  color: { start: [1, 0.6, 0.2, 1], end: [1, 0.2, 0.05, 0] },
  blendMode: "additive",
  texture: "assets/textures/particles/flame_01.png",
});

const CONTINUOUS_DOC: VfxDoc = zVfxDoc.parse({
  id: "fx.test-cone",
  schema: "vfx@1",
  emitter: { shape: "cone", radius: 5, angleDeg: 60 },
  mode: "continuous",
  rate: 120,
  lifetimeSec: { min: 0.4, max: 1.1 },
  size: { start: 0.9, end: 0.2 },
  color: { start: [0.2, 0.5, 1, 1], end: [0.1, 0.1, 0.9, 0] },
  blendMode: "alpha",
});

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterEach(() => {
  scene.dispose();
  engine.dispose();
});

describe("toParticleSystem (vfx@1 -> Babylon)", () => {
  it("maps a burst/point/additive doc: emitter, lifetime, gradients, blend, texture URL", () => {
    cover("editor-vfx-particles");
    let seenUrl: string | null = null;
    const ps = toParticleSystem(BURST_DOC, scene, {
      createTexture: (url) => {
        seenUrl = url;
        return null; // NullEngine test: no image decode
      },
    });

    expect(ps.particleEmitterType).toBeInstanceOf(PointParticleEmitter);
    expect(ps.minLifeTime).toBe(0.2);
    expect(ps.maxLifeTime).toBe(0.6);
    // WC3 contract (task #30): additive → ONEONE
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_ONEONE);
    expect(ps.getCapacity()).toBeGreaterThanOrEqual(24);
    expect(capacityFor(BURST_DOC)).toBeGreaterThanOrEqual(48);

    const sizes = ps.getSizeGradients()!;
    expect(sizes.map((g) => [g.gradient, g.factor1])).toEqual([
      [0, 0.45],
      [1, 0.1],
    ]);

    const colors = ps.getColorGradients()!;
    expect(colors).toHaveLength(2);
    expect(colors[0]!.gradient).toBe(0);
    expect(colors[0]!.color1.asArray()).toEqual([1, 0.6, 0.2, 1]);
    expect(colors[1]!.gradient).toBe(1);
    expect(colors[1]!.color1.asArray()).toEqual([1, 0.2, 0.05, 0]);

    // burst mode: no continuous emission until burstNow()
    expect(ps.emitRate).toBe(0);
    expect(ps.manualEmitCount).toBe(0);
    expect(burstNow(ps, BURST_DOC)).toBe(24);
    expect(ps.manualEmitCount).toBe(24);

    expect(seenUrl).toBe("/content-api/assets/textures/particles/flame_01.png");
    ps.dispose();
  });

  it("maps a continuous/cone/alpha doc: rate, cone radius+angle, standard blend", () => {
    const ps = toParticleSystem(CONTINUOUS_DOC, scene);
    expect(ps.particleEmitterType).toBeInstanceOf(ConeParticleEmitter);
    const cone = ps.particleEmitterType as ConeParticleEmitter;
    expect(cone.radius).toBe(5);
    expect(cone.angle).toBeCloseTo(Math.PI / 3, 10);
    expect(ps.emitRate).toBe(120);
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_STANDARD);
    expect(ps.particleTexture ?? null).toBeNull(); // no texture authored
    // continuous docs never burst
    expect(burstNow(ps, CONTINUOUS_DOC)).toBe(0);
    ps.dispose();
  });

  it("maps a sphere emitter radius", () => {
    const doc = zVfxDoc.parse({
      ...BURST_DOC,
      id: "fx.test-sphere",
      emitter: { shape: "sphere", radius: 1.7 },
      texture: undefined,
    }) as VfxDoc;
    const ps = toParticleSystem(doc, scene);
    expect(ps.particleEmitterType).toBeInstanceOf(SphereParticleEmitter);
    expect((ps.particleEmitterType as SphereParticleEmitter).radius).toBe(1.7);
    ps.dispose();
  });
});

describe("assetUrl", () => {
  it("maps content-relative paths through the content-api and rejects escapes", () => {
    expect(assetUrl("assets/models/champions/blocky-mage.glb")).toBe(
      "/content-api/assets/models/champions/blocky-mage.glb",
    );
    expect(glbUrlParts("assets/models/props/pillar.glb")).toEqual({
      rootUrl: "/content-api/assets/models/props/",
      fileName: "pillar.glb",
    });
    expect(() => assetUrl("../secrets.json")).toThrow(/assets\//);
    expect(() => assetUrl("models/champions/blocky-mage.glb")).toThrow(/assets\//);
  });
});
