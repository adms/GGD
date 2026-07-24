/**
 * teamHealth.test.ts — the LoL-Arena TEAM HEALTH elimination model.
 *
 * The owner replaced the old lives table with Arena's model:
 * 「選1 改成競技場那套 —— 20 點生命值、2/4/6 遞增、第 5 回合起有 High Stakes 回血 15」.
 *
 * `match.test.ts` covers the pure `teamHealthLost` band table. THIS file covers
 * the parts that only exist once the model is wired into a running match:
 *
 *   • High Stakes actually pays +15 to a duel winner, and is INERT on a bye
 *     round (the fairness decision — see PairedDuels.isHighStakesRound);
 *   • the Lucky Dice stand-in: a High Stakes winner's next augment card is
 *     4-choose-1, and the bonus is spent exactly once;
 *   • the reservoir really comes from `config.match@1` and is really honoured;
 *   • the ELIMINATION CURVE the model produces, measured end-to-end on real
 *     bot matches — the number that justified departing from Arena's flat −6.
 *
 * WHY THE CURVE IS PINNED HERE. The escalation past round 7 is not a taste
 * call, it is the output of a measurement (30 real seeds; see the derivation
 * block in PairedDuels.ts). A pure unit test on the band table cannot catch the
 * failure that matters — Arena's raw numbers pass every band assertion and
 * still produce 26-round matches, because the damage that matters comes from
 * the interaction of the curve with `pairTeams`' bye and with the High Stakes
 * payout. So this asserts the emergent property directly, with bands wide
 * enough that ordinary content churn does not trip it but a re-flattened curve
 * does.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asTeamId } from "@ggd/shared/ids";
import { ContentLoader, Configs, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { Augments } from "@ggd/shared/sim/content/registry";
import { MatchController, type SeatSpec } from "./MatchController";
import {
  teamHealthLost,
  isHighStakesRound,
  HIGH_STAKES_REWARD,
  HIGH_STAKES_FIRST_ROUND,
  HIGH_STAKES_PERIOD,
  DEFAULT_STARTING_TEAM_HEALTH,
  MAX_STARTING_TEAM_HEALTH,
} from "./PairedDuels";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStartingTeamHealth, resolveStartingLives } from "./phaseConfig";
import { resolveArenaRules, type ArenaRules } from "./arenaRules";

/**
 * The REAL content tree. The Lucky-Dice test needs it for two reasons the
 * skeleton cannot supply: the skeleton has 3 augments total (a 4-wide card is
 * impossible), and `DEFAULT_ARENA_RULES` schedules augments on rounds 1/3/5
 * only, so the round AFTER a High Stakes round has no card to widen. Loading
 * the shipped tree also means this test exercises the actual 16-card prismatic
 * pool the draft has to survive a 13-round match on.
 */
let ARENA: ArenaRules;
/** Total shipped augments — the draw-without-replacement budget a match spends. */
let AUG_POOL_SIZE = 0;
beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const loaded = await new ContentLoader(new FsContentSource(join(here, "../../../../content"))).load();
  registerAll(loaded.store);
  ARENA = resolveArenaRules();
  AUG_POOL_SIZE = Augments.all().length;
});

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Fast phases so a 10-13 round match still runs in a few thousand ticks. */
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

function runToEnd(ctl: MatchController, maxTicks = 120_000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < maxTicks) {
    ctl.tick();
    n++;
  }
  return n;
}

describe("High Stakes schedule (team-health-high-stakes)", () => {
  it("fires on round 5 and every 4th round after — 5, 9, 13 — and never before", () => {
    cover("team-health-high-stakes");
    expect(HIGH_STAKES_FIRST_ROUND).toBe(5);
    expect(HIGH_STAKES_PERIOD).toBe(4);
    expect(HIGH_STAKES_REWARD).toBe(15);
    const firing = [];
    for (let r = 1; r <= 20; r++) if (isHighStakesRound(r, false)) firing.push(r);
    expect(firing).toEqual([5, 9, 13, 17]);
  });

  it("is INERT on a bye round, so a rotating sit-out is never a hidden penalty", () => {
    cover("team-health-high-stakes-bye");
    // Same rounds, but with someone sitting out: nobody is paid. Paying only
    // the duel winner would make a bye cost the sit-out team an expected +7.5
    // while saving it an expected −3, silently turning a gift into a penalty;
    // paying the bye too would grow a 3-team pool by 24 in the slowest phase
    // of the match. Uniform beats rotationally-arbitrary.
    for (const r of [5, 9, 13, 17]) {
      expect(isHighStakesRound(r, false)).toBe(true);
      expect(isHighStakesRound(r, true)).toBe(false);
    }
  });
});

