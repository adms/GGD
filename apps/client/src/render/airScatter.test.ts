/**
 * 空氣漫反射（GH#610，owner 2026-08-23「規格高的客戶端環境⋯可開關」）—— 兩條。
 *
 * ⛔ 這裡**一個數字都不驗**（濃度、混色比例、天光色都是可調的質感值，
 * 而它們已經有唯一的住處）。驗的是**機制**：
 *   ① 「規格高」那個條件本身（梯子降一階就自己關掉）；
 *   ② 那一格**真的接到出貨的場景上** —— 讀的是 `scene.fogMode` 這個最終物件，
 *      ⛔ 不是 RenderParams 上的布林（第⑤號故障：被測的不是出貨的那個）。
 *
 * 突變：`Lighting.write()` 裡那段 `if (scatter) { … }` 拿掉 → ② 紅。
 */
import { describe, it, expect, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { settingsStore } from "../settings";
import { qualityController } from "./QualityController";
import { setupLighting } from "./Lighting";
import { AIR_SCATTER_MAX_LEVEL, airScatterEnabled } from "./airScatter";

describe("空氣漫反射只在規格高的環境開 (GH#610)", () => {
  it("auto = 高畫質 + 梯子還沒開始割解析度", () => {
    expect(airScatterEnabled("auto", "high", 0)).toBe(true);
    expect(airScatterEnabled("auto", "auto", AIR_SCATTER_MAX_LEVEL)).toBe(true);
    // 再降一階 = 這台機器已經在為 fps 割肉 ⇒ 質感讓位（這就是「自動關掉」）
    expect(airScatterEnabled("auto", "high", AIR_SCATTER_MAX_LEVEL + 1)).toBe(false);
    // 低／中預設 = 玩家自己說過「這台不行」
    expect(airScatterEnabled("auto", "low", 0)).toBe(false);
    expect(airScatterEnabled("auto", "medium", 0)).toBe(false);
  });

  it("off / on 是玩家講死的 —— 梯子不能翻案", () => {
    expect(airScatterEnabled("off", "high", 0)).toBe(false);
    expect(airScatterEnabled("on", "low", AIR_SCATTER_MAX_LEVEL + 3)).toBe(true);
  });
});

describe("那一格真的接到出貨的場景上 (GH#610)", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const before = settingsStore.graphics().airScatter;
  // 沒有這一行,設定的改動根本到不了 render seam（＝這條線的承重點之一）
  qualityController.init();

  afterAll(() => {
    settingsStore.patchGraphics({ airScatter: before });
    scene.dispose();
    engine.dispose();
  });

  it("出貨預設 ⇒ 場景真的有空氣；關掉 ⇒ 真的沒了；再打開 ⇒ 又有了", () => {
    setupLighting(scene);
    expect(scene.fogMode).toBe(Scene.FOGMODE_EXP2);
    expect(scene.fogDensity).toBeGreaterThan(0);

    settingsStore.patchGraphics({ airScatter: "off" });
    expect(scene.fogMode).toBe(Scene.FOGMODE_NONE);

    settingsStore.patchGraphics({ airScatter: "on" });
    expect(scene.fogMode).toBe(Scene.FOGMODE_EXP2);
  });
});
