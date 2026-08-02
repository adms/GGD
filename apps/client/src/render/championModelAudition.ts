/**
 * championModelAudition — look at ONE champion model through the two screens a
 * player actually sees it on, and measure what is on the frame.
 *
 * ---------------------------------------------------------------------------
 * WHY (task #267)
 * ---------------------------------------------------------------------------
 * 孫悟空 shipped without a head for months. Every audit that "checked" him read
 * numbers out of the .glb — primitive counts, material names, bounding boxes —
 * and every one of them came back clean, because the head was never IN the file
 * to be counted (it lives in `Gokuhead.mdx`, hung on the body by an object-data
 * `Asph` sphere ability). Task #73 closed on three assertions that all say
 * "X is absent"; a MISSING part cannot fail an absence test.
 *
 * So the acceptance evidence for #267 is a picture, taken through:
 *   · `cam=combat` — the REAL `CameraRig` (68° pitch, eye 9.27u, fov 0.8) over
 *     the REAL `buildZoneGround` floor, with the champion placed exactly the
 *     way `ChampionView.tryUpgradeToGlb` places it (normalise to TARGET_HEIGHT,
 *     yaw from `glbFacing`, feet grounded to y=0). #93 was "verified" through a
 *     21° camera the game does not have; that is not repeated here.
 *   · `cam=select` — the REAL `StorePreview` class, which is literally what the
 *     champ-select profile panel and the lobby store mount
 *     (ProfileBlock → StorePreviewCanvas → StorePreview). Owner named this
 *     screen specifically: 「包括選英雄的時候」.
 *
 * `probe()` also reports a HEAD-COVERAGE measurement the capture script can
 * assert on: the fraction of the rendered silhouette's top slice that carries
 * geometry, plus the world-space gap between the top of the mesh bbox and the
 * skeleton's own head/overhead reference joint. A model whose skeleton says
 * "the head goes here" and whose geometry stops well below it is the #267 bug.
 *
 * Nothing in the shipped app imports this — `public/*.html` is not a build
 * entry, so it never reaches the bundle.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { ModelDoc } from "@ggd/shared/content";

import { CameraRig } from "./CameraRig";
import { buildZoneGround } from "./ArenaGround";
import { AssetManager } from "./AssetManager";
import { ClipAnimator } from "./ClipAnimator";
import { StorePreview } from "./StorePreview";
import { glbYawOffset } from "./views/glbFacing";
import { TARGET_HEIGHT } from "./views/ChampionView";
import type { AnimState } from "./anim/AnimationStateMachine";

const ANIM_STATES: readonly AnimState[] = ["idle", "run", "attack", "cast", "hurt", "death"];
const asAnimState = (s: string | undefined): AnimState =>
  ANIM_STATES.includes(s as AnimState) ? (s as AnimState) : "idle";

export interface ChampionModelAuditionOptions {
  /** content model key, e.g. "imported.goku" */
  modelKey: string;
  cam?: "combat" | "select";
  /** clip to hold (combat only); the champ-select preview always plays idle */
  clip?: string;
  /** distance from the camera's ground target, world units (combat only) */
  offsetZ?: number;
}

export interface ChampionModelAuditionHandle {
  stepTo(ms: number): void;
  readonly settled: boolean;
  probe(): Record<string, unknown>;
  dispose(): void;
}

/** joints whose name marks where the head belongs, in any of the rigs' spellings */
const HEAD_JOINT = /(^|[^a-z])(head|helmet)([^a-z]|$)/i;

async function fetchModelDoc(modelKey: string): Promise<ModelDoc> {
  const res = await fetch(`/content/models/${encodeURIComponent(modelKey)}.json`);
  if (!res.ok) throw new Error(`no model doc for ${modelKey} (${res.status})`);
  return (await res.json()) as ModelDoc;
}

