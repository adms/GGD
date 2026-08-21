/**
 * 一鍵清理變身態 — 按鈕算出來的名單必須**逐 id 等於**內容樹宣告的
 * `transform.role === "alternate"` 集合（owner 2026-08-21：判定從 transform.role
 * 推導，⛔ 不是手寫那 10 個 id，以後新增變身英雄自動適用）。
 *
 * 兩邊同一棵樹但**不同路**：一邊是後台真正用的管線（`_index.json` → `rowFromDoc`
 * → `buildTransformCleanupPlan`），另一邊直接讀原始 JSON。所以 `rowFromDoc` 漏掉
 * `transform`、plan 濾錯、或名單被寫死成今天這十個 id，三種都會紅。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIndex, rowFromDoc } from "./content";
import { emptyWhitelist, type ContentRow } from "./curation";
import { buildTransformCleanupPlan } from "./curationTransform";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const CHAMPIONS = join(REPO, "content", "champions");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/**
 * Every shipped champion doc, keyed by id — through the SAME `parseIndex` the
 * page uses, so a change to the index format cannot make this guard silently
 * measure an empty tree.
 */
function shippedChampionDocs(): Map<string, Record<string, unknown>> {
  const index = parseIndex(readJson(join(CHAMPIONS, "_index.json")));
  expect(index.length).toBeGreaterThan(0);
  return new Map(index.map((e) => [e.id, readJson(join(REPO, "content", e.path))]));
}

describe("清理變身態的名單是推導出來的", () => {
  const docs = shippedChampionDocs();
  const rows: ContentRow[] = [...docs].map(([id, doc]) => rowFromDoc(id, doc));

  it("= 內容樹宣告 transform.role === alternate 的那一組", () => {
    // 獨立的第二條路：直接讀原始 JSON，不經過 rowFromDoc / plan。
    const expected = [...docs]
      .filter(([, doc]) => {
        const tf = doc["transform"] as { role?: string } | undefined;
        return tf?.role === "alternate";
      })
      .map(([id]) => id)
      .sort();
    // 出貨數量不寫進斷言（那是 owner 每週在改的東西）——只釘「這棵樹真的有變身態」，
    // 否則兩個空集合相等會讓這條守衛永遠是綠的。
    expect(expected.length).toBeGreaterThan(0);

    const plan = buildTransformCleanupPlan({
      live: { ...emptyWhitelist(), champions: [...docs.keys()] },
      rows,
    });
    expect(plan.remove.map((r) => r.id)).toEqual(expected);
    expect(plan.remove.every((r) => r.named)).toBe(true); // 名字，⛔ 不是光給 id
    expect(plan.indexed).toBe(expected.length);
  });

  it("本體與沒有變身的英雄一個都不動，白名單外的變身態也不算", () => {
    const alt = rows.find((r) => r.transformRole === "alternate");
    const base = rows.find((r) => r.transformRole === "base");
    expect(alt).toBeDefined();
    expect(base).toBeDefined();
    const plan = buildTransformCleanupPlan({
      live: { ...emptyWhitelist(), champions: [base!.id, "not-in-content"] },
      rows,
    });
    expect(plan.remove).toEqual([]); // 本體留著
    expect(plan.unresolved).toEqual(["not-in-content"]); // 指不到文件的另外報，⛔ 不順手清掉
    expect(plan.indexed).toBeGreaterThan(0); // 未勾選的變身態仍被數到
  });

  it("⛔ 模組裡沒有任何寫死的英雄 id", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "curationTransform.ts"), "utf8");
    expect(src.match(/godie-[a-z0-9]+/g)).toBeNull();
  });
});
