/**
 * 召喚物 — the summon lifecycle (GH#289 lane P2).
 *
 * This module owns the DATA side (placement, cap arithmetic, the body factory)
 * AND the per-tick lifecycle ({@link summonSystem}); the CONTENT-facing decision
 * surface is the `summon` member of `EffectDef` and its handler in
 * `effects/summon.ts`. It is built by copying the #215 mob blueprint:
 * `mobs.spawnUnitBody` places the body (the same four component writes the
 * zombies use — parameterised rather than copied, see its doc), the placement
 * table is `mobs.DIR_TABLE`, and the tick order rationale is `MobSystem`'s.
 *
 * ── WHAT A SUMMON IS, STRUCTURALLY ─────────────────────────────────────────
 *   Transform + Health + Navigation + TeamComp   ← `spawnUnitBody`, shared
 *   + StatsComp + AbilitiesComp + StatusComp     ← so it FIGHTS, see below
 *   + {@link SummonComp}                         ← owner / deadline / cap group
 *   NO MobComp, NO ChampionComp, NO MatchStats.
 *
 * The three ABSENCES are the design, not an oversight:
 *   · `mob`     — the #215 wave scheduler counts `world.mob` against
 *     `maxAlivePerZone` and pays `rewardGold` per kill out of that ledger, and
 *     its AI aims at 「the nearest CHAMPION」 with no team test at all, so a
 *     summon wearing a MobComp would both rewrite the roguelike economy and
 *     attack its own summoner.
 *   · `champion` — `deathSystem` pays kill gold + the once-per-victim kill
 *     BOUNTY to whoever kills anything `world.champion.has()`, so a
 *     champion-bodied summon is a gold printer; the scoreboard, duel
 *     resolution, team lives and placement all key off that same store too.
 *   · `matchStats` — a summon must never appear on the scoreboard.
 *
 * ── IT FIGHTS THROUGH THE SHIPPED SYSTEMS, NOT A SECOND AI ─────────────────
 * Giving it StatsComp + AbilitiesComp is what buys that: `basicAttackSystem`
 * iterates `world.abilities` (needing only `stats` + a `nav.attackTarget`), and
 * `orderSystem`'s chase pass iterates `world.nav` generically, so the walk and
 * the swing are the champions' own code paths. The ONE thing missing is target
 * ACQUISITION — `autoAcquirePass` iterates `world.champion` — and that is the
 * ~20 lines at the bottom of {@link summonSystem}, not a parallel AI.
 *
 * ── DETERMINISM (sim/purity.test.ts) ───────────────────────────────────────
 * Ring/line placement reads the authored {@link DIR_TABLE} literals — no trig.
 * `"scatter"` is the ONLY branch that draws, and it draws from `world.rng`
 * (never `Math.random`), so a replay reproduces the same layout. Every store
 * walk sorts ids ascending before acting. Deadlines are ABSOLUTE ticks
 * (`world.tick + N`), never countdowns.
 *
 * ── OFF BY DEFAULT ─────────────────────────────────────────────────────────
 * `world.summon.size === 0` — every world that never summoned, every unit test,
 * the client's prediction shadow — makes {@link summonSystem} a strict no-op and
 * the digest fold contributes nothing, so a pre-#289 world is byte-identical.
 */
