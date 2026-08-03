/**
 * vs bot 的兩個節奏旋鈕 (owner 2026-08-03)。
 *
 *   A1「強制結算」:「如果是 vs bot，玩家場勝負結算，另一場的 bot 還沒則強制結算，
 *                   不要讓玩家白等。」
 *   A2「選角早退」:「vs bot 選角後就可以開始進入戰鬥不用等，一樣是因為不用等
 *                   其他 bot。」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這個檔驗的是**機制**,不是數字
 * ═══════════════════════════════════════════════════════════════════════════
 * 沒有任何一條寫死秒數或 tick 數。每一條都在問一個「會不會發生」的問題,而且
 * 每一條都有一個**對照組** —— 因為這兩個功能的失敗形態不是「算錯」,是
 * 「條件寫錯,於是在不該發生的局也發生」。
 *
 * ⚠️ 判準是**人類座位數**,不是「場上有 bot」。`MatchRoom` 把每一個沒人坐的座位
 * 都填成 `isBot: true`,所以「有 bot」在**每一場**都成立 —— 用它判會讓三個朋友
 * 一起打的局也吃到 bot 局的規則。②④ 兩條就是在釘這件事,而它們是最容易寫錯的。
 *
 * ⚠️ 而且**零個人類座位不算 vs bot 局**(③⑥):純 bot 沙盒沒有任何人在等,把它
 * 當成 bot 局會讓 A2 在第 1 個 tick 跳過選角、A1 在第一個 zone 分勝負時結束整個
 * 回合 —— 那會靜默改寫每一條既有的 all-bot 測試與每一份既有錄影。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";

/** 戰鬥預算開得很長,所以任何一次「回合結束了」都不可能是相位計時器造成的。 */
const CFG = {
  champSelectTicks: 5_000,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

/** 12 個座位,其中前 `humans` 個是人類。 */
const seatsWithHumans = (humans: number): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: i >= humans,
    ...(i < humans ? { accountId: `human-${i}` } : {}),
  }));

/** 開一場並推到第一個 combat 相位（選角靠逾時走完）。 */
function toCombat(humans: number, seed: number): MatchController {
  const ctl = new MatchController("vsbot", seed, seatsWithHumans(humans), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 50_000) ctl.tick();
  return ctl;
}

/** 把 `teamId` 站在 `zone` 裡的英雄全部打死（決定性,不靠模擬打架）。 */
function wipeSideInZone(ctl: MatchController, teamId: number, zone: number): void {
  for (const seat of ctl.seats.values()) {
    if (seat.teamId !== teamId || seat.entityId === null) continue;
    const t = ctl.world.transform.get(seat.entityId);
    const hp = ctl.world.health.get(seat.entityId);
    if (t?.zone === zone && hp) {
      hp.alive = false;
      hp.hp = 0;
    }
  }
}

/** 人類座位所屬那一區的配對（一定只有一個）。 */
function humanPairing(ctl: MatchController): { zone: number; sideA: number; sideB: number } {
  const humanTeam = ctl.seats.get(asSeatId(0))!.teamId;
  const p = ctl.pairings.find((x) => x.sideA === humanTeam || x.sideB === humanTeam)!;
  return { zone: p.zone, sideA: p.sideA, sideB: p.sideB };
}

