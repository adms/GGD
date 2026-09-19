import { expect, it } from "vitest";
import { MODEL_VERSION_PREFIX } from "../../packages/shared/src/content/schema/championModelVersions";
import { buildReport } from "./audit-dropdown-claims.mts";

/**
 * GH#1188 / #1265 / #1262 —— 挑模型的**兩個面**要給得出一致的答案，而列出來的每一顆要真的載得進去。
 *
 * ⭐ 這一條驗的是**關係**（兩個面的清單互相對得上），⛔ 不是名詞（「清單有幾筆」）。
 * ⚠️ 棘輪那一條只能變小：#1265 未決的 34 份 ou99 衍生**不可以靜靜地變多**。
 */

/** ⛔ 只能變小。⭐ 補了 `heroBody`（或決定不補並改判準）就把這個數字改小並 commit，否則棘輪會鬆掉。 */
const OU99_DERIVATIVE_BASELINE = 34;

it("後台與編輯器的模型清單對得上，而且列出來的每一顆都載得進去", () => {
  const report = buildReport();

  // ⭐ sentinel（⛔ 一個空清單不可以通過）—— 兩個面都要真的列得出東西，
  //    否則下面每一條「差集是空的」都會在**功能整個死掉**的時候變綠（假綠燈⑩）。
  expect(report.summary.adminOptions).toBeGreaterThan(0);
  expect(report.summary.editorOptions).toBeGreaterThan(0);
  expect(report.rows.every((row) => row.admin || row.editor)).toBe(true);

  // ⛔⛔ 凍結版本（`version.body.*`）是「某支英雄某個時間點的身體」這個歷史事實的快照，
  //    ⛔ 不是可挑的身體。編輯器那一頭由 `apps/editor/src/hero/catalog.test.ts` 擋著，
  //    ⭐ 這一條把**同一個不變量**擴到後台那一頭（`contentApi.ts` 的 `readModelVersionCatalog` 濾它）。
  expect(report.rows.filter((row) => row.id.startsWith(MODEL_VERSION_PREFIX)).map((row) => row.id)).toEqual([]);

  // ⭐ 兩頭都走的**反方向**（假綠燈⑫）：編輯器挑得到、而後台看不到的 ⇒ 兩個面對同一個問題答案不同。
  expect(
    report.editorOnly.map((row) => row.id),
    "⛔ 編輯器列得到而後台列不到 —— 兩個挑模型的面對同一顆給了不同答案",
  ).toEqual([]);

  // ⭐ 「選了就看得到」的前提：文件過 schema · GLB 在磁碟（或 `assets-offdisk.json` 宣告過）且在 git ·
  //    GLB 的 JSON 區段 ≤ `MODEL_UPLOAD_LIMITS.jsonBytes`（⚠️ 超了 ⇒ 遊戲載得進去而**編輯器打不開**）。
  expect(
    report.readinessProblems.map((row) => `${row.id}：${row.problems.join("；")}`),
    "⛔ 下拉列得出來、而選下去載不起來",
  ).toEqual([]);

  // ⚠️ 棘輪 —— #1265 Scope 3 還沒決定的那批（ou99 加工副本沒寫 `heroBody` ⇒ 後台列得到、編輯器列不到）。
  expect(
    report.adminOnlyFamilies.ou99Derivative,
    `⛔ ou99 衍生「編輯器列不到」從 ${OU99_DERIVATIVE_BASELINE} 變成 ${report.adminOnlyFamilies.ou99Derivative}。` +
      "⭐ 補了 `heroBody` 就把 OU99_DERIVATIVE_BASELINE 改小；變多代表又有加工副本只進了後台。",
  ).toBeLessThanOrEqual(OU99_DERIVATIVE_BASELINE);
});
