/**
 * 「這一格逐階可以不一樣」—— 一份讀取器 + 一份 Zod 形狀，**不是每個欄位各一份**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 這支存在的理由是量出來的：同一行算式已經被抄了五份
 *
 * `rank-1 起算、超出欄位長度就夾在最後一格` 這句話在 2026-08-09 之前散落在：
 *
 *   · `sim/effects/dynamicTerms.ts::rankColumn`（**私有**，只有 resourcePct 用）
 *   · `sim/effects/damage.ts` 兩處（`incomingPct` 一次、`hpPct` 一次，各自手寫）
 *   · `sim/effects/applyBuff.ts`
 *   · `sim/effects/devour.ts`
 *   · `sim/effects/randomArea.ts`
 *
 * 五份同一句話 = CLAUDE.md 第零守則⑨ 講的「到處改改改」，而且它已經開始長出
 * 差異：有的寫 `?? 0`、有的沒有。這支把它收成一份，並把 `dynamicTerms` 那個
 * 私有版本改成 re-export，讓「夾在最後一格」這個規矩結構上只有一個住處。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ `RankScalar` —— 為什麼是聯集 `number | number[]`，不是 `{perRank}` 物件
 *
 * GH#299 第 2 條（owner：「授權格沒開」）點名的五個欄位 —— `applyStatus` 的
 * `duration` / `moveSpeedMult` / `missChance`、`restore.healthPct`、
 * `championForm.durationSec` —— **今天都是純量**，而且已經有幾百份文件填著它們。
 *
 * 包成 `{perRank: [...]}` 物件（`damage.hpPct` 的形狀）會讓每一份既有文件都要
 * 改寫；聯集不會：`duration: 3` 逐字仍然合法，意思是「每一階都是 3」。
 * 陣列則是「一階一格」。⛔ 兩種寫法**不可以同時**存在第二個欄位名
 *（`durationPerRank`）—— 那就是同一個量的第二個住處，而它會在有人只改一邊的
 * 那一天靜默地贏。
 *
 * ⚠️ 上界 {@link RANK_SCALAR_MAX_COLUMNS} 對齊 `ability@1.maxRank` 的 6：
 * 一個 7 格的陣列不是設計，是作者以為它是別的東西。
 */

/** 一格逐階欄位最多幾階 —— 對齊 `content/schema/ability.ts` 的 `maxRank.max(6)`。 */
export const RANK_SCALAR_MAX_COLUMNS = 6;

/**
 * 一個「逐階可以不一樣」的純量。
 *
 *   · `number`   —— 每一階都是這個值（今天所有內容的寫法，語意逐字不變）
 *   · `number[]` —— 一階一格，rank-1 起算，超出長度夾在最後一格
 */
export type RankScalar = number | readonly number[];

/**
 * rank-1 起算、超出就夾在最後一格。
 *
 * ⚠️ `rank` 先被夾進 `[1, perRank.length]` 而不是直接索引：授權欄位比
 * `maxRank` 短是常態（作者只寫了前兩階），而那時候的正確答案是「維持最後一階」，
 * 不是「整招消失」。`randomArea.ts` 的註解逐字講過同一件事。
 */
export function rankColumn(perRank: readonly number[], rank: number): number {
  return perRank[Math.min(Math.max(1, rank), perRank.length) - 1] ?? 0;
}

/**
 * 讀一格 {@link RankScalar}。`undefined` 進、`undefined` 出 —— 這一格的缺席
 * 是有意義的（`moveSpeedMult` 沒填 = 不動移速），所以**不可以**退化成 0。
 */
export function rankScalar(v: RankScalar | undefined, rank: number): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  if (v.length === 0) return undefined;
  return rankColumn(v, rank);
}

/**
 * 這一格**任何一階**能達到的最大值 —— 給**不知道階數**的靜態分析用
 * （`content/castTimeFormula.ts` 推導施法前搖、後台面板估上限）。
 *
 * ⚠️ 取 max 而不是 rank 1：那些消費端問的是「這一支技能最強會是多少」，
 * 而 rank 1 是**最弱**的一階 —— 拿它當答案會讓一支 rank 4 的長暈眩被算成短的，
 * 前搖跟著算短（失敗形態④：壞掉的與正確的長得一樣）。
 */
export function rankScalarMax(v: RankScalar | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  if (v.length === 0) return undefined;
  return v.reduce((a, b) => (b > a ? b : a), v[0]!);
}

/** 逐格乘一個係數，形狀不變（純量進純量出、陣列進陣列出）。 */
export function scaleRankScalar<T extends RankScalar | undefined>(v: T, k: number): T {
  if (v === undefined) return v;
  if (typeof v === "number") return (v * k) as T;
  return v.map((x) => x * k) as unknown as T;
}
