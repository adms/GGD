/**
 * 站定出手時自己英雄的面向 (GH#281, owner 2026-08-03「走路面向都是正確的但是
 * 攻擊面向卻是錯誤的」).
 *
 * ── 缺陷的形狀 ───────────────────────────────────────────────────────────────
 * 自己的英雄不是由伺服器畫的：`GameApp.poseFor` 對 `predictedEntityId` 直接回
 * `LocalPrediction.renderPose()`，把權威快照的 `fx/fz` 整組丟掉。而那具影子只
 * 重播 `orderSystem` + `movementSystem`，站定時走 `!moved` 分支，那裡只認
 * `aimTick` / 面向鎖 / `nav.attackTarget` —— **影子裡三個都沒有**（敵人不在影子
 * 世界，`orderSystem` 因此每一 tick 把 `attackTarget` 清成 null）。
 *
 * 於是站定出手的每一 tick **沒有任何一行程式寫 facing**，身體凍在最後一次走路
 * 的方向。走路對，是因為走路是影子唯一會寫 facing 的地方。
 *
 * ── 這一支怎麼測（避開失敗形態 ③④⑤⑥⑦）─────────────────────────────────────
 * · 跑**完整的預測重播**（`recordInput` / `stepTick` / `reconcile`），不呼叫
 *   單一系統，也不手寫 `t.facing`；
 * · 斷言 **`renderPose()` 回傳的 `fx/fz`** —— 那是 `GameApp` 真的交給
 *   `views.sync` 的那個物件，不是中間的 `t.facing`（讀最終物件）；
 * · 三個方向兩兩不同（**走東 / 目標在西（正後方）/ 權威朝北**），所以「有轉」與
 *   「沒轉」、「用預測」與「用權威」都分得出來；
 * · 斷言的是**畫面上的面向指向目標**（行為），不是「有沒有呼叫某個函式」。
 *
 * ⚠️ 隔壁的 `predictionAim.test.ts` 對這個缺陷是**盲的**：它每一條都自己
 * `armFacingLock(p.world, id, …)` 手動上鎖，也就是自己補上了出貨路徑上永遠不會
 * 存在的東西（失敗形態 ⑤：被測的不是出貨的那個）。那 7 條全綠而玩家的角色
 * 站著揮劍不轉身。
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { LocalPrediction } from "./LocalPrediction";
import { applyCombatFeelDoc, localFacingMode, resetLocalFacingMode } from "./localFacingMode";
import { localRenderPose } from "./localRenderPose";
import type { RenderPose } from "./LocalPrediction";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import {
  DEFAULT_LOCAL_FACING_MODE,
  facingModePredictsLocally,
  facingModeSnapsFromAuthority,
  parseLocalFacingMode,
} from "@ggd/shared/sim/facingLock";

const ZONE = SKELETON_ARENA.zones[0]!;
const C = { x: ZONE.center.x, z: ZONE.center.z };
/** 走位方向：東。影子唯一會自己寫 facing 的方向。 */
const walkEast = { kind: "move" as const, point: { x: C.x + 8, z: C.z } };
/** 交戰對象：正後方（西）。和走位方向差 180°，和權威方向差 90°。 */
const TARGET_WEST = { x: C.x - 10, z: C.z };
/** 權威快照的面向：北。三個方向兩兩不同。 */
const AUTH_NORTH = { x: 0, z: 1 };

function shadow(): LocalPrediction {
  const p = new LocalPrediction(SKELETON_ARENA);
  p.spawn({ seatId: 0, pos: { x: C.x, z: C.z }, zone: 0, moveSpeed: 6 });
  return p;
}

/** 走幾 tick 東邊，讓身體確實面向東（= 缺陷狀態下它會卡住的那個方向）。 */
function walkEastThenStop(p: LocalPrediction): void {
  p.recordInput(1, walkEast);
  for (let i = 0; i < 6; i++) p.stepTick();
  const f = p.renderPose(0)!;
  expect(f.fx, "前置條件壞了：走東之後身體不是朝東").toBeCloseTo(1, 3);
  p.recordInput(2, { kind: "stop" });
  p.stepTick();
}

afterEach(() => resetLocalFacingMode());

