import { z } from "zod";

/**
 * `config.wounds@1` —— 【重創】的全域規則（A6，#278）。
 *
 * 今天只有一格，而它是一個真的決策點：引擎自己對「同型效果怎麼疊」**沒有一致
 * 答案**（`missChance` 取 max、護盾相加），所以寫死等於替 owner 挑一個而不告訴他。
 * ⚠️ 三格倍率**不在**這裡 —— 它們住在施加重創的那張卡上（`applyStatus`），
 * 因為「這一支技能的重創有多重」本來就該逐支不同。
 */
/**
 * `config.damage-rules@1` —— 傷害規則。今天只有一格：**沒寫型別時用哪一種**。
 *
 * owner 2026-08-05：「請把技能傷害預設都改成 AP 傷害」。
 * ⚠️ 在此之前 `damageType` 是**必填**，所以這是新增一個預設而不是改掉一個。
 * 完整理由（含「為什麼它必須是一格看得到的欄位」）見 `sim/damageRules.ts` 檔頭。
 */
export const zConfigDamageRulesDoc = z
  .object({
    id: z.literal("damage-rules"),
    schema: z.literal("config.damage-rules@1"),
    note: z.string().optional(),
    defaultAbilityDamageType: z
      .enum(["physical", "magic", "true"])
      .describe(
        "一份傷害效果沒有寫 damageType 時用哪一種。magic = 吃魔抗（出貨值）；" +
          "physical = 吃護甲；true = 什麼減免都不吃。" +
          "⚠️ 只影響**沒寫**的那些 —— 已經明寫型別的技能一支都不會被改到。",
      ),
  })
  .strict();
export type ConfigDamageRulesDoc = z.infer<typeof zConfigDamageRulesDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件。 */
export const SHIPPED_DAMAGE_RULES: ConfigDamageRulesDoc = {
  id: "damage-rules",
  schema: "config.damage-rules@1",
  defaultAbilityDamageType: "magic",
};
