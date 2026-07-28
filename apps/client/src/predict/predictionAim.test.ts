/**
 * 客戶端預測餵不餵 aim (task #281).
 *
 * ── 缺陷的形狀 ───────────────────────────────────────────────────────────────
 * `LocalPrediction` 用**出貨的** `orderSystem` + `movementSystem` 重播自己的
 * 英雄,但它記錄的只有 `Order`;`IntentSender` 送出的 `aim` 在
 * `GameApp.sender.onSent` 就被丟掉了(`if (msg.order) recordInput(...)`)。
 * 於是本地那具影子從來不知道玩家在瞄哪裡:面向由**移動方向**決定,直到權威
 * 快照抵達才跳成正確方向 —— #264(出手鎖)與 #275(瞄準優先)兩個面向功能,
 * 對「玩家自己的角色」都遲到一整個 RTT,而那正是玩家唯一在看的角色。
 *
 * ── 這一支怎麼測 ─────────────────────────────────────────────────────────────
 * 跑**完整的預測重播**(stepTick / reconcile),不呼叫單一系統,而且三個候選
 * 方向兩兩不同(瞄北 / 走東 / 鎖南),否則兩種實作會給出一樣的答案(失敗形狀 ④)。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { LocalPrediction } from "./LocalPrediction";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { armFacingLock, FACING_INSTANT_CAST_TICKS } from "@ggd/shared/sim/facingLock";
import { AIM_HOLD_TICKS } from "@ggd/shared/sim/aimHold";
import type { EntityId } from "@ggd/shared/ids";

const ZONE = SKELETON_ARENA.zones[0]!;
const NORTH = { x: 0, z: 1 };
const SOUTH = { x: 0, z: -1 };

function shadow(): { p: LocalPrediction; id: EntityId } {
  const p = new LocalPrediction(SKELETON_ARENA);
  p.spawn({ seatId: 0, pos: { x: ZONE.center.x, z: ZONE.center.z }, zone: 0, moveSpeed: 6 });
  // the shadow holds exactly one entity — the local champion
  const id = [...p.world.transform.keys()][0]!;
  return { p, id };
}

const walkEast = { kind: "move" as const, point: { x: ZONE.center.x + 8, z: ZONE.center.z } };

describe("本地預測的面向 (predict-aim)", () => {
  it("玩家推右類比往北,影子的面向就是北 —— 不是移動方向(東)", () => {
    cover("predict-aim");
    const { p } = shadow();
    p.recordInput(1, walkEast, NORTH);
    p.stepTick();
    const f = p.facing!;
    expect(f.z, "預測的面向被移動方向決定了 —— aim 從來沒進到影子裡").toBeCloseTo(1, 6);
    expect(f.x).toBeCloseTo(0, 6);
    // 而且腳真的往東走(面向與走位解耦,不是靠站著不動才對)
    expect(p.predictedPos!.x).toBeGreaterThan(ZONE.center.x);
  });

  it("出手鎖朝南時,瞄準仍然贏 —— #275 的優先權在影子裡也成立", () => {
    cover("predict-aim");
    const { p, id } = shadow();
    armFacingLock(p.world, id, SOUTH, FACING_INSTANT_CAST_TICKS);
    p.recordInput(1, walkEast, NORTH);
    p.stepTick();
    expect(p.facing!.z, "影子裡瞄準沒有贏過出手鎖").toBeCloseTo(1, 6);
  });

  it("只送 aim、不送 order 的訊息也會被記錄(站定瞄準是最常見的情況)", () => {
    cover("predict-aim");
    const { p, id } = shadow();
    armFacingLock(p.world, id, SOUTH, FACING_INSTANT_CAST_TICKS);
    p.recordInput(1, undefined, NORTH); // 右類比動、左類比沒動
    p.stepTick();
    expect(p.facing!.z, "aim-only 的訊息被整個丟掉了").toBeCloseTo(1, 6);
  });

  it("送出節奏有縫隙時,影子不會每隔一 tick 硬跳回鎖的方向", () => {
    cover("predict-aim");
    const { p, id } = shadow();
    armFacingLock(p.world, id, SOUTH, 60);
    p.recordInput(1, walkEast, NORTH);
    for (let i = 0; i < AIM_HOLD_TICKS; i++) {
      p.stepTick(); // 只有第一 tick 有新訊息,其餘是縫隙
      expect(p.facing!.z, `第 ${i} tick 面向掉回出手鎖方向了`).toBeCloseTo(1, 6);
    }
  });

  /**
   * ⚠️ 稽核補的一條 (verifier)。上面那條只證明「縫隙內沿用」,沒有任何一條證明
   * 「沿用**會到期**」。把 `this.aimHold.drain(this.world.tick)` 改成
   * `drain(0)`(= 常數 tick,違反本 repo「到期一律用絕對 tick 相減」的規矩)
   * 之後,整個 client 套件仍然全綠 —— 而那個實作的行為是:影子的面向**永遠**
   * 卡在最後一次瞄準,伺服器卻在 3 tick 後就交還。玩家看到的是自己的角色和
   * 權威快照對面向長期不同意,每一次 reconcile 都在打架。
   *
   * 三個方向兩兩不同(瞄北 / 走東 / 鎖南),而且斷言的是**交還之後**的方向 ——
   * 「沒有到期」與「到期了」給的答案分別是北和南,分得出來。
   */
  it("沿用有上限:過了 AIM_HOLD_TICKS,影子把面向交還給出手鎖(和伺服器同一個上限)", () => {
    cover("predict-aim");
    const { p, id } = shadow();
    armFacingLock(p.world, id, SOUTH, 600); // 長鎖,確保交還時看得到「南」
    p.recordInput(1, walkEast, NORTH);
    // 第 1 tick 收到瞄準,之後全是縫隙。窗口內(含收到的那一 tick)共 AIM_HOLD_TICKS tick。
    for (let i = 0; i < AIM_HOLD_TICKS; i++) {
      p.stepTick();
      expect(p.facing!.z, `第 ${i} tick 就提早交還了`).toBeCloseTo(1, 6);
    }
    // 再一個 tick —— 窗口到期
    p.stepTick();
    expect(
      p.facing!.z,
      "影子的沿用沒有上限 —— 面向永久卡在最後一次瞄準,伺服器卻早就交還了",
    ).toBeCloseTo(-1, 6);
    // 而且不是靠站著不動:腳一直往東走(面向與走位解耦)
    expect(p.predictedPos!.x).toBeGreaterThan(ZONE.center.x);
  });

  it("reconcile 重播之後,面向仍然是玩家瞄的方向(不是被重播抹掉)", () => {
    cover("predict-aim");
    const { p, id } = shadow();
    armFacingLock(p.world, id, SOUTH, 60);
    p.recordInput(1, walkEast, NORTH);
    p.stepTick();
    const before = p.facing!;
    // 權威快照到了,但只 ack 到 seq 0(這一筆還沒被 ack)→ 整筆重播
    p.reconcile({ x: ZONE.center.x, z: ZONE.center.z }, 0);
    const after = p.facing!;
    expect(after.z, "重播把瞄準吃掉了").toBeCloseTo(before.z, 6);
    expect(after.z).toBeCloseTo(1, 6);
  });

  it("玩家放開類比(送出不帶 aim 的訊息)→ 面向立刻交還給出手鎖", () => {
    cover("predict-aim");
    const { p, id } = shadow();
    armFacingLock(p.world, id, SOUTH, 60);
    p.recordInput(1, walkEast, NORTH);
    p.stepTick();
    expect(p.facing!.z).toBeCloseTo(1, 6);
    p.recordInput(2, walkEast); // 還在走,但不再瞄
    p.stepTick();
    expect(p.facing!.z, "放手之後面向沒有交還").toBeCloseTo(-1, 6);
  });
});
