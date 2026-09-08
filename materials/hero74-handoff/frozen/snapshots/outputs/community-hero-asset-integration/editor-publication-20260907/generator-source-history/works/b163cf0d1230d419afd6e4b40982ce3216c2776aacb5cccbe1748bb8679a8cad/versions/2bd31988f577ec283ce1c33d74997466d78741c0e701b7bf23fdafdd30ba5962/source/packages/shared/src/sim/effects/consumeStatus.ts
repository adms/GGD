import type { EffectKindSpec } from "./effectKind";
import { consumeStatusStacks } from "../statusConsumption";
import { shapeTargets } from "./shapeTargets";

export const consumeStatusEffect: EffectKindSpec<"consumeStatus"> = {
  apply(e, ctx, _bakeList, runList) {
    const shaped = shapeTargets(e, ctx);
    const targets = shaped.filter((id, index) => shaped.indexOf(id) === index);
    const applier = e.appliedBy === "self" ? ctx.caster : undefined;
    const subjects = e.subject === "self" ? [ctx.caster] : targets;
    for (const target of subjects) {
      const consumed = consumeStatusStacks(ctx.world, target, e.statusId, e.count, applier);
      // Choose exactly once, after the entire debit. Removing the curse cannot
      // make the onMissing branch run after onConsumed in the same resolution.
      const payload = consumed > 0 ? e.onConsumed : e.onMissing;
      if (payload) runList(payload, { ...ctx, targets: e.subject === "self" ? targets : [target] });
    }
  },
  bake(e, ctx, bakeList) {
    return { ...e, onConsumed: bakeList(e.onConsumed, ctx),
      ...(e.onMissing ? { onMissing: bakeList(e.onMissing, ctx) } : {}) };
  },
};
