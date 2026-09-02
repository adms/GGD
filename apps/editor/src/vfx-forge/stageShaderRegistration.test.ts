import { describe, expect, it } from "vitest";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

// Importing the stage must make the GLB/PBR decode path self-contained.  Do
// not let a bundler regression send Babylon to Vite's SPA fallback for .fx.
import "./VfxForgeStage";

describe("VFX Forge shader registration", () => {
  it("eagerly registers the post-process and RGBD decode shaders", () => {
    expect(ShaderStore.ShadersStore.postprocessVertexShader).toContain("gl_Position");
    expect(ShaderStore.ShadersStore.rgbdDecodePixelShader).toContain("fromRGBD");
  });
});
