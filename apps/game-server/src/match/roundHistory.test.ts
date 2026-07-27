/**
 * roundHistory — the settlement payload must carry PER-ROUND deltas.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `MatchSettlement` shipped whole-match totals only. `roundReport.ts` §2(a)
 * states the consequence outright: 「there is no such number as "the damage I
 * did this round" anywhere in the system, server included」. So a 每回合戰績
 * chart had NOTHING to plot — the data had to be created, not merely surfaced.
 *
 * This suite drives a REAL 12-bot match to its end and asserts the shape and
 * the arithmetic of what comes out. It deliberately does NOT hand-build a
 * controller state: the whole class of defect here is "the recorder is never
 * called" / "it is called at the wrong moment", and only a real match run can
 * catch that.
 */
import { describe, it, expect } from "vitest";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import { MatchController, type SeatSpec } from "./MatchController";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function runToEnd(ctl: MatchController, guard = 200000): void {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < guard) {
    ctl.tick();
    n++;
  }
}

function finished(seed = 4242): MatchController {
  const ctl = new MatchController(`rh-${seed}`, seed, allBots(), FAST);
  runToEnd(ctl);
  return ctl;
}

/**
 * Run seed 99 to the end, capturing the FIRST mid-match elimination payload
 * (#193) two different ways — and the difference between the two is the whole
 * point of the aliasing tests below.
 *
 *  · `live` is the exact object `takeEliminationSettlements()` returned. Not
 *    copied, not touched. It is the only thing that can ever show a leak.
 *  · `captured` is that payload frozen at drain time, the way MatchRoom freezes
 *    it when it serialises to JSON on the same tick. Needed for the ARITHMETIC
 *    assertions, because `SettlementPlayer.stats` is the live `world.matchStats`
 *    object and keeps moving until the match ends.
 *
 * Asserting aliasing on `captured` is a contradiction: JSON.parse(JSON.stringify)
 * hands back a brand-new tree, so its length is frozen and its references are
 * all fresh no matter what `buildSettlement` did. The previous version of this
 * suite did exactly that and its "it was a copy" check could not fail.
 */
function runToFirstElimination(): {
  ctl: MatchController;
  live: MatchSettlement | null;
  captured: MatchSettlement | null;
  /** how many rounds the LIVE payload carried at the instant it was drained */
  roundsAtDrain: number;
} {
  const ctl = new MatchController("rh-elim", 99, allBots(), FAST);
  let live: MatchSettlement | null = null;
  let captured: MatchSettlement | null = null;
  let roundsAtDrain = 0;
  for (let i = 0; i < 200000 && ctl.phase.phase !== "matchEnd"; i++) {
    ctl.tick();
    if (live === null) {
      const drained = ctl.takeEliminationSettlements();
      if (drained.length > 0) {
        live = drained[0]!.settlement;
        roundsAtDrain = live.rounds!.length;
        captured = JSON.parse(JSON.stringify(live)) as MatchSettlement;
      }
    }
  }
  return { ctl, live, captured, roundsAtDrain };
}

