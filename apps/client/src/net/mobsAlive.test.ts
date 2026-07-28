/**
 * GUARD — the two numbers 殭屍來襲提示 needs actually reach the HUD store
 * (task #258, the client half; the wire half is in
 * apps/game-server/src/net/encode.test.ts).
 *
 *   `mobsAlive`  — the 來襲 signal, PROJECTED from the replicated entity map so
 *                  it can never disagree with the zombies on screen;
 *   `SeatView.mobKills` — the tally, read off the seat the server projects.
 *
 * The failure this closes is the repo's third shape (「從 render tree 刪掉整個
 * 元件，測試還是綠的」)'s cousin: a HUD component can be perfect while the
 * store it reads never changes. Every assertion below drives the REAL
 * `syncHudFromState` — the same function `RoomConnection` calls on every
 * snapshot — and reads the REAL store back.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ENTITY_KIND, type MatchState } from "@ggd/shared/protocol/schema";
import { hudStore, resetHudStore, syncHudFromState } from "./RoomStore";

const seat = (seatId: number, accountId: string, entityId: number, mobKills = 0) => ({
  seatId,
  teamId: 0,
  accountId,
  displayName: accountId,
  connected: true,
  driver: "human",
  championId: "champ.sela",
  entityId,
  level: 1,
  gold: 0,
  xp: 0,
  ready: false,
  unspentPoints: 0,
  lastAckSeq: 0,
  items: [],
  augments: [],
  abilityRanks: [1, 0, 0, 0],
  cooldowns: [0, 0, 0, 0],
  offers: [],
  mobKills,
});

const ent = (
  id: number,
  kind: number,
  zone: number,
  alive = true,
): Record<string, number | boolean> => ({
  id,
  kind,
  seatId: -1,
  x: 0,
  z: 0,
  fx: 1,
  fz: 0,
  zone,
  alive,
  hp: 100,
  maxHp: 100,
  shield: 0,
  mana: 0,
  maxMana: 0,
});

function fakeState(
  seats: ReturnType<typeof seat>[],
  entities: Record<string, number | boolean>[],
  phase = "combat",
): MatchState {
  return {
    matchId: "m_mobs",
    phase,
    round: 3,
    tick: 30,
    phaseTicksLeft: 300,
    seed: 1,
    seats: new Map(seats.map((s) => [String(s.seatId), s])),
    entities: new Map(entities.map((e) => [String(e.id), e])),
    teams: [],
  } as unknown as MatchState;
}

beforeEach(() => resetHudStore());

describe("mobsAlive projection (task #258)", () => {
  it("counts the zombies standing in YOUR zone", () => {
    cover("mob-wave-hud");
    syncHudFromState(
      fakeState(
        [seat(0, "01A", 101)],
        [
          ent(101, ENTITY_KIND.CHAMPION, 0),
          ent(900, ENTITY_KIND.MOB, 0),
          ent(901, ENTITY_KIND.MOB, 0),
          ent(902, ENTITY_KIND.MOB, 0),
        ],
      ),
      "01A",
    );
    expect(hudStore.getState().mobsAlive).toBe(3);
  });

  it("IGNORES the other arena's wave — it is not coming for you", () => {
    // Scoped like the minimap (#67). A count that included zone 1 would fire
    // 「殭屍來襲！」 while your own floor is still empty.
    cover("mob-wave-hud");
    syncHudFromState(
      fakeState(
        [seat(0, "01A", 101)],
        [
          ent(101, ENTITY_KIND.CHAMPION, 0),
          ent(900, ENTITY_KIND.MOB, 1),
          ent(901, ENTITY_KIND.MOB, 1),
        ],
      ),
      "01A",
    );
    expect(hudStore.getState().mobsAlive).toBe(0);
  });

  it("counts only MOBS, and only LIVING ones", () => {
    cover("mob-wave-hud");
    syncHudFromState(
      fakeState(
        [seat(0, "01A", 101)],
        [
          ent(101, ENTITY_KIND.CHAMPION, 0),
          ent(102, ENTITY_KIND.CHAMPION, 0), // another champion is not a zombie
          ent(200, ENTITY_KIND.GUARDIAN, 0), // neither is the guardian
          ent(300, ENTITY_KIND.GOLD_COIN, 0),
          ent(900, ENTITY_KIND.MOB, 0),
          ent(901, ENTITY_KIND.MOB, 0, false), // a corpse is not 「來襲」
        ],
      ),
      "01A",
    );
    expect(hudStore.getState().mobsAlive).toBe(1);
  });

  it("falls to 0 when the floor is cleared — the alert must be able to re-arm", () => {
    cover("mob-wave-hud");
    const seats = [seat(0, "01A", 101)];
    syncHudFromState(
      fakeState(seats, [ent(101, ENTITY_KIND.CHAMPION, 0), ent(900, ENTITY_KIND.MOB, 0)]),
      "01A",
    );
    expect(hudStore.getState().mobsAlive).toBe(1);
    syncHudFromState(fakeState(seats, [ent(101, ENTITY_KIND.CHAMPION, 0)]), "01A");
    expect(hudStore.getState().mobsAlive).toBe(0);
  });

  it("is 0 when the local seat has no champion yet", () => {
    cover("mob-wave-hud");
    syncHudFromState(
      fakeState([seat(0, "01A", 0)], [ent(900, ENTITY_KIND.MOB, 0)]),
      "01A",
    );
    expect(hudStore.getState().mobsAlive).toBe(0);
  });
});

describe("SeatView.mobKills projection (task #258)", () => {
  it("carries the server's per-seat tally into the store", () => {
    cover("mob-wave-hud");
    syncHudFromState(
      fakeState(
        [seat(0, "01A", 101, 41), seat(1, "01B", 102, 7)],
        [ent(101, ENTITY_KIND.CHAMPION, 0), ent(102, ENTITY_KIND.CHAMPION, 0)],
      ),
      "01A",
    );
    const seats = hudStore.getState().seats;
    expect(seats.find((s) => s.seatId === 0)!.mobKills).toBe(41);
    // per-seat, not broadcast: the HUD reads YOUR number, not the room's
    expect(seats.find((s) => s.seatId === 1)!.mobKills).toBe(7);
  });

  it("a legacy snapshot with no field reads as 「還沒殺過」, never undefined", () => {
    cover("mob-wave-hud");
    const legacy = seat(0, "01A", 101) as Record<string, unknown>;
    delete legacy.mobKills;
    syncHudFromState(
      fakeState(
        [legacy as unknown as ReturnType<typeof seat>],
        [ent(101, ENTITY_KIND.CHAMPION, 0)],
      ),
      "01A",
    );
    expect(hudStore.getState().seats[0]!.mobKills).toBe(0);
  });
});
