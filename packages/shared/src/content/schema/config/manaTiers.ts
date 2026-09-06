import { z } from "zod";
import { zId } from "../common";
// 耗魔五級距（2026-08-21）—— 五軸的最後一軸。五格從魔力池與 owner 的兩個錨
// 推導，推導式寫在 content/manaTiers.ts。
import { DEFAULT_MANA_TIERS, MANA_TIERS_DOC_ID, MANA_TIER_MAX, MANA_TIER_MIN, MANA_TIER_NAMES, describeManaTiers } from "../../manaTiers";
import { HARD_ANCHOR_LEVEL } from "../../balanceAnchors";

/**
 * config.mana-tiers@1 — 耗魔**五級距**（2026-08-21）。
 *
 * ⭐ 這是五軸裡**最後補上**的一軸。在它之前 `ability@1` 上根本沒有 `manaCostTier`
 * 一格 ⇒ 冷卻 350 支填了級別、施法距離 186 支、AoE 96 支、傷害 199 支，而耗魔是
 * **0 支** —— 那不是「大家忘了填」，是**機制沒做**。
 *
 * ⛔ 這裡刻意**不抄五個數字**：它們由 `content/manaTiers.ts` 從魔力池與 owner 的
 * 兩個錨現算（「範圍技連續八次」＝中÷8、「四個大範圍」＝大÷4）。抄一份到這個
 * 檔頭就是第二個住處，而它會在下一次重錨時無聲過期。
 */
export const zConfigManaTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.mana-tiers@1"),
    note: z.string().optional(),
    /** 止血閥兼一鍵 rollback。false = `manaCostTier` 不解析（回到手寫 `manaCost`）。 */
    enabled: z
      .boolean()
      .describe(
        "@zh 級距總開關\n" +
        "@note 關掉之後 `manaCostTier` 不解析，技能回到自己手寫的 `manaCost[]` —— ⭐ 那就是**一鍵回到全轉之前的那一套耗魔**。⚠️ 關掉**不會**讓技能變免費。\n" +
        "關掉之後 `manaCostTier` 不解析，技能回到自己手寫的 `manaCost[]` ——一鍵 rollback。⚠️ 關掉**不會**讓技能變免費。"
      ),
    /** 級別 → 耗魔點數。五格都必填，缺一格就不是一把完整的尺。 */
    manaCost: z
      .object(
        Object.fromEntries(
          MANA_TIER_NAMES.map((n) => [
            n,
            z
              .number()
              .min(MANA_TIER_MIN)
              .max(MANA_TIER_MAX)
              .describe(
                // ⭐ GH#992 —— 後台那一頁的短名／說明從這裡推導，⛔ 不在 `apps/admin` 再打一份。
                `@zh ${n} — 耗魔\n` +
                  `@note 填 \`manaCostTier: "${n}"\` 的技能一發花多少魔力（出貨值 {{出貨值}}）。` +
                  `⚠️ 改這一格，樹上每一支標成「${n}」的技能同時跟著變 —— 而且它會直接改變「連續幾發要等回魔」，那正是 owner 給錨的那句話。` +
                  `「${n}」的耗魔點數。⭐ 五格從**魔力池**推導，⛔ 不要手打 —— ${describeManaTiers()}` +
                  `⚠️ 上界 ${MANA_TIER_MAX} ＝ LV${HARD_ANCHOR_LEVEL} 的中位魔力池：一發花光整條魔條已經是極端，` +
                  `超過它的技能一輩子放不出來。⚠️ 下界 ${MANA_TIER_MIN} —— 0 是「免費技」，` +
                  `那要走**不填級別而且 manaCost 全 0** 的寫法，⛔ 不是把這一格填成 0。`,
              ),
          ]),
        ) as Record<(typeof MANA_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_MANA_TIERS_DOC = {
  id: MANA_TIERS_DOC_ID,
  schema: "config.mana-tiers@1",
  enabled: DEFAULT_MANA_TIERS.enabled,
  manaCost: DEFAULT_MANA_TIERS.manaCost,
} as const;
