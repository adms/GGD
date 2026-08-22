import { z } from "zod";
import { zId } from "../common";
// AoE 四級距（owner 2026-08-11「原則上不寫範圍數字」）—— 同一條規矩：
// 數字與語意定義在 content/aoeTiers.ts，schema 只是把它搬上 Zod。
import { AOE_TIER_NAMES, AOE_TIER_RADIUS_MAX, AOE_TIER_RADIUS_MIN, AOE_TIERS_DOC_ID, DEFAULT_AOE_TIERS } from "../../aoeTiers";

/**
 * config.aoe-tiers@1 — AoE 範圍四級距（owner 2026-08-11）。
 *
 * owner：「重新對應範圍只有 小/中/大/超大，**原則上不寫範圍數字**」。
 * → 技能 JSON 填 `radiusTier: "中"`，這張表決定「中」是多少半徑。
 * 語意、四個數字的來歷、以及「級別 vs 手寫 radius 誰贏」寫在 `content/aoeTiers.ts`。
 *
 * ⚠️ 上界 24 = 決鬥區半徑。大於它的「範圍」就是全場命中，那要走另一種寫法。
 */
export const zConfigAoeTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.aoe-tiers@1"),
    note: z.string().optional(),
    /** 止血閥。false = `radiusTier` 不解析（填了也不生效，但看得見它是關的）。 */
    enabled: z.boolean(),
    /** 級別 → 半徑（GGD 單位）。四格都必填，缺一格就不是一把完整的尺。 */
    radius: z
      .object(
        Object.fromEntries(
          AOE_TIER_NAMES.map((n) => [
            n,
            z.number().min(AOE_TIER_RADIUS_MIN).max(AOE_TIER_RADIUS_MAX),
          ]),
        ) as Record<(typeof AOE_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_AOE_TIERS_DOC = {
  id: AOE_TIERS_DOC_ID,
  schema: "config.aoe-tiers@1",
  enabled: DEFAULT_AOE_TIERS.enabled,
  radius: DEFAULT_AOE_TIERS.radius,
} as const;
