/**
 * Minimap math (client-18): pure world→map projection over the arena's
 * circular zones, orientation locked to the fixed camera (up-on-map =
 * up-on-screen), the shared 4-team dot palette, and self-marker selection.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  boundsForZone,
  boundsFromZones,
  cameraGroundQuad,
  clampToZones,
  inLocalZone,
  mapScale,
  mapToWorld,
  markerSpecFor,
  worldToMap,
  dotColorFor,
  isSelfMarker,
  zoneIndexAt,
  CAMERA_FORWARD_XZ,
  CAMERA_YAW_RAD,
  CAMERA_QUAD_MAX_DISTANCE,
  DEAD_FADE_MS,
  MARKER_RADIUS,
  SELF_MARKER_RADIUS,
} from "./minimapMath";
import type { CameraGroundView } from "../../frameBus";
import { TEAM_CSS, teamCss } from "../theme";
import { NEUTRAL_BAR_COLOR } from "../../render/overheadAnchors";

const SIZE = 176;

/** Two side-by-side zones like the PairedDuels skeleton arena (pad 0). */
const twoZones = () =>
  boundsFromZones(
    [
      { x: -40, z: 0, r: 30 },
      { x: 40, z: 0, r: 30 },
    ],
    0,
  )!;

describe("minimap world→map projection (hud-minimap)", () => {
  it("bounds = union bbox of the zone circles (+pad); null without zones", () => {
    cover("hud-minimap");
    expect(boundsFromZones(null)).toBeNull();
    expect(boundsFromZones([])).toBeNull();
    const b = boundsFromZones([{ x: 10, z: -5, r: 20 }], 2);
    expect(b).toEqual({ minX: -12, maxX: 32, minZ: -27, maxZ: 17 });
    const b2 = twoZones();
    expect(b2).toEqual({ minX: -70, maxX: 70, minZ: -30, maxZ: 30 });
  });

  it("center maps to the map center, corners to the map corners", () => {
    cover("hud-minimap");
    const b = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    const c = worldToMap(0, 0, b, SIZE);
    expect(c.x).toBeCloseTo(SIZE / 2);
    expect(c.y).toBeCloseTo(SIZE / 2);
    // fixed camera (yaw 0): +X → right, +Z → UP on the map (canvas y shrinks)
    const ne = worldToMap(50, 50, b, SIZE); // north-east corner
    expect(ne.x).toBeCloseTo(SIZE);
    expect(ne.y).toBeCloseTo(0);
    const sw = worldToMap(-50, -50, b, SIZE); // south-west corner
    expect(sw.x).toBeCloseTo(0);
    expect(sw.y).toBeCloseTo(SIZE);
  });

  it("non-square bounds keep a uniform scale (long side fills, no stretch)", () => {
    cover("hud-minimap");
    const b = twoZones(); // 140 wide × 60 tall
    expect(mapScale(b, SIZE)).toBeCloseTo(SIZE / 140);
    const east = worldToMap(70, 0, b, SIZE);
    expect(east.x).toBeCloseTo(SIZE);
    // the short (Z) side is centered, NOT stretched to the canvas edge
    const north = worldToMap(0, 30, b, SIZE);
    expect(north.y).toBeCloseTo(SIZE / 2 - 30 * (SIZE / 140));
  });

  it("yaw aligns camera-forward with map-up (derived, not a magic angle)", () => {
    cover("hud-minimap");
    // the fixed rig looks along +Z ⇒ derived yaw is 0
    expect(CAMERA_YAW_RAD).toBeCloseTo(Math.atan2(CAMERA_FORWARD_XZ.x, CAMERA_FORWARD_XZ.z));
    expect(CAMERA_YAW_RAD).toBeCloseTo(0);
    const b = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    // a point straight AHEAD of the camera (forward dir) must map straight UP
    const ahead = worldToMap(CAMERA_FORWARD_XZ.x * 40, CAMERA_FORWARD_XZ.z * 40, b, SIZE);
    expect(ahead.x).toBeCloseTo(SIZE / 2);
    expect(ahead.y).toBeLessThan(SIZE / 2);
    // sanity for a hypothetical yawed rig: camera looking +X ⇒ +X maps up
    const yaw90 = Math.atan2(1, 0);
    const p = worldToMap(40, 0, b, SIZE, yaw90);
    expect(p.x).toBeCloseTo(SIZE / 2);
    expect(p.y).toBeCloseTo(SIZE / 2 - 40 * (SIZE / 100));
  });

  it("dots use the exact shared 4-team HUD palette; flowers stay neutral green", () => {
    cover("hud-minimap");
    for (let team = 0; team < 4; team++) {
      expect(dotColorFor(team)).toBe(TEAM_CSS[team]);
      expect(dotColorFor(team)).toBe(teamCss(team));
    }
    // explicit anchor color (neutral flower) wins over the team palette
    expect(dotColorFor(-1, NEUTRAL_BAR_COLOR)).toBe(NEUTRAL_BAR_COLOR);
    expect(dotColorFor(-1)).toBe(NEUTRAL_BAR_COLOR);
    expect(TEAM_CSS).not.toContain(NEUTRAL_BAR_COLOR);
  });

  it("self marker: authoritative localEntityId first, isLocal fallback", () => {
    cover("hud-minimap");
    expect(isSelfMarker({ entityId: 7, isLocal: false }, 7)).toBe(true);
    expect(isSelfMarker({ entityId: 8, isLocal: true }, 7)).toBe(false);
    // id unknown yet → trust the prediction seam's flag
    expect(isSelfMarker({ entityId: 8, isLocal: true }, null)).toBe(true);
    expect(isSelfMarker({ entityId: 8, isLocal: false }, null)).toBe(false);
  });
});

