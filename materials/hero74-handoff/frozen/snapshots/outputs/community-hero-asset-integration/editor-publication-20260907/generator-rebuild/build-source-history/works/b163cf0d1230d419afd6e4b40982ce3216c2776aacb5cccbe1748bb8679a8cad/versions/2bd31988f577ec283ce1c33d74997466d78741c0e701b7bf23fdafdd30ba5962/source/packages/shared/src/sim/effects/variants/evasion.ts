/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * evasion — 閃避 (lane P5). Timed miss-chance. Rides the EXISTING
 * `Stat.Evasion` on `world.stats`, so it adds no SimWorld field — but see
 * effects/evasion.ts for the reason that is not the same as "it works".
 */
export interface EvasionVariant {
  kind: "evasion";
  /**
   * 0..1 dodge chance granted, BEFORE the ceiling. Both the basic-attack
   * and the ability channel clamp to `effectiveCap(statCaps, Stat.Evasion)`
   * (ships 0.8, 後台可調), so `1` is not a route to invulnerability.
   */
  chance: number;
  durationSec: number;
  /** the caster (default) or each resolved target */
  applyTo?: "self" | "target";
  /**
   * DECISION POINT — may this dodge apply to ABILITY damage, or only to
   * basic attacks? Default (absent) = basic attacks only, which is WC3
   * `Evasion` fidelity and today's shipping behaviour.
   */
  dodgesAbilities?: boolean;
  /**
   * DECISION POINT — may this dodge apply to `type: "true"` damage?
   * Default (absent) = no. Only meaningful with `dodgesAbilities`; kept off
   * by default so the arena fire-ring burn (#270) stays undodgeable.
   */
  dodgesTrueDamage?: boolean;
}
