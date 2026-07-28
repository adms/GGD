/**
 * `capRaise` 在道具卡 / 裝備欄 / 三選一卡片上長什麼樣 (GH#286 稽核).
 *
 * ⚠️ 這是 #125「顯示的數字必須是玩家真正拿到的」在 `ModOp.CapRaise` 上的樣子,
 * 而它有兩個各自獨立的說謊方式:
 *
 *   ① **單位錯了**。`capRaise as 10` 給的攻速是 **0**;它只是把天花板搬到 10.0。
 *      當成一般加成排版的話,卡片會寫「攻擊速度 +10」—— 一個玩家買下去之後
 *      永遠對不上的數字(他的攻速可能還是 0.7)。
 *   ② **合併規則錯了**。`mergeItemModifiers` 把同 stat 同 op 的值**相加**,而
 *      sim 對 `capRaise` 取的是 **max**(statPipeline.ts / statCaps.ts)。所以
 *      兩個 `capRaise 5` 的來源在卡片上是 10、在 sim 裡是 5。這一條特別惡毒:
 *      兩個數字都「合理」,沒有任何東西會壞掉,只是卡片在騙人。
 *
 * 這一支對著行為斷言(**渲染出來的那一行字**),不是對著函式的中間形狀。
 */
import { describe, it, expect } from "vitest";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { mergeItemModifiers, formatAuthoredBonus, buildItemRow } from "./itemStats";

describe("capRaise 的卡片文案 (statcaps-chip)", () => {
  it("不排版成一般加成 —— 「+10」是玩家永遠拿不到的攻速", () => {
    const line = formatAuthoredBonus({
      stat: Stat.AttackSpeed,
      op: ModOp.CapRaise,
      value: 10,
    });
    // 錯誤實作(當成 Flat 排版)會給這一行:
    expect(line).not.toBe("攻擊速度 +10");
    // 對的實作要說清楚它是一個天花板,而且 10 這個數字仍然要出現。
    expect(line).toContain("10");
    expect(line).toContain("上限");
    expect(line).not.toContain("+");
  });

  it("同一件道具上的兩個 capRaise 取 max —— 和 sim 同一條規則,不是相加", () => {
    const merged = mergeItemModifiers([
      { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 5 },
      { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 7 },
    ]);
    expect(merged).toHaveLength(1);
    // 相加的實作給 12(而且 sim 給 7);先到先贏的實作給 5。三個答案互不相同。
    expect(merged[0]!.value).toBe(7);
    expect(merged[0]!.value).not.toBe(12);
    expect(merged[0]!.value).not.toBe(5);
  });

  it("一般加成仍然照舊相加 —— 修法沒有波及 Flat/PercentAdd", () => {
    const merged = mergeItemModifiers([
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 10 },
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 15 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.value).toBe(25);
  });

  it("道具卡的 secondary 欄真的印出那一行(不只是函式回傳值)", () => {
    const row = buildItemRow(
      {
        id: "t-unlock-blade",
        name: "解限之刃",
        description: undefined,
        modifiers: [
          { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 10 },
          { stat: Stat.AttackDamage, op: ModOp.Flat, value: 30 },
        ],
      },
      Stat.AttackDamage,
    );
    // 錨定欄吃掉 ad 的 flat;capRaise 留在 secondary,而且不是「攻擊速度 +10」。
    expect(row.anchorText).toBe("30");
    expect(row.secondary).toHaveLength(1);
    expect(row.secondary[0]).not.toBe("攻擊速度 +10");
    expect(row.secondary[0]).toContain("上限");
  });
});
