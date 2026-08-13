/**
 * ArenaScene — rotQuarter mapping + the fixed-camera sightline audit (#29):
 * pure reach/shadow math, builder height compliance (NullEngine), and a
 * content regression guard for the arena.godie cherry grove.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { arenaDefFromDoc, SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaDoc } from "@ggd/shared/content";
import type { AssetManager } from "./AssetManager";
import {
  rotQuarterToRadians,
  buildArena,
  dressArena,
  disposeArena,
  fullHideReach,
  minFullHideWidth,
  occludesPlayArea,
  OBSTACLE_MARKER_TOP_Y,
  SIGHTLINE_HEIGHT_CAP,
  SIGHTLINE_EYE_HEIGHT,
  SIGHTLINE_STANDOFF,
} from "./ArenaScene";

describe("rotQuarterToRadians", () => {
  it("maps quarter turns onto radians", () => {
    expect(rotQuarterToRadians(0)).toBe(0);
    expect(rotQuarterToRadians(1)).toBeCloseTo(Math.PI / 2);
    expect(rotQuarterToRadians(2)).toBeCloseTo(Math.PI);
    expect(rotQuarterToRadians(3)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it("normalizes out-of-range values instead of exploding", () => {
    expect(rotQuarterToRadians(4)).toBe(0);
    expect(rotQuarterToRadians(-1)).toBeCloseTo((3 * Math.PI) / 2);
  });
});

describe("sightline math (68° pitch, worst-case dolly 10)", () => {
  it("derives the worst-case eye geometry from the camera angle", () => {
    // pitch raised 55°→68° (#combat-cam-topdown): the eye lifts and looks
    // steeper down — eye = 10·sin68 ≈ 9.27u, standoff = 10·cos68 ≈ 3.75u.
    expect(SIGHTLINE_EYE_HEIGHT).toBeCloseTo(9.27, 2);
    expect(SIGHTLINE_STANDOFF).toBeCloseTo(3.75, 2);
  });

  it("keeps the full-hide band at the cap under a contact band (<0.75u)", () => {
    // (2.4 − 1.7)·3.75/(9.27 − 2.4) ≈ 0.38u — steepening the pitch SHRINKS the
    // band (was ≈0.69u at 55°); a hero only vanishes while physically pressed
    // against the prop's north face.
    const band = fullHideReach(SIGHTLINE_HEIGHT_CAP);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(0.75);
  });

  it("reach is 0 at/below head height and unbounded at/above the eye", () => {
    expect(fullHideReach(1.7)).toBe(0);
    expect(fullHideReach(1.0)).toBe(0);
    expect(fullHideReach(SIGHTLINE_EYE_HEIGHT)).toBe(Infinity);
    expect(fullHideReach(16)).toBe(Infinity); // cherry-tree territory
  });

  it("reach grows monotonically with prop height", () => {
    expect(fullHideReach(3)).toBeGreaterThan(fullHideReach(2.5));
    expect(fullHideReach(6)).toBeGreaterThan(fullHideReach(3));
  });
});

describe("minFullHideWidth", () => {
  it("asks for less than a hero's width even at the cap — the pencil converges", () => {
    const w = minFullHideWidth(0, SIGHTLINE_HEIGHT_CAP);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
  });

  it("asks for NO width once reach + depth spans the standoff", () => {
    // the edge-on rim banner: 3.57u deep, top 5.96u ⇒ ≈4.83u of reach, against
    // a 3.75u standoff. Somewhere along that band the rays converge to a point,
    // so a 0.6u sliver hides a hero just as completely as a wall would.
    expect(minFullHideWidth(3.57, 5.96)).toBe(0);
  });

  it("falls as the prop gets deeper — depth buys occlusion like distance does", () => {
    expect(minFullHideWidth(1.5, 3)).toBeLessThan(minFullHideWidth(0.2, 3));
  });

  it("falls as the prop gets taller — reach puts it further up the sightline", () => {
    expect(minFullHideWidth(0.4, 4)).toBeLessThan(minFullHideWidth(0.4, 3));
  });
});

describe("occludesPlayArea", () => {
  const zones = [{ center: { x: -40, z: 0 }, boundaryRadius: 24 }];

  it("flags a tall pillar at the zone center", () => {
    expect(
      occludesPlayArea({ minX: -41.9, maxX: -38.1, minZ: -1.9, maxZ: 1.9, topY: 10 }, zones),
    ).toBe(true);
  });

  it("passes the same footprint once its top sits at the cap", () => {
    expect(
      occludesPlayArea({ minX: -41.9, maxX: -38.1, minZ: -1.9, maxZ: 1.9, topY: SIGHTLINE_HEIGHT_CAP }, zones),
    ).toBe(false);
  });

  it("flags an edge-on banner — plan width is not the silhouette", () => {
    // arena.skeleton's blue banner where it used to stand, 18.5u from the zone
    // centre: 0.60u wide in X, but 3.57u DEEP and 5.96u tall. A `width < 1u ⇒
    // cannot cover a 1u hero` rule waved it through, and a hero 2.2u clear of
    // it had all 35 silhouette rays blocked.
    expect(
      occludesPlayArea(
        { minX: -57.995, maxX: -57.397, minZ: -1.786, maxZ: 1.786, topY: 5.96 },
        zones,
      ),
    ).toBe(true);
  });

  it("still exempts a sliver that genuinely cannot cover a hero", () => {
    // 3u tall and 0.4u square: only 1.44u of reach, so the ray pencil is still
    // 0.68u wide everywhere it could be screened — a hero always shows past it.
    expect(
      occludesPlayArea({ minX: -40.2, maxX: -39.8, minZ: -0.2, maxZ: 0.2, topY: 3 }, zones),
    ).toBe(false);
  });

  it("passes a tall prop on the NORTH rim — its shadow points away", () => {
    expect(
      occludesPlayArea({ minX: -42, maxX: -38, minZ: 25.2, maxZ: 25.8, topY: 6.7 }, zones),
    ).toBe(false);
  });

  it("flags the same prop on the SOUTH rim — shadow reaches into play", () => {
    expect(
      occludesPlayArea({ minX: -42, maxX: -38, minZ: -25.8, maxZ: -25.2, topY: 6.7 }, zones),
    ).toBe(true);
  });

  it("flags an above-the-eye prop (unbounded shadow) even far south", () => {
    expect(
      occludesPlayArea({ minX: -41, maxX: -39, minZ: -60, maxZ: -58, topY: 20 }, zones),
    ).toBe(true);
  });
});

/** Every arena the COMBAT scene can actually boot: the five shipped docs plus
 *  the built-in SKELETON_ARENA, which GameApp uses for the pre-match/boot arena
 *  with NO doc at all — so dressArena never runs on it and buildArena's output
 *  is final. That case is exactly the one #218 could never have covered by
 *  fiddling with decor. */
