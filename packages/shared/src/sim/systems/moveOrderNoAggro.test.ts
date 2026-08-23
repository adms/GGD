/**
 * ⭐ 打帶跑 (GH#637) —— 點地板 1 秒不搶指揮權。
 *
 * owner 2026-08-24:「我如果點了地板作為目標 要有1秒冷卻不能跑去打任何目標
 * (自動攻擊)讓我可以連續移動不被干擾來達成打帶跑(像是被打不能跟我搶指揮權
 * 跑去打人)」。
 *
 * 驗**機制**不驗數字(第二守則):窗口長度 1.0 從 `DEFAULT_MANUAL_ORDER` 推導,
 * ⛔ 不抄字面值。跑的是真的 `world.step()`(真 OrderSystem + 真威脅存放區
 * `recentDamagers`),⛔ 不是手餵 autoAcquirePass(失敗形態⑤)。
 *
 * 三個方向,缺一半就有一條路徑沒人看著:
 *   1. 點地板 → 窗口內被打也不轉頭(已咬住的自動目標也放下),窗口過了恢復;
 *   2. 非真人座位(bot / 沒接 humanSeats 的世界)→ 一格都不變(#274:走位中
 *      索敵照常),這就是「bot 不受影響」在 sim 層的形狀;
 *   3. 搖桿流(每 tick 一條 move)→ 只有第一條武裝,索敵照常恢復 ——
 *      否則推著搖桿 = 永久關掉自動攻擊,#274 的 STICK 守衛就是在量這個。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import { Stat, zeroStats } from "../stats/statTypes";
import { zeroAttrBonus } from "../stats/attributes";
import type { AbilitiesComp } from "../stats/statsComp";
import type { IntentFrame } from "../intents";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../mobs";
import { DEFAULT_MANUAL_ORDER } from "../combatFeel";
import { TICK_HZ } from "../../constants";
import * as V from "../math/vec2";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
/** autoAcquire.test.ts 的同一條乾淨巷道(z = center.z + 12,避開柱子與邊界夾)。 */
const at = (dx: number, dz = 0): V.Vec2 => ({ x: Z0.center.x + dx, z: Z0.center.z + 12 + dz });

/** 窗口長度(tick)從出貨預設推導 —— ⛔ 不抄 30。 */
const WINDOW = Math.round(DEFAULT_MANUAL_ORDER.moveOrderNoAggroSec * TICK_HZ);

function spawnFighter(w: SimWorld, seat: number, team: number, pos: V.Vec2, speed = 5.8): EntityId {
  const id = w.spawn();
  w.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  w.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  w.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  w.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = speed;
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  w.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  w.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null, basicAttackCdTicks: 0, unspentPoints: 0,
  });
  w.champion.set(id, {
    championId: "probe" as ChampionId, level: 1, xp: 0, gold: 0, items: [], augments: [],
    statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0, pendingOrbSlots: 0, undoStack: [],
  });
  return id;
}

/** 真人名單走 GH#577 開的那扇門(MobRules.humanSeats);mobZones 不開,不生怪。 */
function world(humanSeats: ReadonlySet<SeatId>): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  const cfg = (JSON.parse(readFileSync(join(CONTENT, "config/arena-rules.json"), "utf8")) as { mobWaves: MobWavesConfigLike }).mobWaves;
  w.mobRules = mobRulesFromConfig(cfg, w.dt, 1, undefined, undefined, humanSeats);
  return w;
}

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const move = (p: V.Vec2): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(0), { order: { kind: "move" as const, point: p }, commands: [] }]]);

/** 「敵人正在打我」—— 寫的是真的威脅存放區(damage.ts 寫的同一張表)。 */
function hitBy(w: SimWorld, victim: EntityId, attacker: EntityId): void {
  let m = w.recentDamagers.get(victim);
  if (!m) { m = new Map(); w.recentDamagers.set(victim, m); }
  m.set(attacker, w.tick);
}

describe("GH#637 點地板 1 秒不搶指揮權(打帶跑)", () => {
  it("點地板 → 已咬住的目標放下,窗口內被打也不轉頭,窗口過了恢復", () => {
    const w = world(new Set([asSeatId(0)]));
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    // 先讓他自動咬住敵人(#221 的既有行為,同時是「放下」那一半的前提)。
    for (let k = 0; k < 5; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget).toBe(enemy);
    // 點地板(一次離散點擊,往反方向 2 單位)。
    const clicked = w.tick;
    w.step(move(at(-2)));
    let sawTarget = false;
    while (w.tick < clicked + WINDOW) {
      hitBy(w, me, enemy); // 整段窗口都在被打
      w.step(NO_INTENTS);
      if (w.nav.get(me)!.attackTarget !== null) sawTarget = true;
    }
    expect(sawTarget, "窗口內轉頭了 —— 被打反擊/自動索敵搶走了指揮權").toBe(false);
    // 窗口過了:站在點的地方(距敵 5 < 近戰索敵地板 6),索敵恢復。
    for (let k = 0; k < 10; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "窗口過了卻沒有恢復自動索敵").toBe(enemy);
  });

  it("非真人座位:同一套指令一格都不變(bot 不受影響,#274 走位中索敵照常)", () => {
    const w = world(new Set([asSeatId(7)])); // 名單裡沒有 seat 0
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    w.step(move(at(-2)));
    hitBy(w, me, enemy);
    w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "不在 humanSeats 的座位不該有冷卻窗口").toBe(enemy);
  });

  it("搖桿流(每 tick 一條 move):只有第一條武裝,索敵照常恢復", () => {
    const w = world(new Set([asSeatId(0)]));
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    const dest = at(-2);
    for (let k = 0; k < WINDOW + 15; k++) {
      hitBy(w, me, enemy);
      w.step(move(dest)); // 流:每一 tick 都是一條新的 move
    }
    expect(
      w.nav.get(me)!.attackTarget,
      "推著搖桿把自動攻擊永久關掉了 —— #274 的災難回來了(流不可以一直重武裝窗口)",
    ).toBe(enemy);
  });
});
