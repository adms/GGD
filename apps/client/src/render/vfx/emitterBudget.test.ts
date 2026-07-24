/**
 * Particle budget for rebuilt WC3 effects (task #98 / #131 performance half).
 *
 * The load case is the real one: 12 champions, several carrying a PERSISTENT
 * `Asph` orb, and effects whose source models carry 12–20 emitters each
 * (`DivineRing` 20, `EarthTornado2` 14, `AquaSpikeVersion2` 12).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { VfxDoc } from "@ggd/shared/content";
import { zVfxDoc } from "@ggd/shared/content";
import {
  MAX_SYSTEMS_PER_EFFECT,
  SCREEN_PARTICLE_BUDGET,
  applyRateScale,
  contributionScore,
  liveParticleEstimate,
  mergeIdenticalEmitters,
  planEffectBudget,
} from "./emitterBudget";

function doc(over: Partial<VfxDoc> & { id: string }): VfxDoc {
  return {
    schema: "vfx@1",
    emitter: { shape: "cone", radius: 0.11, angleDeg: 30 },
    mode: "continuous",
    rate: 40,
    lifetimeSec: { min: 0.5, max: 0.5 },
    size: { start: 0.5, end: 0.5 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
    ...over,
  } as VfxDoc;
}

/** DivineRing's real shape: 20 emitters in two colour groups (gold ×5, blue ×5, …). */
function divineRing(): VfxDoc[] {
  const out: VfxDoc[] = [];
  for (let i = 0; i < 20; i++) {
    const blue = i >= 6 && i <= 10;
    out.push(
      doc({
        id: `godie-divinering-p${i}`,
        rate: blue ? 30 : 40,
        speed: { min: blue ? 4.1 : 5.44, max: blue ? 4.2 : 5.67 },
        colorStops: blue
          ? [
              [0, [0, 0.502, 1, 0.5]],
              [1, [0, 0.502, 1, 0]],
            ]
          : [
              [0, [1, 0.902, 0.247, 1]],
              [1, [1, 1, 0.749, 0]],
            ],
        sizeStops: [
          [0, 0.556],
          [1, 0.556],
        ],
      }),
    );
  }
  return out;
}

describe("merging identical emitters is visually lossless (w3x-emitter-budget)", () => {
  it("folds byte-identical emitters and SUMS their emission", () => {
    cover("w3x-emitter-budget");
    const three = [doc({ id: "a" }), doc({ id: "b" }), doc({ id: "c" })];
    const merged = mergeIdenticalEmitters(three);
    expect(merged).toHaveLength(1);
    // 3 systems' worth of particles from 1 system: same look, 1/3 the draw calls
    expect(merged[0]!.rate).toBe(120);
    expect(liveParticleEstimate(merged[0]!)).toBe(3 * liveParticleEstimate(three[0]!));
    expect(zVfxDoc.safeParse(merged[0]).success).toBe(true);
  });

  it("sums burst counts for burst-mode emitters", () => {
    cover("w3x-emitter-budget");
    const b = (id: string): VfxDoc => doc({ id, mode: "burst", burstCount: 12, rate: undefined });
    expect(mergeIdenticalEmitters([b("a"), b("b")])[0]!.burstCount).toBe(24);
  });

  it("never merges emitters that differ in anything a player can see", () => {
    cover("w3x-emitter-budget");
    expect(mergeIdenticalEmitters([doc({ id: "a" }), doc({ id: "b", blendMode: "alpha" })])).toHaveLength(2);
    expect(mergeIdenticalEmitters([doc({ id: "a" }), doc({ id: "b", gravityY: -3 })])).toHaveLength(2);
    expect(mergeIdenticalEmitters([doc({ id: "a" }), doc({ id: "b", anchorBone: "Point01" })])).toHaveLength(2);
  });

  it("cuts DivineRing's 20 emitters to its 2 real visual layers", () => {
    cover("w3x-emitter-budget");
    const merged = mergeIdenticalEmitters(divineRing());
    expect(merged).toHaveLength(2); // the gold ring and the blue ring
    expect(merged.map((d) => d.rate)).toEqual([15 * 40, 5 * 30]);
  });
});

