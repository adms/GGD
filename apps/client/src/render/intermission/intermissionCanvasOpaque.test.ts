/**
 * 🧩 商店「**像錯誤破圖那樣閃爍**」的**結構**守衛（owner 2026-08-23 逐字更正：
 * 「我看到的是像錯誤破圖那樣閃爍 **並不是什麼畫黑**」）。
 *
 * ⚠️ ⛔ **它不驗「畫面上有沒有破圖」** —— 那需要 owner 那顆 GPU，量不到，
 * 而且 screenshot 走的是另一條 readback 路徑（第二守則失敗形態⑦：掃屬性代替掃行為
 * 的反面 —— 這裡**只有屬性驗得到**，所以就誠實地驗屬性，並寫下為什麼）。
 * ⭐ 它驗的是**兩個危險的結構**，兩個都是在真的瀏覽器上量到現在載重的那一條：
 *
 *   ① 中場那張 `<canvas>` 的 WebGL context 必須是**不透明**的。
 *      量到：`alpha:true` + `preserveDrawingBuffer:false` + 引擎 60fps 上限
 *      在 120Hz 合成器裡 ⇒ drawing buffer **一幀有一幀無**，而「無」那一半
 *      量到的是 **alpha=0（透明）**，⛔ 不是黑。透明層要混合 ⇒ 底下（或一份
 *      半寫入的 premultiplied buffer）就是玩家看到的黑／破圖。
 *
 *   ② `mix-blend-mode` 必須被 `isolation: isolate` 關在按鈕自己的堆疊脈絡裡。
 *      量到：出貨頁上蓋在 canvas 上的 `mix-blend-mode`/`mask-composite`
 *      **全部**住在 `isolation: isolate` 的宿主底下 ⇒ 它們**沒有**跟 canvas 混合。
 *      拿掉那一行，它們就會 —— 而那正是嫌疑①要防的形狀。
 *
 * 突變驗過：`intermissionEngineOptions()` 的 `alpha` 改成寫死 `true` → ① 紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INTERMISSION_GPU, intermissionEngineOptions } from "./IntermissionScene";

const BUTTON_FX = fileURLToPath(new URL("../../ui/buttonFx.css", import.meta.url));

describe("中場 canvas 不是一塊要混合的透明層", () => {
  it("① 出貨的引擎選項宣告不透明 context（⛔ 不是 Babylon 預設的 alpha:true）", () => {
    // ⛔ 不抄字面值：期望值從旋鈕推導,owner 想回頭時把旋鈕轉掉就好(第〇·四守則)
    expect(intermissionEngineOptions().alpha).toBe(!INTERMISSION_GPU.opaqueCanvas);
    // ⭐ 而出貨的那一格是 true ⇒ 出貨的 context 是不透明的
    expect(INTERMISSION_GPU.opaqueCanvas).toBe(true);
    expect(intermissionEngineOptions().alpha).toBe(false);
  });

  it("② 每一條 mix-blend-mode 都被 isolation: isolate 關住", () => {
    const css = readFileSync(BUTTON_FX, "utf8");
    const blends = [...css.matchAll(/mix-blend-mode:\s*([a-z-]+)/g)].map((m) => m[1]);
    // 有 blend 才需要 isolate;沒有的話這條守衛本身該被刪掉,而不是空過
    expect(blends.filter((v) => v !== "normal").length).toBeGreaterThan(0);
    // `.ggd-btn` 是那些 ::after 的宿主 —— 它宣告 isolate,blend 才停在按鈕裡
    const base = css.slice(css.indexOf(".ggd-btn {"), css.indexOf(".ggd-btn::before"));
    expect(base).toMatch(/isolation:\s*isolate/);
  });
});
