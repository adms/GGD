/**
 * ⭐⭐【每一位英雄要嘛**在開放名單上**，要嘛**說得出為什麼不在**】
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 這條閘存在的理由：owner 問了一個**沒有人答得出來**的問題
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-09-11（逐字）：「正確來說是 [全英雄列表.md] **153 名英雄全部上架**」
 *
 * ⭐ 當下的狀態：153 名英雄 · 開放名單 130 名 ⇒ **差 23 名**。
 * ⚠️ 而那 23 名**沒有一名是漏掉的** —— 21 名是變身態、2 名是骨架替身。
 * ⛔ 但在此之前**沒有任何地方寫著這件事**：文件只印 ✅ / `—`，
 * ⇒ ⭐ 「刻意不上」與「忘了上」在那張表上**長得一模一樣**。
 *
 * ⇒ 這正是本專案反覆記錄的那個形狀（「壞掉跟正常長得一樣」）——
 *   ⭐ 而它的解法從來不是「要記得檢查」，是**讓它會紅**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 它問的是**關係**，⛔ 不是名詞
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 它**不**主張「153 名都要上架」—— 那會是一條永遠不會綠的閘（假綠燈⑨），
 *    而且是**錯的**：把變身態放上名單 = 玩家直接選第二具身體 = 變身機制壞掉。
 * ⭐ 它主張的是：**每一位不在名單上的英雄，都要有一個從內容推導得出來的理由。**
 *
 * ⇒ 新增一位英雄卻忘了加進 `starterChampions` ⇒ 它落進「⛔ 沒有理由」那一桶 ⇒ **紅**。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(ROOT, "content");
const STARTER = join(ROOT, "apps", "platform", "internal", "curation", "starter.go");

interface Champ {
  readonly id: string;
  readonly name?: string;
  readonly origin?: string | null;
  readonly exAbility?: string | null;
  readonly passiveAbility?: string | null;
  readonly transform?: { readonly role?: string } | null;
}

function champions(): Champ[] {
  return readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as Champ);
}

/** ⛔ 讀 Go 那一份**出貨的**名單，⛔ 不抄一份 id 進這裡（第〇·四守則）。 */
function whitelist(): Set<string> {
  const src = readFileSync(STARTER, "utf8");
  const block = /starterChampions\s*=\s*\[\]string\{([\s\S]*?)\n\t\}/.exec(src);
  if (!block) throw new Error("⛔ starter.go 裡找不到 starterChampions —— 偵測壞了，⛔ 不要當成「名單是空的」");
  return new Set([...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
}

function retired(): Set<string> {
  const roster = JSON.parse(readFileSync(join(CONTENT, "config", "roster.json"), "utf8")) as {
    retiredChampions?: readonly string[];
  };
  return new Set(roster.retiredChampions ?? []);
}

/** ⭐ 三條全部從**內容**推導。回 null ＝ ⛔ 沒有理由 ＝ 缺口。 */
function offlistReason(c: Champ, gone: Set<string>): string | null {
  if (c.transform?.role === "alternate") return "變身態";
  if (gone.has(c.id)) return "已下架";
  if (c.origin == null && c.passiveAbility == null && c.exAbility == null) return "骨架";
  return null;
}

describe("每一位英雄要嘛上架，要嘛說得出為什麼沒上", () => {
  const all = champions();
  const open = whitelist();
  const gone = retired();
  const off = all.filter((c) => !open.has(c.id));

  it("⭐ 量尺自證：三份來源都讀得到，⛔ 而且沒有一份是空的", () => {
    // ⛔ 沒有這一條，一個回空集合的解析會讓下面兩條**結構上永遠綠**。
    expect(all.length, "⛔ 一隻英雄都沒掃到").toBeGreaterThan(100);
    expect(open.size, "⛔ starter.go 的名單解析成空的 —— 正則壞了").toBeGreaterThan(100);
    expect(gone.size, "⛔ roster.json 的下架名單是空的 —— 欄位名錯了？").toBeGreaterThan(0);
    // ⭐ 而且**真的有**不在名單上的英雄 —— 否則這條閘退化成「總是真」。
    expect(off.length, "⛔ 零名不在名單上 ⇒ 這條閘什麼都沒在問").toBeGreaterThan(0);
  });

  it("⛔ 不在開放名單上的英雄，⭐ 每一位都要有推導得出來的理由", () => {
    const orphans = off.filter((c) => offlistReason(c, gone) === null).map((c) => `${c.id}（${c.name ?? "?"}）`);
    expect(
      orphans,
      "⛔⛔ 這幾位英雄**不在開放名單上，而且說不出為什麼** —— " +
        "⭐ 玩家選不到他們，⛔ 而沒有任何東西記錄那是不是刻意的。\n" +
        "⇒ 兩條路擇一：①把 id 加進 `apps/platform/internal/curation/starter.go` 的 " +
        "`starterChampions`（＝上架）；②讓它落進一個**有理由**的類別" +
        "（變身態／`roster.json` 的 `retiredChampions`／骨架）。\n" +
        "⛔ 不要改這條測試 —— 它問的正是「刻意不上」與「忘了上」的差別。",
    ).toEqual([]);
  });

  it("⭐ 變身態一律**不可以**在開放名單上（⛔ 反方向，否則上面那條會放行機制損壞）", () => {
    const bad = all
      .filter((c) => c.transform?.role === "alternate" && open.has(c.id))
      .map((c) => c.id);
    expect(
      bad,
      "⛔⛔ 變身態上了開放名單 ⇒ 玩家可以**直接選第二具身體** ⇒ " +
        "`transform.counterpartId` 的配對關係當場斷掉（`formPairShipping.ts` / `championForms.test.ts` 逐對釘死）。\n" +
        "⭐ 「153 名全部上架」**不包含**這一類 —— 它們是已上架英雄的第二具身體，⛔ 不是第二位英雄。",
    ).toEqual([]);
  });
});
