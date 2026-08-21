/**
 * GH#159 —— **打死自己隊友不算擊殺**：賞金／擊殺金／XP／連殺／計分板五條線
 * 共用同一個謂詞（`stats/matchStats.ts::killScores`）。
 *
 * ⚠️ 這條之所以可觸發：普攻是目前**唯一**沒有隊伍濾網的傷害路徑
 * （`OrderSystem` 的 `attackTarget` 直接吃玩家指定的 entity），所以隊友之間真的
 * 打得死；配上 #84 的復活圈就是「救回來再殺一次」的印鈔機。
 *
 * ⛔ 斷言**不抄出貨金額**（`GOLD_REWARDS.kill` 是 owner 每週在動的數字，
 * 第零守則：守衛驗機制不驗數字）——只問「有沒有進帳」與「算不算一條人頭」。
 * ⭐ 兩條案例走的是**完整的 `w.step()`**，⛔ 不是直接呼叫 `deathSystem`。
 *
 * 突變：把 `killScores` 改回 `killer !== null && world.champion.has(killer)`
 * → ②「隊友」整條 FAIL（金幣進帳、kills 變 1），①仍綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { getMatchStats } from "../stats/matchStats";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + seat * 2, z: C.z },
    zone: 0,
  });
}

/** `killer` 打死 `victim`，跑完一整個出貨 tick。 */
function slay(victimTeam: number): { gold: number; kills: number; deaths: number } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  const killer = hero(w, 0, 0);
  const victim = hero(w, 1, victimTeam);
  const before = w.champion.get(killer)!.gold;
  w.damageQueue.push({
    source: killer,
    target: victim,
    amount: 999999,
    type: "true",
    crit: false,
    origin: "basic",
  });
  w.step(new Map());
  return {
    gold: w.champion.get(killer)!.gold - before,
    kills: getMatchStats(w, killer).kills,
    deaths: getMatchStats(w, victim).deaths,
  };
}

describe("GH#159 擊殺發放要看隊伍 (friendly-fire-payout)", () => {
  it("★ ① 敵人：照常進帳、記一條人頭（控制組 —— 沒有它這支閘是空的）", () => {
    const r = slay(1);
    expect(r.gold, "殺敵人一毛都沒進帳 —— 謂詞把正路一起擋掉了").toBeGreaterThan(0);
    expect(r.kills).toBe(1);
    expect(r.deaths).toBe(1);
  });

  it("★ ② 隊友：一毛都不進、不算人頭 —— 但死亡照記", () => {
    const r = slay(0);
    expect(r.gold, "殺隊友照領擊殺金＋首殺賞金 —— 配上復活圈就是印鈔機").toBe(0);
    expect(r.kills, "金幣擋住了但 KDA／連殺仍可刷").toBe(0);
    expect(r.deaths, "屍體在地上，計分板卻說他沒死").toBe(1);
  });
});
