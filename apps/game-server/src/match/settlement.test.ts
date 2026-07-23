/**
 * Victory settlement: control-freeze once the outcome is decided + the match-end
 * payload (per-player scoreboard / grade / rank / winner) — settle-06..settle-08.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { GRADES } from "@ggd/shared/sim/stats/rating";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MatchController, type SeatSpec } from "./MatchController";
import { projectSnapshot } from "../net/snapshot";
import { HumanDriver } from "../seat/HumanDriver";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Tick until the match outcome latches (final combat over), or the guard trips. */
function runToDecided(ctl: MatchController, guard = 60000): number {
  let n = 0;
  while (!ctl.outcomeDecided && n < guard) {
    ctl.tick();
    n++;
  }
  return n;
}

function runToEnd(ctl: MatchController, guard = 60000): void {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < guard) {
    ctl.tick();
    n++;
  }
}

describe("control freeze once decided (settle-07)", () => {
  it("is NOT frozen during normal combat", () => {
    const ctl = new MatchController("f0", 1234, allBots(), FAST);
    while (ctl.phase.phase !== "combat") ctl.tick();
    expect(ctl.outcomeDecided).toBe(false);
  });

  it("ignores human input after the outcome is decided; champions idle", () => {
    cover("settle-freeze");
    const ctl = new MatchController("f1", 1234, allBots(), FAST);
    runToDecided(ctl);
    expect(ctl.outcomeDecided).toBe(true);
    expect(["resolution", "matchEnd"]).toContain(ctl.phase.phase);

    // pick an alive champion (the winning team survives the final duel)
    const alive = [...ctl.seats.values()].find((s) => {
      const hp = s.entityId !== null ? ctl.world.health.get(s.entityId) : null;
      return hp?.alive;
    });
    expect(alive).toBeDefined();
    const entity = alive!.entityId!;
    const before = { ...ctl.world.transform.get(entity)!.pos };

    // hand the seat to a human and spam a far-away move order — it must be ignored
    const human = new HumanDriver();
    alive!.setDriver(human);
    const target = { x: before.x + 50, z: before.z + 50 };
    for (let i = 0; i < 3; i++) {
      human.mailbox.push({ seq: i + 1, order: { kind: "move", point: target } });
      ctl.tick();
    }
    const after = ctl.world.transform.get(entity)!.pos;
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    // a live 50-unit move order would drive the champion >1 unit over 3 ticks;
    // frozen, it barely settles (collision only) — proves the input was ignored.
    expect(moved).toBeLessThan(0.05);

    // and the schema projects the freeze flag for the client
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    expect(state.outcomeDecided).toBe(true);
  });
});

describe("match-end settlement payload (settle-08)", () => {
  it("carries a graded, ranked per-player scoreboard + winner", () => {
    cover("settle-payload");
    const ctl = new MatchController("s1", 4242, allBots(), FAST);
    runToEnd(ctl);
    expect(ctl.phase.phase).toBe("matchEnd");

    const settle = ctl.settlement;
    expect(settle).not.toBeNull();
    expect(settle!.perPlayer).toHaveLength(12);

    // winnerTeam is the team that placed 1st
    const firstTeam = [...ctl.placements.entries()].find(([, p]) => p === 1)?.[0];
    expect(settle!.winnerTeam).toBe(firstTeam);

    // every player: a valid grade, and ranks are a permutation of 1..12
    for (const p of settle!.perPlayer) {
      expect(GRADES).toContain(p.grade);
      expect(p.champ.length).toBeGreaterThan(0);
      expect(p.stats).toBeDefined();
    }
    expect(settle!.perPlayer.map((p) => p.rank).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );

    // the payload stats mirror the authoritative world scoreboard
    const p0 = settle!.perPlayer.find((p) => p.seatId === 0)!;
    const entity0 = ctl.seats.get(asSeatId(0))!.entityId!;
    expect(p0.stats).toEqual(ctl.world.matchStats.get(entity0));
    // combat happened -> at least one player recorded a kill
    expect(settle!.perPlayer.some((p) => p.stats.kills > 0)).toBe(true);
  });

  it("is identical across two seeded runs (settle-09)", () => {
    cover("settle-payload-deterministic");
    const run = (): string => {
      const ctl = new MatchController("s2", 777, allBots(), FAST);
      runToEnd(ctl);
      return JSON.stringify({
        winner: ctl.settlement!.winnerTeam,
        players: ctl.settlement!.perPlayer.map((p) => ({ seat: p.seatId, g: p.grade, r: p.rank, k: p.stats.kills, d: p.stats.damageDealt })),
        digest: ctl.world.digest(),
      });
    };
    expect(run()).toBe(run());
  });
});

