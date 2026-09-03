import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import {
  AssetSafetyGate,
  UnsafeVfxAssetError,
  allAssetRefsVerifiedSafe,
  assetRefsFromScript,
  isCompositingNeutral,
  type DecodedRaster,
} from "./assetSafety";
import { submitVfxScriptProposal } from "./writeback";

const WHITE = [[1, 1, 1, 1] as const];

describe("VFX Forge asset backdrop gate", () => {
  it("keeps preview locked until every exact asset ref has a safe receipt", () => {
    const refs = [
      { collection: "models", id: "model.a" },
      { collection: "vfx", id: "vfx.a" },
    ] as const;
    const safeModel = {
      asset: refs[0], safe: true, code: "SAFE", summary: "ok",
    } as const;
    const safeVfx = {
      asset: refs[1], safe: true, code: "SAFE", summary: "ok",
    } as const;
    expect(allAssetRefsVerifiedSafe(refs, undefined)).toBe(false);
    expect(allAssetRefsVerifiedSafe(refs, [safeModel])).toBe(false);
    expect(allAssetRefsVerifiedSafe(refs, [safeModel, { ...safeVfx, safe: false }])).toBe(false);
    expect(allAssetRefsVerifiedSafe(refs, [safeModel, safeVfx])).toBe(true);
    expect(allAssetRefsVerifiedSafe([], undefined)).toBe(true);
  });

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
      doc: async <T,>(_collection: "config" | "models" | "vfx", id: string): Promise<T> => docs.get(id) as T,
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
      doc: async <T,>(_collection: "config" | "models" | "vfx", id: string): Promise<T> => docs.get(id) as T,
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

  it("blocks an opaque carrier colour on planar GLB geometry even when the material claims BLEND", async () => {
    const docs = new Map<string, unknown>([
      ["flat", { id: "flat", glbPath: "assets/flat.glb" }],
      ["crossed", { id: "crossed", glbPath: "assets/crossed.glb" }],
      ["effect", { id: "effect", glbPath: "assets/effect.glb", fxEmitters: ["fx.effect.p00"] }],
      ["masked", { id: "masked", glbPath: "assets/masked.glb" }],
      ["solid", { id: "solid", glbPath: "assets/solid.glb" }],
      ["tiny", { id: "tiny", glbPath: "assets/tiny.glb" }],
    ]);
    const source = {
      doc: async <T,>(_collection: "config" | "models" | "vfx", id: string): Promise<T> => docs.get(id) as T,
      assetBytes: async (path: string): Promise<ArrayBuffer> => modelGlb({
        planar: path.includes("flat"),
        alphaMode: path.includes("solid") ? "OPAQUE" : path.includes("masked") || path.includes("effect") ? "MASK" : "BLEND",
        emissive: path.includes("crossed"),
        tinyPlanarWithBody: path.includes("tiny"),
      }),
    };
    const gate = new AssetSafetyGate(source, async () => raster([196, 35, 35, 255]));

    const flat = await gate.check({ collection: "models", id: "flat" });
    expect(flat.code).toBe("MODEL_TEXTURE_BACKDROP");
    expect(flat.summary).toContain("不透明單色底板");
    expect(flat.detail).toContain("BLEND");
    expect(flat.detail).toContain("單色底 100.00%");

    // Crossed billboards share one 3-D accessor box, so their aggregate bounds
    // are not flat. A BLEND/MASK effect material with an all-opaque carrier is
    // nevertheless unsafe and must not bypass the geometric lane.
    expect((await gate.check({ collection: "models", id: "crossed" })).code).toBe("MODEL_TEXTURE_BACKDROP");

    // Effect-model metadata is authoritative even when an imported material
    // forgot to mark itself emissive and the combined mesh bounds are 3-D.
    expect((await gate.check({ collection: "models", id: "effect" })).code).toBe("MODEL_TEXTURE_BACKDROP");

    // A normal non-emissive MASK body atlas can legitimately have one dominant
    // edge colour. It is not an effect card and must not be keyed as a backdrop.
    expect((await gate.check({ collection: "models", id: "masked" })).safe).toBe(true);

    // An opaque, uniformly coloured atlas on a real 3D body is normal.  The
    // backdrop bug requires both the carrier-like texture and flat geometry.
    expect((await gate.check({ collection: "models", id: "solid" })).safe).toBe(true);

    // Some character GLBs contain a four-vertex utility quad that is under 5%
    // of the body span. It is not an effect carrier at authored scale; if a
    // script enlarges it, the rendered-frame audit still blocks the save.
    expect((await gate.check({ collection: "models", id: "tiny" })).safe).toBe(true);
  });

  it("uses Main's texture × blendMode contract for known files and verifies its hash", async () => {
    const bytes = new TextEncoder().encode("known-texture");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const docs = new Map<string, unknown>([
      ["safe-additive", {
        id: "safe-additive", schema: "vfx@1", texture: "assets/known.png",
        blendMode: "additive", color: [1, 1, 1, 1],
      }],
      ["unsafe-alpha", {
        id: "unsafe-alpha", schema: "vfx@1", texture: "assets/known.png",
        blendMode: "alpha", color: [1, 1, 1, 1],
      }],
      ["quarantined", {
        id: "quarantined", schema: "vfx@1", texture: "assets/bad.png",
        blendMode: "additive", color: [1, 1, 1, 1],
      }],
      ["unsafe-textures", {
        schema: "config.unsafe-textures@1",
        textures: [
          { file: "assets/known.png", sha256: hash, status: "safe", safeBlendModes: ["additive"] },
          { file: "assets/bad.png", sha256: hash, status: "quarantined", safeBlendModes: [] },
        ],
      }],
    ]);
    const source = {
      doc: async <T,>(collection: "config" | "models" | "vfx", id: string): Promise<T> =>
        docs.get(collection === "config" ? "unsafe-textures" : id) as T,
      assetBytes: async (): Promise<ArrayBuffer> => bytes.slice().buffer,
    };
    const decode = vi.fn(async () => raster([255, 255, 255, 255]));
    const gate = new AssetSafetyGate(source, decode);

    expect((await gate.check({ collection: "vfx", id: "safe-additive" })).safe).toBe(true);
    expect((await gate.check({ collection: "vfx", id: "unsafe-alpha" })).summary).toContain("混合模式");
    expect((await gate.check({ collection: "vfx", id: "quarantined" })).summary).toContain("隔離");
    expect(decode).not.toHaveBeenCalled();
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
    const submitAiProposal = vi.fn();
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
    await expect(submitVfxScriptProposal(
      script, guard, "production-candidate", { submitAiProposal },
    )).rejects.toThrow(UnsafeVfxAssetError);
    expect(submitAiProposal).not.toHaveBeenCalled();
  });
});

