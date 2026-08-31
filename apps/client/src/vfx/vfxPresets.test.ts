/**
 * task #33 toolkit phase — vfxPresets: pure gradient/recipe helpers hit the
 * AAA target ranges (monotonic stops, 24–80 impact bursts, short lifetimes,
 * front-loaded energy), the burst factory maps every knob onto Babylon, the
 * keyed pool reuses instead of allocating (grow→idle-reuse→LRU-steal→reap),
 * and the impact composer layers flash+sparks+smoke(+ring) from one call.
 * Runs on NullEngine (createTexture: () => null skips image decode).
 */
import {
  impactRecipe, describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  stopsAscending,
  hotToCoolStops,
  popShrinkStops,
  softBodyColorStops,
  frontLoadCounts,
  scaledCount,
  capacityForCount,
  HARD_CAPACITY_CAP,
  makeBurstSystem,
  fireBurst,
  BurstPool,
  MAX_POOL_PER_KEY,
  IDLE_REAP_MS,
  ringShape,
  impactRecipe,
  ImpactComposer,
  IMPACT_TINTS,
  MAX_RINGS,
  type BurstSpec,
  type ImpactIntensity,
  type RingSpec,
} from "./vfxPresets";
import { RIBBON_FADE_BUDGET_SEC } from "./ribbonMath";
import {
  MAX_TRAIL_LIFE_SEC,
  SHIPPED_TRAIL_LIFE,
  resolveProjectileArt,
} from "../render/views/projectileArt";

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

const NO_TEX = { createTexture: (): null => null };

const SPEC: BurstSpec = {
  count: 32,
  lifetimeSec: { min: 0.15, max: 0.3 },
  speed: { min: 4, max: 9 },
  sizeStops: popShrinkStops(0.2),
  colorStops: hotToCoolStops([1, 0.72, 0.28]),
  blend: "additive",
  gravityY: -14,
  drag: 0.4,
  stretched: true,
  tailLength: 2.2,
  emitterRadius: 0.15,
  texture: "assets/textures/particles/spark_05_rotated.png",
};

describe("pure gradient helpers (vfx-preset-gradients)", () => {
  it("hotToCoolStops: 4 monotonic stops, white-hot start, transparent end", () => {
    cover("vfx-preset-toolkit");
    const stops = hotToCoolStops([1, 0.5, 0.2]);
    expect(stops).toHaveLength(4);
    expect(stopsAscending(stops)).toBe(true);
    // white-hot core at t=0, full alpha
    expect(stops[0]![1]).toEqual([1, 1, 1, 1]);
    // full tint at the hot stop
    expect(stops[1]![1].slice(0, 3)).toEqual([1, 0.5, 0.2]);
    // alpha: sharp in (peak at start), exponential-ish out (mid < peak, end 0)
    const alphas = stops.map(([, c]) => c[3]);
    expect(alphas[0]).toBe(1);
    expect(alphas[2]).toBeLessThan(alphas[1]!);
    expect(alphas[3]).toBe(0);
    // knobs: peakAlpha + hotT respected, stops stay monotonic
    const soft = hotToCoolStops([0.5, 0.5, 1], { peakAlpha: 0.6, hotT: 0.3 });
    expect(soft[0]![1][3]).toBe(0.6);
    expect(soft[1]![0]).toBe(0.3);
    expect(stopsAscending(soft)).toBe(true);
  });

  it("popShrinkStops: overshoot to peak then shrink to nothing", () => {
    cover("vfx-preset-toolkit");
    const stops = popShrinkStops(1.5);
    expect(stopsAscending(stops)).toBe(true);
    // starts under peak, pops to peak, ends at 0 (never constant-size)
    expect(stops[0]![1]).toBeLessThan(1.5);
    expect(stops[1]![1]).toBe(1.5);
    expect(stops[2]![1]).toBe(0);
    // endFrac knob keeps a remnant
    expect(popShrinkStops(2, { endFrac: 0.4 })[2]![1]).toBeCloseTo(0.8);
    // all sizes non-negative
    for (const [, s] of stops) expect(s).toBeGreaterThanOrEqual(0);
  });

  it("softBodyColorStops: constant hue, low alpha in, fade to 0", () => {
    cover("vfx-preset-toolkit");
    const stops = softBodyColorStops([0.45, 0.45, 0.5], 0.3);
    expect(stopsAscending(stops)).toBe(true);
    for (const [, c] of stops) {
      expect(c.slice(0, 3)).toEqual([0.45, 0.45, 0.5]);
      expect(c[3]).toBeLessThanOrEqual(0.3); // stays a body layer, never a wall
    }
    expect(stops[0]![1][3]).toBe(0.3);
    expect(stops[stops.length - 1]![1][3]).toBe(0);
  });

  it("stopsAscending rejects unsorted/duplicate ts", () => {
    cover("vfx-preset-toolkit");
    expect(stopsAscending([[0, 1], [0.5, 1], [1, 1]])).toBe(true);
    expect(stopsAscending([[0, 1], [0.5, 1], [0.5, 1]])).toBe(false);
    expect(stopsAscending([[0.6, 1], [0.5, 1]])).toBe(false);
  });

  it("frontLoadCounts: same energy, 75/25 burst/tail split by default", () => {
    cover("vfx-preset-toolkit");
    // the median godie trickle: rate 40 over a 0.65s window ⇒ front-load it
    const { burstCount, tailRate } = frontLoadCounts(40, 0.5);
    expect(burstCount).toBe(15); // ceil(40*0.5*0.75) — lands at t=0
    expect(tailRate).toBe(10); // 25% kept as a sparse tail
    expect(burstCount).toBeGreaterThan(tailRate * 0.5); // energy is impact-first
    // tailShare 0 = pure burst; degenerate inputs stay sane
    expect(frontLoadCounts(40, 0.5, 0)).toEqual({ burstCount: 20, tailRate: 0 });
    expect(frontLoadCounts(1, 0.05).burstCount).toBeGreaterThanOrEqual(1);
  });
});

