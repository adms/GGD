/**
 * GH#455 —— **回到商店的那一刻，身體就已經還原了**。
 *
 * 在這之前「滿血滿魔站起來」只寫在 `enterCombat` 的擺位迴圈裡（＝下一回合開打的
 * 那一刻），所以中場整段期間玩家帶著上一回合的殘血在商店裡做採買決策，而 GH#106
 * 的即時屬性預覽刻意做成「不可以說謊」的東西。
 *
 * ⛔ 斷言讀 `world.health` 這個**最終物件**，⛔ 不是「有沒有呼叫某支函式」；
 * 站點覆蓋那一半在 `roundResetPools.test.ts`。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController, type SeatSpec } from "./MatchController";

/** 短相位：只是要走過一次回合邊界，不是在測節奏。 */
const CFG = { champSelectTicks: 2, intermissionTicks: 2, combatMaxTicks: 30, resolutionTicks: 2 };

function runTo(ctl: MatchController, ok: () => boolean): void {
  let guard = 0;
  while (!ok() && guard++ < 5000) ctl.tick();
  expect(guard).toBeLessThan(5000);
}

describe("GH#455 進中場就還原生命/魔力", () => {
  it("★ 一場打完（有人躺著殘血）→ 進中場 → 血魔是滿的、人是站著的", () => {
    cover("match-intermission-restore");
    const seats: SeatSpec[] = Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: true,
    }));
    const ctl = new MatchController("gh455", 99, seats, CFG);
    // 打完第一回合，停在結算相位（`concludeCombat` 跑過了，中場還沒開始）。
    runTo(ctl, () => ctl.phase.phase === "combat");
    runTo(ctl, () => ctl.phase.phase === "resolution");

    const entity = [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId!;
    const hp = ctl.world.health.get(entity)!;
    expect(hp.maxHp).toBeGreaterThan(0); // 夾具本身要是有意義的
    // 躺著 + 一滴血 + 沒魔。⚠️ `alive = false` 也讓自然回復跳過他（RegenSystem
    // 的第一道閘），所以下面三行只可能由還原造成。
    hp.alive = false;
    hp.hp = 1;
    hp.mana = 0;

    runTo(ctl, () => ctl.phase.phase === "intermission");

    // 靶（突變）：刪掉 `enterIntermission` 裡那一行 `restoreForNextRound`
    // → 這三行全部紅（停在 1 / 0 / false）。
    expect(hp.hp).toBe(hp.maxHp);
    expect(hp.mana).toBe(hp.maxMana);
    expect(hp.alive).toBe(true);
  });
});
