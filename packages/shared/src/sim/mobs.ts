/**
 * Roguelite mob waves (task #215 肉鴿小怪波 — 聖杯黑泥醬-喪標麥可 voxel-zombies).
 *
 * From ROUND 3 onward, voxel-zombie mobs stream in from the EDGES of every
 * active duel zone and escalate with combat time: a wave every 2 combat-seconds,
 * the wave at combat-second (2k-1) spawning min(k,10) mobs, capped at 30 alive
 * per battlefield. A mob walks to the nearest enemy champion and melee-attacks;
 * on death it pays the killer +20 gold + XP, and every 30th mob kill grants that
 * champion +1 LEVEL — the intended path past the round-grant L50 ceiling toward
 * the LV99 cap.
 *
 * This module owns the DATA side (rules, spawn helper, alive-count, the
 * deterministic edge-position table). The tick lifecycle lives in
 * `systems/MobSystem.ts`. It is built by copying the guardian/flower blueprint
 * verbatim and layering on the two new capabilities (see MobComp's doc):
 * movement (Navigation) and mutual hostility (the sentinel MONSTER team).
 *
 * NEUTRALITY / OFF-BY-DEFAULT. Like flowers/guardians/coins, the whole mechanic
 * is inert unless the host armed it: `world.mobRules === null` (skeleton boot,
 * unit tests, the client's prediction shadow world) keeps `world.mob` +
 * `world.mobKills` empty and `world.mobTicks = -1`, so a pre-feature world is
 * byte-identical down to the digest.
 *
 * DETERMINISM. The edge-spawn position is a PURE function of (zone, waveIndex k,
 * mobIndex i): a direction is chosen from a STATIC literal table by an integer
 * hash of those three ints (xor/mul/shift only), so it draws ZERO from
 * `world.rng` — the shared rng stream is left completely untouched (it can never
 * perturb crits / evasion / the legendary orb), exactly like the coin ring. No
 * trig (the direction table is authored numeric literals, not a `Math.cos`
 * loop), no `Math.pow`, no wall-clock — see `sim/purity.test.ts`.
 */
