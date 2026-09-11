/**
 * 彈道的兩個「換相」（GH#1197）—— ⭐ 一個機制、兩支技能：
 *   · 阿璃 Q：射程盡頭／命中 ⇒ `flipToReturn` 掉頭飛回施法者（`ProjectileSystem` 每 tick 轉向）
 *   · 威寇茲 Q：命中或再次施放 ⇒ `splitProjectile` 從當下位置左右各生一發子彈，主彈退場
 * ⛔ 零三角函式：垂直分裂用 (x,z)→(−z,x)／(z,−x)，⛔ 不支援任意角度（sim purity）。
 */
import type { EntityId, ProjectileId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { ProjectileComp } from "./components";
import type { CastableSlot } from "./intents";
import { Projectiles } from "./content/registry";
import { resolveAbilityRange } from "./abilities/abilitySystem";

/** 去程結束 ⇒ 回程：命中記錄重置（去程打過的人回程可以再打），方向由 ProjectileSystem 下一 tick 重算。 */
export function flipToReturn(proj: ProjectileComp): void {
  proj.phase = "return";
  proj.hitSet = new Set();
  proj.remainingRange = Number.MAX_SAFE_INTEGER;
}

function spawnChild(world: SimWorld, parentId: EntityId, proj: ProjectileComp, childId: ProjectileId, dir: { x: number; z: number }): void {
  const pt = world.transform.get(parentId);
  const def = Projectiles.get(childId);
  if (!pt) return;
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: pt.pos.x, z: pt.pos.z },
    vel: { x: dir.x * def.speed, z: dir.z * def.speed },
    facing: dir,
    radius: def.hitRadius,
    zone: pt.zone,
  });
  world.projectile.set(id, {
    castInstance: proj.castInstance,
    projectileId: childId,
    ownerId: proj.ownerId,
    dir,
    speed: def.speed,
    remainingRange: resolveAbilityRange(world, def.maxRange),
    hitRadius: def.hitRadius,
    pierce: def.pierce ?? false,
    hitSet: new Set(),
    onHit: proj.onHit, // 子彈繼承主彈已烘好的 onHit
    rank: proj.rank,
    origin: proj.origin,
    abilitySlot: proj.abilitySlot,
    ...(def.returns === true ? { returns: true } : {}),
    // ⛔ 子彈不再帶 split：不然「命中 ⇒ 分裂」會無限遞迴
  });
  world.emit("projectileSpawn", { id, owner: proj.ownerId, projectileId: childId, origin: proj.origin });
}

/** 從主彈**當下位置**左右各生一發（垂直於主彈方向）。呼叫端負責把主彈退場。 */
export function splitProjectile(world: SimWorld, parentId: EntityId, proj: ProjectileComp): void {
  const s = proj.split;
  if (s === undefined) return;
  const left = { x: -proj.dir.z, z: proj.dir.x };
  const right = { x: proj.dir.z, z: -proj.dir.x };
  spawnChild(world, parentId, proj, s.projectileId, left);
  spawnChild(world, parentId, proj, s.projectileId, right);
}

/**
 * 再次施放 ⇒ 這一格**首段**射出的、還在飛的主彈當場分裂（威寇茲 Q）。
 * 只認同一個施放序號：⛔ 不然上一發的殘彈會被這一次的後段引爆。回傳分裂了幾發。
 */
export function splitLiveProjectiles(world: SimWorld, owner: EntityId, slot: CastableSlot, serial: number): number {
  const victims: EntityId[] = [];
  for (const [id, p] of world.projectile) {
    if (p.ownerId !== owner || p.abilitySlot !== slot) continue;
    if (p.split === undefined || !p.split.on.includes("recast")) continue;
    if (p.castInstance?.serial !== serial) continue;
    victims.push(id);
  }
  victims.sort((a, b) => a - b);
  for (const id of victims) {
    const p = world.projectile.get(id);
    if (!p) continue;
    splitProjectile(world, id, p);
    const t = world.transform.get(id);
    world.emit("projectileEnd", { id, x: t?.pos.x ?? 0, z: t?.pos.z ?? 0, owner, projectileId: p.projectileId, origin: p.origin, hit: p.hitSet.size > 0 });
    world.destroy(id);
  }
  return victims.length;
}
