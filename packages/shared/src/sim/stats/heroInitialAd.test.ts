/**
 * ⚔️ GH#598 —— **英雄專屬的初始 AD**，owner 2026-08-23（逐字）：
 *
 *     「**[優先] 英雄專屬的初始 AD 系統倍率初始 AD 傷害 +32**
 *       不然普攻流一開始太弱完全打不了」
 *
 * ⭐ 驗的是**機制**，⛔ 不是那個數字（第二守則：出貨值已經有三個住處 ＋ drift
 * 測試在守，抄進斷言就是第四個住處）。所以斷言是「有沒有變」而不是「等於 32」，
 * 而且走**出貨的生成路徑**（`spawnChampion` → `statRecomputeSystem` →
 * `finalizeStat`）—— ⛔ 沒有一條去看 `DEFAULT_BASE_BONUS.ad` 這個欄位在不在：
 * 一份完美存進表裡卻沒有人讀的贈禮必須在這裡紅（失敗形態 ⑦）。
 *
 * ⚠️ owner **更正掉的那一半**（⛔ 不可以一起餵飽殭屍／bot）是**結構性**成立的，
 * ⛔ 不在這裡花一份 30 行的 `MobRules` 夾具去重測：贈禮唯一的加法點是
 * `finalizeStat`，它只被 `statRecomputeSystem` 呼叫，而那支只走 `world.stats`；
 * 小怪刻意沒有 `StatsComp`（`sim/mobs.ts` 自己算 `MobRules.attackDamage`）。
 * 見 `sim/baseBonus.ts` 檔頭「IT IS CHAMPION-ONLY BY CONSTRUCTION」。
 *
 * 突變紀錄：`sim/baseBonus.ts` 的 `[Stat.AttackDamage]: 32` 刪掉 → 這一條紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { DEFAULT_BASE_BONUS, baseBonusFor, type BaseBonusTable } from "../baseBonus";
import { Stat } from "./statTypes";
import { asSeatId, asTeamId, type ChampionId } from "../../ids";

const Z0 = SKELETON_ARENA.zones[0]!;

beforeAll(() => registerSkeletonContent());

/** 第 1 級英雄的最終 AD，走的是出貨那條路（⛔ 不手算管線）。 */
function level1Ad(bonus: BaseBonusTable): number {
  const w = new SimWorld(SKELETON_ARENA, 20260823);
  w.baseBonus = bonus;
  const id = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  return w.stats.get(id)!.final[Stat.AttackDamage];
}

describe("英雄專屬的初始 AD 贈禮 (GH#598)", () => {
  it("出貨表真的把 AD 贈禮送進第 1 級英雄的面板", () => {
    cover("hero-initial-ad-gift");
    // GUARD-THE-GUARD：出貨表沒給 AD 的話，下面那條會拿兩個相同的值互比而永遠綠
    // —— 那正是這條守衛要擋的缺陷本身（失敗形態 ④）。
    expect(
      baseBonusFor(DEFAULT_BASE_BONUS, Stat.AttackDamage),
      "⛔ 出貨表沒有給 AD 贈禮 —— GH#598 被撤掉了",
    ).toBeGreaterThan(0);

    const noGift: BaseBonusTable = Object.fromEntries(
      Object.entries(DEFAULT_BASE_BONUS).filter(([k]) => k !== Stat.AttackDamage),
    ) as BaseBonusTable;
    expect(level1Ad(DEFAULT_BASE_BONUS), "AD 贈禮沒有到達戰鬥面板").toBeGreaterThan(
      level1Ad(noGift),
    );
  });
});
