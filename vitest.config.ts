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
 */
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/.backup*/**",
      "**/backup-*/**",
    ],
  },
});