describe("burst factory (vfx-preset-factory)", () => {
  it("scaledCount / capacityForCount: mobile halving, floors and hard cap", () => {
    cover("vfx-preset-toolkit");
    expect(scaledCount(24, 0.5)).toBe(12);
    expect(scaledCount(1, 0.1)).toBe(1); // never 0
    expect(capacityForCount(32)).toBe(64); // 2 bursts in flight
    expect(capacityForCount(2)).toBe(8); // floor
    expect(capacityForCount(4000)).toBe(HARD_CAPACITY_CAP); // overdraw cap
  });

  it("maps every BurstSpec knob onto the ParticleSystem", () => {
    cover("vfx-preset-toolkit");
    const ps = makeBurstSystem(SPEC, scene, { ...NO_TEX, name: "spark-test" });
    expect(ps.name).toBe("spark-test");
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_ONEONE);
    expect(ps.minLifeTime).toBe(0.15);
    expect(ps.maxLifeTime).toBe(0.3);
    expect(ps.minEmitPower).toBe(4);
    expect(ps.maxEmitPower).toBe(9);
    expect(ps.gravity.y).toBe(-14);
    expect(ps.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    expect(ps.minScaleY).toBe(2.2);
    expect(ps.getDragGradients()!.length).toBe(2);
    expect(ps.getSizeGradients()!.length).toBe(3);
    expect(ps.getColorGradients()!.length).toBe(4);
    expect(ps.particleEmitterType?.constructor.name).toContain("Sphere");
    // burst discipline: no continuous trickle
    expect(ps.emitRate).toBe(0);
    expect(ps.getCapacity()).toBe(capacityForCount(32));
    ps.dispose();
  });

  it("smoke-style spec: standard blend, point emitter, no stretch/drag opt-in", () => {
    cover("vfx-preset-toolkit");
    const smoke: BurstSpec = {
      count: 8,
      lifetimeSec: { min: 0.4, max: 0.6 },
      speed: { min: 0.6, max: 1.6 },
      sizeStops: popShrinkStops(0.7),
      colorStops: softBodyColorStops([0.45, 0.45, 0.5], 0.3),
      blend: "alpha",
    };
    const ps = makeBurstSystem(smoke, scene, NO_TEX);
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_STANDARD);
    expect(ps.particleEmitterType?.constructor.name).toContain("Point");
    expect(ps.gravity.y).toBe(0);
    expect(ps.getDragGradients() ?? []).toHaveLength(0);
    expect(ps.billboardMode).not.toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    ps.dispose();
  });

  it("fireBurst queues the quality-scaled count as a manual burst", () => {
    cover("vfx-preset-toolkit");
    const ps = makeBurstSystem(SPEC, scene, NO_TEX);
    expect(fireBurst(ps, SPEC)).toBe(32);
    expect(ps.manualEmitCount).toBe(32);
    expect(fireBurst(ps, SPEC, 0.5)).toBe(16); // mobile budget halves
    ps.dispose();
  });
});

