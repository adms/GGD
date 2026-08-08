/**
 * 總回合數上限 (#288) —— owner 2026-08-08:
 *   「開房房主可以設定 選角、商店、每回合的時間跟總回合數，
 *     但**預設值保留現在**（包含 vs bot）」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一份**兩個方向一起驗**，只驗一邊都是盲的
 * ═══════════════════════════════════════════════════════════════════════════
 *   ① 設了 3 → 這一場真的在第 3 回合結束（而不是照樣打到決賽）
 *   ② 沒設   → 這一場照舊打到決賽（而不是「永遠在第 N 回合結束」）
 *
 * ⚠️ 只寫 ① 的話，一個把 `isLastRound` 寫成「恆真」的實作也會綠 —— 那是把整場
 * 比賽砍成一回合，而 owner 那句話的另一半正是「預設值保留現在」。
 * 只寫 ② 的話，整條上限機制被刪掉也會綠。
 *
 * ⛔ 這裡**不驗數字**：3 是這個測試自己挑的房主輸入（不是出貨值），
 * `FINAL_ROUND` 從 `PairedDuels` 讀。出貨的上限預設（0）住在
 * `content/config/config.match.json` + Zod + admin，有 drift 測試在守。
 *
 * 突變紀錄（2026-08-08 逐一真的跑過）：
 *   1. `MatchController.isLastRound` 拿掉 `|| roundCapReached(...)` →
 *      ①「第 3 回合結束」紅（跑到 FINAL_ROUND 才停），② 綠。
 *   2. `isLastRound` 拿掉 `isRoyaleRound(...) ||` →
 *      ②「沒設上限打到決賽」紅（400k tick 還沒結束），① 綠。
 *   3. `MatchRoom.onCreate` 的 `maxRounds: resolveMaxRounds(...)` 拿掉 →
 *      這個檔照樣綠（它測的是 controller）。
 *      ⚠️ 這一行原本寫「由 `roomSettingsPhase.test.ts` 的接線那條守」——**那是假的**
 *      （第三守則）：那個檔直接呼叫 `phaseConfigFromSeconds()` / `resolveMaxRounds()`，
 *      從來沒有走過 `MatchRoom.onCreate`，所以那個突變當時**沒有任何守衛會紅**。
 *      真正守它的是 `apps/game-server/src/rooms/matchRoomSettings.test.ts`
 *      （2026-08-08 補，四個接線突變都實跑過會紅）。
 */
import { describe, it, expect } from "vitest";
import { MAX_ROUNDS_UNLIMITED } from "@ggd/shared/roomSettings";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { FINAL_ROUND } from "./PairedDuels";

/** 短相位：這一份在意的是「第幾回合停」，不是任何一段時間有多長。 */
const FAST = { champSelectTicks: 5, intermissionTicks: 20, combatMaxTicks: 600, resolutionTicks: 3 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));
const rulesCapped = (maxRounds: number): ArenaRules => ({ ...DEFAULT_ARENA_RULES, maxRounds });

function runToEnd(ctl: MatchController, guard = 400_000): void {
  for (let n = 0; n < guard && ctl.phase.phase !== "matchEnd"; n++) ctl.tick();
  expect(ctl.phase.phase, "這一場從來沒有結束").toBe("matchEnd");
}

describe("房主的總回合數上限（round-cap）", () => {
  it("① 設 3 → 打完第 3 回合就結束，而且走的是既有的結算流程", () => {
    const cap = 3;
    expect(cap).toBeLessThan(FINAL_ROUND); // 否則這條測的是決賽，不是上限
    const ctl = new MatchController("cap-3", 4242, allBots(), FAST, undefined, rulesCapped(cap));
    runToEnd(ctl);

    expect(ctl.phase.round, "上限沒生效 —— 這一場照樣打過了第 3 回合").toBe(cap);
    // #193：結束要**經過結算畫面**，不是把房間砍掉。三樣東西一起代表那條路走完了。
    expect(ctl.result).not.toBeNull();
    expect(ctl.settlement).not.toBeNull();
    // 「名次照剩餘團隊生命」—— 四隊都有名次，而且是 1/2/3/4 的全序。
    expect([...ctl.placements.values()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("② 沒設上限 → 這一場照舊打到決賽（出貨預設下這個機制不存在）", () => {
    expect(DEFAULT_ARENA_RULES.maxRounds).toBe(MAX_ROUNDS_UNLIMITED);
    const ctl = new MatchController("cap-off", 4242, allBots(), FAST);
    runToEnd(ctl);
    expect(ctl.phase.round, "沒設上限卻提早結束了 —— 預設行為被改掉").toBe(FINAL_ROUND);
  });

  /**
   * `isLastRound` 有**三個**消費端，而 ①②③ 只走得到 `maybeFinish` 那一個。
   * 對抗複驗實測：只把 `concludeCombat` 的凍結 latch 改回 `isRoyaleRound(...)`
   * （其餘兩處留著 `isLastRound()`）→ game-server `match`+`rooms` 60 個檔
   * **374/374 全綠**。那正是 #100 的缺陷形狀：上限那一回合打完之後沒有人凍結，
   * 機器人繼續互毆打穿勝利演出，直到一個相位後 `maybeFinish` 才收場。
   */
  it("④ 上限那一回合一打完就凍結 —— 不是等到 matchEnd 才凍（#100）", () => {
    const ctl = new MatchController("cap-freeze", 4242, allBots(), FAST, undefined, rulesCapped(3));
    let latchedAt: string | null = null;
    for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
      ctl.tick();
      if (ctl.outcomeDecided && latchedAt === null) latchedAt = ctl.phase.phase;
    }
    expect(ctl.phase.phase).toBe("matchEnd");
    // 凍結必須發生在**還沒到 matchEnd 的某個相位**。等到 matchEnd 才 true =
    // `concludeCombat` 那個 latch 沒有認得上限，中間那段沒有人踩煞車。
    expect(latchedAt, "上限那一回合結束時沒有凍結 —— 機器人會打穿勝利演出").not.toBeNull();
    expect(latchedAt).not.toBe("matchEnd");
  });

  it("③ 上限設得比決賽還遠 → 沒有效果（兩條是 OR，決賽先到）", () => {
    const ctl = new MatchController(
      "cap-far",
      4242,
      allBots(),
      FAST,
      undefined,
      rulesCapped(FINAL_ROUND + 5),
    );
    runToEnd(ctl);
    expect(ctl.phase.round).toBe(FINAL_ROUND);
  });
});
