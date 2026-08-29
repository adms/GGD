/**
 * GuardianSystem — the NEUTRAL duel-zone GUARDIAN (守護塔 / 守護石碑, task #89).
 *
 * LoL-Arena's big plant, with the user's twist: one neutral objective stands at
 * each ACTIVE duel zone's centre; anyone may attack it; the LAST-HIT killer is
 * paid (full HP+MP, gold, and 鎮守之力). UNLIKE LoL's plant, while it is awake it
 * fires a telegraphed AoE "volley" at its top damagers — a punish that spreads a
 * scrum out and taxes whoever is doing the sieging.
 *
 * NEUTRALITY CONTRACT (copied from the flower). A guardian carries transform +
 * health + a StructureComp and NOTHING ELSE — no TeamComp, no seat, no nav, no
 * StatsComp, no ChampionComp, no matchStats entry. So teamAliveCount / teamHpPct
 * / duel resolution / team lives / placement / the scoreboard / AI team
 * perception are blind to it BY CONSTRUCTION (see FlowerComp's doc). It is in the
 * broad-phase grid (rebuildGrid inserts every transform that is not a revive
 * circle), so it is a legal target for every ability query, projectile sweep and
 * auto-attack.
 *
 * DETERMINISM. Everything here is a pure function of world state: no wall-clock,
 * no Math.random, no `world.rng` draws (mark selection breaks ties by ascending
 * entityId; queryOverlap already returns ascending ids). ALL scheduling is on
 * ABSOLUTE `world.tick`, never `world.combatTicks` (which only advances inside
 * flowerSystem — a flowerless config would freeze a combatTicks clock forever;
 * task #89 §0 decision 6 / engineering finding B3).
 *
 * OFF BY DEFAULT. `world.guardianRules === null` (the skeleton boot, unit tests,
 * the client's prediction shadow world) makes `guardianSystem` a strict no-op —
 * same convention as flowerRules / reviveRules. The match host arms it with
 * `beginCombatGuardians` on combat entry and `endCombatGuardians` on combat exit.
 *
 * MITIGATION lives in `combat/damage.ts`. A guardian has no `StatsComp`, so
 * `mitigate()` reads the `armor` / `magicResist` carried on this marker through
 * the same 100/(100+resist) curve champions use, then clamps the packet to
 * `maxHitPctMaxHp × maxHp` (§5.3 — post-mitigation and unconditional, so even a
 * `true`-damage nuke cannot delete the tower in one button). See
 * `mitigateStructure` there.
 *
 * SEAMS LEFT OPEN (deliberately not built here):
 *  · Per-arena identity 樹人 / 石頭人 / 巨獸人 (task #105): every guardian ships as
 *    the one neutral `prop.guardian` model; the 5 faces are #105's to pick from
 *    `spawnGuardian` by zone/arena.
 *  · The `vsStructure` siege scalar (§1.4): a `combat/damage.ts` seam that also
 *    needs new content fields (AbilityDef / ItemDef / ChampionDef).
 */
import type { EntityId } from "../../ids";
import { recordGuardianSlain } from "../stats/matchStats";
import type { SimWorld } from "../SimWorld";
import { grantGold } from "../economy/progression";
import { healTarget, restoreMana } from "../combat/restore";
import { queryOverlap } from "../collision/queries";
import { resolveAbilityRadius } from "../abilities/abilitySystem";
import type { DamageType } from "../effects/effect";

/**
 * EntityState.key / model doc id used for a guardian on the wire. The three
 * PER-ARENA faces (#105 — one mechanic, several identities): 石頭人 (stone,
 * the legacy default doc), 巨獸人 (beast), 樹人 (treant / nature). Each resolves
 * client-side through the SAME modelDocFor seam ChampionView / FlowerView use;
 * the .glb assets live under content/assets/models/guardians/.
 */