import type { EntityId, SeatId, TeamId, ChampionId } from "../ids";
import { asSeatId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { SummonComp } from "./effects/summon";
import type { Vec2 } from "./math/vec2";
import { distSq, normalize, perp } from "./math/vec2";
import { DIR_TABLE, MONSTER_TEAM, spawnUnitBody } from "./mobs";
import { pushOutOfObstacle, clampToBoundary } from "./collision/resolve";
import { Champions } from "./content/registry";
import { summonBountyGold, type SummonTargetPriority } from "./summonRules";
import { grantGold } from "./economy/progression";
import { zeroStats } from "./stats/statTypes";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import type { StatModifier } from "./stats/modifiers";
import { recomputeStats } from "./stats/statPipeline";

/**
 * 上限 when the content authors none.
 *
 * 8 is the largest single WC3 summon volley in the 52 「召喚代理」 census
 * (91-002 亡靈大軍's ring of 8 ghouls; 96-04 獨孤九劍's 9 sword spirits and
 * 37-02 黑核晶's 7 crystals bracket it), so an un-authored ability can still
 * express the biggest shipped shape while a typo'd `count: 200` cannot fill the
 * arena. It is a DEFAULT, not a ceiling — `maxAlive` overrides it per ability.
 */
export const DEFAULT_SUMMON_CAP = 8;

/** Ring radius / line spacing / scatter radius when the content authors none (GGD units). */
export const DEFAULT_SUMMON_SPREAD = 2;

/** How a summon left the field — the `reason` on the `summonDespawn` event. */
export type SummonDespawnReason = "expired" | "death" | "ownerDead" | "capEvicted";

/** Everything {@link spawnSummon} needs; assembled by the `summon` effect handler. */
export interface SummonSpawnSpec {
  /** the summoner */
  ownerId: EntityId;
  /** which champion doc supplies the body's sheet + mesh */
  championId: ChampionId;
  /** hero level the sheet is read at */
  level: number;
  zone: number;
  pos: Vec2;
  teamId: TeamId;
  seatId: SeatId;
  /** ABSOLUTE despawn tick; `Number.POSITIVE_INFINITY` = permanent */
  expiresAtTick: number;
  /** cap-group key (see {@link SummonComp.capKey}) */
  capKey: string;
  onOwnerDeath: "despawn" | "persist";
  /** ×the champion's own maxHealth */
  hpMult: number;
  /** ×the champion's own attack damage */
  damageMult: number;
  /** provenance for the stat source id, e.g. "ability:sela.r" */
  origin: string;

  /* ── 誰打得到它 — carried UNRESOLVED (see sim/summonRules.ts) ───────────── */
  /** 敵方自動索敵看不看得見它; undefined = the resolver's default */
  autoTargetable?: boolean;
  /** 索敵比較器的第一鍵; undefined = the resolver's default */
  targetPriority?: SummonTargetPriority;
  /** #215 小怪咬不咬它; undefined = the resolver's default */
  mobTargetable?: boolean;
  /** 玩家點不點得到它; undefined = the resolver's default */
  manualTargetable?: boolean;
  /** 火圈燒不燒它; undefined = the resolver's default */
  burnsInFireRing?: boolean;
  /** 擊殺賞金; undefined = the resolver's default */
  bountyGold?: number;
}

/**
 * Body radius for a summon. Deliberately the same 0.6 `spawnChampion` gives a
 * hero: the body IS a hero doc, and a different number here would make the same
 * mesh collide and reach differently depending on who spawned it.
 */
const SUMMON_RADIUS = 0.6;

/**
 * Place one body and register it as a summon. Returns the new entity id.
 *
 * The hp/mana are NOT written here beyond the pipeline's own fill: `stats` is
 * seeded `dirty` with `zeroStats()` and {@link recomputeStats} then computes the
 * champion's real maxima and tops the body off — the identical two-step
 * `spawnChampion` uses, so a summon of hero X and hero X himself can never
 * disagree about what X's level-N health is.
 */
export function spawnSummon(world: SimWorld, spec: SummonSpawnSpec): EntityId {
  const id = spawnUnitBody(world, {
    zone: spec.zone,
    pos: spec.pos,
    radius: SUMMON_RADIUS,
    maxHp: 0, // filled by the recompute below (prev.maxHealth === 0 → top off)
    teamId: spec.teamId,
    seatId: spec.seatId,
  });
  world.status.set(id, { effects: [] });

  const def = Champions.get(spec.championId);
  // ABILITY SLOTS AT RANK 0. The slots exist because `basicAttackSystem`
  // iterates `world.abilities` — no AbilitiesComp, no swing — but every rank is
  // 0 so nothing here is castable. A summon has no seat, and `commandSystem`
  // only ever casts from a seat's IntentFrame, so this is belt AND braces.
  world.abilities.set(id, {
    slots: {
      Q: { abilityId: def.abilities.Q.id, rank: 0, cooldownRemainingTicks: 0 },
      W: { abilityId: def.abilities.W.id, rank: 0, cooldownRemainingTicks: 0 },
      E: { abilityId: def.abilities.E.id, rank: 0, cooldownRemainingTicks: 0 },
      R: { abilityId: def.abilities.R.id, rank: 0, cooldownRemainingTicks: 0 },
    },
    exSlot: null,
    passiveSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });

  // 生命 / 傷害倍率 — expressed as ordinary modifiers so the ONE stat pipeline
  // computes them. A hand-multiplied `maxHp` would be a second arithmetic that
  // the HUD, the codex and `finalizeStat`'s clamps never see (#125 顯示值 ==
  // 實際值). Attached only when it would change something, so the common
  // 1.0/1.0 summon has exactly the champion's own sheet and no extra source for
  // `recomputeStats` to walk.
  const mods: StatModifier[] = [];
  if (spec.hpMult !== 1) {
    mods.push({ stat: Stat.MaxHealth, op: ModOp.PercentMult, value: spec.hpMult - 1 });
  }
  if (spec.damageMult !== 1) {
    mods.push({ stat: Stat.AttackDamage, op: ModOp.PercentMult, value: spec.damageMult - 1 });
  }
  world.stats.set(id, {
    championId: spec.championId,
    final: zeroStats(),
    dirty: true,
    sources: mods.length > 0 ? [{ id: `summon:${spec.origin}`, kind: "passive", modifiers: mods }] : [],
  });

  world.summon.set(id, {
    ownerId: spec.ownerId,
    expiresAtTick: spec.expiresAtTick,
    spawnTick: world.tick,
    capKey: spec.capKey,
    onOwnerDeath: spec.onOwnerDeath,
    level: spec.level,
    // 誰打得到它 — copied through as authored, `undefined` included. The
    // resolvers in sim/summonRules.ts own every default, so a body spawned here
    // and a `SummonComp` written by hand answer the same question identically.
    autoTargetable: spec.autoTargetable,
    targetPriority: spec.targetPriority,
    mobTargetable: spec.mobTargetable,
    manualTargetable: spec.manualTargetable,
    burnsInFireRing: spec.burnsInFireRing,
    bountyGold: spec.bountyGold,
  });

  // AFTER `world.summon.set`: `recomputeStats` reads the level off the
  // SummonComp (a summon has no ChampionComp — see stats/statPipeline.ts), so a
  // recompute before this line would silently read level 1.
  recomputeStats(world, id);
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp;
  hp.mana = hp.maxMana;

  world.emit("summonSpawn", {
    id,
    owner: spec.ownerId,
    championId: spec.championId,
    zone: spec.zone,
    x: spec.pos.x,
    z: spec.pos.z,
    maxHp: hp.maxHp,
    teamId: spec.teamId,
    expiresAtTick: spec.expiresAtTick === Number.POSITIVE_INFINITY ? -1 : spec.expiresAtTick,
  });
  return id;
}

/**
 * The LIVE bodies in one cap group, in ascending entity id.
 *
 * "Live" is `health.alive`: a corpse still in the store on the tick it died is
 * already scheduled for removal by {@link summonSystem} and must not hold a slot
 * hostage, or a hero whose swarm just wiped could not re-summon for one tick.
 */
export function summonsInGroup(world: SimWorld, ownerId: EntityId, capKey: string): EntityId[] {
  const out: EntityId[] = [];
  // Sorted: `world.summon` is a Map and its iteration order is insertion order.
  // Eviction picks a MINIMUM out of this list, so an unsorted walk would let two
  // hosts evict different bodies when two summons share a spawn tick.
  for (const id of [...world.summon.keys()].sort((a, b) => a - b)) {
    const sm = world.summon.get(id)!;
    if (sm.ownerId !== ownerId || sm.capKey !== capKey) continue;
    if (world.health.get(id)?.alive !== true) continue;
    out.push(id);
  }
  return out;
}

/**
 * The `i`-th of `count` spawn points around `anchor`.
 *
 * Pure function of (anchor, facing, i, count, formation, spread) except for
 * `"scatter"`, which draws two numbers from `world.rng` — the ONLY rng this
 * mechanic spends, and it is spent at CAST time (never per tick), so the shared
 * stream stays exactly where a summonless build leaves it for every other
 * formation. The point is then pushed out of obstacles and clamped into the
 * zone by the same two helpers `mobSpawnPos` uses, so a formation that reaches
 * through a pillar or past the rim still yields legal ground.
 */
export function summonSpawnPos(
  world: SimWorld,
  zone: number,
  anchor: Vec2,
  facing: Vec2,
  i: number,
  count: number,
  formation: "ring" | "line" | "scatter",
  spread: number,
): Vec2 {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  let p: Vec2;
  if (formation === "line") {
    // Perpendicular to the caster's facing, centred on the anchor: 37-03
    // 災難之牆 lays its 9 wall units across the line of approach, not along it.
    const n = normalize(facing);
    const side = perp(n.x === 0 && n.z === 0 ? { x: 1, z: 0 } : n);
    const offset = (i - (count - 1) / 2) * spread;
    p = { x: anchor.x + side.x * offset, z: anchor.z + side.z * offset };
  } else if (formation === "scatter") {
    const dir = DIR_TABLE[world.rng.int(DIR_TABLE.length)]!;
    // 0.35..1.0 of `spread` — never 0, or a "scatter" of N would stack N bodies
    // on the anchor whenever the draws came in low.
    const r = spread * (0.35 + 0.65 * world.rng.next());
    p = { x: anchor.x + dir.x * r, z: anchor.z + dir.z * r };
  } else {
    // RING: evenly spaced around the anchor, from the 12 authored unit vectors.
    // `floor(i * 12 / count)` spreads any count over the table without trig;
    // counts above 12 necessarily repeat a direction, and the collision push
    // below is what stops the duplicates from occupying the same point.
    const dir = DIR_TABLE[Math.floor((i * DIR_TABLE.length) / Math.max(1, count)) % DIR_TABLE.length]!;
    p = { x: anchor.x + dir.x * spread, z: anchor.z + dir.z * spread };
  }
  const body = { pos: p, radius: SUMMON_RADIUS };
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  return body.pos;
}

/**
 * Per-tick summon lifecycle — despawn, then acquire.
 *
 * ORDER INSIDE ONE BODY IS DELIBERATE: corpse → deadline → owner rule → aim. A
 * body that fails any of the first three leaves the field on THIS tick and is
 * never aimed, so a summon can neither swing on the tick it expires nor keep a
 * cap slot for one extra tick.
 *
 * STEP SLOT — right after `mobSystem` (9d′), i.e. after `deathSystem`. Same
 * rationale the guardian and the mob already use: this pass reads THIS tick's
 * settled alive-state (its own, and its owner's, including a revive that landed
 * this tick) before deciding anything, and the target it sets is consumed by
 * NEXT tick's `orderSystem` chase + `basicAttackSystem` swing — the identical
 * one-tick latency mobs and guardian volleys have, which is deterministic and
 * has never been visible in play.
 */
export function summonSystem(world: SimWorld): void {
  // STRICT no-op for every world that never summoned: no allocation, no
  // iteration, no rng — so a pre-feature world is byte-identical.
  if (world.summon.size === 0) return;

  const despawn = (id: EntityId, sm: SummonComp, reason: SummonDespawnReason): void => {
    // Emit BEFORE destroy: `world.destroy` drops the transform this event's
    // consumers (VFX, audio) would otherwise have to read afterwards.
    const t = world.transform.get(id);
    world.emit("summonDespawn", {
      id,
      owner: sm.ownerId,
      reason,
      x: t?.pos.x ?? 0,
      z: t?.pos.z ?? 0,
    });
    world.destroy(id);
  };

  // 擊殺賞金 — who landed the killing blow on WHAT, this tick.
  //
  // Read off `world.events` rather than re-derived: `deathSystem` (step 9) runs
  // BEFORE this pass (9d″) and already resolved 「誰打死的」 through the
  // killing-blow-vs-last-damager rule, so re-deriving it here would be a SECOND
  // credit rule that drifts from the first the day either one is touched. This
  // is the same seam `mobSystem` one slot up already reads.
  //
  // Built only when at least one summon carries a bounty: the common
  // `bountyGold` = 0 summon allocates nothing and walks no event list.
  //
  // DETERMINISM: the probe loop below reads `world.summon.values()` in Map
  // insertion order and is NOT sorted — deliberately. It only answers a
  // order-independent boolean (「does ANY live summon carry a bounty」), and the
  // map it then builds is a function of `world.events` alone, which is appended
  // in fixed system order. Which iteration trips the `break` changes nothing
  // that is read afterwards.
  let killerOf: Map<EntityId, EntityId> | null = null;
  for (const sm of world.summon.values()) {
    if (summonBountyGold(sm) <= 0) continue;
    killerOf = new Map<EntityId, EntityId>();
    for (const ev of world.events) {
      if (ev.type !== "death") continue;
      const killer = ev.data.killer as EntityId | null;
      if (killer === null || killer === undefined) continue;
      killerOf.set(ev.data.id as EntityId, killer);
    }
    break;
  }

  const ids = [...world.summon.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const sm = world.summon.get(id);
    if (sm === undefined) continue; // evicted earlier in this same pass

    // 1) THE BODY DIED. Removed on the death tick rather than left as a corpse:
    //    a summon has no revive circle and no 升天 dissolve (#220 is champion
    //    -only), so a lingering corpse is a permanent obstacle nobody can clear.
    const hp = world.health.get(id);
    if (hp === undefined || !hp.alive) {
      // 打死它給不給錢 — a DECISION POINT (sim/summonRules.ts), ABSENT = 0 =
      // today's behaviour = the WC3 reading (a summoned unit is not a
      // gold-bearing unit, which is what stops 召喚 spam being a gold farm).
      //
      // ONE `grantGold` call, not a second economy: `grantGold` is champion-
      // gated internally, so a summon killed by another summon, by a mob or by
      // the environment pays nobody without a second condition here.
      const bounty = summonBountyGold(sm);
      if (bounty > 0) {
        const killer = killerOf?.get(id);
        // No new EVENT is emitted for the payout: `grantGold` already calls
        // `recordGold`, so the scoreboard and the HUD's gold readout see it
        // through the SAME channel every other gold source uses. A bespoke
        // `summonBounty` event would need a fanout rule in another lane's file
        // to be anything but dead weight.
        // 打一般殭屍發放倍率 (owner 2026-08-04): the `mob` bucket is 「殺掉一個
        // 雜兵的賞金」, and a 召喚物 is exactly that shape — small, repeatable,
        // and there are several on the field at once. Not `hero` (killing
        // someone's summon is not killing them) and not `elite` (that row is
        // for the one-lump 特殊殭屍/殭屍王 payouts). Ships at 0 bounty by
        // default, so today this multiplies nothing; it is wired anyway so the
        // day an author turns a summon bounty on, it is already governed.
        if (killer !== undefined) grantGold(world, killer, bounty, "mob");
      }
      despawn(id, sm, "death");
      continue;
    }

    // 2) DEADLINE. ABSOLUTE tick, so a save/replay resumes on the same tick
    //    (a decrementing counter drifts — see CLAUDE.md's 硬性技術約束).
    //    A permanent summon stores +Infinity and never trips this.
    if (world.tick >= sm.expiresAtTick) {
      despawn(id, sm, "expired");
      continue;
    }

    // 3) 主人死了怎麼辦 — a DECISION POINT, so it rides the comp rather than
    //    being decided here. `"persist"` keeps fighting to its own deadline.
    if (sm.onOwnerDeath === "despawn") {
      const ohp = world.health.get(sm.ownerId);
      if (!world.transform.has(sm.ownerId) || ohp === undefined || !ohp.alive) {
        despawn(id, sm, "ownerDead");
        continue;
      }
    }

    // 4) AIM. `autoAcquirePass` is champion-only, so this is the summon's own
    //    acquisition: nearest living enemy in the same zone, ties broken by the
    //    lowest entity id (ascending walk + strict `<`), exactly like the mob
    //    AI. A target the seat could have chosen does not exist here — a summon
    //    takes no orders — so there is no `attackTargetAuto` ownership question.
    const nav = world.nav.get(id);
    const t = world.transform.get(id);
    const myTeam = world.team.get(id)?.teamId;
    if (nav === undefined || t === undefined || myTeam === undefined) continue;

    // Keep a live target: re-picking every tick would make the body oscillate
    // between two equidistant enemies and never close on either.
    const held = nav.attackTarget;
    if (held !== null) {
      const ht = world.transform.get(held);
      const hhp = world.health.get(held);
      if (ht !== undefined && hhp?.alive === true && ht.zone === t.zone) continue;
    }

    let best: EntityId | null = null;
    let bestD2 = Infinity;
    for (const eid of [...world.team.keys()].sort((a, b) => a - b)) {
      if (eid === id) continue;
      if (world.team.get(eid)!.teamId === myTeam) continue;
      const et = world.transform.get(eid);
      const ehp = world.health.get(eid);
      if (et === undefined || ehp?.alive !== true || et.zone !== t.zone) continue;
      const d2 = distSq(t.pos, et.pos);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = eid;
      }
    }
    nav.attackTarget = best;
    nav.attackTargetAuto = true;
  }
}

/**
 * The team a summon fights on. Exported so the handler and any future caller
 * resolve 歸屬 the same way — `"neutral"` is the SAME sentinel MONSTER team the
 * zombies use, which is what makes a hostile summon an enemy to all four player
 * teams with no new team id and no bespoke hostility table.
 */
export function summonTeam(
  world: SimWorld,
  ownerId: EntityId,
  mode: "owner" | "neutral",
): { teamId: TeamId; seatId: SeatId } {
  if (mode === "neutral") return { teamId: MONSTER_TEAM, seatId: asSeatId(-1) };
  const owner = world.team.get(ownerId);
  // seatId -1 even for an OWNED summon: the seat is what the snapshot turns
  // into a player nameplate and what every per-seat HUD panel keys off, and a
  // summon is not a player. Only `teamId` is load-bearing for friend/foe.
  return { teamId: owner?.teamId ?? MONSTER_TEAM, seatId: asSeatId(-1) };
}