/**
 * The per-ROUND K/D tallies behind the round-end winner presentation (the #143
 * model + #142 VO). The bug they fix: the client used to present the leading
 * team's LOWEST-SEATID champion, and seat↔champion is fixed for a whole match,
 * so every round showed the same hero. The tallies must therefore be per-round
 * (a cumulative one would just re-pin the match's best killer) and they must be
 * on the wire, because a reconnecting client's own death-event tally is partial.
 */
describe("per-ROUND kill/death tallies (round-mvp-tally)", () => {
  /** Tick until the phase is `target` (or the guard trips). */
  const tickUntil = (ctl: MatchController, target: string, guard = 60000): void => {
    let n = 0;
    while (ctl.phase.phase !== target && ctl.phase.phase !== "matchEnd" && n < guard) {
      ctl.tick();
      n++;
    }
  };

  it("zeroes at every combat entry and equals THAT round's cumulative delta", () => {
    cover("round-mvp-tally");
    const ctl = new MatchController("mvp", 4242, allBots(), FAST);
    const state = new MatchState();
    const seatIds = [...ctl.seats.keys()];
    let sawRoundKills = false;
    let rounds = 0;

    while (ctl.phase.phase !== "matchEnd" && rounds < 6) {
      tickUntil(ctl, "combat");
      if (ctl.phase.phase !== "combat") break;
      rounds++;

      // combat entry: every seat starts the round on a clean sheet
      for (const seatId of seatIds) {
        expect(ctl.roundKills.get(seatId)).toBe(0);
        expect(ctl.roundDeaths.get(seatId)).toBe(0);
      }
      const kBefore = new Map(seatIds.map((s) => [s, ctl.kills.get(s) ?? 0]));
      const dBefore = new Map(seatIds.map((s) => [s, ctl.deaths.get(s) ?? 0]));

      // …and at the round-end beat (the `resolution` edge the presentation
      // fires on) it holds exactly what happened THIS round — never the match
      // total, which is what would freeze one champion on screen forever.
      tickUntil(ctl, "resolution");
      for (const seatId of seatIds) {
        expect(ctl.roundKills.get(seatId)).toBe((ctl.kills.get(seatId) ?? 0) - kBefore.get(seatId)!);
        expect(ctl.roundDeaths.get(seatId)).toBe((ctl.deaths.get(seatId) ?? 0) - dBefore.get(seatId)!);
      }
      if (seatIds.some((s) => (ctl.roundKills.get(s) ?? 0) > 0)) sawRoundKills = true;

      // the snapshot carries the same numbers, so every client (including one
      // that joined mid-match) ranks the round identically
      projectSnapshot(ctl, state, new Map());
      for (const seatId of seatIds) {
        const ss = state.seats.get(String(seatId))!;
        expect(ss.roundKills).toBe(ctl.roundKills.get(seatId));
        expect(ss.roundDeaths).toBe(ctl.roundDeaths.get(seatId));
      }
    }

    expect(rounds).toBeGreaterThan(1); // more than one round actually ran
    expect(sawRoundKills).toBe(true); // and rounds were decided by kills
    // the cumulative tally still accrues across the whole match
    expect(seatIds.reduce((s, id) => s + (ctl.kills.get(id) ?? 0), 0)).toBeGreaterThan(0);
  });

  it("survives the whole resolution beat, then clears on the next round", () => {
    cover("round-mvp-tally");
    const ctl = new MatchController("mvp2", 4242, allBots(), FAST);
    const seatIds = [...ctl.seats.keys()];
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const atRoundEnd = seatIds.map((s) => ctl.roundKills.get(s) ?? 0);
    expect(atRoundEnd.some((k) => k > 0)).toBe(true);

    // the winner presentation reads these all through `resolution` — the reset
    // is at COMBAT ENTRY, not at concludeCombat, so they must not blank here
    while (ctl.phase.phase === "resolution") {
      ctl.tick();
      expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(atRoundEnd);
    }
    // …and the shop intermission still shows the finished round's numbers
    if (ctl.phase.phase === "intermission") {
      expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(atRoundEnd);
      tickUntil(ctl, "combat");
      expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(seatIds.map(() => 0));
    }
  });
});