export const GUARDIAN_MODEL_KEY = "prop.guardian"; // 石頭人 (stone) — default/back-compat
export const GUARDIAN_MODEL_STONE = "prop.guardian";
export const GUARDIAN_MODEL_BEAST = "prop.guardian.beast"; // 巨獸人
export const GUARDIAN_MODEL_TREANT = "prop.guardian.treant"; // 樹人

/**
 * The guardian FACE for an arena (#105). A pure, total function of the arena id
 * so it is deterministic and needs no content field on the arena doc: the arena
 * picks WHICH identity stands at its duel-zone centre, but the MECHANIC is one.
 * Unknown / skeleton arenas fall back to the stone golem (the doc that already
 * shipped). Every one of the three faces appears on at least one shipped arena.
 */
export function guardianModelKeyForArena(arenaId: string): string {
  switch (arenaId) {
    case "arena.colosseum": // gladiator pit → 巨獸人
    case "arena.godie": // the EX boss map → 巨獸人
      return GUARDIAN_MODEL_BEAST;
    case "arena.dota": // forest lanes → 樹人
    case "arena.castle": // ruins reclaimed by nature → 樹人
      return GUARDIAN_MODEL_TREANT;
    case "arena.skeleton": // built-in → 石頭人
    default:
      return GUARDIAN_MODEL_STONE;
  }
}

/**
 * The structure marker + all of its per-round runtime state. Stored in
 * `world.structure`. All timing is ABSOLUTE `world.tick`.
 *
 * ⭐ GH#752 —— 這一格 Map 從此有**兩種住客**，用 {@link StructureComp.kind} 分辨：
 *   · `"guardian"`  —— task #89 的**中立**守護塔（本檔的 NEUTRALITY CONTRACT）
 *   · `"objective"` —— GH#752 的**陣營所屬**目標物（`systems/ObjectiveSystem.ts`）
 *
 * ⚠️ 共用載體是刻意的：`mitigateStructure` / 靜態碰撞 / `guardianDamage` /
 * digest 摺疊 / `destroy()` 清理 / 「目標是建築」條件葉 —— 這六件事已經對
 * `world.structure` 正確了，另開一個 Map 等於把每一件再寫第二遍。
 * ⛔ 但 `guardianSystem` 的每一圈都要問 `kind === "guardian"`：中立塔的威脅表、
 *    齊射、鎮守之力、付款**一格都不可以**掉到陣營塔身上。
 */
export interface StructureComp {
  /**
   * 哪一種建築。⛔ 刻意**沒有預設值**（必填）：一個「不填就是守護塔」的欄位
   * 會讓下一個新增建築的人靜靜地繼承整套中立塔行為（齊射、付款、鎮守之力），
   * 而 tsc 不會說話。
   */
  kind: "guardian" | "objective";
  /**
   * 擁有這座建築的隊伍。⭐ **只有 `kind: "objective"` 有**，中立守護塔恆為
   * `undefined`（NEUTRALITY CONTRACT）。
   * ⚠️ ⛔ 刻意**不**寫進 `world.team`：那一格會讓 `sim/revive.ts::teamAliveInZone`
   *    把一座塔數成一個活著的隊友。
   */
  teamId?: TeamId;
  /** duel zone; a structure only ever affects its own zone */
  zone: number;
  /** match round it was spawned in — drives HP + volley damage scaling */
  round: number;
  /**
   * PER-ARENA model doc id (#105) — 樹人 / 石頭人 / 巨獸人. Presentation only
   * (it is a pure function of the active arena via `guardianModelKeyForArena`),
   * so it is deliberately NOT folded into `SimWorld.digest()`. Emitted as
   * `EntityState.key` from snapshot so the client resolves the right .glb.
   */
  modelKey: string;

  // ---- mitigation knobs. Read by combat/damage.ts `mitigateStructure` (a
  //      guardian has no StatsComp, so these ARE its armor/MR). ----
  armor: number;
  magicResist: number;
  /** hard cap on a single POST-mitigation packet, as a fraction of maxHp (§5.3) */
  maxHitPctMaxHp: number;

