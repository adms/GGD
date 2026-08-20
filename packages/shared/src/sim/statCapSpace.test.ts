/**
 * ⭐ **柵欄與被夾的值必須是同一個單位** —— owner 2026-08-20 抓到的那個迴圈的守衛。
 *
 * owner（逐字）：
 * > 「3. use LV30/50/99 rules, but I think you **echo and loop back the formula**,
 * >  so **HP going crazy 163萬**」
 *
 * 量到的形狀（⛔ 不是「倍率乘兩次」，那個假說是錯的）：那 7 條硬上限在**基礎空間**
 * 被算出來（`championStatBase`，⛔ 不含 `combat-env` 的 ×factor），卻在**最終空間**
 * 被執行（`finalizeStat` 的 clamp 坐在 env 鏈之後）。⇒ 宣稱的「200×」在這 7 條裡
 * 一條都不成立，而 clamp 是**靜默**的：畫面上與引擎裡是兩個數字，沒有任何一行字說。
 *
 * ⛔ 這裡**不驗那 7 個數字是多少**（它們由 `pnpm statcaps:build` 產生，
 * `statCapsFresh.test.ts` 在守）。驗的是**機制**，兩個方向一起關：
 *   ① 基礎空間的柵欄**會**被 env 鏈抬一次 —— 抬不起來 = 每個人被靜默剃掉一個倍率
 *   ② 最終空間的柵欄**不會**被抬 —— 抬了就把 owner 直接給的 ms 18 / range 16
 *      靜默改成 14.4 / 9.6
 *
 * 突變紀錄（2026-08-20）：
 *   · `baseBonus.ts::finalizeStat` 的 `capCeiling(...)` 換回 `effectiveCap(...)`
 *     → ① 紅（生命上限被夾成 1/3）✅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { finalizeStat } from "./baseBonus";
import { COMBAT_ENV_DEFAULTS, type CombatEnvMultipliers } from "./combatEnv";
import { DEFAULT_STAT_CAPS, capFor, capSpaceFor } from "./statCaps";
import { Stat } from "./stats/statTypes";

/** ⛔ 不是出貨值 —— 一個**夾具**倍率，故意不是 1，才看得出「有沒有抬」。 */
const K = 3;
/** 只驗上限這一層：贈禮與每級加成關掉，否則斷言在量三件事。 */
const BARE = { baseBonus: {}, perLevelBonus: {} } as const;
const envWith = (key: keyof CombatEnvMultipliers): CombatEnvMultipliers =>
  Object.freeze({ ...COMBAT_ENV_DEFAULTS, [key]: K }) as CombatEnvMultipliers;

describe("屬性上限與被夾的值是同一個單位", () => {
  it("① 推導出來的柵欄是基礎值 —— 剛好站在柵欄上的英雄不會被剃掉一個倍率", () => {
    cover("statcap-space");
    const stat = Stat.MaxHealth;
    expect(capSpaceFor(stat), "生命上限應該是推導出來的那一批").toBe("base");
    // ⛔ 不抄字面值：柵欄從出貨表讀，倍率是夾具。
    const fence = capFor(DEFAULT_STAT_CAPS, stat).base;
    // 一位**基礎**生命剛好等於柵欄的英雄。最終值是 fence×K，而柵欄也該是 fence×K。
    expect(finalizeStat(fence, stat, { env: envWith("maxHealth"), ...BARE })).toBeCloseTo(
      fence * K,
      6,
    );
    // 再高一點就真的要被夾住 —— 柵欄仍然是柵欄，⛔ 不是被抬到無限大。
    expect(finalizeStat(fence * 2, stat, { env: envWith("maxHealth"), ...BARE })).toBeCloseTo(
      fence * K,
      6,
    );
  });

  it("② owner 直接給的柵欄（移速）是最終值 —— ⛔ 一律不抬", () => {
    cover("statcap-space");
    const stat = Stat.MoveSpeed;
    expect(capSpaceFor(stat), "移速上限是 owner 直接給的最終值").toBe("final");
    const fence = capFor(DEFAULT_STAT_CAPS, stat).base;
    // 抬了的話這裡會是 fence×K（穿牆平手線被靜默推翻）。
    expect(finalizeStat(fence, stat, { env: envWith("moveSpeed"), ...BARE })).toBeCloseTo(fence, 6);
  });
});
