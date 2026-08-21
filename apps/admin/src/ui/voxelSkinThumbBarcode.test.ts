/**
 * GH#96 —— 條碼**真的走到畫筆**（承重的那一條）。
 *
 * 這一頁的用途就是「給 owner 看出貨的像素」，所以 `composeThumb` 少傳第二個參數
 * 的後果不是空白，是**一張看起來完全正常、但畫的是 L3 產生器猜測**的人偶 ——
 * 而遊戲裡（條碼串進去之後）畫的是 L0 條碼。兩張圖不一樣，畫面上分不出來。
 *
 * ⭐ 基準線由**出貨的畫筆自己**算出來（`composeThumb(recipe)`），⛔ 沒有抄任何
 * 一個像素字面值 —— 條碼或畫筆的細節改了，這條不會用錯誤的訊息紅。
 *
 * ── 突變（做過）────────────────────────────────────────────────────────────
 * `composeThumb` 把 `paintVoxelAtlas(recipe, barcode ?? null)` 改回
 * `paintVoxelAtlas(recipe)` → 紅，訊息就是「條碼沒有改變任何一個 texel」。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { generateVoxelSkin } from "@ggd/shared/content/voxelSkin";
import type { VoxelBarcode, VoxelSkinInput } from "@ggd/shared/content/voxelSkin";
import { composeThumb } from "./voxelSkinThumb";

const INPUT: VoxelSkinInput = {
  id: "godie-bc003",
  name: "測試稱號 - 測試本名",
  attackType: "melee",
  modelKey: "champ.sela",
  tags: ["melee"],
  vfxKeys: [],
};

/** 香吉士 種子條碼的形狀（content/models/_voxel-barcodes.json）—— 五個槽。 */
const BARCODE: VoxelBarcode = {
  v: 1,
  championId: "godie-bc003",
  bands: {
    hair: { hex: "#F2E205", frac: 0.2 },
    hatBand: null,
    hatBrim: null,
    face: { hex: "#F5CBA0", frac: 0.14 },
    collar: null,
    chestTrim: null,
    top: { hex: "#0D0D0D", frac: 0.26 },
    waist: null,
    pants: { hex: "#0D0D0D", frac: 0.32 },
    shin: null,
    shoe: { hex: "#000000", frac: 0.08 },
  },
  sleeve: "long",
  faceColors: { eye: "#1A1A1A", nose: null, mouth: "#B5705C" },
  source: "manual",
};

describe("對照表跟遊戲吃同一份條碼 (GH#96)", () => {
  it("⭐ 帶條碼與不帶條碼畫出來的不是同一張人偶", () => {
    cover("voxel-skin-sheet");
    const recipe = generateVoxelSkin(INPUT);
    const plain = Array.from(composeThumb(recipe));
    const barcoded = Array.from(composeThumb(recipe, BARCODE));
    expect(barcoded, "條碼沒有改變任何一個 texel — 它根本沒走到畫筆").not.toEqual(plain);
  });

  it("沒有條碼的角色行為完全不變（L3 產生器仍是 w3x 原創單位的答案）", () => {
    cover("voxel-skin-sheet");
    const recipe = generateVoxelSkin(INPUT);
    expect(Array.from(composeThumb(recipe, null))).toEqual(Array.from(composeThumb(recipe)));
  });
});
