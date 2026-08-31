/**
 * task #33 retune (impact-sparks): HitSpark is no longer a per-hit voxel cube
 * — it is a per-hit handle onto the scene-shared pooled ImpactComposer.
 * Legacy call shapes map onto intensities (basic=light, crit/killingBlow=
 * heavy, guardBreak cool-white=ex), repeat hits REUSE pooled systems (zero
 * per-hit allocation), dmgType tints flow into the white-hot→tint→cooled
 * ramp (color identity preserved), and heavy/ex hits add the expanding
 * shockwave ring. Runs on NullEngine.
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
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HitSpark, sparkIntensity, impactComposerFor } from "./HitSpark";
import { impactRecipe, impactTailMs, IMPACT_TINTS } from "./vfxPresets";

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

/** ⭐ 一次命中生幾層 —— 從 recipe 推導（⛔ 這個數字有唯一的住處）。 */
const declaredLayers = (): number => {
  const r = impactRecipe("light", [1, 1, 1]);
  return 3 + (r.debris ? 1 : 0);
};

describe("legacy call-shape → intensity mapping (impact-sparks-retune)", () => {
  it("basic=light, big=heavy, guard-break cool-white=ex, passthrough", () => {
    cover("impact-sparks-retune");
    expect(sparkIntensity(false)).toBe("light");
    expect(sparkIntensity(false, [0.68, 0.5, 1])).toBe("light");
    expect(sparkIntensity(true)).toBe("heavy");
    expect(sparkIntensity(true, IMPACT_TINTS.physical)).toBe("heavy");
    // 破防 fires big + the guard-break tint → the heaviest treatment
    expect(sparkIntensity(true, [0.9, 0.95, 1])).toBe("ex");
    expect(sparkIntensity(true, [0.9004, 0.9502, 0.9998])).toBe("ex"); // eps
    // new callers can pass the intensity directly in place of `big`
    expect(sparkIntensity("ex")).toBe("ex");
    expect(sparkIntensity("heavy", [0.9, 0.95, 1])).toBe("heavy");
  });
});

