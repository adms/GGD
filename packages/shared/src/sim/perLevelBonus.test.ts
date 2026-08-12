/**
 * 每級加成 —— owner 2026-08-13：「英雄**每等級都會 +1 AP**，這個參數一樣可在後台設定」。
 *
 * ⛔ 這一檔**不驗出貨數字**（1 / "ap" / "all" 都不在斷言裡，全部從
 * `DEFAULT_PER_LEVEL_BONUS` 推導）。三個住處 + drift 測試已經在守那些值。
 *
 * ⭐ 驗的是**三個機制**，每一個都對應一種「做了但玩家拿不到」：
 *   ① 它真的**乘上等級** —— 只加一次的實作在 L1 上長得一模一樣（失敗形態②）
 *   ② 它坐在**倍率之後、夾限之前** —— 位置就是語意（`baseBonus` 的同一格）
 *   ③ `appliesTo` 真的被讀 —— 一個永遠回 `all` 的實作在出貨設定下**完全無法區分**
 *
 * 突變紀錄（跑過）：`baseBonus.ts` 的 `e.amount * (level - 1)` 改成 `e.amount`
 *   → ①「等級越高加得越多」那條紅（L99 與 L2 拿到同一個數）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import {
  DEFAULT_PER_LEVEL_BONUS,
  PER_LEVEL_BONUS_MAX,
  finalizeStat,
  perLevelBonusFor,
  perLevelBonusFromDoc,
  type PerLevelBonusTable,
} from "./baseBonus";
import { Stat } from "./stats/statTypes";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId } from "../ids";
import { Champions } from "./content/registry";
import { championStatBase } from "./stats/attributes";

const NO_INTENTS = new Map();

/** 出貨表上第一個有每級加成的屬性 —— ⛔ 不寫死是哪一個。 */
const KEY = (Object.keys(DEFAULT_PER_LEVEL_BONUS) as Stat[])[0]!;
const ENTRY = DEFAULT_PER_LEVEL_BONUS[KEY]!;