import type { EntityId, TeamId } from "../ids";
import { asSeatId, asTeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";
import { pushOutOfObstacle, clampToBoundary } from "./collision/resolve";

/**
 * EntityState.key / model doc id used for a mob on the wire — the low-poly
 * voxel-zombie standin. Resolved client-side through the SAME modelDocFor seam
 * ChampionView / FlowerView / GuardianView use; until the dedicated 喪標麥可
 * model ships it points at the champ.thorne standin. Presentation only, so it is
 * deliberately NOT folded into `SimWorld.digest()`.
 */
export const MOB_MODEL_KEY = "champ.thorne";

/**
 * The sentinel MONSTER team. A single id OUTSIDE the player range (teams are
 * 0..3, so this is well clear) that no champion is ever on — which is the whole
 * point: a mob on this team is `differentTeam` from EVERY champion, so it is an
 * enemy to all of them with no ChampionComp and no bespoke aggro table. Every
 * champion/team iteration that keys off `world.champion` (scoreboard, duel
 * resolution, team lives, placement) stays blind to a MONSTER-team entity by
 * construction, because a mob carries no ChampionComp.
 */
export const MONSTER_TEAM: TeamId = asTeamId(255);

/** Mob-wave rules in TICKS / squared-distances (converted from the config doc). */
export interface MobRules {
  /** 1-based round from which waves spawn (>= this round) */
  fromRound: number;
  /** mobTicks at which wave k=1 fires (round(firstWaveSec/dt)) */
  firstWaveTicks: number;
  /** ticks between waves (round(waveIntervalSec/dt)) */
  waveIntervalTicks: number;
  /** hard cap on mobs spawned per wave: count = min(k, mobsPerWaveCap) */
  mobsPerWaveCap: number;
  /** hard cap on mobs ALIVE per zone at once */
  maxAlivePerZone: number;

  /** mob hit points (no regen — a mob has no StatsComp) */
  maxHp: number;
  /** melee packet amount */
  attackDamage: number;
  /** SQUARED melee reach (compared against distSq — trig/pow-free) */
  attackRangeSq: number;
  /** melee cooldown in ticks (round(attackCdSec/dt)) */
  attackCdTicks: number;
  /** collision/body radius (drives the edge inset = boundaryRadius - radius) */
  radius: number;

  /** flat gold to the killer per mob kill */
  rewardGold: number;
  /** XP to the killer per mob kill */
  rewardXp: number;
  /** every Nth mob kill grants the killer +1 level */
  killsPerLevel: number;
}

/** Seconds-based mob-wave config (mirror of config.arena-rules@1 `mobWaves`). */
export interface MobWavesConfigLike {
  fromRound: number;
  firstWaveSec: number;
  waveIntervalSec: number;
  mobsPerWaveCap: number;
  maxAlivePerZone: number;
  mob: {
    maxHp: number;
    attackDamage: number;
    attackRange: number;
    attackCdSec: number;
    radius: number;
    modelKey?: string;
  };
  reward: {
    gold: number;
    xp: number;
    killsPerLevel: number;
  };
}

/**
 * Convert the seconds-based config block into tick-based sim rules. The
 * seconds→ticks conversion happens ONCE, here, at arm time — never per tick, so
 * no per-tick division can round differently on a different host.
 */
export function mobRulesFromConfig(cfg: MobWavesConfigLike, dt: number): MobRules {
  const ticks = (sec: number): number => Math.max(1, Math.round(sec / dt));
  return {
    fromRound: cfg.fromRound,
    firstWaveTicks: ticks(cfg.firstWaveSec),
    waveIntervalTicks: ticks(cfg.waveIntervalSec),
    mobsPerWaveCap: cfg.mobsPerWaveCap,
    maxAlivePerZone: cfg.maxAlivePerZone,
    maxHp: cfg.mob.maxHp,
    attackDamage: cfg.mob.attackDamage,
    attackRangeSq: cfg.mob.attackRange * cfg.mob.attackRange,
    attackCdTicks: ticks(cfg.mob.attackCdSec),
    radius: cfg.mob.radius,
    rewardGold: cfg.reward.gold,
    rewardXp: cfg.reward.xp,
    killsPerLevel: cfg.reward.killsPerLevel,
  };
}

/** Alive mobs currently in `zone` (dead mobs are destroyed same-tick). */
export function mobsAliveInZone(world: SimWorld, zone: number): number {
  let n = 0;
  for (const [id, m] of world.mob) {
    if (m.zone !== zone) continue;
    if (world.health.get(id)?.alive) n++;
  }
  return n;
}

/**
 * Twelve edge directions as unit offsets (30° apart). Authored numeric literals
 * rather than a `Math.cos` loop — `sim/purity.test.ts` bans trig in SOURCE, and
 * a lookup table is exactly how that ban is meant to be satisfied (same pattern
 * as the coin ring). The values are cos/sin at 0°,30°,…,330° to 7 digits.
 */
const DIR_TABLE: readonly Vec2[] = [
  { x: 1, z: 0 },
  { x: 0.8660254, z: 0.5 },
  { x: 0.5, z: 0.8660254 },
  { x: 0, z: 1 },
  { x: -0.5, z: 0.8660254 },
  { x: -0.8660254, z: 0.5 },
  { x: -1, z: 0 },
  { x: -0.8660254, z: -0.5 },
  { x: -0.5, z: -0.8660254 },
  { x: 0, z: -1 },
  { x: 0.5, z: -0.8660254 },
  { x: 0.8660254, z: -0.5 },
];

/**
 * Integer hash of three small ints → an unsigned 32-bit value, using only
 * xor / multiply / shift (FNV-1a style). NO floats, no trig, no `**`, so it is
 * byte-identical on every replica/replay and never touches `world.rng`. Used to
 * pick a stable edge DIRECTION per (zone, waveIndex, mobIndex).
 */
export function mixInt(a: number, b: number, c: number): number {
  let h = 0x811c9dc5;
  h = Math.imul(h ^ (a & 0xffff), 0x01000193);
  h = Math.imul(h ^ (b & 0xffff), 0x01000193);
  h = Math.imul(h ^ (c & 0xffff), 0x01000193);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Where the `i`-th mob of wave `k` spawns in `zone`: on the zone rim, in a
 * direction chosen deterministically from DIR_TABLE by `mixInt(zone, k, i)`.
 * Pure function of its three int inputs (no rng draw). The rim point is then
 * pushed out of obstacles and clamped into the zone (the same two helpers the
 * flower/coin spawns fall back to) so a direction that lands inside a wall or
 * outside the boundary still yields legal ground.
 */
export function mobSpawnPos(world: SimWorld, zone: number, k: number, i: number, radius: number): Vec2 {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  const dir = DIR_TABLE[mixInt(zone, k, i) % DIR_TABLE.length]!;
  // inset the rim by the body radius so the whole mob starts inside the boundary
  const inset = Math.max(0, zoneDef.boundaryRadius - radius);
  const body = {
    pos: { x: zoneDef.center.x + dir.x * inset, z: zoneDef.center.z + dir.z * inset },
    radius,
  };
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  return body.pos;
}

/**
 * Spawn ONE mob at the zone edge: Transform (radius rules.radius) + Health (no
 * regen — a mob has no StatsComp) + MobComp + Navigation (empty; MovementSystem
 * walks it at BASE_MOVE_SPEED) + TeamComp on the sentinel MONSTER team. NO
 * ChampionComp / seat / StatsComp / AbilitiesComp. Emits
 * `mobSpawn {id, zone, x, z, maxHp}`.
 */
export function spawnMob(world: SimWorld, zone: number, rules: MobRules, k: number, i: number): EntityId {
  const pos = mobSpawnPos(world, zone, k, i, rules.radius);
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: rules.radius,
    zone,
  });
  world.health.set(id, {
    hp: rules.maxHp,
    maxHp: rules.maxHp,
    mana: 0,
    maxMana: 0,
    alive: true,
    shields: [],
  });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  // seatId -1: a mob belongs to no player seat — the same "no seat" sentinel the
  // snapshot emits for every neutral entity. Only `teamId` is load-bearing.
  world.team.set(id, { teamId: MONSTER_TEAM, seatId: asSeatId(-1) });
  world.mob.set(id, {
    zone,
    team: MONSTER_TEAM,
    target: -1,
    attackCdTicks: 0,
    spawnTick: world.mobTicks,
  });
  world.emit("mobSpawn", { id, zone, x: pos.x, z: pos.z, maxHp: rules.maxHp });
  return id;
}
