/**
 * Couch-play (local multiplayer) — the platform reserves N seats for ONE
 * machine using pseudo-ids "{accountId}:p2".."{accountId}:p4". The game
 * server keys seats by accountId (seatByAccount in MatchRoom / SeatSpec
 * accountId here), so distinct pseudo-ids each get their own seat + driver.
 * One connection = one seat: a single local player disconnecting swaps ONLY
 * that seat to AI.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";

const BASE = "acct-01HOST";

/** 4 couch players on one base account + 8 bots, platform-style specs. */
function couchSpecs(): SeatSpec[] {
  const ids = [BASE, `${BASE}:p2`, `${BASE}:p3`, `${BASE}:p4`];
  const specs: SeatSpec[] = ids.map((accountId, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    accountId,
    displayName: i === 0 ? "Host" : `Host (${i + 1}P)`,
    isBot: false,
  }));
  for (let seatId = 4; seatId < 12; seatId++) {
    specs.push({ seatId, teamId: Math.floor(seatId / 3), isBot: true });
  }
  return specs;
}

describe("couch multi-seat reservation (pseudo-ids)", () => {
  it("4 seats on the same base account with distinct pseudo-ids each get their own seat + driver", () => {
    cover("couch-multi-seat-reserve");
    const ctl = new MatchController("m-couch", 42, couchSpecs());

    // Simulate MatchRoom.onCreate's seatByAccount map: accountId -> seatId.
    const seatByAccount = new Map<string, number>();
    for (const spec of couchSpecs()) {
      if (!spec.isBot) seatByAccount.set(spec.accountId!, spec.seatId);
    }
    expect(seatByAccount.size).toBe(4); // distinct pseudo-ids never collide

    // Each "connection" joins its own seat with its own HumanDriver
    // (MatchRoom.onJoin resolves the seat by accountId and attaches one).
    const drivers = new Map<number, HumanDriver>();
    for (const [accountId, seatId] of seatByAccount) {
      const seat = ctl.seats.get(asSeatId(seatId))!;
      expect(seat.accountId).toBe(accountId);
      const driver = new HumanDriver();
      drivers.set(seatId, driver);
      seat.setDriver(driver);
      seat.sessionId = `sess-${seatId}`;
    }
    ctl.tick(); // driver swaps land at the tick boundary

    for (const seatId of [0, 1, 2, 3]) {
      expect(ctl.seats.get(asSeatId(seatId))!.driverKind).toBe("human");
    }
    // Seats 4..11 stay bots.
    for (let seatId = 4; seatId < 12; seatId++) {
      expect(ctl.seats.get(asSeatId(seatId))!.driverKind).toBe("ai");
    }

    // Input isolation: a message pushed into player 3's mailbox surfaces in
    // seat 2's intent only (MatchRoom routes by sessionId -> seatId).
    drivers.get(2)!.mailbox.push({ seq: 7, order: { kind: "stop" } });
    const i2 = drivers.get(2)!.produceIntent(ctl.seats.get(asSeatId(2))!, ctl.world, 0);
    const i1 = drivers.get(1)!.produceIntent(ctl.seats.get(asSeatId(1))!, ctl.world, 0);
    expect(i2.order).toEqual({ kind: "stop" });
    expect(i1.order).toBeUndefined();
  });

  it("one local connection leaving swaps ONLY that seat to AI", () => {
    cover("couch-leave-swaps-one");
    const ctl = new MatchController("m-couch-leave", 42, couchSpecs());
    for (const seatId of [0, 1, 2, 3]) {
      ctl.seats.get(asSeatId(seatId))!.setDriver(new HumanDriver());
    }
    ctl.tick();

    // MatchRoom.onLeave for the ":p3" connection: only seat 2 goes AI.
    const leaving = ctl.seats.get(asSeatId(2))!;
    leaving.setDriver(new AIDriver());
    leaving.sessionId = null;
    ctl.tick();

    expect(ctl.seats.get(asSeatId(2))!.driverKind).toBe("ai");
    for (const seatId of [0, 1, 3]) {
      expect(ctl.seats.get(asSeatId(seatId))!.driverKind).toBe("human");
    }
    // The seat's accountId (pseudo-id) survives the swap for reconnection.
    expect(leaving.accountId).toBe(`${BASE}:p3`);
  });
});
