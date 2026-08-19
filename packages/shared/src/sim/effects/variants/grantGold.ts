/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * grantGold — 發放金幣. Pays the caster (or each target) gold, optionally
 * SCALED BY THE TARGET'S LEVEL — which is the only shape that can express
 * 鍊金術之盾's「黃金數量為敵方等級」. See effects/grantGold.ts for what
 * "level" resolves to on each body kind (and what it does NOT resolve to).
 */
export interface GrantGoldVariant {
  kind: "grantGold";
  /** 固定金額. Absent = 0 — a pure per-level payout is legal. */
  flat?: number;
  /**
   * 每一級發多少金 —— 「黃金數量為敵方等級」 is exactly `1`.
   * Multiplied by the RESOLVED TARGET's level, so it is meaningless (and
   * contributes 0) when the effect has no target.
   */
  perTargetLevel?: number;
  /** 誰收錢: the caster (default) or each resolved target. */
  to?: "self" | "target";
  /**
   * DECISION POINT — 小怪(殭屍)的「等級」從哪裡來。
   *
   * "wave" (default, absent) = the ROUND's `mobRules.level`, i.e. the same
   *   number the mob's own hp and regen curves are computed from.
   * "fallback" = a mob has no level, so it is worth `fallbackLevel`.
   *
   * ⚠️ It defaults to "wave" because the previous behaviour — a hardcoded
   * 0 — made 鍊金術之盾's 「黃金數量為敵方等級」 pay NOTHING for every
   * zombie in the game while the card said otherwise (failure shape ②).
   */
  mobLevelSource?: "wave" | "fallback";
  /**
   * 沒有等級可讀的身體值幾級。Absent = 0, i.e. a per-level payout on a
   * body with no level concept pays nothing — a number from nowhere is
   * worse than no payout at all. Also what a mob is worth outside a mob
   * round (`world.mobRules` is null there).
   */
  fallbackLevel?: number;
}
