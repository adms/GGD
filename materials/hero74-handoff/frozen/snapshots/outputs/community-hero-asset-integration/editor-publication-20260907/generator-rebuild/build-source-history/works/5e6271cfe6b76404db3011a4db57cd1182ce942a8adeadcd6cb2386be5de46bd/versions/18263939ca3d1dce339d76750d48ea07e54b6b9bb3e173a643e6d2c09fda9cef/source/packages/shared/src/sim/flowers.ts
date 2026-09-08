/**
 * Healing flowers (LoL-Arena plants) — spawn/despawn helpers + the world-level
 * rules/bookkeeping the FlowerSystem runs on.
 *
 * Lifecycle contract:
 *  - Combat phase only. The match host calls `beginCombatFlowers` on combat
 *    entry (per-zone first-spawn schedule) and `endCombatFlowers` when combat
 *    ends (all flowers despawn silently, schedule cleared).
 *  - Spawn positions are DETERMINISTIC: sampled from `world.rng` inside the
 *    zone boundary, min FLOWER_CLEARANCE from obstacles and champion spawn
 *    points (reuses the arena collision helpers). No trig (sim purity).
 *  - `respawnSec` counts from the previous flower's DEATH (FlowerSystem sets
 *    the next spawn tick when a flower dies).
 *  - Flowers are NEUTRAL: no TeamComp/seat, so they can never count toward
 *    duel victory, team lives, placement, or alive-champion checks.
 */
import { moveFeelRules } from "./moveFeel";
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";
import { distSq } from "./math/vec2";
import { closestPointOnSegment } from "./collision/intersect";
import { pushOutOfObstacle, clampToBoundary } from "./collision/resolve";

/** Planar collision radius of a flower (matches content/models/prop.flower). */
export const FLOWER_RADIUS = 0.7;

/** EntityState.key / model doc id used for flowers on the wire. */
export const FLOWER_MODEL_KEY = "prop.flower";

// ⭐ 搬去 `sim/moveFeel.ts` 了（2026-09-01）—— 住 `config.combat-feel@1` 的 `moveFeel`。

/** Flower rules in TICKS (converted from the config doc's seconds). */
export interface FlowerRules {
  firstSpawnTicks: number;
  respawnTicks: number;
  maxAlivePerZone: number;
  hp: number;
  healPctMax: number;
  manaPctMax: number;
  burstRadius: number;
}

/** Seconds-based flower config (mirror of config.arena-rules@1 `flowers`). */
export interface FlowerConfigLike {
  firstSpawnSec: number;
  respawnSec: number;
  maxAlivePerZone: number;
  hp: number;
  healPctMax: number;
  manaPctMax: number;
  burstRadius: number;
}

/** Convert the seconds-based config block into tick-based sim rules. */
export function flowerRulesFromConfig(cfg: FlowerConfigLike, dt: number): FlowerRules {
  return {
    firstSpawnTicks: Math.max(1, Math.round(cfg.firstSpawnSec / dt)),
    respawnTicks: Math.max(1, Math.round(cfg.respawnSec / dt)),
    maxAlivePerZone: cfg.maxAlivePerZone,
    hp: cfg.hp,
    healPctMax: cfg.healPctMax,
    manaPctMax: cfg.manaPctMax,
    burstRadius: cfg.burstRadius,
  };
}

/** Alive flowers currently in `zone` (dead flowers are destroyed same-tick). */
export function flowersAliveInZone(world: SimWorld, zone: number): number {
  let n = 0;
  for (const [id, f] of world.flower) {
    if (f.zone !== zone) continue;
    const hp = world.health.get(id);
    if (hp?.alive) n++;
  }
  return n;
}

/** Squared distance from `p` to the nearest point of an obstacle's surface proxy. */
function clearOfObstacles(world: SimWorld, zone: number, p: Vec2, clearance: number): boolean {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  for (const ob of zoneDef.obstacles) {
    if (ob.kind === "circle") {
      const min = ob.radius + clearance;
      if (distSq(p, ob.center) < min * min) return false;
    } else if (ob.kind === "box") {
      // GH#324 —— 夾到盒面上的最近點；圓心在盒內時 dx/dz 都被夾住 ⇒ 距離 0 ⇒ 拒絕。
      const dx = p.x - ob.center.x;
      const dz = p.z - ob.center.z;
      const cx = dx < -ob.halfW ? -ob.halfW : dx > ob.halfW ? ob.halfW : dx;
      const cz = dz < -ob.halfD ? -ob.halfD : dz > ob.halfD ? ob.halfD : dz;
      const ox = dx - cx;
      const oz = dz - cz;
      if (ox * ox + oz * oz < clearance * clearance) return false;
    } else {
      const q = closestPointOnSegment(p, ob.a, ob.b);
      if (distSq(p, q) < clearance * clearance) return false;
    }
  }
  for (const side of zoneDef.spawns) {
    for (const s of side) {
      if (distSq(p, s) < clearance * clearance) return false;
    }
  }
  return true;
}

