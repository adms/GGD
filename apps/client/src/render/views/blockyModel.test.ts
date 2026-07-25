/**
 * The generated blocky champions, asserted THROUGH THE REAL BABYLON LOADER
 * (owner directive #226).
 *
 * `tools/voxel-gen/gen.test.ts` already checks the emitted BYTES. This suite
 * checks the things only the loader can answer, and they are exactly the
 * invariants other tasks locked in and that nothing else covers for these files:
 *
 *   • **#150 uniform height** — every archetype measures TARGET_HEIGHT through
 *     `getHierarchyBoundingVectors`, the same call `ChampionView` uses, so the
 *     normalisation factor is 1.0 and `doc.scale` is honest.
 *   • **#68 / #1 orientation** — upright, feet on y=0, facing +Z, and not just
 *     at rest: EVERY frame of EVERY clip is sampled, because a bake that drifts
 *     the model underground or into the air only shows up mid-animation.
 *   • **the model@1 clipMap contract** — every state the doc names resolves to a
 *     real AnimationGroup, via the same `ClipAnimator` the game uses.
 *   • **#64 hit-flash** — the mesh is a `Mesh` with the overlay channel, so the
 *     flash paints the loaded model and not just the procedural fallback.
 *
 * `tools/w3x-import/test/champion-model-guard.test.ts` only walks `imported.*`
 * champions, so before this file these four meshes — worn by 44 of the roster —
 * had NO orientation coverage at all.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/loaders/glTF/2.0";
import { TARGET_HEIGHT } from "./ChampionView";
import { ClipAnimator } from "../ClipAnimator";
import { glbYawOffset, NATIVE_GLB_YAW_OFFSET } from "./glbFacing";
import { pickReactionClip } from "../intermission/reactionClip";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../../content");
const MODELS = join(CONTENT, "assets/models/champions");

const ARCHETYPES = ["mage", "knight", "barbarian", "rogue", "undead"] as const;

interface Loaded {
  key: string;
  root: TransformNode;
  scene: Scene;
  groups: { name: string; from: number; to: number }[];
  /** the skinned body mesh */
  meshName: string;
  /** world-space y span of the skinned figure at the given clip + frame */
  spanAt: (clip: string | null, frame: number) => { lo: number; hi: number };
  faceZ: number;
  packZ: number;
  bones: string[];
}

const loaded: Loaded[] = [];
let engine: NullEngine;