describe("BurstPool reuse semantics (vfx-preset-pool)", () => {
  it("same-frame replays get distinct systems; idle instances are reused", () => {
    cover("vfx-preset-toolkit");
    const pool = new BurstPool(scene, NO_TEX);
    const a = pool.fireAt("k", SPEC, 0, 0, 1, 1000);
    const b = pool.fireAt("k", SPEC, 5, 5, 1, 1000);
    expect(a).not.toBe(b); // both busy at the same nowMs
    expect((a.emitter as Vector3).x).toBe(0);
    expect((b.emitter as Vector3).x).toBe(5);
    expect(pool.countFor("k")).toBe(2);
    // after lifetime.max the first instance is idle → reused, no growth
    const c = pool.fireAt("k", SPEC, 9, 9, 1, 1000 + SPEC.lifetimeSec.max * 1000);
    expect([a, b]).toContain(c);
    expect(pool.countFor("k")).toBe(2);
    pool.dispose();
  });

  it("caps the free-list and LRU-steals beyond it", () => {
    cover("vfx-preset-toolkit");
    const pool = new BurstPool(scene, NO_TEX);
    const seen: ParticleSystem[] = [];
    for (let i = 0; i < MAX_POOL_PER_KEY; i++) seen.push(pool.fireAt("k", SPEC, i, 0, 1, 2000 + i));
    expect(pool.countFor("k")).toBe(MAX_POOL_PER_KEY);
    // all busy → the least-recently-used (first fired) is stolen
    const stolen = pool.fireAt("k", SPEC, 99, 0, 1, 2000 + MAX_POOL_PER_KEY);
    expect(stolen).toBe(seen[0]);
    expect(pool.countFor("k")).toBe(MAX_POOL_PER_KEY);
    pool.dispose();
  });

  it("update() auto-disposes systems idle past the reap window", () => {
    cover("vfx-preset-toolkit");
    const pool = new BurstPool(scene, NO_TEX);
    const ps = pool.fireAt("k", SPEC, 0, 0, 1, 5000);
    expect(scene.particleSystems).toContain(ps);
    pool.update(5000 + IDLE_REAP_MS - 1); // not yet
    expect(pool.countFor("k")).toBe(1);
    pool.update(5000 + IDLE_REAP_MS); // reaped + disposed
    expect(pool.countFor("k")).toBe(0);
    expect(scene.particleSystems).not.toContain(ps);
    pool.dispose();
  });
});

