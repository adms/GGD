import { configDefaults, defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "./vitest.shared";

/**
 * Root config — governs ad-hoc `npx vitest run <path>` from the repo root,
 * AND every workspace package that has no config file of its own.
 *
 * ⚠️ GH#428 — THIS HEADER USED TO SAY THE OPPOSITE, AND IT WAS A LIE:
 *
 *   「Per-package runs (`pnpm -r test`) do NOT read this file: each package's
 *     vitest resolves its config from its own directory」
 *
 * It resolves it with **findUp**, not "from its own directory". The shipping
 * code, `createVitest()` in node_modules/vitest/dist/chunks/cli-api.*.js:
 *
 *     const root = slash(resolve(options.root || process.cwd()));
 *     const configPath = … : await findUp(configFiles, { cwd: root });
 *                                ^^^^^^ walks UP until it hits one
 *
 * So `root` stops at the package, but the CONFIG keeps climbing to here. A
 * package with no config of its own therefore runs on this file — with its
 * `root` set to the package dir, which means every RELATIVE path written here
 * is resolved against THAT package. Measured (GH#428, lane Q): adding
 * `setupFiles: ["./apps/client/src/testSetup.vfxContent.ts"]` to this file
 * turned 29 files red inside packages/shared with
 * `Failed to load url …/packages/shared/apps/client/src/testSetup…`.
 *
 * ⇒ Anything you add below (setupFiles / environment / globals / coverage
 * thresholds) lands on those packages too. `packages/shared` — 415 test files,
 * by far the biggest inheritor — was cut loose in GH#428 and now has
 * `packages/shared/vitest.config.ts`. The ones still inheriting are enumerated
 * and pinned by `packages/shared/src/ops/rootVitestConfigScope.test.ts`, which
 * goes red BOTH ways: a new package quietly starts inheriting, or one stops.
 * That test is the reason this paragraph cannot rot the way the old one did
 * (CLAUDE.md 第三守則 / 元規則:「把判準換成一個會擋下你的東西」).
 *
 * BACKUP TREES — background tasks drop whole-tree snapshots inside the repo
 * (tools/bgm-gen/.backup-*, .backups/, build/backup-*). Those copies contain
 * real `*.test.ts` files sitting at a different depth than the originals, so
 * their relative imports (`../../testkit/cover`) cannot resolve and every root
 * run reports phantom collection failures. There is no git here yet (task #65),
 * so the snapshots must stay on disk — exclude them instead.
 *
 * `.backup*` covers both `.backups/` and `.backup-<task>-<stamp>/`.
 *
 * ⚠️ `.claude/worktrees/` is the SAME failure with a different cause
 * (2026-08-04): background agents leave git worktrees there, each a full copy
 * of the tree WITHOUT its own `node_modules`. A root run collects them, fails
 * to resolve `zod`, and reports 「1 failed」 for a file that is green in the
 * real tree — so an honest run looks broken and a broken one is easy to
 * dismiss. They are already in `.git/info/exclude`; exclude them here too.
 *
 * ⚠️ `docs/legacy/code/` is a THIRD shape of the same problem (2026-08-18, #356):
 * owner 2026-08-13「請你把舊規格的相關資料都移到 legacy 資料夾」moved three
 * one-off probes (`__mana_probe` / `__autoattack_probe` / `__pacing_probe`) out of
 * `apps/game-server/` and into the archive. They are **exhibits, not tests** —
 * `docs/legacy/code/README` keeps them so the measurements behind old decisions
 * stay readable — and their relative imports point at a tree they no longer sit in.
 * ⛔ Do NOT "fix" their imports: rewriting an archived probe makes it stop being
 * the thing that was actually run. Per-package `pnpm test` never sees them (each
 * package resolves its own config); only a root-level run collects them, so the
 * exclusion belongs here.
 */
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/.backup*/**",
      "**/backup-*/**",
      "**/.claude/worktrees/**",
      "docs/legacy/**",
    ],
    // ⏱ GH#979 —— vitest 的預設逾時是 **5 秒**，而這個 repo 有一整族測試
    //   在 `it` 裡跑整棵出貨內容樹的 `ContentLoader.load()` 或 spawn 一支產生器。
    //   本機 0.7–2.8 秒、GitHub runner **5–9 秒** ⇒ 2026-09-05 CI 第一次真的跑起來時
    //   它一次讓 **10 支**紅（8 支 `packages/shared` ＋ `apps/admin` 的 `mobWavesSave` 8,740ms
    //   ＋ `capability-export`）。
    //
    // ⛔⛔ ⭐ 而它最貴的地方是**症狀**：vitest 把「超時」印成
    //   `FAIL <檔> > <測試名>` —— **與斷言失敗長得一模一樣**
    //   ⇒ 讀的人會去查內容與產生器（我今晚就是那樣查掉了好幾輪）。
    //
    // ⭐ 這是放寬**時鐘**，⛔ 不是放寬斷言。
    // ⚠️ 代價：一支真的**掛住**的測試現在要 60 秒才被殺 —— 那一層由 `ship.mjs`
    //   的逐 suite 看門狗守（CLAUDE.md 第零守則⏲）。
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
