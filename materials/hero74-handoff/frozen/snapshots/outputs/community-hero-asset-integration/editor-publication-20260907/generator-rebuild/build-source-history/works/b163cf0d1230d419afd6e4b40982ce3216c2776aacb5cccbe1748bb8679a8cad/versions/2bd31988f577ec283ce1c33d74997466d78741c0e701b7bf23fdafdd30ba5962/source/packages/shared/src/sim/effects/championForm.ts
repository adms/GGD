/**
 * `championForm` (task #249 變身) — the w3x `Eme1`/`Emeu` body swap.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { rankScalar } from "../perRank";
import { applyChampionForm } from "../systems/ChampionFormSystem";

export const championFormEffect: EffectKindSpec<"championForm"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // 變身 (task #249). The subject is always the CASTER, never `ctx.targets`:
    // WC3 Metamorphosis (`Eme1`/`Emeu`) morphs the unit that owns the ability,
    // and all 26 of the map's transform abilities are self-cast. Reading
    // `ctx.caster` rather than `ctx.targets[0]` also keeps a `castType:
    // "self"` doc (whose target set IS the caster) and a hook-fired one
    // (whose target set is the EVENT's entity — an enemy) morphing the same
    // body.
    //
    // A refused change (no counterpart, or one the registry does not know)
    // writes NOTHING and emits `castRejected` — see ChampionFormSystem for
    // why a bad id must never reach `champ.championId`.
    applyChampionForm(world, ctx.caster, e.to, rankScalar(e.durationSec, ctx.rank), {
      slot: ctx.abilitySlot,
      origin: ctx.origin,
    });
  },
};
