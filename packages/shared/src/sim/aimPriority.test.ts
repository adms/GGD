/**
 * 瞄準優先 —— owner 2026-07-28:「面向是瞄準優先」.
 *
 * #264 給了面向一個「出手就是承諾」的鎖:施法/揮劍 commit 一個方向,之後 3–6
 * tick 移動方向不得覆蓋它。那條規則本身是對的(格鬥/動作遊戲慣例),但它也把
 * **玩家的右類比瞄準**壓住了 200–300ms —— owner 打過之後裁定瞄準要贏。
 *
 * ⚠️ 這個 bug 的形狀值得記下來:`orderSystem`(slot 4)**已經**把瞄準寫進
 * `t.facing` 了,而 `movementSystem`(slot 5)在同一個 tick 之內又把面向鎖蓋回去。
 * 也就是說「玩家正在瞄」這件事被寫進去又被抹掉,而兩邊各自的測試都只看自己那
 * 一半,所以全綠。只斷言「orderSystem 有寫 facing」是失敗形狀 ⑤ —— 受測的東西
 * 不是出貨的東西,出貨的是整個 `step()`。
 *
 * 所以下面每一條都跑**完整的 `world.step()`**,不呼叫單一系統。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { armFacingLock, FACING_INSTANT_CAST_TICKS } from "./facingLock";
import type { IntentFrame } from "./intents";
import type { Vec2 } from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const ZONE = SKELETON_ARENA.zones[0]!;

function mk(): { w: SimWorld; id: EntityId; seat: SeatId } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  const seat = asSeatId(0);
  const id = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: seat,
    teamId: asTeamId(1),
    pos: { x: ZONE.center.x, z: ZONE.center.z },
    zone: 0,
  });
  return { w, id, seat };
}

/** One tick with an explicit aim and a move order pulling the body the other way. */
function frame(aim: Vec2 | null, movePoint: Vec2 | null): IntentFrame {
  const f: IntentFrame = { commands: [] };
  if (aim) f.aim = aim;
  if (movePoint) f.order = { kind: "move", point: movePoint };
  return f;
}

const EAST: Vec2 = { x: 1, z: 0 };
const NORTH: Vec2 = { x: 0, z: 1 };

describe("面向:瞄準優先 (sim-aim-priority)", () => {
  it("出手鎖住方向後,玩家推右類比就是轉得動", () => {
    cover("sim-aim-priority");
    const { w, id, seat } = mk();
    // 出手 commit 一個朝東的方向(這正是 #264 的鎖,瞬發技的長度)
    armFacingLock(w, id, EAST, FACING_INSTANT_CAST_TICKS);
    expect(w.transform.get(id)!.facing).toEqual(EAST);

    // 鎖還沒過期的那一 tick,玩家往北瞄
    w.step(new Map([[seat, frame(NORTH, null)]]));
    const f = w.transform.get(id)!.facing;
    expect(f.z, "瞄準沒有贏 —— 面向鎖仍然壓著右類比").toBeCloseTo(1, 6);
    expect(f.x).toBeCloseTo(0, 6);
    // 鎖仍在(沒有被瞄準清掉),只是這一 tick 讓位
    expect(w.facingLock.has(id)).toBe(true);
  });

  it("走位中出手,沒有瞄準輸入時鎖照舊贏 —— #264 沒有被拆掉", () => {
    cover("sim-aim-priority");
    const { w, id, seat } = mk();
    armFacingLock(w, id, EAST, FACING_INSTANT_CAST_TICKS);
    // 只走路、不瞄準:身體必須維持出手方向(這就是「揮劍會轉向目標」)
    const north = { x: ZONE.center.x, z: ZONE.center.z + 5 };
    w.step(new Map([[seat, frame(null, north)]]));
    const f = w.transform.get(id)!.facing;
    expect(f.x, "沒有瞄準輸入時面向鎖應該仍然生效").toBeCloseTo(1, 6);
    expect(f.z).toBeCloseTo(0, 6);
  });

  it("手放開類比之後,鎖立刻拿回控制權", () => {
    cover("sim-aim-priority");
    const { w, id, seat } = mk();
    armFacingLock(w, id, EAST, FACING_INSTANT_CAST_TICKS);
    const north = { x: ZONE.center.x, z: ZONE.center.z + 5 };
    // tick A:邊走邊瞄北 → 北贏
    w.step(new Map([[seat, frame(NORTH, north)]]));
    expect(w.transform.get(id)!.facing.z).toBeCloseTo(1, 6);
    // tick B:放開類比(不送 aim),鎖還沒過期 → 回到東
    w.step(new Map([[seat, frame(null, north)]]));
    const f = w.transform.get(id)!.facing;
    expect(f.x, "放開類比後鎖沒有拿回控制權").toBeCloseTo(1, 6);
  });

  it("長度 0 的瞄準不算瞄準 —— 不會永久壓住出手轉向", () => {
    cover("sim-aim-priority");
    const { w, id, seat } = mk();
    armFacingLock(w, id, EAST, FACING_INSTANT_CAST_TICKS);
    // 類比回中時某些驅動會送 {0,0}。把它當成「正在瞄」的話,#264 會被永久關掉。
    //
    // ⚠️ 一定要同時下一個**反方向的移動指令**。沒有競爭來源的話,面向鎖讓不讓位
    // 的結果都是「維持東」—— 這條測試會在「把 aimTick 設在長度檢查之前」的突變
    // 下依然全綠(我實測過)。要讓它有意義,必須有另一個東西在搶面向。
    const north = { x: ZONE.center.x, z: ZONE.center.z + 5 };
    w.step(new Map([[seat, frame({ x: 0, z: 0 }, north)]]));
    const f = w.transform.get(id)!.facing;
    expect(f.x, "長度 0 的瞄準被當成「正在瞄」,面向鎖被移動方向搶走了").toBeCloseTo(1, 6);
    expect(f.z).toBeCloseTo(0, 6);
    expect(w.aimTick.has(id), "長度 0 的瞄準不該被記成一次瞄準").toBe(false);
  });

  it("瞄準優先不會讓 facingLock 表無限長大", () => {
    cover("sim-aim-priority");
    // 讓位的實作若寫成「有瞄準就不呼叫 facingLockDir」,過期項目就沒人回收。
    const { w, id, seat } = mk();
    armFacingLock(w, id, EAST, 1);
    for (let i = 0; i < 5; i++) w.step(new Map([[seat, frame(NORTH, null)]]));
    expect(w.facingLock.has(id), "過期的鎖沒有被回收").toBe(false);
  });

  it("回收的 entityId 不會繼承上一個單位的「正在瞄」標記", () => {
    cover("sim-aim-priority");
    const { w, id, seat } = mk();
    w.step(new Map([[seat, frame(NORTH, null)]]));
    expect(w.aimTick.has(id)).toBe(true);
    w.destroy(id);
    expect(w.aimTick.has(id)).toBe(false);
  });
});