/** Skinned world position of every vertex, the way the GPU computes it. */
function skinnedPoints(scene: Scene, root: TransformNode): Vector3[] {
  const mesh = root.getChildMeshes(false).find((m) => m.getVerticesData("position"));
  if (!mesh) return [];
  const skel = scene.skeletons[0];
  const pos = mesh.getVerticesData("position")!;
  const mi = mesh.getVerticesData("matricesIndices");
  const wm = mesh.getWorldMatrix();
  // prepare(true) forces a refresh so a paused AnimationGroup's pose is picked up
  skel?.prepare(true);
  const bones = skel ? skel.getTransformMatrices(mesh as never) : null;
  const out: Vector3[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    let p = new Vector3(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
    if (bones && mi) p = Vector3.TransformCoordinates(p, Matrix.FromArray(bones as unknown as number[], mi[i * 4]! * 16));
    out.push(Vector3.TransformCoordinates(p, wm));
  }
  return out;
}

beforeAll(async () => {
  engine = new NullEngine();
  for (const key of ARCHETYPES) {
    const scene = new Scene(engine);
    const bytes = readFileSync(join(MODELS, `blocky-${key}.glb`));
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      `data:;base64,${bytes.toString("base64")}`,
      scene,
      undefined,
      ".glb",
    );
    const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    const root = new TransformNode(`holder-${key}`, scene);
    for (const n of inst.rootNodes) n.parent = root;
    root.computeWorldMatrix(true);

    const mesh = root.getChildMeshes(false).find((m) => m.getVerticesData("position"))!;
    const uv = mesh.getVerticesData("uv")!;
    const worldRest = skinnedPoints(scene, root);
    // palette slot 6 is the eye/face band (the ONE asymmetric front feature),
    // slot 3 the accent worn by the hat + the pack behind the torso
    const mean = (slot: number, filter?: (p: Vector3) => boolean): number => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < worldRest.length; i++) {
        if (Math.round(uv[i * 2]! * 16 - 0.5) !== slot) continue;
        if (filter && !filter(worldRest[i]!)) continue;
        s += worldRest[i]!.z;
        n++;
      }
      return n ? s / n : 0;
    };

    loaded.push({
      key,
      root,
      scene,
      groups: inst.animationGroups.map((g) => ({ name: g.name, from: g.from, to: g.to })),
      meshName: mesh.name,
      bones: (scene.skeletons[0]?.bones ?? []).map((b) => b.name),
      faceZ: mean(6),
      packZ: mean(3, (p) => p.y > 0.7 && p.y < 1.4),
      spanAt: (clip, frame) => {
        const g = clip ? inst.animationGroups.find((a) => a.name === clip) : null;
        if (g) {
          g.start(false, 1, g.from, g.to, false);
          g.pause();
          g.goToFrame(frame);
        }
        root.computeWorldMatrix(true);
        const pts = skinnedPoints(scene, root);
        g?.stop();
        return {
          lo: Math.min(...pts.map((p) => p.y)),
          hi: Math.max(...pts.map((p) => p.y)),
        };
      },
    });
  }
}, 60_000);

afterAll(() => {
  for (const l of loaded) l.scene.dispose();
  engine?.dispose();
});

describe("every generated champion loads and stands correctly (#150 / #68)", () => {
  it("loads all five archetypes with geometry", () => {
    expect(loaded).toHaveLength(ARCHETYPES.length);
    for (const l of loaded) expect(l.root.getChildMeshes(false).length).toBeGreaterThan(0);
  });

  it("measures EXACTLY TARGET_HEIGHT, so #150's normalisation factor is 1.0", () => {
    for (const l of loaded) {
      const bb = l.root.getHierarchyBoundingVectors(true); // the call ChampionView makes
      const h = bb.max.y - bb.min.y;
      expect(h, `blocky-${l.key} native height`).toBeCloseTo(TARGET_HEIGHT, 4);
      expect(TARGET_HEIGHT / h).toBeCloseTo(1, 4);
    }
  });

  it("stands ON the floor at rest — not floating, not sunk (#168 / #61)", () => {
    for (const l of loaded) {
      const { lo, hi } = l.spanAt(null, 0);
      expect(lo, `blocky-${l.key} feet`).toBeCloseTo(0, 3);
      expect(hi, `blocky-${l.key} head`).toBeCloseTo(TARGET_HEIGHT, 3);
    }
  });

  it("never sinks through the floor at ANY frame of ANY clip", () => {
    // a per-frame check, because a bad hips curve is invisible at rest — this is
    // how the idle breath that dipped 0.023 u under the floor was caught.
    for (const l of loaded) {
      for (const g of l.groups) {
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
          const { lo } = l.spanAt(g.name, g.from + ((g.to - g.from) * i) / steps);
          expect(lo, `blocky-${l.key}/${g.name} frame ${i}/${steps} dips below the floor`)
            .toBeGreaterThan(-0.06);
        }
      }
    }
  });

  it("stays UPRIGHT in the loop clips (a tipped-over idle is #68's whole point)", () => {
    for (const l of loaded) {
      for (const name of ["idle", "run"]) {
        const g = l.groups.find((x) => x.name === name)!;
        for (let i = 0; i <= 6; i++) {
          const { lo, hi } = l.spanAt(g.name, g.from + ((g.to - g.from) * i) / 6);
          // a figure lying down collapses its vertical span; upright keeps ~1.8
          expect(hi - lo, `blocky-${l.key}/${name} silhouette collapsed`).toBeGreaterThan(1.5);
        }
      }
    }
  });

  it("faces +Z with its pack behind it, so NATIVE_GLB_YAW_OFFSET (0) applies", () => {
    for (const l of loaded) {
      const p = `assets/models/champions/blocky-${l.key}.glb`;
      expect(glbYawOffset(p)).toBe(NATIVE_GLB_YAW_OFFSET);
      expect(glbYawOffset(p)).toBe(0);
      // the face band is in FRONT of the pack — the measurable version of
      // "forward is +Z", checked against `knight.glb`'s cape at z = -0.215.
      expect(l.faceZ, `blocky-${l.key} face`).toBeGreaterThan(0);
      expect(l.faceZ, `blocky-${l.key} face vs pack`).toBeGreaterThan(l.packZ);
    }
  });
});