const COMBAT_ARENA_CASES: [string, ArenaDef][] = (() => {
  const arenaDir = fileURLToPath(new URL("../../../../content/arenas/", import.meta.url));
  const docs = readdirSync(arenaDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map(
      (f) =>
        [f, arenaDefFromDoc(JSON.parse(readFileSync(arenaDir + f, "utf8")))] as [string, ArenaDef],
    );
  return [["SKELETON_ARENA (built-in, doc-less boot arena)", SKELETON_ARENA], ...docs];
})();

function countObstacles(def: ArenaDef): { circles: number; segments: number; boxes: number } {
  let circles = 0;
  let segments = 0;
  let boxes = 0;
  for (const zone of def.zones) {
    for (const ob of zone.obstacles) {
      if (ob.kind === "circle") circles++;
      // GH#324 —— graybox 的牆是**有厚度的盒**，一個盒畫一片矮牆板（1 個 mesh）。
      else if (ob.kind === "box") boxes++;
      else segments++;
    }
  }
  return { circles, segments, boxes };
}

describe("buildArena obstacle markers never occlude the combat camera (NullEngine, #218)", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterAll(() => {
    scene.dispose();
    engine.dispose();
  });

  it("finds every shipped arena plus the built-in one", () => {
    expect(COMBAT_ARENA_CASES.length).toBeGreaterThanOrEqual(6);
  });

  it("states the bar this suite enforces — stricter than occludesPlayArea", () => {
    // The OLD geometry (a 2.4u grey drum per obstacle) sat exactly ON the decor
    // cap, so `occludesPlayArea` early-returns false for it and the previous
    // `top <= SIGHTLINE_HEIGHT_CAP` assertion PASSED on the bug. The bar below
    // is `fullHideReach === 0` — no part of any hero is ever hidden, at any
    // zoom — which the 2.4u drum fails and the 0.42u marker meets.
    expect(fullHideReach(SIGHTLINE_HEIGHT_CAP)).toBeGreaterThan(0);
    expect(fullHideReach(OBSTACLE_MARKER_TOP_Y)).toBe(0);
    expect(OBSTACLE_MARKER_TOP_Y).toBeLessThan(SIGHTLINE_HEIGHT_CAP);
  });

  it.each(COMBAT_ARENA_CASES)("%s — no obstacle mesh can hide a hero", (label, def) => {
    const { circles, segments, boxes } = countObstacles(def);
    expect(circles + segments + boxes, label).toBeGreaterThan(0);

    const handles = buildArena(scene, def);

    // stump + floor ring per circle, one low slab per segment — ALL of them
    // tracked. The segment slabs used to be built and then dropped on the
    // floor (never pushed into obstacleMeshes), so nothing could find them.
    expect(handles.obstacleMeshes, label).toHaveLength(circles * 2 + segments + boxes);

    const obstacles = handles.root
      .getChildMeshes(false)
      .filter((m) => /-ob-\d+(-|$)/.test(m.name));
    expect(obstacles, label).toHaveLength(circles * 2 + segments + boxes);

    for (const m of obstacles) {
      const top = m.getBoundingInfo().boundingBox.maximumWorld.y;
      expect(top, `${label} ${m.name} top`).toBeLessThanOrEqual(OBSTACLE_MARKER_TOP_Y + 1e-4);
      // the real guarantee: a 1.7u champion is never hidden anywhere, any zoom
      expect(fullHideReach(top), `${label} ${m.name} hide-reach`).toBe(0);
      // ...and it is still SEEN — collision must not become an invisible wall
      expect(m.isVisible, `${label} ${m.name} visible`).toBe(true);
      expect(top, `${label} ${m.name} not flattened away`).toBeGreaterThan(0);
    }

    // the older, weaker #29 guarantee still holds for every other procedural
    // mesh (grounds, kerbs, spawn pads)
    for (const m of handles.root.getChildMeshes(false)) {
      expect(
        m.getBoundingInfo().boundingBox.maximumWorld.y,
        `${label} ${m.name}`,
      ).toBeLessThanOrEqual(SIGHTLINE_HEIGHT_CAP + 1e-4);
    }

    disposeArena(scene, handles);
  });
});

