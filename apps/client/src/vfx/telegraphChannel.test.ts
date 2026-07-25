/**
 * telegraph-channels (task #228, requirement 4) — an incoming ENEMY warning
 * must be instantly distinguishable from your own #152 hold-preview, from an
 * ally's cast, and from the ground decals already on the floor.
 *
 * WHY THIS IS A TEST AND NOT A DESIGN NOTE. Before #228 the enemy telegraph was
 * `RING_TINT [0.95,0.45,0.2]` and the #152 self-preview AoE ring was
 * `AOE_COLOR [1.0,0.62,0.23]` — both amber, both a ring, both on the floor.
 * Nothing failed, because nothing checked; the only detector was a playtest,
 * and the playtest said 「不明顯」. These assertions read the real constants out
 * of BOTH modules (comment-stripped, so a prose mention cannot satisfy them) so
 * the collision cannot come back by accident.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ALLY_PALETTE,
  ENEMY_PALETTE,
  FULL_TIER_CAP,
  PULSE_FROM_T,
  SELF_PALETTE,
  TOTAL_TIER_CAP,
  paletteFor,
  telegraphAlpha,
  telegraphPulse,
  telegraphTier,
  type TelegraphRelation,
} from "./telegraphChannel";

const HERE = dirname(fileURLToPath(import.meta.url));
const aimIndicatorSrc = readFileSync(join(HERE, "..", "render", "AimIndicator.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Perceptual-ish distance between two linear RGB tints. */
function tintDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** Pull a `new Color3(r, g, b)` literal out of AimIndicator by constant name. */
function aimColor(name: string): [number, number, number] {
  const m = aimIndicatorSrc.match(
    new RegExp(`${name}\\s*=\\s*new Color3\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)`),
  );
  if (!m) throw new Error(`AimIndicator no longer declares ${name} as a Color3 literal`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("the three telegraph channels are actually distinguishable", () => {
  it("enemy vs ALLY is carried by hue alone — they are never side by side to compare", () => {
    cover("telegraph-channels");
    // Crimson vs team cyan: the two you have to tell apart across the arena,
    // often with nothing of the other kind on screen for reference.
    expect(tintDistance(ENEMY_PALETTE.ring, ALLY_PALETTE.ring)).toBeGreaterThan(0.5);
    expect(ENEMY_PALETTE.alpha).toBeGreaterThan(ALLY_PALETTE.alpha);
  });

  it("enemy vs SELF is carried by THREE channels, because red-vs-amber alone is not enough", () => {
    cover("telegraph-channels");
    // Danger crimson and the #152 amber are only ~27° of hue apart, which is
    // exactly the confusion that shipped. Hue is therefore the WEAKEST of the
    // three separators here, and the other two do the real work — they also
    // survive #85's spectator desaturation, which flattens hue and nothing else.
    expect(tintDistance(ENEMY_PALETTE.ring, SELF_PALETTE.ring)).toBeGreaterThan(0.35);
    expect(SELF_PALETTE.dashed).toBe(true); // "I am aiming" — the #152 language
    expect(ENEMY_PALETTE.dashed).toBe(false); // solid — "this is incoming"
    expect(ENEMY_PALETTE.alpha - SELF_PALETTE.alpha).toBeGreaterThan(0.25);
    // …and only the incoming one ever moves
    expect(ENEMY_PALETTE.pulseHz).toBeGreaterThan(0);
    expect(ALLY_PALETTE.pulseHz).toBe(0);
    expect(SELF_PALETTE.pulseHz).toBe(0);
  });

  it("the ENEMY telegraph does not reuse the #152 preview's own colours", () => {
    cover("telegraph-channels");
    // THE ORIGINAL BUG: the enemy ring and the local player's hold-preview AoE
    // ring were both amber, so an incoming lethal AoE looked like your own aim.
    const previewRange = aimColor("RANGE_COLOR");
    const previewAoe = aimColor("AOE_COLOR");
    expect(tintDistance(ENEMY_PALETTE.ring, previewAoe)).toBeGreaterThan(0.4);
    expect(tintDistance(ENEMY_PALETTE.ring, previewRange)).toBeGreaterThan(0.4);
    // …while YOUR OWN cast deliberately stays continuous with your preview
    expect(tintDistance(SELF_PALETTE.ring, previewAoe)).toBeLessThan(0.05);
  });

  it("an unresolved relation fails DANGEROUS, never benign", () => {
    cover("telegraph-channels");
    // Before the seat/team wiring is up `relationOf` says "unknown". Painting
    // that as an ally outline would hide a real incoming AoE.
    expect(paletteFor("unknown" as TelegraphRelation)).toBe(ENEMY_PALETTE);
    expect(paletteFor("enemy")).toBe(ENEMY_PALETTE);
    expect(paletteFor("ally")).toBe(ALLY_PALETTE);
    expect(paletteFor("self")).toBe(SELF_PALETTE);
  });
});

describe("urgency ramps so 'about to land' is readable without measuring the disc", () => {
  it("brightness climbs monotonically across the wind-up and peaks at 1", () => {
    cover("telegraph-channels");
    const a0 = telegraphAlpha(ENEMY_PALETTE, 0);
    const a5 = telegraphAlpha(ENEMY_PALETTE, 0.5);
    const a1 = telegraphAlpha(ENEMY_PALETTE, 1);
    expect(a0).toBeLessThan(a5);
    expect(a5).toBeLessThan(a1);
    expect(a1).toBeCloseTo(ENEMY_PALETTE.alpha, 6);
    // clamped outside 0..1 — a late frame may hand us 1.05
    expect(telegraphAlpha(ENEMY_PALETTE, 5)).toBeCloseTo(a1, 6);
    expect(telegraphAlpha(ENEMY_PALETTE, -3)).toBeCloseTo(a0, 6);
  });

  it("the pulse is silent early and only shimmers near the landing", () => {
    cover("telegraph-channels");
    expect(telegraphPulse(ENEMY_PALETTE, 0.2, 1234)).toBe(1);
    expect(telegraphPulse(ENEMY_PALETTE, PULSE_FROM_T - 0.01, 1234)).toBe(1);
    // …and never on a channel that has no pulse at all
    expect(telegraphPulse(ALLY_PALETTE, 1, 1234)).toBe(1);
    // sampled across a second, a pulsing channel must actually vary
    const samples = Array.from({ length: 40 }, (_, i) => telegraphPulse(ENEMY_PALETTE, 1, i * 25));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.1);
    // …but stays a shimmer, never a blackout
    expect(Math.min(...samples)).toBeGreaterThan(0.8);
  });
});

describe("the screen budget keeps a crowded floor readable", () => {
  it("the first few casts get the full treatment, later ones degrade to outline", () => {
    cover("telegraph-channels");
    expect(telegraphTier(0, "enemy")).toBe("full");
    expect(telegraphTier(FULL_TIER_CAP - 1, "enemy")).toBe("full");
    expect(telegraphTier(FULL_TIER_CAP, "enemy")).toBe("outline");
    expect(telegraphTier(TOTAL_TIER_CAP - 1, "enemy")).toBe("outline");
  });

  it("past the hard ceiling an ALLY's cast is dropped but an ENEMY's never is", () => {
    cover("telegraph-channels");
    // Dropping the incoming warning is the exact bug #228 exists to fix, so the
    // budget spends its last slots on threats.
    expect(telegraphTier(TOTAL_TIER_CAP, "ally")).toBe("drop");
    expect(telegraphTier(TOTAL_TIER_CAP, "self")).toBe("drop");
    expect(telegraphTier(TOTAL_TIER_CAP, "enemy")).toBe("outline");
    expect(telegraphTier(999, "unknown")).toBe("outline");
  });

  it("the caps are ordered and small enough to matter at the #161 camera pitch", () => {
    cover("telegraph-channels");
    expect(FULL_TIER_CAP).toBeLessThan(TOTAL_TIER_CAP);
    // a median post-multiplier AoE covers ~300 px of a 390 px-tall phone, so a
    // cap that is not actually restrictive would be decoration
    expect(FULL_TIER_CAP).toBeLessThanOrEqual(8);
  });
});
