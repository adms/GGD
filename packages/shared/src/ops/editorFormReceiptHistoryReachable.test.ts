/**
 * editorFormReceiptHistoryReachable.test.ts —— coord:check ↔ formreceipts:check 的接縫（工具層，一條承重線）。
 *
 * ⭐ 為什麼要有它（2026-09-15，GH#993 步驟①的副作用）：
 *   普查修好（159→148）讓 ggd-bricks 的 4 格 `usedBy` 變了 ⇒ 收據列用 `{ ...brick }` 抄了它
 *   ⇒ formreceipts:check 要求重產 packet ⇒ coord:check 判「同一題重問」（key 與契約指紋都沒變）。
 *   ⇒ 兩條**各自都對**的閘，組合起來在任何採用數變動時必然有一條紅（CLAUDE.md 綠燈假來源 ⑪）。
 *   而本來該擋住它的「沿用歷史位元組」分支寫死了舊 key `claim.editor-form-receipts`
 *   （bccf87c1b／c57fc0c3a 版本化時沒跟著改）⇒ 09-11 起**永遠走不到**；它的 node:test
 *   夾具也抄了同一個舊 key，而那支 node:test 不在任何閘裡跑 ⇒ 沒有東西紅。
 *
 * ⭐ 這一條讀**出貨的那一份 packet**（⛔ 不是自造夾具，失敗形態⑤）：
 *   ① 採用數變動 ⇒ 沿用歷史位元組（分支走得到）；② 量測值變動 ⇒ 仍然拒絕沿用。
 * 突變（2026-09-15）：editor-form-receipt-history.mjs 的 key 比對改回舊字面值
 *   `"claim.editor-form-receipts"` ⇒ ① 紅；改回 ⇒ 綠。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error —— repo 工具腳本（.mjs，無型別宣告）；測的就是 build-editor-form-receipts.mjs 呼叫的那一支
import { EDITOR_FORM_RECEIPT_KEY, unchangedHistoricalReceipt } from "../../../../tools/skill-forge/editor-form-receipt-history.mjs";

const REPO = join(import.meta.dirname, "../../../..");
type Row = { renderable: boolean; usedBy?: number };

describe("editor-form 收據：採用數變動 ⛔ 不是重問，量測變動仍然是", () => {
  const text = readFileSync(
    join(REPO, "docs/editor-contract/coordination", `${EDITOR_FORM_RECEIPT_KEY}.json`),
    "utf8",
  );
  const shipped = JSON.parse(text) as { dedupeKey: string; receipts: Row[] };

  it("① 出貨 packet 的每一格 usedBy 都變了 ⇒ 仍沿用歷史位元組（分支走得到）", () => {
    expect(shipped.dedupeKey).toBe(EDITOR_FORM_RECEIPT_KEY);
    const withUsedBy = shipped.receipts.filter((r) => typeof r.usedBy === "number");
    expect(withUsedBy.length, "出貨收據列已經不抄 usedBy ⇒ 這條與 NON_MEASUREMENT_RECEIPT_FIELDS 一起刪").toBeGreaterThan(0);
    const measured = structuredClone(shipped);
    for (const r of measured.receipts) if (typeof r.usedBy === "number") r.usedBy += 7;
    expect(unchangedHistoricalReceipt(text, measured)).toBe(text);
  });

  it("② 同時翻掉一顆 renderable ⇒ ⛔ 拒絕沿用（量測變了就要新的宣稱）", () => {
    const measured = structuredClone(shipped);
    for (const r of measured.receipts) if (typeof r.usedBy === "number") r.usedBy += 7;
    measured.receipts[0]!.renderable = !measured.receipts[0]!.renderable;
    expect(unchangedHistoricalReceipt(text, measured)).toBeNull();
  });
});
