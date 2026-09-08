/**
 * `config.cast-time-tiers@1` —— ⭐ **吟唱的五級距**（GH#943）。
 *
 * owner 2026-09-02（逐字）：
 * > 「吟唱⋯其實這個也可以五級距 **0, 0.1, 0.3, 0.5, 1** 建議也改成這個」
 *
 * ⛔ 那五格是**他給的**，⛔ 不要自己挑（第一守則）。
 *
 * ## ⭐ 與 `config.cast-time@1` **不重疊**（⛔ 不是第二個住處）
 *
 * · 這一份：作者**寫**得出什麼（五格下拉，⛔ 不是空白數字框）
 * · `cast-time@1`：引擎**夾**成什麼（floor / cap / 倍率 / tick 對齊）
 *
 * ⚠️ 上界 **1.0** 與 `castTimeMaxSec`（#787 owner 夾）刻意同一個數字 ——
 * ⭐ 級距寫得出來的最大值，就是引擎夾得住的最大值
 * ⇒ ⛔ 作者不可能寫出一個「會被靜靜夾掉」的值。
 */
import { z } from "zod";
import { zId } from "../common";
import { SKILL_TIER_NAMES } from "../../skillTiers";

/** ⭐ 五格逐字對到 `SKILL_TIER_NAMES` —— ⛔ 不在這裡再抄一份級距名。 */
const zSecondsByTier = z
  .object(
    Object.fromEntries(
      SKILL_TIER_NAMES.map((n) => [n, z.number().min(0).max(10)]),
    ) as Record<(typeof SKILL_TIER_NAMES)[number], z.ZodNumber>,
  )
  .strict();

export const zConfigCastTimeTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cast-time-tiers@1"),
    note: z.string().optional(),
    /** ⛔ 關掉 ⇒ `resolveCastTimeTier` 回 `null`（＝這一格不作用）。 */
    enabled: z.boolean(),
    /** ⭐ 級距 → 秒。出貨 `0 / 0.1 / 0.3 / 0.5 / 1.0`（owner 逐字）。 */
    seconds: zSecondsByTier,
  })
  .strict();

export type ConfigCastTimeTiersDoc = z.infer<typeof zConfigCastTimeTiersDoc>;
