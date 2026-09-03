/**
 * `heal` — flat restore scaled off the CASTER's stats.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { healTarget } from "../combat/restore";
import { casterAttrs, casterStats } from "./effectCommon";
import { scalingOracle } from "../content/condition";

export const healEffect: EffectKindSpec<"heal"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // global combat-env healing factor (world.combatEnv, see combatEnv.ts)
    const amount =
      resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx), scalingOracle(world, ctx.caster, ctx.targets[0])) *
      world.combatEnv.healing;
    // ⭐ G11（GH#299）—— 「治療自己」。省略 = target = 今天的行為。
    const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;
    for (const target of subjects) {
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
