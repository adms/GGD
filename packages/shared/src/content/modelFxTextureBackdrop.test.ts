/**
 * 🧼 出貨 modelFx 的內嵌貼圖不能在 ONE+ONE 下露出底板。
 *
 * `ModelFxRig.applyStockGlowAdditive()` 會把 glTF 中亮著的 emissive material
 * 改成 Babylon `ALPHA_ONEONE`。這是 WC3 additive 的正確亮度語意，但它不讀
 * source alpha：PNG 裡 `alpha=0` 的白／紅色 matte 仍會整塊加到畫面。
 *
 * 本守衛只判定有充足證據的壞檔，不把一般 3D 表面誤當 sprite：
 *   1. 掃 Editor 資源池可選的每一份 `model@1`（不只今天已被技能引用的）；
 *   2. 材質必須是 runtime 會轉 ONE+ONE 的 emissive 材質；
 *   3. 貼圖至少 2% texel 幾乎透明，證明它確實含 cut-out 背景；
 *   4. 其中若至少 0.1% 全圖仍有 RGB>8，就會在遊戲畫出不屬於特效的底板。
 *
 * 修法在 `w3xlib/gltf.py::gltf_texture_additive`：由來源重生 GLB，把透明
 * texel 的 RGB 清為黑（additive identity），⛔ 不在 runtime 用檔名豁免。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./modulateIdentity";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const ALPHA_BACKGROUND_MAX = 5;
const BRIGHT_MATTE_MIN = 8;
const MIN_BACKGROUND_SHARE = 0.02;
const MAX_BRIGHT_BACKGROUND_SHARE = 0.001;

interface GlbJson {
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  images?: { bufferView?: number }[];
  textures?: { source?: number }[];
  materials?: {
    name?: string;
    emissiveFactor?: number[];
    pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
  }[];
}

function resourcePoolModelKeys(): string[] {
  return readdirSync(join(CONTENT, "models"))
    .filter((name) => name.endsWith(".json") && name !== "_index.json")
    .map((name) => {
      const doc = JSON.parse(readFileSync(join(CONTENT, "models", name), "utf8")) as {
        id?: string; schema?: string;
      };
      return doc.schema === "model@1" && typeof doc.id === "string" ? doc.id : null;
    })
    .filter((id): id is string => id !== null)
    .sort();
}

function glbParts(path: string): { json: GlbJson; bin: Buffer } {
  const bytes = readFileSync(path);
  let offset = 12;
  let json: GlbJson | null = null;
  let bin: Buffer | null = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const chunk = bytes.subarray(start, start + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/[\u0000 ]+$/u, ""));
    else if (type === 0x004e4942) bin = chunk;
    offset = start + length;
    while (offset % 4 !== 0) offset++;
  }
  if (!json || !bin) throw new Error(`${path}: GLB 缺 JSON/BIN chunk`);
  return { json, bin };
}

function imageBytes(json: GlbJson, bin: Buffer, imageIndex: number): Buffer | null {
  const image = json.images?.[imageIndex];
  if (image?.bufferView === undefined) return null;
  const view = json.bufferViews?.[image.bufferView];
  if (!view) return null;
  const start = view.byteOffset ?? 0;
  return bin.subarray(start, start + view.byteLength);
}

describe("modelFx 內嵌貼圖在遊戲 ONE+ONE 下沒有底板", () => {
  it("每份被引用 modelFx 的 emissive cut-out 都把透明區 RGB 清成 additive identity", () => {
    const modelKeys = resourcePoolModelKeys();
    expect(modelKeys.length, "量尺沒有讀到完整 model 資源池，下面綠燈無效").toBeGreaterThan(100);
    const bad: string[] = [];
    let measured = 0;

    for (const modelKey of modelKeys) {
      const docPath = join(CONTENT, "models", `${modelKey}.json`);
      if (!existsSync(docPath)) continue;
      const doc = JSON.parse(readFileSync(docPath, "utf8")) as { glbPath?: string };
      if (!doc.glbPath) continue;
      const glbPath = join(CONTENT, doc.glbPath);
      if (!existsSync(glbPath)) continue;
      const { json, bin } = glbParts(glbPath);

      for (const [materialIndex, material] of (json.materials ?? []).entries()) {
        if (Math.max(...(material.emissiveFactor ?? [0])) <= 0) continue;
        const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
        if (textureIndex === undefined) continue;
        const imageIndex = json.textures?.[textureIndex]?.source;
        if (imageIndex === undefined) continue;
        const pngBytes = imageBytes(json, bin, imageIndex);
        if (!pngBytes) continue;
        const png = decodePng(pngBytes);
        measured++;
        const pixels = png.rgba.length / 4;
        let background = 0;
        let brightBackground = 0;
        for (let i = 0; i < png.rgba.length; i += 4) {
          if (png.rgba[i + 3]! > ALPHA_BACKGROUND_MAX) continue;
          background++;
          if (Math.max(png.rgba[i]!, png.rgba[i + 1]!, png.rgba[i + 2]!) > BRIGHT_MATTE_MIN) {
            brightBackground++;
          }
        }
        if (background / pixels < MIN_BACKGROUND_SHARE) continue;
        if (brightBackground / pixels >= MAX_BRIGHT_BACKGROUND_SHARE) {
          bad.push(
            `${modelKey} mat${materialIndex}:${material.name ?? "?"} · ` +
            `透明背景 ${(background / pixels * 100).toFixed(2)}% · ` +
            `其中亮 RGB ${(brightBackground / pixels * 100).toFixed(2)}%`,
          );
        }
      }
    }

    expect(measured, "沒有量到任何 emissive model texture，守衛空轉").toBeGreaterThan(20);
    expect(
      bad,
      [
        "這些 modelFx 貼圖在 alpha=0 下仍保留亮 RGB；ONE+ONE 會把底板畫進實際遊戲：",
        ...bad.map((line) => `  · ${line}`),
        "請從 MDX/BLP 轉檔器重生 GLB；⛔ 不可用 modelKey 白名單略過。",
      ].join("\n"),
    ).toEqual([]);
  });
});
