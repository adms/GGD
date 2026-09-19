/**
 * 🚢 出貨閘的兩個**裁剪決定** —— 純函式（⛔ 沒有 I/O），所以守衛驗得到**兩個方向**。
 *
 * ── 為什麼有這一支（2026-09-19 量到的）──────────────────────────
 * 一次完整的 `ship:check` wall **1539.7s（25.7 分）**，拆開來：
 *   · 序列段 685.4s —— `content:build` ＋ `sync:converge`（跑到不動點，上限 3 輪）
 *   · 並行段 ~854s —— 地板是 `vitest packages/shared` 639.8s；`pnpm lint` 全掃 381.8s
 *
 * ⭐ **序列段每一次都無條件重新產生一次**，⛔ 而出貨前本來就跑過 `pnpm skills:sync`
 * ⇒ 多數情況那 685 秒是在重做一件剛剛才做完的事。
 *
 * ⚠️ 而「改動路徑裁剪」**不是**解法（同日量到，⛔ 不要再往那個方向修）：
 *   · 改一個 `packages/shared` 的檔 ⇒ 裁剪後仍要跑 **67/69** 支（548.3s vs 全跑 550.9s）
 *   · 改一個 README ⇒ **65/69**（545.9s）
 *   ⇒ 裁剪就算完全修好也只省 3～5 秒。
 *
 * ⇒ ⭐ 正解是問**另一個問題**：「產物到底是不是已經最新的？」
 *   `skills:check` 本來就在回答它（逐位元比對），而它是**唯讀**的 ——
 *   先跑它，綠 ⇒ 序列段整段跳過，⛔ 而判準一個字都沒放寬。
 *
 * ── ⛔ fail-closed 的方向（⛔ 一個都不可以倒過來）──────────────────
 *   · 探針沒跑 / 跑不起來 / 紅 ⇒ **照舊重新產生**
 *   · 不知道這一次改了哪些路徑 ⇒ lint **全掃**
 *   · 動到 eslint／tsconfig／package.json／lockfile ⇒ lint **全掃**（規則本身變了，
 *     ⭐ 沒改到的檔也可能從綠變紅）
 */

/** lint 只管這三個 root（`package.json` 的 `lint` 逐字是 `eslint apps packages tools`）。 */
export const LINT_ROOTS = ["apps", "packages", "tools"];
const LINTABLE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
/** 改到它 ⇒ 全掃：規則／型別設定／相依變了，**沒被改到的檔**也可能從綠變紅。 */
const RULE_LEVEL = /(^|\/)(eslint\.config\.[^/]+|\.eslintrc[^/]*|tsconfig[^/]*\.json|package\.json|pnpm-lock\.yaml)$/;

/**
 * 序列段（重新產生產物）要不要跑。
 *
 * @param {{ probeCode?: number|null, disabled?: boolean, noSync?: boolean }} o
 *   `probeCode` = 唯讀 `skills:check` 的離開碼（`null` ＝ 沒跑／跑不起來）
 * @returns {{ run: boolean, why: string }}
 */
export function regenPlan({ probeCode = null, disabled = false, noSync = false } = {}) {
  if (noSync) return { run: false, why: "`--no-sync` ⇒ 序列段本來就不跑" };
  if (disabled) return { run: true, why: "🔙 `GGD_SHIP_SKIP_FRESH_SYNC=0` ⇒ 照舊重新產生" };
  if (probeCode === 0) return { run: false, why: "⭐ 產物逐位元最新（唯讀 skills:check 綠）⇒ 跳過重新產生" };
  if (probeCode === null || probeCode === undefined)
    return { run: true, why: "⛔ 探針沒跑（fail-closed）⇒ 重新產生" };
  return { run: true, why: `⛔ 產物過期（唯讀 skills:check 回 ${probeCode}）⇒ 重新產生再驗一次` };
}

/**
 * lint 這一次要掃什麼。
 *
 * @param {{ paths?: string[]|null, exists?: (p: string) => boolean, disabled?: boolean }} o
 * @returns {{ files: string[]|null, skip: boolean, why: string }}
 *   `files === null` ＝ 全掃（`pnpm lint`）· `skip` ＝ 這一次沒有 lint 得到的檔
 */
export function lintPlan({ paths = null, exists = () => true, disabled = false } = {}) {
  if (disabled) return { files: null, skip: false, why: "🔙 `GGD_SHIP_LINT_TRIM=0` ⇒ 全掃" };
  if (!paths) return { files: null, skip: false, why: "⛔ 不知道這一次改了哪些路徑 ⇒ 全掃（fail-closed）" };
  const ruleLevel = paths.find((p) => RULE_LEVEL.test(p));
  if (ruleLevel) return { files: null, skip: false, why: `⛔ 規則層的檔動了（${ruleLevel}）⇒ 全掃` };
  const files = [...new Set(paths.filter((p) => LINTABLE.test(p) && LINT_ROOTS.includes(p.split("/")[0]) && exists(p)))].sort();
  if (!files.length) return { files: [], skip: true, why: "⭐ 這一次沒有動到 apps／packages／tools 的 JS/TS ⇒ 跳過" };
  return { files, skip: false, why: `⭐ 只掃改動的 ${files.length} 個檔（全掃約 382s）` };
}
