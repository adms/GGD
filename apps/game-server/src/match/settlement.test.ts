/**
 * Victory settlement: control-freeze once the outcome is decided + the match-end
 * payload (per-player scoreboard / grade / rank / winner) — settle-06..settle-08.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, asTeamId } from "@ggd/shared/ids";
import { GRADES } from "@ggd/shared/sim/stats/rating";
import { MatchState, ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
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
    // …and the shop intermission still shows the finished round's numbers.
    // ASSERTED, not branched on: behind an `if` the reset check — the whole
    // point of this case — could silently never run and still report green.
    expect(ctl.phase.phase).toBe("intermission");
    expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(atRoundEnd);
    tickUntil(ctl, "combat");
    expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(seatIds.map(() => 0));
  });
});

/**
 * round-mvp-bye — the residual of the round-MVP fix above. With 3 alive teams
 * the format hands one team a BYE, and enterCombat parks EVERY seat dead before
 * reviving only the seats belonging to a pairing. The bye team therefore ends
 * the round alive:false / roundKills:0 / roundDeaths:0 — byte-identical to a
 * team that was instantly wiped, and it never even emits a death event (the
 * parking mutates hp directly). If it happened to lead the standings, the
 * presentation picked it, found no survivors and no scorers, and degenerated to
 * its lowest seatId: 「每回合都是同一個英雄」 for that round.
 *
 * TeamState.roundOutcome is the signal that closes it: NONE at combat entry,
 * FOUGHT where enterCombat places a team into a duel zone, WON/LOST at
 * settleRound. The bye team is the only one that never leaves NONE.
 */
describe("bye rounds are marked, so the sit-out team is never presented (round-mvp-bye)", () => {
  const tickUntil = (ctl: MatchController, target: string, guard = 60000): void => {
    let n = 0;
    while (ctl.phase.phase !== target && ctl.phase.phase !== "matchEnd" && n < guard) {
      ctl.tick();
      n++;
    }
  };

  /**
   * Force the 3-alive-team state that produces a bye. Seed-hunting for it would
   * be brittle; knocking team 3 out through the PUBLIC lives/placements maps is
   * exactly the state a natural elimination leaves behind.
   */
  const forceThreeTeams = (ctl: MatchController): void => {
    ctl.lives.set(asTeamId(3), 0);
    ctl.placements.set(asTeamId(3), 4);
  };

  it("leaves the bye team NONE while the duelists are marked WON / LOST", () => {
    cover("round-mvp-bye");
    const ctl = new MatchController("bye1", 9090, allBots(), FAST);
    tickUntil(ctl, "intermission");
    forceThreeTeams(ctl);
    tickUntil(ctl, "combat");
    expect(ctl.phase.phase).toBe("combat");
    expect(ctl.bye).not.toBeNull();
    const bye = ctl.bye!;

    // combat entry already marks participation — before any duel is decided
    expect(ctl.roundOutcome.get(bye)).toBe(ROUND_OUTCOME.NONE);
    for (const pairing of ctl.pairings) {
      expect(ctl.roundOutcome.get(pairing.sideA)).toBe(ROUND_OUTCOME.FOUGHT);
      expect(ctl.roundOutcome.get(pairing.sideB)).toBe(ROUND_OUTCOME.FOUGHT);
    }

    tickUntil(ctl, "resolution");
    expect(ctl.phase.phase).toBe("resolution");

    // the settled round: exactly one winner, one loser, and the bye still NONE
    const outcomes = [...ctl.roundOutcome.entries()].filter(([t]) => t !== asTeamId(3));
    expect(outcomes.filter(([, o]) => o === ROUND_OUTCOME.WON)).toHaveLength(1);
    expect(outcomes.filter(([, o]) => o === ROUND_OUTCOME.LOST)).toHaveLength(1);
    expect(ctl.roundOutcome.get(bye)).toBe(ROUND_OUTCOME.NONE);

    // …and this is the regression fingerprint: on the wire the bye team is
    // indistinguishable from a wiped one WITHOUT roundOutcome.
    for (const seat of ctl.seats.values()) {
      if (seat.teamId !== bye || seat.entityId === null) continue;
      expect(ctl.world.health.get(seat.entityId)!.alive).toBe(false);
      expect(ctl.roundKills.get(seat.seatId)).toBe(0);
      expect(ctl.roundDeaths.get(seat.seatId)).toBe(0);
    }

    // the snapshot mirrors it, so every client (including a late joiner) agrees
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const wire = state.teams.map((t) => ({ teamId: t.teamId, roundOutcome: t.roundOutcome }));
    expect(wire).toHaveLength(4);
    for (const t of wire) expect(t.roundOutcome).toBe(ctl.roundOutcome.get(asTeamId(t.teamId)));
    expect(wire.find((t) => t.teamId === (bye as number))!.roundOutcome).toBe(ROUND_OUTCOME.NONE);
  });

  it("survives the whole resolution beat, then resets at the next combat entry", () => {
    cover("round-mvp-bye");
    const ctl = new MatchController("bye2", 9090, allBots(), FAST);
    tickUntil(ctl, "intermission");
    forceThreeTeams(ctl);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const atRoundEnd = [...ctl.roundOutcome.values()];
    expect(atRoundEnd).toContain(ROUND_OUTCOME.WON);

    // the presentation reads this all through `resolution` — the reset is at
    // COMBAT ENTRY, exactly like the K/D tallies, so it must not blank here
    while (ctl.phase.phase === "resolution") {
      ctl.tick();
      expect([...ctl.roundOutcome.values()]).toEqual(atRoundEnd);
    }
    // ASSERTED, not branched on — a conditional here can skip the reset check
    expect(ctl.phase.phase).toBe("intermission");
    expect([...ctl.roundOutcome.values()]).toEqual(atRoundEnd);
    tickUntil(ctl, "combat");
    // a new round starts from a clean slate; only this round's duelists are FOUGHT
    const byeNow = ctl.bye;
    for (const [teamId, outcome] of ctl.roundOutcome) {
      const fighting = ctl.pairings.some((p) => p.sideA === teamId || p.sideB === teamId);
      expect(outcome).toBe(fighting ? ROUND_OUTCOME.FOUGHT : ROUND_OUTCOME.NONE);
    }
    if (byeNow !== null) expect(ctl.roundOutcome.get(byeNow)).toBe(ROUND_OUTCOME.NONE);
  });

  it("marks both duelists on an ordinary 4-team round (no bye, nobody left NONE)", () => {
    cover("round-mvp-bye");
    const ctl = new MatchController("bye3", 4242, allBots(), FAST);
    tickUntil(ctl, "combat");
    expect(ctl.bye).toBeNull(); // round 1: all four teams fight
    tickUntil(ctl, "resolution");
    const alive = [...ctl.lives.entries()].filter(([, l]) => l > 0).map(([t]) => t);
    for (const teamId of alive) {
      expect([ROUND_OUTCOME.WON, ROUND_OUTCOME.LOST]).toContain(ctl.roundOutcome.get(teamId));
    }
    expect([...ctl.roundOutcome.values()].filter((o) => o === ROUND_OUTCOME.WON)).toHaveLength(2);
  });

  it("is deterministic across same-seed replays (the tallies draw no rng)", () => {
    cover("round-mvp-bye");
    // roundOutcome/roundWins are pure re-projections of duelWinners/pairings —
    // they draw no rng and touch nothing in packages/shared/src/sim.
    //
    // NOTE ON WHAT THIS CAN AND CANNOT PROVE: run-vs-run equality proves the
    // sim is reproducible from a seed. It CANNOT prove the digest is the same
    // as before this change (both runs would move together), so the test is
    // named for the guarantee it actually gives. The stronger claim is covered
    // structurally instead: nothing here writes to the world.
    const run = (): number => {
      const ctl = new MatchController("bye4", 777, allBots(), FAST);
      runToEnd(ctl);
      return ctl.world.digest();
    };
    expect(run()).toBe(run());
  });
});

