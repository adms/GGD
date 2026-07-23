/**
 * vfx-spark-read (task #147): the playtest read a plain melee auto as having no
 * spark at all, so the LIGHT impact tier — the most common hit — was retuned to
 * a brighter/bigger additive burst. This locks that it now reads clearly while
 * staying inside the perf bands and BELOW the heavy tier (so light→heavy still
 * steps up).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { impactRecipe, IMPACT_TINTS } from "./vfxPresets";

describe("light impact tier reads as a real hit (vfx-spark-read)", () => {
  it("is a bright, big-enough additive burst — still within the perf bands", () => {
    cover("vfx-spark-read");
    const light = impactRecipe("light", IMPACT_TINTS.physical);
    // a bright white-hot ADDITIVE flash that actually pops (peak size ≥ 1.0u)
    expect(light.flash.blend).toBe("additive");
    expect(light.flash.count).toBeGreaterThanOrEqual(3);
    expect(Math.max(...light.flash.sizeStops.map(([, s]) => s))).toBeGreaterThanOrEqual(1.0);
    // …but still ≤ 3 frames so back-to-back autos never strobe
    expect(light.flash.lifetimeSec.max).toBeLessThanOrEqual(3 / 60);
    // a visible fan of contact sparks, capped under the overdraw ceiling
    expect(light.sparks.count).toBeGreaterThanOrEqual(30);
    expect(light.sparks.count).toBeLessThanOrEqual(80);
    expect(light.sparks.stretched).toBe(true);
  });

  it("still steps UP into the heavy tier (light < heavy)", () => {
    cover("vfx-spark-read");
    const light = impactRecipe("light", IMPACT_TINTS.physical);
    const heavy = impactRecipe("heavy", IMPACT_TINTS.physical);
    expect(heavy.sparks.count).toBeGreaterThan(light.sparks.count);
    // the heavy tier keeps its ground shockwave ring; light stays ring-free (cheap)
    expect(light.ring).toBeUndefined();
    expect(heavy.ring).toBeDefined();
  });
});
