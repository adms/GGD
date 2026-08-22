/**
 * client-13 (client-vfx-doc-mapping): the data-driven vfx@1 doc →
 * ParticleSystem factory maps every field (emitter/mode/lifetime/size/color/
 * blendMode/texture) onto the Babylon system. Runs on NullEngine (headless).
 *
 * Task #30 additions:
 *   factory-unify    — one factory serves client + editor (options seam:
 *                      scale / resolveTextureUrl / createTexture), and the
 *                      WC3 extensions map (gravity, speed, stretched+tail,
 *                      multi-stop gradients with 2-stop legacy fallback).
 *   blend-map        — additive→ONEONE, alpha→STANDARD, modulate→MULTIPLY,
 *                      alphaKey→STANDARD.
 *   sprite-sheet-map — rows×cols flipbook → Babylon sprite-cell animation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import { clampFadeOutTail } from "./fadeOut";
import { vfxFadeOutMaxSec } from "./vfxCleanupPolicy";
import {
  toParticleSystem,
  capacityFor,
  blendModeFor,
  burstNow,
  colorStopsFor,
  sizeStopsFor,
  spriteCellMapping,
} from "./particleFactory";

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
};

const CONTINUOUS_DOC: VfxDoc = {
  id: "fx.test-cone",
  schema: "vfx@1",
  emitter: { shape: "cone", radius: 5, angleDeg: 60 },
  mode: "continuous",
  rate: 120,
  lifetimeSec: { min: 0.4, max: 1.1 },
  size: { start: 0.9, end: 0.2 },
  color: { start: [0.5, 0.5, 0.55, 0.7], end: [0.2, 0.2, 0.3, 0] },
  blendMode: "alpha",
  texture: "assets/textures/particles/smoke_05.png",
};

describe("toParticleSystem doc mapping (client-13)", () => {
  it("maps a burst doc: lifetime, gradients, additive blend, no emitRate", () => {
    cover("client-vfx-doc-mapping");
    const ps = toParticleSystem(BURST_DOC, scene);
    // ⏱ GH#569 —— 出貨路徑現在會把「整段都是 fade」的文件夾進尾段上限
    // （`config.vfx-cleanup@1.vfxFadeOutMaxSec`），所以對的是**解析後**的壽命。
    // ⛔ 不抄 0.2 / 0.6：那會是第二個住處，而上限是後台調得到的。
    const life = clampFadeOutTail(BURST_DOC, vfxFadeOutMaxSec()).lifetimeSec;
    expect(ps.minLifeTime).toBe(life.min);
    expect(ps.maxLifeTime).toBe(life.max);
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_ONEONE);
    expect(ps.emitRate).toBe(0);
    const sizes = ps.getSizeGradients()!;
    expect(sizes.map((g) => [g.gradient, g.factor1])).toEqual([
      [0, 0.45],
      [1, 0.1],
    ]);
    const colors = ps.getColorGradients()!;
    expect(colors).toHaveLength(2);
    expect(colors[0]!.color1.r).toBeCloseTo(1);
    expect(colors[0]!.color1.g).toBeCloseTo(0.6);
    expect(colors[1]!.color1.a).toBeCloseTo(0);
    expect(ps.particleTexture?.name).toContain("flame_01.png");
    expect(capacityFor(BURST_DOC)).toBeGreaterThanOrEqual(24);
    ps.dispose();
  });

  it("maps a continuous cone doc: emitRate, cone emitter, alpha blend", () => {
    cover("client-vfx-doc-mapping");
    const ps = toParticleSystem(CONTINUOUS_DOC, scene);
    expect(ps.emitRate).toBe(120);
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_STANDARD);
    // createConeEmitter installs a cone particle emitter type
    expect(ps.particleEmitterType?.constructor.name).toContain("Cone");
    expect(capacityFor(CONTINUOUS_DOC)).toBeGreaterThanOrEqual(120 * 1.1);
    ps.dispose();
  });

  it("maps a sphere emitter doc", () => {
    cover("client-vfx-doc-mapping");
    const ps = toParticleSystem(
      { ...BURST_DOC, id: "fx.test-sphere", emitter: { shape: "sphere", radius: 1.2 } },
      scene,
    );
    expect(ps.particleEmitterType?.constructor.name).toContain("Sphere");
    ps.dispose();
  });
});

describe("unified factory + WC3 extensions (factory-unify)", () => {
  it("options seam: scale, name, texture URL resolution and injection", () => {
    cover("factory-unify");
    let seenUrl = "";
    const ps = toParticleSystem(BURST_DOC, scene, {
      scale: 0.5,
      name: "custom-name",
      resolveTextureUrl: (p) => `/somewhere-else/${p}`,
      createTexture: (url) => {
        seenUrl = url;
        return null; // NullEngine: skip image decode
      },
    });
    expect(ps.name).toBe("custom-name");
    expect(seenUrl).toBe("/somewhere-else/assets/textures/particles/flame_01.png");
    expect(ps.particleTexture ?? null).toBeNull();
    expect(ps.getCapacity()).toBe(capacityFor(BURST_DOC, 0.5));
    // legacy bare-scale third argument still works (VfxSystem call sites)
    const legacy = toParticleSystem(CONTINUOUS_DOC, scene, 0.5);
    expect(legacy.emitRate).toBe(60);
    ps.dispose();
    legacy.dispose();
  });

  it("maps gravityY, speed range, stretched+tailLength and burstNow", () => {
    cover("factory-unify");
    const doc: VfxDoc = {
      ...BURST_DOC,
      id: "fx.test-wc3",
      gravityY: -9.8,
      speed: { min: 0.5, max: 1.75 },
      stretched: true,
      tailLength: 2.5,
    };
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    expect(ps.gravity.y).toBe(-9.8);
    expect(ps.minEmitPower).toBe(0.5);
    expect(ps.maxEmitPower).toBe(1.75);
    expect(ps.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    expect(ps.minScaleY).toBe(2.5);
    expect(ps.maxScaleY).toBe(2.5);
    expect(burstNow(ps, doc)).toBe(24);
    expect(ps.manualEmitCount).toBe(24);
    expect(burstNow(ps, CONTINUOUS_DOC)).toBe(0);
    // defaults stay put when the fields are absent
    const plain = toParticleSystem(BURST_DOC, scene, { createTexture: () => null });
    expect(plain.gravity.y).toBe(0);
    expect(plain.minEmitPower).toBe(1.2);
    expect(plain.maxEmitPower).toBe(3.2);
    expect(plain.billboardMode).not.toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    ps.dispose();
    plain.dispose();
  });

  it("multi-stop gradients override the legacy 2-stop fields", () => {
    cover("factory-unify");
    const doc: VfxDoc = {
      ...BURST_DOC,
      id: "fx.test-stops",
      colorStops: [
        [0, [1, 1, 1, 1]],
        [0.5, [1, 0.5, 0, 0.8]],
        [1, [0, 0, 0, 0]],
      ],
      sizeStops: [
        [0, 0.2],
        [0.3, 1.0],
        [1, 0.05],
      ],
    };
    expect(colorStopsFor(doc).map(([t]) => t)).toEqual([0, 0.5, 1]);
    expect(sizeStopsFor(doc)).toEqual([
      [0, 0.2],
      [0.3, 1.0],
      [1, 0.05],
    ]);
    // legacy fallback when no stops authored
    expect(colorStopsFor(BURST_DOC)).toEqual([
      [0, BURST_DOC.color.start],
      [1, BURST_DOC.color.end],
    ]);
    expect(sizeStopsFor(BURST_DOC)).toEqual([
      [0, 0.45],
      [1, 0.1],
    ]);
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    expect(ps.getColorGradients()!.map((g) => g.gradient)).toEqual([0, 0.5, 1]);
    expect(ps.getSizeGradients()!.map((g) => [g.gradient, g.factor1])).toEqual([
      [0, 0.2],
      [0.3, 1.0],
      [1, 0.05],
    ]);
    ps.dispose();
  });
});

describe("burst emission contract (vfx-burst-contract)", () => {
  // preWarm animate: NullEngine loads no texture, so drive the system
  // directly (0.016s per step) instead of rendering the scene
  const step = (ps: ParticleSystem, frames: number): void => {
    for (let i = 0; i < frames; i++) ps.animate(true);
  };

  it("a burst doc's `rate` is ignored — no trickle, no auto-stop", () => {
    cover("vfx-burst-contract");
    const doc: VfxDoc = { ...BURST_DOC, id: "fx.test-tail", burstCount: 10, rate: 32 };
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    // a burst system cannot rate-emit (Babylon latches manualEmitCount), and
    // the targetStopDuration that used to drive such a "tail" made a pooled
    // system silently swallow every later burst
    expect(ps.emitRate).toBe(0);
    expect(ps.targetStopDuration).toBeFalsy();
    expect(capacityFor(doc)).toBe(20); // burstCount × 2 — no tail headroom

    ps.start();
    expect(burstNow(ps, doc)).toBe(10);
    step(ps, 2);
    expect(ps.particles.length).toBe(10);
    step(ps, 6); // 0.13s in: nothing trickles while the burst is latched
    expect(ps.particles.length).toBe(10);
    step(ps, 50); // past max life (0.6s) — all dead
    expect(ps.particles.length).toBe(0);

    // …and the SAME instance fires again (the pool re-fires its instances)
    if (!ps.isStarted()) ps.start();
    burstNow(ps, doc);
    step(ps, 2);
    expect(ps.particles.length).toBe(10);
    ps.dispose();
  });

  it("proves the latch the impact-first design rests on", () => {
    cover("vfx-burst-contract");
    // WHY docs express their ember tail as a wide lifetime spread instead of
    // a trailing emitRate: even an explicitly-set emitRate stays inert on a
    // manually-burst system until manualEmitCount is put back to -1 (which
    // would leave the pooled instance free-running).
    const doc: VfxDoc = { ...BURST_DOC, id: "fx.test-latch", burstCount: 6 };
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    ps.start();
    ps.emitRate = 60;
    burstNow(ps, doc);
    step(ps, 4);
    expect(ps.particles.length).toBe(6); // the burst — and nothing else
    ps.manualEmitCount = -1; // only this revives the rate branch…
    step(ps, 10);
    expect(ps.particles.length).toBeGreaterThan(6);
    ps.dispose();
  });
});

describe("blend mode mapping (blend-map)", () => {
  it("additive→ONEONE, alpha→STANDARD, modulate→MULTIPLY, alphaKey→STANDARD", () => {
    cover("blend-map");
    expect(blendModeFor("additive")).toBe(ParticleSystem.BLENDMODE_ONEONE);
    expect(blendModeFor("alpha")).toBe(ParticleSystem.BLENDMODE_STANDARD);
    expect(blendModeFor("modulate")).toBe(ParticleSystem.BLENDMODE_MULTIPLY);
    expect(blendModeFor("alphaKey")).toBe(ParticleSystem.BLENDMODE_STANDARD);
    const ps = toParticleSystem(
      { ...BURST_DOC, id: "fx.test-mod", blendMode: "modulate" },
      scene,
      { createTexture: () => null },
    );
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_MULTIPLY);
    ps.dispose();
  });
});

describe("sprite sheet mapping (sprite-sheet-map)", () => {
  it("pure cell math: ids, cell size from texture/cols|rows, cycle speed", () => {
    cover("sprite-sheet-map");
    const m = spriteCellMapping({ rows: 4, cols: 8, cycleSec: 0.5 }, 1.0, 512, 256);
    expect(m.startCell).toBe(0);
    expect(m.endCell).toBe(31);
    expect(m.cellWidth).toBe(64); // 512 / 8
    expect(m.cellHeight).toBe(64); // 256 / 4
    expect(m.changeSpeed).toBe(2); // avg life 1s / 0.5s cycle
    // no cycleSec: one cycle per particle lifetime (Babylon default semantics)
    expect(spriteCellMapping({ rows: 2, cols: 2 }, 0.7, 128, 128).changeSpeed).toBe(1);
  });

  it("factory enables the animation sheet with the doc's cells", () => {
    cover("sprite-sheet-map");
    const doc: VfxDoc = {
      ...BURST_DOC,
      id: "fx.test-sheet",
      spriteSheet: { rows: 2, cols: 4, cycleSec: 0.4, randomStartCell: true },
    };
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    expect(ps.isAnimationSheetEnabled).toBe(true);
    expect(ps.spriteRandomStartCell).toBe(true);
    expect(ps.startSpriteCellID).toBe(0);
    expect(ps.endSpriteCellID).toBe(7);
    // 一個 cycle 0.4s，速度 = 解析後的平均壽命 / cycle（GH#569 之後平均壽命
    // 由尾段上限決定，⛔ 不再是文件寫的 (0.2+0.6)/2）
    const sheetLife = clampFadeOutTail(doc, vfxFadeOutMaxSec()).lifetimeSec;
    expect(ps.spriteCellChangeSpeed).toBeCloseTo((sheetLife.min + sheetLife.max) / 2 / 0.4);
    // cell size uses the fallback grid until the real texture size lands
    expect(ps.spriteCellWidth).toBeGreaterThan(0);
    expect(ps.spriteCellHeight).toBeGreaterThan(0);
    ps.dispose();
  });
});
