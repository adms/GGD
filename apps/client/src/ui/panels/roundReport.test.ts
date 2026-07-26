/**
 * rr-01..rr-09 (round-report, task #265 / owner's #232): 「每回合進商店：右側顯示
 * S~D 評價 + 改善建議」.
 *
 * FOUR PROPERTIES, and they are the four ways this feature could lie:
 *
 *   1. ONE LADDER. The S~D letter is a FOLD of #25's own 12-step grade, cut by
 *      rating.ts's own `GRADE_CUTS`. Asserted against the imported table, not a
 *      re-typed copy, so a settlement re-tune moves the shop card with it.
 *   2. A LETTER THAT MEANS SOMETHING. The seven canonical rounds are pinned, so
 *      "everyone gets an A" or "D is unreachable" fails loudly.
 *   3. NO INVENTED NUMBERS. Every number a hint renders must appear in that
 *      hint's `evidence`. Checked over EVERY hint every builder can emit.
 *   4. NO GRADE WITHOUT DATA. Round 1, a bye and a champion-less seat produce a
 *      state and a reason, never a letter — the #173 bye trap wearing a grade.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { GRADES, GRADE_CUTS, gradeFromScore, type Grade } from "@ggd/shared/sim/stats/rating";
import { STAT_TICK_TARGET } from "@ggd/shared/sim/economy/itemTiers";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import {
  MAX_ROUND_HINTS,
  ROUND_D_CEILING,
  ROUND_GRADES,
  ROUND_GRADE_COLOR,
  ROUND_GRADE_HEADLINE,
  ROUND_KILL_REF,
  ROUND_WEIGHTS,
  buildRoundReport,
  foldGrade,
  roundCompositeScore,
  roundGrade,
  roundHints,
  roundOutcomeScore,
  roundReportPhaseShows,
  roundStatRows,
  roundSurvivalScore,
  type RoundFacts,
  type RoundReportInput,
} from "./roundReport";

// One beacon per TODO row (docs/todo/round-report.md) — the gate requires a
// unique test id per item, so each property below reports its own.
const LADDER = "round-report-ladder";
const SPREAD = "round-report-spread";
const SAME_RULER = "round-report-same-ruler";
const EVIDENCE = "round-report-evidence";
const NO_FILLER = "round-report-no-filler";
const INSUFFICIENT = "round-report-insufficient";
const ROUND_NUMBER = "round-report-round-number";
const PHASE = "round-report-phase";
const RAW = "round-report-raw-counters";

/** A quiet baseline: nothing to buy, nothing pending, nothing unspent. */
function input(over: Partial<RoundReportInput> = {}): RoundReportInput {
  return {
    phase: "intermission",
    round: 3,
    secondsLeft: 30,
    hasChampion: true,
    facts: { outcome: ROUND_OUTCOME.WON, kills: 1, deaths: 0, alive: true },
    gold: 0,
    unspentPoints: 0,
    itemCount: 0,
    statStacks: 0,
    statCapstonePct: 0,
    pendingOffers: 0,
    cheapestAffordable: null,
    affordableCount: 0,
    ...over,
  };
}

const facts = (over: Partial<RoundFacts> = {}): RoundFacts => ({
  outcome: ROUND_OUTCOME.WON,
  kills: 0,
  deaths: 0,
  alive: true,
  ...over,
});

/* ═════════════════════════════ 1. ONE LADDER ══════════════════════════════ */

