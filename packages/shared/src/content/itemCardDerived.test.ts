/**
 * ⛔ **卡面上的魔抗百分比不可以是手寫的字面值。**（owner 2026-08-18：「請你實作
 * 魔抗百分比避免**數字誤差**及**過期**」）
 *
 * 兩條，各關掉一種失敗：
 *   ① 出貨掃描 —— 每一件印著「魔抗+N%」的道具，渲染後的數字必須等於**管線算出來**
 *      的那一個。新道具照抄 `raw/(raw+100)` 進來就會紅。
 *   ② 旋鈕連動 —— 改 `magicResistMult` 之後數字要跟著動。這條擋的是「今天改對了、
 *      明天 owner 動旋鈕又變成謊話」，而那種過期**沒有任何既有守衛會叫**。
 *
 * 突變紀錄：`itemCardDerived.ts::envChainFactor` 改成 `return 1`（＝忘記乘後台倍率）
 * → ① 紅：`godie-i02d` 期望 28.6 實得 66.7；改回來 → 綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMBAT_ENV_DEFAULTS,
  STAT_ENV_CHAIN,
  normalizeCombatEnv,
  statEnvFactor,
  type CombatEnvMultipliers,
} from "../sim/combatEnv";
import { Stat } from "../sim/stats/statTypes";
import { parseItemCard } from "./itemCardText";
import { DEFAULT_ITEM_CARD } from "./schema/config";
import { magicResistMitigationPct, withDerivedNumbers } from "./itemCardDerived";
import { shippedItemIds } from "../../testkit/shippedSurface";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ITEMS = join(CONTENT, "items");

/**
 * ⛔ **出貨的**倍率表，不是 `COMBAT_ENV_DEFAULTS`。
 *
 * 這一行是這條守衛能不能抓到東西的全部：TS 的預設 `magicResistMult` 是中性的
 * **1.0**，而 `content/config/combat-env.json` 出貨 **0.2**。拿預設來驗，
 * 66.7% 會等於 66.7%，兩條斷言全綠而卡片照樣說謊 —— 失敗形態⑤（被測的不是
 * 出貨的那個）。實測過：先寫成預設表時，這條守衛在缺陷還在的情況下是綠的。
 */
function shippedEnv(): CombatEnvMultipliers {
  const doc = JSON.parse(readFileSync(join(CONTENT, "config", "combat-env.json"), "utf8")) as {
    multipliers?: Record<string, number>;
  };
  return normalizeCombatEnv(doc.multipliers ?? null);
}

interface ItemDoc {
  id?: string;
  name?: string;
  description?: string;
  modifiers?: { stat?: string; op?: string; value?: number }[];
}

/**
 * ⚠️ 這一支以前叫 `shippedItems()` 而回的是 `readdirSync(content/items)` 的**全部 142 件**
 * —— 名字在說謊（第三守則）。2026-08-21 量到出貨樹裡有 **53 件玩家一場都拿不到**
 * （`weaponShelfOpen` 出貨是 false，而它們也不在任何一張獎池裡）。
 *
 * ⭐ 現在它真的只回上架面（GH#472，owner：「沒開放的別浪費 token」），
 * 而上架面是**推導**的 —— owner 在後台把貨架打開，這裡自己就變多，⛔ 不必改測試。
 */
function shippedItems(): ItemDoc[] {
  const open = shippedItemIds(REPO);
  return readdirSync(ITEMS)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(ITEMS, f), "utf8")) as ItemDoc)
    .filter((d) => typeof d.id === "string" && open.has(d.id));
}

/** 卡面上「魔抗+N%」那一行印出來的數字（沒有這一行 → null）。 */
function printedMrPct(doc: ItemDoc, env: CombatEnvMultipliers = shippedEnv()): number | null {
  const card = withDerivedNumbers(parseItemCard(doc.description ?? "", DEFAULT_ITEM_CARD), {
    modifiers: doc.modifiers,
    env,
  });
  for (const line of card.efficacy) {
    const text = line.tokens.map((t) => t.text).join("").trim();
    const m = /^(?:魔抗|魔法抗性)\s*[+＋]\s*(\d+(?:\.\d+)?)\s*[%％]$/.exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

describe("魔抗百分比是**算出來的**，⛔ 不是文案裡的字面值", () => {
  it("★ 每一件印著魔抗 % 的出貨道具，卡面數字 = 管線算出來的減傷", () => {
    const env = shippedEnv();
    const rows = shippedItems()
      .map((d) => ({ doc: d, printed: printedMrPct(d, env) }))
      .filter((r) => r.printed !== null);
    expect(rows.length, "一件都沒掃到 —— 這條守衛在空轉").toBeGreaterThan(0);

    const wrong = rows
      .map(({ doc, printed }) => {
        const mr = (doc.modifiers ?? [])
          .filter((m) => m.stat === "mr" && m.op === "flat")
          .reduce((a, m) => a + (m.value ?? 0), 0);
        // ⛔ **這裡刻意重寫一次減傷曲線，不呼叫 `magicResistMitigationPct`。**
        // 兩邊呼叫同一支函式的話這條斷言是恆等式：把那支函式改壞（例如忘了乘後台
        // 倍率），左右兩邊會**一起**變成錯的同一個數字而測試全綠。實測過。
        // 倍率鏈本身仍然讀 `STAT_ENV_CHAIN`（那是設定不是公式），寫死的只有
        // `eff/(100+eff)` —— 也就是 `combat/penetration.ts` 那條曲線的規格。
        const eff =
          mr * (STAT_ENV_CHAIN[Stat.MagicResist] ?? []).reduce((a, l) => a * statEnvFactor(l, env), 1);
        const want = Math.round(((100 * eff) / (100 + eff)) * 10) / 10;
        return { id: doc.id, name: doc.name, mr, printed, want };
      })
      .filter((r) => Math.abs((r.printed ?? 0) - r.want) > 0.05);
    expect(
      wrong,
      [
        "這幾張卡印的魔抗減傷不是引擎會給的那一個 —— 玩家會照著它做取捨：",
        ...wrong.map((w) => `  · ${w.id}（${w.name}）mr ${w.mr} → 卡面 ${w.printed}%，實際 ${w.want}%`),
        "⛔ 修法不是改文案的字面值（那是第四個住處），是讓它走 withDerivedNumbers。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("★ 後台旋鈕 magicResistMult 動了，卡面就跟著動（⛔ 不會過期）", () => {
    const env = shippedEnv();
    const doubled = { ...env, magicResistMult: env.magicResistMult * 2 };
    expect(magicResistMitigationPct(200, doubled)).toBeGreaterThan(magicResistMitigationPct(200, env));
    // 而且渲染路徑真的吃到它 —— ⛔ 不是只有那支純函式會動。
    const doc = shippedItems().find((d) => d.id === "godie-i02d");
    expect(printedMrPct(doc!, doubled)).not.toBe(printedMrPct(doc!, env));
    // ⚠️ 出貨表與中性表**不同**，這條守衛才不是在驗一個恆等式。
    expect(env.magicResistMult).not.toBe(COMBAT_ENV_DEFAULTS.magicResistMult);
  });
});
