/**
 * 基礎加成 後台頁的守衛 (owner 2026-07-28).
 *
 * ⚠️ 這一組守的東西不是「按鈕會不會存」,而是**兩個 300 是不是同一個 300**:
 * 後台顯示的、sim 真正加上去的、以及出貨內容檔寫的。三者只要有一個漂掉,玩家
 * 血量就跟後台不一樣,而且沒有任何地方會報錯 —— 那正是 v0.9.8 發生過的事
 * (加在倍率之前,後台寫 300、玩家拿到 900)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat, ALL_STATS } from "@ggd/shared/sim/stats/statTypes";
import {
  DEFAULT_BASE_BONUS,
  baseBonusFor,
  baseBonusFromDoc,
  finalizeStat,
} from "@ggd/shared/sim/baseBonus";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import {
  BONUS_DOC_ID,
  BONUS_SCHEMA,
  bonusDocFor,
  bonusRows,
  bonusSummary,
  extractBonus,
  forgetBonus,
  setBonus,
} from "./baseBonus";

const REPO = join(__dirname, "../../..");

describe("基礎加成 後台頁 (adminui-base-bonus)", () => {
  it("沒讀到文件 → 每一格顯示出貨預設;讀到空文件 → 每一格是 0", () => {
    cover("adminui-base-bonus");
    // 這兩個狀態差 300 點血,而且畫面上長得很像。壓成同一個是這一頁最容易犯的錯:
    // 一份還沒寫過的空 overlay 會讓面板宣稱「生命加成 0」,而伺服器仍然給 300。
    const unread = bonusRows(null);
    const empty = bonusRows({});
    const hp = (rows: ReturnType<typeof bonusRows>): number =>
      rows.find((r) => r.stat === Stat.MaxHealth)!.effective;
    expect(hp(unread)).toBe(300);
    expect(hp(empty)).toBe(0);
  });

  it("每個 stat 都有一列,而且順序就是 ALL_STATS", () => {
    cover("adminui-base-bonus");
    const rows = bonusRows({});
    expect(rows.map((r) => r.stat)).toEqual([...ALL_STATS]);
    for (const r of rows) expect(r.label, `${r.stat} 沒有中文標籤`).not.toBe("");
  });

  it("0 是一個真值(「這一項沒有贈禮」),不是清除", () => {
    cover("adminui-base-bonus");
    const doc = setBonus({ maxHealth: 300 }, Stat.MaxHealth, 0);
    expect(doc.maxHealth).toBe(0);
    const row = bonusRows(doc).find((r) => r.stat === Stat.MaxHealth)!;
    expect(row.operator).toBe(0); // 設定過
    expect(row.effective).toBe(0);
    // 而「清除」才是真的把 key 拿掉
    expect(forgetBonus(doc, Stat.MaxHealth)).not.toHaveProperty("maxHealth");
  });

  it("拒收 schema 不對的文件 —— 倍率表不會被當成加數表讀進來", () => {
    cover("adminui-base-bonus");
    // 具體的災難:把 戰鬥系統 的表存到這裡。`maxHealth: 3` 當成加數只是 +3 點血
    // (無害),但 `damageDealt: 0.5` 之類的值被當成加數就完全是另一回事。
    expect(extractBonus({ schema: "config.combat-env@1", bonus: { maxHealth: 3 } })).toEqual({});
    expect(extractBonus({ schema: BONUS_SCHEMA, bonus: { maxHealth: 300 } })).toEqual({
      maxHealth: 300,
    });
    expect(extractBonus(null)).toEqual({});
  });

  it("PUT 出去的永遠是完整的表,而且 sim 讀得回來", () => {
    cover("adminui-base-bonus");
    // 端到端:後台寫什麼,`baseBonusFromDoc` 就讀到什麼。這是兩邊唯一的介面。
    const doc = bonusDocFor(setBonus({}, Stat.MaxHealth, 450));
    expect(doc.id).toBe(BONUS_DOC_ID);
    expect(doc.schema).toBe(BONUS_SCHEMA);
    expect(baseBonusFor(baseBonusFromDoc(doc), Stat.MaxHealth)).toBe(450);
  });

  it("後台填的數字就是玩家多拿的數字 —— 倍率 3.0 之下仍然是它", () => {
    cover("adminui-base-bonus");
    // 這是整個功能的一句話,寫成一條可執行的斷言。
    const table = baseBonusFromDoc(bonusDocFor({ maxHealth: 300 }));
    const env = normalizeCombatEnv({ maxHealth: 3.0 });
    const card = 500;
    expect(finalizeStat(card, Stat.MaxHealth, env, table)).toBe(card * 3 + 300);
    // 明確不是 v0.9.8 的讀法(加在 base 裡 → 被乘成 +900)
    expect(finalizeStat(card, Stat.MaxHealth, env, table)).not.toBe((card + 300) * 3);
  });

  it("出貨內容檔、程式預設、後台面板三者是同一個數字", () => {
    cover("adminui-base-bonus");
    const doc = JSON.parse(
      readFileSync(join(REPO, "content/config/base-bonus.json"), "utf8"),
    ) as { schema: string; bonus: Record<string, number> };
    expect(doc.schema).toBe(BONUS_SCHEMA);
    // 內容檔 == 程式預設
    expect(baseBonusFor(baseBonusFromDoc(doc), Stat.MaxHealth)).toBe(
      baseBonusFor(DEFAULT_BASE_BONUS, Stat.MaxHealth),
    );
    // 程式預設 == 面板在「還沒讀到文件」時顯示的值
    const shipped = bonusRows(null).find((r) => r.stat === Stat.MaxHealth)!;
    expect(shipped.effective).toBe(baseBonusFor(DEFAULT_BASE_BONUS, Stat.MaxHealth));
  });

  it("摘要說得出實際生效的內容", () => {
    cover("adminui-base-bonus");
    expect(bonusSummary(bonusRows({}))).toContain("沒有任何");
    expect(bonusSummary(bonusRows({ maxHealth: 300 }))).toContain("生命上限 +300");
  });
});
