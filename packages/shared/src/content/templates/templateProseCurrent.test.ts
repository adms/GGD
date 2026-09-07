/**
 * ⭐ GH#1044 / GH#1045 —— 模板卡的 description 不可以**以現在式**宣稱一件引擎已經
 * 推翻的事。
 *
 * 三條，每一條的「真值」都是從**出貨的東西**推導的，⛔ 不是抄一句正確的文案：
 *   ① 「沒有展開路徑／這張卡是 draft」—— 對 `status: enabled` 且 `isExpandable`
 *      的卡，這種句子只准活在標了「歷史」的段落裡（GH#1045：combo-finisher 接線
 *      落地四天後，文案還在說自己是 draft）。
 *   ② 「sim 沒有延後排程」—— `EFFECT_HANDLERS` 裡有 `delayed` 的那一天起，
 *      這句話就是假的；正確的界線是「**這張模板**尚未接延後」（GH#1044 mark-stacks）。
 *   ③ 展開結果帶 `leap` 的卡（teleport 那一族）—— 落點走 `resolveLandingPoint` →
 *      `world.wallBlock`（出貨 leap:"clamp"、flightExempt:true），所以文案至少要交代
 *      **牆前截斷、飛行豁免、邊界**三件事，⛔ 不可以只寫「不吃碰撞」。
 *
 * ⚠️ 這是體驗層的薄守衛（文案），⛔ 不做突變。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { defaultParamsFor } from "./paramsSchema";
import { expand, isExpandable } from "./expand";
import { EFFECT_HANDLERS } from "../../sim/effects/effectRegistry";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/ability-templates");
const templates: TemplateDoc[] = readdirSync(DIR)
  .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
  .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))));
const enabled = templates.filter((t) => t.status === "enabled");

const STALE_DRAFT_CLAIMS = ["沒有展開路徑", "是 draft", "是草稿"];
const HISTORY_MARK = "歷史";

describe("模板文案不以現在式說引擎已推翻的事", () => {
  it("① enabled 且可展開的卡：draft／無展開路徑只准出現在標了「歷史」的段落", () => {
    const bad: string[] = [];
    for (const t of enabled.filter((x) => isExpandable(x.family))) {
      for (const para of (t.description ?? "").split(/\n\s*\n/)) {
        const claims = STALE_DRAFT_CLAIMS.filter((c) => para.includes(c));
        if (claims.length > 0 && !para.includes(HISTORY_MARK)) {
          bad.push(`${t.id}: 「${claims.join("／")}」出現在一段沒有標「${HISTORY_MARK}」的文字裡`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("② 引擎有 `delayed` ⇒ 沒有一張卡可以說「sim 沒有延後排程」", () => {
    expect(EFFECT_HANDLERS.delayed, "這條守衛的前提：delayed 是出貨的 effect kind").toBeTruthy();
    const liars = enabled.filter((t) => /sim\s*沒有延後排程/.test(t.description ?? ""));
    expect(
      liars.map((t) => t.id),
      "把「引擎沒有」改成「這張模板尚未接」—— 引擎有 kind:delayed（sim/effects/delayed.ts）",
    ).toEqual([]);
  });

  it("③ 展開出 leap 而文案又說「穿牆／不吃地形／無視碰撞」的卡（teleport 一律），要交代牆前截斷／飛行豁免／邊界", () => {
    // ⭐ 觸發的是**宣稱**，⛔ 不是「有 leap 就要寫牆」：charge-push 一句穿牆都沒說，
    //    逼它寫牆規則是在要求一段沒有人讀的散文。teleport 家族一律要寫（GH#1044 點名）。
    const CLAIM = /穿牆|不吃地形|不吃碰撞|無視地形|無視碰撞|不受地形|不受碰撞/;
    const bad: string[] = [];
    for (const t of enabled.filter((x) => isExpandable(x.family))) {
      const ex = expand(t, defaultParamsFor(t));
      if (!ex.effects.some((e) => e.kind === "leap")) continue;
      const d = t.description ?? "";
      if (t.family !== "teleport" && !CLAIM.test(d)) continue;
      const missing = ["牆", "飛行", "邊界"].filter((k) => !d.includes(k));
      if (missing.length > 0) bad.push(`${t.id} 缺：${missing.join("、")}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
