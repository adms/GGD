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
    if (typeof window !== "undefined") window.removeEventListener("resize", this.onResize);
    this.scene.dispose();
    this.engine.dispose();
  }
}
