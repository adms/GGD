/**
 * ⚔️ GH#598 —— **英雄專屬的初始 AD**，owner 2026-08-23（逐字）：
 *
 *     「**[優先] 英雄專屬的初始 AD 系統倍率初始 AD 傷害 +32**
 *       不然普攻流一開始太弱完全打不了」
 *
 * ⭐ 這條守衛驗的是**機制**，⛔ 不是那個數字（第二守則：出貨數值已經有三個住處
 * ＋ drift 測試在守；抄進斷言就是第四個住處，而它沒有守衛）。所以兩條斷言都是
 * 「有沒有變」而不是「等於 32」：
 *
 *   ① 走**出貨的生成路徑**（`spawnChampion` → `statRecomputeSystem` →
 *      `finalizeStat`），第 1 級英雄的最終 AD **比沒有這份贈禮時高**。
 *      ⛔ 沒有一條斷言去看 `DEFAULT_BASE_BONUS.ad` 這個欄位在不在 ——
 *      一份完美存進表裡卻沒有人讀的贈禮必須在這裡紅（失敗形態 ⑦）。
 *   ② owner **更正掉的那一半**：它不可以流進殭屍。判準是結構性的 ——
 *      小怪沒有 `StatsComp`，而 `statRecomputeSystem` 只走 `world.stats`，
 *      所以 `finalizeStat`（贈禮唯一的加法點）在小怪身上一次都不會跑。
 *      哪天有人給小怪配了 StatsComp，這一條就會紅並指名這個風險。
 *
 * 突變紀錄：`sim/baseBonus.ts` 的 `[Stat.AttackDamage]: 32` 那一列刪掉
 * → 第一條紅（「⛔ 出貨表沒有給 AD 贈禮」與 toBeGreaterThan 兩個都紅）。
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
    // GUARD-THE-GUARD：出貨表沒給 AD 的話，下面那條比較會拿兩個相同的值互比
    // 而永遠綠 —— 那正是這條守衛要擋的缺陷本身（失敗形態 ④）。
    expect(
      baseBonusFor(DEFAULT_BASE_BONUS, Stat.AttackDamage),
      "⛔ 出貨表沒有給 AD 贈禮 —— GH#598 被撤掉了",
    ).toBeGreaterThan(0);

    const withGift = level1Ad(DEFAULT_BASE_BONUS);
    const { ad: _dropped, ...noGift } = DEFAULT_BASE_BONUS as Record<string, number>;
    expect(withGift, "AD 贈禮沒有到達戰鬥面板").toBeGreaterThan(
      level1Ad(noGift as BaseBonusTable),
    );
  });

  it("⛔ 它到不了殭屍：小怪沒有 StatsComp，贈禮的加法點一次都不會跑", () => {
    cover("hero-initial-ad-champion-only");
    const w = new SimWorld(SKELETON_ARENA, 20260823);
    const hero = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z },
      zone: 0,
    });
    // 贈禮只加在 `world.stats` 上的身體；`world.mob` 那一族從來不在裡面。
    expect(w.stats.has(hero)).toBe(true);
    for (const mobId of w.mob.keys()) expect(w.stats.has(mobId)).toBe(false);
  });
});
