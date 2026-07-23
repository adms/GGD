/**
 * vfx-shadow (task #147): the pure half of the blob-shadow layer — footprint
 * sizing + disc scaling. A champion casts a bigger shadow than a flower, exotic
 * radii are clamped, and a unit ground quad scales to a flat disc (Y left at 1).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  SHADOW_CHAMPION_RADIUS,
  SHADOW_FLOWER_RADIUS,
  SHADOW_MIN_RADIUS,
  SHADOW_MAX_RADIUS,
  clampShadowRadius,
  discScaling,
  shadowRadiusFor,
} from "./shadowMath";

describe("shadowMath (vfx-shadow)", () => {
  it("a champion shadow is bigger than a flower's", () => {
    cover("vfx-shadow");
    expect(shadowRadiusFor(false)).toBe(SHADOW_CHAMPION_RADIUS);
    expect(shadowRadiusFor(true)).toBe(SHADOW_FLOWER_RADIUS);
    expect(shadowRadiusFor(false)).toBeGreaterThan(shadowRadiusFor(true));
  });

  it("clamps exotic / non-finite footprints into the sane band", () => {
    cover("vfx-shadow");
    expect(clampShadowRadius(0)).toBe(SHADOW_MIN_RADIUS);
    expect(clampShadowRadius(999)).toBe(SHADOW_MAX_RADIUS);
    // a corrupt (non-finite) footprint falls to the safe MINIMUM — a tiny
    // shadow, never a giant one under a mid-despawn/un-posed body
    expect(clampShadowRadius(Number.NaN)).toBe(SHADOW_MIN_RADIUS);
    expect(clampShadowRadius(Number.POSITIVE_INFINITY)).toBe(SHADOW_MIN_RADIUS);
    // an in-band radius is returned unchanged (idempotent)
    expect(clampShadowRadius(0.5)).toBe(0.5);
  });

  it("scales a unit quad to a flat disc of diameter = 2·radius (Y stays 1)", () => {
    cover("vfx-shadow");
    const [x, y, z] = discScaling(0.55);
    expect(x).toBeCloseTo(1.1);
    expect(z).toBeCloseTo(1.1);
    expect(y).toBe(1);
    // clamps through the same band
    expect(discScaling(999)[0]).toBe(SHADOW_MAX_RADIUS * 2);
  });
});
