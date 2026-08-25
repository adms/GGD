/**
 * GH#706 —— config schema 拆檔門面的 count 閘（第〇·七守則拆檔必要條件②）。
 *
 * `index.ts` 的承諾：「拆檔前 `export * from "./config"` 拿得到的每一個名字，
 * 拆檔後一個不少地從這裡出去」。這一條在 2026-08-25 之前**沒有任何守衛** ——
 * 檔頭引用的 configFacadeSurface.test.ts 是幽靈名（第三守則抓到的那種）。
 *
 * 手法：列舉**出貨模組**的匯出名（import 真的門面，⛔ 不掃資料夾 ——
 * castApproachDoc 住上一層的教訓），與基準線比對：
 *   · 名字消失（誤刪一行 export *）→ 紅
 *   · 新名字（新檔掛上來了）→ 紅著提示把基準線更新進 commit —— 那一步就是
 *     「新開一個檔要掛上門面」被看見的時刻。
 * 更新基準線：GGD_CONFIG_SURFACE_DUMP=1 npx vitest run <本檔> 然後 git add。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as facade from "./index";

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), "configFacadeSurface.baseline.json");

describe("config schema 門面的匯出面 (config-facade-surface)", () => {
  it("門面匯出的名字與基準線一致（少了=誤刪 export；多了=更新基準線進 commit）", () => {
    const now = Object.keys(facade).sort();
    if (process.env.GGD_CONFIG_SURFACE_DUMP) {
      writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n", "utf8");
      console.log(`[dump] ${now.length} 個名字 → ${BASELINE}`);
    }
    const base = JSON.parse(readFileSync(BASELINE, "utf8")) as string[];
    expect(base.length, "基準線空了 —— 檔案壞了不是沒有匯出").toBeGreaterThan(50);
    const missing = base.filter((n) => !now.includes(n));
    const added = now.filter((n) => !base.includes(n));
    expect(
      missing.join(", "),
      "⛔ 這些名字從門面消失了 —— 100 個 import 端靠它們活著；找回被刪的 export * 那一行",
    ).toBe("");
    expect(
      added.join(", "),
      "⭐ 門面長出新名字（新檔掛上來了）—— GGD_CONFIG_SURFACE_DUMP=1 重跑本檔更新基準線並 git add",
    ).toBe("");
  });
});
