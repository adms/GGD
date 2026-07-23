/**
 * #156 — the human player's own champion showed "Bot 0". The dev/LAN
 * direct-join takeover claimed an AI seat (owned + human-driven: camera follows,
 * driver=human) but never renamed it, so the seat kept the generic "Bot N" label
 * stamped at MatchController construction. These tests drive the REAL
 * MatchRoom.onCreate/onJoin/onLeave through the same stubbed-transport harness as
 * roomHardening.test.ts (DEV mode: no PLATFORM_GAME_SHARED_SECRET, so the dev
 * takeover path is exercised) and assert the seat is (a) renamed off "Bot N",
 * (b) sanitized when a dev name is supplied, (c) NEVER overwritten when a real
 * platform-assigned name is already present, and (d) name-stable across a
 * leave + reconnect.
 */
import { describe, it, expect } from "vitest";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";
import type { Seat } from "../seat/Seat";

type Handler = (client: FakeClient, msg: unknown) => void;

interface FakeClient {
  sessionId: string;
  userData: Record<string, unknown>;
  leave: () => void;
  send: () => void;
}

/** The MatchRoom members these tests drive, cast away from Colyseus overloads. */
interface RoomTestHandle {
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: Handler) => void;
  onCreate(o: MatchRoomOptions): Promise<void>;
  onJoin(c: FakeClient, o: object): void;
  onLeave(c: FakeClient, consented: boolean): Promise<void>;
  onDispose(): void;
  seatBySession: Map<string, number>;
  ctl: { tick(): unknown; seats: Map<number, Seat> };
}

function fakeClient(sessionId: string): FakeClient {
  return { sessionId, userData: {}, leave: () => {}, send: () => {} };
}

/** A MatchRoom with the transport stubbed and its onMessage handlers captured. */
function makeRoom(): RoomTestHandle {
  const room = new MatchRoom() as unknown as RoomTestHandle;
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  return room;
}

const baseOptions = (extra: Partial<MatchRoomOptions> = {}): MatchRoomOptions => ({
  matchId: "seat-name",
  seed: 1,
  whitelist: Whitelist.allowAll(),
  combatEnv: {}, // inject → no platform fetch
  ...extra,
});

describe("MatchRoom dev takeover seat naming (#156)", () => {
  it("stamps 'Bot N' at construction, then renames the taken-over seat off it", async () => {
    const room = makeRoom();
    await room.onCreate(baseOptions()); // all-bot dev match
    const seat0 = room.ctl.seats.get(0)!;
    expect(seat0.displayName).toBe("Bot 0"); // the stale label the bug shows

    const client = fakeClient("sess-1");
    room.onJoin(client, {}); // dev takeover, NO supplied name
    const seatId = room.seatBySession.get("sess-1")!;
    const seat = room.ctl.seats.get(seatId)!;

    // the generic "Bot N" label is replaced by the "Player N" fallback…
    expect(seat.displayName).toBe(`Player ${seatId}`);
    expect(/^Bot /.test(seat.displayName)).toBe(false);
    // …and the seat is genuinely human-driven after the driver swap lands
    room.ctl.tick();
    expect(seat.driverKind).toBe("human");
    room.onDispose();
  });

  it("uses a supplied dev name, sanitized (markup stripped)", async () => {
    const room = makeRoom();
    await room.onCreate(baseOptions());
    const client = fakeClient("sess-2");
    // '<' and '>' are dropped by sanitizeDisplayName → the payload can't be markup
    room.onJoin(client, { displayName: "Riko<script>" });
    const seatId = room.seatBySession.get("sess-2")!;
    const seat = room.ctl.seats.get(seatId)!;
    expect(seat.displayName).toBe("Rikoscript");
    expect(/^Bot /.test(seat.displayName)).toBe(false);
    room.onDispose();
  });

  it("never overwrites a real platform-assigned name (non-regression)", async () => {
    const room = makeRoom();
    // seat 0 reserved by the platform with a real display name
    await room.onCreate(
      baseOptions({ seats: [{ seatId: 0, teamId: 0, accountId: "a", displayName: "Riko" }] }),
    );
    expect(room.ctl.seats.get(0)!.displayName).toBe("Riko");

    const client = fakeClient("sess-3");
    // the platform human joins its reserved seat; even a supplied name must NOT
    // stomp the already-assigned "Riko" (guard only touches Bot/Player/empty)
    room.onJoin(client, { accountId: "a", displayName: "Attacker" });
    expect(room.seatBySession.get("sess-3")).toBe(0);
    expect(room.ctl.seats.get(0)!.displayName).toBe("Riko");
    room.onDispose();
  });

  it("keeps the name across a consented leave + reconnect", async () => {
    const room = makeRoom();
    await room.onCreate(baseOptions());
    const client = fakeClient("sess-4");
    room.onJoin(client, { displayName: "Neko" });
    const seatId = room.seatBySession.get("sess-4")!;
    const seat = room.ctl.seats.get(seatId)!;
    expect(seat.displayName).toBe("Neko");

    // onLeave never clears displayName (AI takes over, sessionId cleared)
    await room.onLeave(client, true);
    expect(seat.sessionId).toBeNull();
    expect(seat.displayName).toBe("Neko");

    // reconnect: Colyseus allowReconnection does NOT re-run onJoin — it only swaps
    // the HumanDriver back and restores the session. The name set once persists,
    // so simulate that swap and confirm the label is untouched.
    seat.setDriver(new HumanDriver());
    seat.sessionId = "sess-4b";
    room.ctl.tick();
    expect(seat.driverKind).toBe("human");
    expect(seat.displayName).toBe("Neko");
    // sanity: an AIDriver takeover likewise leaves the name intact
    seat.setDriver(new AIDriver());
    room.ctl.tick();
    expect(seat.displayName).toBe("Neko");
    room.onDispose();
  });
});
