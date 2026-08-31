/**
 * ⭐ owner 2026-08-23（[優先]）：
 * 「**施法範圍預覽可以參考 w3x 的白色魔法陣**，今天有出現在我上傳依文世界終結的
 *  擷圖前幾張還沒施展生效的時候」
 *
 * ⇒ 出貨預設下，吟唱期間那一圈的**填滿**是白的。
 *
 * ⚠️ 第二條才是這支的重點：**外圈仍然是通道色**。#228 的第 4 條（敵／友／自己
 * 一眼分得出來）不可以被白色魔法陣吃掉 —— 兩層一起變白的話，「打向我的 AoE」
 * 和「我自己剛剛瞄的那一發」在畫面上逐位元相同，而那不會有任何測試紅。
 *
 * ⛔ 只測**預設啟動**的那一邊（第〇·六守則）：`telegraphRune: false` 是 rollback，
 * ⛔ 不是一個要保證品質的功能。
 * 讀的是**最終物件**（`mesh.material.emissiveColor`），⛔ 不是建構參數。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Telegraph, telegraphPaletteFor } from "./Telegraph";

let engine: NullEngine;
beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => {
  engine.dispose();
});

const emissive = (m: Mesh): { r: number; g: number; b: number } =>
  (m.material as StandardMaterial).emissiveColor;

describe("預告圈的白色魔法陣 (GH#576 / owner 2026-08-23)", () => {
  it("填滿是白的，而外圈仍然是那條通道自己的顏色", () => {
    const scene = new Scene(engine);
    try {
      const palette = telegraphPaletteFor("enemy");
      const before = scene.meshes.length;
      new Telegraph(scene, 0, 0, 3, 1000, 300, 150, { palette });
      // 建構出兩顆網格：[外圈, 填滿]（`Telegraph` 的建構順序）
      const created = scene.meshes.slice(before) as Mesh[];
      const ring = created.find((m) => m.name === "telegraph-ring")!;
      const fill = created.find((m) => m.name === "telegraph-fill")!;

      // Texture alpha is not the only backdrop guard: even if it is ignored,
      // the carrier is a disc and can never expose a square image card.
      expect(fill.getTotalVertices()).toBeGreaterThan(4);

      const f = emissive(fill);
      expect([f.r, f.g, f.b]).toEqual([1, 1, 1]);

      // ⭐ 承重：外圈**沒有**跟著變白 —— 通道分辨還在。
      const r = emissive(ring);
      expect([r.r, r.g, r.b]).toEqual([...palette.ring]);
    } finally {
      scene.dispose();
    }
  });
});
