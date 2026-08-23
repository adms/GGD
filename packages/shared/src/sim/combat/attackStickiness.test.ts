/**
 * ⭐ 「**被普攻的時候好像會被角色黏住走不了**」（owner 2026-08-23）的閘。
 *
 * ⛔ 它量的是**淨位移**，不是「身上有沒有狀態」—— 那是 owner 的原話裡唯一的判準，
 * 也是這一次量下去才發現根因是 `hitstop`（⛔ 不是減速、⛔ 不是碰撞推擠）的原因。
 * 完整的量測結果與那一格後台開關在 `combat/hitstopHold.ts` 的檔頭。
 *
 * ⚠️ 儀器必須活著：一位**沒有被打**的英雄也走得動，所以斷言旁邊要有
 * 「攻擊真的落在他身上」＋「定格真的上了值」兩條對照，否則「攻擊者根本打不到」
 * 也會讓這條測試變綠（失敗形狀 ④：斷言方向與缺陷無關）。
 *
 * 突變紀錄：把 `MovementSystem` 的 `hitstopHoldsBody(world, id)` 改回
 * `(world.hitstop.get(id) ?? 0) > 0` → 完全動不了的 tick 從 0 變 28，第一條紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const ZC = SKELETON_ARENA.zones[0]!.center;
const ME = asSeatId(0);
/** 攻速拉高 = 定格連段的密度拉高;⛔ 不是斷言裡的數字,只是把窗口壓短。 */
const FAST_ATTACK_SPEED = 4;

interface Run {
  /** 位移小於意圖 5% 的 tick 數 —— 「走不了」就是這個。 */
  frozen: number;
  /** 這位英雄身上真的上過定格的 tick 數(儀器)。 */
  hitstopTicks: number;
  /** 真的挨了幾發(儀器)。 */
  hits: number;
}

/** 一位英雄一路往 −x 走 `T` tick,同時被 `n` 個貼身的敵人持續普攻。 */
function walkWhileBeaten(n: number, T = 90): Run {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const me = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: ME,
    teamId: asTeamId(0),
    pos: { x: ZC.x + 10, z: ZC.z },
    zone: 0,
  });
  const foes: EntityId[] = [];
  for (let k = 0; k < n; k++) {
    foes.push(
      spawnChampion(world, {
        championId: "sela" as ChampionId,
        seatId: asSeatId(1 + k),
        teamId: asTeamId(1),
        pos: { x: ZC.x + 11.4, z: ZC.z + k },
        zone: 0,
      }),
    );
  }
  const hp = world.health.get(me)!;
  const out: Run = { frozen: 0, hitstopTicks: 0, hits: 0 };
  for (let i = 0; i < T; i++) {
    hp.hp = hp.maxHp; // 不讓他死 —— 死了就不是「走不了」而是「沒有身體」
    const t = world.transform.get(me)!;
    const before = { x: t.pos.x, z: t.pos.z };
    // 攻擊者每 tick 釘在他**後方**(+x)一個身位:攻擊一定打得到,而且推擠的方向
    // 和逃跑方向相反 ⇒ ⛔ 分離推擠不會把淨位移灌水。
    for (const f of foes) {
      const st = world.stats.get(f)!;
      st.final[Stat.AttackSpeed] = FAST_ATTACK_SPEED;
      st.final[Stat.MoveSpeed] = 1e-9;
      world.transform.get(f)!.pos = { x: before.x + 1.2, z: before.z };
    }
    const intents = new Map<SeatId, IntentFrame>([
      [ME, { order: { kind: "move", point: { x: ZC.x - 12, z: ZC.z } }, commands: [] }],
    ]);
    world.step(intents);
    const after = world.transform.get(me)!.pos;
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const want = world.stats.get(me)!.final[Stat.MoveSpeed] * world.dt;
    if (dx * dx + dz * dz < want * want * 0.0025) out.frozen++;
    if ((world.hitstop.get(me) ?? 0) > 0) out.hitstopTicks++;
    for (const e of world.events) {
      if (e.type === "damage" && (e.data as { target?: EntityId }).target === me) out.hits++;
    }
  }
  return out;
}

describe("被普攻不會把走位權拿走 (owner 2026-08-23)", () => {
  it("⭐ 被四個人貼身連打的英雄,沒有任何一個 tick 是完全動不了的", () => {
    const beaten = walkWhileBeaten(4);
    // 儀器:真的挨打了,而且定格真的上了值 —— 否則下面那條是空的
    expect(beaten.hits, "攻擊必須真的落在他身上").toBeGreaterThan(0);
    expect(beaten.hitstopTicks, "定格必須真的上了值(機制還在)").toBeGreaterThan(0);
    expect(beaten.frozen, "被普攻不可以讓玩家原地不動").toBe(0);
  });

  it("對照組:沒有人打他的時候也是 0 —— 這條測試不是被別的東西擋住", () => {
    expect(walkWhileBeaten(0).frozen).toBe(0);
  });
});
