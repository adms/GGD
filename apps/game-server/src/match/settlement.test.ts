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