  // ---- volley state (all ABSOLUTE world.tick) ----
  /** last tick it took damage (-1 = never touched this round) */
  lastDamagedTick: number;
  /** tick it woke (-1 while dormant) */
  wakeTick: number;
  /** tick the next volley fires (-1 while dormant) */
  nextVolleyTick: number;
  /** volleys fired since this wake — drives the ramp; reset on sleep */
  volleysFired: number;
  /** damage dealt to this structure since wake, per champion — the threat table */
  threat: Map<EntityId, number>;
  /** in-flight telegraphs; resolved when world.tick >= impactTick */
  marks: GuardianMark[];
}

/** One stamped, NON-TRACKING telegraph point (walking out of it is a decision). */
export interface GuardianMark {
  /** the guardian that stamped it (packet source at impact) */
  guardianId: EntityId;
  x: number;
  z: number;
  impactTick: number;
  /** resolved damage (volleyDamage(round) × ramp), frozen at stamp time */
  amount: number;
}

/**
 * The 鎮守之力 inherited-volley buff (task #89 §8.3). Flat, non-scaling, so it can
 * never compound with the winner's gold — it is the guardian's own pulse, at a
 * fraction of strength, on the bearer. Tracked in its own world map (not a stat
 * ModifierSource) because it changes NO stat: it only pulses.
 */
export interface GuardianBuff {
  /** absolute tick the buff ends */
  expiresAtTick: number;
  /** round the guardian was slain in — freezes the pulse's damage */
  round: number;
  /** absolute tick the next pulse fires */
  nextPulseTick: number;
}

/** Guardian rules in TICKS (converted from the config doc's seconds). */
export interface GuardianRules {
  hpBase: number;
  hpGrowthPerRound: number;
  armor: number;
  magicResist: number;
  radius: number;
  maxHitPctMaxHp: number;

  volleyPeriodTicks: number;
  volleyWindupTicks: number;
  volleyMarks: number;
  volleyRadius: number;
  volleyDamageBase: number;
  volleyDamageGrowthPerRound: number;
  volleyRampPct: number;
  volleyRampMax: number;
  dormancyTicks: number;

  rewardGold: number;
  restoreHpPct: number;
  restoreManaPct: number;
  buffDurationTicks: number;
  heirPulsePct: number;
  heirPulseRadius: number;
}

/** Seconds-based guardian config (mirror of config.arena-rules@1 `guardianTower`). */
export interface GuardianConfigLike {
  hpBase: number;
  hpGrowthPerRound: number;
  armor: number;
  magicResist: number;
  radius: number;
  maxHitPctMaxHp: number;
  volleyPeriodSec: number;
  volleyWindupSec: number;
  volleyMarks: number;
  volleyRadius: number;
  volleyDamageBase: number;
  volleyDamageGrowthPerRound: number;
  volleyRampPct: number;
  volleyRampMax: number;
  dormancySec: number;
  rewardGold: number;
  restoreHpPct: number;
  restoreManaPct: number;
  buffDurationSec: number;
  heirPulsePct: number;
  heirPulseRadius: number;
}

/** Convert the seconds-based config block into tick-based sim rules. */
export function guardianRulesFromConfig(cfg: GuardianConfigLike, dt: number): GuardianRules {
  const ticks = (sec: number): number => Math.max(1, Math.round(sec / dt));
  return {
    hpBase: cfg.hpBase,
    hpGrowthPerRound: cfg.hpGrowthPerRound,
    armor: cfg.armor,
    magicResist: cfg.magicResist,
    radius: cfg.radius,
    maxHitPctMaxHp: cfg.maxHitPctMaxHp,
    volleyPeriodTicks: ticks(cfg.volleyPeriodSec),
    volleyWindupTicks: ticks(cfg.volleyWindupSec),
    volleyMarks: cfg.volleyMarks,
    volleyRadius: cfg.volleyRadius,
    volleyDamageBase: cfg.volleyDamageBase,
    volleyDamageGrowthPerRound: cfg.volleyDamageGrowthPerRound,
    volleyRampPct: cfg.volleyRampPct,
    volleyRampMax: cfg.volleyRampMax,
    dormancyTicks: ticks(cfg.dormancySec),
    rewardGold: cfg.rewardGold,
    restoreHpPct: cfg.restoreHpPct,
    restoreManaPct: cfg.restoreManaPct,
    buffDurationTicks: ticks(cfg.buffDurationSec),
    heirPulsePct: cfg.heirPulsePct,
    heirPulseRadius: cfg.heirPulseRadius,
  };
}

