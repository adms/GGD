/**
 * duelSnapshot.test.ts — task #208: the snapshot must expose, per zone/duel,
 * whether it is still LIVE, so a spectating client can find a still-fighting
 * zone to watch. This pins `projectSnapshot` mirroring the controller's
 * `pairings` + `duelWinners` onto `MatchState.duels`.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { MatchState } from "@ggd/shared/protocol/schema";
import { projectSnapshot } from "./snapshot";

const CFG = {
  champSelectTicks: 5,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function toCombat(seed: number): MatchController {
  const ctl = new MatchController("ds", seed, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

function wipeSideInZone(ctl: MatchController, teamId: number, zone: number): void {
  for (const seat of ctl.seats.values()) {
    if (seat.teamId !== teamId || seat.entityId === null) continue;
    const t = ctl.world.transform.get(seat.entityId);
    const hp = ctl.world.health.get(seat.entityId);
    if (t?.zone === zone && hp) {
      hp.alive = false;
      hp.hp = 0;
    }
  }
}

describe("snapshot projects per-duel LIVE state (#208)", () => {
  it("mirrors every pairing with winner -1 while all duels are live", () => {
    cover("duel-snapshot");
    const ctl = toCombat(1234);
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());

    expect(state.duels.length).toBe(ctl.pairings.length);
    expect(state.duels.length).toBe(2); // 4 teams → two zones
    for (const p of ctl.pairings) {
      const d = [...state.duels].find((x) => x.zone === p.zone);
      expect(d).toBeDefined();
      expect(d!.teamA).toBe(p.sideA);
      expect(d!.teamB).toBe(p.sideB);
      expect(d!.winner).toBe(-1); // still LIVE
    }
  });

  it("stamps a zone's winner the moment that duel is decided", () => {
    cover("duel-snapshot");
    const ctl = toCombat(4242);
    const decided = ctl.pairings[0]!;
    const live = ctl.pairings[1]!;

    wipeSideInZone(ctl, decided.sideB, decided.zone);
    ctl.tick(); // checkCombatEnd records the winner for the wiped zone

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const dDecided = [...state.duels].find((x) => x.zone === decided.zone)!;
    const dLive = [...state.duels].find((x) => x.zone === live.zone)!;
    expect(dDecided.winner).toBe(decided.sideA); // decided → survivor is the winner
    expect(dLive.winner).toBe(-1); // the other zone is still LIVE
  });

  it("carries no duels outside combat (pairings cleared)", () => {
    cover("duel-snapshot");
    const ctl = new MatchController("ds-cs", 7, allBots(), CFG);
    // champSelect: no pairings yet
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    expect(ctl.phase.phase).toBe("champSelect");
    expect(state.duels.length).toBe(0);
  });
});
