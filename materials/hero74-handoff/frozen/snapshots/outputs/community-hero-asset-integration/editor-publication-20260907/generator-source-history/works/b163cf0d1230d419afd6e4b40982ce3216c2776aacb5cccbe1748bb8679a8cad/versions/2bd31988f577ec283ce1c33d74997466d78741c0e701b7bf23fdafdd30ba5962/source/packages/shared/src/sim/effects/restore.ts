/**
 * `restore` — WC3's SetUnit{Life,Mana}PercentBJ idiom: a fraction of the
 * TARGET's own maximum.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { healTarget, restoreMana } from "../combat/restore";
import { rankScalar } from "../perRank";

export const restoreEffect: EffectKindSpec<"restore"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // ⭐ G2 —— 逐階解一次（階數是這次施放的屬性，不是每個目標各自的）。
    const healthPct = rankScalar(e.healthPct, ctx.rank);
    const manaPct = rankScalar(e.manaPct, ctx.rank);
    // ⭐ G11 —— 「回自己」。省略 = target = 今天的行為。
    const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;
    // Fraction of the TARGET's own maximum (WC3 SetUnit{Life,Mana}PercentBJ).
    // Health restored is scored as healing, exactly like `heal`.
    for (const target of subjects) {
      const hp = world.health.get(target);
      if (!hp?.alive) continue;
      if (healthPct !== undefined) {
        healTarget(world, {
          source: ctx.caster,
          target,
          amount: hp.maxHp * healthPct * world.combatEnv.healing,
          origin: ctx.origin,
          score: true,
        });
      }
      if (manaPct !== undefined) {
        // NOTE: mana restore is deliberately NOT scaled by combatEnv.healing
        // (it never was) — that factor is the HEALING knob, not a mana knob.
        restoreMana(world, {
          source: ctx.caster,
          target,
          amount: hp.maxMana * manaPct,
          origin: ctx.origin,
        });
      }
    }
  },
};
