import { z } from "zod";
import { zId } from "../common";
// 傷害五級距（GH#447）—— 唯一的**回報**軸。五個數字從冷卻表推導，
// 推導式與 owner 的兩條輸入寫在 content/damageTiers.ts。
import { DAMAGE_TIER_MAX, DAMAGE_TIER_MIN, DAMAGE_TIER_NAMES, DAMAGE_TIERS_DOC_ID, DEFAULT_DAMAGE_TIERS, KILL_CASTS_REF, SHIPPED_ANCHOR_LEVEL, anchorFloor, castsToKill } from "../../damageTiers";
import { BALANCE_ANCHOR_LEVELS, HARD_ANCHOR_LEVEL, HP_BASE_BONUS, HP_ENV_MULT, MEDIAN_BASE_HP, medianFinalHp } from "../../balanceAnchors";

/**
 * config.damage-tiers@1 — 傷害**五級距**（GH#447）。
 *
 * owner 2026-08-19：「**可以重新設計拉高**，畢竟之前檢討過 **AP 太弱勢**」+
 * Q1「單體 Q 冷卻 6 秒⋯**20 次以內一定要能殺死對方**」+
 * Q4「**不用**（γ 超線性）已經有**傷害相應的冷卻**做限制」。
 *
 * ⭐ owner 2026-08-20 的兩則更正：錨點是 **LV30(hard) / LV50(soft) / LV99(極限)**（⛔ 不是 Lv18），
 * 而出貨錨**就是 hard limit**（「拿 30 級的當標準就好」）—— ⛔ 不再是「滿足得了的最高那一個」。
 * 同一天第三則：「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」⇒ 魔抗那一層**整層退場**。
 *
 * ⛔ **這裡刻意不抄任何一個級距數字。** 五格與達成率都在
 * `content/damageTiers.ts` 現算，量到的血量由 `pnpm anchors:build` 寫進
 * `balanceAnchorsDerived.ts` —— 抄一份到這個檔頭就是**第二個住處**，
 * 而它會在下一次重量時無聲過期（這一段在 2026-08-20 就這樣說過一次謊）。
 * 每一格的完整推導鏈印在下面那個 `.describe()` 裡，⭐ 那一份是**算出來的**。
 *
 * ⚠️ 上界 = **hard limit 那一級的「引擎最終」中位血量**：超過它的一發就是一發秒殺，
 * 那不是一個傷害級距。取最早會遇到它的那一級，⛔ 不是更高的錨點。
 */
export const zConfigDamageTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.damage-tiers@1"),
    note: z.string().optional(),
    /** 止血閥兼一鍵 rollback。false = `damageTier` 不解析（＝今天的那一套數字）。 */
    enabled: z
      .boolean()
      .describe("關掉之後 `damageTier` 不解析，技能回到自己手寫的 flat / perRank ——一鍵 rollback。"),
    /** 級別 → 卡面基礎傷害。五格都必填。 */
    damage: z
      .object(
        Object.fromEntries(
          DAMAGE_TIER_NAMES.map((n) => [
            n,
            z
              .number()
              .min(DAMAGE_TIER_MIN)
              .max(DAMAGE_TIER_MAX)
              .describe(
                `「${n}」的卡面基礎傷害。⭐ 五格由 \`pnpm anchors:build\` 推導，⛔ 不要手打 ——` +
                  `純基礎中位血量 ${MEDIAN_BASE_HP[HARD_ANCHOR_LEVEL]}（LV${HARD_ANCHOR_LEVEL}，⛔ 無倍率⛔ 無加成⛔ 無魔抗）` +
                  ` ÷ ${KILL_CASTS_REF} 發 × HP 倍率 ${HP_ENV_MULT} ＋ 初始加成 ${HP_BASE_BONUS} ÷ ${KILL_CASTS_REF} 發` +
                  `（加成⛔ 不參與倍率，owner #273）→ 進位到「使五格皆整數」的粒度 ⇒ 極小 ${anchorFloor(HARD_ANCHOR_LEVEL)}。` +
                  `其餘四格與單體冷卻表嚴格成正比 ⇒ ` +
                  `${DAMAGE_TIER_NAMES.map((k) => `${k} ${DEFAULT_DAMAGE_TIERS.damage[k]}`).join(" / ")}。` +
                  `出貨錨＝hard limit LV${SHIPPED_ANCHOR_LEVEL}（owner 2026-08-20「拿 30 級的當標準就好」）。` +
                  `達成率（分母＝引擎最終血量，門檻 ${KILL_CASTS_REF} 發）：` +
                  `${BALANCE_ANCHOR_LEVELS.map((lv) => {
                    const n2 = castsToKill(lv, DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[0]]);
                    return `LV${lv} ${n2.toFixed(1)} 發 ${n2 <= KILL_CASTS_REF ? "✅" : "❌"}`;
                  }).join(" · ")}。` +
                  `上界 ${DAMAGE_TIER_MAX} = LV${HARD_ANCHOR_LEVEL} 的**引擎最終**中位血量 ${medianFinalHp(HARD_ANCHOR_LEVEL)}：超過它的一發就是一發秒殺。`,
              ),
          ]),
        ) as Record<(typeof DAMAGE_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_DAMAGE_TIERS_DOC = {
  id: DAMAGE_TIERS_DOC_ID,
  schema: "config.damage-tiers@1",
  enabled: DEFAULT_DAMAGE_TIERS.enabled,
  damage: DEFAULT_DAMAGE_TIERS.damage,
} as const;
