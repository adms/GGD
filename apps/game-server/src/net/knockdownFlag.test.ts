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
 * ⚠️ 兩顆位元早就在線上 —— ⛔ 這不是新的協定欄位，是一個**零寫入端**
 *（失敗形態⑧：消費端存在，而它消費不到）。
 *
 * ⭐ 走**出貨的** `projectSnapshot`（⛔ 不是自己組一份 payload —— 失敗形態⑤）。
 */
import { describe, expect, it } from "vitest";

import { ENTITY_FLAG, MatchState } from "@ggd/shared/protocol/schema";
import type { EntityId } from "@ggd/shared/ids";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";

const seats = Array.from({ length: 12 }, (_, i) => ({
  seatId: i,
  teamId: Math.floor(i / 3),
  isBot: true,
}));

function inCombat(): MatchController {
  const ctl = new MatchController("knockdown", 909, seats, {
    champSelectTicks: 5,
    intermissionTicks: 30,
    combatMaxTicks: 1200,
    resolutionTicks: 5,
  });
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

/** 這個實體在**出貨的**快照上的 flags。 */
function flagsOf(ctl: MatchController, id: EntityId): number {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  const row = [...state.entities.values()].find((e) => e.id === (id as unknown as number));
  expect(row, "快照上找不到這個實體").toBeTruthy();
  return row!.flags;
}

describe("GH#631 擊倒的位元", () => {
  it("★ 被擊倒 → ROOTED + STUNNED 都亮（⛔ 不亮 = 頭上沒圖示、客戶端也預測不到）", () => {
    const ctl = inCombat();
    const id = [...ctl.seats.values()][0]!.entityId!;

    ctl.world.knockdown.delete(id);
    const before = flagsOf(ctl, id);

    ctl.world.knockdown.set(id, 14);
    const during = flagsOf(ctl, id);
    expect(
      during & ENTITY_FLAG.ROOTED,
      "擊倒了而 ROOTED 沒亮 —— 玩家走不了，而畫面上沒有任何東西說明為什麼",
    ).not.toBe(0);
    expect(during & ENTITY_FLAG.STUNNED, "擊倒了而 STUNNED 沒亮").not.toBe(0);

    // ⭐ 反方向：⛔ 不是「這兩顆位元一直亮著」。
    ctl.world.knockdown.delete(id);
    const after = flagsOf(ctl, id);
    expect(
      (after & ENTITY_FLAG.ROOTED) === (before & ENTITY_FLAG.ROOTED),
      "擊倒結束了位元還亮著 —— 那圖示會黏在頭上",
    ).toBe(true);
  });
});
