/**
 * minimapMath — pure world→map projection, camera-frustum math and marker
 * rules for the LoL-spec minimap (no DOM, no Babylon).
 *
 * ORIENTATION. The arena is a set of circular zones (frameBus.arenaZones,
 * written by GameApp.applyArena); their union bounding box defines the mapped
 * world rect. Up-on-map = up-on-screen: render/CameraRig.apply() places the
 * camera at (target.x, up, target.z - back) looking at the target, so the
 * ground-plane view direction is +Z. That is expressed here as a forward
 * VECTOR (CAMERA_FORWARD_XZ) whose yaw is DERIVED — never a magic angle — and
 * at runtime the minimap prefers the live `frameBus.cameraView.yawRad` the rig
 * itself measured, so a future yawed/rotating rig stays aligned for free.
 *
 * VIEWPORT BOX. `cameraGroundQuad` intersects the four frustum corner rays
 * with the y=0 plane using the rig's OWN numbers (target, dolly, pitch, fov,
 * aspect — see CameraRig.groundView). It reconstructs Babylon's LookAtLH basis
 * and PerspectiveFovLH mapping, so the drawn rectangle is the real on-screen
 * ground area; minimapMath.test.ts pins it against a live Babylon rig's
 * `screenToGround` on the NullEngine.
 */
import type { ArenaZoneCircle, CameraGroundView } from "../../frameBus";
import { teamCss } from "../theme";
import { NEUTRAL_BAR_COLOR } from "../../render/overheadAnchors";

/** Axis-aligned world rect covered by the minimap. */
export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A point in map-canvas space (px, y grows DOWN). */
export interface MapPoint {
  x: number;
  y: number;
}

/** A point on the planar world ground (y is always 0 — the sim is 2D). */
export interface WorldPoint {
  x: number;
  z: number;
}

/**
 * The fixed camera's ground-plane forward direction (see module doc: the rig
 * sits BEHIND the target along -Z, looking +Z). Kept as a vector so the yaw
 * below is derived, never a magic angle.
 */
export const CAMERA_FORWARD_XZ = { x: 0, z: 1 } as const;

/** Camera yaw (radians) derived from the forward vector — 0 for the fixed rig. */
export const CAMERA_YAW_RAD = Math.atan2(CAMERA_FORWARD_XZ.x, CAMERA_FORWARD_XZ.z);

/**
 * Union bounding box of the arena's circular zones, padded by `pad` world
 * units so rim-hugging dots aren't clipped. Null when no arena is known yet.
 */
