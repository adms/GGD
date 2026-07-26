/**
 * StorePreview — a small standalone Babylon viewer for the store screen AND the
 * champ-select profile stage (task #76 / #129): loads a model doc's .glb on its
 * own Engine/Scene, plays the idle clip and slowly orbits. Plain imperative
 * class (NO React/zustand here — client-08: @babylonjs imports live only under
 * render/ and vfx/); the store screen embeds it through
 * ui/platform/StorePreviewCanvas.tsx.
 *
 * AUTO-FRAMING (#129 blank/black preview). The camera used to hard-target a
 * fixed point (0, 1, 0) at a fixed radius tuned for the KayKit skins — centred
 * at the origin, feet on y=0, ~1.8 u tall. The w3x-imported champions are NOT
 * built that way: e.g. `imported.picacugy` (皮卡丘) spans x∈[-2.0, 0.47] and
 * y∈[-0.58, 1.71] — its body sits nearly a whole unit off the origin. Against
 * the fixed frame that put the champion outside the view, so the profile box
 * rendered an empty (blank/black) stage even though the model loaded fine. Every
 * loaded model is now measured and the camera is FRAMED to its actual bounding
 * box (and the model grounded so its feet sit on the podium), so any champion —
 * KayKit or imported, centred or offset — is centred and fully in view.
 *
 * VERTEX TINT (task #263). #49 ported the w3x per-unit art colour but wired it
 * ONLY into the arena (`EntityViewRegistry.applyTint`), so every champion the
 * map recoloured showed up in its RAW palette on this stage — 黑化Saber, 貞子,
 * 黑人牙膏 and Berserker were near-black in play and plain in champ-select, the
 * store and the round-winner card, which are the three screens that use this
 * viewer. `show()` now takes the champion whose model this is and paints the
 * SAME `applyModelTint` the arena uses, so the gamma correction, the team-mesh
 * exclusion list and the material cloning are shared code, not a second
 * implementation that could disagree.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ModelDoc } from "@ggd/shared/content";
import { AssetManager } from "./AssetManager";
import { ClipAnimator } from "./ClipAnimator";
import { glbYawOffset } from "./views/glbFacing";
import { championTintForId } from "./views/championTint";
import { applyModelTint, releaseModelTint } from "./views/modelTint";

/** The 3/4 hero-shot angle the stage always resolves to after framing. */
const STORE_CAM_ALPHA = Math.PI / 2.6;
const STORE_CAM_BETA = Math.PI / 2.35;

export interface PreviewFraming {
  /** camera target (model horizontal centre, vertical mid AFTER grounding) */
  targetX: number;
  targetY: number;
  targetZ: number;
  /** orbit radius that fits the model with headroom */
  radius: number;
  /** shift to add to the model root's y so its lowest point sits on the podium */
  groundShiftY: number;
}

/**
 * Frame a model from its world-space bounding box: ground it (feet → y=0) and
 * pick an orbit radius that fits its largest on-screen extent in the camera's
 * vertical FOV, with headroom. Pure so it is unit-testable without an Engine.
 */
export function computePreviewFraming(
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  fov: number,
): PreviewFraming {
  const height = Math.max(max.y - min.y, 0);
  const width = Math.max(max.x - min.x, max.z - min.z, 0);
  const extent = Math.max(height, width, 0.5);
  // fit the extent in the vertical FOV; 1.5 = breathing room around the figure
  const safeFov = fov > 0.05 ? fov : 0.8;
  const radius = (extent * 0.5) / Math.tan(safeFov / 2) * 1.5;
  return {
    targetX: (min.x + max.x) / 2,
    targetY: height / 2, // grounded model centre = half its height above y=0
    targetZ: (min.z + max.z) / 2,
    radius,
    groundShiftY: -min.y,
  };
}

