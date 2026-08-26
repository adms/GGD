/**
 * 🔎 每一個模板家族的 `params[*].default` 都要**引用得到一個東西** —— 棘輪只能變短。
 *
 * ⭐ 為什麼有這一支（GH#702 · owner 2026-08-25）：
 *   「你已經知道是**單個大型光束並非間距排列**，是哪裡走歪讓你又把約束勝利之劍等
 *     光束砲家族又變成間距排列？請你**反省根因並修正**」
 *
 * 根因⛔不是「誰粗心」。`schema/template.ts` 早就寫著 `default` is the exemplar's
 * MEASURED value (never invented) —— 而那是**判準**，它從第一份用到它的模板起就破了：
 *   · `tpl-beam-roll` 出生（`799e6988`）時六個數字槽（speed 30 / distance 14 /
 *     spinDegPerSec 720 / scale 2.5 / touchRadius 1.5 / castTimeSec 1）一個出處都沒帶；
 *   · `count:6`（`a3bc9838`）引用的是 20-03 的 `exitwhen > 6`（j:32335 / j:32346）——
 *     而那兩個迴圈**一具 unit 都不生**，它們是傷害取樣格，早已翻成 `onTouch`；
 *   · GH#692 查到 59-04 是一具，只加了**逐支**覆寫 `count:1` ⇒ 另外六個節點繼續錯，
 *     而**逐支覆寫掩蓋了家族預設**（59-04 看起來對了）。
 * ⇒ 推測寫進票會變成需求；推測寫進**模板預設**會變成「原作就是這樣」，
 *   而它的成本是 O(引用這份模板的節點數)，⛔ 不是一支技能。
 *
 * ⇒ 這一支把判準換成閘。三條斷言，⛔ 沒有一條靠人讀：
 *   ① 沒有出處的 `default` 必須在豁免表上（新加一格沒出處的 ⇒ 紅，指名它）
 *   ② 豁免表不可以有**過期的列**（該格補了出處卻沒刪 ⇒ 紅 ⇒ 棘輪只能變短）
 *   ③ `j:<行號>` 的引用**真的去讀 war3map.j 的那一行**（越界／空行 ⇒ 紅）
 *
 * 🚫 STRICT_FAMILIES 是「已經走歪過一次」的名單 —— 它們**永遠不准**再進豁免表。
 *
 * 紅了怎麼辦：⛔ 不要往 `templateOriginBaseline.json` 加列。去把出處貼進
 * `content/ability-templates/<id>.json` 的 `params.<名>.origin`（文法見
 * `schema/template.ts` 的 `origin` 註解）。真的量不到 ⇒ `taxonomy:<理由>`，
 * 那也是一個**能被反駁**的宣稱，⛔ 不是留白。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const TPL_DIR = join(ROOT, "content/ability-templates");
const JASS = join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j");

/** 至少含一個 token 才算「引用得到」；其餘是自由散文。 */
const TOKENS = ["j:", "census:", "owner:", "derived:", "taxonomy:", "inert"] as const;
/** 走歪過一次的家族：⛔ 永遠不准進豁免表。 */
const STRICT_FAMILIES = ["tpl-beam-roll"];

type Slot = { default?: unknown; inert?: string; origin?: string };
type Tpl = { id: string; params: Record<string, Slot> };

const templates: Tpl[] = readdirSync(TPL_DIR)
  .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(TPL_DIR, f), "utf-8")) as Tpl);

const baseline = JSON.parse(
  readFileSync(join(__dirname, "templateOriginBaseline.json"), "utf-8"),
) as { byTemplate: Record<string, { reason: string; params: string[] }> };

/** 棘輪：豁免表的總格數只能變小。⛔ 改大這個數字＝把閘關掉。 */
const RATCHET = 221;

/** 一格需要出處嗎？（有 default、而且不是 inert —— inert 的格子產不出任何東西） */
const needsOrigin = (s: Slot): boolean => "default" in s && !s.inert;
const isSourced = (s: Slot): boolean =>
  typeof s.origin === "string" && TOKENS.some((t) => s.origin!.includes(t));

