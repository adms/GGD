/**
 * FlowerSystem — healing-flower burst + spawn cadence. Runs right after
 * deathSystem (it consumes this tick's `death` events) and before regen.
 *
 *  1. BURST: a flower killed this tick restores `healPctMax * maxHealth` HP
 *     and `manaPctMax * maxMana` mana to the killer and to the killer's
 *     ALLIED champions within `burstRadius` of the FLOWER (alive champions
 *     in the flower's zone only; enemies and dead allies get nothing).
 *     Emits `flowerBurst` {id, x, z, teamId(of killer)}. The flower entity is
 *     destroyed the same tick; the zone's respawn timer starts NOW
 *     (respawnTicks measured from the flower's death).
 *  2. SPAWN: while combat is armed (world.combatTicks >= 0), each scheduled
 *     zone spawns a flower at its due tick — deterministic position from
 *     world.rng — respecting maxAlivePerZone.
 *
 * Disarmed worlds (flowerRules null / combatTicks -1, e.g. the client's
 * prediction shadow world) skip everything: flowers are server entities,
 * interpolated on the client like projectiles, never predicted.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";
import { healTarget, restoreMana } from "../combat/restore";
import { flowersAliveInZone, pickFlowerSpawnPos, spawnFlower } from "../flowers";

export function flowerSystem(world: SimWorld): void {
  const rules = world.flowerRules;
  if (!rules) return;

  // combat-elapsed tick counter (armed worlds only): incremented FIRST so a
  // death this tick schedules its respawn exactly respawnTicks later and the
  // first spawn lands exactly firstSpawnTicks into combat.
  if (world.combatTicks >= 0) world.combatTicks++;

  // ---- 1) burst + despawn for flowers that died this tick ----
  // Snapshot the events array: emitting flowerBurst grows it mid-iteration.
  const events = [...world.events];
  for (const ev of events) {
    if (ev.type !== "death") continue;
    const id = ev.data.id as EntityId;
    const comp = world.flower.get(id);
    if (!comp) continue;
    const t = world.transform.get(id);
    const killer = ev.data.killer as EntityId | null;

    if (t && killer !== null && world.champion.has(killer)) {
      const killerTeam = world.team.get(killer);
      const r2 = rules.burstRadius * rules.burstRadius;
      // champion store iterates in ascending-id insertion order — deterministic
      for (const [cid] of world.champion) {
        const chp = world.health.get(cid);
        const ct = world.transform.get(cid);
        const cteam = world.team.get(cid);
        if (!chp?.alive || !ct || ct.zone !== comp.zone) continue; // alive, same zone
        if (!cteam || !killerTeam || cteam.teamId !== killerTeam.teamId) continue; // killer's team only
        if (cid !== killer && distSq(ct.pos, t.pos) > r2) continue; // allies need radius; killer always
        // burst restore scales with the global combat-env healing factor.
        // `score: false` — the flower burst has NEVER credited healingDone
        // (it is counted as flowersEaten); scoring it here would move a
        // digest-bearing stat. The helpers emit `heal` / `manaRestore` so the
        // burst finally draws its 補血 / 補魔 numbers (#92).
        const envHeal = world.combatEnv.healing;
        healTarget(world, {
          source: killer,
          target: cid,
          amount: chp.maxHp * rules.healPctMax * envHeal,
          origin: "flower",
          score: false,
        });
        restoreMana(world, {
          source: killer,
          target: cid,
          amount: chp.maxMana * rules.manaPctMax * envHeal,
          origin: "flower",
        });
      }
      world.emit("flowerBurst", {
        id,
        x: t.pos.x,
        z: t.pos.z,
        teamId: killerTeam?.teamId ?? -1,
      });
    }

    // respawn timer runs from the flower's DEATH (armed duel zones only)
    if (world.combatTicks >= 0 && world.flowerZones.has(comp.zone)) {
      world.flowerNextSpawn.set(comp.zone, world.combatTicks + rules.respawnTicks);
    }
    world.destroy(id);
  }

  // ---- 2) spawn cadence (combat only) ----
  if (world.combatTicks < 0) return;
  const dueZones = [...world.flowerNextSpawn.keys()].sort((a, b) => a - b);
  for (const zone of dueZones) {
    const at = world.flowerNextSpawn.get(zone)!;
    if (world.combatTicks < at) continue;
    if (flowersAliveInZone(world, zone) >= rules.maxAlivePerZone) continue; // hold until a slot frees
    const pos = pickFlowerSpawnPos(world, zone);
    spawnFlower(world, zone, pos, rules.hp);
    world.flowerNextSpawn.delete(zone); // next spawn is scheduled by this flower's death
  }
}
