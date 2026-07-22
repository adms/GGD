/**
 * StorePreview — a small standalone Babylon viewer for the store screen:
 * loads a model doc's .glb on its own Engine/Scene, plays the idle clip and
 * slowly orbits. Plain imperative class (NO React/zustand here — client-08:
 * @babylonjs imports live only under render/ and vfx/); the store screen
 * embeds it through ui/platform/StorePreviewCanvas.tsx.
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

export class StorePreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly assets: AssetManager;
  private readonly camera: ArcRotateCamera;
  private modelRoot: TransformNode | null = null;
  private animator: ClipAnimator | null = null;
  private showToken = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: false });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.055, 0.07, 0.1, 1);
    this.assets = new AssetManager(this.scene);

    this.camera = new ArcRotateCamera(
      "store-cam",
      Math.PI / 2.6,
      Math.PI / 2.35,
      4.2,
      new Vector3(0, 1.0, 0),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 2.5;
    this.camera.upperRadiusLimit = 8;
    this.camera.attachControl(canvas, true);
    this.camera.useAutoRotationBehavior = true;
    if (this.camera.autoRotationBehavior) {
      this.camera.autoRotationBehavior.idleRotationSpeed = 0.35;
      this.camera.autoRotationBehavior.idleRotationWaitTime = 1200;
    }

    const hemi = new HemisphericLight("store-hemi", new Vector3(0.2, 1, 0.1), this.scene);
    hemi.intensity = 0.85;
    const dir = new DirectionalLight("store-dir", new Vector3(-0.4, -1, 0.35), this.scene);
    dir.intensity = 0.9;

    // simple podium disc
    const podiumMat = new StandardMaterial("store-podium", this.scene);
    podiumMat.diffuseColor = new Color3(0.12, 0.15, 0.22);
    podiumMat.specularColor = new Color3(0.03, 0.03, 0.05);
    const podium = MeshBuilder.CreateCylinder("store-podium", { diameter: 2.4, height: 0.12, tessellation: 48 }, this.scene);
    podium.material = podiumMat;
    podium.position.y = -0.06;

    this.engine.runRenderLoop(() => {
      if (!this.disposed) this.scene.render();
    });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.engine.resize());
      ro.observe(canvas);
    }
  }

  /** Swap the displayed model (clears the previous one). Never throws. */
  async show(doc: ModelDoc): Promise<void> {
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
    this.animator = new ClipAnimator(inst.animationGroups, doc.clipMap);
    this.animator.play("idle");
  }

  private clearModel(): void {
    if (this.modelRoot) {
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
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
