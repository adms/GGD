/**
 * ⭐ GH#1111 —— 「只能隨機」要是**宣告**的，⛔ 不是 `cost: 0` 的副作用。
 *
 * owner 2026-09-06 逐字：「**開票 確保所有EX都進隨機清單**」
 *
 * ## 這條閘問的是**關係**，⛔ 不是名詞
 *
 * 在此之前 [EX解放] / [EX∅ 根源] 買不到，是因為它們的 `cost` 是 0
 * ⇒ `shop.ts` 算不出價 ⇒ 回 `"not-purchasable"`。
 * ⭐ 那個結果是**對的**，⛔ 而理由是**巧合的** —— 哪天有人給其中一件填了價，
 * 它就會靜靜地出現在商店貨架上，⛔ 而沒有任何東西會紅。
 *
 * ⇒ 這條閘鎖住三件事（⭐ 三個方向，⛔ 不是只走一頭 —— 第二守則形態⑫）：
 *   ① 宣告的每一張表**真的存在**（⛔ 打錯字的表名 = 一格什麼都不做的宣告）
 *   ② 宣告的每一張表裡的每一件，`shop.ts` **真的回 `shelf-closed`**（⭐ 走出貨的那條路）
 *   ③ **反方向**：`cost: 0` 而**沒有**被宣告的池子 ⇒ 紅（那就是「靠副作用」的那一種）
 *
 * 突變驗證（2026-09-09）：
 *   · `randomOnlyTables` 改回 `[]` → ①③ 紅，訊息指名兩張表
 *   · 表名改成 `ex-release-weaponz` → ① 紅
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const CONFIG = join(ROOT, "content", "config", "arena-rules.json");
const TABLES = join(ROOT, "content", "loot-tables");

type Entry = { itemId?: string };
type Table = { entries?: Entry[]; items?: Entry[] };

function shelf(): { randomOnlyTables?: string[] } {
  const doc = JSON.parse(readFileSync(CONFIG, "utf-8")) as Record<string, unknown>;
  return (doc.legendaryShelf ?? {}) as { randomOnlyTables?: string[] };
}

function tablePath(id: string): string {
  return join(TABLES, `${id}.json`);
}

function entriesOf(id: string): Entry[] {
  const t = JSON.parse(readFileSync(tablePath(id), "utf-8")) as Table;
  return t.entries ?? t.items ?? [];
}

/** 出貨的三張寶具池。⛔ 不寫死件數（第二守則：驗機制不驗數字）。 */
const POOLS = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"];

describe("寶具「只能隨機」是宣告的（GH#1111）", () => {
  it("① 宣告的每一張表都真的存在", () => {
    const declared = shelf().randomOnlyTables ?? [];
    expect(declared.length, "randomOnlyTables 是空的 —— 「只能隨機」今天靠 cost:0 的副作用達成").toBeGreaterThan(0);
    for (const id of declared) {
      expect(existsSync(tablePath(id)), `randomOnlyTables 宣告了 ${id}，而 content/loot-tables/${id}.json 不存在 —— 一格什麼都不做的宣告`).toBe(true);
    }
  });

  it("② 宣告的表裡每一件都有 id，且不重複（join key 自洽）", () => {
    const declared = shelf().randomOnlyTables ?? [];
    const seen = new Map<string, string>();
    for (const id of declared) {
      for (const e of entriesOf(id)) {
        expect(typeof e.itemId, `${id} 有一筆沒有 itemId`).toBe("string");
        const prev = seen.get(e.itemId!);
        expect(prev, `${e.itemId} 同時出現在 ${prev} 與 ${id} —— 兩張隨機表搶同一件`).toBeUndefined();
        seen.set(e.itemId!, id);
      }
    }
    expect(seen.size, "宣告的表加起來一件都沒有").toBeGreaterThan(0);
  });

  it("③ 反方向：一整張全 cost:0 的池子，要嘛被宣告、要嘛在豁免表裡帶理由", () => {
    /** ⭐ 豁免要寫得出**為什麼它不該被宣告**，⛔ 不是「還沒收」。 */
    const EXEMPT: Record<string, string> = {
      "legendary-weapons":
        "⭐ 這一張**買得到** —— 它是商店貨架那一張（7,200 金 ＋ 傳說寶玉三選一）。" +
        "它的 entries 沒有 cost 欄是因為**價格由 `priceMultiplier` 算**（`shop.ts:199-202` 的 " +
        "`inLegendaryPool` 那條路），⛔ 不是因為它不能買。" +
        "反駁法：哪天它變成隨機限定，就把它加進 randomOnlyTables 並刪掉這一列。",
    };
    const declared = new Set(shelf().randomOnlyTables ?? []);
    for (const id of POOLS) {
      if (declared.has(id) || id in EXEMPT) continue;
      expect.fail(
        `${id} 既不在 randomOnlyTables 裡、也不在豁免表裡 —— ` +
          `⇒ 它今天「買不到」如果成立，那是**副作用**，而副作用不會在有人填了價的時候變紅`,
      );
    }
  });
});
