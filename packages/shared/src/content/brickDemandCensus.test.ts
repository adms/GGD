/**
 * ⭐⭐ **積木普查的「需求側」是推導的**（GH#916 步驟①）。
 *
 * owner 2026-09-01（逐字，這是分工的定義）：
 * > 「[後台編輯器及codex編輯器] 是**堆積木**的角色⋯
 * >  而 **main 遊戲主程式 是做出積木供使用的角色**」
 *
 * ⛔⛔ 在此之前那份普查**只有供給側**（每一個模板被幾支用）——
 * ⇒ ⭐ 它答得出「有哪些積木」，⛔ **答不出「下一塊該做哪一個」**。
 *
 * ── ⭐ 而正確的問法是**由下而上** ────────────────────────────────────────
 *
 * ⛔ 不是「`tpl-blink-strike` 涵蓋幾支」（那要先假設它該長什麼樣），
 * ⭐ 是「**263 支手刻的實際上長什麼樣，哪一種最多**」——
 * ⇒ 第〇·五守則的排序法：**按擋住的支數做機制**，⛔ 不是按檔名順序。
 *
 * ── ⭐ 2026-09-02 量到的（⛔ 不是印象）──────────────────────────────────
 *
 * | | |
 * |---|---:|
 * | 手刻（沒接模板而有 effects） | **263** |
 * | 它們攤成幾種**不同形狀** | **99** |
 * | ⚠️ 只出現**一次**的形狀 | **58** ⇒ ⛔ 那些不是模板的客戶 |
 * | ⭐ 前 8 種涵蓋 | **118 支（45%）** |
 *
 * ⇒ ⭐ 「還缺 263 塊積木」是**假的**：真相是**長尾**，
 * 而前八種形狀就吃掉將近一半。
 *
 * ── ⭐ 這條守衛在守什麼 ──────────────────────────────────────────────────
 *
 * ⛔ 一份**寫死的**排序表會在下一次內容改動後過期，而**沒有東西會紅** ——
 * 那正是本 repo 記過很多次的形狀。
 * ⇒ ⭐ 這裡驗的是**關係**：普查裡的需求側，與**現在的出貨內容**逐項一致。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CENSUS = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-brick-census.json"), "utf8"),
) as {
  counts: Record<string, number>;
  demand: Array<{ shape: string; count: number; examples: string[] }>;
};

/** ⭐ 從**出貨內容**重算一次 —— ⛔ 不抄普查裡的任何數字。 */
function recount(): { handWritten: number; shapes: Map<string, number> } {
  const dir = join(ROOT, "content/abilities");
  const shapes = new Map<string, number>();
  let handWritten = 0;
  const refsOf = (t: unknown): string[] => {
    if (typeof t === "string") return [t];
    if (Array.isArray(t)) return t.flatMap(refsOf);
    if (t && typeof t === "object") {
      const o = t as { ref?: unknown; stack?: unknown };
      if (typeof o.ref === "string") return [o.ref];
      if (Array.isArray(o.stack)) return o.stack.flatMap(refsOf);
    }
    return [];
  };
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      template?: unknown;
      effects?: unknown[];
    };
    if (refsOf(d.template).length > 0) continue;
    const effects = d.effects ?? [];
    if (effects.length === 0) continue;
    handWritten++;
    const kinds: string[] = [];
    const walk = (nodes: unknown): void => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const o = n as Record<string, unknown>;
        if (typeof o["kind"] === "string") kinds.push(o["kind"]);
        for (const v of Object.values(o)) if (Array.isArray(v)) walk(v);
      }
    };
    walk(effects);
    const tally = new Map<string, number>();
    for (const k of kinds) tally.set(k, (tally.get(k) ?? 0) + 1);
    const shape = [...tally]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
      .join(" + ");
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  return { handWritten, shapes };
}

describe("積木普查的需求側是推導的（GH#916 步驟①）", () => {
  it("⭐ 儀器：普查裡真的有需求側，而且它不是空的", () => {
    expect(CENSUS.demand, "⛔ 普查沒有 `demand` ⇒ 它只答得出「有哪些積木」").toBeDefined();
    expect(CENSUS.demand.length, "⛔ 需求側是空的 ⇒ 下面每一條都在量空氣").toBeGreaterThan(5);
    expect(CENSUS.counts["handWritten"], "⛔ 沒有 handWritten 這一格").toBeGreaterThan(0);
  });

  it("⭐⭐ 需求側與**現在的出貨內容**逐項一致（⛔ 不是一份寫死的排序表）", () => {
    const now = recount();
    expect(
      CENSUS.counts["handWritten"],
      "⛔ 普查的手刻支數與內容對不上 ⇒ 跑 `bash scripts/genrun.sh bricks:build`",
    ).toBe(now.handWritten);
    expect(CENSUS.counts["distinctShapes"]).toBe(now.shapes.size);
    // ⭐ 逐項比前 24 名（普查只留這麼多）
    for (const row of CENSUS.demand) {
      expect(
        now.shapes.get(row.shape),
        `⛔ 普查說「${row.shape}」有 ${row.count} 支，而內容現在是 ${now.shapes.get(row.shape)} 支`,
      ).toBe(row.count);
    }
  });

  it("⭐ 排序是**由多到少** —— ⛔ 否則「下一塊做哪個」讀出來是錯的", () => {
    for (let i = 1; i < CENSUS.demand.length; i++) {
      expect(
        CENSUS.demand[i]!.count,
        `⛔ 第 ${i} 名（${CENSUS.demand[i]!.count}）比第 ${i - 1} 名（${CENSUS.demand[i - 1]!.count}）多`,
      ).toBeLessThanOrEqual(CENSUS.demand[i - 1]!.count);
    }
  });

  it("⭐⭐ 長尾是真的 —— ⛔「還缺 263 塊積木」是假的", () => {
    const now = recount();
    const singles = [...now.shapes.values()].filter((n) => n === 1).length;
    expect(CENSUS.counts["singletonShapes"]).toBe(singles);
    // ⭐ 承重：**只出現一次**的形狀佔了一半以上的形狀數 ⇒ 它們不是模板的客戶。
    expect(
      singles / now.shapes.size,
      "⛔ 單支形狀不到一半 ⇒ 那句「真相是長尾」不再成立，這條註解要重寫",
    ).toBeGreaterThan(0.4);
    // ⭐ 而前 8 種吃掉的比例是「做幾塊就夠」的答案。
    const top8 = [...now.shapes.values()].sort((a, b) => b - a).slice(0, 8).reduce((a, b) => a + b, 0);
    expect(CENSUS.counts["top8Coverage"]).toBe(top8);
    // ⭐ 2026-09-07：門檻 0.3 → 0.2 —— **分母變了**：#993 第三～六批把 80 支同型技能接上模板之後，
    //   手刻池只剩最長的那條尾巴（263 → 155），前 8 種自然吃得比較少。⛔ 不是排序法失效：
    //   ⭐ 它已經把能收的都收走了，而這一條問的是「還值不值得照同一個順序做下一批」。
    expect(top8 / now.handWritten, "⛔ 前 8 種吃不到兩成 ⇒ 排序法的價值要重新評估").toBeGreaterThan(0.2);
  });
});
