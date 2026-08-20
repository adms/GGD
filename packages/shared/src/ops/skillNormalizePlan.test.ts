/**
 * ⭐【技能正規化計畫產生器的薄守衛】—— `tools/skill-normalize/plan.ts`。
 *
 * ⚠️ 第零守則③：工具腳本 = **一條薄守衛，⛔ 不做突變、⛔ 不開對抗輪**。
 * 所以這裡只釘**兩件承重的事**，⛔ 不逐欄複述那支腳本算了什麼：
 *
 *   ① **⛔ 不適用不塞 0** —— 每一格「不適用」都要帶理由，而且**不可以帶 value**。
 *      一個 0 混進來就會讓下一階段把「這支沒有冷卻」寫成「冷卻＝極小」。
 *   ② **相稱性豁免是規則不是名單** —— 天譴拿得到「允許超上限」，而它的理由
 *      必須是**結構推導**的 `riskFactors`（連鎖要湊人數），⛔ 不是 id 被寫死。
 *
 * ⛔ 母體大小從 `content/abilities/` **數出來**，⛔ 不抄 420 這個字面值
 *（第二守則：出貨數值不住在測試裡 —— 明天多一支技能不該紅在這裡）。
 *
 * ⛔ 這支測試**不寫任何 content/ 檔案**：產生器的輸出全部導到 tmp。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = mkdtempSync(join(tmpdir(), "ggd-skill-normalize-"));

interface Column { applicable: boolean; notApplicable?: string; value?: number; suggested?: string }
interface Row {
  id: string;
  columns: Record<string, Column>;
  riskFactors: string[];
  proportionality: { overCapAllowed: boolean; basis: string };
}

const plan = (): { meta: Record<string, unknown>; abilities: Row[] } => {
  const json = join(OUT, "plan.json");
  execFileSync(
    "npx",
    ["tsx", "tools/skill-normalize/plan.ts", "--json", json, "--md", join(OUT, "plan.md")],
    { cwd: REPO, stdio: "pipe" },
  );
  return JSON.parse(readFileSync(json, "utf8")) as { meta: Record<string, unknown>; abilities: Row[] };
};

describe("技能正規化計畫（tools/skill-normalize/plan.ts）", () => {
  const { abilities } = plan();

  it("⭐ 母體是整個出貨技能目錄，⛔ 不是一份手抄的清單", () => {
    const shipped = readdirSync(join(REPO, "content/abilities")).filter(
      (f) => f.endsWith(".json") && !f.startsWith("_"),
    );
    expect(abilities.length).toBe(shipped.length);
  });

  it("⛔ 不適用的欄位一定帶理由，而且**一定沒有 value** —— 不適用不塞 0", () => {
    const bad: string[] = [];
    for (const r of abilities) {
      for (const [axis, c] of Object.entries(r.columns)) {
        if (c.applicable) continue;
        if ((c.notApplicable ?? "").trim() === "") bad.push(`${r.id}.${axis} 沒有理由`);
        if (c.value !== undefined) bad.push(`${r.id}.${axis} 不適用卻帶 value=${c.value}`);
        if (c.suggested !== undefined) bad.push(`${r.id}.${axis} 不適用卻建議了 ${c.suggested}`);
      }
    }
    expect(bad, "⛔ 不適用不塞 0（見 plan.ts 的 NA()）").toEqual([]);
  });

  it("⭐ 相稱性豁免是**從結構推導**的規則 —— 天譴拿得到，而且理由是連鎖要湊人數", () => {
    const tianqian = abilities.find((r) => r.id === "godie-udea.r");
    expect(tianqian, "65-04 天譴不在計畫裡 —— 母體或 id 變了，先看過再改這條").toBeDefined();
    expect(tianqian!.proportionality.overCapAllowed).toBe(true);
    expect(tianqian!.riskFactors.join("")).toMatch(/連鎖/);
    // ⛔ 反向：豁免**不是**發給每一支技能的。沒有條件上檔的那些拿不到。
    expect(abilities.some((r) => !r.proportionality.overCapAllowed)).toBe(true);
  });
});
