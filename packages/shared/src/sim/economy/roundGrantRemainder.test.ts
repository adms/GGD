/**
 * ⭐⭐ GH#910 —— 回合給等**吃掉經驗條上的餘額**。
 *
 * owner 2026-09-01：「我是覺得 殭屍給的經驗值好像有問題」·「**不是故意的**，請你開票」
 *
 * ── ⛔ 為什麼從來沒有東西紅 ─────────────────────────────────────────────────
 * `grantLevels` 的**回傳值是「升了幾級」**，而它永遠是對的（`count` 級就是 `count` 級）。
 * ⇒ 每一條既有測試量的都是那個數字，⛔ 而被吸收的是**條上的餘額** —— 沒有人量它。
 * ⭐ 所以這條守衛量的是「**同樣打了 N 隻，最後停在幾級**」，⛔ 不是「升了幾級」。
 *
 * MUTATION LOG（落地前跑過，⭐ 誠實記下**哪一條**紅）：
 *   · `grantLevels` 改回 `xpToNext(level) - champ.xp` → 🔴 **第②條**
 *   · ⚠️ ⭐ 而**第①條在突變下是綠的** —— 因為殭屍的經驗仍然直接進條，
 *     打的人本來就會比不打的人高一點。⇒ ①只是儀器（證明有在打），
 *     ⛔ **它不是承重的那一條**。承重的是②：同樣打 25 隻，
 *     保留餘額與不保留**停在不同的級**。
 *   ⇒ ⭐ 這一段本來要寫成「①🔴」，⚠️ 而我跑過才發現不是 —— ⛔ 沒有跑過的突變紀錄是假的。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { grantLevels, grantXp, XP_REWARDS } from "./progression";
import { normalizeEconomyRules } from "./economyRules";

beforeAll(() => registerSkeletonContent());
const ZC = SKELETON_ARENA.zones[0]!.center;

/** 打 `mobs` 隻殭屍，然後領 `rounds` 次回合給等 —— 回傳最後停在幾級。 */
function levelAfter(mobs: number, rounds: number, keepRemainder: boolean): number {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.economy = normalizeEconomyRules({ roundGrantKeepsRemainder: keepRemainder });
  const id: EntityId = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: ZC.x, z: ZC.z }, zone: 0,
  });
  for (let r = 0; r < rounds; r++) {
    for (let m = 0; m < mobs; m++) grantXp(world, id, XP_REWARDS.mob);
    grantLevels(world, id, 3);
  }
  return world.champion.get(id)!.level;
}

describe("GH#910 回合給等不可以吃掉經驗條的餘額", () => {
  it("⭐ ① 儀器：打殭屍的人停得比不打的人高（⛔ 這一條**不承重**，見檔頭）", () => {
    const idle = levelAfter(0, 10, true);
    const farmer = levelAfter(25, 10, true);
    expect(idle, "儀器：完全不打也會因為回合給等升級").toBeGreaterThan(1);
    expect(
      farmer,
      `⛔⛔ 每回合打 25 隻的人（L${farmer}）與**完全不打**的人（L${idle}）停在同一級\n` +
        `⇒ ⭐ 那些殭屍**白打了** —— 賺到的經驗被回合給等吸收掉（owner：「不是故意的」）。`,
    ).toBeGreaterThan(idle);
  });

  it("★★ ⭐ **承重**：同樣打 25 隻，保留餘額與不保留**停在不同的級**", () => {
    // ⚠️ 這一條刻意驗**壞掉的那一邊**：它是 rollback 開關的存在證明。
    //   ⛔ 若兩邊量起來一樣，那個開關就是死的（而它讀起來完全正常）。
    expect(levelAfter(25, 10, false)).toBeLessThan(levelAfter(25, 10, true));
  });

  it("⭐ 出貨預設是**保留餘額**（⛔ 不是舊行為）", () => {
    expect(normalizeEconomyRules({}).roundGrantKeepsRemainder).toBe(true);
  });
});
