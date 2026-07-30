/**
 * `restore` — WC3's SetUnit{Life,Mana}PercentBJ idiom: a fraction of the
 * TARGET's own maximum.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { healTarget, restoreMana } from "../combat/restore";

export const restoreEffect: EffectKindSpec<"restore"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // Fraction of the TARGET's own maximum (WC3 SetUnit{Life,Mana}PercentBJ).
    // Health restored is scored as healing, exactly like `heal`.
    for (const target of ctx.targets) {
      const hp = world.health.get(target);
      if (!hp?.alive) continue;
      if (e.healthPct !== undefined) {
        healTarget(world, {
          source: ctx.caster,
          target,
          amount: hp.maxHp * e.healthPct * world.combatEnv.healing,
          origin: ctx.origin,
          score: true,
        });
      }
      if (e.manaPct !== undefined) {
        // NOTE: mana restore is deliberately NOT scaled by combatEnv.healing
        // (it never was) — that factor is the HEALING knob, not a mana knob.
        restoreMana(world, {
          source: ctx.caster,
          target,
          amount: hp.maxMana * e.manaPct,
          origin: ctx.origin,
        });
      }
    }
  },
};
