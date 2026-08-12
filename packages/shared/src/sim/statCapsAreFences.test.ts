/**
 * 2026-08-12 · 極小/極大 = 硬上下限（owner 授權自訂：「寬鬆一點，不要太容易被
 * 上下限擋住，但太離譜還是會被限制」）。
 *
 * ⛔ 這裡**不驗那九個數字是多少** —— 它們有三個住處 + drift 測試在守（第二守則）。
 * ⭐ 驗的是那句話本身：**上限是圍欄，不是繩索**。今天出貨的每一張英雄卡都應該
 *    在界內；哪天有人被夾到，玩家看到的面板與引擎給的會是兩個數字（失敗形態②），
 *    而 clamp 是**靜默**的 —— 沒有這一條就沒有任何東西會說話。
 *
 * ⚠️ 自己一個檔，因為 `registerAll` 寫的是**行程全域**的登錄表
 *    （和 `auraCarrierContent.test.ts` 同一個理由）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Champions } from "./content/registry";
import { championStatBase } from "./stats/attributes";
import { DEFAULT_STAT_CAPS, capFor } from "./statCaps";
import { Stat } from "./stats/statTypes";

const CONTENT_DIR = join(__dirname, "../../../../content");
const docs = (c: string): Record<string, unknown>[] =>
  readdirSync(join(CONTENT_DIR, c))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, c, f), "utf-8")) as Record<string, unknown>);

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "config"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

describe("新加的硬上下限一個人都夾不到（圍欄不是繩索）", () => {
  // as/ap/lifesteal/cdr 是**刻意**的平衡天花板（攻速 4.0 就真的夾著人），不在此列。
  const DELIBERATE = new Set<Stat>([
    Stat.AttackSpeed,
    Stat.AbilityPower,
    Stat.Lifesteal,
    Stat.CooldownReduction,
  ]);

  /**
   * 🔴 **已知會被夾的**（不是缺陷，是規則正在做它該做的事）。
   *
   * owner 2026-08-12 定「硬上限 = 母體中位數 × 200」，而莉娜因巴斯變身態的
   * 每秒回魔是 **1,014.5**，母體中位是 4.63 —— **219 倍**，遠在 200× 之外。
   * 夾到 926 之後仍然等於無限魔力（中位的 200 倍），所以實質沒有變化。
   *
   * ⚠️ 這一格是**名單**不是豁免：新加一位就要在這裡寫下來並說出為什麼，
   * 而不是把斷言放寬。⛔ 名單長出來就是「上限訂得太緊」的訊號。
   */
  const KNOWN_OVER = new Set(["godie-h020 manaRegen"]);

  it("出貨英雄卡在等級 18 沒有意料之外的一條頂到 base 上限", () => {
    cover("statcaps-unit");
    const all = Champions.all();
    expect(all.length, "空母體會讓下面整段變成真空").toBeGreaterThan(50);
    const over: string[] = [];
    const seen: string[] = [];
    for (const stat of Object.keys(DEFAULT_STAT_CAPS) as Stat[]) {
      if (DELIBERATE.has(stat)) continue;
      const { base } = capFor(DEFAULT_STAT_CAPS, stat);
      for (const d of all) {
        const v = championStatBase(d, stat, 18);
        if (v <= base) continue;
        const key = `${d.id} ${stat}`;
        (KNOWN_OVER.has(key) ? seen : over).push(`${key}=${v} > ${base}`);
      }
    }
    expect(over, "意料之外被夾住的英雄（上限太緊，或這張卡真的離譜了）").toEqual([]);
    // ⭐ 反向也要守：名單上的那些**必須真的還在超標**。修好了就要把它從名單刪掉，
    //    否則名單會變成一份沒有人再讀的豁免清單（第三守則）。
    expect(seen.length, "KNOWN_OVER 有過期的項目").toBe(KNOWN_OVER.size);
  });
});
