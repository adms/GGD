/**
 * 面板顯示的攻速天花板必須是玩家真的碰得到的那一個 (#125 + GH#286).
 *
 * ⚠️ 這一組對著兩個真實存在過的失敗形狀:
 *   ② 伺服器算好了但沒送出去 —— 那條線在 matchRoomStatCaps.test.ts 上守著。
 *   ⑤ 受測的不是出貨的東西 —— 所以這裡斷言 `championSheetRows` 的**輸出數字**,
 *     不是「有沒有呼叫 finalizeStat」,也不是 `resolveStatCaps` 的回傳物件形狀。
 *
 * 最貴的那個 bug 在這一頁的樣子:大廳沒有 MatchState,`statCapsJson` 是空字串。
 * 退回**空表**的話 `capFor` 會塌成 `base === unlocked`,面板於是永遠說「攻速最多
 * 4.0」,而伺服器讓一支解鎖技能把它推到 10.0 —— 一個「看起來完全合理」的數字。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { normalizeBaseBonus } from "@ggd/shared/sim/baseBonus";
import { capFor, effectiveCap, normalizeStatCaps } from "@ggd/shared/sim/statCaps";
import type { AttributeCarrier } from "@ggd/shared/sim/stats/attributes";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { championSheetRows } from "./championSheet";
import { computeStatBlock, type ChampionStatContext } from "./panels/statPreview";
import { parseStatCapsJson, resolveStatCaps } from "./displayStatCaps";

/**
 * TWO cards, because `championSheetRows` has TWO branches and each one calls
 * `finalizeStat` on its own line:
 *   · NO `attributes` → the doc value IS the base (the 「hand-edited key」 path)
 *   · WITH `attributes` → the base comes from `championStatBase` (三圍, #248)
 * A test that only exercises one of them lets a mutation of the other survive —
 * that is exactly what the first mutation run found here.
 */
const FLAT = {
  baseStats: { maxHealth: 500, ad: 10, as: 99 },
  growth: {},
} as unknown as AttributeCarrier;

const DERIVED = {
  baseStats: { maxHealth: 500, ad: 10, as: 1 },
  growth: {},
  // 敏捷 → 攻速 (#248):這張卡的 `as` 是算出來的,走的是另一條分支。
  attributes: {
    str: 1,
    agi: 100000,
    int: 1,
    strGrowth: 0,
    agiGrowth: 0,
    intGrowth: 0,
    primary: "agi",
  },
} as unknown as AttributeCarrier;

const asFinalOf = (
  card: AttributeCarrier,
  caps?: Parameters<typeof championSheetRows>[3],
): number =>
  championSheetRows(card, DEFAULT_COMBAT_ENV, normalizeBaseBonus({}), caps).find(
    (r) => r.key === "as",
  )!.final as number;

const asFinal = (caps?: Parameters<typeof championSheetRows>[3]): number =>
  asFinalOf(FLAT, caps);

describe("面板的攻速天花板 (client-caps-display)", () => {
  it("預設面板印一般上限 4.0", () => {
    cover("client-caps-display");
    expect(asFinal()).toBe(4.0);
  });

  it("後台把一般上限調到 5.0 → 面板跟著印 5.0,不是寫死的 4.0", () => {
    cover("client-caps-display");
    // 突變「championSheetRows 忽略 caps 參數」會在這裡紅。
    expect(asFinal(normalizeStatCaps({ as: { base: 5, unlocked: 12 } }))).toBe(5.0);
  });

  it("三圍算出來的那一列也吃同一張表 —— 兩條分支都要讀 caps", () => {
    cover("client-caps-display");
    // 這一條是第一輪突變測試補上的:`championSheetRows` 有兩個 `finalizeStat`
    // 呼叫點,只測其中一個的話,另一個被改壞也不會紅(失敗形狀 ⑤)。
    expect(asFinalOf(DERIVED)).toBe(4.0);
    expect(asFinalOf(DERIVED, normalizeStatCaps({ as: { base: 5, unlocked: 12 } }))).toBe(5.0);
  });

  it("⚠️ 大廳(空 wire)退回出貨預設,不是空表 —— 空表會讓解鎖顯示消失", () => {
    cover("client-caps-display");
    for (const junk of ["", null, undefined, "{not json"]) {
      const t = resolveStatCaps(junk);
      expect(capFor(t, Stat.AttackSpeed)).toEqual({ base: 4, unlocked: 10 });
      // 這一行才是重點:空表的症狀是 unlocked 塌回 base,解鎖從畫面上蒸發。
      expect(effectiveCap(t, Stat.AttackSpeed, 999)).toBe(10);
    }
  });

  it("wire 真的帶了一份表(哪怕是空的),那就是這一場的權威值", () => {
    cover("client-caps-display");
    // 帶了空表 = 這一場沒有任何屬性可解鎖(操作者的決定),面板必須照說。
    expect(effectiveCap(resolveStatCaps("{}"), Stat.AttackSpeed, 999)).toBe(4);
    expect(
      effectiveCap(resolveStatCaps('{"as":{"base":6,"unlocked":20}}'), Stat.AttackSpeed, 999),
    ).toBe(20);
  });

  it("商店預覽也吃同一張表 —— 解鎖後的攻速不會被預覽夾在 4.0", () => {
    cover("client-caps-display");
    registerSkeletonContent();
    const ctx: ChampionStatContext = {
      championId: "sela",
      level: 1,
      abilityRanks: [1, 0, 0, 0],
      items: ["", "", "", "", "", ""],
      augments: [],
      statCapstonePct: 0,
      // 一件「攻速 +1000%」的假想裝備由 augment 進不來,所以直接把 base 上限拉高:
      // 這一條問的是「預覽有沒有讀那張表」,不是「解鎖從哪來」。
      statCaps: normalizeStatCaps({ as: { base: 7, unlocked: 12 } }),
    };
    const block = computeStatBlock({
      ...ctx,
      // 用一大坨敏捷(→ 攻速)把它頂到天花板 —— 沒有這一步,英雄的裸攻速離上限
      // 太遠,兩種實作(讀表 / 寫死 4.0)會給出同一個答案(失敗形狀 ④)。
      attrBonus: [0, 100000, 0],
    })!;
    expect(block[Stat.AttackSpeed]).toBe(7);
    // 寫死 STAT_CLAMPS 的預覽會給 4。
    expect(block[Stat.AttackSpeed]).not.toBe(4);
  });

  it("parseStatCapsJson 分得出「沒帶」與「帶了一份空表」", () => {
    cover("client-caps-display");
    expect(parseStatCapsJson("")).toBeNull();
    expect(parseStatCapsJson(undefined)).toBeNull();
    expect(parseStatCapsJson("{bad")).toBeNull();
    expect(parseStatCapsJson("{}")).toEqual({});
    expect(parseStatCapsJson('{"as":{"base":4,"unlocked":10}}')).toEqual({
      as: { base: 4, unlocked: 10 },
    });
  });
});
