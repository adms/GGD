/**
 * GH#96 —— L0 條碼在**執行期**的入口（姊妹條的那一半）。
 *
 * 在此之前 `paintVoxelAtlas(recipe, barcode)` 的第二個參數在整個遊戲裡只有離線
 * 烘焙工具傳過（`tools/voxel-gen/build.ts`），client 與後台對照表兩條路都是單參數
 * —— 所以「條碼是角色的特徵主視覺」在畫面上從來沒有成立過。
 *
 * ⚠️ 這裡收的是這條路**獨有**的那一半：**快取分得開有／沒有條碼**。舊鍵只有
 * championId，於是先到的那一張圖會被永遠餵給後面每一個 view —— 失敗形態⑤（被
 * 畫出來的不是出貨的那個），而且畫面上就是一隻上了色的英雄，只是上錯了色。
 *
 * ⛔ 「條碼有沒有走到畫筆」**不在這裡重寫一遍**（第零守則⛔③：小項目不各自寫一
 * 條）—— 那一行在兩條路上是同一個形狀，而它在後台那一條是**純位元組**、驗起來
 * 便宜得多：`apps/admin/src/ui/voxelSkinThumbBarcode.test.ts`。
 *
 * ── 突變 ────────────────────────────────────────────────────────────────
 * 這一批的突變做在**承重的那一條**（後台那支的 `composeThumb`，見它的檔頭）。
 * 這裡的斷言本身就是突變等價的：`voxelSkinCacheKey` 只要忽略 barcode，
 * `expect(withBarcode).not.toBe(plain)` 立刻紅 —— 沒有第二種寫法能同時通過。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { generateVoxelSkin } from "@ggd/shared/content/voxelSkin";
import type { VoxelBarcode, VoxelSkinInput } from "@ggd/shared/content/voxelSkin";
import {
  acquireVoxelSkinTexture,
  releaseVoxelSkinTexture,
  voxelSkinCacheKey,
  voxelSkinTextureRefs,
} from "./voxelSkinTexture";

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

const INPUT: VoxelSkinInput = {
  id: "godie-bc001",
  name: "測試稱號 - 測試本名",
  attackType: "melee",
  modelKey: "champ.sela",
  tags: ["melee"],
  vfxKeys: [],
};

/**
 * 一份最小合法條碼。⭐ 這一條驗的是**快取鍵**，所以帶幾條色帶不重要 ——
 * 像素長什麼樣由後台那支（voxelSkinThumbBarcode.test.ts）與 shared 的
 * paintBarcode 測試收，⛔ 不在這裡重寫第三遍。
 */
const BARCODE: VoxelBarcode = {
  v: 1,
  championId: "godie-bc002",
  bands: {
    hair: { hex: "#F2E205", frac: 0.2 },
    hatBand: null,
    hatBrim: null,
    face: { hex: "#F5CBA0", frac: 0.2 },
    collar: null,
    chestTrim: null,
    top: { hex: "#0D0D0D", frac: 0.3 },
    waist: null,
    pants: { hex: "#0D0D0D", frac: 0.3 },
    shin: null,
    shoe: null,
  },
  sleeve: "long",
  faceColors: { eye: "#1A1A1A", nose: null, mouth: "#B5705C" },
  source: "manual",
};

describe("執行期真的吃得到 L0 條碼 (GH#96)", () => {
  it("⭐ 快取分得開：帶條碼取到的材質不是沒帶條碼那一張，兩者各自計數", () => {
    cover("voxel-skin-texture-cache");
    const recipe = generateVoxelSkin({ ...INPUT, id: "godie-bc002" });
    const bc = { ...BARCODE, championId: "godie-bc002" };
    const plain = acquireVoxelSkinTexture(scene, recipe);
    const withBarcode = acquireVoxelSkinTexture(scene, recipe, bc);
    expect(plain).not.toBeNull();
    expect(withBarcode, "條碼版被舊鍵餵回了無條碼那一張").not.toBe(plain);
    expect(voxelSkinCacheKey(recipe.championId)).not.toBe(voxelSkinCacheKey(recipe.championId, bc));
    // 釋放要對得上自己那一格，⛔ 不可以誤殺另一格
    releaseVoxelSkinTexture(scene, recipe.championId, bc);
    expect(voxelSkinTextureRefs(scene, recipe.championId, bc)).toBe(0);
    expect(voxelSkinTextureRefs(scene, recipe.championId)).toBe(1);
    releaseVoxelSkinTexture(scene, recipe.championId);
    expect(voxelSkinTextureRefs(scene, recipe.championId)).toBe(0);
  });
});
