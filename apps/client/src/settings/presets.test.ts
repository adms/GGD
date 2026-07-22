/**
 * settings-perf: preset → concrete graphics mapping + first-boot auto-detect.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_GRAPHICS } from "./types";
import { PRESET_PARAMS, applyPreset, autoDetectPreset, paramsForPreset } from "./presets";

describe("preset → RenderConfig param mapping (settings-perf)", () => {
  it("low/medium/high map to concrete values; auto delegates", () => {
    cover("settings-preset-map");
    expect(paramsForPreset("low")).toEqual(PRESET_PARAMS.low);
    expect(paramsForPreset("medium")).toEqual(PRESET_PARAMS.medium);
    expect(paramsForPreset("high")).toEqual(PRESET_PARAMS.high);
    // auto hands control to the adaptive manager (no fixed values)
    expect(paramsForPreset("auto")).toBeNull();

    // concrete ordering: low is cheaper than high across the board
    expect(PRESET_PARAMS.low.resolutionScale).toBeLessThan(PRESET_PARAMS.high.resolutionScale);
    expect(PRESET_PARAMS.low.particleDensity).toBeLessThan(PRESET_PARAMS.high.particleDensity);
    expect(PRESET_PARAMS.low.shadows).toBe(false);
    expect(PRESET_PARAMS.high.shadows).toBe(true);
  });

  it("applyPreset writes concrete fields for fixed presets; auto only flips selector", () => {
    cover("settings-preset-map");
    const low = applyPreset(DEFAULT_GRAPHICS, "low");
    expect(low.qualityPreset).toBe("low");
    expect(low.resolutionScale).toBe(PRESET_PARAMS.low.resolutionScale);
    expect(low.shadows).toBe(false);

    const auto = applyPreset({ ...DEFAULT_GRAPHICS, resolutionScale: 0.7 }, "auto");
    expect(auto.qualityPreset).toBe("auto");
    // auto leaves the stored concrete values untouched (adaptive owns them)
    expect(auto.resolutionScale).toBe(0.7);
  });
});

describe("first-boot auto-detect (settings-perf)", () => {
  it("touch → medium (low on weak devices); desktop → high (medium on weak)", () => {
    cover("settings-autodetect");
    // desktop, strong
    expect(autoDetectPreset({ hardwareConcurrency: 12, deviceMemory: 16, touch: false })).toBe("high");
    // desktop, weak cpu
    expect(autoDetectPreset({ hardwareConcurrency: 4, touch: false })).toBe("medium");
    // desktop, low memory
    expect(autoDetectPreset({ hardwareConcurrency: 8, deviceMemory: 4, touch: false })).toBe("medium");
    // phone, decent
    expect(autoDetectPreset({ hardwareConcurrency: 6, deviceMemory: 4, touch: true })).toBe("medium");
    // phone, weak
    expect(autoDetectPreset({ hardwareConcurrency: 2, touch: true })).toBe("low");
    expect(autoDetectPreset({ hardwareConcurrency: 6, deviceMemory: 2, touch: true })).toBe("low");
  });
});
