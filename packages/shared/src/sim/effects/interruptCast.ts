import type { EffectKindSpec } from "./effectKind";
import { Abilities } from "../content/registry";
import { shapeTargets } from "./shapeTargets";
import { refusesControl } from "./invulnerable";
import { isManuallyTargetable } from "../targeting";

/** End a legal enemy's interruptible wind-up, with no stun, refund or rewind. */
export const interruptCastEffect: EffectKindSpec<"interruptCast"> = {
  apply(effect, ctx) {
    const { world } = ctx;
    for (const target of shapeTargets(effect, ctx)) {
      const from = world.transform.get(ctx.caster), to = world.transform.get(target);
      const ownTeam = world.team.get(ctx.caster), targetTeam = world.team.get(target);
      if (!world.health.get(ctx.caster)?.alive || !from || !to || from.zone !== to.zone || world.settledZones.has(from.zone) ||
          !ownTeam || !targetTeam || ownTeam.teamId === targetTeam.teamId || !isManuallyTargetable(world, target, ctx.caster)) continue;
      const ability = world.abilities.get(target), cast = ability?.cast;
      if (!cast || !world.health.get(target)?.alive || Abilities.get(cast.abilityId).interruptible === false) continue;
      if (refusesControl(world, target)) {
        world.emit("immuneControl", { target, source: ctx.caster, origin: ctx.origin });
        continue;
      }
      ability!.cast = null;
      world.emit("castInterrupt", { caster: target, slot: cast.slot, abilityId: cast.abilityId });
    }
  },
};