export class StorePreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly ownsScene: boolean;
  private readonly assets: AssetManager;
  readonly camera: ArcRotateCamera;
  private modelRoot: TransformNode | null = null;
  private animator: ClipAnimator | null = null;
  private showToken = 0;
  private disposed = false;

  /**
   * @param host  a real `<canvas>` (production) OR an existing `Scene`
   *              (headless tests: a NullEngine scene, so no WebGL context is
   *              needed to exercise loading + framing).
   * @param assets optional AssetManager injection (tests feed a stub container).
   */
  constructor(host: HTMLCanvasElement | Scene, assets?: AssetManager) {
    if (host instanceof Scene) {
      this.scene = host;
      this.engine = host.getEngine() as Engine;
      this.ownsScene = false;
    } else {
      this.engine = new Engine(host, true, { stencil: false });
      this.scene = new Scene(this.engine);
      this.ownsScene = true;
    }
    this.scene.clearColor = new Color4(0.055, 0.07, 0.1, 1);
    this.assets = assets ?? new AssetManager(this.scene);

    this.camera = new ArcRotateCamera(
      "store-cam",
      STORE_CAM_ALPHA,
      STORE_CAM_BETA,
      4.2,
      new Vector3(0, 1.0, 0),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 2.5;
    this.camera.upperRadiusLimit = 8;
    this.camera.useAutoRotationBehavior = true;
    if (this.camera.autoRotationBehavior) {
      this.camera.autoRotationBehavior.idleRotationSpeed = 0.35;
      this.camera.autoRotationBehavior.idleRotationWaitTime = 1200;
    }

    const hemi = new HemisphericLight("store-hemi", new Vector3(0.2, 1, 0.1), this.scene);
    hemi.intensity = 0.85;
    // fill the undersides so a grounded figure never reads as a black silhouette
    hemi.groundColor = new Color3(0.32, 0.35, 0.42);
    const dir = new DirectionalLight("store-dir", new Vector3(-0.4, -1, 0.35), this.scene);
    dir.intensity = 0.9;

    // simple podium disc
    const podiumMat = new StandardMaterial("store-podium", this.scene);
    podiumMat.diffuseColor = new Color3(0.12, 0.15, 0.22);
    podiumMat.specularColor = new Color3(0.03, 0.03, 0.05);
    const podium = MeshBuilder.CreateCylinder("store-podium", { diameter: 2.4, height: 0.12, tessellation: 48 }, this.scene);
    podium.material = podiumMat;
    podium.position.y = -0.06;

    if (this.ownsScene) {
      // only drive the loop / resize when we own the engine (a canvas host)
      this.engine.runRenderLoop(() => {
        if (!this.disposed) this.scene.render();
      });
      if (host instanceof HTMLCanvasElement && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => this.engine.resize());
        ro.observe(host);
      }
      this.camera.attachControl(host as HTMLCanvasElement, true);
    }
  }

  /** The framed model root, or null when nothing is loaded (test/introspection). */
  get modelNode(): TransformNode | null {
    return this.modelRoot;
  }

  /**
   * Swap the displayed model (clears the previous one). Never throws.
   *
   * @param opts.championId whose art colour to paint on (task #263). The tint
   *   is a per-CHAMPION field and `doc.id` is the MODEL key — many-to-one, so
   *   the model alone cannot answer it (`champ.sela` is shared by 18 champions,
   *   tinted and untinted together). Omitted / unknown / untinted → nothing is
   *   painted and not one material is touched, exactly as before.
   */
  async show(doc: ModelDoc, opts: { championId?: string | null } = {}): Promise<void> {
    const token = ++this.showToken;
    this.clearModel();
    const container = await this.assets.load(doc.glbPath);
    if (!container || this.disposed || token !== this.showToken) return;
    const inst = container.instantiateModelsToScene((n) => `store-${n}`, false, { doNotInstantiate: true });
    const root = new TransformNode("store-model", this.scene);
    root.scaling.setAll(doc.scale);
    root.rotation.y = glbYawOffset(doc.glbPath, doc.id);
    for (const node of inst.rootNodes) node.parent = root;
    this.modelRoot = root;
    this.frameToModel(root);
    // AFTER the meshes are parented (applyModelTint walks `root`'s children)
    // and BEFORE the first frame, so a tinted champion never flashes untinted.
    // `championTintForId` returns undefined while content is still loading —
    // treated as "no tint" here rather than retried, because this stage shows
    // one model on demand instead of running a per-frame diff.
    applyModelTint(root, championTintForId(opts.championId ?? null) ?? null);
    this.animator = new ClipAnimator(inst.animationGroups, doc.clipMap);
    this.animator.play("idle");
  }

  /**
   * Ground + frame the loaded model. Measures its world bounding box, lifts it
   * so its feet sit on the podium, then centres the orbit camera on it at a
   * radius that fits — the fix for the blank/off-frame imported champions (#129).
   */
  private frameToModel(root: TransformNode): void {
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    // no meshes (bone-only dummy) → nothing to frame; leave the default camera
    if (!Number.isFinite(min.x) || !Number.isFinite(max.x) || max.x < min.x) return;

    const f = computePreviewFraming(min, max, this.camera.fov);
    root.position.y += f.groundShiftY;

    this.camera.setTarget(new Vector3(f.targetX, f.targetY, f.targetZ));
    // setTarget re-derives alpha/beta/radius from the camera's current world
    // position; force the intended 3/4 hero-shot back so framing is deterministic.
    this.camera.alpha = STORE_CAM_ALPHA;
    this.camera.beta = STORE_CAM_BETA;
    this.camera.radius = f.radius;
    this.camera.lowerRadiusLimit = f.radius * 0.55;
    this.camera.upperRadiusLimit = f.radius * 2.4;
  }

  private clearModel(): void {
    if (this.modelRoot) {
      // Hand the CACHED source materials back before the meshes go away
      // (#263). `applyModelTint` swaps in per-view clones; the originals belong
      // to the AssetManager's container and the NEXT `show()` of the same glb
      // reuses them, so an unreleased clone both leaks and strands the cache.
      // No-op when nothing was tinted.
      releaseModelTint(this.modelRoot);
      // NOT `dispose(_, true)`: everything under modelRoot was instantiated
      // with `cloneMaterials: false`, so its materials are the AssetContainer's
      // — cached by `this.assets` per glb path. Force-disposing them here would
      // leave the next `show()` of an already-seen skin holding dead materials
      // and textures. The container's own lifetime ends with `scene.dispose()`.
      this.modelRoot.dispose(false, false);
      this.modelRoot = null;
    }
    this.animator = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearModel();
    if (this.ownsScene) {
      this.engine.stopRenderLoop();
      this.scene.dispose();
      this.engine.dispose();
    }
  }
}
