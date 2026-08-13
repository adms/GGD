import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

// ⚠️ `RESOLVE_TS_FIRST` 不是可選的：這裡的測試 import `@ggd/shared/map/*`，
// 沒有它 vitest 解不到 workspace 的 TypeScript 原始碼，整個測試**檔**會載入失敗，
// 而 vitest 把那個報成「no tests」而不是失敗 —— 一個載入不了東西的套件不是通過的套件。
// 逐字比照 tools/voxel-gen/vitest.config.ts 的理由。
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: { environment: "node", include: ["**/*.test.ts"], exclude: ["node_modules/**"] },
});
