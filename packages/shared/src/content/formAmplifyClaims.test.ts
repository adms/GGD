/**
 * ⭐⭐ **卡面說「變身後增加傷害」的，就要真的有一條增幅係數**（GH#944）。
 *
 * owner 2026-09-02 逐字：
 * > 「另外 **EX增幅狀態下也有增加傷害對吧?**」⇒ ⭐ 是，而 GGD 沒做。
 * > 「⇒ 建議一條新守衛涵蓋全部 26 對變身英雄。**=> ok**」
 *
 * ⛔⛔ 量到的形狀（04-002 惡夢魔王的碎片）：卡面逐字寫著
 * 「**龍破斬及神滅斬增加傷害(180% [AP])**」，
 * ⭐ 而 `godie-hjai`（基礎）與 `godie-h020`（增幅形態）在傷害節點上**逐位元組相同**
 * ⇒ ⭐⭐ 「增幅」這個機制在那位英雄身上**完全不存在**。
 *
 * ⭐ JASS 逐行證實（`war3map.j:29957` / `:29793`）：兩支都是 `+INT × 7`，
 * 而卡面說 +180% AP ⇒ 換算 `1.80 ÷ 7 = 0.257`；
 * 回代神滅斬平時 `5 × 0.257 = 1.29 ≈ 今天的 1.3` ✅
 * ⇒ ⭐ **卡面、JASS、換算三者完全自洽 —— ⛔ 只有實作漏了。**
 *
 * ⚠️ ⭐ 這一支問的是**關係**：一張卡面宣稱「某某技能增加傷害」時，
 * 那幾支技能要**找得到一條帶條件的係數**。⛔ 不是「有沒有 when 這個字」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(ROOT, "content/abilities");

/** ⭐ 一份文件裡有沒有**任何一條**帶 `when` 的係數。 */
function hasGatedRatio(doc: unknown): boolean {
  let found = false;
  const walk = (o: unknown): void => {
    if (found) return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const r = o as { stat?: string; coeff?: number; when?: unknown };
    if (r.stat !== undefined && r.coeff !== undefined && r.when !== undefined) {
      found = true;
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(doc);
  return found;
}

/** 卡面剝掉「」對白之後的文字（第〇·六守則②）。 */
const prose = (d: { description?: string }): string =>
  String(d.description ?? "").replace(/「[^」]*」/g, "");

describe("變身增幅的卡面宣稱（GH#944）", () => {
  const docs = readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as { id: string; description?: string });

  it("⭐ 量尺先自證：真的讀得到出貨卡面", () => {
    expect(docs.length, "⛔ 一份都沒有 ⇒ 這條在量空氣").toBeGreaterThan(300);
  });

  it("★★ ⭐ 04-002 點名的兩支**都有**帶條件的增幅係數", () => {
    // ⚠️ 卡面逐字：「龍破斬及神滅斬增加傷害(180% [AP])」
    const ex = docs.find((d) => d.id === "godie-h020.ex");
    expect(ex, "⛔ 04-002 不見了").toBeTruthy();
    expect(prose(ex!), "⛔ 卡面不再宣稱增幅 ⇒ 回來改這條").toContain("增加傷害");
    for (const id of ["godie-h020.e", "godie-h020.r", "godie-hjai.e", "godie-hjai.r"]) {
      const d = docs.find((x) => x.id === id);
      expect(d, `⛔ ${id} 不見了`).toBeTruthy();
      expect(
        hasGatedRatio(d),
        `⛔ ${id} 沒有任何帶條件的係數 —— 而 04-002 的卡面說它「增加傷害」` +
          `（JASS `+"`+INT × 7`"+` 逐行證實，而 GGD 曾經一個位元組都沒發生）`,
      ).toBe(true);
    }
  });

  it("⭐⭐ **棘輪**：卡面宣稱增幅而一條帶條件係數都沒有的，只准變少", () => {
    // ⭐ 掃全庫：卡面同時提到「變身/增幅/狀態下」與「增加傷害」的那些。
    const suspects = docs.filter((d) => {
      const p = prose(d);
      return /(增幅|變身|狀態下|形態)/.test(p) && /(增加|提升).{0,6}傷害/.test(p);
    });
    const silent = suspects.filter((d) => !hasGatedRatio(d)).map((d) => d.id);
    // ⚠️ ⭐ 這個上限是**量到的現況**，⛔ 不是目標 —— 它只准往下走。
    //   ⭐ 而「往下」的意思是有人把那一支的增幅真的做出來了。
    expect(
      silent.length,
      `⭐ 卡面宣稱增幅而沒有帶條件係數的有 ${silent.length} 支：${silent.slice(0, 8).join(" · ")}` +
        `\n⚠️ 變多 ⇒ 有人加了一句做不到的卡面（第一·五守則）；` +
        `變少 ⇒ 把上限調下來。`,
    ).toBeLessThanOrEqual(28);
  });
});
