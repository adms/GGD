/**
 * ArenaGround — the floor rebuild of task #80.
 *
 * The pure geometry (profile, UV wrapping, edge AO, tessellation) is tested
 * directly; the built meshes are checked under a NullEngine for the three
 * things that would silently ruin the floor if they drifted:
 *   - the boundary is ROUND, to a stated tolerance — the stair-stepped rim is
 *     the whole complaint;
 *   - the floor's UVs put the non-repeating macro map on the disc exactly once
 *     and centred, which is what phase 1's anti-repetition scheme depends on;
 *   - nothing the ground adds can hide a hero (the #29 guarantee).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  FLOOR_TOP_Y,
  KERB_TOP_Y,
  RIM_OUTER_OFFSET,
  RIM_PROFILE,
  buildContactShadows,
  buildZoneGround,
  floorEdgeShade,
  floorRingRadii,
  kerbCrestOffset,
  rimArcRepeats,
  ringSegments,
} from "./ArenaGround";
import { fullHideReach, occludesPlayArea, standsOnFloor, SIGHTLINE_HEIGHT_CAP } from "./ArenaScene";
import { TILE_WORLD_SIZE } from "./groundMaterials";

/** Every shipped zone. */
const R = 24;

describe("rim profile", () => {
  it("marches strictly outward so the sweep never folds back on itself", () => {
    for (let i = 1; i < RIM_PROFILE.length; i++) {
      expect(RIM_PROFILE[i]!.dr, `ring ${i}`).toBeGreaterThan(RIM_PROFILE[i - 1]!.dr);
    }
  });

  it("starts flush with the floor at the boundary and ends at RIM_OUTER_OFFSET", () => {
    // the kerb's inner face must sit exactly ON boundaryRadius: that is where a
    // hero's BODY stops (the sim clamps its centre to boundaryRadius − radius),
    // so any gap would let heroes stand in mid-air off the floor
    expect(RIM_PROFILE[0]!.dr).toBe(0);
    expect(RIM_PROFILE[0]!.y).toBe(FLOOR_TOP_Y);
    expect(RIM_PROFILE.at(-1)!.dr).toBe(RIM_OUTER_OFFSET);
  });

  it("peaks at the kerb crest and then falls away into the void", () => {
    const peak = Math.max(...RIM_PROFILE.map((r) => r.y));
    expect(peak).toBe(KERB_TOP_Y);
    // the apron ends well below the floor — that fall-off is what makes each
    // zone read as a raised platform rather than a disc pasted on nothing
    expect(RIM_PROFILE.at(-1)!.y).toBeLessThan(FLOOR_TOP_Y - 2);
  });

  it("darkens monotonically outward past the crest", () => {
    const crest = RIM_PROFILE.findIndex((r) => r.y === KERB_TOP_Y);
    for (let i = crest + 1; i < RIM_PROFILE.length; i++) {
      expect(RIM_PROFILE[i]!.shade, `ring ${i}`).toBeLessThan(RIM_PROFILE[i - 1]!.shade);
    }
    expect(RIM_PROFILE.at(-1)!.shade).toBeLessThan(0.05);
  });
});

describe("kerbCrestOffset", () => {
  it("closes seamlessly around the ring", () => {
    // built from INTEGER angular harmonics precisely so theta and theta+2π
    // agree — otherwise the sweep would show one hard step where it wraps
    for (const theta of [0, 0.3, 1.1, 2.7, 4.9]) {
      expect(kerbCrestOffset(theta + Math.PI * 2, 3)).toBeCloseTo(kerbCrestOffset(theta, 3), 10);
    }
  });

  it("is deterministic and differs between zones", () => {
    expect(kerbCrestOffset(1.234, 1)).toBe(kerbCrestOffset(1.234, 1));
    expect(kerbCrestOffset(1.234, 1)).not.toBeCloseTo(kerbCrestOffset(1.234, 2), 6);
  });

  it("stays a weathering wobble, not a wall", () => {
    let peak = 0;
    for (let i = 0; i < 4000; i++) {
      peak = Math.max(peak, Math.abs(kerbCrestOffset((i / 4000) * Math.PI * 2, 1)));
    }
    expect(peak).toBeLessThan(0.11);
    expect(peak).toBeGreaterThan(0.02); // ...but visible, or it is pointless
  });
});

