/**
 * markRoundReset.test.ts — Lane C（#278 A4）：具名標記的**回合邊界**接線。
 *
 * `resetMarksForRound()` 在 `sim/marks.ts` 早就寫好了，但在這一條接上之前
 * **沒有任何人呼叫它** —— 典型的失敗形態②（做了但玩家收不到）：
 * `resetOn:"round"` 的標記花掉就永遠回不來，而純 sim 的單元測試全綠。
 *
 * ⚠️ **兩個方向一定要一起讀。** 只斷言「round 的被補回來」的話，一份
 * 「無條件把 world.marks 全部歸位」的實作照樣通過 —— 而那會讓十二道試煉
 * （`resetOn:"match"`，跨回合共享）每回合回滿，整個機制當場消失。
 *
 * ⛔ 夾具數字（4 層 / 消耗 1 層）是**任意的**，不是任何出貨值。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { installMark, consumeMark, markCount } from "@ggd/shared/sim/marks";
import { MARK_DURATION_PERMANENT } from "@ggd/shared/sim/markLimits";
import { MatchController, type SeatSpec } from "./MatchController";

/** 短相位：只是要走過一次回合邊界，不是在測節奏。 */
const CFG = { champSelectTicks: 2, intermissionTicks: 2, combatMaxTicks: 30, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const INITIAL = 4;
const ROUND_MARK = "fixture.round";
const MATCH_MARK = "fixture.match";

function runTo(ctl: MatchController, ok: () => boolean): void {
  let guard = 0;
  while (!ok() && guard++ < 5000) ctl.tick();
  expect(guard).toBeLessThan(5000);
}

describe("回合邊界：resetOn:\"round\" 補回初始值，resetOn:\"match\" 不動", () => {
  it("★ 跨過一次回合邊界後，round 標記回滿、match 標記維持花掉的樣子", () => {
    cover("match-mark-round-reset");
    const ctl = new MatchController("mrr", 99, allBots(), CFG);
    runTo(ctl, () => ctl.phase.phase === "combat");

    const entity = [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId!;
    for (const markId of [ROUND_MARK, MATCH_MARK]) {
      installMark(ctl.world, entity, {
        markId,
        initial: INITIAL,
        max: INITIAL,
        durationSec: MARK_DURATION_PERMANENT, // 永久：把「到期」那根軸排除在外
        resetOn: markId === ROUND_MARK ? "round" : "match",
      });
      expect(consumeMark(ctl.world, entity, markId, 1)).toBe(true);
    }
    // 起點：兩個都被花掉了一層 —— 否則後面「回滿」是廢話。
    expect(markCount(ctl.world, entity, ROUND_MARK)).toBeLessThan(INITIAL);
    expect(markCount(ctl.world, entity, MATCH_MARK)).toBeLessThan(INITIAL);

    // 走完這一回合，再進到**下一回合的戰鬥**（重置就發生在 enterCombat）。
    runTo(ctl, () => ctl.phase.phase !== "combat");
    runTo(ctl, () => ctl.phase.phase === "combat");

    // 靶①：把 `resetMarksForRound(this.world)` 刪掉 → 這一行紅（停在 3）。
    expect(markCount(ctl.world, entity, ROUND_MARK)).toBe(INITIAL);
    // 靶②：改成無條件重置（拿掉 `resetOn !== "round"` 那道閘）→ 這一行紅。
    expect(markCount(ctl.world, entity, MATCH_MARK)).toBeLessThan(INITIAL);
  });
});
