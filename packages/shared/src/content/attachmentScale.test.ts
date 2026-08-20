/**
 * GH#482 —— 出貨的每一格 `attachScale` 都要**對得上它的兩個來源**。
 *
 * ⚠️ 這是一條**兩個名詞之間的關係**（第「配對式後置條件」那一課）：
 * 分開看，`form-visuals.json` 是好的、`models_report.json` 是好的 ——
 * 壞掉的是「這個縮放換算得回本體的座標系」，而那不可能由分別檢查每一半得到。
 * 舊值 0.3221 就是這樣活了下來：schema 收得下、卡片畫得出來、全套測試全綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachScaleFor, glbBasename, ATTACH_SCALE_DECIMALS } from "./attachmentScale";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = <T,>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;

interface ReportRow {
  readonly glb?: string;
  readonly scale_factor?: number;
}
interface ModelDoc {
  readonly glbPath?: string;
}
interface FormVisual {
  readonly attachModelKey?: string;
  readonly attachScale?: number;
}

/** glb 檔名 → 轉檔器記下的 `scale_factor`。 */
function scaleFactors(): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of read<ReportRow[]>("tools/w3x-import/out/GoDieEX22s/models_report.json")) {
    if (typeof row.glb === "string" && typeof row.scale_factor === "number") {
      out.set(glbBasename(row.glb), row.scale_factor);
    }
  }
  return out;
}

const factorOfModel = (modelKey: string, factors: Map<string, number>): number | undefined => {
  const doc = read<ModelDoc>(`content/models/${modelKey}.json`);
  return typeof doc.glbPath === "string" ? factors.get(glbBasename(doc.glbPath)) : undefined;
};

describe("attachScale 是兩個 scale_factor 的比值（GH#482）", () => {
  it("form-visuals 的每一格都等於 本體 ÷ 掛件，⛔ 不是一個挑出來的數字", () => {
    const factors = scaleFactors();
    // ⚠️ 空報告 = 讀壞了，⛔ 不是「沒有模型」。
    expect(factors.size, "models_report.json 讀不到任何 scale_factor").toBeGreaterThan(0);

    const forms = read<{ forms: Record<string, FormVisual> }>("content/config/form-visuals.json").forms;
    const champions = (id: string): string =>
      read<{ modelKey: string }>(`content/champions/${id}.json`).modelKey;

    let checked = 0;
    for (const [formId, form] of Object.entries(forms)) {
      if (form.attachModelKey === undefined || form.attachScale === undefined) continue;
      const body = factorOfModel(champions(formId), factors);
      const attach = factorOfModel(form.attachModelKey, factors);
      const want = body !== undefined && attach !== undefined ? attachScaleFor(body, attach) : null;
      expect(want, `${formId}：兩個 scale_factor 有一個讀不到，這一格沒有出處`).not.toBeNull();
      // ⛔ 不抄字面值 —— 兩邊都是從磁碟推的；改了任一份來源，這一條就會指名它。
      expect(
        form.attachScale,
        `${formId} 的 attachScale 與轉檔倍率對不上：出貨 ${form.attachScale}，` +
          `而 ${body} ÷ ${attach} = ${want}（差 ${(((form.attachScale ?? 0) / (want ?? 1) - 1) * 100).toFixed(0)}%）`,
      ).toBeCloseTo(want!, ATTACH_SCALE_DECIMALS);
      checked++;
    }
    // 一格都沒驗到 = 這條守衛在空轉（出貨真的有一件掛件：悟空超三球體）。
    expect(checked, "一格 attachScale 都沒對到 —— 這條守衛在空轉").toBeGreaterThan(0);
  });
});