/**
 * Deterministic flower spawn position: rejection-sample `world.rng` offsets
 * inside the zone boundary (square → disc, NO trig) until the point clears
 * obstacles + spawn points by FLOWER_CLEARANCE. Bounded tries; the fallback
 * point is pushed out of obstacles + clamped so it is always valid terrain.
 */
export function pickFlowerSpawnPos(world: SimWorld, zone: number): Vec2 {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;

  // ⭐ GH#324 —— 這張圖如果**作者擺了 `pickup` 互動點**，花就開在那裡。
  //
  // ⚠️ 這不是新玩法，是把「作者精心擺的 6–10 個點」接上一個既有機制 ——
  // 在此之前引擎一個都不看，那些點只是資料（失敗形態②）。
  // ⚠️ 挑哪一個仍然走 `world.rng`（⛔ 不是「照順序」）—— 抽取次數與原本一樣是
  // 每次 spawn 一次，所以既有錄影的骰子序列不受影響。
  const anchors = (zoneDef.interactions ?? []).filter((i) => i.kind === "pickup");
  if (anchors.length > 0) {
    const pick = anchors[Math.min(anchors.length - 1, Math.floor(world.rng.range(0, anchors.length)))]!;
    return { x: pick.at.x, z: pick.at.z };
  }

  const maxR = Math.max(1, zoneDef.boundaryRadius - FLOWER_RADIUS - 1);
  for (let i = 0; i < 24; i++) {
    const dx = world.rng.range(-maxR, maxR);
    const dz = world.rng.range(-maxR, maxR);
    if (dx * dx + dz * dz > maxR * maxR) continue; // outside the disc — resample
    const p = { x: zoneDef.center.x + dx, z: zoneDef.center.z + dz };
    if (clearOfObstacles(world, zone, p, moveFeelRules(world).flowerClearance)) return p;
  }
  // fallback (dense obstacle layouts): mid-radius point, forced onto valid ground
  const body = {
    pos: { x: zoneDef.center.x, z: zoneDef.center.z + zoneDef.boundaryRadius * 0.5 },
    radius: FLOWER_RADIUS,
  };
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  return body.pos;
}

/**
 * Spawn a neutral flower entity: transform (radius FLOWER_RADIUS) + health
 * (no regen — flowers have no stats comp) + flower marker. NO TeamComp/nav.
 * Emits `flowerSpawn` {id, x, z}.
 */
export function spawnFlower(world: SimWorld, zone: number, pos: Vec2, hp: number): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: FLOWER_RADIUS,
    zone,
  });
  world.health.set(id, {
    hp,
    maxHp: hp,
    mana: 0,
    maxMana: 0,
    alive: true,
    shields: [],
  });
  world.flower.set(id, { zone });
  world.emit("flowerSpawn", { id, x: pos.x, z: pos.z });
  return id;
}

/**
 * Combat entry: arm the flower schedule. Clears any stale flowers, sets the
 * combat tick counter to 0 and schedules the first spawn in every duel zone.
 */
export function beginCombatFlowers(world: SimWorld, rules: FlowerRules, zones: readonly number[]): void {
  endCombatFlowers(world);
  world.flowerRules = rules;
  world.combatTicks = 0;
  for (const zone of zones) {
    world.flowerZones.add(zone);
    world.flowerNextSpawn.set(zone, rules.firstSpawnTicks);
  }
}

/**
 * Combat exit (round end / phase leave): despawn ALL flowers silently (no
 * burst) and disarm the schedule. Idempotent.
 */
export function endCombatFlowers(world: SimWorld): void {
  for (const id of [...world.flower.keys()]) world.destroy(id);
  world.flowerNextSpawn.clear();
  world.flowerZones.clear();
  world.combatTicks = -1;
}
