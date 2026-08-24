/**
 * ⚡ **這一族閃電從寫出來的那天起，一個像素都沒畫出來過。**（2026-08-24）
 *
 * owner 逐字（**第二次**回報）：
 * > 「閃電特效**還是沒上線**⋯我用飛鼠天譴 **什麼閃電都沒看到**」
 *
 * ⭐ 而在這一條守衛出現之前，**三條既有守衛都是綠的** ——
 * 它們問的是「事件有沒有送」「頂點在不在」「它抖不抖」，
 * ⛔ 沒有一條問「**螢幕上亮起來了嗎**」。
 *
 * ## 量到的（`public/chain-lightning-audition.html`，真 sim → 真事件 → 真 VfxSystem）
 *
 * | | 場上弧 | 亮像素（>50/255） | 最大通道 |
 * |---|---:|---:|---:|
 * | 出貨的原始碼 | **32** | **0** | 44（＝完全沒有弧的基準線） |
 * | 拿掉輝光貼圖 | 32 | **8,947** | **255** |
 *
 * ⇒ 斷點在**那張 1×32 的橫截面漸層貼圖**：它同時被掛成 `emissiveTexture`
 * 與 `opacityTexture`，而形狀住在 **alpha**。一條 0.17 世界單位寬的弧在螢幕上
 * 只有幾個像素，取樣幾乎全落在漸層兩緣（alpha≈0）⇒ **整條帶子透明**。
 * ⚠️ 而 `CreateRibbon` 是用**全 (0,0,0) 的退化路徑**建的 ⇒ 它算出來的 UV
 * **全是 (0,0)**，`{ instance }` 就地更新又不會重算 ⇒ 那組 (0,0) 從此不會變。
 *
 * ## 這一條守衛問的兩件事（都是**當時會紅**的）
 *
 * ① 弧的材質**不可以有 `opacityTexture`** —— 那正是把像素歸零的那一格。
 * ② `arcGlowRamp` 的**形狀住在 RGB**（alpha 保持滿）—— 加法混合的亮度由 RGB 決定。
 *
 * ⛔ 它刻意**不驗顏色值、不驗寬度**（第二守則：驗機制不驗數字）。
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcBoltFx } from "./ArcBoltFx";
import { arcBoltSpec, arcGlowRamp, ARC_BOLT_TUNING } from "./arcBolt";

describe("⚡ 弧要真的畫得出像素（GH#571 的第二輪）", () => {
  it("⛔ 弧的材質不可以掛 opacityTexture —— 那一格把整條帶子變透明", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fx = new ArcBoltFx(scene);
    fx.strike({ x: 0, y: 1, z: 0 }, { x: 4, y: 1, z: 2 }, arcBoltSpec(), 0);
    const arcs = scene.meshes.filter((m) => m.name === "vfx-arc");
    expect(arcs.length, "一次 strike 之後場上應該有弧帶").toBeGreaterThan(0);
    for (const m of arcs) {
      const mat = m.material as unknown as { opacityTexture?: unknown } | null;
      expect(
        mat?.opacityTexture ?? null,
        "弧掛了 opacityTexture —— 那張漸層的 alpha 在兩緣是 0，" +
          "而一條弧在螢幕上只有幾個像素寬 ⇒ 取樣全落在 0 上 ⇒ 玩家什麼都看不到",
      ).toBe(null);
    }
    fx.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("⭐ 輝光漸層的形狀住在 RGB，alpha 保持滿（加法混合靠 RGB 給亮度）", () => {
    const n = 32;
    const ramp = arcGlowRamp(n, ARC_BOLT_TUNING.glowCoreT);
    const rgbAt = (i: number): number => ramp[i * 4]!;
    const alphaAt = (i: number): number => ramp[i * 4 + 3]!;
    // 中央要比兩緣亮 —— 那是「柔邊」這件事本身。
    expect(rgbAt(Math.floor(n / 2)), "漸層中央不是最亮的 ⇒ 形狀沒有住在 RGB 裡").toBeGreaterThan(
      rgbAt(0),
    );
    // alpha 全滿 —— ⛔ 形狀不可以再住在 alpha（那是看不見的那一版）。
    for (let i = 0; i < n; i++) {
      expect(alphaAt(i), `第 ${i} 列的 alpha 不是滿的 —— 形狀又搬回 alpha 了`).toBe(255);
    }
  });
});
