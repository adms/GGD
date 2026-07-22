/**
 * couch-localplayers-store: syncHudFromState projects THIS machine's couch
 * accountIds (owner + ":pN" guests) into hudStore.localPlayers — seat/entity/
 * team plus mini-HUD vitals — keyed by local player index.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { hudStore, resetHudStore, setLocalAccounts, syncHudFromState } from "./RoomStore";

interface FakeSeat {
  seatId: number;
  teamId: number;
  accountId: string;
  displayName: string;
  connected: boolean;
  driver: string;
  championId: string;
  entityId: number;
  level: number;
  gold: number;
  xp: number;
  ready: boolean;
  unspentPoints: number;
  lastAckSeq: number;
  items: string[];
  augments: string[];
  abilityRanks: number[];
  cooldowns: number[];
  offers: { offerId: string; tier: string; choices: string[] }[];
}

function seat(seatId: number, teamId: number, accountId: string, entityId: number): FakeSeat {
  return {
    seatId,
    teamId,
    accountId,
    displayName: accountId === "01A" ? "Riko" : `n-${accountId}`,
    connected: true,
    driver: "human",
    championId: "champ.sela",
    entityId,
    level: 1,
    gold: 500,
    xp: 0,
    ready: false,
    unspentPoints: 0,
    lastAckSeq: 0,
    items: [],
    augments: [],
    abilityRanks: [1, 0, 0, 0],
    cooldowns: [0, 0, 0, 0],
    offers: [],
  };
}

function entity(id: number, hp: number, mana: number): Record<string, number | boolean> {
  return { id, kind: 0, seatId: 0, x: 0, z: 0, fx: 1, fz: 0, zone: 0, alive: true, hp, maxHp: 600, shield: 0, mana, maxMana: 200 };
}

/** Structural stand-in for the reflected Colyseus MatchState. */
function fakeState(seats: FakeSeat[], entities: Record<string, number | boolean>[]): MatchState {
  return {
    matchId: "m_couch",
    phase: "combat",
    round: 1,
    tick: 30,
    phaseTicksLeft: 300,
    seed: 1,
    seats: new Map(seats.map((s) => [String(s.seatId), s])),
    entities: new Map(entities.map((e) => [String(e.id), e])),
    teams: [],
  } as unknown as MatchState;
}

beforeEach(() => resetHudStore());

describe("couch localPlayers projection", () => {
  it("maps owner + guest accountIds to their seats with vitals", () => {
    cover("couch-localplayers-store");
    setLocalAccounts(["01A", "01A:p2"]);
    const state = fakeState(
      [seat(0, 0, "01A", 101), seat(1, 0, "01A:p2", 102), seat(2, 0, "01B", 103)],
      [entity(101, 480, 120), entity(102, 250, 60), entity(103, 600, 200)],
    );
    syncHudFromState(state, "01A");

    const locals = hudStore.getState().localPlayers;
    expect(locals).toHaveLength(2);
    expect(locals[0]).toMatchObject({
      player: 0,
      accountId: "01A",
      seatId: 0,
      entityId: 101,
      teamId: 0,
      hp: 480,
      maxHp: 600,
      mana: 120,
    });
    expect(locals[1]).toMatchObject({ player: 1, accountId: "01A:p2", seatId: 1, entityId: 102, hp: 250 });
    // the OTHER member's seat is not a local player here
    expect(locals.some((lp) => lp.accountId === "01B")).toBe(false);
    // player 0 keeps the classic single-player fields too
    expect(hudStore.getState().localSeatId).toBe(0);
    expect(hudStore.getState().localEntityId).toBe(101);
  });

  it("falls back to the single primary account when no couch accounts are set", () => {
    cover("couch-localplayers-store");
    const state = fakeState([seat(0, 0, "01A", 101)], [entity(101, 600, 200)]);
    syncHudFromState(state, "01A");
    const locals = hudStore.getState().localPlayers;
    expect(locals).toHaveLength(1);
    expect(locals[0]!.player).toBe(0);
  });

  it("is change-guarded: an identical patch does not re-set localPlayers", () => {
    cover("couch-localplayers-store");
    setLocalAccounts(["01A", "01A:p2"]);
    const state = fakeState(
      [seat(0, 0, "01A", 101), seat(1, 0, "01A:p2", 102)],
      [entity(101, 480, 120), entity(102, 250, 60)],
    );
    syncHudFromState(state, "01A");
    const before = hudStore.getState().localPlayers;
    syncHudFromState(state, "01A");
    expect(hudStore.getState().localPlayers).toBe(before); // same reference
  });

  it("resetHudStore clears the couch registration", () => {
    cover("couch-localplayers-store");
    setLocalAccounts(["01A", "01A:p2"]);
    resetHudStore();
    const state = fakeState([seat(0, 0, "01A", 101)], [entity(101, 600, 200)]);
    syncHudFromState(state, "01A");
    expect(hudStore.getState().localPlayers).toHaveLength(1);
  });
});