describe("the reservoir is content, not a constant (team-health-config)", () => {
  it("reads match.startingTeamLives and hands it to the controller", () => {
    cover("team-health-config");
    const doc = (startingTeamLives: number): unknown => ({
      id: "config.match",
      schema: "config@1",
      match: { teamCount: 4, teamSize: 3, startingTeamLives },
    });
    Configs.register(doc(20) as never);
    expect(resolveStartingTeamHealth()).toBe(20);
    // the deprecated alias MatchRoom still calls must resolve identically
    expect(resolveStartingLives).toBe(resolveStartingTeamHealth);

    const ctl = new MatchController("cfg", 7, allBots(), FAST, resolveStartingTeamHealth());
    expect(ctl.startingTeamHealth).toBe(20);
    expect([...ctl.teamHealth.values()]).toEqual([20, 20, 20, 20]);
    // …and the deprecated `lives` alias is the SAME map, not a copy
    expect(ctl.lives).toBe(ctl.teamHealth);
    expect(ctl.startingLives).toBe(20);

    // an absurd edit is clamped rather than shipped as an unfinishable room
    Configs.register(doc(2000) as never);
    expect(resolveStartingTeamHealth()).toBe(MAX_STARTING_TEAM_HEALTH);
    Configs.register(doc(0) as never);
    expect(resolveStartingTeamHealth()).toBe(DEFAULT_STARTING_TEAM_HEALTH);
  });

  it("the SHIPPED config.match.json is on the Arena reservoir", async () => {
    cover("team-health-shipped-config");
    const { readFileSync } = await import("node:fs");
    const here = dirname(fileURLToPath(import.meta.url));
    const shipped = JSON.parse(
      readFileSync(join(here, "../../../../content/config/config.match.json"), "utf8"),
    ) as { match: { startingTeamLives: number } };
    expect(shipped.match.startingTeamLives).toBe(20);
  });
});

describe("settleRound applies the team-health model (team-health-settle)", () => {
  it("charges the round band to the loser and pays High Stakes to the winner", () => {
    cover("team-health-settle");
    const ctl = new MatchController("settle", 4242, allBots(), FAST, 20);
    // Drive to round 5's combat — the first High Stakes round — and settle it.
    let guard = 0;
    while (!(ctl.phase.phase === "combat" && ctl.phase.round === 5) && guard++ < 200_000) ctl.tick();
    expect(ctl.phase.round).toBe(5);
    expect(ctl.bye).toBeNull(); // 4 teams still in, so High Stakes is live

    const before = new Map(ctl.teamHealth);
    const pairings = [...ctl.pairings];
    while (ctl.phase.phase === "combat" && guard++ < 200_000) ctl.tick();

    for (const p of pairings) {
      const a = ctl.teamHealth.get(p.sideA)!;
      const b = ctl.teamHealth.get(p.sideB)!;
      const a0 = before.get(p.sideA)!;
      const b0 = before.get(p.sideB)!;
      // exactly one side gained +15 and the other lost the round-5 band (−4)
      const gained = a > a0 ? p.sideA : p.sideB;
      const lost = gained === p.sideA ? p.sideB : p.sideA;
      expect(ctl.teamHealth.get(gained)).toBe((before.get(gained) ?? 0) + HIGH_STAKES_REWARD);
      expect(ctl.teamHealth.get(lost)).toBe(Math.max(0, (before.get(lost) ?? 0) - teamHealthLost(5)));
    }
  });

  it("gives the High Stakes winner a 4-wide augment card, once", () => {
    cover("team-health-lucky-dice");
    // GGD has no player-facing reroll (the only `rerollOffers` is a dev cheat),
    // so Arena's Lucky Dice is substituted with offer WIDTH. Round 5 is both a
    // High Stakes round AND a prismatic augment round, so the winners' round-6
    // card is the one that must be 4-wide.
    const ctl = new MatchController("dice", 4242, allBots(), FAST, 20, ARENA);
    let guard = 0;
    const widthByRound = new Map<number, Map<number, number>>(); // round -> team -> width
    let hsWinners: number[] = [];
    while (ctl.phase.phase !== "matchEnd" && guard++ < 200_000) {
      const roundBefore = ctl.phase.round;
      const phaseBefore = ctl.phase.phase;
      ctl.tick();
      // capture augment-card widths per team as offers open
      if (ctl.phase.phase === "intermission" && phaseBefore !== "intermission") {
        const perTeam = new Map<number, number>();
        for (const [, o] of ctl.offers) {
          if (o.kind !== "augment") continue;
          const seat = ctl.seats.get(o.seatId);
          if (seat) perTeam.set(seat.teamId, o.choices.length);
        }
        if (perTeam.size) widthByRound.set(ctl.phase.round, perTeam);
      }
      // remember who won round 5's duels (the High Stakes payout round)
      if (roundBefore === 5 && phaseBefore === "combat" && ctl.phase.phase !== "combat") {
        hsWinners = [...ctl.roundOutcome.entries()]
          .filter(([, o]) => o === ROUND_OUTCOME.WON)
          .map(([t]) => t as number);
      }
    }
    expect(hsWinners.length).toBeGreaterThan(0);
    const r6 = widthByRound.get(6);
    expect(r6).toBeDefined();
    for (const teamId of hsWinners) expect(r6!.get(teamId)).toBe(4);
    // …and it is SPENT: the same team is back to 3 on its next card.
    const r7 = widthByRound.get(7);
    if (r7) for (const teamId of hsWinners) if (r7.has(teamId)) expect(r7.get(teamId)).toBe(3);
  });
});

