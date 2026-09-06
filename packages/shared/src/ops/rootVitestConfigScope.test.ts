/**
 * ⭐【誰在吃 repo 根的 vitest 設定】—— GH#428 的閘。
 *
 * vitest 找設定檔用的是 **findUp**（`createVitest()`：
 * `configPath = await findUp(configFiles, { cwd: root })`），所以一個**沒有**自己
 * 設定檔的套件會一路往上撿到 repo 根那一份 —— 而 `root` 仍停在套件目錄，
 * 於是根設定裡每一條**相對路徑**都會用那個套件當基準去解析。
 *
 * 根 `vitest.config.ts` 的檔頭在 2026-08-20 之前寫著相反的話
 * （「per-package runs do NOT read this file」），而 `packages/shared` 的 415 支
 * 測試整批都在吃它。CLAUDE.md 第三守則的形狀：散文說了一件程式不做的事。
 *
 * ⛔ 這一條**不是**在掃字串（失敗形態⑥）—— 它跑的是真的 findUp：讀真的檔案系統、
 * 走真的目錄鏈，答案就是 vitest 會拿到的那一份。
 *
 * 兩個方向都關起來（照 `editorCapabilities.test.ts` 的樣板）：
 *   · 有套件**新**開始繼承根設定 → 紅（有人默默多了一個受害者）
 *   · 名單上的套件**不再**繼承 → 紅（順手修了但檔頭那段話沒跟著更新）
 *
 * 突變紀錄：把 `packages/shared/vitest.config.ts` 改名 → 第一條紅
 *（指名它退回去吃根設定），第二條也紅（shared 又回到繼承名單裡）。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
/** pnpm-workspace.yaml 的三個 glob。 */
const WORKSPACE_GLOBS = ["packages", "apps", "tools"];
/** vitest 認得的設定檔名，優先序由高到低（vitest.config.* 贏 vite.config.*）。 */
const CONFIG_NAMES = ["ts", "mts", "cts", "js", "mjs", "cjs"].flatMap((ext) => [
  `vitest.config.${ext}`,
  `vite.config.${ext}`,
]);

/**
 * ⛔ 這張名單**不是**「應該長這樣」的願望，是 2026-08-20 量到的現況。
 * 它存在的唯一理由是：讓「又多一個套件開始吃根設定」這件事**會紅**，
 * 而不是靜悄悄發生然後在某個人加一格 `setupFiles` 的那天才爆。
 */
const INHERITS_ROOT_CONFIG = [
  "apps/content-api",
  // ⭐ 2026-09-04 Codex 合併帶進來的新 app（Electron 編輯器外殼）—— 它沒有自己的
  //    vitest/vite 設定 ⇒ 吃根設定。⭐ 加進名單是**記錄現況**，⛔ 不是核准。
  "apps/editor-desktop",
  "tools/capability-export",
  // ⭐ 2026-09-06 GH#982/#1031：`tools/icon-gen` 補了 package.json 讓那 4 列 done 的 Test ID 有 runner —— 它沒有自己的 vitest 設定 ⇒ 吃根設定（記錄現況）。
  "tools/icon-gen",
  "tools/model-budget",
  "tools/role-classify",
  "tools/todo-check",
  "tools/ttk-sim",
  "tools/uptime-probe",
  // ⭐ 2026-09-04 Codex 帶進來的視覺驗收工具 —— 同樣沒有自己的設定 ⇒ 吃根設定。
  "tools/vfx-visual-review",
  "tools/w3x-import",
];

/** vitest 的 findUp：從 `dir` 往上走，回傳第一個帶設定檔的目錄。 */
function configOwnerOf(dir: string): string {
  for (let at = dir; ; at = dirname(at)) {
    if (CONFIG_NAMES.some((name) => existsSync(join(at, name)))) return relative(REPO, at) || ".";
    if (at === REPO || dirname(at) === at) return ".";
  }
}

/** 每一個 `test` script 會叫起 vitest 的 workspace 套件。 */
function vitestPackages(): string[] {
  const found: string[] = [];
  for (const glob of WORKSPACE_GLOBS) {
    for (const name of readdirSync(join(REPO, glob))) {
      const manifest = join(REPO, glob, name, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { scripts?: Record<string, string> };
      if ((pkg.scripts?.test ?? "").includes("vitest")) found.push(`${glob}/${name}`);
    }
  }
  return found.sort();
}

describe("repo 根的 vitest 設定會漏進哪些套件（GH#428）", () => {
  it("⭐ packages/shared 有自己的設定 —— ⛔ 沒有的話根設定會套進它 415 支測試", () => {
    expect(
      configOwnerOf(join(REPO, "packages/shared")),
      "packages/shared 又在吃 repo 根的設定了：根設定裡的相對路徑會用 packages/shared/ 當基準解析（GH#428 實測 29 個檔一起紅）",
    ).toBe("packages/shared");
  });

  it("繼承根設定的套件就是名單上那些 —— 多一個或少一個都要紅", () => {
    const inheriting = vitestPackages().filter((p) => configOwnerOf(join(REPO, p)) === ".");
    expect(
      inheriting,
      "繼承名單變了。多出來的套件＝根設定又多一個看不見的受害者；" +
        "少掉的＝有人補了設定檔但沒更新這張名單與根 vitest.config.ts 的檔頭。",
    ).toEqual(INHERITS_ROOT_CONFIG);
  });
});
