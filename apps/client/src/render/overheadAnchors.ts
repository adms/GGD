/**
 * overheadAnchors — pure per-kind rules for the world-anchored overhead bars
 * (frameBus → ui/WorldAnchorLayer). Extracted from GameApp so the filter is
 * unit-testable: champions (kind 0) AND neutral healing flowers (kind 2)
 * carry an HP bar; projectiles (kind 1) never do. Flowers get a neutral bar
 * color (deliberately outside the 4-team palette) and a lower projection
 * height (the lily sits near the ground; champions are ~1.8u tall).
 */

/**
 * EntityState.kind values (protocol/schema.ts): 0 champion, 1 projectile,
 * 2 flower, 3 revive circle.
 */
export const KIND_CHAMPION = 0;
export const KIND_FLOWER = 2;
export const KIND_REVIVE_CIRCLE = 3;

/**
 * Does this entity kind carry an over-head HP bar? Revive circles (kind 3)
 * deliberately do NOT: they have no health sim-side, and their progress is
 * painted IN THE WORLD by the ring itself (render/views/ReviveCircleView) so
 * the channeller and the enemy standing on them read it from the ground, not
 * from a floating bar.
 */
export function hasOverheadBar(kind: number): boolean {
  return kind === KIND_CHAMPION || kind === KIND_FLOWER;
}

/**
 * Neutral (team-less) bar color for flowers — a pale leaf green, distinct
 * from every TEAM_CSS entry (blue/red/green/gold) so a flower bar never
 * reads as a team's champion.
 */
export const NEUTRAL_BAR_COLOR = "#b7e3a8";

/** Explicit bar color for a kind; undefined = the UI derives it from teamId. */
export function anchorColorFor(kind: number): string | undefined {
  return kind === KIND_FLOWER ? NEUTRAL_BAR_COLOR : undefined;
}

/** World-space Y the bar is projected from (champion head vs. low flower). */
export function anchorHeightFor(kind: number): number {
  return kind === KIND_FLOWER ? 1.35 : 2.45;
}