/** Build a one-box stand-in AssetContainer (a prop of the given size sitting on
 *  the ground plane) so dressArena can be exercised without loading any .glb. */
function stubContainer(scene: Scene, name: string, height: number, width: number): AssetContainer {
  const container = new AssetContainer(scene);
  const box = MeshBuilder.CreateBox(name, { width, height, depth: width }, scene);
  box.position.y = height / 2; // base on y=0, like an authored prop
  box.material = new StandardMaterial(`${name}-mat`, scene);
  scene.removeMesh(box); // live in the container, not the scene
  container.meshes.push(box);
  container.rootNodes.push(box);
  return container;
}

function stubAssets(models: Record<string, AssetContainer>): AssetManager {
  return {
    load: async (path: string) => models[path] ?? null,
  } as unknown as AssetManager;
}

const TEST_ZONE: ArenaDef["zones"][number] = {
  id: "z0",
  center: { x: 0, z: 0 },
  boundaryRadius: 24,
  obstacles: [],
  spawns: [[{ x: -3, z: 0 }], [{ x: 3, z: 0 }]],
};

/** Same zone, but carrying sim obstacles — used to prove the markers' fate no
 *  longer depends on what decor the doc happens to ship (#218). */
const OBSTACLE_ZONE: ArenaDef["zones"][number] = {
  ...TEST_ZONE,
  obstacles: [
    { kind: "circle", center: { x: 0, z: 0 }, radius: 2.5 },
    { kind: "segment", a: { x: -6, z: -2 }, b: { x: 6, z: -2 } },
  ],
};

const TEST_ARENA: ArenaDef = { id: "arena.test", name: "test", zones: [TEST_ZONE] };

function testDoc(decor: ArenaDoc["decor"]): ArenaDoc {
  return {
    schema: "arena@1",
    id: "arena.test",
    name: "test",
    groundStyle: "grass", // skips the instanced floor-tile pass
    zones: [TEST_ZONE] as unknown as ArenaDoc["zones"],
    decor,
  };
}

