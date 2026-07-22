/**
 * combat post-fx pure math (juice-postfx-math): the red-vignette intensity
 * mapping (by hp lost), the ripple/heat-distortion strength (by impact), and
 * the exponential decay both channels ride. No Babylon here.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  VIGNETTE_MAX,
  RIPPLE_MAX,
  vignetteIntensityForHpLoss,
  rippleAmpForImpact,
  decayIntensity,
} from "./postFxMath";

describe("vignette intensity mapping (juice-postfx-math)", () => {
  it("is 0 at no loss, monotonic in hp lost, and clamps to VIGNETTE_MAX", () => {
    cover("juice-postfx-math");
    expect(vignetteIntensityForHpLoss(0)).toBe(0);
    expect(vignetteIntensityForHpLoss(1)).toBeCloseTo(VIGNETTE_MAX, 5);
    expect(vignetteIntensityForHpLoss(2)).toBe(VIGNETTE_MAX); // over-range clamps
    expect(vignetteIntensityForHpLoss(-1)).toBe(0); // under-range clamps
    expect(vignetteIntensityForHpLoss(0.5)).toBeGreaterThan(vignetteIntensityForHpLoss(0.2));
    // concave (sqrt): even a small chip is visible relative to its fraction
    expect(vignetteIntensityForHpLoss(0.25)).toBeGreaterThan(0.25 * VIGNETTE_MAX);
  });
});

describe("ripple strength (juice-postfx-math)", () => {
  it("grows with damage, is bigger on crit/kill, and clamps to RIPPLE_MAX", () => {
    cover("juice-postfx-math");
    const base = rippleAmpForImpact({ amount: 100 });
    expect(base).toBeGreaterThan(0);
    expect(rippleAmpForImpact({ amount: 200 })).toBeGreaterThan(base);
    expect(rippleAmpForImpact({ amount: 100, crit: true })).toBeGreaterThan(base);
    expect(rippleAmpForImpact({ amount: 100, killingBlow: true })).toBeGreaterThan(
      rippleAmpForImpact({ amount: 100, crit: true }),
    );
    expect(rippleAmpForImpact({ amount: 100000 })).toBe(RIPPLE_MAX);
    expect(rippleAmpForImpact({ amount: 0 })).toBe(0);
  });
});

describe("intensity decay (juice-postfx-math)", () => {
  it("halves over a half-life, approaches 0, and snaps tiny values to 0", () => {
    cover("juice-postfx-math");
    expect(decayIntensity(1, 100, 100)).toBeCloseTo(0.5, 5);
    expect(decayIntensity(1, 200, 100)).toBeCloseTo(0.25, 5);
    expect(decayIntensity(0.0005, 1, 100)).toBe(0); // below epsilon → 0
    expect(decayIntensity(0, 100, 100)).toBe(0);
    // monotonically non-increasing, and reaches exactly 0 once below epsilon
    let v = 1;
    for (let i = 0; i < 80; i++) {
      const next = decayIntensity(v, 16, 90);
      expect(next).toBeLessThanOrEqual(v);
      v = next;
    }
    expect(v).toBe(0);
  });
});
