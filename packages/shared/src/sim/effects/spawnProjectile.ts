/**
 * `spawnProjectile` — launch a skillshot missile carrying a deferred payload.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { Projectiles } from "../content/registry";
import { resolveAbilityRange } from "../abilities/abilitySystem";
import { addScaled, dot, normalize, sub, type Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";

/**
 * GH#1187 `launchFrom:"rangeEnd"` —— 沿 `dir` 走多遠還在施法者這一區裡（射程與區邊界取小）。
 * 射線對圓：|p + s·d − c| = R ⇒ s = −b + √(b² − (|p−c|² − R²))，b = (p−c)·d。⛔ 零三角函式（sim purity）。
 */
function reachInsideZone(world: SimWorld, from: Vec2, zoneIndex: number, dir: Vec2, range: number): number {
  const zone = world.arena.zones[zoneIndex] ?? world.arena.zones[0]!;
  const rel = sub(from, zone.center);
  const b = dot(rel, dir);
  const disc = b * b - (dot(rel, rel) - zone.boundaryRadius * zone.boundaryRadius);
  if (disc < 0) return 0;
  return Math.max(0, Math.min(range, -b + Math.sqrt(disc) - 1e-3));
}

export const spawnProjectileEffect: EffectKindSpec<"spawnProjectile"> = {
  apply(e, ctx, bakeList) {
    const { world } = ctx;
    const t = world.transform.get(ctx.caster);
    if (!t) return;
    const def = Projectiles.get(e.projectileId);
    const dir = ctx.direction ?? (ctx.point ? normalize(sub(ctx.point, t.pos)) : t.facing);
    if (dir.x === 0 && dir.z === 0) return;
    // combat-env `abilityRange` (task #136) scales an ability skillshot's
    // TRAVEL range through the SAME seam as its cast range / AoE radius /
    // hit radius (resolveAbilityRange), so the distance the missile flies
    // matches the ×abilityRange number the client tooltip shows — displayed
    // == actual. Basic-attack missiles are spawned in BasicAttackSystem and
    // never pass through here, so their reach (attackRange) is untouched.
    const range = resolveAbilityRange(world, def.maxRange);
    // ⭐ GH#1187 鄂爾 R：`rangeEnd` = 在射程盡頭生成、掉頭朝施法者飛，飛回施法者**此刻**站的地方為止。缺 = 舊行為逐位元不變。
    const fromEnd = e.launchFrom === "rangeEnd";
    const reach = fromEnd ? reachInsideZone(world, t.pos, t.zone, dir, range) : 0;
    const pos = fromEnd ? addScaled(t.pos, dir, reach) : { x: t.pos.x, z: t.pos.z };
    const fly = fromEnd ? { x: -dir.x, z: -dir.z } : dir;
    const id = world.spawn();
    world.transform.set(id, {
      pos,
      vel: { x: fly.x * def.speed, z: fly.z * def.speed },
      facing: fly,
      radius: def.hitRadius,
      zone: t.zone,
    });
    world.projectile.set(id, {
      castInstance: ctx.castInstance,
      projectileId: e.projectileId,
      ownerId: ctx.caster,
      dir: fly,
      speed: def.speed,
      remainingRange: fromEnd ? reach : range,
      hitRadius: def.hitRadius,
      pierce: def.pierce ?? false,
      hitSet: new Set(),
      ...(def.returns === true ? { returns: true } : {}),
      ...(def.split !== undefined ? { split: def.split } : {}),
      // Same cast-time resolution as the leap: a missile is the OTHER gap
      // between cast and payout, so a conditional term rides it frozen. No
      // shipped projectile carries one today — this is the class guard, so
      // the next `comboBonus` authored onto an onHit cannot repeat #247.
      onHit: bakeList(e.onHit, ctx),
      // GH#1187【撞擊改向】—— 同一個施放時刻烘焙（理由同 onHit）；改向或作廢之後由 projectileRedirect.ts 刪掉。
      ...(e.onRedirectHit !== undefined ? { redirectOnHit: bakeList(e.onRedirectHit, ctx) } : {}),
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
    return {
      ...e,
      onHit: bakeList(e.onHit, ctx),
      ...(e.onRedirectHit !== undefined ? { onRedirectHit: bakeList(e.onRedirectHit, ctx) } : {}),
    };
  },
};
