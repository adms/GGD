/**
 * ⭐ GH#1187【撞擊改向】—— 鄂爾 R 後段：施法者再次施放後衝刺，**身體碰到首段那發投射物** ⇒ 它改朝衝刺方向飛、
 * 之後命中改跑 `spawnProjectile.onRedirectHit`（擊飛）。一個機制（第〇·五守則），⛔ 不是為鄂爾寫的 if。
 *
 * 與 `projectileSplit.ts`（威寇茲 Q 再按分裂）同一條關聯：**同一位施法者 · 同一格技能 · 同一個施放序號**，
 * ⛔ 不然上一次施放的殘彈會被這一次的後段撞走。
 *
 * 生命週期（`ProjectileComp.redirectOnHit` 在 ⇒ 還能改向；改向一次或作廢就刪掉）：
 *
 *   首段生成 ─▶ 等待 ─┬─ 按下後段（armProjectileRedirects）─▶ 衝刺中碰到 ─▶ 改向（redirectProjectile）
 *                    │                                    └─ 衝刺結束沒碰到 ─▶ 作廢
 *                    ├─ 沒按後段就先碰到施法者身體 ─▶ 作廢 ＋ 後段窗口當場結束
 *                    └─ 飛完／被清掉仍沒改向 ─▶ 作廢 ＋ 後段窗口當場結束（ProjectileSystem 的收尾迴圈）
 *
 * 規則開關 `world.projectileRedirect.mode`（`config.displacement-tiers@1`，見 `projectileRedirectRules.ts`）。
 * ⛔ 零三角函式、零亂數、Map 迭代先排序（sim purity）。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { ProjectileComp, Transform } from "./components";
import type { CastableSlot } from "./intents";
import { Projectiles } from "./content/registry";
import { resolveAbilityRadius, resolveAbilityRange } from "./abilities/abilitySystem";
import { abilityInstanceFor } from "./abilities/innateActive";
import { finishRecast } from "./abilities/recast";
import { distSq, normalize, scale, type Vec2 } from "./math/vec2";

/** 改向：朝 `dir` 飛、射程重新算滿、命中記錄清空、之後命中跑改向那一串。 */
function redirectProjectile(world: SimWorld, id: EntityId, p: ProjectileComp, dir: Vec2): void {
  const d = normalize(dir);
  const onHit = p.redirectOnHit;
  delete p.redirectOnHit;
  delete p.redirectArmedTick;
  if (onHit === undefined || (d.x === 0 && d.z === 0)) return;
  p.dir = d;
  p.onHit = onHit;
  p.hitSet = new Set();
  p.remainingRange = resolveAbilityRange(world, Projectiles.get(p.projectileId).maxRange);
  const t = world.transform.get(id);
  if (t) {
    t.vel = scale(d, p.speed);
    t.facing = d;
  }
}

/** 改向機會作廢；若施法者那一格的後段還是**這一次**施放開的窗 ⇒ 當場結束（⛔ 不留一個按了只剩空衝的窗）。 */
export function forfeitProjectileRedirect(world: SimWorld, p: ProjectileComp): void {
  if (p.redirectOnHit === undefined) return;
  delete p.redirectOnHit;
  delete p.redirectArmedTick;
  const ab = world.abilities.get(p.ownerId);
  const inst = ab && p.abilitySlot !== undefined ? abilityInstanceFor(ab, p.abilitySlot) : undefined;
  if (inst?.recast !== undefined && inst.recast.serial === p.castInstance?.serial) finishRecast(inst);
}

/** 再次施放那一按：`contact` ⇒ 記下「按了」等著被撞；`press` ⇒ 當場朝這一按的方向改向；`off` ⇒ 什麼都不做。 */
export function armProjectileRedirects(world: SimWorld, owner: EntityId, slot: CastableSlot, serial: number, dir: Vec2): void {
  const mode = world.projectileRedirect.mode;
  if (mode === "off") return;
  const ids: EntityId[] = [];
  for (const [id, p] of world.projectile) {
    if (p.ownerId === owner && p.abilitySlot === slot && p.redirectOnHit !== undefined && p.castInstance?.serial === serial) ids.push(id);
  }
  ids.sort((a, b) => a - b);
  for (const id of ids) {
    const p = world.projectile.get(id)!;
    if (mode === "press") redirectProjectile(world, id, p, dir);
    else p.redirectArmedTick = world.tick;
  }
}

/** 每 tick、投射物移動之前（ProjectileSystem 呼叫）：碰撞施法者身體 ⇒ 改向或作廢。 */
export function projectileRedirectStep(world: SimWorld, id: EntityId, p: ProjectileComp, t: Transform): void {
  if (p.redirectOnHit === undefined || world.projectileRedirect.mode === "off") return;
  const ot = world.transform.get(p.ownerId);
  const reach = ot ? resolveAbilityRadius(world, p.hitRadius) + ot.radius : 0;
  const touching = ot !== undefined && ot.zone === t.zone && distSq(ot.pos, t.pos) <= reach * reach;
  if (p.redirectArmedTick === undefined) {
    if (touching) forfeitProjectileRedirect(world, p); // 沒按後段就被羊撞到 ⇒ 窗口結束
    return;
  }
  const ov = world.nav.get(p.ownerId)?.override;
  const dashing = ov?.kind === "dash";
  if (touching) {
    redirectProjectile(world, id, p, dashing ? ov.dir : ot!.facing);
    return;
  }
  // 按了後段、衝刺已經結束（至少過了按下那一 tick）而沒碰到 ⇒ 這次機會用掉了。
  if (!dashing && world.tick > p.redirectArmedTick) forfeitProjectileRedirect(world, p);
}
