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
/**
 * ⭐ **GH#658 —— 後台傷害排行榜「一擊秒人」的標記門檻**（比例，⛔ 不是百分數）。
 *
 * owner 2026-08-24 逐字：
 * > 「後台單次傷害排行榜（**另外標記該傷害是否一擊超過英雄目標 80% 生命傷害**）」
 *
 * ⇒ 出貨值就是他說的那個數（八成）。⛔ 它**不影響任何一場比賽** —— 傷害、
 * 結算、獎勵一格都不動；它只決定後台那一頁哪幾列會被標紅、以及「只看超標的」
 * 那個過濾器的界線。做成欄位是因為 owner 之後想看「半條血以上」時應該是
 * 改一格下拉選單，⛔ 不是改程式重部署（第一守則）。
 */
export const DEFAULT_ONE_SHOT_PCT_OF_MAX_HP = 0.8;

export const zConfigDamageRulesDoc = z
  .object({
    id: z.literal("damage-rules"),
    schema: z.literal("config.damage-rules@1"),
    note: z.string().optional(),
    /**
     * GH#658 的門檻。省略 = {@link DEFAULT_ONE_SHOT_PCT_OF_MAX_HP}。
     * ⚠️ 必須 `.optional()`：線上已經有 `config.damage-rules@1` 的耐久覆蓋層，
     * 多一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 骨架英雄
     * （2026-08-02 事故的形狀）。
     */
    oneShotPctOfMaxHp: z
      .number()
      .min(0.05)
      .max(2)
      .optional()
      .describe(
        "後台傷害排行榜把一列標成「一擊秒人」的門檻 —— 比例，不是百分數（八成寫成零點八）。" +
          "owner GH#658：「後台單次傷害排行榜（另外標記該傷害是否一擊超過英雄目標 80% 生命傷害）」。" +
          "分子是那一次施放打在**單一英雄**身上的最大一擊，分母是那個人**命中當下**的最大生命。" +
          "⛔ 它不影響任何一場比賽，只影響後台那一頁的標記與過濾。" +
          "⚠️ 上界大於一是刻意的：溢傷（打出去比整條血還多）是一個真的、看得到的量。",
      ),
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
  oneShotPctOfMaxHp: DEFAULT_ONE_SHOT_PCT_OF_MAX_HP,
};