describe("impact recipes hit the AAA target ranges (vfx-preset-recipe)", () => {
  const intensities: ImpactIntensity[] = ["light", "heavy", "ex"];

  it("per-layer counts, lifetimes, blends and physics are in range", () => {
    cover("vfx-preset-toolkit");
    for (const i of intensities) {
      const r = impactRecipe(i, IMPACT_TINTS.physical);
      // sparks are the impact burst: 24–80 particles
      expect(r.sparks.count).toBeGreaterThanOrEqual(24);
      expect(r.sparks.count).toBeLessThanOrEqual(80);
      // core flash: 1–3 frames at 60fps
      expect(r.flash.lifetimeSec.min).toBeGreaterThanOrEqual(1 / 60);
      expect(r.flash.lifetimeSec.max).toBeLessThanOrEqual(3 / 60);
      // sparks short-lived (0.15–0.5), smoke body may reach 0.6
      expect(r.sparks.lifetimeSec.min).toBeGreaterThanOrEqual(0.15);
      expect(r.sparks.lifetimeSec.max).toBeLessThanOrEqual(0.5);
      expect(r.smoke.lifetimeSec.max).toBeLessThanOrEqual(0.6);
      // layer blends: flash/sparks additive, smoke standard (weight layer)
      expect(r.flash.blend).toBe("additive");
      expect(r.sparks.blend).toBe("additive");
      expect(r.smoke.blend).toBe("alpha");
      // sparks fall under gravity, stretched along velocity, with drag
      expect(r.sparks.gravityY!).toBeLessThan(0);
      expect(r.sparks.stretched).toBe(true);
      expect(r.sparks.drag!).toBeGreaterThan(0);
      // smoke alpha stays low (body, not wall)
      for (const [, c] of r.smoke.colorStops) expect(c[3]).toBeLessThanOrEqual(0.4);
      // every gradient is a valid monotonic ramp
      for (const layer of [r.flash, r.sparks, r.smoke]) {
        expect(stopsAscending(layer.sizeStops)).toBe(true);
        expect(stopsAscending(layer.colorStops)).toBe(true);
      }
    }
  });

  it("intensity scales up: ex > heavy > light; ring only on heavy/ex", () => {
    cover("vfx-preset-toolkit");
    const light = impactRecipe("light", IMPACT_TINTS.physical);
    const heavy = impactRecipe("heavy", IMPACT_TINTS.physical);
    const ex = impactRecipe("ex", IMPACT_TINTS.physical);
    expect(heavy.sparks.count).toBeGreaterThan(light.sparks.count);
    expect(ex.sparks.count).toBeGreaterThan(heavy.sparks.count);
    expect(ex.flash.count).toBeGreaterThan(light.flash.count);
    expect(light.ring).toBeUndefined();
    expect(heavy.ring).toBeDefined();
    expect(ex.ring).toBeDefined();
    expect(ex.ring!.endRadius).toBeGreaterThan(heavy.ring!.endRadius);
    // tint flows into the spark ramp (full-tint stop matches)
    const magic = impactRecipe("heavy", IMPACT_TINTS.magic);
    expect(magic.sparks.colorStops[1]![1].slice(0, 3)).toEqual([...IMPACT_TINTS.magic]);
  });

  it("ringShape: ease-out expansion, (1-t)^2 fade, clamped", () => {
    cover("vfx-preset-toolkit");
    const spec: RingSpec = { startRadius: 0.3, endRadius: 1.7, lifeMs: 240, alpha: 0.8 };
    expect(ringShape(0, spec)).toEqual({ radius: 0.3, alpha: 0.8 });
    expect(ringShape(1, spec).radius).toBeCloseTo(1.7);
    expect(ringShape(1, spec).alpha).toBe(0);
    // monotonic: radius grows, alpha falls
    let prev = ringShape(0, spec);
    for (let t = 0.1; t <= 1; t += 0.1) {
      const cur = ringShape(t, spec);
      expect(cur.radius).toBeGreaterThanOrEqual(prev.radius);
      expect(cur.alpha).toBeLessThanOrEqual(prev.alpha);
      prev = cur;
    }
    expect(ringShape(2, spec).alpha).toBe(0); // clamped past end
  });
});

/**
 * ⭐ 一次 `fire()` 會生幾層 —— **從 recipe 推導**，⛔ 不抄字面值。
 * GH#725 AC⑤ 加了 `debris`（後台可關）⇒ 這個數字**會變**，而它有一個唯一的住處。
 */
const declaredLayers = (i: "light" | "medium" | "heavy" | "ex"): number => {
  const r = impactRecipe(i, [1, 1, 1]);
  return 3 + (r.debris ? 1 : 0);
};

