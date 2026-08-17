/**
 * ⛔ **每一階寶具抽獎都要有一張真的存在、而且抽得到東西的池**。
 *
 * ## 為什麼需要這一條
 *
 * `config.arena-rules@1.weaponTiers` 的每一列有一個 `table` 字串。
 * `sim/economy/weaponTiers.ts` 的 `pickWeaponTable()` 收一個 `hasEligible(table)` 探針，
 * **中了但探不到東西就繼續往下讓** —— 那個 fail-open 是對的（一張暫時空掉的池不應該
 * 讓整個三選一發不出來），但它是**完全靜默**的。
 *
 * 2026-08-18 量到的後果：`ex-origin`（[EX∅ 根源]，第 10–12 回合、8%、每隊限 1）
 * 指向 `ex-origin-weapons`，而**那個檔案從一開始就不存在**。於是那一整階
 * **永遠不會中**，而且：
 *   · `content:build` 綠 —— 它只驗每一份文件自己，不驗這個跨文件的**關係**
 *   · Zod 綠 —— `table` 只是一個字串，schema 不知道它該指向什麼
 *   · 全套測試綠 —— 沒有任何一條在問這個問題
 *   · 遊戲裡玩起來也「正常」—— 因為它安靜地讓給下一階了
 *
 * ⭐ 這是 CLAUDE.md「fail-open 沒錯，**靜默**才是缺陷」的教科書案例：選擇 fail-open
 * 的同時，必須有一個**會回非零、或畫面上擋不掉**的東西說出來。這一條就是那個東西。
 *
 * ⚠️ 而且它是**兩個名詞的關係**（config 的一列 ↔ loot-tables 的一個檔），
 * 不是「config 有沒有壞」或「池子有沒有壞」——分別檢查每一半永遠是綠的
 * （見 CLAUDE.md 的配對式後置條件那一節）。
 *
 * 突變紀錄：把 `content/loot-tables/ex-origin-weapons.json` 改名 → 這一條紅並指名
 * 「ex-origin → ex-origin-weapons」；改回來 → 綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

interface TierRow {
  id?: string;
  label?: string;
  table?: string;
}

function arenaRules(): { weaponTiers?: TierRow[] } {
  return JSON.parse(readFileSync(join(CONTENT, "config", "arena-rules.json"), "utf8")) as {
    weaponTiers?: TierRow[];
  };
}

/** 每一張 loot table 的 id → 它有幾個 entry。⛔ 從磁碟讀，不是從一份名單。 */
function lootTables(): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of readdirSync(join(CONTENT, "loot-tables"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "loot-tables", f), "utf8")) as {
      id?: string;
      entries?: unknown[];
    };
    if (doc.id) out.set(doc.id, doc.entries?.length ?? 0);
  }
  return out;
}

/** 出貨樹裡真的存在的道具 id（⛔ `content/_legacy/` 裡的不算 —— 那些已經退場了）。 */
function shippedItemIds(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(join(CONTENT, "items"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    out.add(f.slice(0, -5));
  }
  return out;
}

/**
 * ⛔ **具名保留** —— 不是把守衛放寬，是把「這一階是刻意還沒有內容」寫下來。
 *
 * ⭐ 這條守衛的價值全部來自它能分辨**兩件長得一模一樣的事**：
 *   · 有人忘了建那張池（缺陷，要紅）
 *   · 這一階刻意留白等內容（設計，不該紅）
 * 靠推論分不出來 —— 所以它必須**被宣告**。加一列進來就是在說「我知道它是空的」。
 *
 * ⚠️ 加一列之前先確認這真的是 owner 的決定，⛔ 不要拿它來消一個紅燈。
 * ⚠️ 而且它**會過期**：下面第三條在那張池真的出現時就會紅，提醒把這一列刪掉。
 *
 * ⭐ 現在是**空的**，而那正是它該有的樣子：2026-08-18 唯一的一列（`ex-origin`）已經
 * 隨著 `content/loot-tables/ex-origin-weapons.json` 真的被建出來而刪掉了 ——
 * 這條清單的第三條守衛（下面）就是為了逼出這一刪。
 */
const RESERVED_TIERS: Record<string, string> = {};

describe("寶具抽獎的每一階都指向一張真的池（config ↔ loot-tables 的**關係**）", () => {
  it("★ 沒有任何一階指向不存在的池 —— ⛔ 靜默讓位是失敗形態②", () => {
    const tiers = arenaRules().weaponTiers ?? [];
    expect(tiers.length, "weaponTiers 是空的 —— 這條守衛在空轉").toBeGreaterThan(0);

    const tables = lootTables();
    const broken = tiers
      .filter((t) => t.table !== undefined && !tables.has(t.table))
      .filter((t) => !(t.id !== undefined && t.id in RESERVED_TIERS))
      .map((t) => `${t.id ?? "?"}（${t.label ?? "?"}）→ ${t.table}`);
    expect(
      broken,
      [
        "這幾階的 `table` 指向一張**不存在**的 loot table。",
        "⚠️ 它們不會報錯 —— `pickWeaponTable` 的 `hasEligible` 探不到就往下讓，",
        "所以那一整階**永遠不會中**，而畫面上、日誌裡、測試裡都看不出來：",
        ...broken.map((b) => `  · ${b}`),
        "修法：建 `content/loot-tables/<table>.json`，或把那一列從 arena-rules 拿掉。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("★ 具名保留會過期 —— 那張池一出現，這一列就該被刪掉", () => {
    const tables = lootTables();
    const tiers = arenaRules().weaponTiers ?? [];
    const stale = Object.keys(RESERVED_TIERS).filter((id) => {
      const row = tiers.find((t) => t.id === id);
      return row?.table !== undefined && tables.has(row.table);
    });
    expect(
      stale,
      [
        "這幾階的池已經存在了，`RESERVED_TIERS` 的對應條目變成過期的謊話 —— 刪掉它們：",
        ...stale.map((s) => `  · ${s}`),
      ].join("\n"),
    ).toEqual([]);
    // 保留清單裡指的階也必須真的還在 config 裡（整階被拿掉 ⇒ 這一列也是死的）。
    const orphan = Object.keys(RESERVED_TIERS).filter((id) => !tiers.some((t) => t.id === id));
    expect(orphan, `這幾階已經不在 arena-rules 裡了，保留條目要刪掉：${orphan.join(", ")}`).toEqual(
      [],
    );
  });

  it("★ 每一階的池裡至少有一件**真的存在**的道具（空池 = 同一個靜默失效）", () => {
    const tiers = arenaRules().weaponTiers ?? [];
    const items = shippedItemIds();
    const empty: string[] = [];
    for (const t of tiers) {
      if (t.table === undefined) continue;
      const path = join(CONTENT, "loot-tables", `${t.table}.json`);
      if (!existsSync(path)) continue; // 上一條已經在管它了
      const doc = JSON.parse(readFileSync(path, "utf8")) as { entries?: { itemId?: string }[] };
      const alive = (doc.entries ?? []).filter((e) => e.itemId && items.has(e.itemId));
      if (alive.length === 0) empty.push(`${t.id ?? "?"} → ${t.table}`);
    }
    expect(
      empty,
      [
        "這幾階的池是空的、或裡面每一件都已經退場到 `content/_legacy/` 了 ——",
        "後果與上一條完全相同：那一階永遠不會中，而且沒有任何東西會叫。",
        ...empty.map((e) => `  · ${e}`),
      ].join("\n"),
    ).toEqual([]);
  });
});