describe("站定出手的面向 (#281)", () => {
  it("(b) 站定 + 目標在正後方 → 畫面上的面向真的轉過去（不是凍在走路方向）", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    // 交戰對象在西邊 —— GameApp 每幀從權威快照餵進來的那一筆。
    p.setCombatFacingTarget(TARGET_WEST);
    for (let i = 0; i < 30; i++) p.stepTick();
    const pose = p.renderPose(0)!;
    expect(
      pose.fx,
      "站定出手時沒有任何一行寫 facing —— 身體凍在最後一次走路的方向(東)",
    ).toBeLessThan(-0.99);
    expect(pose.fz).toBeCloseTo(0, 2);
    // 而且腳沒有跟著跑過去：轉的是身體，不是位置（走位與面向解耦）。
    expect(p.predictedPos!.x).toBeGreaterThan(C.x);
  });

  it("(b) 走路中不接手 —— 移動方向仍然贏過交戰對象（owner:「走路面向都是正確的」）", () => {
    cover("predict-attack-facing");
    const p = shadow();
    // 一邊往東走，一邊有個在西邊的交戰對象。伺服器在這個情況面向移動方向。
    p.setCombatFacingTarget(TARGET_WEST);
    p.recordInput(1, walkEast);
    for (let i = 0; i < 12; i++) p.stepTick();
    expect(
      p.renderPose(0)!.fx,
      "走路中被交戰對象搶走面向了 —— 那會讓角色倒著走",
    ).toBeCloseTo(1, 3);
  });

  it("(b) 瞄準優先 —— 玩家推右類比時，交戰對象不得把身體轉回去 (#275)", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    p.setCombatFacingTarget(TARGET_WEST);
    // 站定 + 每一 tick 都在瞄北
    for (let i = 0; i < 10; i++) {
      p.recordInput(10 + i, undefined, AUTH_NORTH);
      p.stepTick();
    }
    const pose = p.renderPose(0)!;
    expect(pose.fz, "瞄準沒有贏過交戰對象 —— #275 的優先權在影子裡破了").toBeCloseTo(1, 6);
    expect(pose.fx).toBeCloseTo(0, 6);
  });

  it("(a) 校正 —— reconcile 把權威面向 snap 進來（在此之前 fx/fz 連取樣都沒有）", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    expect(p.renderPose(0)!.fx).toBeCloseTo(1, 3);
    p.reconcile({ x: C.x, z: C.z }, 2, AUTH_NORTH);
    const pose = p.renderPose(0)!;
    expect(pose.fz, "權威面向沒有進到影子裡 —— 自己的英雄永遠看不到伺服器的面向").toBeCloseTo(
      1,
      6,
    );
    expect(pose.fx).toBeCloseTo(0, 6);
  });

  it("(a) 不帶權威面向的 reconcile 不碰面向（`predicted` 模式那一側）", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    p.reconcile({ x: C.x, z: C.z }, 2);
    expect(p.renderPose(0)!.fx, "沒交面向卻被改掉了").toBeCloseTo(1, 3);
  });

  it("(a) 退化的權威面向 (0,0) 不得寫進去 —— 一次會讓下一 tick 硬切而不是轉", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    p.reconcile({ x: C.x, z: C.z }, 2, { x: 0, z: 0 });
    const pose = p.renderPose(0)!;
    expect(pose.fx * pose.fx + pose.fz * pose.fz, "面向被寫成零向量了").toBeCloseTo(1, 6);
  });

  it("(a)+(b) 一起：權威 snap 之後，影子繼續朝交戰對象轉（hybrid 的定義）", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    p.setCombatFacingTarget(TARGET_WEST);
    // 權威說「北」（伺服器還在轉的半路上），影子接著自己轉完剩下的 90° 到西。
    p.reconcile({ x: C.x, z: C.z }, 2, AUTH_NORTH);
    expect(p.renderPose(0)!.fz).toBeCloseTo(1, 6);
    for (let i = 0; i < 30; i++) p.stepTick();
    expect(
      p.renderPose(0)!.fx,
      "snap 之後影子就不動了 —— hybrid 退化成純 (a)，每次轉身晚一趟 RTT",
    ).toBeLessThan(-0.99);
  });

  it("目標清成 null → 立刻交還（不會一直朝著一具消失的屍體）", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    p.setCombatFacingTarget(TARGET_WEST);
    for (let i = 0; i < 30; i++) p.stepTick();
    expect(p.renderPose(0)!.fx).toBeLessThan(-0.99);
    p.setCombatFacingTarget(null);
    // 目標沒了 → 站定時不再有人寫 facing，身體就留在原地（不是抽回東邊）
    for (let i = 0; i < 10; i++) p.stepTick();
    expect(p.renderPose(0)!.fx, "交還之後面向自己亂跑了").toBeLessThan(-0.99);
  });

  it("teleport（回合重置）也吃權威面向，而且會忘掉上一場的交戰對象", () => {
    cover("predict-attack-facing");
    const p = shadow();
    walkEastThenStop(p);
    p.setCombatFacingTarget(TARGET_WEST);
    p.teleport({ x: C.x + 3, z: C.z + 3 }, 0, AUTH_NORTH);
    expect(p.renderPose(0)!.fz, "teleport 沒有吃權威面向").toBeCloseTo(1, 6);
    // 上一場的目標必須被忘掉，否則新回合一開始身體就朝著上一場的敵人
    for (let i = 0; i < 20; i++) p.stepTick();
    expect(p.renderPose(0)!.fz, "teleport 沒有清掉上一場的交戰對象").toBeCloseTo(1, 6);
  });
});