describe("layered pooled impact kit (impact-sparks-retune)", () => {
  it("a basic hit fires every declared burst layer — no per-hit cube mesh", () => {
    cover("impact-sparks-retune");
    const meshesBefore = scene.meshes.length;
    const systemsBefore = scene.particleSystems.length;
    const spark = new HitSpark(scene, 1, 2, 1000);
    expect(spark.intensity).toBe("light");
    // ⭐ 從 recipe 推導，⛔ 不抄字面值 —— GH#725 AC⑤ 之後多了 `debris`（後台可關）。
    expect(spark.systems).toHaveLength(declaredLayers());
    expect(scene.particleSystems.length).toBe(systemsBefore + declaredLayers());
    expect(scene.meshes.length).toBe(meshesBefore); // the old cube is gone
    for (const ps of spark.systems) {
      expect((ps.emitter as Vector3).x).toBe(1);
      expect((ps.emitter as Vector3).z).toBe(2);
      expect(ps.manualEmitCount).toBeGreaterThan(0); // BURST, not trickle
      expect(ps.emitRate).toBe(0);
    }
    // layer identity: 1–3-frame core flash, gravity-stretched sparks,
    // standard-blend smoke body; light hits have no shockwave ring
    expect(spark.systems[0]!.maxLifeTime).toBeLessThanOrEqual(3 / 60);
    expect(spark.systems[1]!.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    expect(spark.systems[1]!.gravity.y).toBeLessThan(0);
    expect(spark.systems[2]!.blendMode).toBe(ParticleSystem.BLENDMODE_STANDARD);
    expect(impactComposerFor(scene).activeRingCount).toBe(0);
  });

  it("repeat hits REUSE the pooled systems — zero per-hit allocation", () => {
    cover("impact-sparks-retune");
    const s1 = new HitSpark(scene, 0, 0, 3000);
    const count = scene.particleSystems.length;
    const s2 = new HitSpark(scene, 4, 4, 3700); // layers idle (max life 600ms)
    expect(scene.particleSystems.length).toBe(count);
    expect(s2.systems).toEqual(s1.systems); // exact pooled instances
    // …but same-frame hits each get their own free-list instance
    const s3 = new HitSpark(scene, 9, 9, 3700);
    expect(s3.systems[0]).not.toBe(s2.systems[0]);
  });

  it("dmgType tint flows into the white-hot→tint→cooled ramp", () => {
    cover("impact-sparks-retune");
    const spark = new HitSpark(scene, 0, 0, 5000, false, 200, [0.68, 0.5, 1]);
    const stops = spark.systems[1]!.getColorGradients()!; // sparks layer
    expect(stops.length).toBe(4);
    // white-hot core first, then the FULL arcane tint (identity preserved)
    expect(stops[0]!.color1.r).toBe(1);
    expect(stops[0]!.color1.g).toBe(1);
    expect(stops[0]!.color1.b).toBe(1);
    expect(stops[1]!.color1.r).toBeCloseTo(0.68);
    expect(stops[1]!.color1.g).toBeCloseTo(0.5);
    expect(stops[1]!.color1.b).toBeCloseTo(1);
    // fade to nothing at the end
    expect(stops[3]!.color1.a).toBe(0);
  });

  it("heavy (crit/killingBlow) adds the shockwave ring and expires it", () => {
    cover("impact-sparks-retune");
    const spark = new HitSpark(scene, 2, 3, 6000, true, 260, IMPACT_TINTS.physical);
    expect(spark.intensity).toBe("heavy");
    expect(impactComposerFor(scene).activeRingCount).toBe(1);
    expect(spark.done).toBe(false);
    // ⭐ GH#741 —— 這幾個時刻**從 recipe 推導**，⛔ 不抄出貨的毫秒數：煙的壽命
    //    現在逐級距分級（收尾預算），而抄一份就是第四個住處（第〇·四守則）。
    const heavyRing = impactRecipe("heavy", IMPACT_TINTS.physical).ring!.lifeMs;
    const heavyTail = impactTailMs("heavy");
    spark.update(6000 + heavyRing + 1); // ring expired; the smoke body is still alive
    expect(impactComposerFor(scene).activeRingCount).toBe(0);
    expect(spark.done).toBe(false);
    spark.update(6000 + heavyTail); // longest layer (the smoke body) finished
    expect(spark.done).toBe(true);
  });

  it("guardBreak (破防) gets the EX treatment: max layers + ring", () => {
    cover("impact-sparks-retune");
    // exactly VfxSystem's guardBreak call shape
    const spark = new HitSpark(scene, 0, 0, 8000, true, 280, [0.9, 0.95, 1]);
    expect(spark.intensity).toBe("ex");
    const ex = impactRecipe("ex", IMPACT_TINTS.guardBreak);
    expect(spark.systems[1]!.manualEmitCount).toBe(ex.sparks.count); // 56 shards
    expect(impactComposerFor(scene).activeRingCount).toBe(1);
  });

  it("dispose() drops the handle only — pooled systems stay for the next hit", () => {
    cover("impact-sparks-retune");
    const spark = new HitSpark(scene, 1, 1, 10000);
    const count = scene.particleSystems.length;
    // 同上：時刻從 `impactTailMs` 推導，⛔ 不是抄 600ms（light 現在短很多）。
    const tail = impactTailMs(spark.intensity);
    spark.update(10000 + tail - 1);
    expect(spark.done).toBe(false);
    spark.update(10000 + tail);
    expect(spark.done).toBe(true);
    spark.dispose();
    expect(scene.particleSystems.length).toBe(count);
    expect(scene.particleSystems).toContain(spark.systems[0]);
  });

  it("one composer per scene, disposed with the scene", () => {
    cover("impact-sparks-retune");
    expect(impactComposerFor(scene)).toBe(impactComposerFor(scene));
    const other = new Scene(engine);
    expect(impactComposerFor(other)).not.toBe(impactComposerFor(scene));
    new HitSpark(other, 0, 0, 1000, "ex");
    expect(other.particleSystems.length).toBe(declaredLayers());
    other.dispose(); // scene teardown disposes the shared composer + rings
    expect(other.particleSystems.length).toBe(0);
    expect(scene.particleSystems.length).toBeGreaterThan(0); // main untouched
  });
});
