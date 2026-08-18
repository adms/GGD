/**
 * Per-invocation art params (task #50): one primitive doc → many looks. Pure
 * transform, unit-tested. Applying no knob is identity; scale/tint/alpha/count/
 * timeScale each transform only their field; spatial params surface separately.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { zVfxDoc } from "@ggd/shared/content";
import { applyArtParams, resolveSpatial } from "./artParams";
import { nova } from "./primitives";

const doc = nova({ id: "fx.test.art", color: [1, 0.5, 0.15] });

describe("applyArtParams (ability-vfx-artparams)", () => {
  it("no doc-affecting knob returns the doc unchanged (identity fast-path)", () => {
    cover("ability-vfx-artparams");
    expect(applyArtParams(doc, {})).toBe(doc);
    expect(applyArtParams(doc, { scale: 1, alpha: 1, timeScale: 1 })).toBe(doc);
    // ⚠️ 這一行原本是 `{ heightY: 3, facingDeg: 90 }` → identity,也就是它**把
    // 缺陷釘住了**:`facingDeg` 當時被 `applyArtParams` 丟掉,而這條斷言說那是對的
    // (故障 ④,斷言方向跟缺陷無關)。#366 之後方位是 doc 表達得出來的東西,
    // 只有 `heightY` 還是純空間參數。
    expect(applyArtParams(doc, { heightY: 3 })).toBe(doc); // spatial only
    // 恆等的方位仍然是 identity —— `facingDeg: 0` 不該憑空多開一格粒子池。
    expect(applyArtParams(doc, { facingDeg: 0, pitchDeg: 90 })).toBe(doc);
  });

  it("scale multiplies every size + the emitter radius, and stays schema-valid", () => {
    cover("ability-vfx-artparams");
    const out = applyArtParams(doc, { scale: 2 });
    expect(out).not.toBe(doc);
    const r0 = doc.emitter.shape === "sphere" ? doc.emitter.radius : 0;
    const r1 = out.emitter.shape === "sphere" ? out.emitter.radius : 0;
    expect(r1).toBeCloseTo(r0 * 2, 3);
    expect(out.sizeStops![1]![1]).toBeCloseTo(doc.sizeStops![1]![1] * 2, 3);
    expect(() => zVfxDoc.parse(out)).not.toThrow();
  });

  it("alpha multiplies every stop alpha; count overrides burst; timeScale scales lifetime", () => {
    cover("ability-vfx-artparams");
    const out = applyArtParams(doc, { alpha: 0.5, count: 7, timeScale: 2 });
    expect(out.colorStops![0]![1]![3]).toBeCloseTo(doc.colorStops![0]![1]![3] * 0.5, 4);
    expect(out.burstCount).toBe(7);
    expect(out.lifetimeSec.max).toBeCloseTo(doc.lifetimeSec.max * 2, 3);
    expect(() => zVfxDoc.parse(out)).not.toThrow();
  });

  it("tint recolours toward the new hue while keeping the white-hot→cool shape", () => {
    cover("ability-vfx-artparams");
    const out = applyArtParams(doc, { tint: [0.3, 0.6, 1] }); // recolour fire → ice
    const tint = out.colorStops![1]![1];
    expect(tint[2]).toBeGreaterThan(tint[0]); // now blue-dominant
    // core stop stays brighter overall than the tint stop (identity preserved)
    const coreSum = out.colorStops![0]![1]!.slice(0, 3).reduce((a, b) => a + b, 0);
    const tintSum = tint.slice(0, 3).reduce((a, b) => a + b, 0);
    expect(coreSum).toBeGreaterThan(tintSum);
    expect(() => zVfxDoc.parse(out)).not.toThrow();
  });

  it("resolveSpatial defaults and overrides the play-site height/facing", () => {
    cover("ability-vfx-artparams");
    expect(resolveSpatial({})).toEqual({ heightY: 1, facingDeg: 0 });
    expect(resolveSpatial({ heightY: 0.1, facingDeg: 45 })).toEqual({ heightY: 0.1, facingDeg: 45 });
  });
});