describe("the S~D letter is #25's ladder folded, not a second ruler", () => {
  it("folds every one of the 12 settlement grades, and only C- becomes D", () => {
    cover(LADDER);
    const folded = GRADES.map(foldGrade);
    expect(folded).toEqual([
      "S", "S", "S", // S+ S S-
      "A", "A", "A", // A+ A A-
      "B", "B", "B", // B+ B B-
      "C", "C",      // C+ C
      "D",           // C-
    ]);
    // every fold target is a declared round grade, and the fold is monotonic
    for (const g of folded) expect(ROUND_GRADES).toContain(g);
    for (let i = 1; i < folded.length; i++) {
      expect(ROUND_GRADES.indexOf(folded[i]!)).toBeGreaterThanOrEqual(
        ROUND_GRADES.indexOf(folded[i - 1]!),
      );
    }
  });

  it("the D band IS rating.ts's C- band — read from GRADE_CUTS, not re-typed", () => {
    cover(LADDER);
    // the bottom of the `C` band is the top of the `D` band, by construction
    expect(ROUND_D_CEILING).toBe(GRADE_CUTS[GRADES.indexOf("C")]);
    expect(foldGrade(gradeFromScore(ROUND_D_CEILING - 1e-9))).toBe("D");
    expect(foldGrade(gradeFromScore(ROUND_D_CEILING))).toBe("C");
    // and it is reachable: nothing here can floor the score above it
    expect(roundCompositeScore(facts({ outcome: ROUND_OUTCOME.LOST, alive: false, deaths: 1 })))
      .toBeLessThan(ROUND_D_CEILING);
  });

  it("the round grade is literally gradeFromScore(composite), folded", () => {
    cover(SAME_RULER);
    for (const f of [
      facts(),
      facts({ kills: 3 }),
      facts({ outcome: ROUND_OUTCOME.LOST, alive: false, deaths: 2 }),
      facts({ outcome: ROUND_OUTCOME.FOUGHT, kills: 1, deaths: 1, alive: true }),
    ]) {
      expect(roundGrade(f)).toBe(foldGrade(gradeFromScore(roundCompositeScore(f))));
    }
  });

  it("the card prints the 12-step grade it folded from, so the two agree on screen", () => {
    cover(SAME_RULER);
    const rep = buildRoundReport(input({ facts: facts({ kills: 2 }) }));
    expect(rep.state).toBe("graded");
    expect(rep.matchGrade).toBe(gradeFromScore(rep.score!));
    expect(rep.grade).toBe(foldGrade(rep.matchGrade as Grade));
  });

  it("every letter has a colour and a headline", () => {
    cover(LADDER);
    for (const g of ROUND_GRADES) {
      expect(ROUND_GRADE_COLOR[g]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ROUND_GRADE_HEADLINE[g].length).toBeGreaterThan(2);
    }
  });
});

/* ══════════════════ 2. A LETTER THAT MEANS SOMETHING ══════════════════════ */

describe("the round composite spreads across the whole ladder", () => {
  const cases: ReadonlyArray<readonly [string, RoundFacts, string]> = [
    ["won, alive, no kills (carried)", facts({ kills: 0 }), "B"],
    ["won, alive, 1 kill (the median win)", facts({ kills: 1 }), "A"],
    ["won, alive, 2 kills", facts({ kills: 2 }), "S"],
    ["won, alive, solo wipe", facts({ kills: 3 }), "S"],
    ["won but died, no kills", facts({ kills: 0, deaths: 1, alive: false }), "C"],
    [
      "lost, died, traded once",
      facts({ outcome: ROUND_OUTCOME.LOST, kills: 1, deaths: 1, alive: false }),
      "C",
    ],
    [
      "lost, died, did nothing",
      facts({ outcome: ROUND_OUTCOME.LOST, kills: 0, deaths: 1, alive: false }),
      "D",
    ],
  ];

  for (const [label, f, expected] of cases) {
    it(`${label} → ${expected}`, () => {
      cover(SPREAD);
      expect(roundGrade(f)).toBe(expected);
    });
  }

  it("uses every letter S~D across those cases (no ladder collapse)", () => {
    cover(SPREAD);
    expect(new Set(cases.map(([, f]) => roundGrade(f)))).toEqual(new Set(["S", "A", "B", "C", "D"]));
  });

  it("frag saturates at a full enemy team and never above 1", () => {
    cover(SPREAD);
    expect(ROUND_KILL_REF).toBe(3); // a 3v3 duel's whole enemy side
    expect(roundCompositeScore(facts({ kills: 3 }))).toBe(1);
    expect(roundCompositeScore(facts({ kills: 9 }))).toBe(1);
  });

  it("weights are a partition of 1 and frag carries the most", () => {
    cover(SPREAD);
    const w = ROUND_WEIGHTS;
    expect(w.win + w.frag + w.surv).toBeCloseTo(1, 10);
    expect(w.frag).toBeGreaterThan(w.surv);
    expect(w.frag).toBeGreaterThan(w.win);
    // a team result must not be able to decide one player's letter on its own
    expect(w.win).toBeLessThan(0.34);
  });

  it("outcome and survival are monotonic", () => {
    cover(SPREAD);
    expect(roundOutcomeScore(ROUND_OUTCOME.WON)).toBeGreaterThan(
      roundOutcomeScore(ROUND_OUTCOME.FOUGHT),
    );
    expect(roundOutcomeScore(ROUND_OUTCOME.FOUGHT)).toBeGreaterThan(
      roundOutcomeScore(ROUND_OUTCOME.LOST),
    );
    expect(roundSurvivalScore(true, 0)).toBe(1);
    expect(roundSurvivalScore(true, 1)).toBeLessThan(roundSurvivalScore(true, 0));
    expect(roundSurvivalScore(false, 1)).toBeLessThan(roundSurvivalScore(true, 1));
    expect(roundSurvivalScore(false, 3)).toBeLessThan(roundSurvivalScore(false, 1));
  });
});

