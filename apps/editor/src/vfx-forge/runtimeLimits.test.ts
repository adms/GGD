import { afterEach, describe, expect, it } from "vitest";
import { Configs, DEFAULT_VFX_CLEANUP } from "@ggd/shared/content";
import { maxParticlesPerSystem, maxRatePerSystem } from "../../../client/src/vfx/particleFactory";
import { applyVfxRuntimeLimits } from "./runtimeLimits";

describe("VFX Forge effective runtime limits", () => {
  const original = Configs.tryGet("vfx-budget");
  const originalCleanup = Configs.tryGet("vfx-cleanup") ?? DEFAULT_VFX_CLEANUP;

  afterEach(() => {
    if (original) Configs.register(original);
    Configs.register(originalCleanup);
    applyVfxRuntimeLimits();
  });

  it("installs the backend document into the same clamps used by the renderer", () => {
    Configs.register({
      id: "vfx-budget",
      schema: "config.vfx-budget@1",
      maxParticlesPerSystem: 37,
      maxRatePerSystem: 19,
    } as never);
    const limits = applyVfxRuntimeLimits();
    expect(limits.maxParticlesPerSystem).toBe(37);
    expect(limits.maxRatePerSystem).toBe(19);
    expect(maxParticlesPerSystem()).toBe(37);
    expect(maxRatePerSystem()).toBe(19);
    expect(limits.maxActiveRibbons).toBeGreaterThan(0);
    expect(limits.ribbonFadeBudgetSec).toBeLessThanOrEqual(0.25);
  });

  it("shows cleanup/emitter values from the live config resolver, not copied editor constants", () => {
    const cleanup = (Configs.tryGet("vfx-cleanup") ?? DEFAULT_VFX_CLEANUP) as Record<string, unknown>;
    Configs.register({
      ...cleanup,
      id: "vfx-cleanup",
      schema: "config.vfx-cleanup@1",
      maxOneShotEmitters: 44,
      vfxHardMaxLifeSec: 4,
      roundPurgeMode: "soft",
    } as never);
    const limits = applyVfxRuntimeLimits();
    expect(limits.maxOneShotEmitters).toBe(44);
    expect(limits.hardMaxLifeSec).toBe(4);
    expect(limits.roundPurgeMode).toBe("soft");
  });
});
