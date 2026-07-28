/**
 * matchStats — the deterministic per-player match-scoreboard accumulator.
 *
 * These counters are part of the authoritative WORLD STATE (SimWorld.matchStats)
 * and fold into SimWorld.digest(), so two seeded runs of the same match produce
 * byte-identical scoreboards and the client's prediction replay never diverges
 * on them. Every increment here is a pure integer/float add driven by an EXISTING
 * sim event (damage resolve / death / heal / ability cast / projectile hit /
 * flower burst / gold+xp grant) — NO rng, NO trig, NO wall-clock (sim purity).
 *
 * Only entities that went through spawnChampion() get an entry (created there),
 * so neutral flowers, projectiles and hand-built test entities never accumulate;
 * the increment helpers `get()` the entry and no-op when it is absent.
 *
 * The rating layer (rating.ts) grades a finished scoreboard; this file only
 * COUNTS. Keep the two concerns separate.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";

/**
 * Per-player match scoreboard. All counters are monotonic within a match (they
 * only ever increase), reset only when a fresh champion entity spawns.
 *
 *  - damageDealt   : mitigated damage OUTPUT to enemy champions (post armor/MR,
 *                    PRE-shield — a fully-shielded blow still credits output).
 *  - damageTaken   : HP actually lost (post-shield) from all sources.
 *  - damageBlocked : damage neutralised on this player — armor/MR mitigation +
 *                    shield absorption ("blocked/mitigated").
 *  - healingDone   : HP restored by this player's heal effects + its lifesteal
 *                    (passive regen and flower bursts are excluded — the latter
 *                    is captured by flowersEaten).
 *  - ccAppliedTicks: total tick-seconds of hard/soft CC (stun/root/slow) this
 *                    player applied to ENEMY champions (counted at apply time).
 *  - abilityCasts  : successful ability casts (Q/W/E/R/EX).
 *  - abilityHits   : ability SKILLSHOT projectiles that struck an enemy champion.
 *  - abilityWhiffs : ability skillshot projectiles that expired hitting nobody.
 *                    accuracy := hits / (hits + whiffs); non-skillshot champions
 *                    (melee / point-and-click) grade neutral (see rating.ts).
 *  - basicAttackHits: basic-attack connections on an enemy champion.
 *  - flowersEaten  : healing flowers this player got the killing blow on.
 *  - timeAliveTicks: ticks spent alive DURING COMBAT (world.combatActive gate).
 *  - killParticipation: enemy champion deaths this player got a kill OR assist on.
 *  - largestSingleHit : biggest single-packet damage output.
 *  - multikills    : kills that landed inside the multikill window of the prior
 *                    kill (a double counts 1, a triple 2, …).
 *  - revivesPerformed: teammates this player channelled back up out of a revive
 *                    circle (task #84). A rescue is a teammate-support action,
 *                    so it scores on its OWN line — reviving deliberately does
 *                    NOT erase the death or the enemy's kill.
 *  - revivesReceived : times this player was channelled back up by a teammate.
 *  - coinsCollected  : 陣亡投幣 coins picked off the floor (task #191). Its own
 *                    line rather than `goldEarned`, because that coin's 100 gold
 *                    was already counted as earned when the thrower first got
 *                    it; folding it in again would let two players pump the
 *                    settlement rating by 1000 a round for money that never
 *                    entered the economy.
 */
export interface PlayerMatchStats {
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  damageBlocked: number;
  healingDone: number;
  ccAppliedTicks: number;
  goldEarned: number;
  xp: number;
  abilityCasts: number;
  abilityHits: number;
  abilityWhiffs: number;
  basicAttackHits: number;
  flowersEaten: number;
  timeAliveTicks: number;
  killParticipation: number;
  largestSingleHit: number;
  multikills: number;
  revivesPerformed: number;
  revivesReceived: number;
  coinsCollected: number;
}

/** Assist credit window: an enemy that damaged the victim within this many ticks
 *  before its death (and is not the killer) earns an assist. 10s @30Hz. */
export const ASSIST_WINDOW_TICKS = 300;
/** Kills within this many ticks of the previous one chain into a multikill. */
export const MULTIKILL_WINDOW_TICKS = 300;