/**
 * client-21: what makes the map READABLE — a click maps back to the exact world
 * point it was drawn from, and the viewport box is the camera's real frustum
 * projected onto the ground (the rig-accuracy half of this lives in
 * render/cameraGroundView.test.ts, which pins it against a live Babylon rig).
 */
describe("minimap click → world (hud-minimap-interact)", () => {
  const bounds = { minX: -70, maxX: 70, minZ: -30, maxZ: 30 };

  it("mapToWorld is the exact inverse of worldToMap", () => {
    cover("hud-minimap-interact");
    for (const yaw of [0, Math.PI / 2, -0.7, Math.PI]) {
      for (const [wx, wz] of [
        [0, 0],
        [-40, 12],
        [63, -27],
        [12.5, 3.25],
      ] as const) {
        const m = worldToMap(wx, wz, bounds, SIZE, yaw);
        const back = mapToWorld(m.x, m.y, bounds, SIZE, yaw);
        expect(back.x, `yaw=${yaw}`).toBeCloseTo(wx, 6);
        expect(back.z, `yaw=${yaw}`).toBeCloseTo(wz, 6);
      }
    }
  });

  it("the map centre is the world centre; map corners are the padded rect", () => {
    cover("hud-minimap-interact");
    const c = mapToWorld(SIZE / 2, SIZE / 2, bounds, SIZE);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
    // long side fills the canvas, so the left edge is the world's minX
    expect(mapToWorld(0, SIZE / 2, bounds, SIZE).x).toBeCloseTo(bounds.minX);
    expect(mapToWorld(SIZE, SIZE / 2, bounds, SIZE).x).toBeCloseTo(bounds.maxX);
    // canvas y grows DOWN, world +Z is UP on the map
    expect(mapToWorld(SIZE / 2, 0, bounds, SIZE).z).toBeGreaterThan(0);
  });

  it("a right-click order clamps into the nearest zone (never into the void)", () => {
    cover("hud-minimap-interact");
    const zones = [
      { x: -40, z: 0, r: 24 },
      { x: 40, z: 0, r: 24 },
    ];
    // inside a zone: untouched
    expect(clampToZones({ x: -38, z: 5 }, zones)).toEqual({ x: -38, z: 5 });
    // in the gap between the two discs → pulled into the NEAR one, inside the rim
    const gap = clampToZones({ x: 8, z: 0 }, zones, 0.5);
    expect(gap.x).toBeCloseTo(40 - 23.5);
    expect(gap.z).toBeCloseTo(0);
    expect(Math.hypot(gap.x - 40, gap.z)).toBeLessThan(24);
    // far outside on the other side → the other zone wins
    const far = clampToZones({ x: -200, z: 0 }, zones, 0.5);
    expect(far.x).toBeCloseTo(-40 - 23.5);
    // no arena loaded → passthrough (the caller still has a legal point)
    expect(clampToZones({ x: 5, z: 5 }, null)).toEqual({ x: 5, z: 5 });
    expect(clampToZones({ x: 5, z: 5 }, [])).toEqual({ x: 5, z: 5 });
  });
});

