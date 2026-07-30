/**
 * effectRunner — the ONE interpreter for EffectDef[]. Abilities, item passives,
 * augment hooks, and buffs all execute through here. Handlers mutate the world
 * only via well-defined paths (damage queue, shields, statuses, buff sources,
 * dash overrides, projectile spawns).
 *
 * GH#289 split the 500-line `switch` this used to be into one module per kind,
 * dispatched through {@link EFFECT_HANDLERS}. The handler bodies moved
 * VERBATIM — this file is now only the dispatch and the cast-time baker.
 * **To add a kind, read the header of `effectRegistry.ts`; you do not need to
 * change this file.**
 */
import type { EffectContext, EffectDef } from "./effect";
import { EFFECT_HANDLERS } from "./effectRegistry";
import type { EffectKindSpec } from "./effectKind";

/** Erase the per-kind narrowing once the tag has already selected the entry. */
type AnyKindSpec = EffectKindSpec<EffectDef["kind"]>;

export function runEffects(effects: readonly EffectDef[], ctx: EffectContext): void {
  for (const e of effects) applyEffect(e, ctx);
}

export function applyEffect(e: EffectDef, ctx: EffectContext): void {
  const spec = EFFECT_HANDLERS[e.kind] as AnyKindSpec;
  spec.apply(e, ctx, bakeCastTimeConditionals);
}

/**
 * CAST-TIME RESOLUTION of a DEFERRED payload (#247 follow-up, the REFUTED claim).
 *
 * THE DEFECT THIS EXISTS TO KILL. `comboBonus` used to be resolved inside the
 * damage handler, i.e. wherever the damage happened to land. For 07-03
 * 列、在、前 that is the END of a 43-tick arc (1.44 s), while the window 07-02
 * 者、皆、陣 opens is 1.00 s (j:34438 → TriggerSleepAction(1.00) → j:34440). The
 * window had therefore ALWAYS lapsed before the damage resolved: the bonus could
 * not fire at any timing, in any real game, and the test that "proved" it worked
 * only ever applied the damage effect on its own, with no flight in between.
 *
 * THE SOURCE'S OWN SHAPE. `Trig_Jump_Start_Actions` computes the complete
 * `udg_MoonDamage` — the `+5.00 × AGI` combo term INCLUDED (j:34211-34216) — in
 * the SPELL_EFFECT action, before `gg_trg_Jump_Effect` is even enabled
 * (j:34226). The periodic trigger then flies 41 ticks and, at
 * `udg_Jump_Index >= 41`, calls `UnitDamageTargetBJ(..., udg_MoonDamage, ...)`
 * (j:34262): the already-baked number. The window expiring mid-flight is
 * irrelevant in WC3 precisely BECAUSE the value was frozen at cast.
 *
 * So a deferred payload is resolved HERE, at the moment the arc/missile is
 * launched, and what travels is the resolved amount — folded into the payload's
 * own `flat` term so nothing downstream has to know a window ever existed.
 *
 * Applied at every point where an EffectDef[] stops being immediate and starts
 * being a promise: `leap.onLand` and `spawnProjectile.onHit`. Recurses, so a
 * leap that spawns a projectile is baked once, at the leap's cast.
 *
 * GH#289: the three-kind `switch` this used to be is now the OPTIONAL `bake`
 * member of each kind's registry entry, so a lane adding a primitive with its
 * own deferred payload declares it in its own file. A kind with no `bake` is
 * the identity — deliberately NOT a throw, because baking a list walks every
 * member of it and an unimplemented kind must not detonate on a list it merely
 * shares.
 */
export function bakeCastTimeConditionals(
  effects: readonly EffectDef[],
  ctx: EffectContext,
): EffectDef[] {
  return effects.map((e) => bakeOne(e, ctx));
}

function bakeOne(e: EffectDef, ctx: EffectContext): EffectDef {
  const spec = EFFECT_HANDLERS[e.kind] as AnyKindSpec;
  return spec.bake === undefined ? e : spec.bake(e, ctx, bakeCastTimeConditionals);
}
