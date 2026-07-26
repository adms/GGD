/**
 * GROWTH TIER (task #244 黑泥吞噬) — the client half of "the silhouette walking
 * toward you is getting bigger".
 *
 * The server sends TWO BITS, never a count (`ENTITY_FLAG.MUD_SWELL` /
 * `MUD_BOSS`, thresholded at `GROWTH_TIER_STACKS` = 20 / 50). This module turns
 * that tier into the two things the renderer needs — a SIZE multiplier and a
 * COLOUR multiply — and nothing else. It is deliberately champion-agnostic: any
 * content that authors `applyBuff.stackVisual` gets the same treatment.
 *
 * WHY THE COLOUR GOES THROUGH THE #49 TINT AND NOT THROUGH voxelSkin.
 * `applyVoxelLook` (#231) writes the palette into a TEXTURE and leaves
 * `albedoColor` white; `applyModelTint` (#49) MULTIPLIES `albedoColor`. So
 * `tint × palette` already composes as a perceptual multiply, and the mud is
 * simply another factor folded into the tint BEFORE it is applied. That matters
 * for correctness, not just tidiness: `applyModelTint.paint()` always recomputes
 * from the remembered SOURCE colour, so a tier change re-paints from base and
 * can never compound — which a second, independent painter would.
 *
 * READABILITY FLOOR — the part that is easy to skip and expensive to get wrong.
 * #231 clamps the generated `outfitPrimary` relative luminance to [0.16, 0.58]
 * and pins ≥0.045 after the darkest shipped champion tint (狂戰士 ×0.3137).
 * Stacking tier 2's ×0.60 on top of that gives 0.16 × 0.3137 × 0.60 ≈ 0.030 —
 * UNDER the floor, i.e. an unreadable black blob at combat distance. So the
 * composed tint is clamped here so that `floorLum ÷ MIN_SKIN_LUM` can never be
 * breached, scaling all three channels uniformly (hue-preserving).
 */

/** Relative-luminance weights (Rec. 709), the same ones #231 uses. */
const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

/** #231's lower clamp on a generated `outfitPrimary` relative luminance. */
export const MIN_SKIN_LUM = 0.16;
/** #231's pinned floor: the darkest legible composed body colour. */
export const MIN_COMPOSED_LUM = 0.045;

/**
 * BODY SIZE per tier. Tier 1 is "something is happening" (8 %, readable but not
 * alarming); tier 2 is the boss reveal — a quarter bigger reads as "visibly one
 * size larger" from the fixed combat camera without clipping the arena props.
 */
export const GROWTH_TIER_SCALE: readonly [number, number, number] = [1.0, 1.08, 1.25];

/** Black-mud palette multiply per tier (identity at tier 0). */
export const GROWTH_TIER_MUD: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [0.82, 0.79, 0.86],
  [0.66, 0.6, 0.72],
];

/** Seconds the scale eases over when a tier changes. */
export const GROWTH_SCALE_EASE_MS = 350;
/** Seconds the tier-2 foot ring fades in over. */
export const GROWTH_RING_FADE_MS = 400;

export type GrowthTier = 0 | 1 | 2;

export function relLuminance(c: readonly [number, number, number]): number {
  return LUM_R * c[0] + LUM_G * c[1] + LUM_B * c[2];
}

/**
 * The mud multiply for `tier`, already clamped so the DARKEST shipped champion
 * tint composed with the DARKEST allowed skin still clears `MIN_COMPOSED_LUM`.
 *
 * `championTint` is the #49 factor this will be multiplied INTO (absent = the
 * identity). The clamp is applied to the PRODUCT, because that product is what
 * actually reaches the pixel.
 */
export function mudTintFor(
  tier: GrowthTier,
  championTint?: readonly [number, number, number] | null,
): readonly [number, number, number] {
  const mud = GROWTH_TIER_MUD[tier] ?? GROWTH_TIER_MUD[0]!;
  const base = championTint ?? [1, 1, 1];
  const composed: [number, number, number] = [
    base[0]! * mud[0]!,
    base[1]! * mud[1]!,
    base[2]! * mud[2]!,
  ];
  const lum = relLuminance(composed);
  // The body's own skin colour contributes at most MIN_SKIN_LUM in the worst
  // authored case, so the composed TINT must stay above this ratio.
  const minTintLum = MIN_COMPOSED_LUM / MIN_SKIN_LUM;
  if (lum <= 0 || lum >= minTintLum) return composed;
  const k = minTintLum / lum;
  return [Math.min(1, composed[0] * k), Math.min(1, composed[1] * k), Math.min(1, composed[2] * k)];
}
