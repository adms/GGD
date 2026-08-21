/**
 * GH#536 —— 「地板全黑」的守衛。
 *
 * owner 2026-08-22：「福利連地圖地板全黑了」/「大混戰也是 似乎是**讀取不夠快**
 * 並且**沒有提前在商店完成讀取**的緣故」。
 *
 * 承重的那一條線只有一條：**換一張場地不可以把共用的地面貼圖一起銷毀**。
 * `disposeArena` 用 `mesh.dispose(false, **true**)`（第二個參數是
 * `disposeMaterialAndTextures`），所以少了 `detachGroundTextures` 這一步，
 * 快取每一回合都會被清空 —— 而畫面上「看起來」完全正常，只是每一回合換圖時
 * 地板都要重抓一次。⇒ 這一條就是驗它。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { buildArena, disposeArena } from "./ArenaScene";
import { acquireGroundTextures, cachedGroundKeys, warmGroundTextures } from "./groundTextureCache";
import { zoneTextureRadius } from "./ArenaGround";

let engine: NullEngine;
beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => engine.dispose());

const RADIUS = zoneTextureRadius(SKELETON_ARENA.zones[0]!);

describe("groundTextureCache", () => {
  it("⭐ 換場地不會銷毀共用地面貼圖 —— 這是「讀取不夠快」的整條根因", () => {
    const scene = new Scene(engine);
    const warm = acquireGroundTextures(scene, "stone", RADIUS);

    // 一整回合：建場 → 拆場（= GameApp.applyArena 每回合做的事）
    const handles = buildArena(scene, SKELETON_ARENA, "stone");
    disposeArena(scene, handles);

    // ⛔ 這兩條一起才是守衛。只比對 identity 的話,一顆已經被 dispose 的
    //    Texture 物件仍然 `toBe` 它自己 —— 那是「屬性」不是「行為」。
    expect(scene.textures, "拆場地把共用貼圖一起帶走了 ⇒ 下一回合要重抓").toContain(
      warm.albedo,
    );
    expect(acquireGroundTextures(scene, "stone", RADIUS).albedo).toBe(warm.albedo);
    scene.dispose();
  });

  it("商店預熱暖的是**建場會用的那一個鍵**(半徑進鍵,⛔ 不是只有樣式名)", () => {
    const scene = new Scene(engine);
    warmGroundTextures(scene, ["stone"], RADIUS);
    const keysAfterWarm = cachedGroundKeys(scene);
    buildArena(scene, SKELETON_ARENA, "stone");
    // 建場沒有多開一格 ⇒ 預熱那一顆真的被用上了（暖錯半徑的話這裡會變成兩格,
    // 而畫面上跟沒暖完全一樣 —— 第一·五守則「說了但不會發生」）。
    expect(cachedGroundKeys(scene)).toEqual(keysAfterWarm);
    scene.dispose();
  });

  it("每個 Scene 自己一份 —— ⛔ 不可能把 A 場景的貼圖交給 B 場景", () => {
    const a = new Scene(engine);
    const b = new Scene(engine);
    expect(acquireGroundTextures(a, "stone", RADIUS).albedo).not.toBe(
      acquireGroundTextures(b, "stone", RADIUS).albedo,
    );
    a.dispose();
    b.dispose();
  });
});