const exempt = (tid: string, param: string): boolean =>
  (baseline.byTemplate[tid]?.params ?? []).includes(param);

describe("模板家族的每一個 default 都要引用得到出處", () => {
  it("① 沒有出處的 default 一律要在豁免表上", () => {
    const drift: string[] = [];
    for (const t of templates)
      for (const [k, s] of Object.entries(t.params))
        if (needsOrigin(s) && !isSourced(s) && !exempt(t.id, k)) drift.push(`${t.id}.${k}`);
    expect(
      drift,
      `這些 params[*].default 引用不到任何東西,而且不在豁免表上 —— ` +
        `⛔ 不要把它們加進 templateOriginBaseline.json(那張表只能變短),` +
        `去 content/ability-templates/ 貼 origin:\n  ${drift.join("\n  ")}`,
    ).toEqual([]);
  });

  it("② 豁免表不可以有過期的列（棘輪只能變短）", () => {
    const stale: string[] = [];
    let total = 0;
    for (const [tid, row] of Object.entries(baseline.byTemplate)) {
      const t = templates.find((x) => x.id === tid);
      for (const k of row.params) {
        total += 1;
        const s = t?.params?.[k];
        if (s === undefined) stale.push(`${tid}.${k} —— 這一格已經不存在了`);
        else if (!needsOrigin(s)) stale.push(`${tid}.${k} —— 已經沒有 default(或轉成 inert)`);
        else if (isSourced(s)) stale.push(`${tid}.${k} —— ⭐ 已經有 origin 了,把這一列刪掉`);
      }
      expect(row.reason.length, `${tid} 的豁免理由是空的 —— 理由要能被反駁`).toBeGreaterThan(20);
    }
    expect(stale, `豁免表過期:\n  ${stale.join("\n  ")}`).toEqual([]);
    expect(total, "豁免表變長了 —— 棘輪只能變短").toBeLessThanOrEqual(RATCHET);
  });

  it("③ j:<行號> 的引用要真的指到 war3map.j 的一行", () => {
    if (!existsSync(JASS)) {
      // fail-open,⛔ 但不靜默:安靜地跳過與「全部通過」長得一模一樣。
      expect(
        process.env.GGD_ALLOW_MISSING_JASS,
        `⚠️ 量不到:${JASS} 不在這台機器上 ⇒ 行號引用**沒有被驗**。` +
          `要讓這條合法跳過請設 GGD_ALLOW_MISSING_JASS=1。`,
      ).toBeTruthy();
      return;
    }
    const lines = readFileSync(JASS, "utf-8").split("\n");
    const bad: string[] = [];
    for (const t of templates)
      for (const [k, s] of Object.entries(t.params))
        for (const m of (s.origin ?? "").matchAll(/\bj:(\d+)\b/g)) {
          const n = Number(m[1]);
          const line = lines[n - 1];
          if (line === undefined) bad.push(`${t.id}.${k} → j:${n} 超出 ${lines.length} 行`);
          else if (line.trim() === "") bad.push(`${t.id}.${k} → j:${n} 是空行`);
        }
    expect(bad, `行號引用對不上 war3map.j:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("④ 走歪過的家族永遠不准再進豁免表", () => {
    for (const tid of STRICT_FAMILIES) {
      expect(
        baseline.byTemplate[tid],
        `${tid} 是 STRICT_FAMILIES —— 它已經因為一個沒有出處的 default(count:6) ` +
          `讓七個出貨節點錯了一整版,⛔ 它不可以再拿豁免。`,
      ).toBeUndefined();
      const t = templates.find((x) => x.id === tid)!;
      const unsourced = Object.entries(t.params)
        .filter(([, s]) => needsOrigin(s) && !isSourced(s))
        .map(([k]) => `${tid}.${k}`);
      expect(unsourced, `STRICT 家族的每一格 default 都要帶出處`).toEqual([]);
    }
  });
});