describe("minimap camera viewport box (hud-minimap-camera)", () => {
  /** the shipped fixed rig: 55° pitch, closest dolly, Babylon's default fov */
  const view = (over: Partial<CameraGroundView> = {}): CameraGroundView => ({
    targetX: 0,
    targetZ: 0,
    dolly: 10,
    pitchRad: (55 * Math.PI) / 180,
    yawRad: 0,
    fovRad: 0.8,
    aspect: 16 / 9,
    ...over,
  });

  it("is a trapezoid: the far edge is WIDER than the near edge (perspective)", () => {
    cover("hud-minimap-camera");
    const q = cameraGroundQuad(view())!;
    expect(q.points).toHaveLength(4);
    expect(q.clamped).toBe(false);
    const [nl, nr, fr, fl] = q.points as [
      { x: number; z: number },
      { x: number; z: number },
      { x: number; z: number },
      { x: number; z: number },
    ];
    const nearW = nr.x - nl.x;
    const farW = fr.x - fl.x;
    expect(nearW).toBeGreaterThan(0);
    expect(farW).toBeGreaterThan(nearW);
    // the near edge is BEHIND the target (toward the camera), the far edge ahead
    expect(nl.z).toBeLessThan(0);
    expect(fl.z).toBeGreaterThan(0);
    // symmetric about the sightline
    expect(nl.x).toBeCloseTo(-nr.x);
    expect(fl.x).toBeCloseTo(-fr.x);
  });

  it("follows the rig: the box translates with the target and grows with dolly", () => {
    cover("hud-minimap-camera");
    const base = cameraGroundQuad(view())!;
    const moved = cameraGroundQuad(view({ targetX: 25, targetZ: -8 }))!;
    base.points.forEach((p, i) => {
      expect(moved.points[i]!.x).toBeCloseTo(p.x + 25);
      expect(moved.points[i]!.z).toBeCloseTo(p.z - 8);
    });
    // zoomed out = strictly more ground visible (LoL's box grows as you zoom)
    const zoomed = cameraGroundQuad(view({ dolly: 30 }))!;
    const area = (q: { points: { x: number; z: number }[] }): number => {
      let a = 0;
      for (let i = 0; i < q.points.length; i++) {
        const p = q.points[i]!;
        const n = q.points[(i + 1) % q.points.length]!;
        a += p.x * n.z - n.x * p.z;
      }
      return Math.abs(a) / 2;
    };
    expect(area(zoomed)).toBeGreaterThan(area(base));
    // a wider viewport widens the box without moving the near/far edges
    const wide = cameraGroundQuad(view({ aspect: 21 / 9 }))!;
    expect(wide.points[1]!.x).toBeGreaterThan(base.points[1]!.x);
    expect(wide.points[1]!.z).toBeCloseTo(base.points[1]!.z);
  });

  it("rotates with the rig's yaw (never a hardcoded orientation)", () => {
    cover("hud-minimap-camera");
    const base = cameraGroundQuad(view())!;
    const yawed = cameraGroundQuad(view({ yawRad: Math.PI / 2 }))!;
    // yaw +90° maps camera-forward from +Z onto +X: the far edge is now +X
    expect(yawed.points[2]!.x).toBeCloseTo(base.points[2]!.z);
    expect(yawed.points[2]!.z).toBeCloseTo(-base.points[2]!.x);
  });

  it("survives a camera that cannot see the ground", () => {
    cover("hud-minimap-camera");
    // a nearly-horizontal camera: the top rays are above the horizon and get
    // walked out to the clamp instead of producing Infinity/NaN corners
    const flat = cameraGroundQuad(view({ pitchRad: 0.05, fovRad: 1.2 }))!;
    expect(flat.clamped).toBe(true);
    for (const p of flat.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(CAMERA_QUAD_MAX_DISTANCE + 1);
    }
    // degenerate rigs return null rather than a fake rectangle
    expect(cameraGroundQuad(view({ dolly: 0 }))).toBeNull();
    expect(cameraGroundQuad(view({ fovRad: 0 }))).toBeNull();
    expect(cameraGroundQuad(view({ aspect: 0 }))).toBeNull();
    expect(cameraGroundQuad(view({ pitchRad: 0 }))).toBeNull(); // eye on the ground
  });
});

