/**
 * ⭐⭐ **升級成長率的解析**（GH#938）—— 從**冷卻級距**推導。
 *
 * owner 2026-09-02（逐字）：
 * > 「`rankGrowth` 全域預設 0.5 其實**跟 CD／觸發頻率有關係**，
 * >  陽離子砲會是 `rankGrowth: 1.0` 是因為 **CD 較長**」
 *
 * ⛔⛔ **它要解決的是一個量到的謊**：`content/abilities` 全掃 ——
 * **29 個 `damageTierPerRank` 節點，27 個（93%）至少有一級升了零提升**。
 * 根因是傷害梯子只有五格而技能有 3–4 級 ⇒ 一條「每級 +100」的卡面
 * 被**量化**到那五格（120→200、220→200、320→500、420→500）
 * ⇒ ⭐ 卡面說「每級 +100」而遊戲裡是「**+0 / +300 / +0**」。
 *
 * ⭐ 解析在**載入時**（第〇·四守則）：技能只寫 `damageTier` ＋ 它的
 * `cooldownTier`，成長率由這一支查表 —— ⛔ 而不是把 3–4 個算好的值
 * 烘進每一份文件（那是 N × 每次公式改動的成本）。
 *
 * ⚠️ ⭐ **它與 `damageTierPerRank` 今天並存**：這一支是**新的表達方式**，
 * ⛔ 而既有那 29 個節點還沒遷移 —— 遷移是內容側的事，
 * 而棘輪（`rankGrowthHonesty.test.ts`）讓「有幾個節點還在說謊」變成一個會紅的數字。
 */
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** ⛔ 缺文件時的出貨值 —— 與 `content/config/rank-growth.json` 逐格相同。 */
export const DEFAULT_RANK_GROWTH: Readonly<Record<SkillTierName, number>> = Object.freeze({
  極小: 0.5,
  小: 0.5,
  中: 0.5,
  大: 0.75,
  極大: 1.0,
});

/** ⚠️ 技能沒有 `cooldownTier` 時 —— ⭐ 0.5 是量到的中位數。 */
export const RANK_GROWTH_WHEN_TIER_ABSENT = 0.5;

/**
 * ⭐ 這一支是**純函式**（同 `resolveCastTimeTier` 那一族）——
 * ⛔ 它不去查 registry：那會讓 `packages/shared/src/content` 依賴 sim 的載入順序，
 * 而同一個環在這個 repo 已經炸過三次（`zRef` / `zCastableSlot` / `PULSE_MS`）。
 * ⇒ ⭐ 表由呼叫端傳，預設是出貨值。
 */
export interface RankGrowthRules {
  enabled: boolean;
  byCooldownTier: Readonly<Record<SkillTierName, number>>;
  whenTierAbsent: number;
}

export const DEFAULT_RANK_GROWTH_RULES: RankGrowthRules = Object.freeze({
  enabled: true,
  byCooldownTier: DEFAULT_RANK_GROWTH,
  whenTierAbsent: RANK_GROWTH_WHEN_TIER_ABSENT,
});

/**
 * ⭐ 這一支技能每升一級成長幾成。
 *
 * ⚠️ ⭐ 回 `null` 代表「這一格沒有意見」（總開關關掉）——
 * ⛔ 不是 0：0 的意思是「升級完全不變強」，而那是**另一件事**
 * （同 `resolveCastTimeTier` 那一族的規矩）。
 */
export function resolveRankGrowth(
  cooldownTier: unknown,
  rules: RankGrowthRules = DEFAULT_RANK_GROWTH_RULES,
): number | null {
  if (!rules.enabled) return null;
  if (typeof cooldownTier === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(cooldownTier)) {
    const v = rules.byCooldownTier[cooldownTier as SkillTierName];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return rules.whenTierAbsent;
}

/**
 * ⭐ 把一個首級值展開成逐級的梯子。
 *
 * ⚠️ ⭐ **線性**（`base × (1 + growth × i)`），⛔ 不是幾何 ——
 * 那是量到的形狀：owner 點名的 80-02 弒鬼神卡面逐字是
 * 「120/220/320/420（**每級 +100**）」，⭐ 而 +100 對 120 是等差、⛔ 不是等比。
 */
export function expandRankLadder(base: number, growth: number, ranks: number): number[] {
  const n = Math.max(1, Math.floor(ranks));
  return Array.from({ length: n }, (_, i) => base * (1 + growth * i));
}
