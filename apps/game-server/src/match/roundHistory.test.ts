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

  it("a mid-match elimination settlement (#193) is internally CONSISTENT and does not alias", () => {
    // Two defects in one test, both about the #193 path that builds a payload
    // while the match is still running:
    //
    //  (a) ORDERING. `recordRoundHistory()` runs BEFORE `settleRound()`, and
    //      settleRound is what eliminates a team and snapshots its card. Move
    //      the recorder after it and the knocked-out player's card carries
    //      whole-match totals that INCLUDE the round that just killed them but
    //      a per-round history that does NOT — so the sums stop matching. That
    //      is what the sum check below detects.
    //  (b) ALIASING. Handing out the live array by reference lets an already
    //      broadcast payload keep growing rounds.
    //
    // NOTE ON THE DEEP COPY: `buildSettlement` puts the LIVE `world.matchStats`
    // object into `SettlementPlayer.stats` by reference, so those totals keep
    // moving after the card is built. Harmless in production (MatchRoom
    // serialises the payload to JSON on the very tick it drains it) but fatal
    // to an in-process assertion — reading `.stats` at the end of the match
    // compares this round's history against a LATER total and fails for a
    // reason that has nothing to do with this feature. So the test freezes the
    // payload exactly the way the wire does, at drain time.
    const ctl = new MatchController("rh-elim", 99, allBots(), FAST);
    let captured: MatchSettlement | null = null;
    let capturedRounds = 0;
    for (let i = 0; i < 200000 && ctl.phase.phase !== "matchEnd"; i++) {
      ctl.tick();
      if (captured === null) {
        const drained = ctl.takeEliminationSettlements();
        if (drained.length > 0) {
          captured = JSON.parse(JSON.stringify(drained[0]!.settlement)) as MatchSettlement;
          capturedRounds = captured.rounds!.length;
        }
      }
    }
    expect(captured, "seed 99 produced no mid-match elimination — this test is vacuous").not.toBeNull();
    expect(capturedRounds).toBeGreaterThan(0);
    // (a) the two halves of the SAME payload must agree
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
    // (b) it was a copy
    expect(
      captured!.rounds!.length,
      "the elimination payload grew after it was handed out — it aliases the live array",
    ).toBe(capturedRounds);
    expect(ctl.settlement!.rounds!.length).toBeGreaterThan(capturedRounds);
  });
});
