/**
 * 🧼 出貨粒子貼圖的「整張底板」守衛。
 *
 * owner 2026-09-01：
 * > 「我看到一堆特效圖片或 3d model 貼圖、粒子特效貼圖沒去背，
 * >   請你要注意實際遊玩不能出現」
 *
 * 不能只問 PNG 有沒有 alpha。`babyface.png` 的背景 alpha 明明是 0，RGB 卻是
 * 白色；`additive → ONE+ONE` 會忽略 source alpha，所以遊戲仍會把整張白底加到
 * framebuffer。反過來，`blue-glow2.png` 沒有 alpha、背景卻是黑色；在 additive
 * 下黑色加零，實際遊玩是安全的。這一支因此量「文件的真 blend mode × 真貼圖
 * 像素」，不靠副檔名、alpha-channel 有無或一張會腐爛的壞檔名單。
 *
 * 每張被引用的貼圖至少要有 0.1% compositing-neutral texel，證明 sprite/ribbon 有
 * 背景可消失，而不是整張矩形都會寫入畫面。量尺依出貨合成式分流：
 *   · additive: RGB=0（ONE+ONE 不讀 alpha）
 *   · alpha/alphaKey: source alpha=0
 *   · modulate: δ=a·(1−tex.rgb·color.rgb)=0
 *
 * 0.1% 是保守的「有背景」下界，不是美術品質分數；真正的抗鋸齒 fringe 可以小於
 * 這個面積，但一張 cut-out sprite 不可能只有零個 neutral texel。來源抽取器會把
 * 大面積「透明但亮色」matte 的 RGB 清成 0，使 alpha 與 additive 兩條路都安全。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, type Rgba } from "./modulateIdentity";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const VFX = join(CONTENT, "vfx");
const NEUTRAL_CODE_VALUE = 1 / 255;
const MIN_NEUTRAL_SHARE = 0.001;

interface Vfxish {
  id: string;
  schema: "vfx@1" | "ribbon@1";
  blendMode: "additive" | "alpha" | "alphaKey" | "modulate";
  texture?: string;
  color: { start: Rgba; end: Rgba } | Rgba;
  colorStops?: readonly (readonly [number, Rgba])[];
}

function colorsOf(doc: Vfxish): readonly Rgba[] {
  if (doc.schema === "ribbon@1") return [doc.color as Rgba];
  if (doc.colorStops && doc.colorStops.length > 0) return doc.colorStops.map((stop) => stop[1]);
  const color = doc.color as { start: Rgba; end: Rgba };
  return [color.start, color.end];
}

/** True when this texel changes no 8-bit framebuffer code value under this document. */
export function isCompositingNeutral(
  mode: Vfxish["blendMode"],
  colors: readonly Rgba[],
  rgba8: readonly [number, number, number, number],
): boolean {
  const tex = rgba8.map((value) => value / 255) as [number, number, number, number];
  let contribution = 0;
  for (const color of colors) {
    if (mode === "additive") {
      // Babylon ONE+ONE ignores source alpha. This is the babyface white-matte trap.
      contribution = Math.max(
        contribution,
        tex[0] * color[0],
        tex[1] * color[1],
        tex[2] * color[2],
      );
    } else if (mode === "alpha" || mode === "alphaKey") {
      contribution = Math.max(contribution, tex[3] * color[3]);
    } else {
      for (let channel = 0; channel < 3; channel++) {
        contribution = Math.max(
          contribution,
          tex[3] * color[3] * (1 - tex[channel]! * color[channel]!),
        );
      }
    }
  }
  return contribution < NEUTRAL_CODE_VALUE;
}

function docs(): Vfxish[] {
  return readdirSync(VFX)
    .filter((name) => name.endsWith(".json") && name !== "_index.json")
    .map((name) => JSON.parse(readFileSync(join(VFX, name), "utf8")) as Vfxish)
    .filter((doc) => (doc.schema === "vfx@1" || doc.schema === "ribbon@1") && doc.texture);
}

describe("VFX 貼圖背景在實際 blend mode 下必須消失", () => {
  it("量尺自證：alpha=0 的白色在 alpha 安全、在 additive 不安全；黑色反之安全", () => {
    const whiteTransparent = [255, 255, 255, 0] as const;
    const blackOpaque = [0, 0, 0, 255] as const;
    const white = [[1, 1, 1, 1] as const];
    expect(isCompositingNeutral("alpha", white, whiteTransparent)).toBe(true);
    expect(isCompositingNeutral("additive", white, whiteTransparent)).toBe(false);
    expect(isCompositingNeutral("additive", white, blackOpaque)).toBe(true);
    expect(isCompositingNeutral("alpha", white, blackOpaque)).toBe(false);
  });

  it("每份出貨 vfx/ribbon 的真 PNG 都可解碼，而且至少 0.1% 背景不會寫入畫面", () => {
    const missing: string[] = [];
    const rectangular: string[] = [];
    const cache = new Map<string, ReturnType<typeof decodePng>>();
    for (const doc of docs()) {
      const rel = doc.texture!;
      const path = join(CONTENT, rel);
      if (!existsSync(path)) {
        missing.push(`${doc.id}: ${rel}`);
        continue;
      }
      let png = cache.get(rel);
      try {
        png ??= decodePng(readFileSync(path));
        cache.set(rel, png);
      } catch (error) {
        missing.push(`${doc.id}: ${rel}（PNG 解碼失敗：${String(error)}）`);
        continue;
      }
      const colors = colorsOf(doc);
      let neutral = 0;
      for (let i = 0; i < png.rgba.length; i += 4) {
        if (isCompositingNeutral(doc.blendMode, colors, [
          png.rgba[i]!, png.rgba[i + 1]!, png.rgba[i + 2]!, png.rgba[i + 3]!,
        ])) neutral++;
      }
      const share = neutral / (png.rgba.length / 4);
      if (share < MIN_NEUTRAL_SHARE) {
        rectangular.push(
          `${doc.id}: ${rel} · ${doc.blendMode} · neutral ${(share * 100).toFixed(3)}%`,
        );
      }
    }
    expect(
      missing,
      `這些出貨 VFX 引用了缺失或不可解碼的貼圖（⛔ 遊戲端不可以畫 debug/checker 貼圖）：\n${missing.join("\n")}`,
    ).toEqual([]);
    expect(
      rectangular,
      [
        "這些貼圖在文件的實際 blend mode 下幾乎沒有可消失的背景，會把整張矩形畫進遊戲：",
        ...rectangular.map((line) => `  · ${line}`),
        "修來源貼圖／抽取器或選正確 blend mode；⛔ 不要在 runtime 用檔名豁免。",
      ].join("\n"),
    ).toEqual([]);
  });
});