/** A fresh zeroed scoreboard. */
export function createMatchStats(): PlayerMatchStats {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 0,
    damageTaken: 0,
    damageBlocked: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    goldEarned: 0,
    xp: 0,
    abilityCasts: 0,
    abilityHits: 0,
    abilityWhiffs: 0,
    basicAttackHits: 0,
    flowersEaten: 0,
    timeAliveTicks: 0,
    killParticipation: 0,
    largestSingleHit: 0,
    multikills: 0,
    revivesPerformed: 0,
    revivesReceived: 0,
    coinsCollected: 0,
  };
}

/** Read a scoreboard, or a zeroed one if the entity never spawned as a champion. */
export function getMatchStats(world: SimWorld, id: EntityId): PlayerMatchStats {
  return world.matchStats.get(id) ?? createMatchStats();
}

/**
 * Record one resolved damage packet (called from combatResolveSystem AFTER
 * mitigation + shields). `output` = mitigated pre-shield force credited to the
 * attacker; `hpLoss` = HP the victim actually lost; `blocked` = mitigated +
 * shield-absorbed. Only champion↔champion counts; the enemy attacker is logged
 * for assist attribution.
 */
export function recordDamage(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  output: number,
  hpLoss: number,
  blocked: number,
  origin: string,
): void {
  const srcChamp = world.champion.has(source);
  const tgtChamp = world.champion.has(target);

  // 殭屍王傷害帳本 (task #262). BEFORE the early return below, because the king
  // is a NEUTRAL and that return is exactly what drops every packet aimed at
  // one. `output` (post-mitigation, pre-shield) is used rather than the hp
  // actually lost so the ledger measures the same thing `damageDealt` does.
  //
  // ⚠️ CONSEQUENCE, PINNED BY TEST, NOT YET RULED ON BY THE OWNER: `output` is
  // NOT capped at the king's remaining hp (`mitigate()` clamps only a
  // STRUCTURE's per-packet cap), so a finisher's OVERKILL counts in full. A
  // 4,000-damage ult on a king with 100 hp left weighs 4,000 — before the ×2
  // last-hit multiplier — and takes almost the whole pool. Whether that is
  // 「補最後一刀的人獎金翻倍」 working as intended or a burst-steal to be capped
  // at `hpLoss` is a DESIGN call; the current behaviour is guarded in
  // mobs.boss.test.ts so it cannot drift silently either way.
  //
  // Gated on the mob's KIND, not on the ledger's existence, so an ordinary
  // zombie never allocates a map and a world with no king is untouched.
  if (srcChamp && world.mob.get(target)?.kind === "boss" && output > 0) {
    let ledger = world.bossDamage.get(target);
    if (!ledger) {
      ledger = new Map<EntityId, number>();
      world.bossDamage.set(target, ledger);
    }
    ledger.set(source, (ledger.get(source) ?? 0) + output);
  }

  if (!tgtChamp) return; // damage to flowers / neutrals never scores

  if (srcChamp && source !== target) {
    const src = world.matchStats.get(source);
    if (src) {
      src.damageDealt += output;
      if (output > src.largestSingleHit) src.largestSingleHit = output;
      if (origin === "basic") src.basicAttackHits += 1;
    }
    // assist bookkeeping: log the last tick an ENEMY champion hurt this victim
    const st = world.team.get(source);
    const tt = world.team.get(target);
    if (st && tt && st.teamId !== tt.teamId) {
      let m = world.recentDamagers.get(target);
      if (!m) {
        m = new Map<EntityId, number>();
        world.recentDamagers.set(target, m);
      }
      m.set(source, world.tick);
    }
  }

  const tgt = world.matchStats.get(target);
  if (tgt) {
    tgt.damageTaken += hpLoss;
    tgt.damageBlocked += blocked;
  }
}

/** Record HP healed by `healer` (heal effect or lifesteal). */
export function recordHealing(world: SimWorld, healer: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(healer);
  if (s && world.champion.has(healer)) s.healingDone += amount;
}

