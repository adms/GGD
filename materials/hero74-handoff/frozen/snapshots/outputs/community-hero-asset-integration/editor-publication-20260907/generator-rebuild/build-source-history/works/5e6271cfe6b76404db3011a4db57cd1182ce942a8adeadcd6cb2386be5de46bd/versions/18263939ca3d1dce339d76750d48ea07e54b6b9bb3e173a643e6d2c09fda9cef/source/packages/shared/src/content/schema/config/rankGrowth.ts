/**
 * ⭐⭐ `config.rank-growth@1` —— **升級成長率**（GH#938）。
 *
 * owner 2026-09-02（逐字）：
 * > 「`rankGrowth` 全域預設 0.5 其實**跟 CD／觸發頻率有關係**，
 * >  陽離子砲會是 `rankGrowth: 1.0` 是因為 **CD 較長**」
 *
 * ⭐ 而資料**證實了那條直覺** —— 它今天就已經隱含在內容裡：
 * 把 27 個 `damageTierPerRank` 節點的實質成長率
 * `(末級/首級 − 1) ÷ (級數−1)` 按冷卻級距分箱，
 * 中位數全部被五格梯子壓成 **0.50**，
 * ⛔ 而**上界隨冷卻級距單調上升**：0.50 → 0.50 → 0.50 → **0.75** → **1.00**。
 * ⇒ ⭐ 這五格只是把那條**本來就在**的規則寫出來。
 *
 * ⛔⛔ **為什麼這一格必須存在**（量到的，⛔ 不是估計）：
 * `content/abilities` 全掃 —— **29 個 `damageTierPerRank` 節點，27 個（93%）
 * 至少有一級升了零提升**。根因是梯子只有五格（200/500/1000/1500/2000）
 * 而技能有 3–4 級 ⇒ 一條「每級 +100」的卡面被**量化**到那五格
 * （120→200、220→200、320→500、420→500）
 * ⇒ ⭐ 卡面說「每級 +100」而遊戲裡是「+0 / +300 / +0」——第一·五守則。
 *
 * ⚠️ ⭐ **這一格不是產物**：它的值是 owner 的規則，⛔ 不是從別處算出來的。
 */
import { z } from "zod";
import { zId } from "../common";
import { SKILL_TIER_NAMES } from "../../skillTiers";

/** ⭐ 五格照 `SKILL_TIER_NAMES` 產生 —— ⛔ 不在這裡再抄一次級距名。 */
const zTierMap = z.object(
  Object.fromEntries(
    SKILL_TIER_NAMES.map((n) => [n, z.number().min(0).max(3)]),
  ) as Record<(typeof SKILL_TIER_NAMES)[number], z.ZodNumber>,
);

export const zConfigRankGrowthDoc = z
  .object({
    id: zId,
    schema: z.literal("config.rank-growth@1"),
    note: z.string().optional(),
    /**
     * ⭐ 總開關。關掉 ⇒ 升級成長回到技能自己寫的 `damageTierPerRank`
     * （＝這個欄位出現之前的行為，也就是一鍵 rollback）。
     */
    enabled: z.boolean(),
    /**
     * ⭐ **每一格冷卻級距對應的成長率** —— 一支「極大冷卻」的技能每升一級
     * 成長 100%，而「極小冷卻」的只成長 50%。
     * ⚠️ 上界 3：再高會讓一支四級技能的末級是首級的 10 倍。
     */
    byCooldownTier: zTierMap,
    /**
     * ⚠️ 技能沒有 `cooldownTier` 時用這一格。
     * ⭐ 0.5 是量到的中位數（⛔ 不是一個保守的猜測）。
     */
    whenTierAbsent: z.number().min(0).max(3),
  })
  .strict();
export type ConfigRankGrowthDoc = z.infer<typeof zConfigRankGrowthDoc>;

/**
 * ⭐ 出貨值 —— ⛔ 不抄字面量：它與 `content/config/rank-growth.json` 的
 * 每一格必須逐位元相同，而 drift 測試在守。
 */
export const SHIPPED_RANK_GROWTH: ConfigRankGrowthDoc = {
  id: "rank-growth",
  schema: "config.rank-growth@1",
  enabled: true,
  byCooldownTier: { 極小: 0.5, 小: 0.5, 中: 0.5, 大: 0.75, 極大: 1.0 },
  whenTierAbsent: 0.5,
};
