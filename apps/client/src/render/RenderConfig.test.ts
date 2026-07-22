/**
 * mobile-11/12: the RenderConfig quality tier — auto-detect + persisted
 * manual override resolution, per-tier hardware scaling caps (1.5x mobile /
 * 2x desktop), and the halved mobile particle budgets (factory capacities,
 * burst counts, emit rates).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { VfxDoc } from "@ggd/shared/content";
import {
  resolveQuality,
  hardwareScalingFor,
  particleScaleFor,
  initRenderConfig,
  qualityOverride,
  setQualityOverride,
  effectiveQuality,
  onQualityChange,
  resolutionToHardwareScaling,
  particleBudgetScale,
} from "./RenderConfig";
import { capacityFor, scaledBurstCount } from "../vfx/particleFactory";

function fakeStorage(seed: Record<string, string> = {}): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

afterEach(() => {
  setQualityOverride("auto", fakeStorage()); // reset module state
});

describe("quality tier resolution (mobile-11)", () => {
  it("override wins; auto passes the detected tier through", () => {
    cover("mobile-quality-tier");
    expect(resolveQuality("mobile", "auto")).toBe("mobile");
    expect(resolveQuality("desktop", "auto")).toBe("desktop");
    expect(resolveQuality("desktop", "mobile")).toBe("mobile");
    expect(resolveQuality("mobile", "desktop")).toBe("desktop");
  });

  it("hardware scaling caps at 1.5x on mobile, 2x on desktop", () => {
    cover("mobile-quality-tier");
    expect(hardwareScalingFor("mobile", 3)).toBeCloseTo(1 / 1.5); // iPhone 3x DPR
    expect(hardwareScalingFor("desktop", 3)).toBeCloseTo(1 / 2);
    expect(hardwareScalingFor("mobile", 1)).toBe(1);
    expect(hardwareScalingFor("desktop", 1.25)).toBeCloseTo(1 / 1.25);
    expect(hardwareScalingFor("mobile", 0)).toBe(1); // degenerate DPR guarded
  });

  it("persists the settings-corner override and notifies live subscribers", () => {
    cover("mobile-quality-tier");
    const storage = fakeStorage({ "ggd.quality": "mobile" });
    initRenderConfig(storage);
    expect(qualityOverride()).toBe("mobile");
    expect(effectiveQuality()).toBe("mobile");

    const seen: string[] = [];
    const off = onQualityChange((q) => seen.push(q));
    setQualityOverride("desktop", storage);
    expect(storage.data["ggd.quality"]).toBe("desktop");
    expect(effectiveQuality()).toBe("desktop");
    expect(seen).toEqual(["desktop"]);
    off();
    setQualityOverride("auto", storage);
    expect(seen).toEqual(["desktop"]); // unsubscribed
  });
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
};

const CONTINUOUS_DOC: VfxDoc = {
  ...BURST_DOC,
  id: "fx.test-cont",
  mode: "continuous",
  rate: 30,
  lifetimeSec: { min: 0.4, max: 1.0 },
};

describe("mobile particle budget (mobile-12)", () => {
  it("halves burst counts and capacities at the mobile scale", () => {
    cover("mobile-particle-cap");
    expect(particleScaleFor("mobile")).toBe(0.5);
    expect(particleScaleFor("desktop")).toBe(1);
    expect(scaledBurstCount(BURST_DOC, 1)).toBe(24);
    expect(scaledBurstCount(BURST_DOC, 0.5)).toBe(12);
    expect(scaledBurstCount({ ...BURST_DOC, burstCount: 1 }, 0.5)).toBe(1); // never 0
    expect(capacityFor(BURST_DOC, 0.5)).toBe(24); // 12·2
    expect(capacityFor(BURST_DOC, 1)).toBe(48);
    expect(capacityFor(CONTINUOUS_DOC, 1)).toBe(38); // 30·1.0 + 8
    expect(capacityFor(CONTINUOUS_DOC, 0.5)).toBe(23); // 15·1.0 + 8
  });
});

describe("resolutionScale → hardware scaling (settings-perf)", () => {
  it("maps resolutionScale + DPR (capped) to a hardware-scaling level", () => {
    cover("resolution-hardware-scaling");
    // scale 1.0 keeps the tier's retina cap
    expect(resolutionToHardwareScaling(1, 2, 2)).toBeCloseTo(1 / 2);
    expect(resolutionToHardwareScaling(1, 3, 1.5)).toBeCloseTo(1 / 1.5);
    // halving resolutionScale doubles the scaling level (halves the buffer)
    expect(resolutionToHardwareScaling(0.5, 2, 2)).toBeCloseTo(1); // 1/(2·0.5)
    expect(resolutionToHardwareScaling(0.5, 1, 2)).toBeCloseTo(2); // 1/(1·0.5)
    // matches the legacy tier helper at full resolution
    expect(resolutionToHardwareScaling(1, 3, 1.5)).toBeCloseTo(hardwareScalingFor("mobile", 3));
    // clamps a degenerate scale to the floor
    expect(resolutionToHardwareScaling(0.1, 1, 2)).toBeCloseTo(1 / 0.4);
  });
});

describe("particleDensity → budget (settings-perf)", () => {
  it("clamps density to 0–1 and drives the vfx budget", () => {
    cover("particle-density-budget");
    expect(particleBudgetScale(0.5)).toBe(0.5);
    expect(particleBudgetScale(1)).toBe(1);
    expect(particleBudgetScale(2)).toBe(1); // clamped high
    expect(particleBudgetScale(-1)).toBe(0); // clamped low
    // density feeds the same factory budget path as the quality tier
    expect(scaledBurstCount(BURST_DOC, particleBudgetScale(0.5))).toBe(12);
    expect(capacityFor(BURST_DOC, particleBudgetScale(1))).toBe(48);
  });
});
