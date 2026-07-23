/**
 * The game server must resolve GGD_DEPLOY_TIER to the SAME tier the Go platform
 * does. The Go side asserts that against packages/shared/src/deployTier.ts
 * (apps/platform/internal/config/deploytier_drift_test.go); this side asserts
 * that the game server actually goes through that shared table rather than
 * re-implementing it.
 */
import { describe, it, expect } from "vitest";
import { DEPLOY_TIERS, DEPLOY_TIER_ALIASES } from "@ggd/shared/deployTier";
import { resolveDeployTier, deployTierBootLine } from "./deployTier";

describe("resolveDeployTier", () => {
  it("resolves every alias the platform accepts", () => {
    for (const [alias, tier] of Object.entries(DEPLOY_TIER_ALIASES)) {
      expect(resolveDeployTier({ GGD_DEPLOY_TIER: alias } as NodeJS.ProcessEnv)).toBe(tier);
    }
  });

  it("falls back to the deny tier when unset or unrecognised", () => {
    expect(resolveDeployTier({} as NodeJS.ProcessEnv)).toBe("public");
    expect(resolveDeployTier({ GGD_DEPLOY_TIER: "familly" } as NodeJS.ProcessEnv)).toBe("public");
  });

  it("only ever returns a canonical tier", () => {
    for (const raw of ["family", "lan", "nonsense", "", "HOME"]) {
      expect(DEPLOY_TIERS).toContain(resolveDeployTier({ GGD_DEPLOY_TIER: raw } as NodeJS.ProcessEnv));
    }
  });
});

describe("deployTierBootLine", () => {
  it("says fullAssets=true and shouts on the family tier", () => {
    const line = deployTierBootLine("family");
    expect(line).toContain("deployTier=family");
    expect(line).toContain("fullAssets=true");
    expect(line).toContain("VITE_GGD_FULL_ASSETS=1");
  });

  it("is quiet and false on the gated tiers", () => {
    for (const tier of ["public", "private"] as const) {
      const line = deployTierBootLine(tier);
      expect(line).toContain("fullAssets=false");
      expect(line).not.toContain("VITE_GGD_FULL_ASSETS");
    }
  });
});
