import { z } from "zod";
import { zId } from "../common";
// 移速／攻速的**每級成長**五級距（owner 2026-08-21）。⛔ 這裡刻意不抄那 20 個
// 數字：兩把梯子逐字住在 content/speedGrowthTiers.ts，抄一份就是第二個住處。
import { DEFAULT_SPEED_GROWTH_TIERS, SPEED_GROWTH_AXES, SPEED_GROWTH_AXIS_LABEL, SPEED_GROWTH_LADDER_IDS, SPEED_GROWTH_MAX, SPEED_GROWTH_MIN, SPEED_GROWTH_TIERS_DOC_ID, SPEED_GROWTH_TIER_FIELD, SPEED_GROWTH_TIER_NAMES, describeSpeedGrowthTiers, type SpeedGrowthAxis } from "../../speedGrowthTiers";

/**
 * config.speed-growth-tiers@1 — 移速／攻速的**每級成長**五級距（owner 2026-08-21）。
 *
 * ⭐ 它與另外五軸的差別是**起點**：那五軸是「216 支各帶一個自由數字，收進格點」，
 * 這一軸量到的是「**49 位共用一個常數**」（ms 每級成長全部 0、as 全部 0.02）——
 * 所以它解鎖的是一個**今天不存在的設計維度**，⛔ 不是一次重新分配。
 *
 * ⛔ 這裡刻意**不抄那 20 個數字**，也不抄兩把梯子的取捨理由：它們住在
 * `content/speedGrowthTiers.ts` 的檔頭（含 LV30 / LV99 的量測表）。
 */
export const zConfigSpeedGrowthTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.speed-growth-tiers@1"),
    note: z.string().optional(),
    /** 止血閥兼一鍵 rollback。false = 兩個級別欄位都不解析。 */
    enabled: z
      .boolean()
      .describe(
        `關掉之後 \`${SPEED_GROWTH_TIER_FIELD.ms}\` / \`${SPEED_GROWTH_TIER_FIELD.as}\` 不解析，` +
          "每一位回到自己英雄卡上手寫的 `growth.ms` / `growth.as` —— 一鍵 rollback。" +
          "⚠️ 那些原值一直都在（級別只在**註冊時**蓋過去），⛔ 這一軸從來沒有銷毀退路值。",
      ),
    /** 用哪一把梯子 —— owner 2026-08-21 的兩個候選。 */
    ladder: z
      .enum(SPEED_GROWTH_LADDER_IDS)
      .describe(
        "用 owner 給的哪一把梯子。⭐ 出貨 `A`（他自己說「預設走 A」，而且 A 的極大在 hard limit LV30 " +
          "還壓得住攻速上限 4，B 的極大在 LV30 就讓 49 位裡 47 位越過上限 ⇒ 頂端那一格看不出差別）。" +
          "⚠️ **今天切 A↔B 一個位元都不會動** —— 49 位落在兩把梯子值相同的那兩格。",
      ),
    /**
     * ⭐ 「這一版零平衡改動」的**宣告**。守衛讀這一格決定要不要逐位元對帳。
     * ⚠️ 開始重新分級的那天關掉它，⛔ 不是去改測試。
     */
    requireAuthoredParity: z
      .boolean()
      .describe(
        "@zh 宣告「這一版零平衡改動」\n" +
        "@note 開著 = 宣告「每一位的級別解析出來**逐位元等於**他英雄卡上原本的成長」，`pnpm speedtiers:check` 與守衛會逐位對帳。⭐ 這一版出貨就是這樣。⚠️ 開始重新分級（把某一位移出預設那一格）的那天**把它關掉** —— 那才是「我知道我在改平衡」的宣告。⛔ 不要去改測試：一條永遠為真的守衛與一條被偷偷改掉的守衛，壞處是一樣的。\n" +
        "開著 = 宣告「每一位的級別解析出來**逐位元等於**他英雄卡上原本的成長」，守衛會逐位對帳（`speedGrowthTiers.test.ts`）。⭐ 這一版出貨就是這樣：級距機制上線，⛔ 平衡一格沒動。⚠️ owner 開始重新分級（把某一位移出預設那一格）的那天**把它關掉**，⛔ 不要改測試 —— 一條永遠為真的守衛與一條被偷偷改掉的守衛，壞處是一樣的。"
      ),
    /** 兩把梯子 × 兩條軸 × 五格 = 20 個數字，每一格都能單獨調。 */
    growth: z
      .object(
        Object.fromEntries(
          SPEED_GROWTH_LADDER_IDS.map((id) => [
            id,
            z
              .object(
                Object.fromEntries(
                  SPEED_GROWTH_AXES.map((axis) => [
                    axis,
                    z
                      .object(
                        Object.fromEntries(
                          SPEED_GROWTH_TIER_NAMES.map((n) => [
                            n,
                            z
                              .number()
                              .min(SPEED_GROWTH_MIN)
                              .max(SPEED_GROWTH_MAX[axis])
                              .describe(
                                // ⭐ GH#992 —— 後台那一頁的短名／說明從這裡推導，⛔ 不在 `apps/admin` 再打一份。
                                `@zh 梯子 ${id}・${SPEED_GROWTH_AXIS_LABEL[axis]}・${n}\n` +
                                  `@note 填 \`${SPEED_GROWTH_TIER_FIELD[axis]}: "${n}"\` 的英雄**每升一級**加多少${SPEED_GROWTH_AXIS_LABEL[axis]}。` +
                                  `⚠️ 只有「用哪一把梯子」選到 ${id} 的時候這一格才生效。⭐ 出貨值 {{出貨值}}（owner 逐字給的規格，⛔ 不是推導出來的）。` +
                                  `⚠️ 改這一格，每一位標成「${n}」的英雄同時跟著變 —— 而且它乘上等級：LV99 的差距是這個數字的 98 倍。` +
                                  `梯子 ${id} 的「${n}」在**${SPEED_GROWTH_AXIS_LABEL[axis]}**上每升一級加多少。` +
                                  `⚠️ 下界 ${SPEED_GROWTH_MIN}：負成長＝越升級越慢，會被 STAT_CLAMPS 靜默夾住（做得到、看不出來）。` +
                                  `⚠️ 上界 ${SPEED_GROWTH_MAX[axis]} ＝ 這條屬性解鎖後的天花板 ÷ (等級上限−1)，` +
                                  `是一道 mis-parse 柵欄（把 0.05 打成 5），⛔ 不是平衡判準。${describeSpeedGrowthTiers()}`,
                              ),
                          ]),
                        ) as Record<(typeof SPEED_GROWTH_TIER_NAMES)[number], z.ZodNumber>,
                      )
                      .strict(),
                  ]),
                ) as unknown as Record<SpeedGrowthAxis, z.ZodTypeAny>,
              )
              .strict(),
          ]),
        ) as unknown as Record<(typeof SPEED_GROWTH_LADDER_IDS)[number], z.ZodTypeAny>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_SPEED_GROWTH_TIERS_DOC = {
  id: SPEED_GROWTH_TIERS_DOC_ID,
  schema: "config.speed-growth-tiers@1",
  enabled: DEFAULT_SPEED_GROWTH_TIERS.enabled,
  ladder: DEFAULT_SPEED_GROWTH_TIERS.ladder,
  requireAuthoredParity: DEFAULT_SPEED_GROWTH_TIERS.requireAuthoredParity,
  growth: DEFAULT_SPEED_GROWTH_TIERS.growth,
} as const;
