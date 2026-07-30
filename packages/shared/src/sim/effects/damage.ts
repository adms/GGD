/**
 * `damage` — queue a damage packet against every resolved target.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { Stat } from "../stats/statTypes";
import { resolveScaling } from "./effect";
import { bankedAddend, casterStats, comboAddend } from "./effectCommon";

export const damageEffect: EffectKindSpec<"damage"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // COMBO WINDOW: resolved ONCE, before the target loop — the JASS reads
    // `udg_MoonCombo` once (j:34189) and bakes the result into
    // `udg_MoonDamage`, so every unit in the blast takes the same boosted
    // number. Reading it per target would be a different spell.
    //
    // Reaching here with a `comboBonus` still attached means this damage is
    // IMMEDIATE (an instant cast, or the resolve tick of a cast time) — for
    // those, apply time IS cast time and this is the correct reading. Every
    // DEFERRED payload had the term resolved and stripped at launch by
    // `bakeCastTimeConditionals`, so it can never be re-asked late.
    const comboAdd = comboAddend(e, ctx);
    // 存款加成 (owner 2026-07-31「現存 MP 的 20% 傷害」) —— resolved ONCE, next
    // to the combo window and for the same reason: the number was frozen when
    // the mana was burned, so asking it per target could only ever return the
    // same answer, and asking it late is what the bank exists to avoid.
    const bankedAdd = bankedAddend(e, ctx);
    // 百分比生命傷害 (`hpPct`) — resolved PER TARGET, unlike everything else in
    // this handler, because the denominator is the VICTIM's own health. The rank
    // column is read once, outside the loop; clamped like `Scaling.perRank`'s
    // neighbours so a rank past the authored column keeps the top row.
    const pctCol = e.hpPct;
    const pct =
      pctCol === undefined
        ? 0
        : (pctCol.perRank[
            Math.min(Math.max(1, ctx.rank), pctCol.perRank.length) - 1
          ] ?? 0);
    for (const target of ctx.targets) {
      let amount = resolveScaling(stats, e.amount, ctx.rank) + comboAdd + bankedAdd;
      if (pctCol !== undefined && pct > 0) {
        const hp = world.health.get(target);
        if (hp) amount += (pctCol.basis === "current" ? hp.hp : hp.maxHp) * pct;
      }
      let crit = false;
      if (e.canCrit) {
        const cc = stats[Stat.CritChance] ?? 0;
        if (cc > 0 && ctx.rng.chance(cc)) {
          crit = true;
          amount *= stats[Stat.CritDamage] || 1.75;
        }
      }
      world.damageQueue.push({
        source: ctx.caster,
        target,
        amount,
        type: e.damageType,
        crit,
        origin: ctx.origin,
      });
    }
  },

  bake(e, ctx) {
    if (e.comboBonus === undefined) return e;
    const add = comboAddend(e, ctx);
    // The conditional is CONSUMED here either way: a payload that leaves this
    // function still carrying `comboBonus` would be re-asked the question at
    // landing, which is the bug. Dropping it is the fix, not an optimisation.
    const { comboBonus: _resolved, ...rest } = e;
    if (add === 0) return rest;
    return { ...rest, amount: { ...e.amount, flat: (e.amount.flat ?? 0) + add } };
  },
};
