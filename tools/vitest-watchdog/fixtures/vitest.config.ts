import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vitest/config";
import shipped from "../../../packages/shared/vitest.config";

// ⏲️ GH#1257 —— **出貨的** `packages/shared` 設定（看門狗接線就從那裡來），只換掉「收哪幾個檔」。
// ⛔ 夾具不可以進任何預設 include：一個永遠卡住的檔被全套收進去，每一跑都會被它拖住。
// vitest 2.1.9 沒有 `--include` 旗標，所以守衛用 `--config` 指這一份。
export default mergeConfig(shipped, {
  test: { dir: dirname(fileURLToPath(import.meta.url)), include: ["*.fixture.ts"] },
});
