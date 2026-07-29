/**
 * 面向鎖窗口長度的**後台可調**守衛 (第一守則 + 第二守則).
 *
 * ── 這一支在防什麼 ──────────────────────────────────────────────────────────
 * `facing.followThroughTicks` / `facing.instantCastTicks` 從三個 `export const`
 * 變成 `config.combat-feel@1` 的欄位。這種搬遷最典型的失敗是**第②種**:值算對了、
 * schema 加對了、JSON 也出貨了,但出貨的那條路徑還在讀舊常數 —— 操作者在後台把
 * 窗口從 6 調到 60,存檔成功,玩家那一場一點變化都沒有,而且完全無聲。
 *
 * 所以下面斷言的是**最終的面向行為**(鎖到底撐了幾個 tick),不是「常數等於設定
 * 值」那種掃屬性的假守衛(失敗形狀 ⑦)。做法是把 `world.combatFeel` 換成一個
 * 誇張的值,然後跑真的 `world.step()`,數身體到第幾 tick 才被移動方向搶走。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../ids";
import { armFacingLock, facingTicks, FACING_FOLLOW_THROUGH_TICKS, FACING_INSTANT_CAST_TICKS } from "./facingLock";
import { castAbility } from "./abilities/abilitySystem";
import {
  DEFAULT_COMBAT_FEEL,
  DEFAULT_FACING,
  COMBAT_FEEL_SCHEMA,
  combatFeelFromDoc,
  normalizeFacingRules,
} from "./combatFeel";
import type { IntentFrame } from "./intents";

beforeAll(() => registerSkeletonContent());
const ZONE = SKELETON_ARENA.zones[0]!;
const SOUTH = { x: 0, z: -1 };

function mk() {
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
 * 上鎖朝南、腳往東走,回傳「面向仍然朝南」的 tick 數。
 * 鎖一過期,移動方向(東)就會把身體轉走,所以這個數字**就是**窗口長度。
 */
function lockHeldTicks(lockTicks: number): number {
  const { w, id, seat } = mk();
  armFacingLock(w, id, SOUTH, lockTicks);
  const east = { x: ZONE.center.x + 8, z: ZONE.center.z };
  let held = 0;
  for (let n = 0; n < lockTicks + 12; n++) {
    const f: IntentFrame = { commands: [], order: { kind: "move", point: east } };
    w.step(new Map([[seat, f]]));
    if (w.transform.get(id)!.facing.z < -0.99) held++;
    else break;
  }
  return held;
}

