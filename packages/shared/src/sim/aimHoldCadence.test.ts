/**
 * 瞄準沿用的**節奏**守衛 (task #280 的第二輪).
 *
 * ── 為什麼 #280 修過一次還要再修一次 ────────────────────────────────────────
 * 第一輪引進了 `AimHold`(輸入邊界的沿用),把「這一 tick 沒訊息」和「這一 tick
 * 的訊息說我放手了」分開。方向對,但窗口長度 `AIM_HOLD_TICKS` 當時訂成 **3**,
 * 理由是「最壞情況是連續兩 tick 沒訊息」—— 那個假設只在桌機成立。
 *
 * 2026-07-30 用**出貨路徑**量到的(見下面第一條測試的表格):訊息每 4 tick 才
 * 來一筆時,面向仍然每 4 tick 硬跳一次 180°。#282 量到手機 30fps 把送出率打到
 * 15.6–21.8 訊息/秒,對 30Hz 的 sim 就是這個區間 —— 也就是說 #280 對手機玩家
 * **根本沒修好**,只是抽搐的頻率從 15Hz 降到 7.5Hz。
 *
 * ── 這一支怎麼測 ────────────────────────────────────────────────────────────
 * 跑**完整的 `world.step()`**,而且從**真正的輸入邊界**(`AimHold`)餵進去 ——
 * 直接手寫 `frame.aim` 的測試證明不了任何事,因為缺陷正是「訊息沒到的那一 tick
 * frame.aim 是 undefined」,手寫的話那一 tick 就不存在了(失敗形狀 ⑤:被測的
 * 不是出貨的那個)。
 *
 * 三個候選方向兩兩不同 —— 瞄北 / 走東 / 鎖南 —— 否則「沿用」與「回退」會給出
 * 同一個答案(失敗形狀 ④)。斷言讀的是 `transform.facing`,也就是**最終的面向
 * 值**,不是 intent、不是 `aimTick`(失敗形狀 ⑦)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { armFacingLock } from "./facingLock";
import { AimHold, AIM_HOLD_TICKS } from "./aimHold";
import type { IntentFrame } from "./intents";
import type { Vec2 } from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const ZONE = SKELETON_ARENA.zones[0]!;
const NORTH: Vec2 = { x: 0, z: 1 };
const SOUTH: Vec2 = { x: 0, z: -1 };
const EAST_POINT = { x: ZONE.center.x + 8, z: ZONE.center.z };

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

/**
 * 跑 `ticks` 個 tick,訊息只在 `msgOn` 指定的那幾個 tick(1-based)抵達。
 * 回傳每一 tick 結束後的**最終面向 z 分量**。
 *
 * 面向鎖朝南、長度 600 tick —— 整段測試都在「面向鎖窗口內」,這正是 #280 的
 * 標題所描述的情境。腳一直往東走,所以移動方向也在搶面向。
 */
function facingSeries(ticks: number, msgOn: readonly number[]): number[] {
  const { w, id, seat } = mk();
  armFacingLock(w, id, SOUTH, 600);
  const hold = new AimHold();
  const out: number[] = [];
  for (let n = 1; n <= ticks; n++) {
    if (msgOn.includes(n)) hold.push(NORTH);
    const aim = hold.drain(w.tick);
    const f: IntentFrame = { commands: [], order: { kind: "move", point: EAST_POINT } };
    if (aim) f.aim = aim;
    w.step(new Map([[seat, f]]));
    out.push(w.transform.get(id)!.facing.z);
  }
  return out;
}