describe("每級加成（owner 2026-08-13）", () => {
  it("⭐ 它真的乘上等級 —— L99 拿到的是 L2 的 98 倍", () => {
    cover("per-level-bonus");
    const at = (lv: number): number => perLevelBonusFor(DEFAULT_PER_LEVEL_BONUS, KEY, lv);
    expect(at(1), "等級 1 沒有累積").toBe(0);
    // ⛔ 不抄 1 或 98：比值才是機制，數量是後台的事。
    expect(at(99) / at(2)).toBeCloseTo(98, 6);
    expect(at(50)).toBeGreaterThan(at(20));
  });

  it("⭐ 它接在 finalizeStat 上，而且在夾限之前（上限管得到它）", () => {
    cover("per-level-bonus");
    // ⚠️ 這一條是「接線真的存在」的守衛：`finalizeStat` 少傳 level 就永遠是 0，
    //    而那在後台上看起來完全正常（失敗形態②）。
    const noLevel = finalizeStat(0, KEY, {});
    const lv99 = finalizeStat(0, KEY, { level: 99 });
    expect(lv99).toBeGreaterThan(noLevel);
    expect(lv99 - noLevel).toBeCloseTo(perLevelBonusFor(DEFAULT_PER_LEVEL_BONUS, KEY, 99), 6);

    // 夾限之前：一個小到荒謬的上限會把它壓下去。
    const capped = finalizeStat(0, KEY, {
      level: 99,
      caps: { [KEY]: { base: 5, unlocked: 5 } },
    });
    expect(capped).toBe(5);
  });

  it("⭐ appliesTo 真的被讀 —— primary / nonPrimary 是互補的", () => {
    cover("per-level-bonus");
    // ⚠️ 沒有這一條，一個「永遠當成 all」的實作在出貨設定（all）下完全測不出來。
    const mk = (appliesTo: "all" | "primary" | "nonPrimary"): PerLevelBonusTable => ({
      [KEY]: { amount: ENTRY.amount, appliesTo },
    });
    const P = perLevelBonusFor(mk("primary"), KEY, 99, "int");
    const N = perLevelBonusFor(mk("nonPrimary"), KEY, 99, "int");
    const P2 = perLevelBonusFor(mk("primary"), KEY, 99, "str");
    const N2 = perLevelBonusFor(mk("nonPrimary"), KEY, 99, "str");
    // 智慧主拿得到 primary、拿不到 nonPrimary；力量主剛好相反。
    expect(P).toBeGreaterThan(0);
    expect(N).toBe(0);
    expect(P2).toBe(0);
    expect(N2).toBeGreaterThan(0);
    // ⛔ 不知道主屬性時，兩種模式都回 0（fail-safe，不猜）。
    expect(perLevelBonusFor(mk("primary"), KEY, 99, undefined)).toBe(0);
    expect(perLevelBonusFor(mk("nonPrimary"), KEY, 99, undefined)).toBe(0);
  });

  it("🔴 statPipeline 真的把它接進去了 —— 走的是出貨那條路，不是 finalizeStat 直呼", () => {
    cover("per-level-bonus");
    // ⚠️ 這一條是被突變逼出來的：上面那些驗的是 `finalizeStat` 本身，
    //    而 `statPipeline` 那三行接線刪掉之後**它們全部照樣綠** ——
    //    功能整個消失而沒有任何東西會叫（失敗形態⑤：被測的不是出貨的那個）。
    const world = new SimWorld(SKELETON_ARENA, 4242);
    registerSkeletonContent();
    const lo = spawnChampion(world, {
      championId: THORNE.id, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z }, zone: 0,
    });
    world.step(NO_INTENTS);
    const atLv1 = world.stats.get(lo)!.final[KEY] as number;
    // 同一位英雄升到高等級 —— 只有接線存在時這一格才會多出每級加成。
    world.champion.get(lo)!.level = 40;
    world.stats.get(lo)!.dirty = true;
    world.step(NO_INTENTS);
    const atLv40 = world.stats.get(lo)!.final[KEY] as number;
    const gainedFromLevel = perLevelBonusFor(DEFAULT_PER_LEVEL_BONUS, KEY, 40);
    expect(gainedFromLevel, "夾具前提：出貨表上這一格真的有每級加成").toBeGreaterThan(0);
    expect(atLv40).toBeGreaterThan(atLv1);

    // ⭐ 承重的那一條：拿**同一支出貨算式**算出「沒有每級加成的話會是多少」，
    //   兩者的差必須**正好**是每級加成。
    //   ⚠️ 不可以只寫 `atLv40 − atLv1 >= 每級加成` —— 三圍成長本身就大於它，
    //     所以那個斷言在接線被刪掉之後**照樣綠**（實測過，這一段是第二次突變逼出來的）。
    const withoutPerLevel = finalizeStat(championStatBase(Champions.get(THORNE.id), KEY, 40), KEY, {
      env: world.combatEnv,
      baseBonus: world.baseBonus,
      caps: world.statCaps,
    });
    expect(atLv40 - withoutPerLevel, "差值必須正好是每級加成").toBeCloseTo(gainedFromLevel, 3);
  });

  it("缺文件 = 出貨預設，⛔ 不是空表", () => {
    cover("per-level-bonus");
    // ⚠️ 回空表的話這個功能會**靜默消失**：後台照顯示、場上沒反應。
    expect(perLevelBonusFromDoc(undefined)).toBe(DEFAULT_PER_LEVEL_BONUS);
    expect(perLevelBonusFromDoc({ schema: "config.base-bonus@1" })).toBe(DEFAULT_PER_LEVEL_BONUS);
    // 認得的文件會被夾在上下界內。
    const over = perLevelBonusFromDoc({
      schema: "config.per-level-bonus@1",
      perLevel: { [KEY]: { amount: 1e9, appliesTo: "all" } },
    });
    expect(over[KEY]?.amount).toBe(PER_LEVEL_BONUS_MAX);
  });
});
