import { z } from "zod";
import { zId } from "../common";
// 施法距離五級距（GH#414）—— 同一條規矩，同一條梯子（content/skillTiers.ts）。
import { RANGE_TIER_NAMES, RANGE_TIER_MAX, RANGE_TIER_MIN, RANGE_TIERS_DOC_ID, DEFAULT_RANGE_TIERS } from "../../rangeTiers";

/**
 * config.range-tiers@1 — 施法距離五級距（GH#414，owner 2026-08-19
 *「可施展技能的距離普遍超遠」）。
 *
 * 這一軸在 2026-08-19 之前**完全沒有表**：216 支技能各自帶一個從 w3a 換算來的
 * 自由數字，中位數 11、最大 29.33，而決鬥區半徑只有 24。⇒ 補的是級距，
 * ⛔ 不是換算係數（係數 11/600 經 owner 的校準點驗證過是對的）。
 *
 * 級距名與梯級的來歷寫在 `content/rangeTiers.ts` 與 `content/skillTiers.ts`。
 * ⚠️ 上界 24 = 決鬥區半徑（同 AoE）。
 */
export const zConfigRangeTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.range-tiers@1"),
    note: z.string().optional(),
    /** 止血閥。false = `rangeTier` 不解析（填了也不生效，但看得見它是關的）。 */
    enabled: z.boolean().describe(
      "@zh 級距總開關\n" +
      "@note 關掉之後 `rangeTier` 不解析（填了也不生效），技能只剩手寫的 `range`。⚠️ 關掉**不會**讓技能失去射程 —— 手寫值一直都在。",
    ),
    /** 級別 → 施法距離（GGD 單位）。五格都必填，缺一格就不是一把完整的尺。 */
    range: z
      .object(
        Object.fromEntries(
          // ⭐ GH#992 —— 後台那一頁的短名／說明從這裡推導，⛔ 不在 `apps/admin` 再打一份。
          RANGE_TIER_NAMES.map((n) => [
            n,
            z
              .number()
              .min(RANGE_TIER_MIN)
              .max(RANGE_TIER_MAX)
              .describe(
                `@zh ${n} — 施法距離\n` +
                  `@note 填 \`rangeTier: "${n}"\` 的技能打得到多遠（卡面值）。⚠️ 改這一格，樹上每一支標成「${n}」的技能同時跟著變。`,
              ),
          ]),
        ) as Record<(typeof RANGE_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_RANGE_TIERS_DOC = {
  id: RANGE_TIERS_DOC_ID,
  schema: "config.range-tiers@1",
  enabled: DEFAULT_RANGE_TIERS.enabled,
  range: DEFAULT_RANGE_TIERS.range,
} as const;
