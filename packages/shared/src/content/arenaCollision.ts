/**
 * arenaCollision — the single source of truth for "which decor props BLOCK".
 * A player must never walk through a visually-solid prop, so every blocking
 * decor entry needs a matching collision obstacle (the sim's gameplay truth).
 * This module classifies decor models, derives the obstacle a blocking prop
 * should have, and audits a whole arena doc for decor↔obstacle gaps. Used by
 * the arena generator (to EMIT obstacles) and by the audit test (to VERIFY),
 * so both encode the same rule.
 *
 * Trees use a TRUNK-sized footprint (not the canopy) so jungles stay walkable.
 * Ground tiles, torches, banners, waterlilies, clouds, etc. are flavor and
 * intentionally collision-free.
 */
import type { ArenaDoc } from "./schema/arena";

/** Blocking models → base (unscaled) collision radius; matched by substring. */
export const BLOCKING_FOOTPRINTS: { match: string; base: number }[] = [
  { match: "trees_large", base: 0.6 },
  { match: "trees_medium", base: 0.5 },
  { match: "tree_single", base: 0.35 },
  { match: "trees_", base: 0.5 }, // generic forest tile
  { match: "japanesecherry", base: 0.4 }, // godie cherry — trunk-sized, NOT canopy
  { match: "tower_", base: 1.5 },
  { match: "pillar", base: 1.0 },
  { match: "crates_stacked", base: 0.7 },
  { match: "crate", base: 0.6 },
  { match: "chest", base: 0.55 },
  { match: "barrel", base: 0.45 },
  { match: "rock", base: 0.7 },
];

/** Flavor models that never block (checked BEFORE blocking classification). */
export const NON_BLOCKING = [
  "torch",
  "banner",
  "floor_tile",
  "waterlily",
  "waterplant",
  "hex_water",
  "hex_grass",
  "cloud",
];

export interface ModelClass {
  blocking: boolean;
  /** base collision radius (unscaled) when blocking */
  base: number;
}

export function classifyModel(model: string): ModelClass {
  const f = model.toLowerCase();
  if (NON_BLOCKING.some((n) => f.includes(n))) return { blocking: false, base: 0 };
  const hit = BLOCKING_FOOTPRINTS.find((b) => f.includes(b.match));
  return hit ? { blocking: true, base: hit.base } : { blocking: false, base: 0 };
}

const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/** Point→segment distance (for wall-segment matching). */
function pointSegDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return dist(px, pz, ax, az);
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, pz, ax + t * dx, az + t * dz);
}

export interface DecorLike {
  model: string;
  x: number;
  z: number;
  scale: number;
}
export interface ZoneCenter {
  center: { x: number; z: number };
  boundaryRadius: number;
}

/**
 * The circle obstacle a blocking decor prop should get, clamped to stay inside
 * the zone boundary. Returns null for non-blocking props or props outside the
 * play area (unreachable backdrop → no collision needed).
 */
export function circleObstacleForDecor(
  dec: DecorLike,
  zone: ZoneCenter,
): { kind: "circle"; center: { x: number; z: number }; radius: number } | null {
  const cls = classifyModel(dec.model);
  if (!cls.blocking) return null;
  const distC = dist(dec.x, dec.z, zone.center.x, zone.center.z);
  if (distC > zone.boundaryRadius) return null; // outside the play area
  const maxR = zone.boundaryRadius - distC - 0.1;
  if (maxR <= 0.15) return null; // right on the rim — can't fit a real obstacle
  const radius = Math.round(Math.min(cls.base * dec.scale, maxR) * 100) / 100;
  return { kind: "circle", center: { x: dec.x, z: dec.z }, radius };
}

export interface CollisionGap {
  zoneId: string;
  model: string;
  x: number;
  z: number;
  /** expected collision radius (base × scale) */
  wanted: number;
}

export interface CollisionAudit {
  /** blocking decor entries (inside a zone) that lack a matching obstacle */
  gaps: CollisionGap[];
  /** how many in-bounds blocking decor entries were checked */
  checked: number;
}

/**
 * Cross-check a doc's decor against its obstacles: every in-bounds blocking
 * prop must sit on/near a collision obstacle (circle within footprint+slack, or
 * a wall segment passing nearby). Returns the list of unmatched props.
 */
export function auditArenaCollision(doc: ArenaDoc): CollisionAudit {
  const gaps: CollisionGap[] = [];
  let checked = 0;
  for (const dec of doc.decor) {
    const cls = classifyModel(dec.model);
    if (!cls.blocking) continue;
    // assign the prop to the first zone whose boundary contains it
    const zone = doc.zones.find(
      (z) => dist(dec.x, dec.z, z.center.x, z.center.z) <= z.boundaryRadius,
    );
    if (!zone) continue; // outside every play area → backdrop, no collision needed
    checked++;
    const wanted = cls.base * dec.scale;
    const slack = 0.9;
    const matched = zone.obstacles.some((ob) => {
      if (ob.kind === "circle") return dist(ob.center.x, ob.center.z, dec.x, dec.z) <= wanted + slack;
      return pointSegDist(dec.x, dec.z, ob.a.x, ob.a.z, ob.b.x, ob.b.z) <= wanted + slack + 0.4;
    });
    if (!matched) {
      gaps.push({ zoneId: zone.id, model: dec.model, x: dec.x, z: dec.z, wanted: Math.round(wanted * 100) / 100 });
    }
  }
  return { gaps, checked };
}