describe("A1 —— vs bot 的強制結算", () => {
  it("① 人類那一區分出勝負 → 同一 tick 其餘 bot 區也結算,回合當場結束", () => {
    cover("vs-bot-pacing");
    const ctl = toCombat(1, 1234);
    expect(ctl.phase.phase).toBe("combat");
    expect(ctl.pairings.length).toBe(2); // 4 隊 → 兩個競技場
    expect(ctl.vsBotPacing.soloVsBots, "一個人類座位 = vs bot 局").toBe(true);

    const mine = humanPairing(ctl);
    const other = ctl.pairings.find((p) => p.zone !== mine.zone)!;
    // 只打完**我這一區**。另一區兩隊 bot 一根寒毛都沒少。
    wipeSideInZone(ctl, mine.sideB === ctl.seats.get(asSeatId(0))!.teamId ? mine.sideA : mine.sideB, mine.zone);

    const before = ctl.phase.ticksLeft;
    expect(before, "戰鬥預算幾乎沒動 —— 所以結束不可能是計時器造成的").toBeGreaterThan(90_000);

    // 突變點:把 `checkCombatEnd` 尾巴那一行
    //   `if (this.forceSettleVsBotDue()) this.forceSettleRemainingZones();`
    // 刪掉 → 另一區永遠不決,回合停在 combat,這一條紅。
    ctl.tick();
    expect(ctl.duelWinnerOf(other.zone), "另一區被強制結算了").toBeDefined();
    expect(ctl.phase.phase, "整個回合當場結束,玩家不必白等").toBe("resolution");
  });

  it("② 有第二個人類時完全不觸發 —— 「有 bot」在每一場都成立,不能拿它當判準", () => {
    cover("vs-bot-pacing");
    // 兩個人類坐在**不同隊**(座位 0 → 隊 0、座位 3 → 隊 1),其餘 10 個位子照樣是
    // bot —— 也就是「場上有 bot」在這一場同樣成立。判準若寫成「有 bot」,這一條紅。
    const ctl = new MatchController(
      "vsbot-2h",
      777,
      seatsWithHumans(12).map((s) => ({ ...s, isBot: s.seatId !== 0 && s.seatId !== 3 })),
      CFG,
    );
    let guard = 0;
    while (ctl.phase.phase !== "combat" && guard++ < 50_000) ctl.tick();
    expect(ctl.vsBotPacing.soloVsBots).toBe(false);

    const mine = humanPairing(ctl);
    const other = ctl.pairings.find((p) => p.zone !== mine.zone)!;
    wipeSideInZone(ctl, mine.sideB, mine.zone);
    ctl.tick();
    expect(ctl.duelWinnerOf(mine.zone), "我這一區照樣正常結算").toBeDefined();
    expect(ctl.duelWinnerOf(other.zone), "別人那一區必須自己打完").toBeUndefined();
    expect(ctl.phase.phase).toBe("combat");
  });

  it("③ 全 bot 沙盒不算 vs bot 局 —— 沒有人在等,規則不該啟動", () => {
    cover("vs-bot-pacing");
    const ctl = toCombat(0, 4242);
    expect(ctl.vsBotPacing.soloVsBots, "零個人類 ≠ vs bot 局").toBe(false);

    const [first, second] = ctl.pairings;
    wipeSideInZone(ctl, first!.sideB, first!.zone);
    ctl.tick();
    expect(ctl.duelWinnerOf(second!.zone), "另一區照舊自己打完").toBeUndefined();
    expect(ctl.phase.phase).toBe("combat");
  });
});

describe("A2 —— vs bot 的選角早退", () => {
  it("④ 人類鎖定英雄 → 下一 tick 就離開選角,不等倒數", () => {
    cover("vs-bot-pacing");
    const ctl = new MatchController("vsbot-cs", 99, seatsWithHumans(1), CFG);
    expect(ctl.phase.phase).toBe("champSelect");
    expect(ctl.vsBotPacing.soloVsBots).toBe(true);

    // 還沒鎖 → 照樣在選角（否則「早退」跟「一開始就跳過」分不出來）
    ctl.tick();
    expect(ctl.phase.phase).toBe("champSelect");

    expect(ctl.selectChampion(asSeatId(0), "sela").ok).toBe(true);
    // 突變點:把 `advancePhase` 的 `if (expired || this.champSelectEarlyStartDue())`
    // 改回 `if (expired)` → 這裡仍在 champSelect,這一條紅。
    ctl.tick();
    expect(ctl.phase.phase, "鎖定之後不必等 5,000 tick 的倒數").not.toBe("champSelect");
  });

  it("⑤ 兩個人類、只有一個鎖定 → 還是要等（不能被第一個人拖走）", () => {
    cover("vs-bot-pacing");
    const ctl = new MatchController("vsbot-cs2", 99, seatsWithHumans(2), CFG);
    expect(ctl.vsBotPacing.soloVsBots).toBe(false);
    expect(ctl.selectChampion(asSeatId(0), "sela").ok).toBe(true);
    ctl.tick();
    expect(ctl.phase.phase).toBe("champSelect");
  });

  it("⑥ 全 bot 沙盒照樣跑完選角倒數 —— 「全部鎖定」對空集合恆真,那一關必須擋住", () => {
    cover("vs-bot-pacing");
    const ctl = new MatchController("vsbot-cs0", 7, seatsWithHumans(0), CFG);
    for (let i = 0; i < 10; i++) ctl.tick();
    expect(ctl.phase.phase, "沒有人類要等 → 不早退").toBe("champSelect");
  });
});