describe("瞄準沿用的節奏 (aim-hold-cadence)", () => {
  /**
   * ⭐ 這條就是 #280 的重現。修好之前量到的實際序列:
   *
   *     tick 1,2,3  +1 北   tick 4  −1 南 ← 硬跳 180°
   *     tick 5,6,7  +1 北   tick 8  −1 南 ← 又一次
   *     tick 9,10   +1 北
   *
   * 把 `AIM_HOLD_TICKS` 改回 3 這條就會紅在 tick 4。
   */
  it("訊息只在第 1/5/9 tick 抵達,面向鎖窗口內的 10 個 tick 一次都不准跳", () => {
    cover("aim-hold-cadence");
    const series = facingSeries(10, [1, 5, 9]);
    series.forEach((z, i) => {
      expect(
        z,
        `第 ${i + 1} tick 面向掉回出手鎖方向(南)—— 沿用窗口 ${AIM_HOLD_TICKS} tick ` +
          `蓋不住 4 tick 一筆的送出節奏,玩家看到的就是每 4 tick 抽一次\n` +
          `實際序列 z = [${series.map((v) => v.toFixed(1)).join(", ")}]`,
      ).toBeCloseTo(1, 6);
    });
  });

  /**
   * 上一條只證明「不跳」。一個把 `drain` 寫成「永遠回上一次 aim」的實作也會過,
   * 而那個實作的行為是面向**永遠**卡住 —— 玩家放手了身體還朝著舊方向。
   * 所以這一條釘住「沿用會到期」,而且斷言的是**交還之後**的方向(南 = 面向鎖)。
   */
  it("沿用會到期:完全沒有訊息之後,面向交還給出手鎖", () => {
    cover("aim-hold-cadence");
    // 只有第 1 tick 有訊息,之後全靜音
    const series = facingSeries(AIM_HOLD_TICKS + 3, [1]);
    for (let i = 0; i < AIM_HOLD_TICKS; i++) {
      expect(series[i], `第 ${i + 1} tick 就提早交還了`).toBeCloseTo(1, 6);
    }
    expect(
      series[AIM_HOLD_TICKS],
      "沿用沒有上限 —— 玩家斷線之後面向永遠卡在最後一次瞄準",
    ).toBeCloseTo(-1, 6);
  });

  /**
   * 「放開類比」必須**立刻**交還,不受沿用窗口影響。這是 `drain` 分支 2 與
   * 分支 3 的分界,也是把窗口從 3 拉到 8 之後最容易被犧牲掉的行為。
   */
  it("送出一筆不帶 aim 的訊息 = 放手,同一 tick 就交還(不等窗口到期)", () => {
    cover("aim-hold-cadence");
    const { w, id, seat } = mk();
    armFacingLock(w, id, SOUTH, 600);
    const hold = new AimHold();

    hold.push(NORTH);
    let aim = hold.drain(w.tick);
    const f1: IntentFrame = { commands: [], order: { kind: "move", point: EAST_POINT } };
    if (aim) f1.aim = aim;
    w.step(new Map([[seat, f1]]));
    expect(w.transform.get(id)!.facing.z).toBeCloseTo(1, 6);

    // 下一 tick:訊息有到,但不帶 aim(玩家放開右類比)
    hold.push(undefined);
    aim = hold.drain(w.tick);
    expect(aim, "放手的那一筆訊息被當成節拍縫隙,沿用了").toBeUndefined();
    const f2: IntentFrame = { commands: [], order: { kind: "move", point: EAST_POINT } };
    if (aim) f2.aim = aim;
    w.step(new Map([[seat, f2]]));
    expect(
      w.transform.get(id)!.facing.z,
      "放手之後面向沒有立刻交還給出手鎖",
    ).toBeCloseTo(-1, 6);
  });

  /**
   * 窗口拉長之後最該擔心的事:腳有沒有被面向連累。面向與走位是解耦的
   * (MovementSystem 檔頭的 Design note),所以整段沿用期間身體朝北、腳往東走。
   * 沒有這一條的話,一個「沿用時順便停下來」的實作也會讓上面三條全綠。
   */
  it("沿用期間腳照走 —— 面向與走位仍然解耦", () => {
    cover("aim-hold-cadence");
    const { w, id, seat } = mk();
    armFacingLock(w, id, SOUTH, 600);
    const hold = new AimHold();
    const x0 = w.transform.get(id)!.pos.x;
    for (let n = 1; n <= 6; n++) {
      if (n === 1) hold.push(NORTH);
      const aim = hold.drain(w.tick);
      const f: IntentFrame = { commands: [], order: { kind: "move", point: EAST_POINT } };
      if (aim) f.aim = aim;
      w.step(new Map([[seat, f]]));
    }
    expect(w.transform.get(id)!.facing.z, "面向沒有維持在瞄準方向").toBeCloseTo(1, 6);
    expect(w.transform.get(id)!.pos.x, "沿用期間腳被凍住了").toBeGreaterThan(x0);
  });
});