describe("決策點 config.combat-feel@1 facing.localMode (#281)", () => {
  it("出貨值是 hybrid —— owner 2026-08-03「(a) 與 (b) 兩個都做」", () => {
    cover("predict-attack-facing");
    expect(DEFAULT_LOCAL_FACING_MODE).toBe("hybrid");
    expect(localFacingMode()).toBe("hybrid");
  });

  it("三個模式各自開/關的是不同的那一半（不是三個同義詞）", () => {
    cover("predict-attack-facing");
    expect(facingModeSnapsFromAuthority("predicted")).toBe(false);
    expect(facingModePredictsLocally("predicted")).toBe(true);
    expect(facingModeSnapsFromAuthority("authoritative")).toBe(true);
    expect(facingModePredictsLocally("authoritative")).toBe(false);
    expect(facingModeSnapsFromAuthority("hybrid")).toBe(true);
    expect(facingModePredictsLocally("hybrid")).toBe(true);
  });

  it("後台把它調成 authoritative，client 的現值就真的變了", () => {
    cover("predict-attack-facing");
    applyCombatFeelDoc({
      id: "combat-feel",
      schema: "config.combat-feel@1",
      facing: { followThroughTicks: 3, instantCastTicks: 6, localMode: "authoritative" },
    });
    expect(localFacingMode()).toBe("authoritative");
  });

  /**
   * ⚠️ 這一組守的是 `GameApp.poseFor` 那一行 —— 它原本是 inline 分支，而 GameApp
   * 要整套 Babylon 才起得來，所以那個分支刪掉全套測試照樣全綠（失敗形態 ③）。
   * 三個值兩兩不同（預測位置 / 預測面向東 / 權威面向北）才分得出誰贏。
   */
  it("authoritative：位置仍走預測，面向整個交給伺服器", () => {
    cover("predict-attack-facing");
    const predicted: RenderPose = { x: 5, z: -3, fx: 1, fz: 0 };
    const out: RenderPose = { x: 0, z: 0, fx: 0, fz: 0 };
    const r = localRenderPose("authoritative", predicted, { fx: 0, fz: 1 }, out);
    expect(r.fz, "面向沒有交給伺服器").toBeCloseTo(1, 6);
    expect(r.fx).toBeCloseTo(0, 6);
    expect(r.x, "位置被交回權威了 —— 那會把 #43 的 judder 放回來").toBe(5);
    expect(r.z).toBe(-3);
  });

  it("hybrid / predicted：面向用影子的，權威的 fx/fz 不得蓋過去", () => {
    cover("predict-attack-facing");
    const predicted: RenderPose = { x: 5, z: -3, fx: 1, fz: 0 };
    const out: RenderPose = { x: 0, z: 0, fx: 0, fz: 0 };
    for (const mode of ["hybrid", "predicted"] as const) {
      const r = localRenderPose(mode, predicted, { fx: 0, fz: 1 }, out);
      expect(r.fx, `${mode} 的面向被權威直接蓋掉 —— 那就退化成 authoritative 了`).toBeCloseTo(
        1,
        6,
      );
    }
  });

  it("authoritative + 退化的權威面向 (0,0) → 留著預測的，不畫一個零向量", () => {
    cover("predict-attack-facing");
    const predicted: RenderPose = { x: 5, z: -3, fx: 1, fz: 0 };
    const out: RenderPose = { x: 0, z: 0, fx: 0, fz: 0 };
    const r = localRenderPose("authoritative", predicted, { fx: 0, fz: 0 }, out);
    expect(r.fx * r.fx + r.fz * r.fz, "面向被寫成零向量了").toBeCloseTo(1, 6);
  });

  it("缺文件 / 缺欄位 / 打錯字都退回出貨預設（打錯字那一種會叫一聲）", () => {
    cover("predict-attack-facing");
    applyCombatFeelDoc(undefined);
    expect(localFacingMode()).toBe("hybrid");
    applyCombatFeelDoc({ id: "combat-feel", schema: "config.combat-feel@1" });
    expect(localFacingMode()).toBe("hybrid");
    expect(parseLocalFacingMode("predicted")).toBe("predicted");
    expect(parseLocalFacingMode("HYBRID")).toBe("hybrid");
    expect(parseLocalFacingMode(7)).toBe("hybrid");
  });
});
