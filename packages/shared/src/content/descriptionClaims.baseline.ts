/**
 * 棘輪基準線：**今天已知的**描述↔JSON 不一致，鍵是 `<id>|<rule>`。
 *
 * ⛔ 這不是一張白名單，是一條**只准降不准升**的線：
 *   · 冒出不在名單上的鍵 → 紅（新的謊話被擋在門外）
 *   · 名單上的鍵已經修好 → 也紅（逼名單縮短，否則棘輪永遠不會轉）
 *
 * ⚠️ 只收**開放範圍**（`config/roster.json` 的 `retiredChampions` 以外的英雄
 * ＋三選一固有能力）。退場英雄身上的不一致刻意**不進來也不修**
 * （owner 2026-08-19：「只要做有開放的角色技能及隨機三選一就好」），
 * 數量由 `descriptionClaims.test.ts` 一起印出來，⛔ 不是藏起來讓數字變好看。
 *
 * ── ⭐ 這份名單**按英雄分片**（GH#467 ③）─────────────────────────────────────
 * 真正的資料在 `descriptionClaims.baseline/<英雄>.json`，一位一個檔。
 * 這裡只負責讀整個目錄。⛔ 不要把鍵搬回這支 `.ts`：全域單檔會讓每一條
 * 「修卡面說謊」的 lane 在同一個檔上排隊（理由寫在 `baselineShards.ts` 檔頭）。
 *
 *   · 修好一位英雄的**一筆** → 從那個檔刪掉那一行
 *   · 修好一位英雄的**全部** → ⭐ **刪掉那個檔**（留下 `[]` 會被 loader 擋下來）
 *   · 孤兒檔（檔名不對應任何一位開放英雄／固有能力）→ `descriptionClaims.test.ts`
 *     的孤兒閘會紅 —— 那種檔＝一批**永久關掉**的豁免
 *
 * 整份重新產生（⛔ 不要手打）：
 *   GGD_DESC_CLAIMS_DUMP=1 npx vitest run packages/shared/src/content/descriptionClaims.test.ts
 *   rm -rf packages/shared/src/content/descriptionClaims.baseline
 *   cp -R "${TMPDIR:-/tmp}/ggd-desc-claims-baseline" packages/shared/src/content/descriptionClaims.baseline
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadShardedBaseline } from "./baselineShards";

/** 分片目錄。`descriptionClaims.test.ts` 的重新產生流程也指這裡。 */
export const CLAIMS_BASELINE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "descriptionClaims.baseline",
);

/**
 * 這一筆屬於誰 —— `godie-e001.ex|damage-absent` → `godie-e001`。
 * ⭐ 對**技能 id**（`godie-e001.ex`）與**棘輪鍵**都成立，孤兒閘兩邊都用它。
 * 固有能力（`grail-ex-13`）沒有 `.`，所以就是它自己。
 */
export const claimOwner = (idOrKey: string): string => idOrKey.split("|")[0]!.split(".")[0]!;

const shards = loadShardedBaseline(CLAIMS_BASELINE_DIR, claimOwner);

export const KNOWN_MISMATCHES: readonly string[] = shards.keys;

/** 檔名（英雄／固有能力）→ 該檔列的鍵。孤兒閘用。 */
export const KNOWN_MISMATCHES_BY_OWNER = shards.byOwner;
