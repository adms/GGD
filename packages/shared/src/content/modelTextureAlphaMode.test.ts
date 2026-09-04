/**
 * 3D 模型的透明 atlas 不可以綁在 glTF OPAQUE 材質上。
 *
 * OPAQUE 會忽略 PNG alpha；角色一進入攻擊／施法動畫，原本應消失的髮片、
 * 披風與特效平面就會變成整張方形貼圖。這支守衛掃實際出貨的所有 GLB（包含
 * LOD，不只 model@1 主檔），所以編輯器預覽綠燈與玩家真正載入的檔案相同。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./modulateIdentity";

const MODELS = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/assets/models");
const ALPHA_BACKGROUND_MAX = 5;
const MIN_BACKGROUND_SHARE = 0.02;

interface GlbJson {
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  images?: { bufferView?: number }[];
  textures?: { source?: number }[];
  materials?: {
    name?: string;
    alphaMode?: "OPAQUE" | "MASK" | "BLEND";
    pbrMetallicRoughness?: { baseColorTexture?: { index?: number } };
  }[];
}

function filesUnder(path: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) out.push(...filesUnder(child));
    else if (name.endsWith(".glb")) out.push(child);
  }
  return out.sort();
}

function parts(path: string): { json: GlbJson; bin: Buffer } {
  const bytes = readFileSync(path);
  let offset = 12;
  let json: GlbJson | null = null;
  let bin: Buffer | null = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8").replace(/[\u0000 ]+$/u, ""));
    else if (type === 0x004e4942) bin = body;
    offset = (offset + 8 + length + 3) & ~3;
  }
  if (!json || !bin) throw new Error(`${path}: GLB 缺 JSON/BIN chunk`);
  return { json, bin };
}

describe("3D model atlas alpha mode", () => {
  it("每份出貨 GLB 的透明背景都由 MASK／BLEND 消除，不會畫出方形底板", () => {
    const files = filesUnder(MODELS);
    expect(files.length, "沒有量到完整 3D 模型資產樹").toBeGreaterThan(400);
    const bad: string[] = [];
    let measured = 0;

    for (const path of files) {
      const { json, bin } = parts(path);
      const imageCache = new Map<number, ReturnType<typeof decodePng>>();
      for (const [materialIndex, material] of (json.materials ?? []).entries()) {
        if ((material.alphaMode ?? "OPAQUE") !== "OPAQUE") continue;
        const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
        if (textureIndex === undefined) continue;
        const imageIndex = json.textures?.[textureIndex]?.source;
        const image = imageIndex === undefined ? undefined : json.images?.[imageIndex];
        const view = image?.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
        if (imageIndex === undefined || !view) continue;
        let png = imageCache.get(imageIndex);
        if (!png) {
          const start = view.byteOffset ?? 0;
          png = decodePng(bin.subarray(start, start + view.byteLength));
          imageCache.set(imageIndex, png);
        }
        measured++;
        let background = 0;
        for (let i = 3; i < png.rgba.length; i += 4) {
          if (png.rgba[i]! <= ALPHA_BACKGROUND_MAX) background++;
        }
        const share = background / (png.rgba.length / 4);
        if (share >= MIN_BACKGROUND_SHARE) {
          bad.push(
            `${relative(MODELS, path)} mat${materialIndex}:${material.name ?? "?"} · ` +
            `透明背景 ${(share * 100).toFixed(2)}% · alphaMode OPAQUE`,
          );
        }
      }
    }

    expect(measured, "沒有量到任何 OPAQUE 貼圖材質，守衛空轉").toBeGreaterThan(100);
    expect(
      bad,
      [
        "這些 3D model 會忽略貼圖 alpha，動畫時把 atlas 方形底板畫進實際遊戲：",
        ...bad.map((line) => `  · ${line}`),
        "請重跑 tools/w3x-import/repair_alpha_backdrops.py --write；不可在 runtime 用 modelKey 豁免。",
      ].join("\n"),
    ).toEqual([]);
  });
});
