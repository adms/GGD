/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

export interface ReviveVariant {
  kind: "revive";
  /**
   * Fraction of maxHp to come back on. ABSENT = the match's own
   * `reviveCircles.reviveHpPctMax` (shipped 0.5), falling back to
   * `REVIVE_EFFECT_FALLBACK_HP_PCT` when no circles are armed — 「復活回多少
   * 血」 is ONE operator concept with ONE home in 戰鬥系統, and an item that
   * answered it separately would be a second number nobody knows exists.
   * Bounded 0..1: the floor still yields a living body (`reviveChampionAt`
   * clamps to ≥1 HP), and the ceiling catches the mis-parse that matters —
   * 50 typed for 「50%」, which without it is a full-HP team resurrection.
   */
  hpPct?: number;
  /** Fraction of maxMana. Same default chain and same 0..1 bounds as `hpPct`. */
  manaPct?: number;
  /**
   * WHO may be stood up. `"ally"` (DEFAULT, conservative) = same team as the
   * caster only. `"any"` drops the check, for a hypothetical necromancy card
   * that raises whoever it names.
   *
   * The default is not decoration: `revive` on an `onKill` hook WITHOUT
   * `target: "allies"` resolves against the corpse you just made, so the
   * permissive reading is an item that resurrects its own victims — silent,
   * catastrophic, and exactly the kind of thing a default should refuse.
   */
  side?: "ally" | "any";
  /**
   * 一回合一次 —— whether this shares the 復活圈's per-team round budget
   * (`world.reviveCharges`, `config.arena-rules@1 revivesPerTeamPerRound`,
   * shipped 1).
   *
   *   · `"ignore"` (DEFAULT) — owner's card text puts no limit on 天生牙, so
   *     this is what ships. The item can fire as often as its hook allows.
   *   · `"requireAndSpend"` — refuses unless the caster's team still holds a
   *     charge, and spends ONE on success (one charge for the whole team's
   *     resurrection, not one per body). This is the once-per-round bound,
   *     and it reuses the only round-scoped counter that already exists —
   *     `endCombatRevives` resets it, so it needs no new SimWorld field and
   *     cannot leak across rounds.
   *
   * ⚠️ Under `"requireAndSpend"` the item and the 復活圈 EAT THE SAME BUDGET:
   * a resurrection from 天生牙 means no circle rescue later that round.
   */
  teamCharge?: "ignore" | "requireAndSpend";
}
