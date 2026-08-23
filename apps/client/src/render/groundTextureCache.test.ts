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
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

/**
 * 🖼 GH#561 —— 上限是**後台一格**（`config.vfx-cleanup@1.groundTextureCacheMax`）。
 * 這裡只換掉那一格的讀法，其餘（回收政策、終極壽命…）保留原樣 ——
 * 整份 mock 掉會連帶把 `FireRingFx` 那一族的讀取端一起換成 undefined。
 */
const knob = vi.hoisted(() => ({ cap: 4 }));
vi.mock("../vfx/vfxCleanupPolicy", async (orig) => ({
  ...(await orig<typeof import("../vfx/vfxCleanupPolicy")>()),
  groundTextureCacheMax: (): number => knob.cap,
}));
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

  /**
   * 🖼 GH#561 —— 在此之前這份快取**沒有上限**：8 個回合逐輪換出貨場地量到
   * `scene.textures` 5 → 25，出貨 13 張場地的上界是 52 張常駐（≈73 MB VRAM），
   * 而降級階梯碰不到它。⭐ 兩條斷言各自對應一個真的會咬人的做法：
   * 「只從 Map 拿掉不 dispose」（VRAM 一毛都沒省）與
   * 「預熱把正在用的那一組擠掉」（＝逐位元回到 GH#536 的地板全黑）。
   */
  it("⭐ 超過上限就淘汰最久沒用的那一組，而且是**真的 dispose**（⛔ 不是只從 Map 拿掉）", () => {
    knob.cap = 4;
    const scene = new Scene(engine);
    const base = scene.textures.length;
    for (const s of ["stone", "dirt", "grass", "sand", "wood", "tatami"] as const) {
      acquireGroundTextures(scene, s, RADIUS);
    }
    const keys = cachedGroundKeys(scene);
    expect(keys.length, "快取沒有上限").toBe(4);
    expect(keys.some((k) => k.startsWith("stone@")), "最久沒用的那一組沒有被淘汰").toBe(false);
    expect(keys.some((k) => k.startsWith("tatami@")), "剛用的那一組被淘汰了").toBe(true);
    // ⭐ 承重的那一行：淘汰要 dispose 四張貼圖，否則 `scene.textures` 一格都不會少。
    expect(scene.textures.length - base, "淘汰沒有真的釋放貼圖 ⇒ VRAM 一毛都沒省").toBe(16);
    scene.dispose();
  });

  it("⭐ 預熱吃上限，而且 ⛔ 不會把**正掛在材質上**的那一組擠掉（那是 GH#536 全黑）", () => {
    knob.cap = 4;
    const scene = new Scene(engine);
    const live = acquireGroundTextures(scene, "stone", RADIUS); // 這一場正在用的
    warmGroundTextures(scene, ["dirt", "grass", "sand", "wood", "tatami"], RADIUS);
    expect(cachedGroundKeys(scene).length, "預熱把上限撐破了").toBe(4);
    // 同一顆物件回來 = 它沒有被淘汰過（被淘汰的話這裡會是一顆新建的）
    expect(acquireGroundTextures(scene, "stone", RADIUS).albedo).toBe(live.albedo);
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