/* ════════════════════════ 3. NO INVENTED NUMBERS ═════════════════════════ */

/** Numbers the hint actually shows the player. */
function shownNumbers(text: string): string[] {
  return [...text.matchAll(/\d+/g)].map((m) => m[0]!);
}

/** Values the hint claims to have derived from (`field=value,field=value`). */
function evidenceValues(evidence: string): string[] {
  return evidence.split(",").map((pair) => pair.split("=")[1] ?? "");
}

/**
 * Every case that can emit a hint, so the property below is checked over the
 * WHOLE builder rather than one happy path. Each entry is deliberately narrow
 * so `slice(MAX_ROUND_HINTS)` cannot hide a branch.
 */
const HINT_CASES: ReadonlyArray<readonly [string, RoundReportInput]> = [
  ["clean-win", input({ facts: facts({ kills: 2 }) })],
  [
    "traded-well",
    input({ facts: facts({ outcome: ROUND_OUTCOME.LOST, kills: 2, deaths: 1, alive: false }) }),
  ],
  ["pending-offer", input({ pendingOffers: 2 })],
  ["skill-points", input({ unspentPoints: 3 })],
  [
    "unspent-gold",
    input({ gold: 340, cheapestAffordable: 300, affordableCount: 4, itemCount: 2, secondsLeft: 8 }),
  ],
  ["unspent-gold, full bags", input({ gold: 900, cheapestAffordable: 300, affordableCount: 5, itemCount: INVENTORY_SLOTS })],
  ["stat-path", input({ statStacks: 12 })],
  ["deaths", input({ facts: facts({ kills: 1, deaths: 2, alive: false }) })],
  ["no-kills", input({ facts: facts({ kills: 0 }) })],
  ["everything at once", input({
    facts: facts({ outcome: ROUND_OUTCOME.LOST, kills: 0, deaths: 1, alive: false }),
    gold: 1200, cheapestAffordable: 300, affordableCount: 6,
    unspentPoints: 1, pendingOffers: 1, statStacks: 7, secondsLeft: 12,
  })],
];