describe("dressArena sightline enforcement (NullEngine)", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterAll(() => {
    scene.dispose();
    engine.dispose();
  });

  it("squashes a play-area occluder to the cap and leaves its footprint alone", async () => {
    // 4.0u pillar at scale 2.5 = a 10u tower dead-center in the zone
    const model = "assets/models/props/pillar.glb";
    const handles = buildArena(scene, TEST_ARENA);
    await dressArena(
      scene,
      stubAssets({ [model]: stubContainer(scene, "pillar", 4, 1.5) }),
      TEST_ARENA,
      testDoc([{ model, x: 0, z: 0, rotQuarter: 0, scale: 2.5 }]),
      handles,
    );
    const props = handles.root
      .getChildTransformNodes(true)
      .filter((n) => n.name.startsWith("decor-root"));
    expect(props).toHaveLength(1);
    props[0]!.computeWorldMatrix(true);
    const { min, max } = props[0]!.getHierarchyBoundingVectors(true);
    expect(max.y).toBeCloseTo(SIGHTLINE_HEIGHT_CAP, 4); // lowered, not deleted
    expect(max.y).toBeGreaterThan(0); // still a visible stump
    // footprint (what the sim obstacle underneath collides with) is untouched
    expect(max.x - min.x).toBeCloseTo(1.5 * 2.5, 4);
    expect(max.z - min.z).toBeCloseTo(1.5 * 2.5, 4);
    expect(handles.fader.size).toBe(0);
    disposeArena(scene, handles);
  });

  it("leaves a short prop exactly as authored", async () => {
    const model = "assets/models/props/crates_stacked.glb";
    const handles = buildArena(scene, TEST_ARENA);
    await dressArena(
      scene,
      stubAssets({ [model]: stubContainer(scene, "crates", 2.142, 2.1) }),
      TEST_ARENA,
      testDoc([{ model, x: 4, z: -9, rotQuarter: 1, scale: 1.1 }]),
      handles,
    );
    const prop = handles.root
      .getChildTransformNodes(true)
      .find((n) => n.name.startsWith("decor-root"))!;
    prop.computeWorldMatrix(true);
    expect(prop.getHierarchyBoundingVectors(true).max.y).toBeCloseTo(2.142 * 1.1, 4);
    disposeArena(scene, handles);
  });

  it("keeps a FADE landmark at full height and registers it for auto-fade", async () => {
    const model = "assets/models/hex/tower_red.glb";
    const handles = buildArena(scene, TEST_ARENA);
    await dressArena(
      scene,
      stubAssets({ [model]: stubContainer(scene, "tower", 3.98, 2) }),
      TEST_ARENA,
      testDoc([{ model, x: 0, z: 0, rotQuarter: 0, scale: 1.4 }]),
      handles,
    );
    const prop = handles.root
      .getChildTransformNodes(true)
      .find((n) => n.name.startsWith("decor-root"))!;
    prop.computeWorldMatrix(true);
    const top = prop.getHierarchyBoundingVectors(true).max.y;
    expect(top).toBeCloseTo(3.98 * 1.4, 4); // NOT squashed — identity preserved
    expect(top).toBeGreaterThan(SIGHTLINE_HEIGHT_CAP);
    expect(handles.fader.size).toBe(1); // ...because it auto-fades instead
    disposeArena(scene, handles);
    expect(handles.fader.size).toBe(0);
  });

  // ---- #218: the markers' fate no longer depends on decor content ----
  const OBSTACLE_ARENA: ArenaDef = { id: "arena.test", name: "test", zones: [OBSTACLE_ZONE] };

  it.each([
    ["a doc WITH pillar decor", "assets/models/props/pillar.glb"],
    ["a doc with NO pillar decor", "assets/models/props/crates_stacked.glb"],
  ])("keeps the low collision markers through dressArena — %s", async (_label, model) => {
    const handles = buildArena(scene, OBSTACLE_ARENA);
    expect(handles.obstacleMeshes).toHaveLength(3); // stump + ring + wall slab
    await dressArena(
      scene,
      stubAssets({ [model]: stubContainer(scene, "prop", 4, 1.5) }),
      OBSTACLE_ARENA,
      {
        ...testDoc([{ model, x: 0, z: 0, rotQuarter: 0, scale: 2.5 }]),
        zones: [OBSTACLE_ZONE] as unknown as ArenaDoc["zones"],
      },
      handles,
    );
    // Before #218 the pillar row DISPOSED these and the non-pillar row left
    // them standing 2.4u tall. Now both rows land in the same place: still
    // there (collision stays visible) and still low (camera stays clear).
    expect(handles.obstacleMeshes).toHaveLength(3);
    for (const m of handles.obstacleMeshes) {
      expect(m.isDisposed()).toBe(false);
      const top = m.getBoundingInfo().boundingBox.maximumWorld.y;
      expect(top, m.name).toBeLessThanOrEqual(OBSTACLE_MARKER_TOP_Y + 1e-4);
      expect(fullHideReach(top), m.name).toBe(0);
    }
    disposeArena(scene, handles);
  });
});

