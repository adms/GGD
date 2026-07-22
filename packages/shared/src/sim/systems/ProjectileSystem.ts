/**
 * ProjectileSystem — advances projectiles with swept-circle hit tests against
 * enemy units, terminates on walls/range, and runs the carried onHit effects.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { scale, addScaled, dist } from "../math/vec2";
import { sweptCircleVsCircle } from "../collision/intersect";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { recordAbilityHit, recordAbilityWhiff } from "../stats/matchStats";

export function projectileSystem(world: SimWorld): void {
  const toDestroy: EntityId[] = [];

  for (const [id, proj] of world.projectile) {
    const t = world.transform.get(id);
    if (!t) continue;
    const stepLen = Math.min(proj.speed * world.dt, proj.remainingRange);
    const delta = scale(proj.dir, stepLen);

    // Collect candidate victims along the sweep (broad-phase around the path).
    const owner = proj.ownerId;
    const ownerTeam = world.team.get(owner);
    const candidates = world.grid.queryCircle(
      { x: t.pos.x + delta.x / 2, z: t.pos.z + delta.z / 2 },
      stepLen / 2 + proj.hitRadius + 2,
    );

    // earliest hit wins (ties broken by lower entity id — candidates sorted)
    let bestT = Infinity;
    let bestId: EntityId | null = null;
    for (const cid of candidates) {
      if (cid === owner || cid === id) continue;
      if (world.projectile.has(cid)) continue;
      if (proj.hitSet.has(cid)) continue;
      const ct = world.transform.get(cid);
      const chp = world.health.get(cid);
      if (!ct || !chp?.alive || ct.zone !== t.zone) continue;
      const cteam = world.team.get(cid);
      if (cteam && ownerTeam && cteam.teamId === ownerTeam.teamId) continue; // no friendly fire
      const hitT = sweptCircleVsCircle(t.pos, delta, proj.hitRadius, {
        kind: "circle",
        center: ct.pos,
        radius: ct.radius,
      });
      if (hitT !== null && hitT < bestT) {
        bestT = hitT;
        bestId = cid;
      }
    }

    if (bestId !== null) {
      // move to impact point, apply onHit
      t.pos = addScaled(t.pos, delta, bestT);
      proj.hitSet.add(bestId);
      if (proj.basic) {
        // basic-attack projectile: the on-hit pipeline resolves AT IMPACT —
        // AD damage (origin "basic" feeds lifesteal) + item onBasicAttack hooks.
        world.damageQueue.push({
          source: owner,
          target: bestId,
          amount: proj.basicDamage ?? 0,
          type: "physical",
          crit: proj.crit ?? false,
          origin: "basic",
        });
        world.emit("basicAttackHit", {
          id,
          owner,
          target: bestId,
          crit: proj.crit ?? false,
          projectileId: proj.projectileId,
        });
        fireHooks(world, owner, "onBasicAttack", bestId);
      } else {
        world.emit("projectileHit", { id, owner, target: bestId, projectileId: proj.projectileId });
        // scoreboard: an ability skillshot connecting with an enemy champion
        if (proj.origin.startsWith("ability:")) recordAbilityHit(world, owner, bestId);
        runEffects(proj.onHit, {
          world,
          caster: owner,
          rank: proj.rank,
          targets: [bestId],
          direction: proj.dir,
          origin: proj.origin,
          rng: world.rng,
        });
        // ability projectiles count as ability hits for hooks
        if (proj.origin.startsWith("ability:")) {
          fireHooks(world, owner, "onAbilityHit", bestId, proj.abilitySlot);
        }
      }
      if (!proj.pierce) {
        toDestroy.push(id);
        continue;
      }
    } else {
      t.pos = { x: t.pos.x + delta.x, z: t.pos.z + delta.z };
    }

    proj.remainingRange -= stepLen;

    // terminate on zone boundary or range end
    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;
    if (proj.remainingRange <= 1e-6 || dist(t.pos, zone.center) > zone.boundaryRadius) {
      toDestroy.push(id);
    }
  }

  for (const id of toDestroy) {
    // scoreboard: an ability skillshot that expired having hit nobody is a whiff
    const p = world.projectile.get(id);
    if (p && !p.basic && p.origin.startsWith("ability:") && p.hitSet.size === 0) {
      recordAbilityWhiff(world, p.ownerId);
    }
    // The payload carries the END POINT and whether the missile connected: a
    // projectile that expired on a wall/at max range gets a client FIZZLE, one
    // that landed does not (its impact fx already fired). Position travels in
    // the event because the entity is destroyed on this very tick, so the
    // client cannot look it up from the next snapshot.
    const t = world.transform.get(id);
    world.emit("projectileEnd", {
      id,
      x: t?.pos.x ?? 0,
      z: t?.pos.z ?? 0,
      owner: p?.ownerId,
      projectileId: p?.projectileId,
      hit: (p?.hitSet.size ?? 0) > 0,
    });
    world.destroy(id);
  }
}
