/**
 * rating: grade ladder + role/lobby normalisation + per-match ranking
 * (settle-03, settle-04, settle-05). Pure functions — no world needed.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { createMatchStats, type PlayerMatchStats } from "./matchStats";
import { GRADES, GRADE_CUTS, grade, gradeFromScore, compositeScore, perMatchRanks } from "./rating";

/** A scoreboard with the given overrides on a zeroed base. */
function stats(over: Partial<PlayerMatchStats>): PlayerMatchStats {
  return { ...createMatchStats(), ...over };
}

const idx = (g: string): number => GRADES.indexOf(g as never);

describe("grade ladder (settle-03)", () => {
  it("has the 12-step S+..C- ladder with descending cutoffs", () => {
    cover("settle-grade-boundaries");
    expect(GRADES).toEqual(["S+", "S", "S-", "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"]);
    expect(GRADE_CUTS.length).toBe(12);
    for (let i = 1; i < GRADE_CUTS.length; i++) {
      expect(GRADE_CUTS[i]!).toBeLessThan(GRADE_CUTS[i - 1]!);
    }
  });

  it("maps scores to the right band at the boundaries", () => {
    expect(gradeFromScore(1.0)).toBe("S+");
    expect(gradeFromScore(0.9)).toBe("S+"); // exactly the S+ cut
    expect(gradeFromScore(0.8999)).toBe("S");
    expect(gradeFromScore(0.62)).toBe("A"); // exactly the A cut
    expect(gradeFromScore(0.2)).toBe("C"); // exactly the C cut
    expect(gradeFromScore(0.1999)).toBe("C-");
    expect(gradeFromScore(0)).toBe("C-");
  });

  it("grade is monotonic: a strictly better statline never grades worse", () => {
    const lobby = [stats({}), stats({}), stats({})];
    const weak = stats({ kills: 0, deaths: 8, damageDealt: 0 });
    const strong = stats({ kills: 12, assists: 6, deaths: 1, damageDealt: 14000, killParticipation: 8, timeAliveTicks: 3000 });
    const full = [...lobby, weak, strong];
    expect(idx(grade(strong, full, "fighter"))).toBeLessThanOrEqual(idx(grade(weak, full, "fighter")));
  });

  it("a dominant player earns S-tier; the clear bottom player C-tier", () => {
    const monster = stats({
      kills: 15,
      assists: 8,
      deaths: 1,
      damageDealt: 16000,
      killParticipation: 8,
      abilityHits: 20,
      abilityWhiffs: 2,
      timeAliveTicks: 4000,
      ccAppliedTicks: 300,
      multikills: 3,
    });
    const strong = stats({ kills: 9, assists: 5, deaths: 3, damageDealt: 10000, killParticipation: 6, timeAliveTicks: 3000 });
    const mid = stats({ kills: 4, assists: 3, deaths: 4, damageDealt: 5000, killParticipation: 4, timeAliveTicks: 2000 });
    // uniquely worst: fed, no output, and whiffed every skillshot (accuracy 0)
    const bottom = stats({ kills: 0, deaths: 9, damageDealt: 200, abilityHits: 0, abilityWhiffs: 6, timeAliveTicks: 200 });
    const lobby = [monster, strong, mid, bottom];
    expect(idx(grade(monster, lobby, "marksman"))).toBeLessThanOrEqual(idx("S-")); // S+/S/S-
    expect(grade(bottom, lobby, "fighter")).toBe("C-");
  });
});

describe("role normalisation (settle-04)", () => {
  it("a damage-skewed statline grades higher as marksman than as tank", () => {
    cover("settle-grade-role");
    const glass = stats({ damageDealt: 12000, kills: 8, assists: 2, deaths: 3, abilityHits: 15, abilityWhiffs: 3, killParticipation: 6, timeAliveTicks: 2500 });
    const lobby = [glass, stats({}), stats({})];
    const asMarksman = compositeScore(glass, lobby, "marksman");
    const asTank = compositeScore(glass, lobby, "tank");
    expect(asMarksman).toBeGreaterThan(asTank);
    expect(idx(grade(glass, lobby, "marksman"))).toBeLessThanOrEqual(idx(grade(glass, lobby, "tank")));
  });

  it("a soak/CC statline grades higher as tank than as marksman", () => {
    const wall = stats({ damageTaken: 12000, damageBlocked: 8000, ccAppliedTicks: 300, killParticipation: 7, assists: 6, deaths: 4, timeAliveTicks: 3000 });
    const lobby = [wall, stats({}), stats({})];
    expect(compositeScore(wall, lobby, "tank")).toBeGreaterThan(compositeScore(wall, lobby, "marksman"));
  });
});

describe("lobby normalisation (settle-04)", () => {
  it("the SAME statline scores higher against a weak lobby than a strong one", () => {
    cover("settle-grade-lobby");
    const me = stats({ kills: 6, assists: 3, deaths: 3, damageDealt: 6000, killParticipation: 5, timeAliveTicks: 2000 });
    const weakLobby = [me, stats({}), stats({}), stats({})];
    const strongPeer = stats({ kills: 20, assists: 12, deaths: 0, damageDealt: 20000, killParticipation: 8, timeAliveTicks: 4000, ccAppliedTicks: 300 });
    const strongLobby = [me, strongPeer, strongPeer, strongPeer];
    expect(compositeScore(me, weakLobby, "fighter")).toBeGreaterThan(compositeScore(me, strongLobby, "fighter"));
    expect(idx(grade(me, weakLobby, "fighter"))).toBeLessThanOrEqual(idx(grade(me, strongLobby, "fighter")));
  });
});

describe("per-match ranking (settle-05)", () => {
  it("ranks 1..N by composite score, best first", () => {
    cover("settle-rank-order");
    const best = stats({ kills: 12, assists: 6, deaths: 1, damageDealt: 14000, killParticipation: 8, timeAliveTicks: 3000 });
    const mid = stats({ kills: 4, assists: 3, deaths: 4, damageDealt: 6000, killParticipation: 4, timeAliveTicks: 2000 });
    const worst = stats({ kills: 0, deaths: 9, damageDealt: 400 });
    const ranks = perMatchRanks([
      { stats: mid, role: "fighter" },
      { stats: best, role: "fighter" },
      { stats: worst, role: "fighter" },
    ]);
    // ranks align to input order: mid=idx0, best=idx1, worst=idx2
    expect(ranks[1]).toBe(1); // best
    expect(ranks[0]).toBe(2); // mid
    expect(ranks[2]).toBe(3); // worst
    // a valid permutation of 1..N
    expect([...ranks].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("ties break deterministically by input order (ascending seat id)", () => {
    const twin = stats({ kills: 10, assists: 4, deaths: 2, damageDealt: 10000, killParticipation: 7, timeAliveTicks: 2800 });
    const low = stats({ kills: 1, deaths: 6, damageDealt: 800 });
    // two identical top performers + one clearly worse
    const ranks = perMatchRanks([
      { stats: twin, role: "fighter" },
      { stats: twin, role: "fighter" },
      { stats: low, role: "fighter" },
    ]);
    expect(ranks[0]).toBe(1); // earlier index wins the tie
    expect(ranks[1]).toBe(2);
    expect(ranks[2]).toBe(3);
    // fully deterministic: identical inputs -> identical ranks
    expect(perMatchRanks([
      { stats: twin, role: "fighter" },
      { stats: twin, role: "fighter" },
      { stats: low, role: "fighter" },
    ])).toEqual(ranks);
  });
});
