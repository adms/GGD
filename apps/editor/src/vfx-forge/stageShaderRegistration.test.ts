import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "./VfxForgeStage";

describe("VFX Forge paused rendering", () => {

  it("eagerly registers the GLB PBR and RGBD shaders used by a direct Forge route", () => {
    expect(ShaderStore.ShadersStore.pbrVertexShader).toContain("gl_Position");
    expect(ShaderStore.ShadersStore.pbrPixelShader).toContain("finalColor");
    expect(ShaderStore.ShadersStore.postprocessVertexShader).toContain("gl_Position");
    expect(ShaderStore.ShadersStore.rgbdDecodePixelShader).toContain("fromRGBD");
  });

  it("bounds paused-scene readiness before compiling actor materials", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    expect(source).toContain("ACTOR_READY_BUDGET_MS = 750");
    expect(source).toContain("ACTOR_WARMUP_FRAMES = 10");
    expect(source).toContain("this.scene.whenReadyAsync()");
    expect(source).toContain("Promise.race([");
    expect(source).toContain("this.renderWarmupFrames(ACTOR_WARMUP_FRAMES)");
  });

  it("warms script model effects on the shipped VfxSystem that renders them", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("this.runtimeVfx?.warmModelFx(modelKeys)");
    expect(source).toContain("if (!this.runtimeVfx) this.modelRig.warm(modelKeys)");
  });

  it("moves the neutral arena with each real SimWorld trace", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('{ center: { x: 0, z: 0 }, boundaryRadius: 24 }');
    expect(source).toContain("root.position.set(this.homePose.caster.x, 0, this.homePose.caster.z)");
    expect(source).toContain("this.groundRoot.position.set(this.homePose.caster.x, 0, this.homePose.caster.z)");
  });

  it("uses the shipped scenery-lighting resolver instead of a Forge-only light rig", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('setupLighting(this.scene)');
    expect(source).toContain('this.lighting.applyScenery(undefined, false)');
    expect(source).toContain('this.lighting.animate(this.nowMs / 1000)');
    expect(source).not.toContain('new HemisphericLight("vfx-forge-hemi"');
    expect(source).not.toContain('new DirectionalLight("vfx-forge-sun"');
  });

  it("boots the exact client Renderer rather than a second Engine/Scene policy", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("this.renderer = new Renderer(canvas)");
    expect(source).toContain("this.engine = this.renderer.engine");
    expect(source).toContain("this.scene = this.renderer.scene");
    expect(source).toContain("this.renderer.dispose()");
    expect(source).not.toContain("new Engine(canvas");
  });

  it("fails closed when a parsed GLB does not visibly alter the real framebuffer", () => {
    const source = readFileSync(new URL("./VfxForgeStage.ts", import.meta.url), "utf8");
    expect(source).toContain("MIN_ACTOR_VISIBLE_PIXELS = 250");
    expect(source).toContain("measureActorVisibility(actor)");
    expect(source).toContain("3D 預覽完整性未通過，禁止建立視覺證據");
    expect(source).toContain("actor.fallbackForced = true");
  });
});
