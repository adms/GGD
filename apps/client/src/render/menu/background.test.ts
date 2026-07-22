/**
 * Background-mode decisions: prefers-reduced-motion must SKIP the animated
 * engine entirely (static gradient only). Pure — no DOM, matcher injected.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { prefersReducedMotion, shouldAnimateBackground } from "./background";

describe("prefersReducedMotion", () => {
  it("reads the reduce query from an injected matcher", () => {
    cover("login-reduced-motion");
    const reduce = (q: string) => ({ matches: q.includes("reduce") });
    expect(prefersReducedMotion(reduce)).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it("treats a missing/throwing matcher as no preference", () => {
    cover("login-reduced-motion");
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(
      prefersReducedMotion(() => {
        throw new Error("unsupported query");
      }),
    ).toBe(false);
  });
});

describe("shouldAnimateBackground", () => {
  it("skips the engine only when motion is reduced", () => {
    cover("login-reduced-motion");
    expect(shouldAnimateBackground(false)).toBe(true); // animate → build the scene
    expect(shouldAnimateBackground(true)).toBe(false); // reduced → skip the engine
  });
});