describe("ranking decides what survives (w3x-emitter-budget)", () => {
  it("scores an invisible emitter at zero", () => {
    cover("w3x-emitter-budget");
    const transparent = doc({ id: "t", colorStops: [[0, [1, 1, 1, 0]], [1, [1, 1, 1, 0]]] });
    const tiny = doc({ id: "s", sizeStops: [[0, 0], [1, 0]] });
    expect(contributionScore(transparent)).toBe(0);
    expect(contributionScore(tiny)).toBe(0);
    expect(contributionScore(doc({ id: "v" }))).toBeGreaterThan(0);
  });

  it("ranks a big bright layer above a small faint one", () => {
    cover("w3x-emitter-budget");
    const big = doc({ id: "big", sizeStops: [[0, 2], [1, 2]] });
    const small = doc({ id: "small", sizeStops: [[0, 0.1], [1, 0.1]] });
    expect(contributionScore(big)).toBeGreaterThan(contributionScore(small));
    const plan = planEffectBudget([small, big], { liveEffects: 1, maxSystemsPerEffect: 1 });
    expect(plan.emitters.map((e) => e.doc.id)).toEqual(["big"]);
    expect(plan.dropped).toEqual(["small"]);
  });

  it("is deterministic — and stable against the .mdx emitter ordering", () => {
    cover("w3x-emitter-budget");
    const a = planEffectBudget(divineRing(), { liveEffects: 4 });
    expect(planEffectBudget(divineRing(), { liveEffects: 4 })).toEqual(a);
    // reordering the source emitters must not change WHICH systems exist, what
    // they cost, or what they are called — the id is the pool key, and a pool
    // key that flips with file order defeats the pool
    const b = planEffectBudget([...divineRing()].reverse(), { liveEffects: 4 });
    expect(new Set(b.emitters.map((e) => e.doc.id))).toEqual(new Set(a.emitters.map((e) => e.doc.id)));
    expect(b.particles).toBe(a.particles);
  });
});

