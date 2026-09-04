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
/**
 * ⭐⭐ 前提缺席就**大聲說沒驗到**（GH#979）—— ⛔ 不是靜默跳過。
 *
 * `w3xlib.filter_mode_probe` 用 **PIL/Pillow** 生探針貼圖、轉一次 .glb 再把
 * 位元組讀回來。⇒ 沒有 Pillow 的機器（全新 clone、CI 的 ubuntu runner）上，
 * ⭐「對照表是對的」與「fm5 被畫成加法發光」**量起來一模一樣** ——
 * 一把在這台機器上瞎掉的尺，它的結論全部作廢，⛔ 不可以當成綠燈。
 *
 * ⚠️ ⭐ 這是**權宜**，⛔ 不是修好：真正的修法是讓 CI 裝 Pillow（`.github/` 已經
 * 為了 `cwebp` 做過同一件事，而那一步的註解逐字寫著「這一步存在是為了讓測試
 * **跑得起來**，⛔ 不是為了讓它跳過」）。這條 lane 的柵欄不含 `.github/**`。
 */
if (PY === null)
  console.warn(
    "⚠️ **沒驗到** —— w3xFilterModeContract：找不到帶 Pillow 的 python3。\n" +
      "   `w3xlib.filter_mode_probe` 需要 PIL 才生得出探針貼圖 ⇒ 這一族 8 條全部 it.skip。\n" +
      "   ⛔ 這不是「通過」。要在 CI 真的驗它，CI 得先 `pip install Pillow`（GH#979）。",
  );

interface Mat {
  name: string; alphaMode: string; alphaCutoff: number | null;
  emissive: boolean; baseColorFactor: number[] | null;
  extras: { w3x: { material: number; layer: number; filterMode: number; blend: string } };
  textureAlpha?: {
    min: number; max: number; mean: number;
    transparent: number; brightTransparent: number;
  };
}

/**
 * ⛔⛔ 這個 describe **刻意不是** `describe.runIf(…)`（GH#979）。
 *
 * vitest 為了**列舉**測試，連被跳過的 suite 也會執行它的 factory ⇒ 舊寫法的
 * `execFileSync(PY![0]!, …)` 在 `PY === null` 時照樣跑，丟
 * `TypeError: Cannot read properties of null (reading '0')`。
 * ⇒ CI 上讀到的是 `(0 test)` 加一個**指著錯方向**的 TypeError（看起來像程式壞了）
 *   —— ⭐ ⛔ 那既不是「紅」也不是「跳過」，是**這支守衛從來沒跑過**（形態⑨）。
 *
 * ⇒ 改成 factory 裡不解參考 null、缺前提時 `it.skip`（上面已經大聲說過沒驗到）。
 * ⛔ 一個斷言都沒有被放寬。
 */
describe("w3x filter-mode 對照表（GH#841）", () => {
  const itWithPil = PY === null ? it.skip : it;
  const probe =
    PY === null
      ? null
      : (JSON.parse(
          execFileSync(PY[0]!, [...PY.slice(1), "-m", "w3xlib.filter_mode_probe"], {
            cwd: W3X,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
          }),
        ) as { notes: string[]; probes: Record<string, Mat[]> });
  // ⭐ `probe!` 只在**沒被跳過**的 it 裡讀得到；真的被讀到而它是 null ⇒ 大聲丟。
  const one = (k: string): Mat => {
    const m = probe!.probes[k];
    expect(m, `probe "${k}" missing`).toBeTruthy();
    expect(m!.length, `probe "${k}" emitted ${m!.length} materials`).toBe(1);
    return m![0]!;
  };

  itWithPil("七種 filter mode 都翻得出一份材質,而且來源 fm 跟著位元組走", () => {
    const seen = new Set<number>();
    for (const mats of Object.values(probe!.probes)) {
      expect(mats.length).toBeGreaterThan(0);
      for (const m of mats) seen.add(m.extras.w3x.filterMode);
    }
    for (const fm of [0, 1, 2, 3, 4, 5, 6]) expect(seen.has(fm)).toBe(true);
  });

  itWithPil("⭐ 雙向:Modulate 黑貼圖必須變暗,白貼圖必須不變暗,而且兩邊都不是發光", () => {
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

  itWithPil("Modulate2x 與 Modulate 在同一張 50% 灰上必須給出不同的量,並列名它的損失", () => {
    expect(one("fm5-modulate-gray").textureAlpha!.mean).toBeCloseTo(127, 0);
    expect(one("fm6-modulate2x-gray").textureAlpha!.mean).toBeLessThanOrEqual(2);
    expect(probe!.notes.some((n) => n.includes("Modulate2x") && n.includes("2×"))).toBe(true);
  });

  itWithPil("alpha 平坦不透明的 Transparent → OPAQUE,⛔ 不是切不掉任何像素的 MASK", () => {
    const flat = one("fm1-transparent-flat-alpha");
    expect(flat.alphaMode).toBe("OPAQUE");
    expect(one("fm1-transparent-cutout").alphaMode).toBe("MASK"); // 有 alpha 才切
  });

  itWithPil("additive 明亮透明底的 RGB 必須歸零，ONE+ONE 才不會畫出整張貼圖", () => {
    const cutout = one("fm3-additive-cutout");
    expect(cutout.emissive).toBe(true);
    expect(cutout.textureAlpha!.transparent).toBeGreaterThan(0);
    expect(
      cutout.textureAlpha!.brightTransparent,
      "透明 texel 還保留亮 RGB；遊戲的 ONE+ONE 不讀 alpha，會把底板畫出來",
    ).toBe(0);
  });

  itWithPil("additive 的不透明白色外框必須反向取形，不能把白底當成整片發光", () => {
    const carrier = one("fm3-additive-white-carrier");
    expect(carrier.emissive).toBe(true);
    expect(carrier.textureAlpha!.min).toBe(0);
    expect(carrier.textureAlpha!.max).toBe(255);
    expect(carrier.textureAlpha!.transparent).toBeGreaterThan(0);
    expect(
      carrier.textureAlpha!.brightTransparent,
      "白色 carrier 雖然 alpha 已清掉，但 RGB 仍亮；ONE+ONE 仍會畫出白底",
    ).toBe(0);
  });

  itWithPil("疊加層不再靜默消失:不透明底 ＋ 混色疊加 = 兩份材質", () => {
    const layers = probe!.probes["two-layer-opaque-base-plus-blend"]!;
    expect(layers.map((m) => m.alphaMode)).toEqual(["OPAQUE", "BLEND"]);
    expect(layers.map((m) => m.extras.w3x.layer)).toEqual([0, 1]);
  });

  itWithPil("表以外的 filter mode 不靜默:退回 BLEND 並在 notes 裡指名", () => {
    expect(one("fm99-unknown").alphaMode).toBe("BLEND");
    expect(probe!.notes.some((n) => n.includes("99"))).toBe(true);
  });
});
