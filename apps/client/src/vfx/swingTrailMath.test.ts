/**
 * swing-trail-particles (task #37): the PARTICLE half of the 刀光劍影
 * contract. The user's report named the 軌跡粒子系統 specifically — the ambient
 * emitters bolted to weapon/hand bones — so these assertions run against the
 * REAL content/vfx docs pushed through the SAME factory the game uses:
 *
 *   · every swing-trail particle is gone inside the ribbon fade budget,
 *   · its alpha falls monotonically to exactly 0 (the imported docs held alpha
 *     1.0 at every stop and were culled at full additive brightness),
 *   · steady-state live particles per emitter stay under the overdraw cap, so
 *     continuous max-attack-speed swinging cannot accumulate,
 *   · and each effect KEEPS ITS COLOUR IDENTITY (an icy weapon stays icy).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { capacityFor, colorStopsFor, sizeStopsFor, toParticleSystem } from "./particleFactory";
import { stopsAscending } from "./vfxPresets";
import { RIBBON_FADE_BUDGET_SEC, SWING_FULL_SPEED, SWING_OFF_SPEED } from "./ribbonMath";
import {
  clampSwingTrailLife,
  dominantTint,
  isSwingTrailDoc,
  peakSize,
  shapeSwingTrailDoc,
  swingEmitScale,
  swingTrailRate,
  SWING_TRAIL_IDLE_RATE,
  SWING_TRAIL_MAX_LIFE_SEC,
  SWING_TRAIL_MAX_LIVE,
  SWING_TRAIL_MIN_LIFE_SEC,
} from "./swingTrailMath";

const VFX_DIR = fileURLToPath(new URL("../../../../content/vfx/", import.meta.url));

/** Every ambient CONTINUOUS doc on disk — i.e. every weapon-swing trail. */
function loadTrailDocs(): VfxDoc[] {
  const out: VfxDoc[] = [];
  for (const f of readdirSync(VFX_DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const raw: unknown = JSON.parse(readFileSync(VFX_DIR + f, "utf8"));
    if ((raw as { schema?: string }).schema !== "vfx@1") continue;
    const doc = zVfxDoc.parse(raw);
    if (isSwingTrailDoc(doc)) out.push(doc);
  }
  return out;
}

/** Hue signature: rgb normalized by its brightest channel. */
function hue(rgb: readonly [number, number, number]): [number, number, number] {
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
}

function hueDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [ar, ag, ab] = hue(a);
  const [br, bg, bb] = hue(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
}

const TRAIL_DOCS = loadTrailDocs();

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

describe("swing-trail particle budget (swing-trail-particles)", () => {
  it("the particle budget lives strictly inside the ribbon fade budget", () => {
    cover("swing-trail-particles");
    // both halves of one swing must die together, inside the 0.25 s contract
    expect(SWING_TRAIL_MAX_LIFE_SEC).toBeLessThan(RIBBON_FADE_BUDGET_SEC);
    expect(SWING_TRAIL_MIN_LIFE_SEC).toBeLessThan(SWING_TRAIL_MAX_LIFE_SEC);
    expect(RIBBON_FADE_BUDGET_SEC).toBeLessThanOrEqual(0.25);
  });

  it("classifies weapon trails, and leaves task #33's one-shot bursts alone", () => {
    cover("swing-trail-particles");
    const base: VfxDoc = {
      id: "fx.t",
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "continuous",
      rate: 40,
      lifetimeSec: { min: 1, max: 1 },
      size: { start: 0.3, end: 0.1 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
      anchorBone: "Bone_Weapon",
      ambient: true,
    };
    expect(isSwingTrailDoc(base)).toBe(true);
    expect(isSwingTrailDoc({ ...base, ambient: undefined })).toBe(false); // one-shot
    expect(isSwingTrailDoc({ ...base, anchorBone: undefined })).toBe(false); // not on a bone
    expect(isSwingTrailDoc({ ...base, mode: "burst", burstCount: 30 })).toBe(false); // #33's
    // a non-trail doc passes through byte-identical
    const oneShot: VfxDoc = { ...base, ambient: undefined };
    expect(shapeSwingTrailDoc(oneShot)).toBe(oneShot);
  });

  it("clamps any authored lifetime into the budget, with a spread", () => {
    cover("swing-trail-particles");
    for (const authored of [0.01, 0.1, 0.5, 1, 2, 60]) {
      const life = clampSwingTrailLife({ min: authored, max: authored });
      expect(life.max).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIFE_SEC);
      expect(life.max).toBeGreaterThanOrEqual(SWING_TRAIL_MIN_LIFE_SEC);
      expect(life.min).toBeGreaterThan(0);
      expect(life.min).toBeLessThan(life.max); // soft trailing edge, not a wall
    }
    // degenerate input can't produce a zero/NaN lifetime
    expect(clampSwingTrailLife({ min: 0, max: 0 }).max).toBe(SWING_TRAIL_MAX_LIFE_SEC);
    expect(clampSwingTrailLife({ min: NaN, max: NaN }).max).toBe(SWING_TRAIL_MAX_LIFE_SEC);
  });

  it("caps the STEADY-STATE live count, not the rate (density is identity)", () => {
    cover("swing-trail-particles");
    // already-sparse docs keep their authored rate untouched
    expect(swingTrailRate(18, 0.22)).toBe(18);
    // the slabs get folded down to the live-count budget
    expect(swingTrailRate(200, 0.22) * 0.22).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIVE);
    expect(swingTrailRate(1e6, 0.22) * 0.22).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIVE);
    // never a zero/negative emit rate out of a degenerate doc
    expect(swingTrailRate(0, 0.22)).toBeGreaterThan(0);
    expect(swingTrailRate(-5, 0.22)).toBeGreaterThan(0);
  });

  it("reads the effect's colour identity off the most SATURATED stop", () => {
    cover("swing-trail-particles");
    // the imported flame trails open on pure white and only reach their hue at
    // the middle stop — color.start would repaint every effect the same
    const flame = dominantTint([
      [0, [1, 1, 1, 1]],
      [0.5, [1, 0.98, 0.004, 1]],
      [1, [1, 0.008, 0.008, 0]],
    ]);
    expect(hueDistance(flame, [1, 0.98, 0.004])).toBeLessThan(0.1);
    // an all-white doc has no hue to preserve and stays white
    expect(
      dominantTint([
        [0, [1, 1, 1, 1]],
        [1, [1, 1, 1, 0]],
      ]),
    ).toEqual([1, 1, 1]);
    expect(peakSize([[0, 0.23], [0.5, 0.307], [1, 0.077]])).toBeCloseTo(0.307);
  });

  it("gates the emit rate on the swing: idle ember → full arc, monotonic", () => {
    cover("swing-trail-particles");
    // a parked or walking champion draws a faint ember, never a trail
    expect(swingEmitScale(0)).toBeCloseTo(SWING_TRAIL_IDLE_RATE);
    expect(swingEmitScale(SWING_OFF_SPEED)).toBeCloseTo(SWING_TRAIL_IDLE_RATE);
    // a real arc opens it all the way up
    expect(swingEmitScale(SWING_FULL_SPEED)).toBeCloseTo(1);
    expect(swingEmitScale(999)).toBeCloseTo(1);
    let prev = -1;
    for (let s = 0; s <= 12; s += 0.25) {
      const v = swingEmitScale(s);
      expect(v).toBeGreaterThanOrEqual(prev); // monotonically increasing
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it("finds the real weapon-trail docs on disk", () => {
    cover("swing-trail-particles");
    // guard against the suite silently passing on an empty set
    expect(TRAIL_DOCS.length).toBeGreaterThanOrEqual(8);
    // …and against the pre-fix state creeping back into content
    expect(TRAIL_DOCS.some((d) => d.lifetimeSec.max > SWING_TRAIL_MAX_LIFE_SEC)).toBe(true);
  });

  it.each(TRAIL_DOCS.map((d) => [d.id, d] as const))(
    "%s is retuned into the 刀光 budget and keeps its colour",
    (_id, doc) => {
      cover("swing-trail-particles");
      const shaped = shapeSwingTrailDoc(doc);

      // ---- GONE inside the budget: every particle, not just the average ----
      expect(shaped.lifetimeSec.max).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIFE_SEC);
      expect(shaped.lifetimeSec.max).toBeLessThan(RIBBON_FADE_BUDGET_SEC);
      expect(shaped.lifetimeSec.min).toBeGreaterThan(0);
      expect(shaped.lifetimeSec.min).toBeLessThanOrEqual(shaped.lifetimeSec.max);

      // ---- NO ACCUMULATION: steady-state live particles under the cap ----
      expect(shaped.rate! * shaped.lifetimeSec.max).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIVE);
      // …and strictly better than what the doc authored
      expect(shaped.rate! * shaped.lifetimeSec.max).toBeLessThanOrEqual(
        doc.rate! * doc.lifetimeSec.max,
      );

      // ---- alpha falls MONOTONICALLY to exactly 0 (the real fix) ----
      const colors = colorStopsFor(shaped);
      expect(stopsAscending(colors)).toBe(true);
      const alphas = colors.map((c) => c[1][3]);
      for (let i = 1; i < alphas.length; i++) {
        expect(alphas[i]!).toBeLessThanOrEqual(alphas[i - 1]!);
      }
      expect(alphas[0]!).toBeGreaterThan(0);
      expect(alphas[alphas.length - 1]!).toBe(0);
      // brightness dies too — additive discards alpha in some paths, and a
      // black terminal stop is what makes "gone" survive any blend mode
      const lastRgb = colors[colors.length - 1]![1];
      expect(lastRgb[0] + lastRgb[1] + lastRgb[2]).toBe(0);

      // ---- size pops then shrinks to nothing (no lingering blob) ----
      const sizes = sizeStopsFor(shaped);
      expect(stopsAscending(sizes)).toBe(true);
      expect(sizes[sizes.length - 1]![1]).toBe(0);
      expect(peakSize(sizes)).toBeCloseTo(peakSize(sizeStopsFor(doc)), 5); // scale identity

      // ---- COLOUR IDENTITY: the tint stop still carries the doc's hue ----
      const authoredTint = dominantTint(colorStopsFor(doc));
      const tintStop = colors[1]![1];
      expect(hueDistance([tintStop[0], tintStop[1], tintStop[2]], authoredTint)).toBeLessThan(0.2);

      // shaping is idempotent — a pooled emitter can be rebuilt safely
      const twice = shapeSwingTrailDoc(shaped);
      expect(twice.lifetimeSec).toEqual(shaped.lifetimeSec);
      expect(twice.rate).toBe(shaped.rate);
      expect(colorStopsFor(twice)).toEqual(colors);
    },
  );

  it("renders through the shipped factory with a shrunken capacity", () => {
    cover("swing-trail-particles");
    for (const doc of TRAIL_DOCS) {
      const shaped = shapeSwingTrailDoc(doc);
      const ps = toParticleSystem(shaped, scene, { createTexture: () => null, name: doc.id });
      expect(ps.maxLifeTime).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIFE_SEC);
      expect(ps.minLifeTime).toBeLessThanOrEqual(ps.maxLifeTime);
      expect(ps.emitRate).toBeGreaterThan(0);
      // what actually sits on screen at steady state
      expect(ps.emitRate * ps.maxLifeTime).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIVE + 1);
      // the retune must never make an emitter MORE expensive than before
      expect(ps.getCapacity()).toBeLessThanOrEqual(capacityFor(doc));
      const grads = ps.getColorGradients()!;
      expect(grads[grads.length - 1]!.color2 ?? grads[grads.length - 1]!.color1).toMatchObject({
        a: 0,
      });
      ps.dispose();
    }
  });

  it("the worst offender loses its slab but keeps its blue", () => {
    cover("swing-trail-particles");
    // godie-herorider-p0: rate 100/s × 1.0 s = 100 live ADDITIVE quads on a
    // hand bone, alpha 1.0 at every authored stop — the light pollution
    const doc = TRAIL_DOCS.find((d) => d.id === "godie-herorider-p0");
    expect(doc).toBeDefined();
    expect(doc!.rate! * doc!.lifetimeSec.max).toBeGreaterThanOrEqual(100); // before
    expect(colorStopsFor(doc!).every((c) => c[1][3] === 1)).toBe(true); // never faded
    const shaped = shapeSwingTrailDoc(doc!);
    expect(shaped.rate! * shaped.lifetimeSec.max).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIVE);
    expect(shaped.lifetimeSec.max / doc!.lifetimeSec.max).toBeLessThan(0.25); // 4× shorter
    const tint = colorStopsFor(shaped)[1]![1];
    expect(tint[2]).toBeGreaterThan(tint[0]); // still blue, not repainted
  });
});
