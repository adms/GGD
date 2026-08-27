/**
 * @vitest-environment jsdom
 *
 * ⭐ GH#741（舊 #42）—— **EX 施放時畫面真的變暗。**
 *
 * 推鏡（`CameraRig.exPunchIn`）2026 年初就上線了，而「壓暗／去飽和」那一半
 * **從來沒有消費端**：`CombatPostFx` 的 shader 只有 `vignette` + `vignetteColor`。
 *
 * ── ⭐ 為什麼這條在 headless 也是**終端證據** ────────────────────────────────
 * 這一層是一個 composited 的 `<div>`（見 `ScreenFxLayer` 的檔頭：⛔ 不是 PostProcess，
 * 因為 post-fx 在 mobile/low 層是關掉的，而「看不出發生什麼事」在低階機上更嚴重）。
 * ⇒ ⭐ **瀏覽器真的畫的就是 `style.opacity`** —— 讀它不是「掃屬性代替行為」，
 * 它就是那個行為。⛔ 而「UV 退化／additive 疊全黑／出生 alpha 0」那一族的靜態不可見，
 * 在這裡對應的是「峰值 alpha 是 0」，下面第一條就在擋它。
 *
 * ── 量尺自證（兩個方向，⭐ 硬要求）──────────────────────────────────────────
 * 已知**有**：`exDim()` 之後 opacity > 0；已知**沒有**：`enabled:false` 之後量不到。
 * ⛔ 只驗前者的尺，會在它最需要說話的時候沉默。
 */
import { describe, expect, it, afterEach } from "vitest";
import {
  SHIPPED_EX_DIM,
  exDimAlpha,
  exDimFilter,
  exDimTuning,
  setExDimTuning,
} from "../render/screenFx";
import { ScreenFxLayer } from "./ScreenFxLayer";

afterEach(() => setExDimTuning(null)); // 每一條都從出貨值開始

/** 走一整段包絡線，回傳這一層畫過的最大不透明度。 */
function peakOpacityOverLife(layer: ScreenFxLayer, host: HTMLElement): number {
  const step = Math.max(1, Math.round(exDimTuning().durationMs / 12));
  let peak = 0;
  for (let i = 0; i < 14; i++) {
    layer.tick(step);
    const el = host.querySelector<HTMLDivElement>(".ggd-screen-exdim");
    peak = Math.max(peak, el ? Number(el.style.opacity || "0") : 0);
  }
  return peak;
}

describe("GH#741 EX 的變暗 backdrop", () => {
  it("⭐ 包絡線是梯形，而且**峰值不是 0**（⛔ 靜態不可見的那一族）", () => {
    expect(exDimAlpha(0)).toBe(0);
    const mid = exDimAlpha(SHIPPED_EX_DIM.attackFrac + SHIPPED_EX_DIM.holdFrac / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeCloseTo(SHIPPED_EX_DIM.peakAlpha, 6);
    expect(exDimAlpha(1)).toBe(0);
    // 退場是單調下降的（⛔ 不是一次跳變）
    expect(exDimAlpha(0.95)).toBeLessThan(mid);
    expect(exDimAlpha(0.95)).toBeGreaterThan(0);
  });

  it("⭐ 去飽和是**非恆等**的濾鏡，而且跟著壓暗一起進退", () => {
    expect(exDimFilter(1)).toMatch(/^saturate\(/);
    expect(exDimFilter(1)).not.toBe("saturate(1.000)");
    expect(exDimFilter(0), "沒有壓暗的時候不可以留一層灰在畫面上").toBe("");
  });

  it("⭐ 走出貨的那一層：`exDim()` → `tick()` → **真的 div 真的有不透明度**", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const layer = new ScreenFxLayer({ host, reducedMotion: false });
    expect(layer.exDimAlphaNow, "還沒放之前不可以是暗的").toBe(0);
    expect(layer.exDim()).toBe(true);
    const peak = peakOpacityOverLife(layer, host);
    expect(peak, "EX 放了而畫面一個像素都沒有變暗").toBeGreaterThan(0);
    // 走完之後自己收乾淨（⛔ 不留一層黑到下一發）
    expect(layer.exDimAlphaNow).toBe(0);
    layer.dispose();
    host.remove();
  });

  it("⭐ 量尺自證的**另一邊**：關掉之後量不到（⛔ 不是「一律回有」）", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    setExDimTuning({ enabled: false });
    const layer = new ScreenFxLayer({ host, reducedMotion: false });
    expect(layer.exDim()).toBe(false);
    expect(peakOpacityOverLife(layer, host), "總開關關掉了而畫面還是變暗").toBe(0);
    layer.dispose();
    host.remove();
  });

  it("⭐ 逐格降級：壞掉的一格用出貨值，⛔ 不是整份丟掉", () => {
    setExDimTuning({ peakAlpha: Number.NaN, saturate: -3 });
    const t = exDimTuning();
    expect(t.peakAlpha).toBe(SHIPPED_EX_DIM.peakAlpha);
    expect(t.saturate).toBe(0); // 夾到下界，⛔ 不是丟掉整份
    expect(t.durationMs).toBe(SHIPPED_EX_DIM.durationMs);
  });
});
