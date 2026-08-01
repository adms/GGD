/**
 * `shield` — a temporary absorb pool on every resolved target.
 *
 * Moved out of the effectRunner switch by GH#289; the absorb body is unchanged.
 * GH#289 lane P6 then implemented the `absorbs` damage-type FILTER that the seam
 * had opened as a schema field — see `combat/damage.ts` for where in the
 * pipeline a pool eats (POST-mitigation, unchanged) and in what order two pools
 * on one target are spent (narrow before broad).
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { addShield } from "../combat/damage";
import { casterAttrs, casterStats } from "./effectCommon";

export const shieldEffect: EffectKindSpec<"shield"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // global combat-env shield-strength factor
    const amount =
      resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx)) * world.combatEnv.shield;
    for (const target of ctx.targets) {
      // 護盾類型過濾 (owner 2026-07-30:「護盾的確有分吸收所有傷害跟吸收 AP 傷害
      // only」). The author's choice rides straight through to the pool; absent
      // (and the explicit `"all"`) both mean 「吸收所有傷害」, which is exactly
      // the pre-filter behaviour — see addShield, which normalises the two.
      addShield(world, target, amount, e.duration, ctx.origin, e.absorbs);
    }
  },
};
