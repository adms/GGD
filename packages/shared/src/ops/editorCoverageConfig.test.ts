/**
 * ⭐⭐ GH#889 —— 編輯器契約要涵蓋 **`config.*`**（89 份設定檔）。
 *
 * ── 缺口 ────────────────────────────────────────────────────────────────
 * 2026-08-31 量到：`ggd-editor-coverage.json` 裡 `config.` 出現 **0 次**，
 * 而 `zConfigDoc` 有 **93 個** union 成員、`content/config/` 有 **89 份**文件。
 * ⇒ ⭐ 外部編輯器**查不到任何一格 config 欄位** —— 而那是 GGD 最大的一片 JSON 面。
 *
 * ⚠️ 它與「契約說謊」不同 —— ⭐ **它沒有說謊，它沉默**。
 * 而沉默與「這裡沒有東西」在讀的人眼裡長得一模一樣。
 *
 * ── ⭐ 兩個方向都走（失敗形態⑫）───────────────────────────────────────
 * 只從契約走 ⇒ 漏掉「schema 裡有而契約沒有」的；
 * 只從 schema 走 ⇒ 漏掉「契約有而 schema 沒有」的。⭐ 兩頭都要走。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `pushDocFields("configField", …)` 那一段拿掉 → 「config 面不可以是空的」紅
 *   · `flatten` 的 `record` 分支拿掉 → 「記錄的值型別要展開」紅
 *   · `record` 分支改回自己組路徑 → 「路徑不可以多一段」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { zConfigDoc } from "../content/schema";

const COV = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../docs/editor-contract/ggd-editor-coverage.json"), "utf8"),
) as {
  counts: Record<string, number>;
  required: { group: string; name: string; owner?: string }[];
};

const cfg = COV.required.filter((r) => r.group === "configField");
const owners = new Set(cfg.map((r) => r.owner));

/** `zConfigDoc` 的 union 成員各自宣告的 schema tag。 */
function unionTags(): string[] {
  const opts = (zConfigDoc as unknown as { options?: unknown[] }).options ?? [];
  return opts
    .map((o) => {
      const lit = (o as { shape?: Record<string, { value?: unknown }> }).shape?.["schema"];
      return typeof lit?.value === "string" ? lit.value : null;
    })
    .filter((x): x is string => x !== null);
}

describe("GH#889 契約涵蓋 config.*", () => {
  it("量尺先自證：union 讀得出 tag（⛔ 讀不出來下面兩條會空過）", () => {
    const tags = unionTags();
    expect(tags.length, "⛔ 一個 tag 都讀不出來 ⇒ 這條測試證明不了任何事").toBeGreaterThan(80);
    expect(tags).toContain("config.vfx-families@1");
  });

  it("★ ⭐ **方向①**：schema 裡的每一個 config tag，契約都要有（⛔ 沉默 = 看不見）", () => {
    const missing = unionTags().filter((t) => !owners.has(t));
    expect(
      missing,
      `⛔ 這幾份 config 在契約裡**一格都沒有** ⇒ 外部編輯器編不到：\n  ${missing.slice(0, 8).join("\n  ")}`,
    ).toEqual([]);
  });

  it("★ ⭐ **方向②**：契約說的每一個 config tag，schema 裡查得到（⛔ 反方向也要走）", () => {
    const tags = new Set(unionTags());
    const ghosts = [...owners].filter((o) => o !== undefined && !tags.has(o));
    expect(ghosts, `⛔ 契約宣稱這幾份存在而 schema 沒有 —— 對方會做出上線即死的內容`).toEqual([]);
  });

  it("⭐ **記錄的值型別要展開** —— `families.*.models` 是 GH#761 剛做的那一格", () => {
    const names = new Set(cfg.filter((r) => r.owner === "config.vfx-families@1").map((r) => r.name));
    expect(
      names.has("families.*.models"),
      "⛔ `z.record` 只留下它自己的名字 ⇒ 編輯器要編的東西**全部**看不到",
    ).toBe(true);
    // ⚠️ ⭐ 路徑**不可以多一段**：`families.*.*.models` / `families.*.families.*.models`
    //   兩種我都寫出來過，⛔ 而它們「有東西而且看起來合理」——
    //   照著它寫的編輯器會產出一份引擎讀不懂的 JSON。
    const doubled = [...names].filter((n) => n.includes(".*.*.") || n.includes(".*.families."));
    expect(doubled, "⛔ 路徑多了一段（我兩版都犯過）").toEqual([]);
  });

  it("⭐ counts 有 `configField` 且與清單一致（⛔ 統計不可以自己一份）", () => {
    expect(COV.counts["configField"]).toBe(cfg.length);
    expect(cfg.length, "⛔ 空的 ⇒ 那一整片還是沉默的").toBeGreaterThan(1000);
  });
});
