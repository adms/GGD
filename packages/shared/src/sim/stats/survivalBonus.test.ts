/**
 * SURVIVAL IS WORTH POINTS — owner, 2026-07-27:
 *   「每回合 RANK 計算，存活下來的人額外 +200分」
 *   「因為明明活到最後卻不是贏家很怪」
 *
 * Before this, placement came only from the damage/KDA composite, so a player
 * who turtled to the last man could place BELOW someone who died early with a
 * big damage number. In a survival mode that reads as broken.
 *
 * ⚠️ THE ASSERTION DIRECTION THAT WOULD PROVE NOTHING: "the survivor's score is
 * higher than it was". Of course it is — you added a positive number. The defect
 * is about ORDER, so the guards below assert that the ORDER FLIPS, on a pair
 * deliberately built so the turtle loses on every combat axis.
 */
import { describe, it, expect } from "vitest";
import { createMatchStats, type PlayerMatchStats } from "./matchStats";
import {
  SURVIVAL_BONUS_PER_ROUND,
  COMBAT_SCORE_SCALE,
  perMatchRanks,
  rankScore,
  survivalBonus,
  type RankEntry,
} from "./rating";

/** A fighter with the given combat output and nothing else remarkable. */
function player(dmg: number, kills: number, deaths: number): PlayerMatchStats {
  const s = createMatchStats();
  s.damageDealt = dmg;
  s.kills = kills;
  s.deaths = deaths;
  s.timeAliveTicks = 30 * 60;
  return s;
}

describe("the survival bonus", () => {
  it("is exactly 200 per round survived", () => {
    expect(SURVIVAL_BONUS_PER_ROUND).toBe(200);
    expect(survivalBonus({ stats: createMatchStats(), role: "fighter", roundsSurvived: 0 })).toBe(0);
    expect(survivalBonus({ stats: createMatchStats(), role: "fighter", roundsSurvived: 1 })).toBe(200);
    expect(survivalBonus({ stats: createMatchStats(), role: "fighter", roundsSurvived: 7 })).toBe(1400);
  });

  it("an ABSENT count is 0, never a guess", () => {
    // a pre-feature server / an old payload must rank exactly as it used to
    const e: RankEntry = { stats: createMatchStats(), role: "fighter" };
    expect(survivalBonus(e)).toBe(0);
  });

  it("negative or fractional counts cannot mint points", () => {
    expect(survivalBonus({ stats: createMatchStats(), role: "fighter", roundsSurvived: -3 })).toBe(0);
    expect(survivalBonus({ stats: createMatchStats(), role: "fighter", roundsSurvived: 2.9 })).toBe(400);
  });
});

describe("surviving actually changes the PLACEMENT", () => {
  // The turtle loses on every combat axis: less damage, fewer kills, more deaths.
  const turtle: RankEntry = { stats: player(1200, 0, 0), role: "fighter", roundsSurvived: 6 };
  const carry: RankEntry = { stats: player(14000, 9, 5), role: "fighter", roundsSurvived: 0 };
  const lobby = [turtle.stats, carry.stats];

  it("without the bonus the carry wins — this is the state owner called 很怪", () => {
    const noBonus = [
      { ...turtle, roundsSurvived: 0 },
      { ...carry, roundsSurvived: 0 },
    ];
    const ranks = perMatchRanks(noBonus);
    expect(ranks[1], "the damage dealer should out-rank the turtle on combat alone").toBe(1);
  });

  it("WITH six rounds survived the turtle takes first", () => {
    const ranks = perMatchRanks([turtle, carry]);
    expect(
      ranks[0],
      `turtle score ${rankScore(turtle, lobby)} vs carry ${rankScore(carry, lobby)} — ` +
        "surviving six rounds did not overturn the placement",
    ).toBe(1);
    expect(ranks[1]).toBe(2);
  });

  it("ONE round is not enough to overturn a dominant game", () => {
    // The bonus must matter without erasing combat entirely. 200 is a fifth of a
    // perfect game (COMBAT_SCORE_SCALE = 1000), so one round cannot flip this.
    const ranks = perMatchRanks([{ ...turtle, roundsSurvived: 1 }, carry]);
    expect(ranks[1], "a single survived round outweighed a 14k-damage 9-kill game").toBe(1);
  });

  it("the score the screen prints IS the score the sort used", () => {
    // ⚠️ The failure this exists for: rank computed one way, number displayed
    // another. Both must come from `rankScore`.
    const entries = [turtle, carry];
    const scores = entries.map((e) => rankScore(e, lobby));
    const ranks = perMatchRanks(entries);
    const byScore = entries
      .map((_, i) => i)
      .sort((a, b) => scores[b]! - scores[a]!)
      .map((i) => i);
    byScore.forEach((idx, place) => expect(ranks[idx]).toBe(place + 1));
  });

  it("the combat half still moves the number at all", () => {
    // Sensitivity check: if `rankScore` ever stopped consulting combat, every
    // assertion above would still pass off the bonus alone.
    const weak = rankScore({ stats: player(0, 0, 9), role: "fighter", roundsSurvived: 3 }, lobby);
    const strong = rankScore({ stats: player(20000, 12, 0), role: "fighter", roundsSurvived: 3 }, lobby);
    expect(strong - weak, "combat performance no longer affects the score").toBeGreaterThan(50);
    expect(COMBAT_SCORE_SCALE).toBe(1000);
  });
});
