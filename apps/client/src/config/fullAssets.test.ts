/**
 * The three-way resolution of the full-asset build switch, plus the property
 * that actually matters: the two consumers default to the SAME answer they
 * gave before #176, so nothing about local development moved.
 */
import { describe, it, expect } from "vitest";
import { resolveFullAssets, fullAssetsEnabled, FULL_ASSETS_ENV } from "./fullAssets";

describe("resolveFullAssets", () => {
  it("an explicit truthy value wins over the build mode", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", true]) {
      expect(resolveFullAssets(v, false)).toBe(true);
    }
  });

  it("an explicit falsy value wins over the build mode", () => {
    // A dev server that wants to see what the family will see.
    for (const v of ["0", "false", "no", "off", false]) {
      expect(resolveFullAssets(v, true)).toBe(false);
    }
  });

  it("unset falls back to the build mode — today's behaviour, exactly", () => {
    for (const unset of [undefined, "", "   "]) {
      expect(resolveFullAssets(unset, true)).toBe(true); // vite dev server
      expect(resolveFullAssets(unset, false)).toBe(false); // vite build
    }
  });

  it("an unparseable value falls back to the build mode rather than guessing", () => {
    expect(resolveFullAssets("maybe", false)).toBe(false);
    expect(resolveFullAssets("maybe", true)).toBe(true);
  });

  it("the env var carries the VITE_ prefix vite requires to expose it", () => {
    expect(FULL_ASSETS_ENV.startsWith("VITE_")).toBe(true);
  });
});

describe("fullAssetsEnabled under plain node", () => {
  // championVoice.ts and blizzardOverlay.ts are imported by vitest outside any
  // vite bundle. The old guarded shape existed so that access could not throw;
  // the new one must keep that property or every consumer's test suite breaks
  // on import.
  it("does not throw and returns a boolean", () => {
    expect(() => fullAssetsEnabled()).not.toThrow();
    expect(typeof fullAssetsEnabled()).toBe("boolean");
  });
});
