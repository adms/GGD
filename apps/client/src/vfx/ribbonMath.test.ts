/**
 * ribbon-geometry (task #30, retuned by task #37): the pure swept-strip math
 * behind RibbonTrail — ring-buffer sizing, tapered top/bottom path
 * construction (pos ± up·width·taper), the sharp age falloff, the blend-aware
 * fade channel (additive DISCARDS alpha, so the fade must land in the RGB) and
 * the relative-speed swing gate that keeps an idle weapon dark.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ribbonSampleCount,
  ribbonCoversLifespan,
  clampRibbonLifespanSec,
  clampRibbonHalfWidth,
  buildRibbonPaths,
  sampleLife,
  sampleAlpha,
  sampleWidthScale,
  sampleLifeFractions,
  sampleColorStops,
  ribbonFadeModeFor,
  ribbonVertexColors,
  swingGateStep,
  swingWeight,
  RIBBON_MAX_LIFESPAN_SEC,
  RIBBON_MIN_LIFESPAN_SEC,
  RIBBON_FADE_BUDGET_SEC,
  RIBBON_MAX_HALF_WIDTH,
  SWING_ON_SPEED,
  SWING_OFF_SPEED,
  SWING_RELEASE_MS,
  SWING_GATE_CLOSED,
  type RibbonSample,
} from "./ribbonMath";

describe("ribbon geometry (ribbon-geometry)", () => {
  it("clamps every authored lifespan into the 刀光 budget", () => {
    cover("ribbon-geometry");
    // the budget itself leaves headroom under the ≤0.25s task contract
    expect(RIBBON_MAX_LIFESPAN_SEC).toBeLessThan(RIBBON_FADE_BUDGET_SEC);
    expect(clampRibbonLifespanSec(2)).toBe(RIBBON_MAX_LIFESPAN_SEC); // the 2s bands
    expect(clampRibbonLifespanSec(0.35)).toBe(RIBBON_MAX_LIFESPAN_SEC); // the common one
    expect(clampRibbonLifespanSec(0.1)).toBe(0.1); // already snappy — untouched
    expect(clampRibbonLifespanSec(0.001)).toBe(RIBBON_MIN_LIFESPAN_SEC);
    expect(clampRibbonLifespanSec(0)).toBe(RIBBON_MIN_LIFESPAN_SEC);
    expect(clampRibbonLifespanSec(Number.NaN)).toBe(RIBBON_MIN_LIFESPAN_SEC);
  });

  it("caps half-widths so a trail is a blade arc, never a wall", () => {
    cover("ribbon-geometry");
    expect(clampRibbonHalfWidth(3.858)).toBe(RIBBON_MAX_HALF_WIDTH); // godie-niya
    expect(clampRibbonHalfWidth(0.3)).toBe(0.3);
    expect(clampRibbonHalfWidth(0)).toBe(0);
    expect(clampRibbonHalfWidth(-1)).toBe(0);
  });

  it("sizes the ring so the OLDEST sample actually reaches zero", () => {
    cover("ribbon-geometry");
    // regression: the ring capped at 64 samples (≈1.07s at 60Hz) while the
    // fade divided by lifespanSec, so a 2s doc left its tail edge at ~50%
    // alpha forever — a permanent bright band. Inside the clamp it always
    // spans the whole fade.
    expect(ribbonCoversLifespan(RIBBON_MAX_LIFESPAN_SEC)).toBe(true);
    expect(ribbonCoversLifespan(0.1)).toBe(true);
    expect(ribbonCoversLifespan(2)).toBe(false); // the un-clamped legacy value
    expect(ribbonSampleCount(0.2)).toBe(13);
    expect(ribbonSampleCount(0.01)).toBe(2); // floor
    expect(ribbonSampleCount(5)).toBe(64); // cap
  });

  it("builds top/bottom paths offset by widthAbove/widthBelow along world up", () => {
    cover("ribbon-geometry");
    const samples: RibbonSample[] = [
      { x: 0, y: 1, z: 0, tMs: 0 },
      { x: 1, y: 1.5, z: 2, tMs: 16 },
      { x: 2, y: 1, z: 4, tMs: 32 },
    ];
    const { top, bottom } = buildRibbonPaths(samples, 0.4, 0.25);
    expect(top).toEqual([
      [0, 1.4, 0],
      [1, 1.9, 2],
      [2, 1.4, 4],
    ]);
    expect(bottom).toEqual([
      [0, 0.75, 0],
      [1, 1.25, 2],
      [2, 0.75, 4],
    ]);
  });

  it("tapers the strip by age: full width at the blade, pinched to nothing", () => {
    cover("ribbon-geometry");
    const samples: RibbonSample[] = [
      { x: 0, y: 0, z: 0, tMs: 0 }, // oldest — expired
      { x: 1, y: 0, z: 0, tMs: 100 },
      { x: 2, y: 0, z: 0, tMs: 200 }, // newest — at the weapon
    ];
    const life = sampleLifeFractions(samples, 200, 200);
    expect(life).toEqual([0, 0.5, 1]);
    const { top, bottom } = buildRibbonPaths(samples, 0.6, 0.4, life);
    const halfAbove = top.map((p) => p[1]);
    const halfBelow = bottom.map((p) => -p[1]);
    // width grows monotonically oldest → newest and pinches to a point
    expect(halfAbove[0]).toBeCloseTo(0);
    expect(halfBelow[0]).toBeCloseTo(0);
    expect(halfAbove[1]!).toBeGreaterThan(0);
    expect(halfAbove[1]!).toBeLessThan(halfAbove[2]!);
    expect(halfBelow[1]!).toBeLessThan(halfBelow[2]!);
    expect(halfAbove[2]).toBeCloseTo(0.6); // the head keeps the authored width
    expect(halfBelow[2]).toBeCloseTo(0.4);
    expect(sampleWidthScale(1)).toBe(1);
    expect(sampleWidthScale(0)).toBe(0);
  });

  it("fades sharply (not linearly) and is exactly 0 at the lifespan", () => {
    cover("ribbon-geometry");
    expect(sampleLife(0, 200)).toBe(1);
    expect(sampleLife(100, 200)).toBeCloseTo(0.5);
    expect(sampleAlpha(0, 200)).toBe(1);
    expect(sampleAlpha(200, 200)).toBe(0);
    expect(sampleAlpha(9999, 200)).toBe(0);
    expect(sampleAlpha(-50, 200)).toBe(1); // future samples clamp to opaque
    expect(sampleAlpha(10, 0)).toBe(0); // degenerate lifespan
    // the whole point: the MIDDLE of the strip is dim, not half-bright —
    // a linear ramp is what made the old sweep read as a solid slab
    expect(sampleAlpha(100, 200)).toBeLessThan(0.25);
    // strictly monotonic decreasing across the strip
    let prev = Infinity;
    for (let age = 0; age <= 200; age += 10) {
      const a = sampleAlpha(age, 200);
      expect(a).toBeLessThan(prev);
      prev = a;
    }
  });

  it("routes the fade to the channel the blend mode actually honours", () => {
    cover("ribbon-geometry");
    // additive is blendFunc(ONE, ONE) — source alpha never reaches the color
    // channels, so fading alpha alone was a NO-OP on the additive ribbons
    expect(ribbonFadeModeFor("additive")).toBe("premultiplied");
    expect(ribbonFadeModeFor("alpha")).toBe("alpha");
    expect(ribbonFadeModeFor("alphaKey")).toBe("alpha");
    expect(ribbonFadeModeFor("modulate")).toBe("toWhite");
  });

  it("lays out vertex colors path-by-path with a premultiplied additive fade", () => {
    cover("ribbon-geometry");
    const samples: RibbonSample[] = [
      { x: 0, y: 0, z: 0, tMs: 0 }, // oldest — fully faded at nowMs=200
      { x: 1, y: 0, z: 0, tMs: 100 }, // half aged
      { x: 2, y: 0, z: 0, tMs: 200 }, // newest — full brightness
    ];
    const rgba: [number, number, number, number] = [1, 0.5, 0.25, 0.8];
    const colors = ribbonVertexColors(samples, 200, 200, rgba, {
      fadeMode: "premultiplied",
    }) as number[];
    expect(colors).toHaveLength(24); // 3 samples × 2 paths × rgba
    // oldest: RGB *and* alpha at zero → invisible under ONE/ONE blending
    expect(colors.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(colors.slice(12, 16)).toEqual([0, 0, 0, 0]); // bottom path mirrors
    // newest: the authored colour, undimmed
    expect(colors.slice(8, 12)).toEqual([1, 0.5, 0.25, 0.8]);
    // brightness rises monotonically oldest → newest on BOTH paths
    for (const base of [0, 12]) {
      expect(colors[base]!).toBeLessThan(colors[base + 4]!);
      expect(colors[base + 4]!).toBeLessThan(colors[base + 8]!);
      expect(colors[base + 3]!).toBeLessThan(colors[base + 7]!);
      expect(colors[base + 7]!).toBeLessThan(colors[base + 11]!);
    }
    // alpha-blended docs keep their hue and fade the alpha channel instead
    const alphaMode = ribbonVertexColors(samples, 200, 200, rgba, { fadeMode: "alpha" }) as number[];
    expect(alphaMode.slice(0, 4)).toEqual([1, 0.5, 0.25, 0]);
    expect(alphaMode.slice(8, 12)).toEqual([1, 0.5, 0.25, 0.8]);
  });

  it("weights each sample by the swing speed it was laid at", () => {
    cover("ribbon-geometry");
    const samples: RibbonSample[] = [
      { x: 0, y: 0, z: 0, tMs: 200, w: 0 }, // laid while the blade was parked
      { x: 1, y: 0, z: 0, tMs: 200, w: 1 }, // laid mid-swing
    ];
    const colors = ribbonVertexColors(samples, 200, 200, [1, 1, 1, 1], {
      fadeMode: "premultiplied",
    }) as number[];
    expect(colors.slice(0, 4)).toEqual([0, 0, 0, 0]); // a parked blade lights nothing
    expect(colors.slice(4, 8)).toEqual([1, 1, 1, 1]);
  });

  it("writes into a caller-owned buffer (no per-frame allocation)", () => {
    cover("ribbon-geometry");
    const samples: RibbonSample[] = [{ x: 0, y: 0, z: 0, tMs: 0 }];
    const out = new Float32Array(8);
    const got = ribbonVertexColors(samples, 0, 200, [1, 1, 1, 1], { out });
    expect(got).toBe(out);
    expect(out[3]).toBe(1);
  });

  it("samples the hot→cool ramp so the leading edge is white-hot", () => {
    cover("ribbon-geometry");
    const stops = [
      [0, [1, 1, 1, 1]],
      [0.5, [1, 0, 0, 1]],
      [1, [0, 0, 0, 0]],
    ] as const;
    expect(sampleColorStops(stops, 0)).toEqual([1, 1, 1, 1]);
    expect(sampleColorStops(stops, -1)).toEqual([1, 1, 1, 1]); // clamped
    expect(sampleColorStops(stops, 0.5)).toEqual([1, 0, 0, 1]);
    expect(sampleColorStops(stops, 2)).toEqual([0, 0, 0, 0]); // clamped
    const mid = sampleColorStops(stops, 0.25);
    expect(mid[1]).toBeCloseTo(0.5); // interpolated white → red
    expect(sampleColorStops([], 0.5)).toEqual([1, 1, 1, 1]);
  });
});

describe("ribbon swing gate (ribbon-geometry)", () => {
  it("opens on a fast blade and closes after the release window", () => {
    cover("ribbon-geometry");
    let g = SWING_GATE_CLOSED;
    // a walking champion's weapon bone barely moves RELATIVE to the entity
    g = swingGateStep(g, 1, 16);
    expect(g.open).toBe(false);
    // the attack arc whips it through
    g = swingGateStep(g, SWING_ON_SPEED + 5, 16);
    expect(g.open).toBe(true);
    // hysteresis: a momentary slow point mid-arc does not chop the streak
    g = swingGateStep(g, 0, 16);
    expect(g.open).toBe(true);
    g = swingGateStep(g, 0, SWING_RELEASE_MS);
    expect(g.open).toBe(false);
  });

  it("holds state inside the hysteresis band (no flicker at the edge)", () => {
    cover("ribbon-geometry");
    const mid = (SWING_ON_SPEED + SWING_OFF_SPEED) / 2;
    expect(swingGateStep({ open: true, quietMs: 0 }, mid, 16).open).toBe(true);
    expect(swingGateStep(SWING_GATE_CLOSED, mid, 16).open).toBe(false);
    // any fast frame resets the quiet timer
    expect(swingGateStep({ open: true, quietMs: 999 }, SWING_ON_SPEED, 16).quietMs).toBe(0);
  });

  it("gives a parked blade ZERO brightness and a fast one full", () => {
    cover("ribbon-geometry");
    expect(swingWeight(0)).toBe(0);
    expect(swingWeight(SWING_OFF_SPEED)).toBe(0); // the release window is invisible
    expect(swingWeight(100)).toBe(1);
    expect(swingWeight(4)).toBeGreaterThan(0);
    expect(swingWeight(4)).toBeLessThan(1);
    expect(swingWeight(6)).toBeGreaterThan(swingWeight(4)); // monotonic in speed
  });
});