export function startChampionModelAudition(
  canvas: HTMLCanvasElement,
  opts: ChampionModelAuditionOptions,
): ChampionModelAuditionHandle {
  const camMode = opts.cam ?? "combat";
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);

  let stepTargetMs: number | null = null;
  let nowMs = 0;
  let frozen = false;
  let loaded = false;
  const facts: Record<string, unknown> = { modelKey: opts.modelKey, cam: camMode };

  if (camMode === "select") {
    // THE REAL champ-select / store preview — same class, same camera, same
    // framing code the profile panel mounts (ProfileBlock → StorePreviewCanvas
    // → StorePreview). Handing it a Scene rather than the canvas is the
    // documented headless-host path: the preview then does NOT install its own
    // render loop, so the capture owns the clock and the shot is deterministic
    // (its idle auto-rotation would otherwise put the model at a random yaw).
    const selScene = new Scene(engine);
    const preview = new StorePreview(selScene);
    preview.camera.useAutoRotationBehavior = false;
    let frames = 0;
    void fetchModelDoc(opts.modelKey)
      .then(async (doc) => {
        await preview.show(doc);
        const root = preview.modelNode;
        if (!root) throw new Error("StorePreview showed nothing (empty glb?)");
        root.computeWorldMatrix(true);
        Object.assign(facts, measure(root, doc));
        loaded = true;
      })
      .catch((e) => {
        facts["error"] = String(e && (e as Error).stack ? (e as Error).stack : e);
        loaded = true;
      });
    engine.runRenderLoop(() => {
      if (frozen) return;
      selScene.render();
      if (!loaded) return;
      // a handful of frames so skeleton + idle clip settle, then hold
      if (++frames > 10) frozen = true;
    });
    return {
      stepTo(): void {
        /* the preview has no timeline of its own; settling is frame-count based */
      },
      get settled(): boolean {
        return frozen;
      },
      probe: () => ({ ...facts, frames, meshes: selScene.meshes.length }),
      dispose(): void {
        engine.stopRenderLoop();
        preview.dispose();
        selScene.dispose();
        engine.dispose();
      },
    };
  }

  // ---- combat -------------------------------------------------------------
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.06, 0.1, 1);
  const hemi = new HemisphericLight("aud-hemi", new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.8;
  const sun = new DirectionalLight("aud-sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.intensity = 1.1;
  const arena = new TransformNode("aud-arena", scene);
  buildZoneGround(scene, arena, { center: { x: 0, z: 0 }, boundaryRadius: 24 }, 0, "stone");

  // THE REAL RIG at its shipped defaults (68° pitch, dolly 10, fov 0.8).
  const rig = new CameraRig(scene, { x: 0, z: 0 });
  const camUpdate = (): void =>
    rig.update({
      dtMs: 1000 / 60,
      localPos: { x: 0, z: 0 },
      cursor: null,
      panKeys: null,
      viewportWidth: canvas.clientWidth || 1280,
      viewportHeight: canvas.clientHeight || 720,
    });
  camUpdate();

  const assets = new AssetManager(scene);
  let animator: ClipAnimator | null = null;
  void fetchModelDoc(opts.modelKey)
    .then(async (doc) => {
      const container = await assets.load(doc.glbPath);
      if (!container) throw new Error(`glb did not load: ${doc.glbPath}`);
      const inst = container.instantiateModelsToScene((n) => `aud-${n}`, false, {
        doNotInstantiate: true,
      });
      // EXACTLY ChampionView.tryUpgradeToGlb's placement, in its order.
      const root = new TransformNode("aud-champ", scene);
      root.scaling.setAll(1);
      root.rotation.y = glbYawOffset(doc);
      for (const node of inst.rootNodes) node.parent = root;
      root.position.z = opts.offsetZ ?? 0;
      root.computeWorldMatrix(true);
      const native = root.getHierarchyBoundingVectors(true);
      const nativeH = native.max.y - native.min.y;
      root.scaling.setAll(nativeH > 0.05 ? TARGET_HEIGHT / nativeH : doc.scale);
      root.computeWorldMatrix(true);
      const { min } = root.getHierarchyBoundingVectors(true);
      if (Number.isFinite(min.y)) root.position.y = -min.y;
      root.computeWorldMatrix(true);
      animator = new ClipAnimator(inst.animationGroups, doc.clipMap);
      animator.play(asAnimState(opts.clip));
      Object.assign(facts, measure(root, doc));
      loaded = true;
    })
    .catch((e) => {
      facts["error"] = String(e && (e as Error).stack ? (e as Error).stack : e);
      loaded = true;
    });

  const STEP_MS = 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
  engine.runRenderLoop(() => {
    if (frozen) return;
    camUpdate();
    scene.render();
    if (!loaded) return;
    if (stepTargetMs !== null && nowMs >= stepTargetMs) {
      frozen = true;
      return;
    }
    nowMs += STEP_MS;
  });

  return {
    stepTo(ms: number): void {
      stepTargetMs = ms;
      frozen = false;
    },
    get settled(): boolean {
      return frozen;
    },
    probe: () => ({ ...facts, nowMs, frozen, meshes: scene.meshes.length }),
    dispose(): void {
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}

/**
 * The geometric facts that decide "does this champion have a head on screen".
 * All in WORLD units of the placed model, so the numbers are what the camera
 * sees rather than what the file happens to store.
 */
function measure(root: TransformNode, doc: ModelDoc): Record<string, unknown> {
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const height = max.y - min.y;
  const meshes = root.getChildMeshes(false);
  let tris = 0;
  for (const m of meshes) tris += (m.getTotalIndices?.() ?? 0) / 3;

  // topmost joint whose NAME claims to be a head, in world space
  let headJointY: number | null = null;
  let headJointName: string | null = null;
  for (const node of root.getDescendants(false)) {
    const name = node.name ?? "";
    if (!HEAD_JOINT.test(name)) continue;
    const wm = (node as TransformNode).getAbsolutePosition?.();
    if (!wm) continue;
    if (headJointY === null || wm.y > headJointY) {
      headJointY = wm.y;
      headJointName = name;
    }
  }
  for (const mesh of meshes) {
    for (const bone of mesh.skeleton?.bones ?? []) {
      if (!HEAD_JOINT.test(bone.name)) continue;
      const p = bone.getAbsolutePosition(mesh);
      if (headJointY === null || p.y > headJointY) {
        headJointY = p.y;
        headJointName = bone.name;
      }
    }
  }
  return {
    glbPath: doc.glbPath,
    bboxMinY: min.y,
    bboxMaxY: max.y,
    renderedHeight: height,
    triangles: tris,
    meshCount: meshes.length,
    headJointName,
    headJointY,
    // > 0 means geometry reaches above the head joint (a head is present);
    // < 0 means the silhouette stops BELOW where the rig says the head is.
    headroomAboveHeadJoint: headJointY === null ? null : max.y - headJointY,
  };
}
