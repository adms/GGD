/**
 * 🧲 **擊倒要在頭上看得見**（GH#631）。
 *
 * > owner 2026-08-23：「被普攻的時候好像會被角色黏住走不了，是什麼原因請修正，
 * >  **如果是特殊狀態 要讓角色頭上有明顯圖示**」
 *
 * ⭐ G1 lane 量到「黏住」的主因是 hitstop（已修），⛔ 而順帶挖到**真的有一個特殊狀態**：
 * `world.knockdown`（14 tick 的 root + stun）—— 它住**自己的表**，⛔ 不住 `status`，
 * 於是 `snapshot.ts` 那個只走 `status` 的迴圈**看不到它** ⇒ ROOTED / STUNNED
 * 兩顆位元對擊倒**從來沒有亮過**。
 *
 * ⚠️ 而兩顆位元早就在線上 —— ⛔ 這不是新的協定欄位，是一個**零寫入端**
 *（失敗形態⑧：消費端存在，而它消費不到）。
 */
import { describe, expect, it } from "vitest";

import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";

import { buildSnapshot } from "./snapshot";

function flagsOf(world: SimWorld, id: number): number {
  const snap = buildSnapshot(world) as unknown as { entities?: { id: number; flags: number }[] };
  const rows = snap.entities ?? [];
  return rows.find((e) => e.id === id)?.flags ?? 0;
}

describe("GH#631 擊倒的位元", () => {
  it("★ 被擊倒 → ROOTED + STUNNED 都亮（⛔ 不亮 = 頭上沒圖示、客戶端也預測不到）", () => {
    registerSkeletonContent();
    const world = new SimWorld(SKELETON_ARENA, 7);
    const id = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });

    expect(flagsOf(world, id) & ENTITY_FLAG.ROOTED, "還沒擊倒就亮了").toBe(0);

    world.knockdown.set(id, 14);
    const f = flagsOf(world, id);
    expect(
      f & ENTITY_FLAG.ROOTED,
      "擊倒了而 ROOTED 沒亮 —— 玩家走不了而畫面上沒有任何東西說明為什麼",
    ).not.toBe(0);
    expect(f & ENTITY_FLAG.STUNNED, "擊倒了而 STUNNED 沒亮").not.toBe(0);

    world.knockdown.delete(id);
    expect(flagsOf(world, id) & ENTITY_FLAG.ROOTED, "擊倒結束了還亮著").toBe(0);
  });
});
