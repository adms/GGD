import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

// WHY THIS FILE EXISTS. `tools/voxel-gen` shipped without a vitest config, which
// was fine while its tests only imported local files. The 體素條碼 work added
// tests that import `@ggd/shared/content/voxelSkin` and `@ggd/shared/voxel/*`
// through the package `exports` map, and without `RESOLVE_TS_FIRST` vitest
// cannot resolve those to the workspace TypeScript sources — all five test FILES
// failed to load, which vitest reports as 「no tests」 rather than as failures.
//
// ⚠️ 「no tests」 IS THE DANGEROUS SHAPE: a suite that loads nothing is not a
// suite that passes, but a CI line reading `Tests no tests` next to `5 failed`
// is easy to skim past. Mirrors apps/game-server/vitest.config.ts, which carries
// the full story of the dual-instance registry trap.
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: {
    // ⏱ GH#979 —— vitest 預設 5 秒在 CI runner 上不夠（見 repo 根的 vitest.config.ts）。
    //   ⭐ 放寬**時鐘**，⛔ 不是放寬斷言。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
