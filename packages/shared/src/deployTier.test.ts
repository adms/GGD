import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPLOY_TIER,
  DEPLOY_TIERS,
  DEPLOY_TIER_ALIASES,
  allowsRestrictedContent,
  normalizeDeployTier,
  servesFullAssets,
} from "./deployTier";

describe("normalizeDeployTier", () => {
  it("resolves every alias to its canonical tier", () => {
    for (const [alias, tier] of Object.entries(DEPLOY_TIER_ALIASES)) {
      expect(normalizeDeployTier(alias)).toBe(tier);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeDeployTier("  FAMILY ")).toBe("family");
    expect(normalizeDeployTier("Private")).toBe("private");
  });

  // The fail-safe direction. Every one of these is a plausible typo or an
  // operator who never set the variable, and every one must land on the tier
  // that refuses the restricted mounts.
  it.each([undefined, null, "", "   ", "familly", "fmaily", "yes", "1", "true", "local"])(
    "falls back to the deny tier for %p",
    (raw) => {
      expect(normalizeDeployTier(raw as string | undefined)).toBe(DEFAULT_DEPLOY_TIER);
      expect(DEFAULT_DEPLOY_TIER).toBe("public");
      expect(servesFullAssets(normalizeDeployTier(raw as string | undefined))).toBe(false);
    },
  );
});

describe("tier predicates", () => {
  it("serves full assets only on family", () => {
    expect(servesFullAssets("family")).toBe(true);
    expect(servesFullAssets("private")).toBe(false);
    expect(servesFullAssets("public")).toBe(false);
  });

  it("allows restricted content on anything but public", () => {
    expect(allowsRestrictedContent("family")).toBe(true);
    expect(allowsRestrictedContent("private")).toBe(true);
    expect(allowsRestrictedContent("public")).toBe(false);
  });

  it("every alias target is a canonical tier", () => {
    for (const tier of Object.values(DEPLOY_TIER_ALIASES)) {
      expect(DEPLOY_TIERS).toContain(tier);
    }
  });

  // servesFullAssets implies allowsRestrictedContent — a tier that serves the
  // overlay but not the imported models would be an incoherent third state.
  it("full-asset tiers are a subset of restricted-content tiers", () => {
    for (const tier of DEPLOY_TIERS) {
      if (servesFullAssets(tier)) expect(allowsRestrictedContent(tier)).toBe(true);
    }
  });
});
