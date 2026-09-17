/**
 * ⭐ GH#1166：一張「幾乎什麼都沒跑」的綠燈，限定詞要寫在**結論旁邊**（⛔ 不是只在開頭那行 why 裡）。
 *   0 個改動路徑 vs base ⇒ vitest 裁到 0 包、產生器裁到 0 支 ⇒ 綠燈只證明「自 base 起沒有改動」，
 *   ⛔ 不證明 base 本身被全跑驗過（例：合併進 main 而從沒全跑過的東西）。
 *
 * ⚠️ 抽成純函式的理由（GH#1166 審查）：它原本內嵌在 `ship.mjs` 的收尾，
 *   ⇒ 把那兩行刪掉**每一條測試都還是綠的**。抽出來之後 `shipGateScript.test.ts` 兩個方向都跑得到
 *   （0 包／0 支 ⇒ 有警示；有跑東西 ⇒ 沒有），並驗 `ship.mjs` 的綠燈那一行真的接著它。
 *   ⛔ 行為不變：只加一行 ⚠️，不改離開碼、不改跑哪幾支。
 *
 * @param {{ onlySync: boolean, noSync: boolean, suites: number, allSuites: number,
 *           syncSteps: number | undefined, baseLabel: string | null | undefined,
 *           pathCount: number | undefined }} a
 *   `syncSteps` 是裁剪後的支數；`undefined` ＝ 沒有裁（全跑或 fail-closed），⛔ 不算「0 支」。
 * @returns {string} 空字串 ＝ 不必警示
 */
export function emptyGateNote({ onlySync, noSync, suites, allSuites, syncSteps, baseLabel, pathCount }) {
  const empty = [
    ...(!onlySync && suites === 0 ? [`本次沒有跑任何 vitest 包（0/${allSuites}；只剩 tools/deploy-timing 那一格）`] : []),
    ...(!noSync && syncSteps === 0 ? ["本次沒有跑任何 skills:sync 產生器（只跑了 content:build）"] : []),
  ];
  return empty.length
    ? `\n⚠️ ${empty.join("、")} —— base ${baseLabel ?? "(無)"} · ${pathCount ?? "?"} 個改動路徑 ⇒ 這張綠燈⛔ 不證明 base 本身被全跑驗過（要驗它：換一個更早的 --sync-base）`
    : "";
}
