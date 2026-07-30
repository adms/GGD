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
export const KIND_GUARDIAN = 4;
/** A dropped 100-gold coin (task #191) — loot, not a unit. */
export const KIND_GOLD_COIN = 5;
/** A roguelite mob (task #215). Carries GH#192's 體型倍率 in the `mana` slot. */
export const KIND_MOB = 6;
/**
 * A 暗夜旗 (71-00 暗夜契約). Ground furniture like a revive circle: no health,
 * no bar — its `shield` slot carries the aura radius the black ring is drawn at.
 */
export const KIND_NIGHT_FLAG = 7;

/**
 * Does this entity kind carry an over-head HP bar? Revive circles (kind 3)
 * deliberately do NOT: they have no health sim-side, and their progress is
 * painted IN THE WORLD by the ring itself (render/views/ReviveCircleView) so
 * the channeller and the enemy standing on them read it from the ground, not
 * from a floating bar.
 */
export function hasOverheadBar(kind: number): boolean {
  return kind === KIND_CHAMPION || kind === KIND_FLOWER || kind === KIND_GUARDIAN;
}
// A GOLD COIN (kind 5) is likewise excluded, and for the same reason as the
// revive circle: it has no health component sim-side, and what it is worth is
// painted by the coin itself (render/views/CoinView) — a floating bar over a
// piece of loot would read as a unit you could attack.

/**
 * Neutral (team-less) bar color for flowers — a pale leaf green, distinct
 * from every TEAM_CSS entry (blue/red/green/gold) so a flower bar never
 * reads as a team's champion.
 */
export const NEUTRAL_BAR_COLOR = "#b7e3a8";

/**
 * Neutral bar color for the duel-zone GUARDIAN (task #89) — a warm stone-bronze,
 * distinct from the four TEAM_CSS colors AND from the flower's leaf green, so
 * the guardian's health bar reads as a NEUTRAL OBJECTIVE (nobody's teammate),
 * never as a team's champion. This is the visible half of "it is neutral": the
 * guardian encodes seatId -1, so it also never inherits a team tint.
 */
export const GUARDIAN_BAR_COLOR = "#c99a5c";

/** Explicit bar color for a kind; undefined = the UI derives it from teamId. */
export function anchorColorFor(kind: number): string | undefined {
  if (kind === KIND_FLOWER) return NEUTRAL_BAR_COLOR;
  if (kind === KIND_GUARDIAN) return GUARDIAN_BAR_COLOR;
  return undefined;
}

/**
 * World-space Y the bar is projected from. The guardian is a tall objective
 * (~3u model), so its bar floats higher than a champion's head; the flower is
 * a low ground beacon.
 */
export function anchorHeightFor(kind: number): number {
  if (kind === KIND_FLOWER) return 1.35;
  if (kind === KIND_GUARDIAN) return 3.5;
  return 2.45;
}
