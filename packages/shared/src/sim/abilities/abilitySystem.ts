/**
 * Ability casting + rank-up. Validation order: learned → alive → not stunned →
 * off cooldown → mana → range. Cast is instant in the skeleton (no windup);
 * effects run immediately with resolved targeting.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilitySlot, CoreAbilitySlot, CastTarget } from "../intents";
import { Abilities } from "../content/registry";
import { Stat } from "../stats/statTypes";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { recordAbilityCast } from "../stats/matchStats";
import { queryOverlap } from "../collision/queries";
import { circle } from "../collision/shapes";
import { normalize, sub, distSq, clampLen, add } from "../math/vec2";
import { isPassiveOnly, syncAbilityPassives } from "./abilityPassives";
import { armRecovery } from "./abilityRecovery";

/**
 * Enemies of `caster` currently standing inside a ground-AoE circle.
 *
 * EXPORTED so the cast-BEGIN membership (here) and the cast-RESOLVE membership
 * (CastResolveSystem, after the wind-up) are computed by the same code. They
 * used to be one snapshot taken at begin and replayed at resolve, so an AoE
 * with a cast time hit whoever stood in the circle when the key was pressed
 * even if they walked out — and missed anyone who walked in.
 */
/**
 * Ability CAST RANGE after the global combat-env `abilityRange` factor
 * (task #136: 原始技能範圍太大 → 系統倍率縮為 60%). The ONE seam every read of an
 * ability's `def.range` passes through, so cast validation, the ground clamp and
 * the tooltip can never disagree. Applied once per read; with the neutral 1.0
 * table it is byte-identical to the pre-#136 sim (determinism preserved).
 */
export function resolveAbilityRange(world: SimWorld, range: number): number {
  return range * world.combatEnv.abilityRange;
}

/** Ability AoE RADIUS after the same `abilityRange` factor (task #136). */
export function resolveAbilityRadius(world: SimWorld, radius: number): number {
  return radius * world.combatEnv.abilityRange;
}

export function enemiesInCircle(
  world: SimWorld,
  caster: EntityId,
  point: { x: number; z: number },
  radius: number,
): EntityId[] {
  const t = world.transform.get(caster);
  if (!t) return [];
  const selfTeam = world.team.get(caster);
  const hits = queryOverlap(world, circle(point, radius), {
    zone: t.zone,
    exclude: new Set([caster]),
    aliveOnly: true,
  });
  return hits.filter((h) => {
    const ht = world.team.get(h);
    return !ht || !selfTeam || ht.teamId !== selfTeam.teamId;
  });
}

export type CastResult =
  | "ok"
  | "not-learned"
  | "dead"
  | "stunned"
  | "cooldown"
  | "no-mana"
  | "out-of-range"
  | "bad-target"
  /** the ability is a PERMANENT passive (WC3 Cool=0) — there is nothing to cast */
  | "passive"
  /**
   * still committed to the RECOVERY of a previous ability that WHIFFED
   * (abilityRecovery.ts). Distinct from "cooldown" on purpose: the HUD should
   * be able to say "you missed and you're still recovering", which is the whole
   * feedback loop that teaches the hit-cancel rule.
   */
  | "recovery";

