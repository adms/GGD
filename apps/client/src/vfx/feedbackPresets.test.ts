/**
 * vfx-walk-dust / vfx-cast-decal (task #147): the PURE recipe contracts for the
 * two ground presentation effects added for the playtest.
 *
 *   · walking dust GROWS (size climbs, never pop-shrinks), RISES (positive
 *     gravity) and goes fully transparent — the "rise + expand + fade" read;
 *   · the cast scorch is a dark, sane-radius, fading ground decal.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { stopsAscending } from "./vfxPresets";
import {
  castScorchSpec,
  walkDustRecipe,
  SCORCH_LIFE_MS,
  WALK_DUST_TINT,
} from "./feedbackPresets";

describe("walkDustRecipe (vfx-walk-dust)", () => {
  it("grows over life (size climbs, never pop-shrinks to 0)", () => {
    cover("vfx-walk-dust");
    const puff = walkDustRecipe();
    const sizes = puff.sizeStops.map(([, s]) => s);
    expect(stopsAscending(puff.sizeStops)).toBe(true);
    // strictly non-decreasing and ending BIGGER than it started (it expands)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
    expect(sizes[sizes.length - 1]!).toBeGreaterThan(sizes[0]!);
  });

  it("rises and fades to nothing (positive gravity, alpha → 0, standard blend)", () => {
    cover("vfx-walk-dust");
    const puff = walkDustRecipe();
    expect(puff.gravityY!).toBeGreaterThan(0); // dust lifts as it dissipates
    expect(puff.blend).toBe("alpha"); // additive dust reads as smoke when stacked
    const alphas = puff.colorStops.map(([, c]) => c[3]);
    expect(alphas[alphas.length - 1]!).toBe(0); // goes fully transparent
    // it is a CHEAP, small puff (fires every stride)
    expect(puff.count).toBeLessThanOrEqual(6);
    expect(puff.colorStops.every(([, c]) => c.slice(0, 3).every((v, i) => v === WALK_DUST_TINT[i]))).toBe(true);
  });
});

describe("castScorchSpec (vfx-cast-decal)", () => {
  it("is a dark, fading ground decal with a sane radius", () => {
    cover("vfx-cast-decal");
    // GH#439 —— 回傳型別現在是 `DecalSpec | null`（`none` 那一族不留痕跡）。
    const s = castScorchSpec(1.2)!;
    expect(s.radius).toBeCloseTo(1.2);
    expect(s.lifeMs).toBe(SCORCH_LIFE_MS);
    expect(s.alpha).toBeGreaterThan(0);
    expect(s.alpha).toBeLessThan(1);
    // scorch is DARK earth, never a bright halo
    expect(Math.max(...s.tint)).toBeLessThan(0.3);
    // an exotic footprint is clamped into a sane band
    expect(castScorchSpec(99)!.radius).toBeLessThanOrEqual(3);
    expect(castScorchSpec(0)!.radius).toBeGreaterThanOrEqual(0.4);
  });
});
