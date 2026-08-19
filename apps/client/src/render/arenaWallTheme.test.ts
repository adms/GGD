/**
 * 場地外觀的兩道閘 —— GH#345（牆跟著場地主題走）與 GH#363（中央破圖閃爍）。
 *
 * ⛔ 兩條都**不斷言色碼／高度的字面值**（第二守則：驗機制不驗數字）：顏色從
 * `GROUND_STYLE_WALL_TINT` 推導、高度從 `FLOOR_TOP_Y` 推導。
 * 突變紀錄（2026-08-20）：`buildArena` 把 `obstacleMat.diffuseColor` 改回寫死的
 * `new Color3(0.42, 0.4, 0.45)`（＝ GH#345 修好之前那一行）→ 三條 #345 全紅 ✅
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaScenery } from "@ggd/shared/content";
import { hexToRgb01 } from "@ggd/shared/content";
import { GROUND_STYLE_WALL_TINT } from "@ggd/shared/content/schema/groundStyle";
import { buildArena } from "./ArenaScene";
import { FLOOR_TOP_Y } from "./ArenaGround";

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const arena = (bounds?: ArenaDef["zones"][number]["bounds"]): ArenaDef => ({
  id: "arena.test",
  name: "test",
  zones: [
    {
      id: "z0",
      center: { x: 0, z: 0 },
      boundaryRadius: 24,
      bounds,
      // graybox 的牆 —— 這一件就是 owner 說的「水泥灰盒」
      obstacles: [{ kind: "box", center: { x: 4, z: 0 }, halfW: 2, halfD: 1 }],
      spawns: [[{ x: -3, z: 0 }], [{ x: 3, z: 0 }]],
    },
  ],
});

/** 讀**最終物件** —— 場上真的長出來的那顆材質，⛔ 不是「有沒有傳參數」。 */
const wallRgb = (): { r: number; g: number; b: number } => {
  const m = scene.materials.find((x) => x.name === "zone-0-obstacle-mat") as StandardMaterial;
  expect(m, "找不到障礙材質 —— 這條斷言在測空氣").toBeDefined();
  return { r: m.diffuseColor.r, g: m.diffuseColor.g, b: m.diffuseColor.b };
};

describe("GH#345 —— 牆的顏色跟著場地走", () => {
  it("⭐ 沒宣告 palette 時牆色從那張表讀，換材質就真的換色（⛔ 不是寫死的水泥灰）", () => {
    buildArena(scene, arena(), "tatami");
    expect(wallRgb()).toEqual(hexToRgb01(GROUND_STYLE_WALL_TINT.tatami));
    scene.dispose();
    scene = new Scene(engine);
    buildArena(scene, arena(), "obsidian");
    expect(wallRgb()).toEqual(hexToRgb01(GROUND_STYLE_WALL_TINT.obsidian));
    expect(wallRgb()).not.toEqual(hexToRgb01(GROUND_STYLE_WALL_TINT.tatami));
  });

  it("⭐ 場地自己宣告的 palette.wall 贏過那張表（第〇·六：作者的設計 > 引擎的推導）", () => {
    const scenery = { palette: { floor: "#112233", wall: "#8e1b2e" } } as unknown as ArenaScenery;
    buildArena(scene, arena(), "tatami", scenery);
    expect(wallRgb()).toEqual(hexToRgb01("#8e1b2e"));
  });
});

it("GH#363 ⭐ 矩形地板頂面沉在 y=0 底下，和圓盤地板同一個常數", () => {
  // 場上真的鋪了頂面切在 local y=0 的地面道具（hex_grass.glb 的 max.y === 0）：
  // 地板停在正好 0 = 逐位元共面 = owner 看到的那片閃爍鋸齒。
  buildArena(scene, arena({ kind: "rect", halfW: 24, halfD: 18 }), "grass");
  const floor = scene.meshes.find((m) => m.name === "zone-0-floor");
  expect(floor, "找不到矩形地板").toBeDefined();
  expect(floor!.position.y).toBe(FLOOR_TOP_Y);
  expect(floor!.position.y).toBeLessThan(0);
});