describe("ImpactComposer layering + pooling (vfx-preset-composer)", () => {
  it("one call fires every layer the recipe declares; light has no ring, heavy/ex do", () => {
    cover("vfx-preset-toolkit");
    const composer = new ImpactComposer(scene, NO_TEX);
    const light = composer.fire("light", 1, 2, 1000);
    // ⭐ 從 **recipe** 推導層數，⛔ 不抄字面值（第零守則：出貨數字住進測試＝第四個住處）。
    //    GH#725 AC⑤ 之後多了 `debris`（後台可關 ⇒ 這個數字會變）。
    expect(light).toHaveLength(declaredLayers("light"));
    expect(composer.activeRingCount).toBe(0);
    composer.fire("heavy", 3, 4, 1000);
    expect(composer.activeRingCount).toBe(1);
    composer.fire("ex", 5, 6, 1000);
    expect(composer.activeRingCount).toBe(2);
    // layers land at the impact point with a queued burst
    for (const ps of light) {
      expect((ps.emitter as Vector3).x).toBe(1);
      expect(ps.manualEmitCount).toBeGreaterThan(0);
    }
    composer.dispose();
  });

  it("repeat hits REUSE pooled systems — no allocation per hit", () => {
    cover("vfx-preset-toolkit");
    const composer = new ImpactComposer(scene, NO_TEX);
    const first = composer.fire("light", 0, 0, 1000);
    const countAfterFirst = scene.particleSystems.length;
    // next hit lands after the layers' lifetimes have expired → pure reuse
    const second = composer.fire("light", 2, 2, 1000 + 700);
    expect(scene.particleSystems.length).toBe(countAfterFirst);
    expect(second).toEqual(first); // exact same pooled instances
    // a different tint bakes different gradients → its own pooled systems
    composer.fire("light", 0, 0, 1000 + 700, { tint: IMPACT_TINTS.magic });
    // ⭐ 一個**新的 tint** 開一組新的池子 —— 層數同上由 recipe 推導。
    expect(scene.particleSystems.length).toBe(countAfterFirst + declaredLayers("light"));
    composer.dispose();
  });

  it("rings expire via update(), pool caps at MAX_RINGS, quality scale halves counts", () => {
    cover("vfx-preset-toolkit");
    const composer = new ImpactComposer(scene, NO_TEX);
    composer.fire("heavy", 0, 0, 1000);
    composer.update(1000 + 239);
    expect(composer.activeRingCount).toBe(1);
    composer.update(1000 + 240); // ring life over → back to the free list
    expect(composer.activeRingCount).toBe(0);
    // ring pool caps: MAX_RINGS+2 same-frame heavies still only MAX_RINGS rings
    for (let i = 0; i < MAX_RINGS + 2; i++) composer.fire("heavy", i, 0, 2000);
    expect(composer.activeRingCount).toBe(MAX_RINGS);
    // quality scale flows into the burst counts (mobile halving)
    const scaled = composer.fire("light", 0, 0, 4000, { scale: 0.5 });
    const full = impactRecipe("light", IMPACT_TINTS.physical);
    expect(scaled[1]!.manualEmitCount).toBe(Math.ceil(full.sparks.count * 0.5));
    composer.dispose();
    expect(composer.activeRingCount).toBe(0);
  });

  it("dispose() removes every pooled system from the scene", () => {
    cover("vfx-preset-toolkit");
    const composer = new ImpactComposer(scene, NO_TEX);
    const before = scene.particleSystems.length;
    composer.fire("ex", 0, 0, 1000);
    expect(scene.particleSystems.length).toBe(before + declaredLayers("ex"));
    composer.dispose();
    expect(scene.particleSystems.length).toBe(before);
  });
});

/* ------------------------------------------------- GH#44 收尾預算是一條契約 */

/**
 * 專案自己在 `ribbonMath.ts` 寫下 `RIBBON_FADE_BUDGET_SEC`：「刀停下來之後這麼久，
 * 整條光要完全消失」。刀光遵守它，⛔ 投射物拖尾原本不遵守（出貨 0.3s，而文件驅動
 * 的上界更是 0.5s ＝ 契約的兩倍），而**沒有任何測試會在有人把尾巴放長時叫出來**：
 * 舊斷言 `trail.maxLifeTime <= 0.35` 是把當時的值當允許值抄進測試。
 *
 * ⭐ 這一條從**契約常數推導**，⛔ 不抄 0.24／0.25 —— owner 哪天放寬收尾預算，
 * 這條守衛自動跟著放寬（第零守則：出貨值住進測試 = 第四個沒有守衛的住處）。
 */
describe("投射物拖尾守專案自己的收尾預算 (GH#44)", () => {
  it("出貨值與文件驅動的上界都在 RIBBON_FADE_BUDGET_SEC 之內", () => {
    cover("vfx-preset-toolkit");
    expect(SHIPPED_TRAIL_LIFE.max).toBeLessThanOrEqual(RIBBON_FADE_BUDGET_SEC);
    expect(SHIPPED_TRAIL_LIFE.min).toBeLessThan(SHIPPED_TRAIL_LIFE.max);
    // 上界本身就是契約：任何一份 vfx 文件都翻不出這條牆
    expect(MAX_TRAIL_LIFE_SEC).toBeLessThanOrEqual(RIBBON_FADE_BUDGET_SEC);
    // 拿一份壽命長到離譜的爆點文件（1–6 秒）跑真的解析器，證明它被夾回契約內
    const doc = {
      lifetimeSec: { min: 1, max: 6 },
      size: { start: 0.5 },
      blendMode: "additive",
      burstCount: 18,
    } as unknown as Parameters<typeof resolveProjectileArt>[0];
    const art = resolveProjectileArt(doc, 0.5, {
      artFromDoc: true,
      radiusGain: 1,
      flyHeightY: 1,
    });
    expect(art.trailLife.max).toBeLessThanOrEqual(RIBBON_FADE_BUDGET_SEC);
  });
});