/** Record CC ticks `caster` applied to an ENEMY champion `target`. */
export function recordCc(world: SimWorld, caster: EntityId, target: EntityId, ticks: number): void {
  if (ticks <= 0) return;
  if (!world.champion.has(caster) || !world.champion.has(target)) return;
  const ct = world.team.get(caster);
  const tt = world.team.get(target);
  if (ct && tt && ct.teamId === tt.teamId) return; // no credit for self/ally CC
  const s = world.matchStats.get(caster);
  if (s) s.ccAppliedTicks += ticks;
}

/** Record a successful ability cast. */
export function recordAbilityCast(world: SimWorld, caster: EntityId): void {
  const s = world.matchStats.get(caster);
  if (s) s.abilityCasts += 1;
}

/** Record an ability skillshot connecting with an enemy champion. */
export function recordAbilityHit(world: SimWorld, owner: EntityId, target: EntityId): void {
  if (!world.champion.has(target)) return;
  const s = world.matchStats.get(owner);
  if (s) s.abilityHits += 1;
}

/** Record an ability skillshot that expired without hitting anyone. */
export function recordAbilityWhiff(world: SimWorld, owner: EntityId): void {
  const s = world.matchStats.get(owner);
  if (s) s.abilityWhiffs += 1;
}

/** Record a healing flower whose killing blow belongs to `killer`. */
export function recordFlowerEaten(world: SimWorld, killer: EntityId): void {
  const s = world.matchStats.get(killer);
  if (s && world.champion.has(killer)) s.flowersEaten += 1;
}

/**
 * Record a completed revive-circle channel (task #84): credit the channeller
 * and the recipient on their own counters. History is NOT rewritten — by the
 * time the circle exists, DeathSystem has already booked the death, paid the
 * killer and fired the onKill hooks, and reversing any of that would corrupt
 * the 19 pre-existing counters and the S+..C- rating.
 */
export function recordRevive(world: SimWorld, channeller: EntityId, revived: EntityId): void {
  if (!world.champion.has(channeller) || !world.champion.has(revived)) return;
  const c = world.matchStats.get(channeller);
  if (c) c.revivesPerformed += 1;
  const r = world.matchStats.get(revived);
  if (r) r.revivesReceived += 1;
}

/** Record gold earned. */
export function recordGold(world: SimWorld, id: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(id);
  if (s) s.goldEarned += amount;
}

/** Record XP earned. */
export function recordXp(world: SimWorld, id: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(id);
  if (s) s.xp += amount;
}

/**
 * Record a champion death: victim death, killer kill + multikill streak, recent
 * enemy damagers as assists, and kill-participation for everyone credited. The
 * victim's recent-damager log is cleared (a fresh life starts clean).
 */
export function recordChampionDeath(
  world: SimWorld,
  victim: EntityId,
  killer: EntityId | null,
): void {
  const v = world.matchStats.get(victim);
  if (v) v.deaths += 1;

  const now = world.tick;
  if (killer !== null && world.champion.has(killer)) {
    const k = world.matchStats.get(killer);
    if (k) {
      k.kills += 1;
      k.killParticipation += 1;
      const tr = world.killTracking.get(killer) ?? { lastKillTick: -1, streak: 0 };
      tr.streak = tr.lastKillTick >= 0 && now - tr.lastKillTick <= MULTIKILL_WINDOW_TICKS ? tr.streak + 1 : 1;
      tr.lastKillTick = now;
      world.killTracking.set(killer, tr);
      if (tr.streak >= 2) k.multikills += 1;
    }
  }

  const dmgMap = world.recentDamagers.get(victim);
  if (dmgMap) {
    for (const [attacker, tick] of dmgMap) {
      if (attacker === killer) continue;
      if (now - tick > ASSIST_WINDOW_TICKS) continue;
      const a = world.matchStats.get(attacker);
      if (a) {
        a.assists += 1;
        a.killParticipation += 1;
      }
    }
    world.recentDamagers.delete(victim);
  }
}

/**
 * Accumulate time-alive for every champion currently alive. Gated on
 * world.combatActive so intermission/champ-select/settlement idle time does not
 * inflate the stat. Called once per tick from SimWorld.step().
 */
export function accumulateTimeAlive(world: SimWorld): void {
  if (!world.combatActive) return;
  for (const [id] of world.champion) {
    const hp = world.health.get(id);
    if (!hp?.alive) continue;
    const s = world.matchStats.get(id);
    if (s) s.timeAliveTicks += 1;
  }
}