/**
 * round-win-counter (task #93) — TeamState.roundWins is what the client's
 * victory gate (vfx/victoryTrigger) edge-detects to fire the SMALL round-win
 * firework. It was declared in the schema and read by the client but never
 * written by anything on the server, so that half of the round beat could not
 * fire at all. These pin the three properties the gate depends on: it rises on
 * a duel win, it is projected on the wire, and it is NEVER reset mid-match.
 */
describe("round-win counter feeds the victory gate (round-win-counter)", () => {
  const tickUntil = (ctl: MatchController, target: string, guard = 60000): void => {
    let n = 0;
    while (ctl.phase.phase !== target && ctl.phase.phase !== "matchEnd" && n < guard) {
      ctl.tick();
      n++;
    }
  };

  it("rises by exactly one for the duel winner, and not for the loser or the bye", () => {
    cover("round-win-counter");
    const ctl = new MatchController("rw1", 4242, allBots(), FAST);
    for (const teamId of ctl.lives.keys()) expect(ctl.roundWins.get(teamId)).toBe(0);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    for (const [teamId, outcome] of ctl.roundOutcome) {
      const wins = ctl.roundWins.get(teamId) ?? -1;
      expect(wins).toBe(outcome === ROUND_OUTCOME.WON ? 1 : 0);
    }
  });

  it("is a MATCH-lifetime counter: it survives the reset that blanks roundOutcome", () => {
    cover("round-win-counter");
    const ctl = new MatchController("rw2", 9090, allBots(), FAST);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const afterRound1 = new Map(ctl.roundWins);
    expect([...afterRound1.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    expect(ctl.phase.phase).toBe("resolution");
    tickUntil(ctl, "intermission");
    tickUntil(ctl, "combat");
    // combat entry blanked roundOutcome — the win counter must NOT follow it,
    // or the client's `roundWins > lastRoundWins` edge never fires again
    for (const [teamId, wins] of afterRound1) {
      expect(ctl.roundWins.get(teamId)).toBeGreaterThanOrEqual(wins);
    }
    tickUntil(ctl, "resolution");
    const total = [...ctl.roundWins.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan([...afterRound1.values()].reduce((a, b) => a + b, 0));
  });

  it("rides the wire so every client sees the same counter", () => {
    cover("round-win-counter");
    const ctl = new MatchController("rw3", 4242, allBots(), FAST);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const wire = [...state.teams];
    expect(wire).toHaveLength(4);
    for (const t of wire) expect(t.roundWins).toBe(ctl.roundWins.get(asTeamId(t.teamId)));
    expect(wire.filter((t) => t.roundWins === 1)).toHaveLength(2); // two duels, two winners
  });
});