describe("minimap champion markers (hud-minimap-markers)", () => {
  const champ = (over: Partial<{ entityId: number; isLocal: boolean; teamId: number; alive: boolean; color?: string }> = {}) => ({
    entityId: 1,
    isLocal: false,
    teamId: 2,
    alive: true,
    ...over,
  });

  it("SELF is the biggest, brightest marker; allies/enemies wear the team ring", () => {
    cover("hud-minimap-markers");
    const self = markerSpecFor(champ({ entityId: 7 }), 7)!;
    const other = markerSpecFor(champ({ entityId: 8 }), 7)!;
    expect(self.style).toBe("self");
    expect(other.style).toBe("ally");
    expect(self.radius).toBeGreaterThan(other.radius);
    expect(self.radius).toBe(SELF_MARKER_RADIUS);
    expect(other.radius).toBe(MARKER_RADIUS);
    // the white ring is what the eye locks onto; everyone else is team-coloured
    expect(self.ringColor).toBe("#ffffff");
    expect(other.ringColor).toBe(TEAM_CSS[2]);
    expect(self.color).toBe(TEAM_CSS[2]); // still identifiably your team
    expect(self.alpha).toBeGreaterThanOrEqual(other.alpha);
  });

  it("falls back to isLocal before the authoritative entity id arrives", () => {
    cover("hud-minimap-markers");
    expect(markerSpecFor(champ({ entityId: 8, isLocal: true }), null)!.style).toBe("self");
    expect(markerSpecFor(champ({ entityId: 8, isLocal: false }), null)!.style).toBe("ally");
  });

  it("dead champions dim to a hollow ring, then stop drawing", () => {
    cover("hud-minimap-markers");
    const fresh = markerSpecFor(champ({ alive: false }), null, { deadAgeMs: 0 })!;
    expect(fresh.style).toBe("dead");
    expect(fresh.radius).toBeLessThan(MARKER_RADIUS);
    expect(fresh.alpha).toBeLessThan(1);
    const older = markerSpecFor(champ({ alive: false }), null, { deadAgeMs: DEAD_FADE_MS / 2 })!;
    expect(older.alpha).toBeLessThan(fresh.alpha);
    // fully faded → null, so the draw loop simply skips it
    expect(markerSpecFor(champ({ alive: false }), null, { deadAgeMs: DEAD_FADE_MS })).toBeNull();
    // death outranks self: your own corpse is a hollow ring too
    expect(markerSpecFor(champ({ entityId: 7, alive: false }), 7, { deadAgeMs: 0 })!.style).toBe("dead");
  });

  it("scales every marker with the map size (phone map stays proportional)", () => {
    cover("hud-minimap-markers");
    const big = markerSpecFor(champ(), null, { scale: 1 })!;
    const small = markerSpecFor(champ(), null, { scale: 0.5 })!;
    expect(small.radius).toBeCloseTo(big.radius / 2);
    expect(small.ringWidth).toBeCloseTo(big.ringWidth / 2);
  });

  it("neutral flowers keep their explicit colour, never a team hue", () => {
    cover("hud-minimap-markers");
    const flower = markerSpecFor(
      champ({ teamId: -1, color: NEUTRAL_BAR_COLOR }),
      null,
    )!;
    expect(flower.color).toBe(NEUTRAL_BAR_COLOR);
    expect(TEAM_CSS).not.toContain(flower.color);
  });
});

