/**
 * `heal` — flat restore scaled off the CASTER's stats.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { healTarget } from "../combat/restore";
import { casterStats } from "./effectCommon";

export const healEffect: EffectKindSpec<"heal"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // global combat-env healing factor (world.combatEnv, see combatEnv.ts)
    const amount = resolveScaling(stats, e.amount, ctx.rank) * world.combatEnv.healing;
    for (const target of ctx.targets) {
      // same clamp + same recordHealing(actual restored) as before; the
      // helper additionally emits `heal` so the client can draw 補血 (#92).
      healTarget(world, {
        source: ctx.caster,
        target,
        amount,
        origin: ctx.origin,
        score: true,
      });
    }
  },
};