function raster(pixel: readonly [number, number, number, number]): DecodedRaster {
  // 10×10 gives a meaningful 0.1% threshold while keeping the fixture tiny.
  const rgba = new Uint8ClampedArray(10 * 10 * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set(pixel, i);
  return { width: 10, height: 10, rgba };
}

function modelGlb({
  planar,
  alphaMode,
  emissive,
  tinyPlanarWithBody = false,
}: {
  planar: boolean;
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  emissive: boolean;
  tinyPlanarWithBody?: boolean;
}): ArrayBuffer {
  const json = {
    bufferViews: [{ byteOffset: 0, byteLength: 4 }],
    images: [{ bufferView: 0, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [{
      name: "carrier",
      alphaMode,
      emissiveFactor: emissive ? [1, 1, 1] : [0, 0, 0],
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
    }, { name: "body" }],
    meshes: [{ primitives: [
      { material: 0, attributes: { POSITION: 0 } },
      ...(tinyPlanarWithBody ? [{ material: 1, attributes: { POSITION: 1 } }] : []),
    ] }],
    accessors: [
      {
        min: tinyPlanarWithBody ? [-0.01, 0, -0.01] : [-1, -1, planar ? 0 : -1],
        max: tinyPlanarWithBody ? [0.01, 0, 0.01] : [1, 1, planar ? 0 : 1],
      },
      ...(tinyPlanarWithBody ? [{ min: [-1, -1, -1], max: [1, 1, 1] }] : []),
    ],
  };
  const jsonRaw = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = (jsonRaw.byteLength + 3) & ~3;
  const binLength = 4;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(jsonRaw, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  return output.buffer;
}
