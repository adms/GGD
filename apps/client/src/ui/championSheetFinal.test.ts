/**
 * 「戰鬥實際」那一欄必須真的是玩家拿到的數字 (#125 + owner 2026-07-28).
 *
 * ⚠️ 這一組是補一個**真的存在過的洞**。v0.9.9 把基礎加成從 `championStatBase`
 * 搬到 `finalizeStat`(倍率之後),sim 那邊有六條守衛,顯示這邊一條都沒有 ——
 * 我自己設計的兩個突變(把 `final` 改成直接回 base、把缺 wire 的 fallback 改成
 * 空表)**全部通過了 1,730 條 client 測試**。
 *
 * 面板少 300 點血看起來只是「一個比較小的合理數字」,沒有人會覺得不對,而它正是
 * 玩家會截圖來問的那個數字。所以這裡直接斷言**兩邊相等**,而不是斷言「有呼叫
 * finalizeStat」—— 後者是掃原始碼(失敗形狀 ⑥),前者是行為。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import {
  DEFAULT_BASE_BONUS,
  baseBonusFor,
  normalizeBaseBonus,
  type BaseBonusTable,
} from "@ggd/shared/sim/baseBonus";
import type { AttributeCarrier } from "@ggd/shared/sim/stats/attributes";
import { championSheetRows } from "./championSheet";
import { parseBaseBonusJson, resolveBaseBonus } from "./displayBaseBonus";

/** A card with a raw hull and a STR block, like every imported champion. */
const CARD = {
  baseStats: { maxHealth: 500, ad: 10, armor: 2, ms: 5.8 },
  growth: { maxHealth: 40 },
  attributes: { str: 20, agi: 10, int: 5, strGrowth: 1.8, agiGrowth: 1, intGrowth: 0.5, primary: "str" },
} as unknown as AttributeCarrier;

const hpRow = (env = DEFAULT_COMBAT_ENV, bonus: BaseBonusTable = DEFAULT_BASE_BONUS) =>
  championSheetRows(CARD, env, bonus).find((r) => r.key === "maxHealth")!;

describe("championSheet 的 戰鬥實際 欄 (client-sheet-final)", () => {
  it("最終值 = 基礎 × 倍率 + 基礎加成 —— 加成沒有被倍率放大", () => {
    cover("client-sheet-final");
    const env = normalizeCombatEnv({ maxHealth: 3.0 });
    const row = hpRow(env, normalizeBaseBonus({ maxHealth: 300 }));
    expect(row.base).toBeDefined();
    // 這一行就是整條規則。突變「final 直接回 base」或「final = base × env」
    // 都會在這裡紅。
    expect(row.final).toBeCloseTo((row.base as number) * 3.0 + 300, 6);
    // 明確不是另外兩種讀法
    expect(row.final).not.toBeCloseTo((row.base as number) * 3.0, 6);
    expect(row.final).not.toBeCloseTo(((row.base as number) + 300) * 3.0, 6);
  });

  it("加成 0 的屬性,最終值就是純倍率 —— 不會被平白加東西", () => {
    cover("client-sheet-final");
    const env = normalizeCombatEnv({ maxHealth: 3.0, attackDamage: 2 });
    const rows = championSheetRows(CARD, env, normalizeBaseBonus({ maxHealth: 300 }));
    const ad = rows.find((r) => r.key === "ad")!;
    expect(baseBonusFor(normalizeBaseBonus({ maxHealth: 300 }), Stat.AttackDamage)).toBe(0);
    expect(ad.final).toBeCloseTo((ad.base as number) * 2, 6);
  });

  it("夾限仍然管得到最終值 —— 加成不是繞過上限的後門", () => {
    cover("client-sheet-final");
    // 攻速上限 2.5 (#267)。一份把攻速加成調到 99 的後台設定不該讓面板印 99。
    const rows = championSheetRows(
      { ...CARD, baseStats: { ...CARD.baseStats, as: 1 } } as unknown as AttributeCarrier,
      DEFAULT_COMBAT_ENV,
      normalizeBaseBonus({ as: 99 }),
    );
    expect(rows.find((r) => r.key === "as")!.final).toBe(2.5);
  });

  it("拿不到 wire 表時退回內容/出貨預設,不是 0", () => {
    cover("client-sheet-final");
    // 大廳沒有 MatchState,`baseBonusJson` 是空字串。退回空表的話,選角畫面會比
    // 玩家實際拿到的少 300,而伺服器照樣給 —— 兩個數字不一樣,而且沒有人會說。
    expect(baseBonusFor(resolveBaseBonus(""), Stat.MaxHealth)).toBe(300);
    expect(baseBonusFor(resolveBaseBonus(null), Stat.MaxHealth)).toBe(300);
    expect(baseBonusFor(resolveBaseBonus("{not json"), Stat.MaxHealth)).toBe(300);
    // 但 wire 真的帶了一份表(哪怕是空的),那就是這一場的權威值
    expect(baseBonusFor(resolveBaseBonus("{}"), Stat.MaxHealth)).toBe(0);
    expect(baseBonusFor(resolveBaseBonus('{"maxHealth":777}'), Stat.MaxHealth)).toBe(777);
  });

  it("parseBaseBonusJson 分得出「沒帶」與「帶了一份空表」", () => {
    cover("client-sheet-final");
    expect(parseBaseBonusJson("")).toBeNull();
    expect(parseBaseBonusJson(undefined)).toBeNull();
    expect(parseBaseBonusJson("[]")).toEqual({}); // 陣列不是表,但也不是「沒帶」
    expect(parseBaseBonusJson('{"maxHealth":300}')).toEqual({ maxHealth: 300 });
  });
});
