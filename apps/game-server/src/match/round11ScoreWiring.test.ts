/**
 * ⭐⭐ 第十一回合的**獎勵局計分**真的接上了（GH#1151 G）。
 *
 * > owner 2026-09-02（逐字）：「我說過了是**總分加倍的獎勵局**，所以影響最終計分的獎勵局」
 *
 * ⚠️⭐ 在此之前 `round11Score()` 的三格設定（`survivalWeight` /
 * `scoreMultiplier` / `minContributionForFullSurvival`）**零消費端** ——
 * ⭐ 三格都調得到、⛔ 而調了什麼都不會發生（第一守則：那是裝飾）。
 *
 * ⭐ 這一支問的兩件事，都是**兩個方向**：
 *   ① 倍率轉一格，第十一回合的分數**會動**；⛔ 而第十回合**不會**
 *   ② 貢獻的分母是**本回合**：進場**前**的傷害不算，進場**後**的算
 */
import { describe, it, expect } from "vitest";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const rules = (over: Partial<ArenaRules["round11"]>): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 20,
    maxAliveZombies: 0,
    spawnRampSec: 0,
    scoring: { survivalWeight: 0.5, scoreMultiplier: 1, minContributionForFullSurvival: 0 },
    ...over,
  },
});

/** ⭐ 取下一則**真的**回合分數。⚠️ 先丟掉排在那裡的舊那一則（它是改動之前組好的）。 */
function nextScores(ctl: MatchController): Map<number, number> {
  ctl.takeRoundSettlements();
  let n = 0;
  for (;;) {
    const d = ctl.takeRoundSettlements();
    if (d.length > 0) return new Map(d[0]!.players.map((p) => [p.seatId as unknown as number, p.score]));
    expect(n++, "回合分數要在守衛之內送出").toBeLessThan(2000);
    ctl.tick();
  }
}

/** 跑到某一回合的 combat。 */
function toRound(ctl: MatchController, round: number): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === round && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, `有跑到第 ${round} 回合`).toBe(round);
}

/**
 * ⭐ 跑一場決定性的比賽，回傳 0 號座位在該回合的分數。
 * @param inflateAt 灌 500k 傷害的時機：`"before"` ＝ 進第十一回合**之前**，
 *                  `"after"` ＝ 進場**之後**，`null` ＝ 不灌。
 */
function scoreAt(
  round: number,
  over: Partial<ArenaRules["round11"]>,
  inflateAt: "before" | "after" | null = null,
): number | undefined {
  const ctl = new MatchController("g-ab", 7, allBots(), FAST, undefined, rules(over));
  const bump = () => {
    const seat = ctl.seats.get([...ctl.seats.keys()][0]!)!;
    const st = seat.entityId === null ? undefined : ctl.world.matchStats.get(seat.entityId);
    expect(st, "那個座位真的有統計可以灌").toBeDefined();
    st!.damageDealt += 500_000;
  };
  if (inflateAt === "before") {
    // ⭐ 在**第十回合**灌 —— 進第十一回合時它會被基準線吸收掉。
    toRound(ctl, round - 1);
    bump();
  }
  toRound(ctl, round);
  if (inflateAt === "after") bump();
  return nextScores(ctl).get([...ctl.seats.keys()][0]! as unknown as number);
}

describe("① 獎勵倍率真的在轉（GH#1151 G）", () => {
  it("⭐⭐ 第十一回合：倍率 1 → 2，分數**會動**", () => {
    const one = scoreAt(4, { scoring: { survivalWeight: 0.5, scoreMultiplier: 1, minContributionForFullSurvival: 0 } });
    const two = scoreAt(4, { scoring: { survivalWeight: 0.5, scoreMultiplier: 2, minContributionForFullSurvival: 0 } });
    expect(one, "量得到").toBeDefined();
    expect(two, "⭐ 倍率轉一格 ⇒ 第十一回合的分數確實不同").not.toBe(one);
  });

  it("⛔ 第十回合：同樣轉那一格，分數**逐位元不動**（⭐ 它只管第十一回合）", () => {
    const one = scoreAt(3, { scoring: { survivalWeight: 0.5, scoreMultiplier: 1, minContributionForFullSurvival: 0 } });
    const two = scoreAt(3, { scoring: { survivalWeight: 0.5, scoreMultiplier: 2, minContributionForFullSurvival: 0 } });
    expect(two, "⛔ 獎勵倍率⛔ 不可以外洩到別的回合").toBe(one);
  });
});

describe("② 貢獻的分母是**本回合** —— ⛔ 不是整場（GH#1151 G）", () => {
  it("⛔⛔ 進場**前**打的傷害⛔ 不算進獎勵局", () => {
    const base = scoreAt(4, {}, null);
    expect(scoreAt(4, {}, "before"), "⛔ 前十回合的戰果⛔ 不可以再被乘一次倍率").toBe(base);
  });

  it("⭐ 而進場**後**打的傷害**算** —— ⛔ 一把只驗過單邊的尺不算自證過", () => {
    const base = scoreAt(4, {}, null);
    expect(scoreAt(4, {}, "after"), "⭐ 本回合的戰果確實進得去").not.toBe(base);
  });
});
