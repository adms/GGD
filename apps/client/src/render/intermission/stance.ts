/**
 * stance — GROUND the intermission champion so it stands ON the floor, not
 * sunk into it or floating above it (task #111).
 *
 * The bug the user saw: 「皮卡丘 is face-down on the floor」. The intermission is
 * the first place ONE champion is shown large, still and close, so any resting-
 * pose defect that reads as jitter in a fight reads as "lying on the floor"
 * here. The arena's ChampionView and champ-select's StorePreview (#129) both
 * MEASURE the model and lift its feet onto the podium; the intermission mount
 * did not, so an imported hero whose local bind box dips below the origin —
 * e.g. `imported.picacugy` spans y∈[-0.58, 1.71] — placed at position.y = 0
 * sits half a unit into the paving. Grounding it is the same per-model
 * root-transform #129 applies, ported to this different mount.
 *
 * This is a PURE decision (a single number) so it is unit-tested without a GPU;
 * the scene measures the world bounding box and applies the shift.
 */

/** A world-space bounding-box corner, matching Babylon's Vector3 shape. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * The y-shift to add to the champion root so its LOWEST point sits on the floor
 * (y = 0). Mirrors `computePreviewFraming().groundShiftY` (#129): `-min.y`.
 *
 * A bone-only / empty hierarchy yields a non-finite box; that returns 0 (leave
 * the model where it is) rather than teleporting it by NaN.
 */
export function groundShiftY(min: Vec3Like, max: Vec3Like): number {
  if (!Number.isFinite(min.y) || !Number.isFinite(max.y) || max.y < min.y) return 0;
  return -min.y;
}
