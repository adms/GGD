/**
 * progressChart.test — the MVP formula, the per-round ranking, the three series
 * and the coaching lines.
 *
 * The tests are written against the PROPERTIES the owner stated, not against
 * the arithmetic I happened to write, so re-tuning a weight keeps them honest
 * while reverting to the old formula breaks them:
 *   · 「讓活下來的人有比較高的權重」 — a full-HP survivor must beat a chip-damage
 *     corpse. The #280 formula FAILED this (3000 HP vs 7/damage: 428 damage ≈
 *     full health), which is why it was replaced.
 *   · 「復活隊友是一個風險及樂趣很高的指標」 at 300 — one revive outscores a
 *     perfect survival.
 *   · shares, not raw values, so a 50-zombie round cannot drown a 15-zombie one.
 *   · a 0 denominator is 0 for everyone and NEVER NaN.
 */
import { describe, expect, it } from "vitest";
import type { RoundStatDelta, RoundStatsEntry } from "@ggd/shared/protocol/messages";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { TICK_HZ } from "@ggd/shared/constants";
import { ITEM_TIER_PRICE } from "@ggd/shared/sim/economy/itemTiers";
import {
  MAX_PROGRESS_ADVICE,
  MVP_WEIGHTS,
  NO_ADVICE_LINE,
  RANK_AXIS_MAX,
  buildProgressSeries,
  mvpScore,
  progressAdvice,
  roundMvpRanks,
  roundTotals,
  share,
} from "./progressChart";

// ─────────────────────────────────────────────────────────────── fixtures ──

function d(seatId: number, over: Partial<RoundStatDelta> = {}): RoundStatDelta {
  return {
    seatId,
    hpRatio: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 0,
    damageTaken: 0,
    damageBlocked: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    timeAliveTicks: 0,
    revivesPerformed: 0,
    mobKills: 0,
    bye: false,
    ...over,
  };
}

/** A full 12-player round with everyone doing a baseline amount of everything. */
function field(round: number, over: Record<number, Partial<RoundStatDelta>> = {}): RoundStatsEntry {
  return {
    round,
    players: Array.from({ length: 12 }, (_, i) =>
      d(i, {
        hpRatio: 0.5,
        damageDealt: 1000,
        damageTaken: 800,
        timeAliveTicks: 30 * TICK_HZ,
        ...(over[i] ?? {}),
      }),
    ),
  };
}

// ───────────────────────────────────────────────────────────────── share ──

describe("share() — the zero-denominator rule", () => {
  it("is 0, not NaN, when the whole field scored 0 on that axis", () => {
    // ROUND 10 (#215 乾淨總決賽) ships mobsPerWaveCap: 0 — the zombie total is
    // exactly 0 for all 12 players. A bare division makes every MVP score NaN,
    // and NaN compares false against everything, so Array.sort silently returns
    // an arbitrary order that LOOKS like a ranking.
    expect(share(0, 0)).toBe(0);
    expect(Number.isNaN(share(0, 0))).toBe(false);
    expect(share(5, 0)).toBe(0);
    expect(share(-1, 0)).toBe(0);
  });

  it("is the plain ratio otherwise, and unit-free", () => {
    expect(share(1, 4)).toBe(0.25);
    // the whole point of shares: 15 of 60 and 50 of 200 score IDENTICALLY, so a
    // coefficient tuned in round 3 is still right in round 9.
    expect(share(15, 60)).toBe(share(50, 200));
  });
});

