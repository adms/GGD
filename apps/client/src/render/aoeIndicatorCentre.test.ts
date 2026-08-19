/**
 * GH#415 —— **AoE 指示圈的圓心是落點，⛔ 不是施法者。**
 *
 * owner 2026-08-19：
 * > 「技能**範圍指示**應該是在**我的滑鼠上**，⛔ 不是以英雄自身座標為圓心來顯示
 * >  （**技能施展距離**才是）」
 *
 * 在此之前兩個圈共用一個圓心（`AimIndicator` 的 `at`），所以玩家腳下有一個大圈，
 * 而真正會被炸到的是滑鼠那一圈。⚠️ 那**比沒有指引更糟**：一個位置錯誤的圈，
 * 玩家會照著它站位。
 *
 * ⛔ 這裡跑的是**真的解析**（`resolveAoeCenter` + 真的 Babylon mesh 的
 * `position`），⛔ 不掃字串（失敗形態⑥），也⛔ 不對「有沒有傳參數」下斷言 ——
 * 要讀的是**最終物件**（第二守則：斷言要讀最終物件）。
 *
 * 突變紀錄（2026-08-19）：
 *   · `AimIndicator.update` 把 `aoeAt` 換回 `at`（＝改壞前的行為）
 *     → 「ground：圓心在落點」與「夾在射程邊緣」兩條同時紅 ✅
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AimIndicator } from "./AimIndicator";
import { resolveAoeCenter } from "../input/AimResolver";

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

const meshAt = (name: string) => {
  const m = scene.meshes.find((x) => x.name === name);
  expect(m, `找不到 ${name} —— 這條斷言在測空氣`).toBeDefined();
  return { x: m!.position.x, z: m!.position.z, on: m!.isEnabled() };
};

const SELF = { x: 0, z: 0 };

describe("resolveAoeCenter —— 落點就是伺服器會收到的那個點", () => {
  it("⭐ ground：圓心跟著滑鼠，⛔ 不是施法者", () => {
    const c = resolveAoeCenter(
      { castType: "ground", range: 10 },
      { selfPos: SELF, cursorGround: { x: 4, z: 3 } }, // 距離 5，射程內
    );
    expect(c).toEqual({ x: 4, z: 3 });
  });

  it("⭐ ground：滑鼠拉到射程外 → 圓心被**夾**回射程邊緣（否則圈又在說謊）", () => {
    const range = 10;
    const c = resolveAoeCenter(
      { castType: "ground", range },
      { selfPos: SELF, cursorGround: { x: 40, z: 30 } }, // 距離 50
    )!;
    expect(Math.hypot(c.x - SELF.x, c.z - SELF.z)).toBeCloseTo(range, 6);
    // 方向不變 —— 夾的是長度，⛔ 不是把它挪到別的方位
    expect(c.x / c.z).toBeCloseTo(40 / 30, 6);
  });

  it("targeted：圓心在**目標身上**；查不到目標位置就不畫（⛔ 不退回施法者）", () => {
    const ctx = { selfPos: SELF, cursorGround: { x: 9, z: 0 }, hoveredEntityId: 7 };
    expect(resolveAoeCenter({ castType: "targeted", range: 10 }, ctx, () => ({ x: 9, z: 1 }))).toEqual({ x: 9, z: 1 });
    expect(resolveAoeCenter({ castType: "targeted", range: 10 }, ctx, () => null)).toBeNull();
  });

  it("self：圓心在英雄腳下（今天是對的，⛔ 不要改）／skillshot：走廊不是圓 → null", () => {
    const ctx = { selfPos: { x: 2, z: 2 }, cursorGround: { x: 9, z: 0 } };
    expect(resolveAoeCenter({ castType: "self", range: 0 }, ctx)).toEqual({ x: 2, z: 2 });
    expect(resolveAoeCenter({ castType: "skillshot", range: 10 }, ctx)).toBeNull();
  });
});

describe("AimIndicator —— 兩個圈，兩個圓心（讀真的 mesh）", () => {
  it("⭐ 施法距離圈在施法者、AoE 圈在落點 —— 同一幀兩個不同的位置", () => {
    new AimIndicator(scene).update({
      kind: "range",
      x: 1,
      z: 1,
      range: 8,
      radius: 3,
      aoeX: 5,
      aoeZ: 4,
    });
    // 施法距離：我能打多遠 → 以我為圓心
    expect(meshAt("aim-range-fill")).toMatchObject({ x: 1, z: 1, on: true });
    // AoE：這一發會炸到哪 → 以落點為圓心
    expect(meshAt("aim-aoe-fill")).toMatchObject({ x: 5, z: 4, on: true });
  });

  it("⭐ 沒有落點（走廊／沒目標）→ AoE 圈**不畫**，⛔ 不退回畫在施法者腳下", () => {
    new AimIndicator(scene).update({
      kind: "range",
      x: 1,
      z: 1,
      range: 8,
      radius: 3,
      aoeX: null,
      aoeZ: null,
    });
    expect(meshAt("aim-range-fill").on).toBe(true);
    const aoe = scene.meshes.find((m) => m.name === "aim-aoe-fill");
    expect(aoe === undefined || !aoe.isEnabled(), "沒有落點卻畫了 AoE 圈").toBe(true);
  });
});