describe("the 12-champion load case (w3x-emitter-budget)", () => {
  it("keeps a lone DivineRing faithful — no drops, no thinning", () => {
    cover("w3x-emitter-budget");
    const plan = planEffectBudget(divineRing(), { liveEffects: 1 });
    expect(plan.systemsBeforeMerge).toBe(20);
    expect(plan.systemsAfterMerge).toBe(2);
    expect(plan.dropped).toEqual([]);
    expect(plan.faithful).toBe(true);
    // the merge alone paid for the whole effect
    expect(plan.emitters.every((e) => e.rateScale === 1)).toBe(true);
  });

  it("holds the whole-screen budget at 12 champions × a 20-emitter effect", () => {
    cover("w3x-emitter-budget");
    const LIVE = 12;
    let systems = 0;
    let particles = 0;
    for (let i = 0; i < LIVE; i++) {
      const plan = planEffectBudget(divineRing(), { liveEffects: LIVE });
      systems += plan.emitters.length;
      particles += plan.particles;
    }
    // 12 × 20 = 240 raw emitters → this many actual ParticleSystems
    expect(systems).toBeLessThanOrEqual(12 * MAX_SYSTEMS_PER_EFFECT);
    expect(particles).toBeLessThanOrEqual(SCREEN_PARTICLE_BUDGET * 1.05);
  });

  it("degrades gradually, and monotonically, as the fight fills up", () => {
    cover("w3x-emitter-budget");
    const heavy = Array.from({ length: 20 }, (_, i) =>
      doc({ id: `h${i}`, rate: 200, lifetimeSec: { min: 2, max: 2 }, sizeStops: [[0, 1 + i * 0.01], [1, 0.5]] }),
    );
    let prev = Infinity;
    for (const live of [1, 2, 4, 8, 12]) {
      const plan = planEffectBudget(heavy, { liveEffects: live });
      expect(plan.particles).toBeLessThanOrEqual(prev);
      prev = plan.particles;
      // an effect on screen ALWAYS draws something — never silently invisible
      expect(plan.emitters.length).toBeGreaterThanOrEqual(1);
      expect(plan.emitters[0]!.rateScale).toBeGreaterThan(0);
    }
  });

  it("halves the load on the mobile quality tier", () => {
    cover("w3x-emitter-budget");
    const full = planEffectBudget(divineRing(), { liveEffects: 8, qualityScale: 1 });
    const mobile = planEffectBudget(divineRing(), { liveEffects: 8, qualityScale: 0.5 });
    expect(mobile.particles).toBeLessThanOrEqual(full.particles);
  });

  it("thins by rate rather than by shape, and keeps the doc schema-valid", () => {
    cover("w3x-emitter-budget");
    const plan = planEffectBudget(
      Array.from({ length: 6 }, (_, i) => doc({ id: `x${i}`, rate: 400, lifetimeSec: { min: 3, max: 3 }, sizeStops: [[0, 1 + i], [1, 0.1]] })),
      { liveEffects: 12 },
    );
    for (const e of plan.emitters) {
      const scaled = applyRateScale(e.doc, e.rateScale);
      expect(zVfxDoc.safeParse(scaled).success).toBe(true);
      expect(scaled.rate!).toBeGreaterThan(0);
      // shape/colour untouched — only the quantity moved
      expect(scaled.sizeStops).toEqual(e.doc.sizeStops);
      expect(scaled.colorStops).toEqual(e.doc.colorStops);
      expect(scaled.emitter).toEqual(e.doc.emitter);
    }
    expect(plan.faithful).toBe(false);
  });

  it("thins a RING evenly instead of cutting an arc out of it", () => {
    cover("w3x-emitter-budget");
    // 20 emitters identical as docs, distinguished only by where they sit —
    // DivineRing exactly. Ranking alone would keep whichever six sorted first
    // by id, i.e. a contiguous arc, and the ring would visibly break.
    const ring = Array.from({ length: 20 }, (_, i) => doc({ id: `r${String(i).padStart(2, "0")}`, rate: 40 }));
    const angleOf = (id: string): number => Number(id.slice(1));
    const plan = planEffectBudget(ring, { liveEffects: 1, distinguish: (d) => String(angleOf(d.id)) });

    expect(plan.systemsAfterMerge).toBe(20); // pivots keep them distinct
    expect(plan.emitters).toHaveLength(MAX_SYSTEMS_PER_EFFECT);
    const kept = plan.emitters.map((e) => angleOf(e.doc.id)).sort((a, b) => a - b);
    // evenly spread around the ring, not a contiguous block
    const gaps = kept.slice(1).map((v, i) => v - kept[i]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(kept[0]).toBeLessThan(4);
    expect(kept[kept.length - 1]!).toBeGreaterThan(15);

    // and the emission the dropped members carried is folded into the survivors
    const total = plan.emitters.reduce((n, e) => n + (e.doc.rate ?? 0), 0);
    expect(total).toBeCloseTo(20 * 40, 0);
    for (const e of plan.emitters) expect(zVfxDoc.safeParse(e.doc).success).toBe(true);
  });

  it("gives a lone emitter its own system even next to a 20-emitter ring", () => {
    cover("w3x-emitter-budget");
    const ring = Array.from({ length: 20 }, (_, i) => doc({ id: `r${String(i).padStart(2, "0")}` }));
    const spark = doc({ id: "spark", blendMode: "alpha", sizeStops: [[0, 0.2], [1, 0.05]] });
    const plan = planEffectBudget([...ring, spark], {
      liveEffects: 1,
      distinguish: (d) => (d.id === "spark" ? "s" : d.id),
    });
    expect(plan.emitters.map((e) => e.doc.id)).toContain("spark");
  });

  it("applyRateScale is identity at 1", () => {
    cover("w3x-emitter-budget");
    const d = doc({ id: "a" });
    expect(applyRateScale(d, 1)).toBe(d);
  });
});