describe("a whole round with a zero denominator still ranks cleanly", () => {
  it("round 10 (zero zombies, zero healing) produces finite scores and a 1..12 permutation", () => {
    const r = field(10);
    const totals = roundTotals(r.players);
    expect(totals.mobKills).toBe(0);
    expect(totals.healingDone).toBe(0);
    for (const p of r.players) {
      const s = mvpScore(p, totals);
      expect(Number.isFinite(s), `seat ${p.seatId} scored ${s}`).toBe(true);
    }
    const ranks = roundMvpRanks(r.players);
    expect([...ranks.values()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

// ────────────────────────────────────────────────── the owner's properties ──

describe("生存 outweighs chip damage — the #280 regression", () => {
  it("a full-HP survivor outranks a corpse that landed a couple of autos", () => {
    // THE defect being fixed. Under `hp × 3000 + damage × 7`, 428 damage bought
    // a full health bar, so this exact pair came out the WRONG way round.
    const survivor = d(0, { hpRatio: 1, timeAliveTicks: 90 * TICK_HZ });
    const corpse = d(1, { hpRatio: 0, deaths: 1, damageDealt: 428, timeAliveTicks: 20 * TICK_HZ });
    const players = [survivor, corpse];
    const totals = roundTotals(players);
    expect(mvpScore(survivor, totals)).toBeGreaterThan(mvpScore(corpse, totals));
    expect(roundMvpRanks(players).get(0)).toBe(1);
  });

  it("…and still does when the corpse lands FOUR times that damage", () => {
    // Not a knife-edge: survival has to hold up, or the fix is cosmetic.
    const survivor = d(0, { hpRatio: 1, timeAliveTicks: 90 * TICK_HZ });
    const corpse = d(1, { hpRatio: 0, deaths: 1, damageDealt: 1712, timeAliveTicks: 20 * TICK_HZ });
    const players = [survivor, corpse];
    expect(roundMvpRanks(players).get(0)).toBe(1);
  });
});

describe("revives are the heaviest single act (owner: 300, not 30)", () => {
  it("one revive outscores surviving the round at full health", () => {
    const reviver = d(0, { hpRatio: 0.2, revivesPerformed: 1, timeAliveTicks: 40 * TICK_HZ });
    const survivor = d(1, { hpRatio: 1, timeAliveTicks: 40 * TICK_HZ });
    const totals = roundTotals([reviver, survivor]);
    expect(mvpScore(reviver, totals)).toBeGreaterThan(mvpScore(survivor, totals));
    // and the weight is literally the owner's number
    expect(MVP_WEIGHTS.revive).toBe(300);
    expect(MVP_WEIGHTS.revive).toBeGreaterThan(MVP_WEIGHTS.hpRatio);
  });
});

describe("tanks and supports can score at all (they could not before)", () => {
  it("a pure damage-soak line beats a player who did literally nothing", () => {
    const tank = d(0, { hpRatio: 0.1, damageTaken: 6000, damageBlocked: 4000, timeAliveTicks: 60 * TICK_HZ });
    const idle = d(1, { hpRatio: 0.1, timeAliveTicks: 60 * TICK_HZ });
    const totals = roundTotals([tank, idle]);
    expect(mvpScore(tank, totals)).toBeGreaterThan(mvpScore(idle, totals));
  });

  it("a pure healing + CC line beats a player who did literally nothing", () => {
    const support = d(0, { hpRatio: 0.4, healingDone: 3000, ccAppliedTicks: 10 * TICK_HZ, timeAliveTicks: 60 * TICK_HZ });
    const idle = d(1, { hpRatio: 0.4, timeAliveTicks: 60 * TICK_HZ });
    const totals = roundTotals([support, idle]);
    expect(mvpScore(support, totals)).toBeGreaterThan(mvpScore(idle, totals));
  });
});

describe("死亡 is penalised once, not twice", () => {
  it("a revived player scores ABOVE one who stayed dead but BELOW one who never died", () => {
    // #84's rescue restores HP and time-alive, so those come back; the flat 80
    // does not, which is what keeps a rescue a rescue rather than a freebie.
    const never = d(0, { hpRatio: 1, timeAliveTicks: 90 * TICK_HZ });
    const revived = d(1, { hpRatio: 1, deaths: 1, timeAliveTicks: 90 * TICK_HZ });
    const stayedDead = d(2, { hpRatio: 0, deaths: 1, timeAliveTicks: 30 * TICK_HZ });
    const totals = roundTotals([never, revived, stayedDead]);
    expect(mvpScore(never, totals)).toBeGreaterThan(mvpScore(revived, totals));
    expect(mvpScore(revived, totals)).toBeGreaterThan(mvpScore(stayedDead, totals));
    expect(mvpScore(never, totals) - mvpScore(revived, totals)).toBeCloseTo(MVP_WEIGHTS.death, 6);
  });
});

describe("time-alive separates the round-10 royale, where everyone dies", () => {
  it("two players who both died at 0 HP are still ordered by how long they lasted", () => {
    // R10 has 9 players who are GOING to die. HP% is 0 for all of them, so only
    // the time-alive share can tell them apart.
    const longer = d(0, { hpRatio: 0, deaths: 1, timeAliveTicks: 80 * TICK_HZ });
    const shorter = d(1, { hpRatio: 0, deaths: 1, timeAliveTicks: 8 * TICK_HZ });
    expect(roundMvpRanks([longer, shorter]).get(0)).toBe(1);
  });
});

describe("ranking mechanics", () => {
  it("ties break on seatId so every client draws the same chart", () => {
    const a = d(7, { hpRatio: 0.5, timeAliveTicks: 10 });
    const b = d(2, { hpRatio: 0.5, timeAliveTicks: 10 });
    const ranks = roundMvpRanks([a, b]);
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(7)).toBe(2);
  });

  it("a BYE seat is OMITTED from the ranking, never placed last", () => {
    // The team that drew the bye is parked dead with an all-zero tally, which is
    // byte-identical to being wiped (#173). Scoring it would print 「第 12 名」
    // about a round the player was not in.
    const players = [
      d(0, { hpRatio: 1, damageDealt: 500 }),
      d(1, { hpRatio: 0.5, damageDealt: 100 }),
      d(2, { bye: true }),
    ];
    const ranks = roundMvpRanks(players);
    expect(ranks.has(2)).toBe(false);
    expect(ranks.get(0)).toBe(1);
    expect(ranks.get(1)).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────── the series ──

describe("buildProgressSeries", () => {
  const rounds: RoundStatsEntry[] = [
    field(1, { 0: { damageDealt: 2000, mobKills: 0, hpRatio: 1 } }),
    field(2, { 0: { damageDealt: 500, mobKills: 3, hpRatio: 0 }, 1: { mobKills: 9 } }),
    field(3, { 0: { bye: true }, 1: { bye: true }, 2: { bye: true } }),
  ];

  it("emits one point per round on all three axes for every requested seat", () => {
    const s = buildProgressSeries(rounds, [0, 1, 2], 0);
    expect(s.rounds).toEqual([1, 2, 3]);
    for (const axis of [s.rank, s.damage, s.mobKills]) {
      expect(axis.length).toBe(3);
      for (const line of axis) expect(line.points.length).toBe(3);
    }
  });

  it("marks exactly the local player's line", () => {
    const s = buildProgressSeries(rounds, [0, 1, 2], 1);
    expect(s.rank.filter((l) => l.isLocal).map((l) => l.seatId)).toEqual([1]);
  });

  it("a BYE round is a HOLE (null), not a zero", () => {
    // Plotting 0 damage for a round the player sat out reads as 「你什麼都沒做」,
    // which is a different claim from 「你不在場」.
    const s = buildProgressSeries(rounds, [0], 0);
    expect(s.damage[0]!.points[2]!.value).toBeNull();
    expect(s.rank[0]!.points[2]!.value).toBeNull();
    expect(s.mobKills[0]!.points[2]!.value).toBeNull();
  });

  it("carries the real per-round damage and mob kills, not totals", () => {
    const s = buildProgressSeries(rounds, [0], 0);
    expect(s.damage[0]!.points.map((p) => p.value)).toEqual([2000, 500, null]);
    expect(s.mobKills[0]!.points.map((p) => p.value)).toEqual([0, 3, null]);
  });

  it("the rank axis is at least 12 deep, whatever the round held", () => {
    const s = buildProgressSeries(rounds, [0], 0);
    expect(s.maxRank).toBeGreaterThanOrEqual(RANK_AXIS_MAX);
  });

  it("no history ⇒ empty series, not a crash", () => {
    const s = buildProgressSeries([], [0, 1, 2], 0);
    expect(s.rounds).toEqual([]);
    expect(s.rank.every((l) => l.points.length === 0)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────── the advice ──

/** Every number rendered in a line, as strings — the anti-canned check's input. */
function numbersIn(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

function statsWith(over: Partial<PlayerMatchStats> = {}): PlayerMatchStats {
  return { ...createMatchStats(), ...over };
}

/** Fixtures chosen to light up every branch progressAdvice can emit. */
const ADVICE_CASES: { name: string; input: Parameters<typeof progressAdvice>[0] }[] = [
  {
    name: "farmed fewest zombies + slid down the ranking",
    input: {
      rounds: [
        field(3, { 0: { mobKills: 2, damageDealt: 3000, hpRatio: 1 }, 1: { mobKills: 11 }, 2: { mobKills: 8 } }),
        field(4, { 0: { mobKills: 1, damageDealt: 2500, hpRatio: 1 }, 1: { mobKills: 9 } }),
        field(5, { 0: { mobKills: 0, damageDealt: 200, hpRatio: 0, deaths: 1 }, 1: { mobKills: 12 } }),
        field(6, { 0: { mobKills: 1, damageDealt: 100, hpRatio: 0, deaths: 2 }, 1: { mobKills: 10 } }),
      ],
      localSeatId: 0,
      teamSeatIds: [0, 1, 2],
      stats: statsWith({ abilityHits: 4, abilityWhiffs: 12 }),
      goldLeft: 3200,
    },
  },
  {
    name: "carried the team and climbed",
    input: {
      rounds: [
        field(1, { 0: { mobKills: 0, damageDealt: 100, hpRatio: 0, deaths: 1 } }),
        field(2, { 0: { mobKills: 6, damageDealt: 200, hpRatio: 0, deaths: 1 }, 1: { mobKills: 1 } }),
        field(3, { 0: { mobKills: 9, damageDealt: 6000, hpRatio: 1, kills: 3 }, 1: { mobKills: 1 } }),
        field(4, { 0: { mobKills: 8, damageDealt: 7000, hpRatio: 1, kills: 3, revivesPerformed: 2 }, 1: { mobKills: 0 } }),
      ],
      localSeatId: 0,
      teamSeatIds: [0, 1, 2],
      stats: statsWith({ abilityHits: 18, abilityWhiffs: 4 }),
      goldLeft: 40,
    },
  },
  {
    name: "died out early in the last-round royale",
    input: {
      rounds: [
        field(9, { 0: { hpRatio: 0, deaths: 1, timeAliveTicks: 10 * TICK_HZ } }),
        field(10, {
          0: { hpRatio: 0, deaths: 1, timeAliveTicks: 6 * TICK_HZ },
          5: { hpRatio: 1, timeAliveTicks: 95 * TICK_HZ },
        }),
      ],
      localSeatId: 0,
      teamSeatIds: [0, 1, 2],
      stats: statsWith({ abilityHits: 3, abilityWhiffs: 2 }),
      goldLeft: 0,
    },
  },
];

describe("progressAdvice — every line quotes a real number", () => {
  it("EVERY number printed in a line appears in that line's evidence", () => {
    // THE anti-罐頭 guard, and the reason `evidence` is mandatory. A canned
    // string ("多練習走位!") has no number to point at, so it cannot pass —
    // and a line that invents a figure cannot pass either.
    let seen = 0;
    for (const c of ADVICE_CASES) {
      for (const a of progressAdvice(c.input)) {
        seen++;
        expect(a.evidence, `${c.name}/${a.key}: empty evidence`).not.toBe("");
        const values = a.evidence.split(",").flatMap((kv) => numbersIn(kv.split("=")[1] ?? ""));
        for (const n of numbersIn(a.text)) {
          expect(
            values,
            `${c.name}/${a.key}: 「${a.text}」 prints ${n}, which is in no evidence field (${a.evidence})`,
          ).toContain(n);
        }
      }
    }
    expect(seen, "no advice was produced by ANY fixture — the guard is vacuous").toBeGreaterThan(4);
  });

  it("different matches produce different advice — it is not one canned set", () => {
    const texts = ADVICE_CASES.map((c) => progressAdvice(c.input).map((a) => a.text).join("|"));
    expect(new Set(texts).size, "every fixture produced identical advice").toBe(texts.length);
    // and the KEYS differ too, so it is different branches firing rather than
    // one template with the numbers swapped
    const keys = ADVICE_CASES.map((c) => progressAdvice(c.input).map((a) => a.key).join(","));
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it("names the actual zombie-heavy rounds and the actual gap", () => {
    const a = progressAdvice(ADVICE_CASES[0]!.input).find((x) => x.key === "mob-low");
    expect(a, "the fewest-zombies line did not fire on a fixture built for it").toBeDefined();
    // 4 zombies over rounds 3-6, best teammate 42
    expect(a!.text).toContain("第 3-6 回合");
    expect(a!.text).toContain("4 隻");
    expect(a!.text).toContain("42 隻");
  });

  it("quotes the real unspent balance and converts it to real items", () => {
    const a = progressAdvice(ADVICE_CASES[0]!.input).find((x) => x.key === "unspent-gold");
    expect(a).toBeDefined();
    expect(a!.text).toContain("3200 金");
    expect(a!.text).toContain(`${Math.floor(3200 / ITEM_TIER_PRICE.POWERFUL)} 件`);
  });

  it("quotes the real accuracy, both directions", () => {
    const low = progressAdvice(ADVICE_CASES[0]!.input).find((x) => x.key === "accuracy-low");
    expect(low!.text).toContain("25%"); // 4 / 16
    const high = progressAdvice(ADVICE_CASES[1]!.input).find((x) => x.key === "accuracy-high");
    expect(high!.text).toContain("82%"); // 18 / 22
  });

  it("says how long you lasted in the last round vs the best in the lobby", () => {
    const a = progressAdvice(ADVICE_CASES[2]!.input).find((x) => x.key === "last-stand");
    expect(a).toBeDefined();
    expect(a!.text).toContain("6 秒");
    expect(a!.text).toContain("95 秒");
  });

  it("is capped, so the panel stays readable", () => {
    for (const c of ADVICE_CASES) {
      expect(progressAdvice(c.input).length).toBeLessThanOrEqual(MAX_PROGRESS_ADVICE);
    }
  });

  it("an unremarkable match yields NO invented advice", () => {
    // 想不出有依據的建議時不要硬擠一條.
    const flat: RoundStatsEntry[] = [field(1), field(2)];
    const out = progressAdvice({
      rounds: flat,
      localSeatId: 0,
      teamSeatIds: [0, 1, 2],
      stats: statsWith(),
      goldLeft: 0,
    });
    expect(out).toEqual([]);
    expect(NO_ADVICE_LINE.length).toBeGreaterThan(0);
    expect(numbersIn(NO_ADVICE_LINE), "the fallback line must invent no figure").toEqual([]);
  });
});
