/**
 * 🌀 GH#572 —— **飛行看得出來**。owner 2026-08-23（逐字）：
 *
 *     「技能說明記得改，不然之前都是寫未實作，
 *       **飛行視覺可以調 3d model 高度與影子變化**」
 *
 * 前一輪已經逐層驗過飛行**接上了**（內容→授予→飛行系統→快照→客戶端每幀套用），
 * ⛔ 缺的是「玩家看不看得出來」：出貨的跳躍曲線在 04-00 翔封界的高度上只把影子
 * 縮 6%，⇒ 一具在飛的身體與一具站著的身體長得幾乎一樣。
 *
 * ⭐ 這一條驗**機制**（⛔ 不驗那三格常數是多少 —— 第二守則）：
 *   ① 在飛（有高度、⛔ 沒有 AIRBORNE）⇒ 影子明顯**小於**落地時，而且**淡**掉；
 *   ② 同一個高度**在跳**（AIRBORNE）⇒ 走 #247 那條路，逐位元不變。
 *      ⚠️ 少了這一條，把兩條曲線合成一條的實作也會過（失敗形態 ④）。
 *
 * ⚠️ 斷言讀的是 **Babylon 場景裡那個 mesh 最後的 scaling / material.alpha**，
 * ⛔ 不是任何中間變數（`applyModelTint` 那條教訓：要讀最終物件）。
 *
 * 突變紀錄：`ChampionView.applyAirborne` 的 `const resp = flying ? … : null`
 * 改回 `null` ⇒ ①「明顯小於」與「淡掉」兩條同時紅。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ChampionView } from "./ChampionView";

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** 出貨的 04-00 翔封界 離地高度那一級 —— ⛔ 只是一個「在飛」的高度，不是斷言值。 */
const H = 0.9;

/** 讓一具身體擺在「高度 h、是不是彈道」的狀態，讀它地上那片影子。 */
function shadowAt(entityId: number, h: number, airborne: boolean): { scale: number; alpha: number } {
  const view = new ChampionView(scene, entityId, "champ.sela", 0);
  view.setPose(0, 0, 0, 1, h, airborne);
  view.update("idle", 16, 16);
  const shadow = scene.meshes.find(
    (m) => m.name === `champ-${entityId}-shadow`,
  ) as Mesh | undefined;
  const read = { scale: shadow!.scaling.x, alpha: (shadow!.material as { alpha: number }).alpha };
  view.dispose();
  return read;
}

describe("飛行的影子變化 (GH#572)", () => {
  it("在飛的身體，影子明顯縮小而且變淡；同高度的跳躍不受影響", () => {
    cover("flight-shadow-read");
    const grounded = shadowAt(7201, 0, false);
    const flying = shadowAt(7202, H, false); // 飛行：有高度、⛔ 沒有 AIRBORNE
    const leaping = shadowAt(7203, H, true); // 跳躍：#247 的那條路

    // ① 飛起來要看得出來 —— 「明顯」寫成「至少縮到落地的四分之三以下」，
    //    ⛔ 不是釘某一個縮放值（那是數字，不是機制）。
    expect(flying.scale).toBeLessThan(grounded.scale * 0.75);
    expect(flying.alpha).toBeLessThan(grounded.alpha);
    // 影子是**位置提示**，⛔ 不可以縮到不見。
    expect(flying.scale).toBeGreaterThan(0);

    // ② 跳躍那條路逐位元不變 —— 同一個高度上，它縮得比飛行少得多。
    expect(leaping.scale).toBeGreaterThan(flying.scale);
    expect(leaping.scale).toBeCloseTo(1 / (1 + H * 0.15), 6);
  });
});
