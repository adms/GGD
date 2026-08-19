/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { StatModifier } from "../../stats/modifiers";

/**
 * cycleBuff (揍敵客阿福 13-00 念。攻防轉換) — 輪替增益: apply the NEXT step of a
 * fixed rotation, where 「next」 is derived from the world's own absolute
 * expiry ticks instead of from a counter.
 *
 * ── WHY THIS IS NOT `applyBuff` WITH A COUNTER ───────────────────────────
 * The ability owner asked for is 「每次攻擊會帶來 AP/AD/防禦/魔抗 +10% **輪流**
 * 四個 buff，**可同時存在**，持續 1 秒」. Four independent 1-second buffs that
 * arrive one per swing in a fixed order. Written with `applyBuff` it needs a
 * per-entity 「which one is next」 integer — mutable, un-derivable state that a
 * replay has to carry and that nothing else in `sim/**` keeps.
 *
 * ── HOW THE INDEX IS DERIVED (ABSOLUTE TICKS, NO COUNTER) ────────────────
 * Each step owns a source id `buff:cycle:<cycleKey>:<i>`, so the world ALREADY
 * remembers, for every step, the absolute tick it expires on. The next step is
 * therefore a pure read:
 *
 *     1. the FIRST step (authored order) with no live source  → that one
 *     2. all four live                                        → the one whose
 *                                                               `expiresAtTick`
 *                                                               is SMALLEST
 *                                                               (ties: authored
 *                                                                order)
 *
 * Swing 1 finds AP absent → AP. Swing 2 finds AD absent → AD. … Swing 5 finds
 * all four live and AP closest to expiry → AP. That is a perfect round-robin,
 * and 「可同時存在」 falls out for free because each step is its own source with
 * its own deadline. No counter, no `world` field, no wire field; two replicas
 * that agree on the tick agree on the pick.
 *
 * ── WHAT IS A FIELD AND WHY ──────────────────────────────────────────────
 * `steps` is the whole rotation — count, order, per-step modifiers AND per-step
 * duration are all authored, so 「輪流四個」 is content, not a constant. An
 * operator can make it three steps, or give the armour step a longer window,
 * without a code change (CLAUDE.md 第一守則).
 */
export interface CycleBuffVariant {
  kind: "cycleBuff";
  /**
   * Namespace for this rotation's source ids. TWO DIFFERENT cycles on one
   * body (阿福's own 10 % ring and the EX's +40 % ring) must not share a
   * key or they would take turns with each other.
   */
  cycleKey: string;
  /** the caster (default) or each resolved target */
  applyTo?: "self" | "target";
  /** the rotation, in order. One entry = a degenerate 1-step refresh. */
  steps: { modifiers: StatModifier[]; duration: number }[];
}