describe("the elimination curve this model actually produces (team-health-curve)", () => {
  it("lands inside Arena's 7-13 round band, and EVERY match reaches round 6", () => {
    cover("team-health-curve");
    // This is the assertion that justifies the one departure from the owner's
    // 「2/4/6 遞增」: Arena's flat −6 measured median 15 / max 26 here, because
    // GGD's 4-team bracket gives a bye at 3 alive and High Stakes outpaces a
    // flat cost. See PairedDuels.TEAM_HEALTH_LATE_STEP.
    const rounds: number[] = [];
    for (let s = 0; s < 12; s++) {
      const ctl = new MatchController(`curve${s}`, 1000 + s * 7919, allBots(), FAST, 20);
      runToEnd(ctl);
      expect(ctl.phase.phase).toBe("matchEnd");
      expect(ctl.result!.teams.map((t) => t.placement).sort()).toEqual([1, 2, 3, 4]);
      rounds.push(ctl.result!.rounds);
    }
    const sorted = [...rounds].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;

    // ROUND 6 IS THE POINT. The 7,500g stat path and the #104 capstone gate on
    // `statStacks >= 20 && round >= 6`; at the old 3 lives, 0 of 30 measured
    // matches ever got there. Every match must now clear it.
    expect(Math.min(...rounds)).toBeGreaterThanOrEqual(6);
    // …and the tail must stay bounded, which a flat −6 does not.
    expect(Math.max(...rounds)).toBeLessThanOrEqual(16);
    expect(median).toBeGreaterThanOrEqual(8);
    expect(median).toBeLessThanOrEqual(13);
  });

  it("a losing streak dies on round 7 — the floor Arena's 20/2/4/6 defines", () => {
    cover("team-health-floor");
    // 20 → 18 → 16 → 14 → 10 → 6 → 2 → 0. Pure arithmetic on the band table, so
    // it pins the reservoir and the first two bands together: change either and
    // the promise "you survive six losses" breaks.
    let hp = DEFAULT_STARTING_TEAM_HEALTH;
    let round = 0;
    while (hp > 0) {
      round++;
      hp -= teamHealthLost(round);
    }
    expect(round).toBe(7);
  });
});

