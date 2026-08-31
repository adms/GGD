import { afterEach, describe, expect, it } from "vitest";
import { Configs } from "@ggd/shared/content";
import { maxParticlesPerSystem, maxRatePerSystem } from "../../../client/src/vfx/particleFactory";
import { applyVfxRuntimeLimits } from "./runtimeLimits";

describe("VFX Forge effective runtime limits", () => {
  const original = Configs.tryGet("vfx-budget");

  afterEach(() => {
    if (original) Configs.register(original);
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
});
