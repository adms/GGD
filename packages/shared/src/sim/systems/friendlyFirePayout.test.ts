/**
 * GH#159 —— **打死自己隊友不算擊殺**。賞金／擊殺金／XP／連殺／計分板五條線共用
 * 同一個謂詞（`stats/matchStats.ts::killScores`）。可觸發性：普攻是目前唯一沒有
 * 隊伍濾網的傷害路徑，配上 #84 復活圈就是「救回來再殺一次」的印鈔機。
 *
 * ⛔ 斷言不抄出貨金額（`GOLD_REWARDS` 是 owner 每週在動的數字）——只問有沒有進帳。
 * ⭐ 走完整的 `w.step()`，⛔ 不是直接呼叫 `deathSystem`。
 * 突變：`killScores` 末行改回 `return true` → ② FAIL、① 綠。
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

const hero = (w: SimWorld, seat: number, team: number): EntityId =>
  spawnChampion(w, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + seat * 2, z: C.z },
    zone: 0,
  });

/** 0 號座位打死 1 號座位（隊伍為 `victimTeam`），跑完一整個出貨 tick。 */
function slay(victimTeam: number): { gold: number; kills: number; deaths: number } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  const killer = hero(w, 0, 0);
  const victim = hero(w, 1, victimTeam);
  const before = w.champion.get(killer)!.gold;
  w.damageQueue.push({ source: killer, target: victim, amount: 999999, type: "true", crit: false, origin: "basic" });
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
    expect([r.kills, r.deaths]).toEqual([1, 1]);
  });

  it("★ ② 隊友：一毛都不進、不算人頭 —— 但死亡照記", () => {
    const r = slay(0);
    expect(r.gold, "殺隊友照領擊殺金＋首殺賞金 —— 配上復活圈就是印鈔機").toBe(0);
    expect(r.kills, "金幣擋住了但 KDA／連殺仍可刷").toBe(0);
    expect(r.deaths, "屍體在地上，計分板卻說他沒死").toBe(1);
  });
});