describe("per-round history reaches the settlement payload", () => {
  it("the settlement carries one entry per settled combat round", () => {
    const ctl = finished();
    const rounds = ctl.settlement?.rounds;
    expect(rounds, "MatchSettlement.rounds is missing entirely").toBeDefined();
    expect(rounds!.length, "no rounds were recorded at all").toBeGreaterThan(0);
    // rounds are strictly increasing and 1-based
    const nums = rounds!.map((r) => r.round);
    expect(nums[0]).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]!, `round numbers must increase: ${nums.join(",")}`).toBeGreaterThan(nums[i - 1]!);
    }
  });

  it("every entry covers every seated player", () => {
    const ctl = finished();
    const seated = [...ctl.seats.values()].filter((s) => s.entityId !== null).length;
    expect(seated).toBe(12);
    for (const r of ctl.settlement!.rounds!) {
      expect(r.players.length, `round ${r.round} covered ${r.players.length}/12 seats`).toBe(12);
      expect(new Set(r.players.map((p) => p.seatId)).size).toBe(12);
    }
  });

  it("the per-round deltas SUM to the whole-match totals — they are not totals repeated", () => {
    // THE load-bearing assertion. If the recorder stored cumulative values
    // instead of differences, this sum overshoots massively (a 6-round match
    // would roughly sextuple the damage), so the test is sensitive in exactly
    // the direction the defect would go.
    const ctl = finished();
    const rounds = ctl.settlement!.rounds!;
    for (const player of ctl.settlement!.perPlayer) {
      const mine = rounds.map((r) => r.players.find((p) => p.seatId === player.seatId)!);
      const sum = (pick: (p: (typeof mine)[number]) => number): number =>
        mine.reduce((acc, p) => acc + pick(p), 0);
      expect(sum((p) => p.kills)).toBe(player.stats.kills);
      expect(sum((p) => p.deaths)).toBe(player.stats.deaths);
      expect(sum((p) => p.assists)).toBe(player.stats.assists);
      expect(sum((p) => p.damageDealt)).toBeCloseTo(player.stats.damageDealt, 4);
      expect(sum((p) => p.damageTaken)).toBeCloseTo(player.stats.damageTaken, 4);
      expect(sum((p) => p.healingDone)).toBeCloseTo(player.stats.healingDone, 4);
      expect(sum((p) => p.timeAliveTicks)).toBe(player.stats.timeAliveTicks);
    }
  });

  it("a real match actually produces non-zero per-round damage somewhere", () => {
    // Guard on the guard: every assertion above passes vacuously if all the
    // deltas are 0 (recorder wired to a dead field, snapshot taken before any
    // combat). This is the "the field has a value, but is it the RIGHT thing"
    // check — it must see damage inside individual rounds, not just in a total.
    const ctl = finished();
    const rounds = ctl.settlement!.rounds!;
    const roundsWithDamage = rounds.filter((r) => r.players.some((p) => p.damageDealt > 0));
    expect(
      roundsWithDamage.length,
      `no single round recorded any hero damage across ${rounds.length} rounds`,
    ).toBeGreaterThan(0);
  });

  it("hpRatio is a LEVEL in [0,1], not a delta (it can go up between rounds)", () => {
    const ctl = finished();
    for (const r of ctl.settlement!.rounds!) {
      for (const p of r.players) {
        expect(p.hpRatio).toBeGreaterThanOrEqual(0);
        expect(p.hpRatio).toBeLessThanOrEqual(1);
      }
    }
  });

  it("mobKills is recorded per round and never negative", () => {
    const ctl = finished();
    for (const r of ctl.settlement!.rounds!) {
      for (const p of r.players) {
        expect(p.mobKills, `seat ${p.seatId} round ${r.round}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("a BYE round is FLAGGED, so nobody is scored for a round they sat out", () => {
    // 4 teams pair cleanly; a bye only appears once a team is eliminated and 3
    // remain. Scan the whole match for one and assert the flag rides with the
    // all-zero tally, because those two facts together are what let the client
    // skip the round instead of plotting "rank 12, zero damage".
    const ctl = finished();
    const byes = ctl
      .settlement!.rounds!.flatMap((r) => r.players.map((p) => ({ round: r.round, p })))
      .filter((x) => x.p.bye);
    for (const { round, p } of byes) {
      expect(p.kills, `bye seat ${p.seatId} round ${round} scored a kill`).toBe(0);
      expect(p.damageDealt).toBe(0);
    }
    // the flag must EXIST on every record, bye or not (a missing field would
    // read `undefined` and quietly falsify every skip check downstream)
    for (const r of ctl.settlement!.rounds!) {
      for (const p of r.players) expect(typeof p.bye).toBe("boolean");
    }
  });

  it("a mid-match elimination settlement (#193) is internally CONSISTENT", () => {
    // ORDERING. `recordRoundHistory()` runs BEFORE `settleRound()`, and
    // settleRound is what eliminates a team and snapshots its card. Move the
    // recorder after it and the knocked-out player's card carries whole-match
    // totals that INCLUDE the round that just killed them but a per-round
    // history that does NOT — so the sums stop matching.
    //
    // NOTE ON THE FROZEN COPY: `buildSettlement` puts the LIVE
    // `world.matchStats` object into `SettlementPlayer.stats` by reference, so
    // those totals keep moving after the card is built. Harmless in production
    // (MatchRoom serialises the payload to JSON on the very tick it drains it)
    // but fatal to an in-process assertion — reading `.stats` at the end of the
    // match compares this round's history against a LATER total and fails for a
    // reason that has nothing to do with this feature. So THIS test freezes the
    // payload exactly the way the wire does, at drain time.
    //
    // That freeze is also why the aliasing claim gets its OWN test below rather
    // than riding along here: a JSON round-trip destroys every shared reference,
    // so nothing asserted against `captured` can ever see aliasing.
    const { captured } = runToFirstElimination();
    expect(captured, "seed 99 produced no mid-match elimination — this test is vacuous").not.toBeNull();
    expect(captured!.rounds!.length).toBeGreaterThan(0);
    for (const player of captured!.perPlayer) {
      const mine = captured!.rounds!.map((r) => r.players.find((p) => p.seatId === player.seatId)!);
      const dealt = mine.reduce((acc, p) => acc + p.damageDealt, 0);
      expect(
        dealt,
        `seat ${player.seatId}: elimination card's per-round damage sums to ${dealt} but its ` +
          `total says ${player.stats.damageDealt} — the history is missing a round`,
      ).toBeCloseTo(player.stats.damageDealt, 4);
      const kills = mine.reduce((acc, p) => acc + p.kills, 0);
      expect(kills).toBe(player.stats.kills);
    }
  });

  // ─────────────────────────────── the deep copy, checked on the LIVE object ──
  //
  // THE DEFECT: `buildSettlement` ends with
  //
  //     const rounds = this.roundHistory.map((r) => ({
  //       round: r.round,
  //       players: r.players.map((p) => ({ ...p })),
  //     }));
  //
  // Replace that with `const rounds = this.roundHistory;` and the elimination
  // payload — already handed to MatchRoom, already conceptually sent — keeps
  // growing rounds the knocked-out player was never in. Every assertion below
  // must therefore be stated on the object the controller ACTUALLY handed out.
  // Deep-copy it first (as the previous version of this suite did) and the
  // defect is destroyed before it can be observed: JSON.parse(JSON.stringify(x))
  // returns a fresh tree whose length is frozen and whose references are all
  // new, so the check can only ever compare a snapshot against itself. See
  // {@link runToFirstElimination}, which keeps both objects for that reason.

  it("the elimination payload does NOT grow after it was handed out", () => {
    const { ctl, live, roundsAtDrain } = runToFirstElimination();
    expect(live, "seed 99 produced no mid-match elimination — this test is vacuous").not.toBeNull();
    expect(roundsAtDrain).toBeGreaterThan(0);
    // the match kept going, so the controller kept recording — that is what
    // makes the next assertion able to fail at all
    const atEnd = ctl.settlement!.rounds!.length;
    expect(
      atEnd,
      `the match recorded no further rounds after the elimination (${atEnd} vs ${roundsAtDrain}) — ` +
        `nothing could have leaked in, so this test proves nothing`,
    ).toBeGreaterThan(roundsAtDrain);
    expect(
      live!.rounds!.length,
      `the payload was handed out with ${roundsAtDrain} rounds and now has ` +
        `${live!.rounds!.length} — it aliases the controller's live array`,
    ).toBe(roundsAtDrain);
  });

  it("…and every payload is an independent tree, down to the individual delta", () => {
    // The shallower halves of the same defect: `this.roundHistory.map((r) => r)`
    // shares the round ENTRIES, and `players: r.players` shares the player
    // arrays. Neither grows, so the length check above cannot see them. Stated
    // as MUTATION rather than reference identity, because independence is the
    // property that matters — writing into one payload must not be visible in
    // another.
    const { ctl, live } = runToFirstElimination();
    expect(live).not.toBeNull();
    const fin = ctl.settlement!;
    expect(fin.rounds!.length).toBeGreaterThan(0);

    const r0 = live!.rounds![0]!;
    const finR0 = fin.rounds!.find((r) => r.round === r0.round);
    expect(finR0, `round ${r0.round} is in the elimination card but not the final one`).toBeDefined();

    const before = r0.players[0]!.damageDealt;
    const finP0 = finR0!.players.find((p) => p.seatId === r0.players[0]!.seatId)!;
    finP0.damageDealt = -424242;
    expect(
      r0.players[0]!.damageDealt,
      "writing into the final settlement changed the elimination payload — the two share objects",
    ).toBe(before);

    finR0!.players.push({ ...finP0, seatId: 99 });
    expect(
      r0.players.some((p) => p.seatId === 99),
      "pushing into the final settlement's players changed the elimination payload's",
    ).toBe(false);
  });
});
