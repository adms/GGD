/**
 * The DynamicTexture sprite generators build real Babylon textures at runtime
 * from the pure painters — no image files. Runs on NullEngine (headless); its
 * DynamicTexture needs an `OffscreenCanvas`, so we install a tiny 2D stub.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { makeSoftDotTexture, makeCloudTexture, makeSkyTexture } from "./sprites";

// --- minimal OffscreenCanvas + 2D context stub (headless has none) -----------
class StubGradient {
  addColorStop(): void {}
}
class StubCtx {
  fillStyle: unknown = "";
  globalAlpha = 1;
  createRadialGradient(): StubGradient {
    return new StubGradient();
  }
  createLinearGradient(): StubGradient {
    return new StubGradient();
  }
  clearRect(): void {}
  fillRect(): void {}
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(4) };
  }
  putImageData(): void {}
}
class StubCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): StubCtx {
    return new StubCtx();
  }
}

let hadOffscreen: boolean;
beforeAll(() => {
  hadOffscreen = "OffscreenCanvas" in globalThis;
  if (!hadOffscreen) (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = StubCanvas;
});
afterAll(() => {
  if (!hadOffscreen) delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

describe("sprite generators", () => {
  it("makeSoftDotTexture returns a DynamicTexture with alpha", () => {
    cover("login-sprite-texture");
    const tex = makeSoftDotTexture(scene, 32);
    expect(tex).toBeInstanceOf(DynamicTexture);
    expect(tex.hasAlpha).toBe(true);
    expect(tex.getSize().width).toBe(32);
  });

  it("makeCloudTexture returns a DynamicTexture", () => {
    cover("login-sprite-texture");
    const tex = makeCloudTexture(scene, 64);
    expect(tex).toBeInstanceOf(DynamicTexture);
    expect(tex.hasAlpha).toBe(true);
  });

  it("makeSkyTexture returns a tall gradient DynamicTexture", () => {
    cover("login-sprite-texture");
    const tex = makeSkyTexture(scene, 128);
    expect(tex).toBeInstanceOf(DynamicTexture);
    expect(tex.getSize().height).toBe(128);
  });
});
