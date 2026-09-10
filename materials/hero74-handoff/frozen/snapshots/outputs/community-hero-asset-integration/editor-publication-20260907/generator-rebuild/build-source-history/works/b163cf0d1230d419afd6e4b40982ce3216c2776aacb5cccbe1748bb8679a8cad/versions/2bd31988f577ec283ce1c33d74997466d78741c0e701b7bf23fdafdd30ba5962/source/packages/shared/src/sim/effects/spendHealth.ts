import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { casterAttrs, casterSlotRank, casterStats } from "./effectCommon";
import { scalingOracle } from "../content/condition";
import { rankScalar } from "../perRank";

/**
 * Pay life at this point in the effect list (for example, channel release).
 * Like spendMana, a short pool pays only what is available. This is a cost,
 * not an attack: no damage queue, shield, immunity, lifesteal, damage hook,
 * kill credit, or last-hit timestamp participates. It cannot target an enemy.
 * Existing health state is already snapshotted and included in the digest.
 */
export const spendHealthEffect: EffectKindSpec<"spendHealth"> = {
  apply(e, ctx) {
    const { world, caster } = ctx;
    const hp = world.health.get(caster);
    if (!hp?.alive || !(hp.hp > 0)) return;
    const amount = resolveScaling(casterStats(ctx), e.amount, ctx.rank, casterAttrs(ctx),
      scalingOracle(world, caster, caster), casterSlotRank(ctx));
    const want = amount + hp.maxHp * (rankScalar(e.pctMaxHealth, ctx.rank) ?? 0)
      + hp.hp * (rankScalar(e.pctCurrentHealth, ctx.rank) ?? 0);
    const floor = Math.max(1, e.minimumHp ?? 1);
    if (!Number.isFinite(want) || !Number.isFinite(floor) || !(want > 0)) return;
    const before = hp.hp;
    const spent = Math.min(want, Math.max(0, before - floor));
    if (!(spent > 0)) return;
    hp.hp = before - spent;
    // Presentation carries the actual debit, never an ordinary damage event.
    world.emit("healthSpend", { source: caster, target: caster, amount: before - hp.hp,
      remaining: hp.hp, origin: ctx.origin });
  },
};
