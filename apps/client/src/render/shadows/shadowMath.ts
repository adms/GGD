/**
 * shadowMath — PURE tunables + geometry for the blob-shadow layer (task #147).
 *
 * A soft dark disc under every live body ("character shadows" the playtest
 * flagged as missing). This half is Babylon-free so the footprint sizing and
 * disc scaling are unit-testable on their own; `ShadowLayer` is the imperative
 * shell that pools the meshes and follows the entities.
 *
 * The shadow is PURE PRESENTATION — it reads rendered positions the render
 * layer already exposes and never feeds the sim, so nothing here can desync.
 */

/** Blob-shadow footprint radius (world units) for a champion-sized body. */
export const SHADOW_CHAMPION_RADIUS = 0.55;
/** Smaller footprint for a neutral healing flower (a plant, not a fighter). */
export const SHADOW_FLOWER_RADIUS = 0.32;
/** Clamp bounds so a corrupt/exotic footprint can never scale a disc absurdly. */
export const SHADOW_MIN_RADIUS = 0.12;
export const SHADOW_MAX_RADIUS = 1.6;

/**
 * Peak opacity of a blob shadow (0..1). Soft enough to read as a grounded
 * contact shadow, never a hard black hole under the feet.
 */
export const SHADOW_ALPHA = 0.34;

/** Height above the floor the disc sits at — beats z-fight, still hugs ground. */
export const SHADOW_Y = 0.02;

/** Footprint radius for a body, by whether it is a neutral flower. PURE. */
export function shadowRadiusFor(isFlower: boolean): number {
  return clampShadowRadius(isFlower ? SHADOW_FLOWER_RADIUS : SHADOW_CHAMPION_RADIUS);
}

/** Clamp a footprint radius into the sane band. PURE + idempotent. */
export function clampShadowRadius(radius: number): number {
  if (!Number.isFinite(radius)) return SHADOW_MIN_RADIUS;
  return Math.min(SHADOW_MAX_RADIUS, Math.max(SHADOW_MIN_RADIUS, radius));
}

/**
 * Non-uniform scaling for a unit ground quad so it becomes a disc of the given
 * footprint radius: [diameter, 1, diameter]. The quad lies flat on XZ, so Y is
 * left at 1. PURE.
 */
export function discScaling(radius: number): [number, number, number] {
  const d = clampShadowRadius(radius) * 2;
  return [d, 1, d];
}