export function boundsFromZones(
  zones: readonly ArenaZoneCircle[] | null,
  pad = 2,
): MapBounds | null {
  if (!zones || zones.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const z of zones) {
    if (!(z.r > 0)) continue;
    if (z.x - z.r < minX) minX = z.x - z.r;
    if (z.x + z.r > maxX) maxX = z.x + z.r;
    if (z.z - z.r < minZ) minZ = z.z - z.r;
    if (z.z + z.r > maxZ) maxZ = z.z + z.r;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

/**
 * Uniform world→map scale (map px per world unit): the LONGER bounds side
 * fills `sizePx`, the shorter is centered (aspect preserved, no stretching).
 */
export function mapScale(bounds: MapBounds, sizePx: number): number {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return span > 0 ? sizePx / span : 0;
}

/**
 * World (x,z) → map-canvas (x,y) in a `sizePx`-square canvas (y grows DOWN).
 * The world rect is rotated by the camera yaw so that camera-forward maps to
 * map-up: with the fixed rig (yaw 0), +Z (away from the camera / up on
 * screen) is up on the map and +X (screen right) is right on the map.
 */
export function worldToMap(
  wx: number,
  wz: number,
  bounds: MapBounds,
  sizePx: number,
  yawRad: number = CAMERA_YAW_RAD,
): MapPoint {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const dx = wx - cx;
  const dz = wz - cz;
  // forward = (sin yaw, cos yaw); right = forward rotated -90° = (cos yaw, -sin yaw)
  const fx = Math.sin(yawRad);
  const fz = Math.cos(yawRad);
  const u = dx * fz + dz * -fx; // screen-right component
  const v = dx * fx + dz * fz; // screen-up component
  const s = mapScale(bounds, sizePx);
  return { x: sizePx / 2 + u * s, y: sizePx / 2 - v * s };
}

/**
 * EXACT inverse of `worldToMap` — map-canvas (x,y) → world (x,z). This is what
 * turns a click on the minimap into a camera focus point or a move order, so
 * it must round-trip: `mapToWorld(worldToMap(p)) === p`.
 */
export function mapToWorld(
  mx: number,
  my: number,
  bounds: MapBounds,
  sizePx: number,
  yawRad: number = CAMERA_YAW_RAD,
): WorldPoint {
  const s = mapScale(bounds, sizePx);
  if (!(s > 0)) return { x: 0, z: 0 };
  const u = (mx - sizePx / 2) / s;
  const v = (sizePx / 2 - my) / s;
  const fx = Math.sin(yawRad);
  const fz = Math.cos(yawRad);
  // invert [u,v] = R·[dx,dz] with R orthonormal ⇒ [dx,dz] = Rᵀ·[u,v]
  const dx = u * fz + v * fx;
  const dz = u * -fx + v * fz;
  return {
    x: (bounds.minX + bounds.maxX) / 2 + dx,
    z: (bounds.minZ + bounds.maxZ) / 2 + dz,
  };
}

/**
 * Clamp a world point into the nearest arena zone (a click on the empty
 * padding between/around the zone discs still produces a legal order target,
 * instead of sending the hero into a wall). Returns the point unchanged when
 * it is already inside some zone, or when no zones are known.
 */
export function clampToZones(
  p: WorldPoint,
  zones: readonly ArenaZoneCircle[] | null,
  margin = 0.5,
): WorldPoint {
  if (!zones || zones.length === 0) return p;
  let best: ArenaZoneCircle | null = null;
  let bestGap = Infinity;
  for (const z of zones) {
    if (!(z.r > 0)) continue;
    const d = Math.hypot(p.x - z.x, p.z - z.z);
    if (d <= z.r) return p; // already inside a zone
    const gap = d - z.r;
    if (gap < bestGap) {
      bestGap = gap;
      best = z;
    }
  }
  if (!best) return p;
  const d = Math.hypot(p.x - best.x, p.z - best.z) || 1;
  const r = Math.max(0, best.r - margin);
  return { x: best.x + ((p.x - best.x) / d) * r, z: best.z + ((p.z - best.z) / d) * r };
}

// ---------------------------------------------------------------------------
// local-zone scoping (task #67)
// ---------------------------------------------------------------------------

/**
 * Index of the duel zone a world point belongs to: the disc that CONTAINS it,
 * or — when the point sits in the padding between/around the discs — the
 * NEAREST zone by gap to the rim (the same tie-break `clampToZones` uses, so a
 * point is never assigned to a different zone than an order to it would clamp
 * into). Null when no zones are known. This is how the minimap decides which
 * single 3v3 belongs to the local player: feed it the local champion's world
 * position.
 */
export function zoneIndexAt(
  p: WorldPoint,
  zones: readonly ArenaZoneCircle[] | null,
): number | null {
  if (!zones || zones.length === 0) return null;
  let best: number | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]!;
    if (!(z.r > 0)) continue;
    const d = Math.hypot(p.x - z.x, p.z - z.z);
    if (d <= z.r) return i; // strictly inside this disc — decided
    const gap = d - z.r;
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

/**
 * Bounds of the LOCAL player's OWN duel zone (task #67): the padded box of the
 * single zone `zoneIndex`. With no local zone (spectating, or the id/position
 * isn't known yet) or an out-of-range index it falls back to the whole-arena
 * union box — so the map degrades to "show everything" rather than to nothing.
 */
export function boundsForZone(
  zones: readonly ArenaZoneCircle[] | null,
  zoneIndex: number | null,
  pad = 2,
): MapBounds | null {
  if (zoneIndex === null) return boundsFromZones(zones, pad);
  const z = zones?.[zoneIndex];
  if (!z) return boundsFromZones(zones, pad);
  return boundsFromZones([z], pad);
}

/**
 * Entity filter for the zone-scoped map (task #67): does an entity at (wx,wz)
 * belong to the local player's duel zone? A `localZone` of null means "no zone
 * to scope to" (spectator / unknown) and EVERYTHING passes — matching
 * `boundsForZone`'s whole-arena fallback so the bounds and the filter never
 * disagree. Zone membership is by the same nearest-disc rule the bounds use, so
 * a marker that passes is always inside the disc the map is drawing.
 */
export function inLocalZone(
  wx: number,
  wz: number,
  zones: readonly ArenaZoneCircle[] | null,
  localZone: number | null,
): boolean {
  if (localZone === null) return true;
  return zoneIndexAt({ x: wx, z: wz }, zones) === localZone;
}

// ---------------------------------------------------------------------------
// camera viewport box
// ---------------------------------------------------------------------------

/**
 * Farthest a frustum corner ray is followed before we give up (world units).
 * Rays at or above the horizon never meet the ground; rather than dropping the
 * box we walk them out to this distance, which lands far outside the arena and
 * is clipped away by the map rect.
 */
export const CAMERA_QUAD_MAX_DISTANCE = 500;

export interface CameraGroundQuad {
  /** ground corners in draw order: near-left, near-right, far-right, far-left */
  points: WorldPoint[];
  /** true when at least one corner ray missed the ground and was walked out */
  clamped: boolean;
}

/**
 * Project the camera frustum onto the ground plane (y=0) and return the four
 * ground corners of what the player can actually see.
 *
 * Reconstructs Babylon's own conventions from the rig's live numbers:
 *   - basis: LookAtLH ⇒ zAxis = normalize(target-eye), xAxis = normalize(up ×
 *     zAxis), yAxis = zAxis × xAxis;
 *   - projection: PerspectiveFovLH with the default vertical-fixed FOV ⇒ a
 *     corner at NDC (nx, ny) has view-space slope (nx·tan(fov/2)·aspect,
 *     ny·tan(fov/2), 1).
 * Nothing here is a tuned constant — swap the rig's pitch/dolly/fov and the box
 * follows.
 */
export function cameraGroundQuad(
  view: CameraGroundView,
  maxDistance = CAMERA_QUAD_MAX_DISTANCE,
): CameraGroundQuad | null {
  if (!(view.dolly > 0) || !(view.fovRad > 0) || !(view.aspect > 0)) return null;
  const sinP = Math.sin(view.pitchRad);
  const cosP = Math.cos(view.pitchRad);
  const eyeY = view.dolly * sinP;
  if (!(eyeY > 0)) return null; // camera at/below the ground: nothing to project
  const back = view.dolly * cosP;
  const fx = Math.sin(view.yawRad);
  const fz = Math.cos(view.yawRad);
  const eyeX = view.targetX - fx * back;
  const eyeZ = view.targetZ - fz * back;

  // camera basis (world space)
  const zAxis = { x: fx * cosP, y: -sinP, z: fz * cosP };
  const xAxis = { x: fz, y: 0, z: -fx }; // normalize(worldUp × zAxis)
  const yAxis = {
    // zAxis × xAxis
    x: zAxis.y * xAxis.z - zAxis.z * xAxis.y,
    y: zAxis.z * xAxis.x - zAxis.x * xAxis.z,
    z: zAxis.x * xAxis.y - zAxis.y * xAxis.x,
  };

  const tanH = Math.tan(view.fovRad / 2);
  const sx = tanH * view.aspect;
  // NDC corners in draw order: bottom-left (nearest to the player) → clockwise
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const points: WorldPoint[] = [];
  let clamped = false;
  for (const [nx, ny] of corners) {
    const dx = zAxis.x + nx * sx * xAxis.x + ny * tanH * yAxis.x;
    const dy = zAxis.y + nx * sx * xAxis.y + ny * tanH * yAxis.y;
    const dz = zAxis.z + nx * sx * xAxis.z + ny * tanH * yAxis.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    let t = dy < -1e-6 ? -eyeY / (dy / len) : Infinity;
    if (!(t <= maxDistance)) {
      t = maxDistance; // at/above the horizon — walk it out past the arena
      clamped = true;
    }
    points.push({ x: eyeX + (dx / len) * t, z: eyeZ + (dz / len) * t });
  }
  return { points, clamped };
}

// ---------------------------------------------------------------------------
// marker rules
// ---------------------------------------------------------------------------

/**
 * Dot color for an anchor: an explicit color (neutral flowers carry
 * NEUTRAL_BAR_COLOR) wins; otherwise the shared 4-team HUD palette.
 */
export function dotColorFor(teamId: number, explicit?: string): string {
  return explicit ?? (teamId >= 0 ? teamCss(teamId) : NEUTRAL_BAR_COLOR);
}

/**
 * Is this anchor the LOCAL player's champion? Prefer the authoritative
 * localEntityId from the HUD store; fall back to the anchor's isLocal flag
 * (set from the prediction seam) while the id is still unknown.
 */
export function isSelfMarker(
  anchor: { entityId: number; isLocal: boolean },
  localEntityId: number | null,
): boolean {
  return localEntityId !== null ? anchor.entityId === localEntityId : anchor.isLocal;
}

/** How a champion marker is drawn — LoL's three states, chosen in one place. */
export type MarkerStyle = "self" | "ally" | "dead";

export interface MarkerSpec {
  style: MarkerStyle;
  /** icon radius in map px */
  radius: number;
  /** team-colored ring thickness in map px */
  ringWidth: number;
  /** ring color (the self marker gets a brighter white ring over the team hue) */
  ringColor: string;
  /** portrait/dot color */
  color: string;
  /** 0..1 — dead markers fade out */
  alpha: number;
}

/** Base champion-marker radius (map px) at the reference 208px desktop map. */
export const MARKER_RADIUS = 9;
/** Self marker is deliberately larger — LoL's "find yourself instantly" rule. */
export const SELF_MARKER_RADIUS = 11.5;
/** Dead markers linger as dimmed hollow rings for this long. */
export const DEAD_FADE_MS = 2600;

/**
 * The complete draw spec for one champion marker. Keeping self/ally/dead
 * selection here (instead of inline in the canvas loop) is what makes
 * "the local player is always the biggest, brightest marker" testable.
 */
export function markerSpecFor(
  anchor: { entityId: number; isLocal: boolean; teamId: number; alive: boolean; color?: string },
  localEntityId: number | null,
  opts: { scale?: number; deadAgeMs?: number } = {},
): MarkerSpec | null {
  const scale = opts.scale ?? 1;
  const color = dotColorFor(anchor.teamId, anchor.color);
  if (!anchor.alive) {
    const t = Math.max(0, Math.min(1, (opts.deadAgeMs ?? 0) / DEAD_FADE_MS));
    if (t >= 1) return null; // fully faded — stop drawing it
    return {
      style: "dead",
      radius: MARKER_RADIUS * 0.62 * scale,
      ringWidth: 1.5 * scale,
      ringColor: color,
      color,
      alpha: 0.5 * (1 - t),
    };
  }
  if (isSelfMarker(anchor, localEntityId)) {
    return {
      style: "self",
      radius: SELF_MARKER_RADIUS * scale,
      ringWidth: 2.5 * scale,
      ringColor: "#ffffff",
      color,
      alpha: 1,
    };
  }
  return {
    style: "ally",
    radius: MARKER_RADIUS * scale,
    ringWidth: 2 * scale,
    ringColor: color,
    color,
    alpha: 0.95,
  };
}

// ---------------------------------------------------------------------------
// FIRE-RING DANGER RIM (task #195)
// ---------------------------------------------------------------------------

/** What the minimap needs to draw the fire ring, straight off `MatchState`. */
export interface DangerRimInput {
  phase: string;
  /** MatchState.fireRingTicks — the sim's combat-elapsed counter; -1 = disarmed */
  fireRingTicks: number;
  /** MatchState.fireRingRadius — the ring's CURRENT world radius */
  fireRingRadius: number;
  /** the zone's own boundaryRadius (the ring's starting size) */
  zoneRadius: number;
}

/** Where to draw the rim and how hard to pulse it. */
export interface DangerRimSpec {
  /** world-unit radius of the circle to stroke */
  radius: number;
  /** 0 the instant it starts closing → 1 when fully closed */
  urgency: number;
}

/**
 * The minimap's fire-ring rim, DERIVED FROM THE REPLICATED RADIUS.
 *
 * Until #195 this was drawn at the zone boundary and gated on
 * `phaseSecondsLeft <= FIRE_RING_SEC`, under a comment claiming 「the sim has
 * no shrinking-ring entity, so the map must not draw one」. That was already
 * false — the ring was burning people — and it is emphatically false now: the
 * sim owns a radius and replicates it, so the map draws THAT.
 *
 * Returns null while there is nothing to show — outside combat, disarmed, or
 * before the ring has begun to move (radius still == the zone boundary). The
 * rim therefore appears on the first shrink tick and, because the sim freezes
 * `fireRingTicks` on round settle, freezes with it instead of continuing to
 * collapse over a finished round.
 */
export function dangerRimSpecFor(i: DangerRimInput): DangerRimSpec | null {
  if (i.phase !== "combat") return null;
  if (!(i.fireRingTicks >= 0)) return null;
  if (!(i.zoneRadius > 0)) return null;
  const r = i.fireRingRadius;
  if (!(r > 0) || !(r < i.zoneRadius)) return null;
  return { radius: r, urgency: Math.max(0, Math.min(1, 1 - r / i.zoneRadius)) };
}
