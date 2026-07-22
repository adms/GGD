/**
 * settle-grade-color / settle-hints / settle-stat-format / settle-rank-table:
 * the pure settlement view-model — grade→colour/headline, data-driven reflection
 * hints, stat formatters, and the ranking-table sort. No React/DOM.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { Grade } from "@ggd/shared/sim/stats/rating";
import type { SettlementPlayer } from "@ggd/shared/protocol/messages";
import {
  gradeTier,
  gradeColor,
  gradeHeadline,
  formatAccuracy,
  accuracyRatio,
  formatKda,
  kdaRatio,
  ticksToSeconds,
  buildStatBreakdown,
  reflectionHints,
  sortSettlementRanking,
  localSettlementCard,
  isWinner,
} from "./settlementModel";

function stats(over: Partial<PlayerMatchStats> = {}): PlayerMatchStats {
  return { ...createMatchStats(), ...over };
}

function player(over: Partial<SettlementPlayer> = {}): SettlementPlayer {
  return {
    seatId: 0,
    accountId: "acc",
    champ: "sela",
    teamId: 0,
    role: "mage",
    grade: "B",
    rank: 1,
    stats: stats(),
    ...over,
  };
}

describe("grade → colour / tier / headline (settle-grade-color)", () => {
  it("maps every grade to its letter tier", () => {
    cover("settle-grade-color");
    const cases: [Grade, string][] = [
      ["S+", "S"], ["S", "S"], ["S-", "S"],
      ["A+", "A"], ["A", "A"], ["A-", "A"],
      ["B+", "B"], ["B", "B"], ["B-", "B"],
      ["C+", "C"], ["C", "C"], ["C-", "C"],
    ];
    for (const [g, tier] of cases) expect(gradeTier(g)).toBe(tier);
  });

  it("S grades are gold, C grades are grey; each tier has a distinct colour", () => {
    cover("settle-grade-color");
    expect(gradeColor("S+")).toBe("#f2c637"); // gold
    expect(gradeColor("S")).toBe(gradeColor("S-")); // same tier ⇒ same colour
    const colors = new Set([gradeColor("S"), gradeColor("A"), gradeColor("B"), gradeColor("C")]);
    expect(colors.size).toBe(4); // four distinct tier colours
  });

  it("gives every grade a non-empty headline; S+ is louder than a bare tier", () => {
    cover("settle-grade-color");
    for (const g of ["S+", "S", "A", "B", "C-"] as Grade[]) {
      expect(gradeHeadline(g).length).toBeGreaterThan(0);
    }
    expect(gradeHeadline("S+")).not.toBe(gradeHeadline("S"));
  });
});

describe("stat formatters + breakdown (settle-stat-format)", () => {
  it("formats accuracy, and shows — when no skillshots were thrown", () => {
    cover("settle-stat-format");
    expect(formatAccuracy(stats({ abilityHits: 0, abilityWhiffs: 0 }))).toBe("—");
    expect(accuracyRatio(stats({ abilityHits: 0, abilityWhiffs: 0 }))).toBeNull();
    expect(formatAccuracy(stats({ abilityHits: 3, abilityWhiffs: 1 }))).toBe("75%");
    expect(accuracyRatio(stats({ abilityHits: 3, abilityWhiffs: 1 }))).toBeCloseTo(0.75, 6);
  });

  it("formats KDA tally + ratio and converts ticks to seconds", () => {
    cover("settle-stat-format");
    const s = stats({ kills: 5, deaths: 2, assists: 7 });
    expect(formatKda(s)).toBe("5 / 2 / 7");
    expect(kdaRatio(s)).toBeCloseTo(6, 6);
    expect(kdaRatio(stats({ kills: 3, deaths: 0, assists: 0 }))).toBeCloseTo(3, 6); // /max(1,D)
    expect(ticksToSeconds(300)).toBe(10); // 30 Hz
  });

  it("builds a non-empty, labelled breakdown", () => {
    cover("settle-stat-format");
    const rows = buildStatBreakdown(stats({ damageDealt: 12345, ccAppliedTicks: 150 }));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.every((r) => r.label.length > 0 && r.value.length > 0)).toBe(true);
    expect(rows.find((r) => r.key === "damageDealt")?.value).toBe("12,345");
    expect(rows.find((r) => r.key === "cc")?.value).toBe("5s");
  });
});

describe("reflection hints (settle-hints)", () => {
  it("flags low skillshot accuracy with the coaching tip", () => {
    cover("settle-hints");
    const hints = reflectionHints(stats({ abilityHits: 1, abilityWhiffs: 9 }), "mage", "C");
    expect(hints.some((h) => h.tone === "tip" && h.text.includes("命中率偏低"))).toBe(true);
  });

  it("praises precise skillshots", () => {
    cover("settle-hints");
    const hints = reflectionHints(stats({ abilityHits: 9, abilityWhiffs: 1 }), "mage", "S");
    expect(hints.some((h) => h.tone === "praise" && h.text.includes("命中精準"))).toBe(true);
  });

  it("flags a high death count", () => {
    cover("settle-hints");
    const hints = reflectionHints(stats({ deaths: 8, kills: 1, assists: 2 }), "fighter", "C");
    expect(hints.some((h) => h.tone === "tip" && h.text.includes("陣亡次數偏高"))).toBe(true);
  });

  it("gives role-specific praise (support sustain) and caps the list", () => {
    cover("settle-hints");
    const hints = reflectionHints(
      stats({ healingDone: 5000, ccAppliedTicks: 300, flowersEaten: 4, multikills: 2 }),
      "support",
      "S",
    );
    expect(hints.some((h) => h.text.includes("治療量充沛"))).toBe(true);
    expect(hints.length).toBeLessThanOrEqual(3);
  });

  it("always returns at least one line (fallback on an empty statline)", () => {
    cover("settle-hints");
    expect(reflectionHints(stats(), "mage", "S").length).toBeGreaterThanOrEqual(1);
    expect(reflectionHints(stats(), "mage", "C").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ranking table builder (settle-rank-table)", () => {
  it("sorts ascending by rank, ties broken by seatId, without mutating input", () => {
    cover("settle-rank-table");
    const input = [
      player({ seatId: 3, rank: 2 }),
      player({ seatId: 1, rank: 1 }),
      player({ seatId: 5, rank: 2 }),
      player({ seatId: 2, rank: 3 }),
    ];
    const snapshot = input.map((p) => p.seatId);
    const sorted = sortSettlementRanking(input);
    expect(sorted.map((p) => [p.rank, p.seatId])).toEqual([
      [1, 1],
      [2, 3],
      [2, 5],
      [3, 2],
    ]);
    expect(input.map((p) => p.seatId)).toEqual(snapshot); // pure
  });

  it("finds the local card by seat and resolves the winner flag", () => {
    cover("settle-rank-table");
    const players = [player({ seatId: 0, teamId: 0 }), player({ seatId: 4, teamId: 1 })];
    expect(localSettlementCard(players, 4)?.seatId).toBe(4);
    expect(localSettlementCard(players, 9)).toBeNull();
    expect(localSettlementCard(players, null)).toBeNull();
    expect(isWinner(1, 1)).toBe(true);
    expect(isWinner(1, 0)).toBe(false);
    expect(isWinner(-1, 0)).toBe(false); // undecided
  });
});
