/**
 * MobSystem — the roguelite mob-wave lifecycle (task #215 肉鴿小怪波).
 *
 * One self-contained system owns the whole mechanic at step slot 9d/9e (right
 * after deathSystem/reviveSystem, alongside guardianSystem): a dedicated
 * combatActive-gated `mobTicks` clock drives the wave schedule, per-mob AI aims
 * each mob at the nearest enemy champion, a cooldown-gated melee pushes packets
 * into `world.damageQueue`, and a death-scan pass pays the killer +gold +XP and
 * grants a level every Nth mob kill.
 *
 * TICK ORDER (once per live-combat tick, in a FIXED slot):
 *   1) CLOCK   — `world.mobTicks++` first (a DEDICATED counter, like
 *                fireRingTicks — NOT combatTicks, which only advances while
 *                flowers are armed). combat-second S = mobTicks/TICK_HZ.
 *   2) SCHEDULE— fire a wave when the cadence lands; wave k spawns min(k,cap)
 *                mobs per active zone, one at a time, never past maxAlivePerZone.
 *   3) AI      — each mob (ascending id) aims at the nearest enemy champion.
 *   4) MELEE   — a mob in range with a ready cooldown queues one melee packet.
 *   5) PAYOUT  — pay the killer for mobs that DIED this tick, then despawn them.
 *
 * WHY SLOT 9d (after deathSystem): so it reads THIS tick's `death` events and
 * the settled alive-state before paying, exactly like guardianSystem; and it
 * sets nav.attackTarget / queues melee for NEXT tick's chase+resolve (a 1-tick
 * latency identical to guardian volleys — harmless and deterministic). Running
 * it BEFORE deathSystem would miss same-tick kills.
 *
 * PER-ZONE STAND-DOWN (task #216). `combatActive` is global — it only drops once
 * EVERY duel is decided — so a zone that finished early kept taking mob waves
 * and mob melee while another zone fought on. Any zone in `world.settledZones`
 * (host-written the instant that duel's winner is recorded) spawns no new wave
 * and its mobs drop aggro, exactly like the fire ring stops burning it.
 *
 * OFF BY DEFAULT / BYTE-IDENTICAL. `world.mobRules === null || world.mobTicks <
 * 0 || !world.combatActive` makes it a strict no-op, so a skeleton/test/
 * prediction-shadow world stays byte-identical (world.mob + world.mobKills empty,
 * mobTicks -1 ⇒ nothing folds into the digest).
 *
 * DETERMINISM. Zero rng draws (guardian-style): the schedule is pure arithmetic
 * on mobTicks; edge-spawn positions come from `mobSpawnPos` (a static direction
 * table + integer hash, no rng, no trig); AI ties break by ascending entityId;
 * every store/zone list iterates in sorted order. Distances use squared compares
 * only. See `mobs.ts` + `sim/purity.test.ts`.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";
import { grantGold, grantXp, grantLevels } from "../economy/progression";
import {
  type MobRules,
  MONSTER_TEAM,
  spawnMob,
  mobsAliveInZone,
} from "../mobs";

export function mobSystem(world: SimWorld): void {
  const rules = world.mobRules;
  if (rules === null || world.mobTicks < 0 || !world.combatActive) return;

  // 1) CLOCK — the dedicated combat-elapsed mob counter, advanced first.
  world.mobTicks++;
  const mt = world.mobTicks;

  // 2) WAVE SCHEDULE — fire on the cadence; spawn min(k,cap) per active zone.
  if (mt >= rules.firstWaveTicks && (mt - rules.firstWaveTicks) % rules.waveIntervalTicks === 0) {
    const k = (mt - rules.firstWaveTicks) / rules.waveIntervalTicks + 1;
    const count = Math.min(k, rules.mobsPerWaveCap);
    // active zones in sorted order (deterministic); each zone independently
    // spawns up to `count`, never exceeding its alive cap.
    const zones = [...world.mobZones].sort((a, b) => a - b);
    for (const zone of zones) {
      // #216: a zone whose duel is already decided gets no new wave — the round
      // is over there, and PvE that keeps arriving is PvE that keeps hitting.
      if (world.settledZones.has(zone)) continue;
      for (let i = 0; i < count; i++) {
        if (mobsAliveInZone(world, zone) >= rules.maxAlivePerZone) break;
        spawnMob(world, zone, rules, k, i);
      }
    }
  }

  // 3) AI TARGET PICK — each mob (ascending id) aims at the nearest enemy
  //    champion in its zone. Every champion is an enemy (team !== MONSTER), so
  //    this is champion-blind aggro with no per-team logic.
  for (const [mobId, mob] of world.mob) {
    const mt2 = world.transform.get(mobId);
    const mhp = world.health.get(mobId);
    if (!mt2 || !mhp?.alive) continue;
    // #216: STAND DOWN in a settled zone. The duel there is decided, so a mob
    // must not keep chasing/hitting the survivors while the other zone plays on
    // (same reason the fire ring stops burning them). Target is cleared rather
    // than kept, so the nav chase stops on the same tick as the melee.
    if (world.settledZones.has(mob.zone)) {
      mob.target = -1;
      const idleNav = world.nav.get(mobId);
      if (idleNav) idleNav.attackTarget = null;
      continue;
    }
    let target: EntityId | -1 = -1;
    let bestD2 = Infinity;
    for (const [cid, cteam] of world.team) {
      if (cteam.teamId === MONSTER_TEAM) continue; // never target another mob
      if (!world.champion.has(cid)) continue; // champions only
      const chp = world.health.get(cid);
      const ct = world.transform.get(cid);
      if (!chp?.alive || !ct || ct.zone !== mob.zone) continue;
      const d2 = distSq(mt2.pos, ct.pos);
      // strict `<` + ascending-id iteration = ties break by lowest entityId.
      if (d2 < bestD2) {
        bestD2 = d2;
        target = cid;
      }
    }
    mob.target = target;
    const nav = world.nav.get(mobId);
    if (nav) nav.attackTarget = target === -1 ? null : target;

    // 4) MELEE — in range + cooldown ready → queue one packet; else age the cd.
    if (target !== -1 && mob.attackCdTicks <= 0 && bestD2 <= rules.attackRangeSq) {
      world.damageQueue.push({
        source: mobId,
        target,
        amount: rules.attackDamage,
        type: "physical",
        crit: false,
        origin: "mob",
      });
      mob.attackCdTicks = rules.attackCdTicks;
    } else if (mob.attackCdTicks > 0) {
      mob.attackCdTicks--;
    }
  }

  // 5) DEATH PAYOUT + CLEANUP — pay the killer for mobs that died THIS tick,
  //    then remove the corpse. A mob killed by a non-champion (another mob, the
  //    fire ring, a DoT with no champion source) pays nobody — mirrors
  //    DeathSystem's no-killer path and the guardian/coin `champion.has` gate.
  for (const ev of world.events) {
    if (ev.type !== "death") continue;
    const id = ev.data.id as EntityId;
    if (!world.mob.has(id)) continue;
    const killer = (ev.data.killer as EntityId | null) ?? null;
    if (killer !== null && world.champion.has(killer)) {
      grantGold(world, killer, rules.rewardGold);
      grantXp(world, killer, rules.rewardXp);
      const n = (world.mobKills.get(killer) ?? 0) + 1;
      world.mobKills.set(killer, n);
      if (rules.killsPerLevel > 0 && n % rules.killsPerLevel === 0) {
        grantLevels(world, killer, 1);
      }
      world.emit("mobSlain", {
        id,
        killer,
        killerSeatId: world.team.get(killer)?.seatId ?? -1,
        gold: rules.rewardGold,
        kills: n,
      });
    } else {
      world.emit("mobSlain", { id, killer: null, killerSeatId: -1, gold: 0, kills: 0 });
    }
    world.destroy(id);
  }
}

/**
 * Combat entry: arm the mob mechanic. Idempotent — clears any stale mobs first,
 * sets the rules, resets the dedicated clock to 0 and records the active zone
 * list (mirror of beginCombatFlowers/beginCombatGuardians). The host only calls
 * this from ROUND `mobRules.fromRound` onward (see MatchController.enterCombat).
 */
