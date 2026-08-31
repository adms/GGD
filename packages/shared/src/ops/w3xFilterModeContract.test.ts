/**
 * 🎨 GH#841 —— mdx→glb 的 **filter-mode 對照表**守衛。
 *
 * WC3 材質層有 **7 種** filter mode，而出貨的轉檔器在這一票之前只有 4 條分支
 * （`fm >= 3` / `fm == 1` / `fm == 2` / `fm == 0`）⇒ fm5 `Modulate`（相乘／變暗）
 * 掉進 `fm >= 3` 被畫成 **emissive 加法發光** —— 語意反向。
 *
 * ⭐ 這條守衛跑**出貨的** `w3xlib.gltf.convert()`（經 `w3xlib.filter_mode_probe`），
 * 讀回 .glb 裡真的位元組，⛔ 不是掃原始碼字串、⛔ 也不是自己造一份 payload。
 *
 * ⭐⭐ **雙向 sentinel**（一把只驗過單邊的尺不算自證過 —— CLAUDE.md）：
 * `Modulate` 的 alphaMode 是 BLEND，而「相加發光」的 alphaMode **也是 BLEND**
 * ⇒ 只看 alphaMode 這把尺對這個缺陷是**瞎的**。所以量的是貼圖 alpha：
 *   · 黑貼圖 ⇒ alpha 必須 ≈255（**真的會把底下變暗**）
 *   · 白貼圖 ⇒ alpha 必須 ≈0（**不可以變暗** —— 白色相乘是恆等）
 * 兩邊都跑過，這把尺才證明得了「有」也證明得了「沒有」。
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const W3X = join(HERE, "..", "..", "..", "..", "tools", "w3x-import");

function findPython(): string[] | null {
  for (const c of [["python3"], ["arch", "-arm64", "python3"],
    ["/opt/homebrew/bin/python3"], ["/usr/bin/python3"]]) {
    try {
      execFileSync(c[0]!, [...c.slice(1), "-c", "from PIL import Image"],
        { stdio: "pipe" });
      return c;
    } catch { /* next */ }
  }
  return null;
}
const PY = findPython();

interface Mat {
  name: string; alphaMode: string; alphaCutoff: number | null;
  emissive: boolean; baseColorFactor: number[] | null;
  extras: { w3x: { material: number; layer: number; filterMode: number; blend: string } };
  textureAlpha?: {
    min: number; max: number; mean: number;
    transparent: number; brightTransparent: number;
  };
}

describe.runIf(PY !== null)("w3x filter-mode 對照表（GH#841）", () => {
  const out = execFileSync(PY![0]!, [...PY!.slice(1), "-m",
    "w3xlib.filter_mode_probe"], { cwd: W3X, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  const probe = JSON.parse(out) as { notes: string[]; probes: Record<string, Mat[]> };
  const one = (k: string): Mat => {
    const m = probe.probes[k];
    expect(m, `probe "${k}" missing`).toBeTruthy();
    expect(m!.length, `probe "${k}" emitted ${m!.length} materials`).toBe(1);
    return m![0]!;
  };

  it("七種 filter mode 都翻得出一份材質,而且來源 fm 跟著位元組走", () => {
    const seen = new Set<number>();
    for (const mats of Object.values(probe.probes)) {
      expect(mats.length).toBeGreaterThan(0);
      for (const m of mats) seen.add(m.extras.w3x.filterMode);
    }
    for (const fm of [0, 1, 2, 3, 4, 5, 6]) expect(seen.has(fm)).toBe(true);
  });

  it("⭐ 雙向:Modulate 黑貼圖必須變暗,白貼圖必須不變暗,而且兩邊都不是發光", () => {
    const black = one("fm5-modulate-black");
    const white = one("fm5-modulate-white");
    for (const m of [black, white]) {
      expect(m.emissive, `${m.name} 是相乘,⛔ 不可以是 emissive 相加`).toBe(false);
      expect(m.alphaMode).toBe("BLEND");
      expect(m.baseColorFactor?.slice(0, 3)).toEqual([0, 0, 0]);
    }
    expect(black.textureAlpha!.min).toBeGreaterThanOrEqual(250); // 全暗
    expect(white.textureAlpha!.max).toBeLessThanOrEqual(5); // 恆等
  });

  it("Modulate2x 與 Modulate 在同一張 50% 灰上必須給出不同的量,並列名它的損失", () => {
    expect(one("fm5-modulate-gray").textureAlpha!.mean).toBeCloseTo(127, 0);
    expect(one("fm6-modulate2x-gray").textureAlpha!.mean).toBeLessThanOrEqual(2);
    expect(probe.notes.some((n) => n.includes("Modulate2x") && n.includes("2×"))).toBe(true);
  });

  it("alpha 平坦不透明的 Transparent → OPAQUE,⛔ 不是切不掉任何像素的 MASK", () => {
    const flat = one("fm1-transparent-flat-alpha");
    expect(flat.alphaMode).toBe("OPAQUE");
    expect(one("fm1-transparent-cutout").alphaMode).toBe("MASK"); // 有 alpha 才切
  });

  it("additive 明亮透明底的 RGB 必須歸零，ONE+ONE 才不會畫出整張貼圖", () => {
    const cutout = one("fm3-additive-cutout");
    expect(cutout.emissive).toBe(true);
    expect(cutout.textureAlpha!.transparent).toBeGreaterThan(0);
    expect(
      cutout.textureAlpha!.brightTransparent,
      "透明 texel 還保留亮 RGB；遊戲的 ONE+ONE 不讀 alpha，會把底板畫出來",
    ).toBe(0);
  });

  it("疊加層不再靜默消失:不透明底 ＋ 混色疊加 = 兩份材質", () => {
    const layers = probe.probes["two-layer-opaque-base-plus-blend"]!;
    expect(layers.map((m) => m.alphaMode)).toEqual(["OPAQUE", "BLEND"]);
    expect(layers.map((m) => m.extras.w3x.layer)).toEqual([0, 1]);
  });

  it("表以外的 filter mode 不靜默:退回 BLEND 並在 notes 裡指名", () => {
    expect(one("fm99-unknown").alphaMode).toBe("BLEND");
    expect(probe.notes.some((n) => n.includes("99"))).toBe(true);
  });
});
