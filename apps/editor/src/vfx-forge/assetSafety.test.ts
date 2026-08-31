import { describe, expect, it, vi } from "vitest";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import {
  AssetSafetyGate,
  UnsafeVfxAssetError,
  assetRefsFromScript,
  isCompositingNeutral,
  type DecodedRaster,
} from "./assetSafety";
import { writeVfxScript } from "./writeback";

const WHITE = [[1, 1, 1, 1] as const];

describe("VFX Forge asset backdrop gate", () => {
  it("uses the actual blend equation instead of merely checking for an alpha channel", () => {
    expect(isCompositingNeutral("alpha", WHITE, [255, 255, 255, 0])).toBe(true);
    expect(isCompositingNeutral("additive", WHITE, [255, 255, 255, 0])).toBe(false);
    expect(isCompositingNeutral("additive", WHITE, [0, 0, 0, 255])).toBe(true);
  });

  it("blocks a transparent-white additive matte and lets a neutral additive background through", async () => {
    const docs = new Map<string, unknown>([
      ["bad", { id: "bad", schema: "vfx@1", texture: "assets/bad.png", blendMode: "additive", color: { start: [1, 1, 1, 1], end: [1, 1, 1, 1] } }],
      ["good", { id: "good", schema: "vfx@1", texture: "assets/good.png", blendMode: "additive", color: { start: [1, 1, 1, 1], end: [1, 1, 1, 1] } }],
    ]);
    const source = {
      doc: async <T,>(_collection: "models" | "vfx", id: string): Promise<T> => docs.get(id) as T,
      assetBytes: async (path: string): Promise<ArrayBuffer> => new TextEncoder().encode(path).buffer,
    };
    const decode = async (bytes: ArrayBuffer): Promise<DecodedRaster> => {
      const path = new TextDecoder().decode(bytes);
      return raster(path.includes("bad") ? [255, 255, 255, 0] : [0, 0, 0, 255]);
    };
    const gate = new AssetSafetyGate(source, decode);
    expect((await gate.check({ collection: "vfx", id: "bad" })).code).toBe("TEXTURE_BACKDROP");
    expect((await gate.check({ collection: "vfx", id: "good" })).safe).toBe(true);
  });

  it("does not mistake one transparent speck for a removed particle backdrop", async () => {
    const docs = new Map<string, unknown>([
      ["speck", { id: "speck", schema: "vfx@1", texture: "assets/speck.png", blendMode: "alpha", color: [1, 1, 1, 1] }],
      ["sprite", { id: "sprite", schema: "vfx@1", texture: "assets/sprite.png", blendMode: "alpha", color: [1, 1, 1, 1] }],
    ]);
    const source = {
      doc: async <T,>(_collection: "models" | "vfx", id: string): Promise<T> => docs.get(id) as T,
      assetBytes: async (path: string): Promise<ArrayBuffer> => new TextEncoder().encode(path).buffer,
    };
    const decode = async (bytes: ArrayBuffer): Promise<DecodedRaster> => {
      const path = new TextDecoder().decode(bytes);
      const out = raster([255, 255, 255, 255]);
      if (path.includes("speck")) {
        out.rgba.set([255, 255, 255, 0], 0);
      } else {
        for (let y = 0; y < out.height; y++) {
          for (let x = 0; x < out.width; x++) {
            if (x === 0 || y === 0 || x === out.width - 1 || y === out.height - 1) {
              out.rgba.set([255, 255, 255, 0], (y * out.width + x) * 4);
            }
          }
        }
      }
      return out;
    };
    const gate = new AssetSafetyGate(source, decode);
    const speck = await gate.check({ collection: "vfx", id: "speck" });
    expect(speck.code).toBe("TEXTURE_BACKDROP");
    expect(speck.detail).toContain("邊緣可消失");
    expect((await gate.check({ collection: "vfx", id: "sprite" })).safe).toBe(true);
  });

  it("collects model, particle and model-trail refs once, then guards the sole write seam", async () => {
    const script: VfxScriptDoc = {
      id: "skill.a",
      schema: "vfx-script@1",
      abilityId: "skill.a",
      segments: [
        { kind: "modelFx", on: "castEffect", modelKey: "model.a", path: "forward", speed: 1, distance: 1, lifeSec: 1, trailVfxId: "vfx.trail", trailIntervalSec: 0.1 },
        { kind: "vfx", on: "castEffect", vfxId: "vfx.trail", at: "point" },
      ],
    };
    expect(assetRefsFromScript(script)).toEqual([
      { collection: "models", id: "model.a" },
      { collection: "vfx", id: "vfx.trail" },
    ]);
    const put = vi.fn(async () => ({ id: "skill.a", hash: "h", collectionHash: "c", contentVersion: "v" }));
    const guard = {
      assertScriptSafe: vi.fn(async () => {
        throw new UnsafeVfxAssetError([{
          asset: { collection: "models", id: "model.a" },
          safe: false,
          code: "MODEL_TEXTURE_BACKDROP",
          summary: "有底板",
        }]);
      }),
    };
    await expect(writeVfxScript(script, guard, { put })).rejects.toThrow(UnsafeVfxAssetError);
    expect(put).not.toHaveBeenCalled();
  });
});

function raster(pixel: readonly [number, number, number, number]): DecodedRaster {
  // 10×10 gives a meaningful 0.1% threshold while keeping the fixture tiny.
  const rgba = new Uint8ClampedArray(10 * 10 * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set(pixel, i);
  return { width: 10, height: 10, rgba };
}
