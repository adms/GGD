/**
 * `spawnProjectile` — launch a skillshot missile carrying a deferred payload.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { Projectiles } from "../content/registry";
import { resolveAbilityRange } from "../abilities/abilitySystem";
import { normalize, sub } from "../math/vec2";

export const spawnProjectileEffect: EffectKindSpec<"spawnProjectile"> = {
  apply(e, ctx, bakeList) {
    const { world } = ctx;
    const t = world.transform.get(ctx.caster);
    if (!t) return;
    const def = Projectiles.get(e.projectileId);
    const dir = ctx.direction ?? (ctx.point ? normalize(sub(ctx.point, t.pos)) : t.facing);
    if (dir.x === 0 && dir.z === 0) return;
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x: t.pos.x, z: t.pos.z },
      vel: { x: dir.x * def.speed, z: dir.z * def.speed },
      facing: dir,
      radius: def.hitRadius,
      zone: t.zone,
    });
    world.projectile.set(id, {
      projectileId: e.projectileId,
      ownerId: ctx.caster,
      dir,
      speed: def.speed,
      // combat-env `abilityRange` (task #136) scales an ability skillshot's
      // TRAVEL range through the SAME seam as its cast range / AoE radius /
      // hit radius (resolveAbilityRange), so the distance the missile flies
      // matches the ×abilityRange number the client tooltip shows — displayed
      // == actual. Basic-attack missiles are spawned in BasicAttackSystem and
      // never pass through here, so their reach (attackRange) is untouched.
      remainingRange: resolveAbilityRange(world, def.maxRange),
      hitRadius: def.hitRadius,
      pierce: def.pierce ?? false,
      hitSet: new Set(),
      // Same cast-time resolution as the leap: a missile is the OTHER gap
      // between cast and payout, so a conditional term rides it frozen. No
      // shipped projectile carries one today — this is the class guard, so
      // the next `comboBonus` authored onto an onHit cannot repeat #247.
      onHit: bakeList(e.onHit, ctx),
      rank: ctx.rank,
      origin: ctx.origin,
      abilitySlot: ctx.abilitySlot,
    });
    // Presentation ownership must survive the projectile seam.  VFX scripts
    // replace the ability-authored projectile look, while the projectile keeps
    // its authoritative hit/range payload.  Without `origin`, the client could
    // only guess from a shared projectileId and drew both the default missile
    // impact and the script-authored effect.
    world.emit("projectileSpawn", {
      id,
      owner: ctx.caster,
      projectileId: e.projectileId,
      origin: ctx.origin,
    });
  },

  bake(e, ctx, bakeList) {
    return { ...e, onHit: bakeList(e.onHit, ctx) };
  },
};
