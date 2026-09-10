/**
 * `config.mitigation@1` 的 Zod + **穿透授予**的 Zod。
 *
 * ⚠️ 兩份東西住在同一個檔，因為它們是同一個機制的兩半：
 *   · `zConfigMitigationDoc`  —— **曲線**上唯一的決策點（負抗性放大到幾倍）
 *   · `zPenetrationGrant`     —— **誰穿多少**（騎在 `ModifierSource` 上的授予）
 * 兩者的完整推導、地板規則與純度證明都在 `sim/combat/penetration.ts` 檔頭，
 * ⛔ 這裡不抄第二份（第三守則：抄一份就是多一份會過期的說法）。
 *
 * ⚠️ 上下界從 `sim/combat/penetration.ts` **import**，不是抄字面值 ——
 * 抄一次就是第四個住處，而它沒有守衛（第零守則）。
 */
import { z } from "zod";
import {
  NEGATIVE_RESIST_CEILING_MAX,
  NEGATIVE_RESIST_CEILING_MIN,
} from "../../sim/combat/penetration";

/**
 * 一件道具 / 一階天生技 / 一張三選一 / 一發 `applyBuff` 授予的**穿透**。
 *
 * 上下界的理由（兩端都有界，#277）：
 *   · pct `[0, 1]` —— 比例，1 = 100%。
 *   · flat `[0, 200]` —— **誤讀保險絲**：出貨 L18 最高護甲 122.6，200 讀作
 *     「這是 mis-parse」而不是平衡意見（與 `ITEM_MODIFIER_LIMITS[Armor]` 同口徑）。
 *   · ⛔ **下界一律 0** —— 負穿透就是減抗，那是段①（`applyBuff` 的負值 modifier），
 *     不可以有兩種寫法。
 *
 * `.refine`：一個四格全空的 `penetration` 看起來 author 過卻一毛不付 —— 逐字照抄
 * `zAttrGrant` 的形狀與理由。
 */
export const zPenetrationGrant = z
  .object({
    scope: z
      .enum(["basic", "ability", "all"])
      .describe(
        "穿哪些傷害:basic = 普通攻擊(近戰與遠程投射物都算)、" +
          "ability = 技能,含技能留下的延燒/中毒每一跳、" +
          "all = 這個來源的持有者打出去的每一發(額外含道具觸發、小怪與守衛塔封包)。",
      ),
    armorPct: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "百分比護甲穿透,0~1(1 = 100%,完全無視護甲)。多件**相乘**疊加" +
          "(50% + 50% = 75%,不是 100%)。⚠️ 目標護甲已經 ≤ 0 時**完全無效** —— " +
          "穿透只能把抗性往 0 撈回來,不能穿破 0。",
      ),
    armorFlat: z
      .number()
      .min(0)
      .max(200)
      .optional()
      .describe(
        "扁平護甲穿透(致命性),多件**相加**。⚠️ 夾在 0,不會把護甲推成負的;" +
          "目標護甲已經 ≤ 0 時同樣完全無效。",
      ),
    mrPct: z.number().min(0).max(1).optional().describe("百分比魔法穿透,規則同 armorPct。"),
    mrFlat: z.number().min(0).max(200).optional().describe("扁平魔法穿透,規則同 armorFlat。"),
  })
  .strict()
  .refine(
    (p) =>
      p.armorPct !== undefined ||
      p.armorFlat !== undefined ||
      p.mrPct !== undefined ||
      p.mrFlat !== undefined,
    { message: "penetration 至少要填一格,否則這個授予看起來 author 過卻一毛不付" },
  );

export type PenetrationGrantDoc = z.infer<typeof zPenetrationGrant>;

/**
 * `config.mitigation@1` —— 減傷曲線。今天只有一格：**負抗性放大到幾倍**。
 *
 * owner 2026-08-12「LoL 的完整做法（四段 + 雙分支）都比照實作」。
 * ⭐ **1.0 就是關掉負分支** ＝ 這個功能出現之前的行為 ＝ owner 的一鍵 rollback，
 * 所以⛔ 不另外開一個 boolean（兩格管同一件事只會分歧）。
 */
export const zConfigMitigationDoc = z
  .object({
    id: z.literal("mitigation"),
    schema: z.literal("config.mitigation@1"),
    note: z.string().optional(),
    negativeResistAmplifyCeiling: z
      .number()
      .min(NEGATIVE_RESIST_CEILING_MIN)
      .max(NEGATIVE_RESIST_CEILING_MAX)
      .describe(
        "護甲/魔抗被【破防】打成**負數**之後,受到的傷害最多放大到幾倍。" +
          "2.0 = LoL(出貨值);1.0 = 關掉整個負分支,負抗性一律當成 0 —— " +
          "也就是這個功能出現之前的行為,調到 1.0 就是一鍵 rollback。" +
          "⚠️ 它是**漸近極限**不是夾限:護甲 −100 時是 1.5 倍,−1000 時是 1.82 倍,永遠到不了 2。",
      ),
  })
  .strict();

export type ConfigMitigationDoc = z.infer<typeof zConfigMitigationDoc>;
