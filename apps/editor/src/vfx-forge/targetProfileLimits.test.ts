import { describe, expect, it } from "vitest";
import { readEffectiveVfxLimits, vfxLimitDrift } from "./targetProfileLimits";

const advertised = {
  maxParticlesPerSystem: 1200,
  maxRatePerSystem: 600,
  maxActiveRibbons: 10,
  ribbonFadeBudgetSec: 0.25,
  hardMaxLifeSec: 5,
  hardCapScope: "scene" as const,
  maxOneShotEmitters: 96,
  roundPurgeMode: "full" as const,
};

describe("target-profile effective VFX limits", () => {
  it("keeps the legacy missing field honest and parses the complete machine object", () => {
    expect(readEffectiveVfxLimits({ schema: "ggd-editor-target-profile@1" })).toBeNull();
    expect(readEffectiveVfxLimits({ effectiveVfxLimits: advertised })).toEqual(advertised);
  });

  it("rejects partial, invalid, and non-JSON unlimited values", () => {
    expect(() => readEffectiveVfxLimits({ effectiveVfxLimits: { ...advertised, hardCapScope: undefined } }))
      .toThrow(/hardCapScope/);
    expect(() => readEffectiveVfxLimits({ effectiveVfxLimits: { ...advertised, maxRatePerSystem: 0 } }))
      .toThrow(/maxRatePerSystem/);
    expect(readEffectiveVfxLimits({
      effectiveVfxLimits: { ...advertised, maxOneShotEmitters: null },
    })?.maxOneShotEmitters).toBe(Number.POSITIVE_INFINITY);
  });

  it("names every renderer/profile mismatch instead of silently mixing sources", () => {
    expect(vfxLimitDrift(advertised, { ...advertised, hardMaxLifeSec: 4, roundPurgeMode: "soft" }))
      .toEqual([
        "hardMaxLifeSec: renderer=5, profile=4",
        "roundPurgeMode: renderer=full, profile=soft",
      ]);
  });
});
