/**
 * ⭐【全視野】—— owner 2026-08-23：「理論上這個地圖是**全視野，就算牆後也看得到**」。
 *
 * ⚠️ **兩個方向一起讀**（失敗形態④）：只驗「牆後的敵人索敵拿得到」的話，一個把
 * `isAutoTargetable` 的 `canSee` 那一行也一起刪掉的實作會照樣全綠 —— 而那等於
 * **全視野把隱形也打開了**。隱形是技能機制（`sim/stealth.ts`），⛔ 不是視野規則
 * （`sim/vision.ts`），這一支就是釘住那條界線的東西。
 *
 * 夾具刻意是**真的一面牆**：先斷言 `hasLineOfSight` 對這兩點是 false，
 * ⛔ 不然「牆後」三個字只是變數名，而測試在證明一件沒有發生的事。
 *
 * 突變紀錄：`isAutoTargetable` 的 `canSee` 那一行刪掉 → 第二條紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import type { ArenaDef } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import { Stat, zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import type { AbilitiesComp } from "./stats/statsComp";
import { hasLineOfSight } from "./map/lineOfSight";
import { acquireTarget } from "./targeting";
import * as V from "./math/vec2";

/** 一面 20×2 的實心牆橫在 z=0，兩邊各站一個人。 */
const WALLED_ARENA: ArenaDef = {
  id: "arena.walled-probe",
  name: "牆",
  zones: [
    {
      id: "zone-0",
      center: { x: 0, z: 0 },
      boundaryRadius: 24,
      obstacles: [{ kind: "box", center: { x: 0, z: 0 }, halfW: 10, halfD: 1 }],
      spawns: [[{ x: 0, z: -6 }], [{ x: 0, z: 6 }]],
      bounds: { kind: "rect", halfW: 24, halfD: 24 },
    },
  ],
};

const ME = { x: 0, z: -6 };
const BEHIND_THE_WALL = { x: 0, z: 6 };
const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();

function spawnFighter(world: SimWorld, seat: number, team: number, pos: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 1e-9; // 站著不動:這一支量的是索敵,⛔ 不是誰走過去
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

describe("全視野（owner 2026-08-23）", () => {
  let world: SimWorld;
  let me: EntityId;
  let foe: EntityId;

  beforeEach(() => {
    world = new SimWorld(WALLED_ARENA, 1);
    me = spawnFighter(world, 0, 0, ME);
    foe = spawnFighter(world, 1, 1, BEHIND_THE_WALL);
    world.step(NO_INTENTS); // 空間索引是 step() 建的,⛔ 不是 spawn()
  });

  it("⭐ 夾具真的有一面牆擋在中間", () => {
    expect(hasLineOfSight(ME, BEHIND_THE_WALL, WALLED_ARENA.zones[0]!.obstacles)).toBe(false);
  });

  it("⭐ 牆後的敵人 —— 玩家的索敵拿得到它", () => {
    expect(acquireTarget(world, me, 24)?.id).toBe(foe);
  });

  it("⛔ 但**隱形**的敵人仍然拿不到 —— 全視野沒有把隱形一起打開", () => {
    world.stealth.set(foe, { fadeDelayTicks: 0, hiddenFromTick: 0 });
    expect(acquireTarget(world, me, 24)).toBeNull();
  });
});
