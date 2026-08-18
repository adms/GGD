import { configDefaults, defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "./vitest.shared";

/**
 * Root config — governs ad-hoc `npx vitest run <path>` from the repo root.
 *
 * Per-package runs (`pnpm -r test`) do NOT read this file: each package's
 * vitest resolves its config from its own directory, so this only shapes the
 * whole-tree scan you get when invoking vitest at the root.
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
  },
});
