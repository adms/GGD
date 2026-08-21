/**
 * AP 傷害加成 —— THE MECHANISM，用**兩個真的施法者打同一個目標**證明。
 *
 * owner 2026-08-21：「技能傷害都套用公式 (1+AP*1%)⋯AP 變為原本傷害的額外加成」。
 *
 * ⛔ **不掃原始碼字串**（失敗形態⑥）：每一發都推一個真的 `DamagePacket` 進
 * `world.damageQueue`、跑一個真的 `world.step()`，然後讀血條真的掉了多少。
 *
 * ⛔ **不抄出貨數值**（第零守則：數值有三個住處，測試裡再抄一份就是第四個而它
 * 沒有守衛）—— 期望值一律從 `DEFAULT_AP_DAMAGE_SCALING.rate` 推導。
 * owner 明天把 0.5% 調成 0.8%，這支照樣綠；⛔ 而把那一行乘法拿掉它就紅。
 *
 * ⭐ 兩個施法者而不是一個，是因為「AP 高的打得比較痛」對**任何**會放大傷害的
 * 錯誤實作都會綠（失敗形態④）。釘住的是**比值** ——
 * `(1 + AP₁×rate) / (1 + AP₂×rate)` —— 那是這條公式的全部。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { zeroStats, Stat } from "../stats/statTypes";
import { DEFAULT_AP_DAMAGE_SCALING } from "./apDamageScaling";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14; // pillar-free band，抄 typeStreakImmunity.test.ts 的同一條帶
const RATE = DEFAULT_AP_DAMAGE_SCALING.rate;
const BASE = 200; // 夾具自己的基礎傷害，⛔ 不是任何一份出貨內容的數字

interface Rig {
  world: SimWorld;
  /** 兩個 AP 不同的施法者。 */
  lowAp: EntityId;
  highAp: EntityId;
  victim: EntityId;
}

/** 受害者的 `final` 全零 ⇒ 護甲/魔抗不會混進任何一個數字。 */
function rig(lowAp: number, highAp: number): Rig {
  const world = new SimWorld(SKELETON_ARENA, 20260821);
  const spawn = (x: number, seat: number, team: number, ap: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: LANE_Z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, {
      hp: 500_000,
      maxHp: 500_000,
      mana: 400,
      maxMana: 400,
      alive: true,
      shields: [],
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    const final = zeroStats();
    final[Stat.AbilityPower] = ap;
    world.stats.set(id, { championId: "fixture" as ChampionId, final, dirty: false, sources: [] });
    return id;
  };
  const a = spawn(Z0.center.x, 0, 0, lowAp);
  const b = spawn(Z0.center.x - 3, 2, 0, highAp);
  const victim = spawn(Z0.center.x + 3, 1, 1, 0);
  world.rebuildGrid();
  return { world, lowAp: a, highAp: b, victim };
}

/** 丟一發、跑一個真的 tick、讀血條真的掉了多少。 */
function hit(r: Rig, source: EntityId, origin: string): number {
  const hp = r.world.health.get(r.victim)!;
  const before = hp.hp;
  r.world.damageQueue.push({
    source,
    target: r.victim,
    amount: BASE,
    type: "true", // ⛔ 真傷 = 沒有減傷，讀到的就是這一層自己做了什麼
    crit: false,
    origin,
  });
  r.world.step(NO_INTENTS);
  return before - hp.hp;
}

const ABILITY = "ability:fixture.q";

describe("AP 傷害加成（技能傷害 ×(1 + AP × 加成率)）", () => {
  it("同一支技能同一個目標：AP 高的打得比較痛，而且**比值就是公式**", () => {
    const LOW = 100;
    const HIGH = 400;
    const r = rig(LOW, HIGH);
    const lo = hit(r, r.lowAp, ABILITY);
    const hi = hit(r, r.highAp, ABILITY);

    // ① 方向：AP 高的比較痛。（這一條自己不夠 —— 見檔頭失敗形態④。）
    expect(hi).toBeGreaterThan(lo);
    // ② ⭐ 承重的那一條：**兩發各自等於公式**，⛔ 不是「比較大就好」。
    expect(lo).toBeCloseTo(BASE * (1 + LOW * RATE), 6);
    expect(hi).toBeCloseTo(BASE * (1 + HIGH * RATE), 6);
    // ③ 比值 = (1 + AP_hi×rate) / (1 + AP_lo×rate) —— 這是 owner 那句
    //    「AP 變為原本傷害的額外加成」在數字上的樣子。
    expect(hi / lo).toBeCloseTo((1 + HIGH * RATE) / (1 + LOW * RATE), 6);
  });

  it("加成率 0 ⇒ **逐位元等於這一層出現之前**（一鍵 rollback 的證明）", () => {
    const r = rig(100, 400);
    r.world.apDamageScaling = { ...DEFAULT_AP_DAMAGE_SCALING, rate: 0 };
    // AP 差 4 倍的兩個人打出**一模一樣**的數字，而且就是封包本來的量。
    expect(hit(r, r.lowAp, ABILITY)).toBe(BASE);
    expect(hit(r, r.highAp, ABILITY)).toBe(BASE);
  });

  it("出貨範圍只吃技能：同一個高 AP 施法者的**普攻**一格都不動", () => {
    const r = rig(0, 400);
    // ⛔ 這一條不是重複第一條 —— 它證明那一行是一道**閘**而不是一個全域倍率。
    // 沒有它，一份「每一發封包都乘」的錯誤實作對前兩條測試完全綠。
    expect(hit(r, r.highAp, "basic")).toBe(BASE);
    expect(hit(r, r.highAp, ABILITY)).toBeCloseTo(BASE * (1 + 400 * RATE), 6);
  });
});
