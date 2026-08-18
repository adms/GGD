/**
 * Decor placement math — arena@1 `decor[]` entries are authored as
 * {x, z, rotQuarter (0-3), scale}; the renderer needs a y-up world transform.
 * Kept pure so the quarter-turn -> radians conversion is unit-tested.
 */

export const QUARTER_TURN = Math.PI / 2;

export interface DecorPlacement {
  x: number;
  /** ground plane unless the doc lifts it (`decor[].y`, GH#386 ③ — roofs/beams) */
  y: number;
  z: number;
  /** rotation around +Y in radians */
  rotationY: number;
  scale: number;
}

export function decorTransform(d: {
  x: number;
  y?: number;
  z: number;
  rotQuarter?: number;
  scale?: number;
}): DecorPlacement {
  const q = ((d.rotQuarter ?? 0) % 4 + 4) % 4;
  return {
    x: d.x,
    y: d.y ?? 0,
    z: d.z,
    rotationY: q * QUARTER_TURN,
    scale: d.scale ?? 1,
  };
}

/** Spawn marker colors per side (side 0 / side 1 of a zone's spawns tuple). */
export const TEAM_SPAWN_COLORS: readonly [string, string] = ["#3b82f6", "#fbbf24"];
