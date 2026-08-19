/**
 * 棘輪基準線：**今天已知的**「同編號技能機制數值不一致」，鍵是 `<編號>|<欄位>`。
 *
 * ⛔ 這不是白名單 —— 它是 GH#417 的**待裁決清單**。每一列都代表一組
 * 同編號的技能在同一個欄位上寫著兩個不同的值，而**編號是 JASS 對照的
 * join key**（`04-03` 永遠是龍破斬）⇒ 其中至少有一邊是錯的。
 *
 * ⭐ 哪一邊對是 **owner 的裁決**（第〇·六守則的階梯：新版說明 > 編輯器 JSON >
 * JASS > w3x 說明 > w3x 設定）。⛔ 這條守衛不猜，也⛔ 不准為了變綠而放寬界線。
 *
 * ── ⭐ 這份名單**按英雄分片**（GH#467 ③）─────────────────────────────────────
 * 真正的資料在 `abilityCodeParity.baseline/<英雄編號>.json`（`70.json` ＝ 70 號英雄
 * 的 `70-00`…`70-04`），一位一個檔。這裡只負責讀整個目錄。
 * ⛔ 不要把鍵搬回這支 `.ts`：全域單檔會讓每一條 lane 在同一個檔上排隊
 * （理由寫在 `baselineShards.ts` 檔頭）。
 *
 *   · 裁決完一組 → 從那個檔刪掉那幾行
 *   · 一位英雄整組清完 → ⭐ **刪掉那個檔**（留下 `[]` 會被 loader 擋下來）
 *   · 孤兒檔（編號在 `content/abilities` 裡根本沒有技能）→
 *     `abilityCodeParity.test.ts` 的孤兒閘會紅 —— 那種檔＝一批**永久關掉**的豁免
 *
 * 整份重新產生（⛔ 不要手打）：
 *   GGD_CODE_PARITY_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParity.test.ts
 *   rm -rf packages/shared/src/content/abilityCodeParity.baseline
 *   cp -R "${TMPDIR:-/tmp}/ggd-ability-code-baseline" packages/shared/src/content/abilityCodeParity.baseline
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadShardedBaseline } from "./baselineShards";

/** 分片目錄。`abilityCodeParity.test.ts` 的重新產生流程也指這裡。 */
export const CODE_PARITY_BASELINE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "abilityCodeParity.baseline",
);

/**
 * 這一筆屬於哪位英雄 —— `04-002|effects` → `04`。
 * ⭐ 對**技能編號**（`04-002`）與**棘輪鍵**都成立，孤兒閘兩邊都用它。
 */
export const codeHero = (codeOrKey: string): string => codeOrKey.split("-")[0]!;

const shards = loadShardedBaseline(CODE_PARITY_BASELINE_DIR, codeHero);

export const KNOWN_CODE_DRIFT: readonly string[] = shards.keys;

/** 檔名（英雄編號）→ 該檔列的鍵。孤兒閘用。 */
export const KNOWN_CODE_DRIFT_BY_HERO = shards.byOwner;