export function castAbility(
  world: SimWorld,
  caster: EntityId,
  slot: AbilitySlot,
  target: CastTarget,
): CastResult {
  const ab = world.abilities.get(caster);
  const t = world.transform.get(caster);
  const hp = world.health.get(caster);
  const sc = world.stats.get(caster);
  if (!ab || !t || !hp || !sc) return "bad-target";

  // EX lives in its own slot; Q/W/E/R in the record. A missing exSlot (hero has
  // no EX) or a locked EX (rank 0, pre-unlock) both read as "not-learned".
  const inst = slot === "EX" ? ab.exSlot : ab.slots[slot];
  if (!inst || inst.rank <= 0) return "not-learned";
  if (!hp.alive) return "dead";

  const st = world.status.get(caster);
  if (st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick)) return "stunned";
  // Combat-juice: a knocked-down (prone) caster is hard-CC'd like a stun.
  if ((world.knockdown.get(caster) ?? 0) > 0) return "stunned";
  // already mid-cast (another ability's cast time) — animation-locked
  if (ab.cast) return "cooldown";
  if (inst.cooldownRemainingTicks > 0) return "cooldown";

  const def = Abilities.get(inst.abilityId);
  // A passive-only ability (native Cool=0, no castable effects) can never be
  // activated. Reject BEFORE any cost is paid — the old shape charged mana and
  // a fabricated cooldown for a button WC3 does not even let you press.
  if (isPassiveOnly(def)) return "passive";
  const mana = def.manaCost[inst.rank - 1] ?? 0;
  if (hp.mana < mana) return "no-mana";

  // Still committed to the RECOVERY of a previous ability that WHIFFED. A
  // landed hit would already have cleared this on the tick it connected, so
  // reaching here means the last ability missed — this is the punish window
  // (abilities/abilityRecovery.ts).
  //
  // ORDER: every check above is a pure predicate that pays no cost, so their
  // relative order is purely a question of WHICH REASON IS REPORTED, never of
  // what is allowed. Recovery is placed LAST on purpose: when the button is
  // also on cooldown or you also lack the mana, those are the older, longer and
  // more actionable answers, and "recovery" would just be a confusing new name
  // for the same dead button. The case recovery exists to govern is a COMBO —
  // a DIFFERENT ability, off cooldown, mana in hand, right after the first one
  // — and that case reaches exactly this line.
  if ((ab.recovery?.ticksLeft ?? 0) > 0) return "recovery";

  // ---- resolve targeting ----
  let targets: EntityId[] = [];
  let point: { x: number; z: number } | undefined;
  let direction: { x: number; z: number } | undefined;
  const selfTeam = world.team.get(caster);

  switch (def.castType) {
    case "self":
      targets = [caster];
      break;
    case "targeted": {
      if (target.type !== "entity") return "bad-target";
      const tgt = world.transform.get(target.entityId);
      const tgtHp = world.health.get(target.entityId);
      if (!tgt || !tgtHp?.alive || tgt.zone !== t.zone) return "bad-target";
      if (def.targetsEnemies !== false) {
        const tgtTeam = world.team.get(target.entityId);
        if (tgtTeam && selfTeam && tgtTeam.teamId === selfTeam.teamId) return "bad-target";
      } else {
        // ally-targeted abilities (heals/restores/buffs) can never target a
        // neutral flower — nor an ENEMY. `targetsEnemies: false` used to only
        // *skip* the same-team check, so every ported WC3 「目標 friend」 spell
        // (6 docs, all heals) could be aimed at the enemy team and would happily
        // heal them. The WC3 target flags are exclusive; so is this.
        if (world.flower.has(target.entityId)) return "bad-target";
        const tgtTeam = world.team.get(target.entityId);
        if (tgtTeam && selfTeam && tgtTeam.teamId !== selfTeam.teamId) return "bad-target";
      }
      // combat-env `abilityRange` (task #136) shrinks the effective cast range
      const range = resolveAbilityRange(world, def.range);
      if (distSq(t.pos, tgt.pos) > range * range) return "out-of-range";
      targets = [target.entityId];
      point = { x: tgt.pos.x, z: tgt.pos.z };
      direction = normalize(sub(tgt.pos, t.pos));
      break;
    }
    case "skillshot": {
      if (target.type === "dir") direction = normalize(target.dir);
      else if (target.type === "point") direction = normalize(sub(target.point, t.pos));
      else return "bad-target";
      if (direction.x === 0 && direction.z === 0) return "bad-target";
      break;
    }
    case "ground": {
      if (target.type !== "point") return "bad-target";
      // clamp the point to range instead of rejecting (LoL behavior).
      // combat-env `abilityRange` (task #136) shrinks both the reach and the AoE.
      const off = clampLen(sub(target.point, t.pos), resolveAbilityRange(world, def.range));
      point = add(t.pos, off);
      // ground AoE: hit enemies in radius at the point. With a cast time this
      // set is RE-QUERIED when the wind-up elapses (CastResolveSystem).
      targets = enemiesInCircle(world, caster, point, resolveAbilityRadius(world, def.radius ?? 1));
      break;
    }
    case "dash": {
      if (target.type === "point") direction = normalize(sub(target.point, t.pos));
      else if (target.type === "dir") direction = normalize(target.dir);
      else return "bad-target";
      if (direction.x === 0 && direction.z === 0) return "bad-target";
      break;
    }
  }

  // ---- pay costs (mana + cooldown paid up-front, at cast-begin) ----
  hp.mana -= mana;
  const cdr = sc.final[Stat.CooldownReduction] ?? 0;
  // world.combatEnv.cooldown: global env factor on the cooldown SECONDS (2.0 =
  // twice as long). One seam covers Q/W/E/R and the EX slot alike.
  const cdSecs = (def.cooldown[inst.rank - 1] ?? 0) * (1 - cdr) * world.combatEnv.cooldown;
  inst.cooldownRemainingTicks = Math.round(cdSecs / world.dt);
  if (direction) t.facing = direction;

  recordAbilityCast(world, caster); // scoreboard: one successful cast (Q/W/E/R/EX)
  world.emit("abilityCast", { caster, slot, abilityId: inst.abilityId, point, direction });

  // ---- cast time: defer effects to CastResolveSystem when ct > 0 ----
  const ctTicks = Math.round((def.castTimeSec ?? 0) / world.dt);
  if (ctTicks > 0) {
    ab.cast = {
      slot,
      abilityId: inst.abilityId,
      rank: inst.rank,
      ticksLeft: ctTicks,
      targets,
      point,
      direction,
      rooted: def.rootWhileCasting !== false,
    };
    // stop any in-progress auto — the cast animation-locks the caster
    ab.windup = null;
    world.emit("castBegin", {
      caster,
      slot,
      abilityId: inst.abilityId,
      ticks: ctTicks,
      castTimeSec: def.castTimeSec ?? 0,
    });
    return "ok";
  }

  // ---- instant cast (ct = 0): run effects immediately ----
  runEffects(def.effects, {
    world,
    caster,
    rank: inst.rank,
    targets,
    point,
    direction,
    origin: `ability:${inst.abilityId}`,
    abilitySlot: slot,
    rng: world.rng,
  });

  fireHooks(world, caster, "onAbilityCast", targets[0], slot);
  for (const hitId of targets) {
    if (hitId !== caster) fireHooks(world, caster, "onAbilityHit", hitId, slot);
  }
  // RECOVERY starts at the END of startup. For an instant cast startup is zero
  // ticks long, so "end of startup" IS this moment. Effects above only QUEUED
  // their damage (combatResolveSystem drains it at step 8 of this same tick), so
  // the hit-cancel still lands on the same tick if it connects.
  armRecovery(world, caster, slot, def, targets);
  return "ok";
}

