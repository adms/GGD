/**
 * 瞄準連續性 —— 網路訊息節奏 → IntentFrame → **完整的 world.step()** (task #280).
 *
 * ── 缺陷的形狀 ───────────────────────────────────────────────────────────────
 * `MovementSystem` 用 `world.aimTick.get(id) === world.tick` 判斷「這一 tick
 * 玩家正在瞄」。這個等式假設每一 tick 都有一筆帶 aim 的訊息;但 `IntentSender`
 * 是 30Hz 合併送出、sim 也是 30Hz,兩個 30Hz 只要相位一漂就會出現「這一 tick
 * 兩筆、下一 tick 零筆」。零筆的那一 tick 面向落回 #264 的面向鎖方向,下一
 * tick 又跳回瞄準方向 —— 在鎖的 6 tick 窗口裡身體每隔一 tick 硬跳一次。
 *
 * ── 為什麼這一支在 game-server 而不是在 sim ────────────────────────────────
 * 「這一 tick 沒有訊息」和「這一 tick 的訊息說我放手了」在 sim 內部長得**一模
 * 一樣**(兩者都是 `frame.aim === undefined`)。分得出來的只有輸入邊界,也就是
 * `InputMailbox`。所以受測的是出貨的那條鏈:mailbox → HumanDriver → world.step,
 * 不是任何一段的替身(失敗形狀 ⑤)。
 *
 * ⚠️ 每一條的三個候選方向都**兩兩不同**(瞄北 / 鎖東 / 走南),否則兩種實作
 * 會給出一樣的答案(失敗形狀 ④ —— #275 剛被這個咬過)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { armFacingLock, FACING_INSTANT_CAST_TICKS } from "@ggd/shared/sim/facingLock";
import { AIM_HOLD_TICKS } from "@ggd/shared/sim/aimHold";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import { InputMailbox } from "./InputMailbox";
import { HumanDriver } from "./HumanDriver";

beforeAll(() => registerSkeletonContent());

const ZONE = SKELETON_ARENA.zones[0]!;
const NORTH = { x: 0, z: 1 };
const EAST = { x: 1, z: 0 };

interface Rig {
  w: SimWorld;
  id: EntityId;
  seat: SeatId;
  mailbox: InputMailbox;
  /** deliver ONE network message without advancing the tick (seq-ordered) */
  send: (msg: { order?: IntentFrame["order"]; aim?: { x: number; z: number }; commands?: unknown[] }) => void;
  /** advance one sim tick, optionally delivering ONE network message first */
  tick: (msg?: { order?: IntentFrame["order"]; aim?: { x: number; z: number } }) => void;
  facing: () => { x: number; z: number };
}

function rig(): Rig {
  const w = new SimWorld(SKELETON_ARENA, 11);
  const seat = asSeatId(0);
  const id = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: seat,
    teamId: asTeamId(1),
    pos: { x: ZONE.center.x, z: ZONE.center.z },
    zone: 0,
  });
  const driver = new HumanDriver();
  let seq = 0;
  return {
    w,
    id,
    seat,
    mailbox: driver.mailbox,
    send(msg) {
      // ONE shared seq counter: the mailbox drops out-of-order seqs, so a test
      // that pushed by hand with its own numbering would silently lose messages.
      driver.mailbox.push({
        seq: ++seq,
        order: msg.order,
        aim: msg.aim,
        commands: msg.commands as never,
      });
    },
    tick(msg) {
      if (msg) driver.mailbox.push({ seq: ++seq, order: msg.order, aim: msg.aim });
      const frame = driver.produceIntent(
        undefined as never,
        w,
        w.tick,
      );
      w.step(new Map([[seat, frame]]));
    },
    facing: () => {
      const f = w.transform.get(id)!.facing;
      return { x: f.x, z: f.z };
    },
  };
}

/** A move order pulling the body SOUTH — a third, distinct candidate direction. */
const walkSouth = { kind: "move" as const, point: { x: ZONE.center.x, z: ZONE.center.z - 8 } };