describe("the augment pool outlives the LONGEST POSSIBLE match (team-health-augment-headroom)", () => {
  /**
   * Enumerate EVERY reachable (round, health-vector) state — not a sample.
   *
   * The 12-seed curve test above measures what matches DO run; this measures
   * what a match COULD run, over every possible assignment of duel winners, and
   * is therefore an upper bound rather than an observation. It mirrors the real
   * rules exactly: `pairTeams`' 3-round rotation and its bye at 3 alive,
   * `teamHealthLost`'s bands, and `isHighStakesRound`'s bye-inert +15.
   *
   * The frontier stays small (~16k states at the shipped reservoir) because the
   * escalation past round 7 outruns the +15, which is the whole reason
   * TEAM_HEALTH_LATE_STEP exists — if someone re-flattens the late cost this
   * search stops terminating quickly and the round assertion below fails, which
   * is exactly the alarm we want.
   */
  function longestPossibleMatch(startingHealth: number, roundCap = 40): number {
    const FOUR_TEAM_SCHEDULE: [number, number][][] = [
      [
        [0, 1],
        [2, 3],
      ],
      [
        [0, 2],
        [1, 3],
      ],
      [
        [0, 3],
        [1, 2],
      ],
    ];
    let frontier = new Set<string>([JSON.stringify([startingHealth, startingHealth, startingHealth, startingHealth])]);
    let deepest = 0;
    for (let round = 1; round <= roundCap && frontier.size > 0; round++) {
      const next = new Set<string>();
      for (const key of frontier) {
        const h = JSON.parse(key) as number[];
        const alive = [0, 1, 2, 3].filter((i) => h[i]! > 0);
        if (alive.length <= 1) continue;
        deepest = Math.max(deepest, round);
        let pairings: [number, number][];
        let hasBye = false;
        if (alive.length === 4) {
          pairings = FOUR_TEAM_SCHEDULE[(round - 1) % 3]!.map(([a, b]) => [alive[a]!, alive[b]!]);
        } else if (alive.length === 3) {
          const bye = alive[(round - 1) % 3]!;
          const f = alive.filter((t) => t !== bye);
          pairings = [[f[0]!, f[1]!]];
          hasBye = true;
        } else {
          pairings = [[alive[0]!, alive[1]!]];
        }
        const hs = isHighStakesRound(round, hasBye);
        const cost = teamHealthLost(round);
        for (let mask = 0; mask < 1 << pairings.length; mask++) {
          const nh = [...h];
          pairings.forEach(([a, b], k) => {
            const win = (mask >> k) & 1 ? a : b;
            const lose = (mask >> k) & 1 ? b : a;
            nh[lose] = Math.max(0, nh[lose]! - cost);
            if (hs) nh[win] = nh[win]! + HIGH_STAKES_REWARD;
          });
          if (nh.filter((x) => x > 0).length > 1) next.add(JSON.stringify(nh));
        }
      }
      frontier = next;
    }
    return deepest;
  }

  it("cannot run long enough to empty any champion's augment pool", () => {
    cover("team-health-augment-headroom");
    // A champion draws exactly ONE augment per round (arena-rules schedules a
    // tier on every round, and the overflow rule keeps doing so forever), and
    // `offerAugments` draws WITHOUT replacement across the whole pool once the
    // requested tier is dry. So on round R it owns R-1 and the draft can still
    // see poolSize-(R-1). A card is short only when that drops below its width.
    const poolSize = AUG_POOL_SIZE;
    // 4 is the widest card the game can ask for: offerCount 3 + the High Stakes
    // draft bonus. Solving poolSize-(R-1) < 4 gives the first round that could
    // ever come up short.
    const widestCard = ARENA.offerCount + 1;
    const firstShortRound = poolSize - widestCard + 2;

    const longest = longestPossibleMatch(resolveStartingTeamHealth());
    // The measured band is 10-13 rounds; the exhaustive bound is what protects
    // the pool against a seed nobody rolled.
    expect(longest).toBeLessThanOrEqual(20);
    expect(longest).toBeLessThan(firstShortRound);

    // …and the same must hold at the biggest reservoir content is allowed to
    // author, or an operator could type a legal number that starves the draft.
    const longestAtMax = longestPossibleMatch(MAX_STARTING_TEAM_HEALTH);
    expect(longestAtMax).toBeLessThan(firstShortRound);
  });
});

describe("no team is eliminated by a rounding accident (team-health-floor-clamp)", () => {
  it("health never goes negative and elimination locks a placement exactly once", () => {
    cover("team-health-floor-clamp");
    const ctl = new MatchController("clamp", 31337, allBots(), FAST, 20);
    // Start a team one point from death: the round band will overshoot it.
    let guard = 0;
    while (ctl.phase.phase !== "combat" && guard++ < 10_000) ctl.tick();
    ctl.teamHealth.set(asTeamId(0), 1);
    ctl.teamHealth.set(asTeamId(1), 1);
    runToEnd(ctl);
    for (const hp of ctl.teamHealth.values()) expect(hp).toBeGreaterThanOrEqual(0);
    const places = [...ctl.placements.values()].sort();
    expect(new Set(places).size).toBe(places.length); // no duplicate placement
  });
});