describe("floorEdgeShade", () => {
  it("is full brightness in the open field and darkest at the wall", () => {
    expect(floorEdgeShade(0, R)).toBeCloseTo(1, 6);
    expect(floorEdgeShade(R - 5, R)).toBeCloseTo(1, 6);
    expect(floorEdgeShade(R, R)).toBeLessThan(0.6);
  });

  it("never brightens as it approaches the wall", () => {
    let prev = Infinity;
    for (let r = R - 3; r <= R; r += 0.05) {
      const s = floorEdgeShade(r, R);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });
});

describe("tessellation", () => {
  it("keeps the boundary round to well under a pixel", () => {
    // the stair-stepped rim was the complaint; quantify the replacement. The
    // sagitta r·(1−cos(π/n)) is how far the polygon edge sits inside the true
    // circle — at the closest zoom the camera resolves ~1/64 u per pixel.
    const n = ringSegments(R);
    const sagitta = R * (1 - Math.cos(Math.PI / n));
    expect(sagitta).toBeLessThan(1 / 64);
  });

  it("stays bounded for absurd radii instead of exploding the vertex count", () => {
    expect(ringSegments(1)).toBeGreaterThanOrEqual(48);
    expect(ringSegments(5000)).toBeLessThanOrEqual(192);
  });

  it("refines the floor rings toward the wall for a smooth AO ramp", () => {
    const radii = floorRingRadii(R);
    expect(radii[0]).toBe(0);
    expect(radii.at(-1)).toBeCloseTo(R, 9); // reaches the boundary exactly
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]!, `ring ${i}`).toBeGreaterThan(radii[i - 1]!);
    }
    const outerStep = radii.at(-1)! - radii.at(-2)!;
    const innerStep = radii[1]! - radii[0]!;
    expect(outerStep).toBeLessThan(innerStep);
  });
});

describe("rimArcRepeats", () => {
  it("is a whole number of repeats so the texture meets itself", () => {
    // arc length does not divide evenly by the tile size; rounding is what
    // stops a texture seam running across the kerb where the sweep closes
    const n = rimArcRepeats(R);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBe(38); // 2π·24 / 4 = 37.7
  });

  it("costs under 2% of texture stretch to buy that", () => {
    const exact = (2 * Math.PI * R) / TILE_WORLD_SIZE;
    expect(Math.abs(rimArcRepeats(R) / exact - 1)).toBeLessThan(0.02);
  });

  it("never degenerates to zero repeats on a tiny zone", () => {
    expect(rimArcRepeats(0.1)).toBeGreaterThanOrEqual(1);
  });
});

describe("the ground cannot hide a hero (task #29 guarantee)", () => {
  it("keeps the whole kerb below head height, so its full-hide reach is ZERO", () => {
    // This is stronger than "under the 2.4u cap". A 2.4u prop is PERMITTED
    // because its full-hide band is only ~0.68u — but a continuous ring at that
    // height would put that dead band around the entire southern arc. Nothing
    // shorter than a hero's head can hide one from a camera looking down.
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      peak = Math.max(peak, Math.abs(kerbCrestOffset((i / 2000) * Math.PI * 2, 1)));
    }
    const kerbTop = KERB_TOP_Y + peak;
    expect(kerbTop).toBeLessThan(SIGHTLINE_HEIGHT_CAP);
    expect(fullHideReach(kerbTop)).toBe(0);
  });

  it("passes occludesPlayArea as a solid band across a zone", () => {
    const zones = [{ center: { x: -40, z: 0 }, boundaryRadius: R }];
    expect(
      occludesPlayArea(
        { minX: -66, maxX: -14, minZ: -26, maxZ: -R, topY: KERB_TOP_Y + 0.11 },
        zones,
      ),
    ).toBe(false);
  });
});

describe("standsOnFloor", () => {
  const zones = [{ center: { x: -40, z: 0 }, boundaryRadius: R }];

  it("accepts a prop well inside the disc", () => {
    expect(standsOnFloor(-40, 0, 1, zones)).toBe(true);
  });

  it("rejects a rim prop whose blob would spill onto the kerb", () => {
    expect(standsOnFloor(-40, R - 0.2, 1, zones)).toBe(false);
  });

  it("rejects a prop outside every zone", () => {
    expect(standsOnFloor(0, 0, 1, zones)).toBe(false);
  });
});