describe("面向在鎖窗口內不會每隔一 tick 硬跳 (aim-continuity)", () => {
  it("訊息只在偶數 tick 到:面向整段維持北,不會在北/東之間來回", () => {
    cover("aim-continuity");
    const r = rig();
    // 出手 commit 朝東(#264 的鎖,瞬發技長度 6 tick)
    armFacingLock(r.w, r.id, EAST, FACING_INSTANT_CAST_TICKS);

    const seen: number[] = [];
    // 30Hz 送 / 30Hz 跑,相位漂了 → 一半的 tick 收不到訊息
    for (let i = 0; i < 6; i++) {
      r.tick(i % 2 === 0 ? { order: walkSouth, aim: NORTH } : undefined);
      seen.push(r.facing().z);
    }
    for (let i = 0; i < seen.length; i++) {
      expect(seen[i], `tick ${i} 面向掉回面向鎖方向了 —— 這就是硬跳`).toBeCloseTo(1, 6);
    }
    // 而且腳真的在走(面向與走位解耦,不是靠站著不動才對)
    expect(r.w.transform.get(r.id)!.pos.z).toBeLessThan(ZONE.center.z);
  });

  it("完全靜默的 tick 沿用瞄準,但**有上限** —— 過了就把面向還給面向鎖", () => {
    cover("aim-continuity");
    const r = rig();
    armFacingLock(r.w, r.id, EAST, 60); // 長鎖,確保交還時看得到「東」
    r.tick({ aim: NORTH });
    expect(r.facing().z).toBeCloseTo(1, 6);
    // 靜默 AIM_HOLD_TICKS-1 個 tick:還在沿用
    for (let i = 0; i < AIM_HOLD_TICKS - 1; i++) r.tick();
    expect(r.facing().z, "沿用窗口內就交還了").toBeCloseTo(1, 6);
    // 再靜默一個 tick:窗口到期,面向鎖拿回控制權
    r.tick();
    expect(r.facing().x, "沿用沒有上限 —— 面向會被永久卡在最後一次瞄準").toBeCloseTo(1, 6);
  });

  it("收到一筆**沒有 aim** 的訊息 = 放開類比 → 立刻交還,不等窗口", () => {
    cover("aim-continuity");
    const r = rig();
    armFacingLock(r.w, r.id, EAST, 60);
    r.tick({ order: walkSouth, aim: NORTH });
    expect(r.facing().z).toBeCloseTo(1, 6);
    // 下一 tick 有訊息(還在走路)但不帶 aim —— 這是「手放開了」
    r.tick({ order: walkSouth });
    const f = r.facing();
    expect(f.x, "放開類比之後面向沒有立刻交還給面向鎖").toBeCloseTo(1, 6);
    expect(f.z).toBeCloseTo(0, 6);
  });

  /**
   * 同一 tick 內的「不帶 aim 的訊息」**不是**放手的證據。
   * `IntentSender.pushCommand` 會立刻 flush 一筆訊息(按技能鍵),而那一筆
   * 不一定帶 aim。如果把它當成放手,玩家每按一次技能面向就會抖一下 ——
   * 那正是這一支要修的症狀,只是換了一個觸發源。放手的訊號是
   * 「一整個 tick 收到的訊息**全部**沒有 aim」,見下一條。
   */
  it("同一 tick 內的技能訊息(不帶 aim)不會被誤判成放手", () => {
    cover("aim-continuity");
    const r = rig();
    armFacingLock(r.w, r.id, EAST, 60);
    r.send({ aim: NORTH });
    r.send({ commands: [{ kind: "ready" }] }); // 立即 flush 的按鍵
    r.tick();
    expect(r.facing().z, "同 tick 的按鍵訊息把瞄準清掉了").toBeCloseTo(1, 6);
    // 但下一個 tick 若收到的訊息全部沒有 aim,那才是放手 → 立刻交還
    r.tick({ order: walkSouth });
    expect(r.facing().x, "整個 tick 都沒有 aim 之後仍然沒有交還").toBeCloseTo(1, 6);
  });
});