/** HP for a guardian spawned in `round` (1-based). round<=0 treated as 1. */
export function guardianHp(rules: GuardianRules, round: number): number {
  const r = Math.max(1, round);
  return Math.round(rules.hpBase * (1 + rules.hpGrowthPerRound * (r - 1)));
}

/** Base volley damage (pre-ramp) for a guardian spawned in `round`. */
export function guardianVolleyDamage(rules: GuardianRules, round: number): number {
  const r = Math.max(1, round);
  return rules.volleyDamageBase * (1 + rules.volleyDamageGrowthPerRound * (r - 1));
}

/** Ramp multiplier for the n-th volley (1-based) since wake. */
export function guardianRamp(rules: GuardianRules, n: number): number {
  return Math.min(rules.volleyRampMax, 1 + rules.volleyRampPct * (n - 1));
}

/**
 * Spawn ONE neutral guardian at `zone.center`: transform (radius rules.radius) +
 * health (no regen — a structure has no stats comp) + StructureComp. NO
 * TeamComp / nav / stats / champion. Emits `guardianSpawn {id, zone, x, z, maxHp}`.
 */
export function spawnGuardian(
  world: SimWorld,
  zone: number,
  hp: number,
  rules: GuardianRules,
  round: number,
): EntityId {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  // ⭐ GH#324 —— 作者擺了 `capture` 互動點的話，守衛塔站在**第一個**上面。
  //
  // ⚠️ 取第一個（⛔ 不抽 rng）是刻意的：塔的位置是**地形設計**不是隨機事件，
  // 而且抽 rng 會多消耗一次骰子 → 之後每一次爆擊／閃避的序列位移 → 舊錄影全毀。
  // ⚠️ 沒有 `capture` 點的場地（既有 6 張）照樣站 `zone.center` —— 行為不變。
  const anchor = (zoneDef.interactions ?? []).find((i) => i.kind === "capture");
  const c = anchor === undefined ? zoneDef.center : anchor.at;
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: c.x, z: c.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: rules.radius,
    zone,
  });
  world.health.set(id, { hp, maxHp: hp, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.structure.set(id, {
    zone,
    round,
    modelKey: guardianModelKeyForArena(world.arena.id),
    armor: rules.armor,
    magicResist: rules.magicResist,
    maxHitPctMaxHp: rules.maxHitPctMaxHp,
    lastDamagedTick: -1,
    wakeTick: -1,
    nextVolleyTick: -1,
    volleysFired: 0,
    threat: new Map(),
    marks: [],
  });
  world.emit("guardianSpawn", { id, zone, x: c.x, z: c.z, maxHp: hp });
  return id;
}

/**
 * Combat entry: arm the guardian mechanic and spawn one guardian in every ACTIVE
 * duel zone (the host passes `this.pairings.map(p => p.zone)`). `round` scales HP
 * + volley damage. Idempotent (clears any stale guardians first).
 */
export function beginCombatGuardians(
  world: SimWorld,
  rules: GuardianRules,
  zones: readonly number[],
  round: number,
): void {
  endCombatGuardians(world);
  world.guardianRules = rules;
  const hp = guardianHp(rules, round);
  for (const zone of zones) spawnGuardian(world, zone, hp, rules, round);
}

/**
 * Combat exit (round end / phase leave): despawn EVERY guardian silently — no
 * payout, no burst, no corpse — and drop all inherited buffs. This is what stops
 * post-round farming (a 3v1 hostage cannot PvE the guardian for gold). Idempotent.
 */
export function endCombatGuardians(world: SimWorld): void {
  for (const id of [...world.structure.keys()]) world.destroy(id);
  world.guardianBuffs.clear();
  world.guardianRules = null;
}

/** Alive guardians currently in `zone`. */
export function guardiansAliveInZone(world: SimWorld, zone: number): number {
  let n = 0;
  for (const [id, sc] of world.structure) {
    if (sc.zone !== zone) continue;
    if (world.health.get(id)?.alive) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------

const GUARDIAN_DAMAGE_TYPE: DamageType = "physical";

/**
 * Advance every guardian one tick: ingest damage → threat/wake, sleep on
 * neglect, resolve due marks (queue packets), fire due volleys (stamp marks),
 * pulse + expire the inherited buff, and pay out for guardians that died THIS
 * tick. Runs at step slot 9d — AFTER deathSystem (9) so it sees this tick's
 * `death` events, and AFTER reviveSystem (9c) so the killer's final alive-state
 * is settled before payout.
 */
export function guardianSystem(world: SimWorld): void {
  const rules = world.guardianRules;
  if (!rules) return;
  const tick = world.tick;

  // 1) ingest this tick's damage events -> threat table + wake-on-first-damage.
  for (const ev of world.events) {
    if (ev.type !== "damage") continue;
    const sc = world.structure.get(ev.data.target as EntityId);
    if (!sc) continue;
    const src = ev.data.source as EntityId;
    const amount = ev.data.amount as number;
    // Only a CHAMPION's damage builds threat (a stray summon/DoT never marks a
    // bystander). The threat table is a cumulative total, so a single stray auto
    // can never out-rank a committed attacker (finding B7).
    if (amount > 0 && world.champion.has(src)) {
      sc.threat.set(src, (sc.threat.get(src) ?? 0) + amount);
    }
    sc.lastDamagedTick = tick;
    if (sc.wakeTick < 0) {
      sc.wakeTick = tick;
      sc.volleysFired = 0;
      sc.nextVolleyTick = tick + rules.volleyPeriodTicks;
      const t = world.transform.get(ev.data.target as EntityId);
      world.emit("guardianWake", { id: ev.data.target, x: t?.pos.x ?? 0, z: t?.pos.z ?? 0 });
    }
  }

  // 2) per-guardian: sleep, resolve due marks, fire a volley.
  for (const [id, sc] of world.structure) {
    const hp = world.health.get(id);
    if (!hp?.alive) continue; // dead guardians are handled in the payout pass (4)

    // sleep on neglect: threat cleared, ramp reset, no volleys.
    if (
      sc.wakeTick >= 0 &&
      sc.lastDamagedTick >= 0 &&
      tick - sc.lastDamagedTick >= rules.dormancyTicks
    ) {
      sc.wakeTick = -1;
      sc.nextVolleyTick = -1;
      sc.volleysFired = 0;
      sc.threat.clear();
      sc.marks.length = 0;
      world.emit("guardianSleep", { id });
    }

    // resolve due marks -> queue physical packets (drain at step 8 of T+1).
    if (sc.marks.length > 0) {
      const remaining: GuardianMark[] = [];
      // Scale the punish AoE by the combat-env `abilityRange` multiplier exactly
      // as player abilities are (resolveAbilityRadius, task #136) — the raw
      // rules.volleyRadius used to reach 1/abilityRange further than an
      // equivalently-nominal player AoE. The telegraph the client drew (#125)
      // carries this SAME scaled radius (see fireVolley), so the dodge circle and
      // the damage query agree.
      const volleyRadius = resolveAbilityRadius(world, rules.volleyRadius);
      for (const m of sc.marks) {
        if (tick >= m.impactTick) applyMark(world, sc, m, volleyRadius);
        else remaining.push(m);
      }
      sc.marks = remaining;
    }

    // fire a volley if awake and due (only if there is at least one damager).
    if (sc.wakeTick >= 0 && sc.nextVolleyTick >= 0 && tick >= sc.nextVolleyTick) {
      fireVolley(world, id, sc, rules, tick);
      sc.nextVolleyTick = tick + rules.volleyPeriodTicks;
    }
  }

  // 3) 鎮守之力 — pulse + expire the inherited-volley buff.
  for (const [bearer, buff] of [...world.guardianBuffs]) {
    if (tick >= buff.expiresAtTick) {
      world.guardianBuffs.delete(bearer);
      world.emit("guardianBuffExpire", { id: bearer });
      continue;
    }
    if (tick >= buff.nextPulseTick) {
      heirPulse(world, bearer, buff, rules);
      buff.nextPulseTick = tick + rules.volleyPeriodTicks;
    }
  }

  // 4) payout for guardians that DIED this tick (then despawn them).
  for (const ev of world.events) {
    if (ev.type !== "death") continue;
    const id = ev.data.id as EntityId;
    const sc = world.structure.get(id);
    if (!sc) continue;
    payout(world, id, sc, (ev.data.killer as EntityId | null) ?? null, rules, tick);
    world.destroy(id);
  }
}

/** Queue the AoE from a stamped mark against every alive champion in radius. */
function applyMark(world: SimWorld, sc: StructureComp, m: GuardianMark, radius: number): void {
  const hits = queryOverlap(
    world,
    { kind: "circle", center: { x: m.x, z: m.z }, radius },
    { zone: sc.zone, aliveOnly: true },
  );
  for (const cid of hits) {
    if (!world.champion.has(cid)) continue; // punish players only
    world.damageQueue.push({
      source: m.guardianId,
      target: cid,
      amount: m.amount,
      type: GUARDIAN_DAMAGE_TYPE,
      crit: false,
      origin: "guardian",
    });
  }
  world.emit("guardianImpact", { id: m.guardianId, x: m.x, z: m.z });
}

/** Select the top-N damagers and stamp a mark at each one's current position. */
function fireVolley(
  world: SimWorld,
  id: EntityId,
  sc: StructureComp,
  rules: GuardianRules,
  tick: number,
): void {
  // top-N by cumulative threat; ties break by ascending entityId (deterministic).
  const ranked = [...sc.threat.entries()]
    .filter(([cid]) => {
      const hp = world.health.get(cid);
      const t = world.transform.get(cid);
      return !!hp?.alive && !!t && t.zone === sc.zone && world.champion.has(cid);
    })
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : (a[0] as number) - (b[0] as number)))
    .slice(0, rules.volleyMarks);

  if (ranked.length === 0) return; // nobody to punish this window

  const n = sc.volleysFired + 1;
  const amount = guardianVolleyDamage(rules, sc.round) * guardianRamp(rules, n);
  sc.volleysFired = n;

  const targets: { entityId: EntityId; x: number; z: number }[] = [];
  for (const [cid] of ranked) {
    const t = world.transform.get(cid)!;
    sc.marks.push({
      guardianId: id,
      x: t.pos.x,
      z: t.pos.z,
      impactTick: tick + rules.volleyWindupTicks,
      amount,
    });
    targets.push({ entityId: cid, x: t.pos.x, z: t.pos.z });
  }
  world.emit("guardianMark", {
    id,
    targets,
    impactTick: tick + rules.volleyWindupTicks,
    amount,
    // The dodge-circle radius, POST abilityRange multiplier (#125/#136), so the
    // pre-land telegraph the client draws matches applyMark's damage query.
    radius: resolveAbilityRadius(world, rules.volleyRadius),
  });
}

/** 鎮守之力 pulse: flat physical to enemy champions around the bearer. */
function heirPulse(
  world: SimWorld,
  bearer: EntityId,
  buff: GuardianBuff,
  rules: GuardianRules,
): void {
  const bt = world.transform.get(bearer);
  const bhp = world.health.get(bearer);
  const bteam = world.team.get(bearer);
  if (!bt || !bhp?.alive || !bteam) return; // no pulse while dead / off-field
  const amount = rules.heirPulsePct * guardianVolleyDamage(rules, buff.round);
  // Same combat-env `abilityRange` scaling as the volley + player abilities.
  const heirRadius = resolveAbilityRadius(world, rules.heirPulseRadius);
  const hits = queryOverlap(
    world,
    { kind: "circle", center: { x: bt.pos.x, z: bt.pos.z }, radius: heirRadius },
    { zone: bt.zone, aliveOnly: true, exclude: new Set([bearer]) },
  );
  let struck = 0;
  for (const cid of hits) {
    if (!world.champion.has(cid)) continue;
    const cteam = world.team.get(cid);
    if (!cteam || cteam.teamId === bteam.teamId) continue; // enemies only
    world.damageQueue.push({
      source: bearer,
      target: cid,
      amount,
      type: GUARDIAN_DAMAGE_TYPE,
      crit: false,
      origin: "guardian-heir",
    });
    struck++;
  }
  if (struck > 0) world.emit("guardianHeirPulse", { id: bearer, x: bt.pos.x, z: bt.pos.z });
}

/**
 * Pay the last-hit killer: +gold, full HP+MP, and the 鎮守之力 buff. VOID (nothing
 * granted, guardian still despawns) if the killer is missing / not a champion /
 * dead at payout / in a different zone (§7.3 cases 2/3/4/7).
 */
function payout(
  world: SimWorld,
  id: EntityId,
  sc: StructureComp,
  killer: EntityId | null,
  rules: GuardianRules,
  tick: number,
): void {
  const t = world.transform.get(id);
  const x = t?.pos.x ?? 0;
  const z = t?.pos.z ?? 0;

  if (killer !== null && world.champion.has(killer)) {
    const khp = world.health.get(killer);
    const kt = world.transform.get(killer);
    const valid = !!khp?.alive && !!kt && kt.zone === sc.zone;
    if (valid) {
      // 完成任務發放倍率 (owner 2026-08-04). The tower is a 場上目標物, not a
      // farmed unit: one per zone per round, killed once, paid once — the same
      // shape as the 殭屍王 prize and nothing like the per-zombie stream. Named
      // here rather than left unscaled so 「金錢太浮濫」 cannot route around it.
      const paidGold = grantGold(world, killer, rules.rewardGold, "quest");
      // 滿 HP&MP — over-amounts clamp to max. score:false (not a healingDone stat).
      healTarget(world, {
        source: killer,
        target: killer,
        amount: khp!.maxHp * rules.restoreHpPct,
        origin: "guardian",
        score: false,
      });
      restoreMana(world, {
        source: killer,
        target: killer,
        amount: khp!.maxMana * rules.restoreManaPct,
        origin: "guardian",
      });
      world.guardianBuffs.set(killer, {
        expiresAtTick: tick + rules.buffDurationTicks,
        round: sc.round,
        nextPulseTick: tick + rules.volleyPeriodTicks,
      });
      // ⭐【結算頁看得見】GH#729 —— 尾刀記在**這一條**（真的付出去的）路上。
      // ⛔ 下面那個 void payout 分支不記：那一刀沒有人拿到金幣、HP/MP 或 buff，
      // 把它算成一次擊殺會讓結算的數字與玩家實際拿到的東西對不上。
      recordGuardianSlain(world, killer);
      world.emit("guardianSlain", {
        id,
        x,
        z,
        killerSeatId: world.team.get(killer)?.seatId ?? -1,
        // WHAT WAS PAID, not what was configured — this number is printed to
        // the player, so it has to be the one that entered the purse.
        gold: paidGold,
      });
      return;
    }
  }
  // void payout — the guardian still dies and despawns, nobody is paid.
  world.emit("guardianSlain", { id, x, z, killerSeatId: -1, gold: 0 });
}