describe("面向鎖窗口是後台可調的 (facing-config)", () => {
  it("出貨預設和舊的三個 const 相等 —— 搬遷沒有偷偷改掉手感", () => {
    cover("facing-config");
    expect(DEFAULT_FACING.followThroughTicks).toBe(FACING_FOLLOW_THROUGH_TICKS);
    expect(DEFAULT_FACING.instantCastTicks).toBe(FACING_INSTANT_CAST_TICKS);
  });

  it("⭐ 換掉 world.combatFeel.facing,鎖的長度真的跟著變(不是只有常數變)", () => {
    cover("facing-config");
    // 兩個差很多的窗口,量出來的「撐住幾 tick」必須跟著差很多。
    expect(lockHeldTicks(4)).toBe(4);
    expect(lockHeldTicks(20)).toBe(20);
  });

  /**
   * ⚠️ 這條的第一版是假守衛,而且是**突變驗證抓到的**(2026-07-30):它只呼叫
   * `facingTicks(w)` 然後自己重算一次 `max(cast, instant) + follow`。把
   * `abilitySystem` 裡的設定讀取整個換回寫死的 `Math.max(castTicksForAim, 6) + 3`
   * 之後,它**依然全綠** —— 也就是第③種故障:實作可以整段撤銷而測試沒感覺。
   *
   * 現在改成跑**真的 `castAbility`**,然後讀 `world.facingLock` 的 `untilTick`
   * —— 那是出貨路徑真正寫下的東西。設定給 40+5,瞬發技的鎖就必須是 45 tick;
   * 寫死的實作會得到 6+3 = 9,差得一眼看得出來。
   */
  it("⭐ 出貨的施法路徑(castAbility)讀的是 config,不是寫死的常數", () => {
    cover("facing-config");
    const { w, id } = mk();
    w.abilities.get(id)!.slots.E.rank = 1;
    w.combatFeel = {
      ...DEFAULT_COMBAT_FEEL,
      facing: { followThroughTicks: 5, instantCastTicks: 40 },
    };
    const tickAtCast = w.tick;
    const res = castAbility(w, id, "E", {
      type: "point",
      point: { x: ZONE.center.x - 8, z: ZONE.center.z },
    });
    expect(res, "技能沒放出來,這條測試等於沒測到").toBe("ok");

    const lock = w.facingLock.get(id);
    expect(lock, "castAbility 沒有上任何面向鎖").toBeDefined();
    // skeleton 的 E 是瞬發 (castTimeSec = 0) → max(0, 40) + 5 = 45
    expect(
      lock!.untilTick - tickAtCast,
      "施法上的鎖長度沒有跟著後台設定走 —— 出貨路徑還在讀寫死的常數 (第②種故障)",
    ).toBe(45);
  });

  /**
   * ⚠️ 同樣是突變驗證補的(2026-07-30)。`armFacingLock` 有**兩個**呼叫端:
   * `abilitySystem`(施法)和 `BasicAttackSystem`(揮劍)。上面那條只蓋住施法,
   * 把 BasicAttackSystem 的兩處設定讀取換回寫死的 `3` 之後整組仍然全綠 ——
   * 揮劍轉向正是 #264 最初被抱怨的那件事,不能只靠施法路徑順便守住。
   *
   * 這裡把 `followThroughTicks` 設成 50(出貨預設是 3),普攻上的鎖必須明顯變長。
   */
  it("⭐ 出貨的普攻路徑(BasicAttackSystem)讀的也是 config", () => {
    cover("facing-config");
    const w = new SimWorld(SKELETON_ARENA, 11);
    const me = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: ZONE.center.x, z: ZONE.center.z },
      zone: 0,
    });
    const foe = spawnChampion(w, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: ZONE.center.x + 1.2, z: ZONE.center.z },
      zone: 0,
    });
    w.combatFeel = {
      ...DEFAULT_COMBAT_FEEL,
      facing: { followThroughTicks: 50, instantCastTicks: 6 },
    };
    // 下攻擊命令,跑到普攻真的起手為止
    w.nav.get(me)!.attackTarget = foe;
    let maxRemaining = 0;
    for (let n = 0; n < 40; n++) {
      w.step(new Map());
      const lock = w.facingLock.get(me);
      if (lock) maxRemaining = Math.max(maxRemaining, lock.untilTick - w.tick);
    }
    expect(
      maxRemaining,
      "普攻上的面向鎖沒有跟著後台的 followThroughTicks 走 —— " +
        "BasicAttackSystem 還在讀寫死的 3 (第②種故障)",
    ).toBeGreaterThanOrEqual(50);
  });

  it("world.combatFeel 缺 facing 那一格時,回退到出貨預設而不是 NaN tick", () => {
    cover("facing-config");
    const { w } = mk();
    // repo 裡真的有手寫半張表的既有測試,所以這條路徑必須是安全的
    w.combatFeel = {
      knockback: DEFAULT_COMBAT_FEEL.knockback,
      standstill: DEFAULT_COMBAT_FEEL.standstill,
    };
    const f = facingTicks(w);
    expect(Number.isFinite(f.instantCastTicks), "缺格變成了 NaN —— 鎖會永遠不過期").toBe(true);
    expect(f).toEqual(DEFAULT_FACING);
  });

  it("文件讀進來:合法值生效,壞值逐格退回預設", () => {
    cover("facing-config");
    const rules = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      facing: { followThroughTicks: 9, instantCastTicks: 12 },
    });
    expect(rules.facing).toEqual({ followThroughTicks: 9, instantCastTicks: 12 });
    // 一格壞掉不會把整張表丟掉
    expect(normalizeFacingRules({ followThroughTicks: "六", instantCastTicks: 12 })).toEqual({
      followThroughTicks: DEFAULT_FACING.followThroughTicks,
      instantCastTicks: 12,
    });
  });

  it("有上界也有下界,而且一定是整數 (第一守則:欄位要有上界)", () => {
    cover("facing-config");
    // 負值 → 夾到 0(負的鎖 = 立刻過期,不是「反向鎖」)
    expect(normalizeFacingRules({ followThroughTicks: -50 }).followThroughTicks).toBe(0);
    // 手滑打成 6000 → 夾到 300,不是讓玩家 200 秒不能轉身
    expect(normalizeFacingRules({ instantCastTicks: 6000 }).instantCastTicks).toBe(300);
    // 小數 tick 會讓到期比較在半個 tick 的位置為真 → 必須取整
    expect(Number.isInteger(normalizeFacingRules({ instantCastTicks: 7.4 }).instantCastTicks)).toBe(
      true,
    );
    expect(normalizeFacingRules({ instantCastTicks: 7.4 }).instantCastTicks).toBe(7);
  });
});
