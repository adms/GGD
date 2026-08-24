/**
 * 互卡脫困保險絲 (GH#677) —— 「被單位的身體堵死超過 N 秒一定走得出來」的守衛。
 *
 * 三條線,全部跑**真的** `SimWorld.step`(出貨 `DEFAULT_COMBAT_FEEL`,零 mock):
 *   ① 兩位隊友迎面互頂(教科書互卡):前 2 秒真的動不了(前提自證),
 *      保險絲跳了之後**穿過對方**走到對面 —— 斷言的是實際座標,不是旗標。
 *   ② 卡在柱子上(純牆,旁邊沒有任何單位):保險絲**不觸發**(overlap 閘),
 *      而且從頭到尾**沒有進過柱子** —— 牆的豁免一格都沒發出去。
 *   ③ 被硬控(stun)夾在兩位隊友中間:被控的那一位**不觸發**(CC 不算黏住)。
 *
 * 突變(commit 訊息記錄):拿掉 `MovementSystem` 分離 pass 的 phasing 跳過那行
 * ⇒ ① 紅(等了 2 秒之後仍然穿不過去)。
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId, type StatusId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import type { AbilitiesComp } from "./stats/statsComp";
import type { IntentFrame, Order } from "./intents";
import { DEFAULT_COMBAT_FEEL } from "./combatFeel";
import * as V from "./math/vec2";

/** zone 0:圓心 (-40,0)、r24;柱子在 (-49,8) 與 (-31,-8)(r1.8)。 */
const PILLAR = { x: -49, z: 8 };
const NO_INTENTS = new Map<SeatId, IntentFrame>();

function spawnChampion(world: SimWorld, seat: number, team: number, pos: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 500000, maxHp: 500000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 5.8;
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 1;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.champion.set(id, {
    championId: "probe" as ChampionId, level: 1, xp: 0, gold: 0, items: [], augments: [],
    statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0, pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

function makeWorld(): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, 20260824);
  world.combatActive = true;
  world.combatFeel = DEFAULT_COMBAT_FEEL; // 出貨那一份 —— 保險絲預設開、N=2
  return world;
}

function moveTo(x: number, z: number): Order {
  return { kind: "move", point: { x, z } };
}

/** 跑 `ticks` 個 tick;第 0 tick 送一次滑鼠點擊式的移動指令。回傳誰冒過「脫困」。 */
function run(world: SimWorld, ticks: number, orders: ReadonlyMap<number, Order>): Set<EntityId> {
  const escaped = new Set<EntityId>();
  for (let i = 0; i < ticks; i++) {
    const m = new Map<SeatId, IntentFrame>();
    if (i === 0) for (const [seat, order] of orders) m.set(asSeatId(seat), { order, commands: [] });
    world.step(i === 0 ? m : NO_INTENTS);
    for (const e of world.events) {
      const d = e.data as { text?: string; caster?: EntityId };
      if (e.type === "floatingText" && d.text === "脫困" && d.caster !== undefined) escaped.add(d.caster);
    }
  }
  return escaped;
}

describe("stuck escape fuse (GH#677)", () => {
  it("兩位隊友迎面互卡 2 秒之後,保險絲放行,雙方穿過彼此走到對面", () => {
    const world = makeWorld();
    const a = spawnChampion(world, 0, 0, { x: -44, z: -6 });
    const b = spawnChampion(world, 1, 0, { x: -42.8, z: -6 });
    const orders = new Map<number, Order>([
      [0, moveTo(-38, -6)], // A 的終點在 B 的另一邊
      [1, moveTo(-48, -6)], // B 的終點在 A 的另一邊
    ]);
    // 前提自證:2 秒(60 tick)內兩人都被對方頂死在原地 —— 這個互卡是真的。
    const escapedEarly = run(world, 60, orders);
    const aMid = world.transform.get(a)!.pos.x;
    const bMid = world.transform.get(b)!.pos.x;
    expect(Math.abs(aMid - -44)).toBeLessThan(1.5);
    expect(Math.abs(bMid - -42.8)).toBeLessThan(1.5);
    expect(escapedEarly.size).toBe(0); // 門檻是 2 秒,60 tick 內不可以提早跳
    // 再跑 90 tick:觸發(≈ tick 67)+ 放行窗 1 秒 —— 兩人都該穿過對方。
    const escaped = run(world, 90, new Map());
    expect(escaped.has(a)).toBe(true);
    expect(escaped.has(b)).toBe(true);
    // 斷言實際座標:A 走到 B 的出發點右邊、B 走到 A 的出發點左邊 = 真的穿過去了。
    expect(world.transform.get(a)!.pos.x).toBeGreaterThan(-42.8);
    expect(world.transform.get(b)!.pos.x).toBeLessThan(-44);
  });

  it("卡在純柱子上:保險絲不觸發(旁邊沒有單位),而且永遠沒有穿進柱子", () => {
    const world = makeWorld();
    const a = spawnChampion(world, 0, 0, { x: PILLAR.x, z: PILLAR.z - 6 });
    const orders = new Map<number, Order>([[0, moveTo(PILLAR.x, PILLAR.z)]]); // 終點=柱心,永遠到不了
    const escaped = new Set<EntityId>();
    let minGap = Infinity;
    for (let i = 0; i < 150; i++) {
      const m = new Map<SeatId, IntentFrame>();
      if (i === 0) m.set(asSeatId(0), { order: orders.get(0)!, commands: [] });
      world.step(i === 0 ? m : NO_INTENTS);
      for (const e of world.events) {
        const d = e.data as { text?: string; caster?: EntityId };
        if (e.type === "floatingText" && d.text === "脫困") escaped.add(d.caster!);
      }
      const gap = Math.sqrt(V.distSq(world.transform.get(a)!.pos, PILLAR));
      if (gap < minGap) minGap = gap;
    }
    expect(escaped.size).toBe(0); // overlap 閘:牆不是單位,不放行、不喊脫困
    expect(minGap).toBeGreaterThan(1.8 + 0.6 - 0.05); // 柱r1.8+體r0.6:從沒進過柱子
  });

  it("被 stun 夾在人牆中間的那一位不觸發 —— 硬控不算黏住", () => {
    const world = makeWorld();
    const a = spawnChampion(world, 0, 0, { x: -44, z: 6 }); // 被夾且被控的那一位
    const left = spawnChampion(world, 1, 0, { x: -45.2, z: 6 });
    const right = spawnChampion(world, 2, 0, { x: -42.8, z: 6 });
    // A 整場被 stun(出貨判準走 movementHold 讀的就是這個欄位)。
    world.status.get(a)!.effects.push({
      statusId: "probe.stun" as StatusId, sourceId: "test", expiresAtTick: 100000, stun: true,
    });
    const orders = new Map<number, Order>([
      [0, moveTo(-38, 6)], // A 想走(有移動意圖) —— 但他是被控的,不是被堵的
      [1, moveTo(-38, 6)], // 左右兩位往中間頂,把 A 夾死
      [2, moveTo(-48, 6)],
    ]);
    const escaped = run(world, 150, orders);
    expect(escaped.has(a)).toBe(false); // CC 的 tick 凍結,不累積成互卡
  });
});