export function rankUpAbility(world: SimWorld, id: EntityId, slot: CoreAbilitySlot): boolean {
  const ab = world.abilities.get(id);
  const champ = world.champion.get(id);
  if (!ab || !champ || ab.unspentPoints <= 0) return false;
  const inst = ab.slots[slot];
  const def = Abilities.get(inst.abilityId);
  if (inst.rank >= def.maxRank) return false;
  // R gated to champion levels 6/11/16 — unless the host lifted the gate
  // (arena rules: R learnable from a configured round, world.ultGateOverride)
  if (slot === "R" && !world.ultGateOverride) {
    const gate = [6, 11, 16][inst.rank] ?? 99;
    if (champ.level < gate) return false;
  }
  inst.rank++;
  ab.unspentPoints--;
  // a permanent passive's columns are per LEVEL — re-attach at the new rank
  syncAbilityPassives(world, id);
  world.emit("rankUp", { id, slot, rank: inst.rank });
  return true;
}

/** Tick down cooldowns (called by commandSystem each tick). */
export function tickCooldowns(world: SimWorld): void {
  for (const [, ab] of world.abilities) {
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const inst = ab.slots[slot];
      if (inst.cooldownRemainingTicks > 0) inst.cooldownRemainingTicks--;
    }
    if (ab.exSlot && ab.exSlot.cooldownRemainingTicks > 0) ab.exSlot.cooldownRemainingTicks--;
    if (ab.basicAttackCdTicks > 0) ab.basicAttackCdTicks--;
  }
}

/**
 * Unlock a champion's "EX 技能" (rank 0 -> 1). No-op (returns false) for heroes
 * without an EX slot or one already unlocked. Emits `exUnlock` for the HUD toast
 * + a VFX cue. Called by the match host once the arena EX-unlock point is hit.
 */
export function learnEx(world: SimWorld, id: EntityId): boolean {
  const ab = world.abilities.get(id);
  if (!ab || !ab.exSlot || ab.exSlot.rank > 0) return false;
  ab.exSlot.rank = 1;
  // a passive EX (the native `Cool=0` family) becomes ACTIVE at unlock
  syncAbilityPassives(world, id);
  world.emit("exUnlock", { id, abilityId: ab.exSlot.abilityId });
  return true;
}