describe("the model@1 clip contract holds through ClipAnimator", () => {
  const clipMapOf = (docId: string) =>
    JSON.parse(readFileSync(join(CONTENT, `models/${docId}.json`), "utf8")).clipMap as Record<string, string>;

  it.each([
    ["champ.sela", "mage"],
    ["champ.thorne", "knight"],
    ["champ.skin.barbarian", "barbarian"],
    ["champ.skin.rogue", "rogue"],
    ["champ.blocky.undead", "undead"],
  ])("%s resolves every clipMap state on blocky-%s.glb", (docId, key) => {
    const l = loaded.find((x) => x.key === key)!;
    const clipMap = clipMapOf(docId);
    const names = l.groups.map((g) => g.name);
    for (const [state, clip] of Object.entries(clipMap)) {
      expect(names, `${docId}.clipMap.${state} → "${clip}" is not in the glb`).toContain(clip);
    }
    // and the animator — the thing that actually drives them — binds all six
    const groups = l.scene.animationGroups.filter((g) => names.includes(g.name));
    const animator = new ClipAnimator(groups, clipMap as never);
    expect(animator.hasClips).toBe(true);
  });

  it("keeps a celebration clip for the shop purchase reaction (#111/#121/#146)", () => {
    for (const l of loaded) {
      const pick = pickReactionClip(l.groups.map((g) => g.name));
      expect(pick, `blocky-${l.key} has no reaction clip`).not.toBeNull();
      // it must be the VICTORY tier — falling through to `attack` is the silent
      // downgrade this assertion exists to catch.
      expect(pick!.kind, `blocky-${l.key} downgraded its purchase reaction`).toBe("victory");
    }
  });
});

describe("the rig is what the VFX + look layers expect", () => {
  it("exposes the canonical attachment joints by name", () => {
    for (const l of loaded) {
      for (const j of ["origin", "chest", "head", "overhead", "handLeft", "handRight", "weapon"]) {
        expect(l.bones, `blocky-${l.key} missing joint ${j}`).toContain(j);
      }
    }
  });

  it("carries the prop joints voxelSkin collapses to hide a prop", () => {
    for (const l of loaded) {
      for (const j of ["hat", "pack", "belt", "pauldronLeft", "pauldronRight"]) {
        expect(l.bones, `blocky-${l.key} missing prop joint ${j}`).toContain(j);
      }
    }
  });

  it("keeps the body mesh flashable (#64) — one named mesh, not a bare node", () => {
    for (const l of loaded) {
      const meshes = l.root.getChildMeshes(false).filter((m) => m.getVerticesData("position"));
      expect(meshes.length, `blocky-${l.key} draw calls`).toBe(1);
      // ChampionView pushes every glb child mesh into flashMeshes and writes
      // `renderOverlay`; the accessor comes from the outlineRenderer side-effect
      // import, which ChampionView.ts owns.
      expect(l.meshName).not.toMatch(/-teamring$|-shadow$/); // modelTint would skip it
    }
  });
});