/**
 * client-27 (task #67): the minimap is scoped to the LOCAL player's OWN duel
 * zone — one 3v3 disc, not the whole four-zone arena. The bounds narrow to that
 * single zone and only its champions pass the entity filter; with no local zone
 * (spectating / pre-spawn) both degrade to the whole-arena view.
 */
describe("minimap local-zone scoping (hud-minimap-zone)", () => {
  // a four-zone arena: two 3v3 pairs, laid out 2×2 (the map keeps ONE of them)
  const fourZones = [
    { x: -40, z: -40, r: 24 },
    { x: 40, z: -40, r: 24 },
    { x: -40, z: 40, r: 24 },
    { x: 40, z: 40, r: 24 },
  ];

  it("zoneIndexAt: a point picks its containing disc, else the nearest one", () => {
    cover("hud-minimap-zone");
    // dead-centre of each disc → that disc's index
    fourZones.forEach((z, i) => {
      expect(zoneIndexAt({ x: z.x, z: z.z }, fourZones)).toBe(i);
    });
    // outside every disc, in the void → the NEAREST by rim gap (zone 0 here)
    expect(zoneIndexAt({ x: -40, z: -10 }, fourZones)).toBe(0);
    // no zones known → null
    expect(zoneIndexAt({ x: 0, z: 0 }, null)).toBeNull();
    expect(zoneIndexAt({ x: 0, z: 0 }, [])).toBeNull();
  });

  it("bounds scope to the single local zone; null falls back to the whole arena", () => {
    cover("hud-minimap-zone");
    const all = boundsFromZones(fourZones)!;
    for (let k = 0; k < fourZones.length; k++) {
      // the map's bounds for localZone=k are EXACTLY the single zone-k box…
      expect(boundsForZone(fourZones, k)).toEqual(boundsFromZones([fourZones[k]!]));
      // …and strictly smaller than the whole four-zone union on both axes
      const single = boundsForZone(fourZones, k)!;
      expect(single.maxX - single.minX).toBeLessThan(all.maxX - all.minX);
      expect(single.maxZ - single.minZ).toBeLessThan(all.maxZ - all.minZ);
    }
    // no local zone (spectator / pre-spawn) → the whole arena, not nothing
    expect(boundsForZone(fourZones, null)).toEqual(all);
    // an out-of-range index also degrades to the whole arena
    expect(boundsForZone(fourZones, 9)).toEqual(all);
  });

  it("only the local zone's champions pass the filter; null localZone shows all", () => {
    cover("hud-minimap-zone");
    // one champion parked in the centre of each zone
    const champs = fourZones.map((z) => ({ x: z.x, z: z.z }));
    for (let k = 0; k < fourZones.length; k++) {
      champs.forEach((c, i) => {
        // exactly the zone-k champion passes when localZone = k
        expect(inLocalZone(c.x, c.z, fourZones, k)).toBe(i === k);
      });
    }
    // null localZone → every champion passes (whole-arena fallback)
    for (const c of champs) {
      expect(inLocalZone(c.x, c.z, fourZones, null)).toBe(true);
    }
  });
});
