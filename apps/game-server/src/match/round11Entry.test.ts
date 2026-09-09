/**
 * ⭐⭐ 第十一回合**真的進得去**（GH#1151 A 的進場那一段）。
 *
 * ⚠️⭐ 這條驗的是**行為**，⛔ 不是「有一個欄位」：
 * 跑一場真的 `MatchController` 到最後一回合，然後問「比賽停了沒」。
 *
 * ⭐ 兩個方向都跑：開關**關著**（出貨）⇒ 停在 finalRound；
 * 開關**開著** ＋ 王擊殺達門檻 ⇒ ⭐ **多打一個第十一回合**，⛔ 而且只多一個。
 */
import { describe, it, expect } from "vitest";
import { TICK_HZ } from "@ggd/shared/constants";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const rules = (round11: Partial<ArenaRules["round11"]>): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  finalRound: 3, // ⭐ 縮短賽制,⛔ 免得測試跑十回合
  round11: {
    enabled: false,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 7,
    bannerText: "第十一回合",
    ...round11,
  },
});

/** 跑到比賽結束（或撞到守衛），回傳打完的回合數。 */
function runToEnd(ctl: MatchController, guard = 40000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n++ < guard) ctl.tick();
  expect(ctl.phase.phase, "比賽要在守衛之內結束").toBe("matchEnd");
  return ctl.phase.round;
}

describe("第十一回合的進場（GH#1151 A）", () => {
  it("⛔ 開關**關著**（出貨）⇒ 比賽停在 finalRound", () => {
    const ctl = new MatchController("r11-off", 7, allBots(), FAST, undefined, rules({}));
    expect(runToEnd(ctl)).toBe(3);
  });

  it("⛔ 開著但**王擊殺沒到門檻** ⇒ 一樣停在 finalRound", () => {
    const ctl = new MatchController("r11-few", 7, allBots(), FAST, undefined, rules({ enabled: true }));
    recordBossKill(ctl.round11BossKillsForTest, 1); // 只有 1 隻,門檻是 2
    expect(runToEnd(ctl)).toBe(3);
  });

  it("⭐⭐ 開著 ＋ 達門檻 ⇒ **多打一個回合**，⛔ 而且只多一個", () => {
    const ctl = new MatchController("r11-on", 7, allBots(), FAST, undefined, rules({ enabled: true }));
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    // ⭐ 只多一個：`shouldEnterRound11` 只在「剛打完 finalRound」成立
    //   ⇒ 第 4 回合打完後 `isLastRound()` 回 true ⇒ ⛔ 不會有第 5 回合。
    expect(runToEnd(ctl)).toBe(4);
  });

  it("⭐ 第十一回合**沒有商店**，⭐ 而且長度用 `durationSec`", () => {
    const ctl = new MatchController("r11-shop", 7, allBots(), FAST, undefined, rules({ enabled: true }));
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0;
    // 跑到第十一回合的 combat
    while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
    expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
    expect(ctl.phase.phase).toBe("combat");
    // ⛔ 商店關著
    expect(ctl.world.economyOpen, "第十一回合⛔沒有商店").toBe(false);
    // ⭐ 長度來自設定,⛔ 不是賽制的 combatMaxTicks(20)
    expect(ctl.phase.ticksLeft).toBeGreaterThan(FAST.combatMaxTicks);
    expect(ctl.phase.ticksLeft).toBeLessThanOrEqual(7 * TICK_HZ);
  });
});
