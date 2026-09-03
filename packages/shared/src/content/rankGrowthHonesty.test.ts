/**
 * ⭐⭐ **升級要真的變強**（GH#938）—— 而「有幾支還在說謊」是一個會紅的數字。
 *
 * owner 2026-09-02 要的三件事之一：「讓每一級升級**都真的變強**」。
 *
 * ⛔⛔ 量到的（`content/abilities` 全掃）：
 * **29 個 `damageTierPerRank` 節點，27 個（93%）至少有一級升了零提升**。
 *
 * | 技能 | 卡面 | 實際值 | ⛔ 級差 |
 * |---|---|---|---|
 * | **80-02 弒鬼神** | 120/220/320/420（每級 +100） | 200/200/500/500 | ⛔ **+0 / +300 / +0** |
 * | 20-03 約束與勝利之劍 | — | 500/500/1000/1000 | ⛔ +0 / +500 / +0 |
 *
 * ⭐ 根因：傷害梯子只有**五格**（200/500/1000/1500/2000）而技能有 3–4 級
 * ⇒ 一條「每級 +100」的卡面被**量化**到那五格。
 *
 * ⭐ 而修法是 `rankGrowth`（從**冷卻級距**推導，owner 逐字：
 * 「rankGrowth 全域預設 0.5 其實跟 CD／觸發頻率有關係」）——
 * ⚠️ 而**遷移是內容側的事**，⛔ 不會在這一輪做完。
 * ⇒ ⭐ 這一支讓那個數字**只准往下走**：
 * ⛔ 有人新增一個「升了沒變強」的節點 ⇒ 紅；⭐ 有人遷移一支 ⇒ 把上限調下來。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRankGrowth, expandRankLadder, DEFAULT_RANK_GROWTH } from "./rankGrowth";
import { SKILL_TIER_NAMES } from "./skillTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(ROOT, "content/abilities");

/** ⭐ 棘輪：今天量到 27 —— ⛔ 只准往下走。 */
const FLAT_RANK_CEIL = 27;

function flatRankNodes(): string[] {
  const bad: string[] = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(DIR, f), "utf8")) as { id: string };
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const per = (o as { damageTierPerRank?: unknown }).damageTierPerRank;
      if (Array.isArray(per) && per.some((v, i) => i > 0 && v === per[i - 1]))
        bad.push(d.id);
      for (const v of Object.values(o)) walk(v);
    };
    walk(d);
  }
  return bad;
}

describe("升級成長率（GH#938）", () => {
  it("⭐ 量尺先自證：出貨值與 `content/config/rank-growth.json` 逐格相同", () => {
    const cfg = JSON.parse(
      readFileSync(join(ROOT, "content/config/rank-growth.json"), "utf8"),
    ) as { byCooldownTier: Record<string, number>; whenTierAbsent: number };
    for (const t of SKILL_TIER_NAMES)
      expect(cfg.byCooldownTier[t], `⛔ 「${t}」與 TS 那一份對不上 ⇒ 兩個住處會漂`).toBe(
        DEFAULT_RANK_GROWTH[t],
      );
  });

  it("★★ ⭐ 成長率**隨冷卻級距單調不減**（owner 逐字：CD 越長成長越高）", () => {
    const vals = SKILL_TIER_NAMES.map((t) => resolveRankGrowth(t)!);
    for (let i = 1; i < vals.length; i++)
      expect(
        vals[i]!,
        `⛔ 「${SKILL_TIER_NAMES[i]}」(${vals[i]}) 比「${SKILL_TIER_NAMES[i - 1]}」(${vals[i - 1]}) 低` +
          ` —— owner 逐字：「陽離子砲會是 1.0 是因為 **CD 較長**」`,
      ).toBeGreaterThanOrEqual(vals[i - 1]!);
    // ⭐ 而**極大**那一格逐字是 1.0（59-04 野戰型陽電子砲量到的那個）
    expect(resolveRankGrowth("極大")).toBe(1);
  });

  it("⭐ 展開的梯子**每一級都真的變強**（⛔ 那正是這張票的 Objective ①）", () => {
    for (const t of SKILL_TIER_NAMES) {
      const g = resolveRankGrowth(t)!;
      const ladder = expandRankLadder(200, g, 4);
      for (let i = 1; i < ladder.length; i++)
        expect(ladder[i]!, `⛔ 「${t}」的第 ${i + 1} 級沒有比前一級高`).toBeGreaterThan(ladder[i - 1]!);
    }
  });

  it("⭐ 總開關關掉 ⇒ 回 `null`（⛔ 不是 0 —— 那是「升級不變強」另一件事）", () => {
    expect(
      resolveRankGrowth("極大", { enabled: false, byCooldownTier: DEFAULT_RANK_GROWTH, whenTierAbsent: 0.5 }),
      "⛔ 關掉之後回了一個數字 ⇒ 它會覆蓋技能自己寫的梯子",
    ).toBeNull();
  });

  it("⭐⭐ **棘輪**：「升了沒變強」的節點只准變少", () => {
    const bad = flatRankNodes();
    expect(
      bad.length,
      `⭐ 今天有 ${bad.length} 個 \`damageTierPerRank\` 節點至少有一級升了**零提升**` +
        `（例：${[...new Set(bad)].slice(0, 5).join(" · ")}）。\n` +
        `⚠️ 變多 ⇒ 有人又寫了一支「升級沒變強」的技能（第一·五守則）；\n` +
        `⭐ 變少 ⇒ 有人把它遷到 \`rankGrowth\` 了 ⇒ 把上限調下來。`,
    ).toBeLessThanOrEqual(FLAT_RANK_CEIL);
  });
});