export function beginCombatMobs(
  world: SimWorld,
  rules: MobRules,
  zones: readonly number[],
): void {
  endCombatMobs(world);
  world.mobRules = rules;
  world.mobTicks = 0;
  for (const zone of zones) world.mobZones.add(zone);
}

/**
 * Combat exit (round end / phase leave): despawn EVERY mob silently — no payout,
 * no corpse — clear the zone list, disarm the rules and stop the clock
 * (mobTicks = -1). This is what stops post-round farming, exactly like
 * endCombatGuardians. Idempotent.
 *
 * `world.mobKills` is deliberately NOT cleared here (owner decision, #215): the
 * every-30-kills → +1 level bonus is the DOMINANT L50→L99 climb, so the tally is
 * MATCH-CUMULATIVE — a 29-kill remainder carries into the next round instead of
 * being discarded. It resets naturally with a fresh SimWorld per match; champion
 * EntityIds are stable across rounds (one world per match), so the per-champion
 * count keeps accruing. Mob ENTITIES still despawn every round (the loop below),
 * so there is no post-round PvE farming.
 */
export function endCombatMobs(world: SimWorld): void {
  for (const id of [...world.mob.keys()]) world.destroy(id);
  world.mob.clear();
  world.mobZones.clear();
  world.mobRules = null;
  world.mobTicks = -1;
}
