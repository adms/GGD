/**
 * 🧾 **37 名社群英雄的配方：⛔ 不可以把「模板套上了」記成「機制通過了」**（GH#1132）。
 *
 * > 票文逐字：「**流程通過不可當作機制完成**」「⛔ 不把通用模板套用計為語意通過」
 *
 * ── ⭐ 量到的（2026-09-09，⛔ 不是估的）─────────────────────────────────────
 * `materials/community-hero-forge/recipes/*.json` —— **37 名 · 222 槽**：
 *
 * | 欄位 | 值 | 幾槽 |
 * |---|---|---:|
 * | `acceptance.originalMechanic` | `not-verified` | **222 / 222** |
 * | `acceptance.communityReview` | `not-run` | 222 |
 * | `acceptance.visual` | `not-run` | 222 |
 * | `acceptance.templateSimulation` | `accepted` / `passive` | 185 / 37 |
 * | 帶 `requiredRefinement` | —— | **222 / 222** |
 *
 * ⇒ ⭐ 票文點名 5 位（武藤遊戲／奇犽／柯南／鹿目圓／庫洛魔法使），
 *   ⛔ **而實際是全部 222 槽** —— 沒有一槽的原設計被驗過。
 *
 * ── ⛔⛔ 而今天沒有任何東西在守它 ──────────────────────────────────────────
 * `handoff.test.ts:37` 逐字斷言 `JSON.stringify(imported.sourceDesign)`
 * **`.not.toContain("originalMechanic")`** ⇒ ⭐ 驗收裁決**刻意不跨過匯入邊界**
 * ⇒ 執行期／發布路徑**看不到**它 ⇒ ⛔ 一個槽被翻成「passed」時，沒有任何東西會紅。
 *
 * ⭐ 所以這條閘守的是**材料那一側的誠實**，⛔ 不是執行期：
 *   **一槽宣稱 `originalMechanic: "passed"` 就不可以同時留著 `requiredRefinement`。**
 * ⚠️ 那正是「把通用模板套用計為語意通過」的**可判形狀** ——
 *   ⛔ 而它今天綠，是因為 222 槽誠實地寫著 `not-verified`。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 01 號 PASSIVE 的 `originalMechanic` 改成 `passed`（`requiredRefinement` 留著）→ 🔴 指名那一槽
 *   · 把 `requiredRefinement` 清成空字串（裁決仍是 not-verified）→ 🔴 第二條指名它
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const DIR = join(REPO, "materials/community-hero-forge/recipes");

interface Slot {
  readonly slot: string;
  readonly requiredRefinement?: string;
  readonly acceptance?: Record<string, string>;
}
interface Recipe {
  readonly index?: number | string;
  readonly displayName?: string;
  readonly slots: Slot[];
}

function recipes(): { file: string; doc: Recipe }[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), "utf8")) as Recipe }));
}

/** ⭐ 純函式 ⇒ sentinel 餵得進去（⛔ 不必為了自證去改材料）。 */
export function honestyVerdict(rows: { file: string; doc: Recipe }[]): string[] {
  const bad: string[] = [];
  for (const { file, doc } of rows) {
    for (const s of doc.slots ?? []) {
      const verdict = s.acceptance?.["originalMechanic"];
      const refine = (s.requiredRefinement ?? "").trim();
      if (verdict === "passed" && refine) {
        bad.push(
          `${file} ${s.slot}: 裁決寫 "passed"，⛔ 而 requiredRefinement 還留著「${refine.slice(0, 40)}…」`,
        );
      }
      if (verdict !== "passed" && !refine) {
        bad.push(
          `${file} ${s.slot}: 裁決是 "${verdict ?? "(缺)"}"（⛔ 不是 passed），而 requiredRefinement 是空的 —— 那一槽的差異沒有人寫下來`,
        );
      }
    }
  }
  return bad;
}

describe("🧾 社群英雄配方的誠實性（GH#1132）", () => {
  const rows = recipes();

  it("⭐ 量尺自證：37 份配方 · 222 槽真的讀得到（⛔ 不是在量空集合）", () => {
    expect(rows.length, "⛔ 讀不到配方 —— 目錄搬了，這條閘在守空集合").toBeGreaterThan(0);
    const slots = rows.reduce((n, r) => n + (r.doc.slots?.length ?? 0), 0);
    expect(slots, "⛔ 一槽都沒有").toBeGreaterThan(0);
    // ⭐ 每一份都要有 acceptance —— ⛔ 沒有它這條閘無法判斷任何事（真空綠）
    const withVerdict = rows.reduce(
      (n, r) => n + (r.doc.slots ?? []).filter((s) => s.acceptance?.["originalMechanic"]).length,
      0,
    );
    expect(withVerdict, "⛔ 沒有任何一槽帶 acceptance.originalMechanic ⇒ 這條閘什麼都判不了").toBe(slots);
  });

  it("★★ ⭐ **⛔ 不可以把模板套用記成語意通過**（一槽宣稱 passed 就不可以還留著待補）", () => {
    expect(
      honestyVerdict(rows).join("\n"),
      "⛔ 配方裡有槽同時宣稱「原設計通過」**與**「還有東西要補」——\n" +
        "⭐ 票文逐字：「流程通過不可當作機制完成」「⛔ 不把通用模板套用計為語意通過」。\n" +
        "⇒ 兩條路：① 真的做完那個機制 ⇒ 清掉 `requiredRefinement`；\n" +
        "   ② 還沒做完 ⇒ 裁決寫回 `not-verified`（⛔ 誠實的未完成比一個假的通過有用）。",
    ).toBe("");
  });

  it("⭐ sentinel：造一槽「passed 但還留著待補」⇒ 檢查器抓得到（⛔ 不然上面那條綠得沒有意義）", () => {
    const fake = [
      {
        file: "sentinel.json",
        doc: {
          slots: [
            { slot: "EX", requiredRefinement: "還沒接上事件", acceptance: { originalMechanic: "passed" } },
          ],
        } as Recipe,
      },
    ];
    expect(honestyVerdict(fake), "⛔ 檢查器對一個假的通過是瞎的").not.toEqual([]);
    expect(honestyVerdict(fake)[0]).toContain("EX");
  });
});
