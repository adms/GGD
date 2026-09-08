import { z } from "zod";
import { zId } from "../common";
// 傷害五級距（GH#447）—— 唯一的**回報**軸。五個數字從冷卻表推導，
// 推導式與 owner 的兩條輸入寫在 content/damageTiers.ts。
import { DAMAGE_TIER_EXEMPTIONS_DOC_ID, DEFAULT_DAMAGE_TIER_EXEMPTIONS } from "../../damageTiers";

/**
 * config.damage-tier-exemptions@1 — ⛔ **同一格不可以同時有級別與算好的值**的豁免表（#534）。
 *
 * CLAUDE.md 第〇·四守則：`{"damageTier":"極大","flat":2000}` 的 `flat` 是**第二個住處**，
 * 而它必然過期（一行公式改動 ≈ 一小時的重新產生鏈）。閘是
 * `content/tierFlatExclusive.test.ts`；這一份收的是**例外**。
 *
 * owner #534（逐字）：「①②③ **作為例外在後台跳出警告就好**，④ **你拉上來**」
 *   ① 本來就不是傷害（`shield` / `heal` / `spendMana`）
 *   ② 判定用的 1 點（`damageArea` / `damageLine` 值 ≤5）
 *   ③ 持續傷害每跳（`dot`）
 *   ⑤ ⭐ **per-hit rider** —— 法球／每一次普攻追加／每一次命中的 proc
 *      （`perTrigger`：節點掛在 `hooks` / `passive` 底下）。
 *      判準是「這個數字**一次施法會發生幾次**？」大於 1 次的就不屬於單發五級距。
 *
 * ⭐ **收的是謂詞，⛔ 不是一張逐節點的名單。** 一張 N 列的名單正是第〇·四守則要
 * 消滅的東西：它是 O(N) 的第二個住處，每一次內容編輯讓它過期一列，而且沒有東西會紅。
 * ⇒ K 條規則 + 一個能被反駁的理由（第零守則⑨）。
 *
 * ⚠️ **反向也是閘**：豁免表裡的規則必須**真的還匹配到節點** —— 修好了就要刪掉，
 * 棘輪只准降。那一條同樣住在 `tierFlatExclusive.test.ts`。
 */
export const zConfigDamageTierExemptionsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.damage-tier-exemptions@1"),
    note: z.string().optional(),
    rules: z
      .array(
        z
          .object({
            id: zId.describe("穩定代號 —— 失敗訊息與後台警告都印它。"),
            reason: z
              .string()
              .min(8)
              .describe(
                "⭐ **為什麼這一格不該有級別** —— 一個能被反駁的理由，⛔ 不是「還沒收」。" +
                  "三個月後那個人要靠這句話判斷「這條可以刪了嗎」。",
              ),
            kinds: z
              .array(z.string().min(1))
              .min(1)
              .optional()
              .describe("effect kind 白名單，例：shield / heal / spendMana / dot。"),
            maxFlat: z
              .number()
              .min(0)
              .optional()
              .describe("`|flat| ≤ 這個值`才豁免 —— 判定用的 1 點那一族。"),
            zeroOnly: z
              .boolean()
              .optional()
              .describe("只豁免 `flat === 0`（純成長，沒有基礎值可以交給級距）。"),
            perTrigger: z
              .boolean()
              .optional()
              .describe(
                "節點掛在 `hooks` / `passive` 底下嗎 —— true ＝ **一次施法會發生很多次**" +
                  "（法球／每次普攻追加／每次命中的 proc）。單發五級距套上去就是每刀 ×N。",
              ),
            docs: z
              .array(zId)
              .min(1)
              .optional()
              .describe("一次性的逐文件豁免（`doc.id`）—— ⚠️ 能用類別就別用這格。"),
            warn: z
              .boolean()
              .describe(
                "後台要不要為它跳警告。owner #534：「作為例外在**後台跳出警告**就好」——" +
                  "⇒ 預設就是 true，關掉它要有理由。",
              ),
          })
          .strict()
          .superRefine((r, ctx) => {
            // ⛔ 一個謂詞都沒填的規則會豁免**全世界** —— 那不是例外，那是把閘關掉。
            const hasPredicate =
              r.kinds !== undefined ||
              r.maxFlat !== undefined ||
              r.zeroOnly !== undefined ||
              r.perTrigger !== undefined ||
              r.docs !== undefined;
            if (!hasPredicate) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `豁免規則「${r.id}」一個謂詞都沒填 —— 它會豁免每一個節點，等於把閘關掉。`,
              });
            }
          }),
      )
      .describe("⭐ K 條規則，⛔ 不是 N 列名單。空陣列 ＝ 什麼都不豁免（閘最嚴的那一邊）。"),
  })
  .strict();

export const DEFAULT_DAMAGE_TIER_EXEMPTIONS_DOC = {
  id: DAMAGE_TIER_EXEMPTIONS_DOC_ID,
  schema: "config.damage-tier-exemptions@1",
  rules: DEFAULT_DAMAGE_TIER_EXEMPTIONS.rules,
} as const;
