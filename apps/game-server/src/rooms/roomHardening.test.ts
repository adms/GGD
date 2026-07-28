/**
 * sec-room-01: game-server room hardening — DoS caps + injection at the room
 * ingress. Runs in DEV mode (no PLATFORM_GAME_SHARED_SECRET in the test env), so
 * the creation gate is intentionally open and these tests exercise the OTHER
 * guards: the process-wide room slot, per-room client cap, INPUT sanitization
 * and the message-flood rate limit through the real MatchRoom.onMessage closure.
 * The Colyseus transport is stubbed (setSimulationInterval/onMessage) so onCreate
 * runs without a socket, mirroring matchRoomCombatEnv.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { SEAT_COUNT } from "@ggd/shared/constants";
import { MSG } from "@ggd/shared/protocol/messages";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { RoomRegistry, roomRegistry } from "./roomRegistry";
import { mintCreateToken, verifyCreateToken } from "./createGate";
import { Whitelist } from "../curation/whitelist";
import { MAX_BUFFERED_COMMANDS } from "../seat/InputMailbox";

type Handler = (client: FakeClient, msg: unknown) => void;

interface FakeClient {
  sessionId: string;
  userData: Record<string, unknown>;
  leave: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

/** The MatchRoom members these tests drive, cast away from Colyseus overloads. */
interface RoomTestHandle {
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: Handler) => void;
  onCreate(o: MatchRoomOptions): Promise<void>;
  onJoin(c: FakeClient, o: object): void;
  onDispose(): void;
  maxClients: number;
  autoDispose: boolean;
  seatBySession: Map<string, number>;
  // `drain` takes the ABSOLUTE sim tick since #280 (the aim carry-forward's clock).
  humanDrivers: Map<number, { mailbox: { drain(tick: number): { commands: unknown[] } } }>;
}

function fakeClient(sessionId: string): FakeClient {
  return { sessionId, userData: {}, leave: vi.fn(), send: vi.fn() };
}

/** A MatchRoom with the transport stubbed and its onMessage handlers captured. */
function makeRoom(): { room: RoomTestHandle; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const room = new MatchRoom() as unknown as RoomTestHandle;
  room.setSimulationInterval = (): void => {};
  room.onMessage = (type: string, fn: Handler): void => {
    handlers.set(type, fn);
  };
  return { room, handlers };
}

const baseOptions = (): MatchRoomOptions => ({
  matchId: "sec-room",
  seed: 1,
  whitelist: Whitelist.allowAll(),
  combatEnv: {}, // inject → no platform fetch
});

describe("RoomRegistry — concurrent-room cap (sec-room-cap)", () => {
  it("caps acquisition at the ceiling and releases", () => {
    const r = new RoomRegistry(2);
    expect(r.tryAcquire()).toBe(true);
    expect(r.tryAcquire()).toBe(true);
    expect(r.active).toBe(2);
    expect(r.tryAcquire()).toBe(false); // at capacity → refuse
    r.release();
    expect(r.tryAcquire()).toBe(true);
    r.release();
    r.release();
    r.release(); // idempotent-safe at zero
    expect(r.active).toBe(0);
  });
});

describe("createGate — signed create-token (sec-room-createtoken)", () => {
  it("mint/verify roundtrip", () => {
    const t = mintCreateToken("secret");
    expect(verifyCreateToken("secret", t)).toBe(true);
  });

  it("rejects a wrong secret, a tampered token, empty, and non-string", () => {
    const t = mintCreateToken("secret");
    expect(verifyCreateToken("other", t)).toBe(false);
    expect(verifyCreateToken("secret", `${t}x`)).toBe(false);
    expect(verifyCreateToken("secret", "")).toBe(false);
    expect(verifyCreateToken("secret", undefined)).toBe(false);
    expect(verifyCreateToken("", t)).toBe(false);
  });

  it("rejects an expired token", () => {
    const now = 1_000_000;
    const t = mintCreateToken("secret", 30, now);
    expect(verifyCreateToken("secret", t, now + 10)).toBe(true);
    expect(verifyCreateToken("secret", t, now + 31)).toBe(false);
  });
});

describe("MatchRoom.onCreate — caps + room slot (sec-room-oncreate)", () => {
  it("sets the per-room client cap + autoDispose and acquires a room slot", async () => {
    const before = roomRegistry.active;
    const { room } = makeRoom();
    await room.onCreate(baseOptions());
    expect(room.maxClients).toBe(SEAT_COUNT);
    expect(room.autoDispose).toBe(true);
    expect(roomRegistry.active).toBe(before + 1);
    room.onDispose();
    expect(roomRegistry.active).toBe(before); // released on dispose (no zombie)
  });
});

describe("MatchRoom INPUT ingress — sanitization + rate limit (sec-room-input)", () => {
  it("drops a malicious payload, never throws, and keeps valid input", async () => {
    const { room, handlers } = makeRoom();
    await room.onCreate(baseOptions());
    const client = fakeClient("sess-1");
    room.onJoin(client, {});
    const seatId = room.seatBySession.get("sess-1")!;
    expect(seatId).toBeGreaterThanOrEqual(0);
    const mailbox = room.humanDrivers.get(seatId)!.mailbox;
    const input = handlers.get(MSG.INPUT)!;

    expect(() =>
      input(client, {
        seq: 1,
        commands: [
          { kind: "castAbility", slot: "__proto__", target: { type: "self" } },
          { kind: "sellItem", itemSlot: 999 },
          { kind: "rankUpAbility", slot: "constructor" },
          { kind: "nuke-the-server" },
        ],
      }),
    ).not.toThrow();
    expect(mailbox.drain(0).commands).toHaveLength(0);

    input(client, { seq: 2, commands: [{ kind: "ready" }] });
    expect(mailbox.drain(1).commands).toEqual([{ kind: "ready" }]);

    room.onDispose();
  });

  it("throttles a message flood and disconnects the abuser", async () => {
    const { room, handlers } = makeRoom();
    await room.onCreate(baseOptions());
    const client = fakeClient("flood-1");
    room.onJoin(client, {});
    const seatId = room.seatBySession.get("flood-1")!;
    const mailbox = room.humanDrivers.get(seatId)!.mailbox;
    const input = handlers.get(MSG.INPUT)!;

    for (let i = 1; i <= 5000; i++) {
      input(client, { seq: i, commands: [{ kind: "ready" }] });
    }
    // rate limit + mailbox cap keep the buffered work tiny vs the 5000 sent
    expect(mailbox.drain(0).commands.length).toBeLessThanOrEqual(MAX_BUFFERED_COMMANDS);
    // sustained flooding tripped the disconnect
    expect(client.leave).toHaveBeenCalled();

    room.onDispose();
  });
});