describe("built meshes (NullEngine)", () => {
  let engine: NullEngine;
  let scene: Scene;
  let parent: TransformNode;

  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    parent = new TransformNode("ground-test-root", scene);
  });

  afterAll(() => {
    scene.dispose();
    engine.dispose();
  });

  const zone = { center: { x: -40, z: 0 }, boundaryRadius: R };

  it("maps the macro layer onto the disc exactly once, centred", () => {
    // The macro map is the half of phase 1 that stops the eye finding the tile
    // repeat, and it only works if UV (0.5, 0.5) is the zone centre and the
    // boundary lands on the unit square's inscribed circle — that is what makes
    // the map's `rad` field mean the real centre and the real rim.
    const { floor } = buildZoneGround(scene, parent, zone, 0, undefined);
    const pos = floor.getVerticesData(VertexBuffer.PositionKind)!;
    const uv = floor.getVerticesData(VertexBuffer.UVKind)!;
    expect(uv[0]).toBeCloseTo(0.5, 9); // centre vertex
    expect(uv[1]).toBeCloseTo(0.5, 9);
    let maxRadErr = 0;
    for (let i = 0; i < uv.length / 2; i++) {
      const x = pos[i * 3]!;
      const z = pos[i * 3 + 2]!;
      // UV must be the position mapped onto the bounding square
      expect(uv[i * 2]!).toBeCloseTo(0.5 + x / (2 * R), 6);
      expect(uv[i * 2 + 1]!).toBeCloseTo(0.5 + z / (2 * R), 6);
      const rad = Math.hypot(uv[i * 2]! - 0.5, uv[i * 2 + 1]! - 0.5) * 2;
      maxRadErr = Math.max(maxRadErr, Math.abs(rad - Math.hypot(x, z) / R));
    }
    expect(maxRadErr).toBeLessThan(1e-6);
    floor.dispose();
  });

  it("draws a genuinely round boundary — not squares clipped to a circle", () => {
    const { floor } = buildZoneGround(scene, parent, zone, 0, undefined);
    const pos = floor.getVerticesData(VertexBuffer.PositionKind)!;
    let maxR = 0;
    let minOuter = Infinity;
    for (let i = 0; i < pos.length / 3; i++) {
      const rad = Math.hypot(pos[i * 3]!, pos[i * 3 + 2]!);
      maxR = Math.max(maxR, rad);
      if (rad > R - 0.01) minOuter = Math.min(minOuter, rad);
    }
    // every outermost vertex sits on the boundary circle, to floating point
    expect(maxR).toBeCloseTo(R, 6);
    expect(minOuter).toBeCloseTo(R, 6);
    floor.dispose();
  });

  it("keeps the walkable surface dead flat — units render at y = 0", () => {
    const { floor } = buildZoneGround(scene, parent, zone, 0, undefined);
    const pos = floor.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < pos.length / 3; i++) expect(pos[i * 3 + 1]!).toBe(FLOOR_TOP_Y);
    floor.dispose();
  });

  it("builds the rim no higher than the crest anywhere on the ring", () => {
    const { rim } = buildZoneGround(scene, parent, zone, 1, undefined);
    const pos = rim.getVerticesData(VertexBuffer.PositionKind)!;
    let top = -Infinity;
    for (let i = 0; i < pos.length / 3; i++) top = Math.max(top, pos[i * 3 + 1]!);
    expect(top).toBeLessThan(KERB_TOP_Y + 0.11);
    expect(fullHideReach(top)).toBe(0);
    rim.dispose();
  });

  it("closes the rim sweep with no gap and no texture seam", () => {
    const { rim } = buildZoneGround(scene, parent, zone, 0, undefined);
    const pos = rim.getVerticesData(VertexBuffer.PositionKind)!;
    const uv = rim.getVerticesData(VertexBuffer.UVKind)!;
    const n = RIM_PROFILE.length;
    const segs = ringSegments(R);
    for (let i = 0; i < n; i++) {
      const first = i;
      const last = segs * n + i;
      // the closing column duplicates the first POSITION exactly...
      for (let k = 0; k < 3; k++) {
        expect(pos[last * 3 + k]!).toBeCloseTo(pos[first * 3 + k]!, 6);
      }
      // ...but carries u = whole repeats, so the texture meets itself
      expect(uv[first * 2]!).toBeCloseTo(0, 9);
      expect(uv[last * 2]! * ((2 * R) / TILE_WORLD_SIZE)).toBeCloseTo(rimArcRepeats(R), 6);
    }
    rim.dispose();
  });

  it("fetches no texture set until a groundStyle is known", () => {
    // the pre-match placeholder arena must not download a set the real map is
    // about to replace
    const before = scene.textures.length;
    const bare = buildZoneGround(scene, parent, zone, 0, undefined);
    expect(scene.textures.length).toBe(before);
    bare.floor.dispose(false, true);
    bare.rim.dispose(false, true);

    const dressed = buildZoneGround(scene, parent, zone, 0, "grass");
    expect(scene.textures.length).toBeGreaterThan(before);
    dressed.floor.dispose(false, true);
    dressed.rim.dispose(false, true);
  });

  it("puts every contact shadow in ONE mesh via thin instances", () => {
    const props = Array.from({ length: 40 }, (_, i) => ({ x: i, z: -i, radius: 0.8 }));
    const mesh = buildContactShadows(scene, parent, props)!;
    expect(mesh).not.toBeNull();
    expect(mesh.thinInstanceCount).toBe(40);
    expect(mesh.hasVertexAlpha).toBe(true);
    mesh.dispose(false, true);
  });

  it("builds nothing when there is nothing to shade", () => {
    expect(buildContactShadows(scene, parent, [])).toBeNull();
  });
});