describe("authored arena content", () => {
  const arenaDir = fileURLToPath(new URL("../../../../content/arenas/", import.meta.url));
  const files = readdirSync(arenaDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  type Doc = {
    zones: { center: { x: number; z: number }; boundaryRadius: number }[];
    decor: { model: string; x: number; z: number; rotQuarter: number; scale: number }[];
  };
  const docs = files.map((f) => [f, JSON.parse(readFileSync(arenaDir + f, "utf8")) as Doc] as const);

  // unscaled model extents, measured from the .glb accessor bounds
  const CHERRY_BASE_HEIGHT = 19.6; // japanesecherry.glb (WC3 import)
  const CRATE_BASE_HEIGHT = 2.142; // crates_stacked.glb
  // banner_shield_*.glb. It is NOT centred on its own origin — the panel hangs
  // 0.315..0.689 in FRONT of it, which is over 1u away once scaled and yawed.
  // That offset decides whether a rim banner clears the boundary circle, so it
  // is modelled here rather than approximated with a symmetric box.
  const BANNER_TOP = 3.727; // minY 0.531 + 3.196 tall
  const BANNER_HALF_X = 2.232 / 2;
  const BANNER_Z0 = 0.315;
  const BANNER_Z1 = 0.689;

  /** Placed world AABB of a banner: model box × scale, yawed by rotQuarter the
   *  way Babylon applies `rotation.y` in placeInstance (left-handed). */
  function bannerBox(d: { x: number; z: number; rotQuarter: number; scale: number }) {
    const yaw = rotQuarterToRadians(d.rotQuarter);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const x of [-BANNER_HALF_X * d.scale, BANNER_HALF_X * d.scale]) {
      for (const z of [BANNER_Z0 * d.scale, BANNER_Z1 * d.scale]) {
        const rx = x * cos + z * sin;
        const rz = -x * sin + z * cos;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minZ = Math.min(minZ, rz);
        maxZ = Math.max(maxZ, rz);
      }
    }
    return {
      minX: d.x + minX,
      maxX: d.x + maxX,
      minZ: d.z + minZ,
      maxZ: d.z + maxZ,
      topY: BANNER_TOP * d.scale,
    };
  }

  it("finds the arenas", () => {
    expect(docs.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps every arena.godie cherry tree at/below the sightline cap", () => {
    // Trees are the one family the runtime squash CANNOT rescue: capping a
    // 19.6u tree keeps its ~18u canopy, which would hang over the field as a
    // pancake. They must be authored small instead.
    const godie = docs.find(([f]) => f === "arena.godie.json")![1];
    expect(godie.decor.length).toBeGreaterThan(0);
    for (const d of godie.decor) {
      expect(d.model).toContain("japanesecherry");
      expect(d.scale * CHERRY_BASE_HEIGHT).toBeLessThanOrEqual(SIGHTLINE_HEIGHT_CAP + 1e-6);
    }
  });

  it("keeps crate stacks under the cap so they never need squashing", () => {
    let seen = 0;
    for (const [file, doc] of docs) {
      for (const d of doc.decor) {
        if (!d.model.includes("crates_stacked")) continue;
        seen++;
        expect(d.scale * CRATE_BASE_HEIGHT, file).toBeLessThanOrEqual(SIGHTLINE_HEIGHT_CAP + 1e-6);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("keeps full-height banners out of the play area — edge-on ones too", () => {
    // Banners carry NO sim obstacle, so heroes can stand right behind them, and
    // they are the one family kept at full height rather than lowered. That
    // only holds while they stand OUTSIDE the boundary circle: turning one
    // edge-on does not make it safe (see minFullHideWidth — its 3.6u of depth
    // screens a long strip of ground down the 68° sightline), which is exactly
    // what a `width < 1u` exemption used to get wrong at the lane ends.
    let seen = 0;
    for (const [file, doc] of docs) {
      for (const d of doc.decor) {
        if (!d.model.includes("banner_shield")) continue;
        seen++;
        expect(
          occludesPlayArea(bannerBox(d), doc.zones),
          `${file} banner at (${d.x}, ${d.z})`,
        ).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
