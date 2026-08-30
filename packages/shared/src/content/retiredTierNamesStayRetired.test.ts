import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SKILL_TIER_NAMES } from "./skillTiers";

/**
 * ⭐⭐ **廢除掉的級距名不可以在出貨內容或對外契約裡復活**（owner 2026-08-31）。
 *
 * > 「**已經廢除 [超大] 了 請注意不要再出現**」
 *
 * ── 為什麼需要一條閘（⛔ 而不是「記得不要寫」）────────────────────────────
 * 2026-08-31 量到：`docs/editor-contract/ggd-skill-tiers.md`（**對外契約**）逐字寫著
 * 「⇒ 第四格統一叫『超大』」—— ⭐ 而出貨的五級距是 `極小 · 小 · 中 · 大 · 極大`，
 * 用「超大」的出貨技能 **0 支**。
 * ⇒ ⚠️ **一句在它到期之後還活著的散文，而沒有任何東西變紅**（第三守則）。
 *
 * ⛔ 內部債可以忍，**對外契約不行** —— 外部編輯器看不到我們的註冊表，
 * 沒有辦法發現我們在說謊 ⇒ 照著它做出來的內容，上線就是死的。
 *
 * ── ⭐ 這條閘刻意**不**掃兩種東西 ────────────────────────────────────────
 * · **owner 的原話引用**（`> 「…施法範圍也超大」`）—— 那是他說過的話，⛔ 不可以改
 * · **歷史敘事**（「改制前 AoE 的第四格叫『超大』」）—— 知識不可以無聲消失
 * ⇒ 判準是「它有沒有**在陳述現況**」，⛔ 不是「這三個字有沒有出現」。
 *   實作：只擋**出貨內容的欄位值**（那裡沒有散文，只有值）。
 */
describe("廢除的級距名不可以復活（owner 2026-08-31「不要再出現」）", () => {
  const root = resolve(__dirname, "../../../..");

  /** ⭐ 從出貨常數推導，⛔ 不是一張手打的黑名單（新增/改名會自動跟上）。 */
  const RETIRED = ["超大", "特大", "巨大"].filter((n) => !SKILL_TIER_NAMES.includes(n as never));

  it("⭐ 自我校準：出貨的五級距讀得到，而『超大』確實不在裡面", () => {
    expect(SKILL_TIER_NAMES.length).toBe(5);
    expect(SKILL_TIER_NAMES).not.toContain("超大");
    expect(RETIRED).toContain("超大");
  });

  it("⭐ 出貨內容的任何 *Tier 欄位都不可以是廢除掉的名字", () => {
    const bad: string[] = [];
    for (const dir of ["abilities", "champions", "items", "augments", "config"]) {
      const d = resolve(root, "content", dir);
      for (const f of readdirSync(d)) {
        if (!f.endsWith(".json") || f.startsWith("_")) continue;
        const raw = readFileSync(resolve(d, f), "utf8");
        // 逐個 "…Tier": "值" 抓出來（⛔ 不掃說明文字：那裡出現「超大」是中文形容詞）
        for (const m of raw.matchAll(/"(\w*[Tt]ier)"\s*:\s*"([^"]+)"/g)) {
          if (RETIRED.includes(m[2]!)) bad.push(`content/${dir}/${f} → ${m[1]}: "${m[2]}"`);
        }
      }
    }
    expect(bad, `⛔ 廢除的級距名復活了（出貨的是 ${SKILL_TIER_NAMES.join(" · ")}）：\n  ${bad.join("\n  ")}`).toEqual([]);
  });
});
