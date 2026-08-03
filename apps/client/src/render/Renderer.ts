/**
 * Renderer — owns the Babylon Engine + Scene. Hardware scaling is driven live
 * by the QualityController's resolutionScale (combined with the device DPR,
 * capped per tier for retina crispness). The GameApp drives `render()` from
 * its single rAF loop — Babylon's own runRenderLoop is NOT used, keeping one
 * authoritative frame ordering. Antialiasing is an engine-construction option,
 * so its setting is read once at boot (changes apply on the next match).
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";
// Side-effect: registers Scene.createPickingRay / ray picking support.
import "@babylonjs/core/Culling/ray";
import { autoQuality } from "../input/mobileDetect";
import { dprCapFor, resolutionToHardwareScaling } from "./RenderConfig";
import { qualityController } from "./QualityController";
import { setVfxDebugScene } from "../vfxDebugBus";

/** Plain scene stats (no Babylon types leak past the render seam). */
export interface RenderStats {
  meshes: number;
  particleSystems: number;
}

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly dpr: number;
  private readonly cap: number;
  private readonly onResize = (): void => this.engine.resize();
  private readonly offParams: () => void;

  constructor(canvas: HTMLCanvasElement) {
    const antialias = qualityController.getParams().antialias;
    this.engine = new Engine(canvas, antialias, { stencil: false, doNotHandleContextLost: true });
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.cap = dprCapFor(autoQuality());
    this.applyResolution(qualityController.getParams().resolutionScale);
    // settings / adaptive changes apply live, without a match restart
    this.offParams = qualityController.subscribe((p) => this.applyResolution(p.resolutionScale));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.043, 0.055, 0.078, 1);
    // dev-only introspection handle (harmless in prod; no gameplay reads this)
    if (typeof window !== "undefined") {
      (window as unknown as { __ggdScene?: Scene }).__ggdScene = this.scene;
    }
    // GH#270 —— 特效發射器診斷面板要讀的那一份 scene。刻意從**這裡**交出去
    // （應用程式自己持有的參照），不是讓面板去抓全域的 `BABYLON.Engine.
    // LastCreatedScene`：出貨是 minify + tree-shaken 的，那個全域根本不存在，
    // owner 已經被這個擋過一次。見 ../vfxDebugBus 檔頭 ②。
    setVfxDebugScene(this.scene);
    // the GameApp loop renders explicitly; skip Babylon's pointer-pick overhead
    this.scene.skipPointerMovePicking = true;
    if (typeof window !== "undefined") window.addEventListener("resize", this.onResize);
  }

  private applyResolution(resolutionScale: number): void {
    this.engine.setHardwareScalingLevel(
      resolutionToHardwareScaling(resolutionScale, this.dpr, this.cap),
    );
    this.engine.resize();
  }

  render(): void {
    this.scene.render();
  }

  stats(): RenderStats {
    return {
      meshes: this.scene.meshes.length,
      particleSystems: this.scene.particleSystems.length,
    };
  }

  dispose(): void {
    this.offParams();
    // 先解除註冊再 dispose：否則診斷面板下一次取樣會走進一個已經被銷毀的 scene。
    setVfxDebugScene(null);
    if (typeof window !== "undefined") window.removeEventListener("resize", this.onResize);
    this.scene.dispose();
    this.engine.dispose();
  }
}