describe("every hint traces to a real number", () => {
  it("no hint renders a number its evidence does not account for", () => {
    cover(EVIDENCE);
    const problems: string[] = [];
    for (const [label, inp] of HINT_CASES) {
      for (const hint of roundHints(inp)) {
        expect(hint.evidence, `${label}/${hint.key}`).not.toBe("");
        const claimed = new Set(evidenceValues(hint.evidence));
        for (const n of shownNumbers(hint.text)) {
          if (!claimed.has(n)) {
            problems.push(
              `${label}: hint "${hint.key}" shows the number ${n} in 「${hint.text}」 but its ` +
                `evidence (${hint.evidence}) does not account for it — every figure on this card ` +
                `must come from a field, never from prose`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("every evidence entry is a field=value pair with a real value", () => {
    cover(EVIDENCE);
    for (const [label, inp] of HINT_CASES) {
      for (const hint of roundHints(inp)) {
        for (const pair of hint.evidence.split(",")) {
          expect(pair, `${label}/${hint.key}`).toMatch(/^[A-Za-z][A-Za-z0-9]*=\d+$/);
        }
      }
    }
  });

  it("the branches that must fire, fire — with the caller's own numbers in them", () => {
    cover(EVIDENCE);
    const pending = roundHints(input({ pendingOffers: 2 }));
    expect(pending.map((h) => h.key)).toContain("pending-offer");
    expect(pending.find((h) => h.key === "pending-offer")!.text).toContain("2 張");

    const gold = roundHints(
      input({ gold: 340, cheapestAffordable: 300, affordableCount: 4, itemCount: 2, secondsLeft: 8 }),
    );
    const goldHint = gold.find((h) => h.key === "unspent-gold")!;
    expect(goldHint.text).toContain("340 金");
    expect(goldHint.text).toContain("4 件");
    expect(goldHint.text).toContain(`${INVENTORY_SLOTS - 2} 格`);
    expect(goldHint.text).toContain("8 秒");

    const stacks = roundHints(input({ statStacks: 12 }));
    expect(stacks.find((h) => h.key === "stat-path")!.text).toContain(`12/${STAT_TICK_TARGET}`);

    // …and a player with nothing outstanding is not nagged
    expect(roundHints(input({ facts: facts({ kills: 2 }) })).map((h) => h.key)).toEqual([
      "clean-win",
    ]);
  });

  it("never emits a hint the player cannot act on OR verify — and never more than the cap", () => {
    cover(NO_FILLER);
    for (const [, inp] of HINT_CASES) {
      const hints = roundHints(inp);
      expect(hints.length).toBeLessThanOrEqual(MAX_ROUND_HINTS);
      expect(new Set(hints.map((h) => h.key)).size).toBe(hints.length); // no duplicates
      for (const h of hints) expect(h.text.trim().length).toBeGreaterThan(4);
    }
  });

  it("no hint is emitted with nothing to say — an empty list is a legal answer", () => {
    cover(NO_FILLER);
    // fought to a draw, no kills… the no-kills branch still has a real number,
    // so this asserts the SHAPE: hints are never padded to a fixed length.
    const quiet = roundHints(input({ facts: facts({ kills: 1, deaths: 0, alive: true, outcome: ROUND_OUTCOME.FOUGHT }) }));
    expect(quiet).toEqual([]);
  });

  it("gates the gold hint on the shop actually having something affordable", () => {
    cover(NO_FILLER);
    // 300 gold but the cheapest thing costs more → no hint (affordableCount 0)
    expect(
      roundHints(input({ gold: 300, cheapestAffordable: null, affordableCount: 0 })).map((h) => h.key),
    ).not.toContain("unspent-gold");
  });
});

/* ═════════════════════ 4. NO GRADE WITHOUT DATA ═══════════════════════════ */

describe("insufficient data is a state, never a C", () => {
  it("round 1's intermission is BEFORE any combat — no grade", () => {
    cover(INSUFFICIENT);
    const rep = buildRoundReport(input({ round: 1, facts: facts({ outcome: ROUND_OUTCOME.NONE }) }));
    expect(rep.state).toBe("not-started");
    expect(rep.grade).toBeNull();
    expect(rep.matchGrade).toBeNull();
    expect(rep.score).toBeNull();
    expect(rep.hints).toEqual([]);
    expect(rep.headline).toContain("還沒開打");
  });

  it("a BYE round is not a wipe — ROUND_OUTCOME.NONE never grades (#173)", () => {
    cover(INSUFFICIENT);
    // byte-identical to an instant team wipe on every OTHER field, which is
    // exactly why the outcome enum has to be the discriminator.
    const bye = buildRoundReport(
      input({ round: 4, facts: { outcome: ROUND_OUTCOME.NONE, kills: 0, deaths: 0, alive: false } }),
    );
    expect(bye.state).toBe("bye");
    expect(bye.grade).toBeNull();
    expect(bye.headline).toContain("輪空");
    // …and the same seat state WITH a LOST outcome does grade, so the guard is
    // discriminating on the outcome and nothing else
    const wiped = buildRoundReport(
      input({ round: 4, facts: { outcome: ROUND_OUTCOME.LOST, kills: 0, deaths: 0, alive: false } }),
    );
    expect(wiped.state).toBe("graded");
  });

  it("a seat with no champion is not graded", () => {
    cover(INSUFFICIENT);
    const rep = buildRoundReport(input({ hasChampion: false, round: 5 }));
    expect(rep.state).toBe("no-champion");
    expect(rep.grade).toBeNull();
  });

  it("the card is about round − 1, because `round` is the one about to be played", () => {
    cover(ROUND_NUMBER);
    // PhaseMachine: champSelect → round=1 → intermission → combat(1) →
    // resolution → round++ → intermission(2). So at round=2 the finished round
    // is 1. Getting this wrong titles every card with the wrong number.
    expect(buildRoundReport(input({ round: 2 })).roundNumber).toBe(1);
    expect(buildRoundReport(input({ round: 7 })).roundNumber).toBe(6);
    expect(buildRoundReport(input({ round: 1 })).roundNumber).toBe(0);
  });

  it("only the intermission has a finished round to report", () => {
    cover(PHASE);
    expect(roundReportPhaseShows("intermission")).toBe(true);
    for (const p of ["combat", "resolution", "champSelect", "matchEnd", ""]) {
      expect(roundReportPhaseShows(p), p).toBe(false);
    }
  });
});

/* ═══════════════════════════ the stat rows ════════════════════════════════ */

describe("the stat rows show only raw server counters (#125 has nothing to bite on)", () => {
  it("labels the outcome, K/D, survival and gold — and the stat path while it is live", () => {
    cover(RAW);
    const rows = roundStatRows(input({ gold: 550, statStacks: 4 }));
    const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(by.outcome).toBe("勝利");
    expect(by.kd).toBe("1 / 0");
    expect(by.alive).toBe("存活到最後");
    expect(by.gold).toBe("550 g");
    expect(by.stacks).toBe(`4 / ${STAT_TICK_TARGET}`);
  });

  it("drops the stat-path row once the capstone has landed", () => {
    cover(RAW);
    const rows = roundStatRows(input({ statCapstonePct: 40 }));
    expect(rows.map((r) => r.key)).not.toContain("stacks");
  });

  it("names every outcome, including the bye", () => {
    cover(RAW);
    const label = (outcome: number): string =>
      roundStatRows(input({ facts: facts({ outcome }) })).find((r) => r.key === "outcome")!.value;
    expect(label(ROUND_OUTCOME.WON)).toBe("勝利");
    expect(label(ROUND_OUTCOME.LOST)).toBe("敗北");
    expect(label(ROUND_OUTCOME.FOUGHT)).toBe("未分勝負");
    expect(label(ROUND_OUTCOME.NONE)).toBe("輪空");
  });

  it("every value is a counter, a currency or an enum — never a scaled magnitude", () => {
    cover(RAW);
    // #125's rule is about DERIVED combat numbers (damage/cooldown/range). This
    // card renders none, which is what makes it impossible for it to print a
    // base value where the settlement prints a post-multiplier one.
    for (const row of roundStatRows(input({ gold: 120, statStacks: 3 }))) {
      expect(row.value, row.key).toMatch(/^(\d+ \/ \d+|\d+ g|勝利|敗北|未分勝負|輪空|存活到最後|倒在場上)$/);
    }
  });
});
