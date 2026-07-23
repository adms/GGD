/**
 * sec-create-01: the PROD creation gate on MatchRoom.onCreate (DoS:
 * room-creation-flood). With a shared secret configured, a client-initiated
 * create()/joinOrCreate("match") carries no valid server-minted createToken, so
 * onCreate must THROW before any sim world is allocated; only the /_internal
 * path (which injects a signed token) may create.
 *
 * MatchRoom captures PLATFORM_GAME_SHARED_SECRET at import time, so this file
 * sets the env and then dynamically imports a fresh module graph (vitest
 * isolates modules per file) — the only way to exercise the prod branch.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Whitelist } from "../curation/whitelist";
import type { MatchRoomOptions } from "./MatchRoom";

const SECRET = "create-gate-secret";

describe("MatchRoom creation gate (prod secret) — sec-create-01", () => {
  let MatchRoom: typeof import("./MatchRoom").MatchRoom;
  let mintCreateToken: typeof import("./createGate").mintCreateToken;
  let roomRegistry: import("./roomRegistry").RoomRegistry;
  const PREV = process.env.PLATFORM_GAME_SHARED_SECRET;

  beforeAll(async () => {
    process.env.PLATFORM_GAME_SHARED_SECRET = SECRET;
    ({ MatchRoom } = await import("./MatchRoom"));
    ({ mintCreateToken } = await import("./createGate"));
    ({ roomRegistry } = await import("./roomRegistry"));
  });

  afterAll(() => {
    if (PREV === undefined) delete process.env.PLATFORM_GAME_SHARED_SECRET;
    else process.env.PLATFORM_GAME_SHARED_SECRET = PREV;
  });

  function makeRoom(): { onCreate(o: MatchRoomOptions): Promise<void>; onDispose(): void } {
    const room = new MatchRoom() as unknown as {
      setSimulationInterval: () => void;
      onMessage: () => void;
      onCreate(o: MatchRoomOptions): Promise<void>;
      onDispose(): void;
    };
    room.setSimulationInterval = (): void => {};
    room.onMessage = (): void => {};
    return room;
  }

  const opts = (extra?: Partial<MatchRoomOptions>): MatchRoomOptions => ({
    matchId: "m",
    seed: 1,
    whitelist: Whitelist.allowAll(),
    combatEnv: {},
    ...extra,
  });

  it("REJECTS a client-created room with NO createToken and builds no sim", async () => {
    const before = roomRegistry.active;
    await expect(makeRoom().onCreate(opts())).rejects.toThrow();
    expect(roomRegistry.active).toBe(before); // never acquired a slot
  });

  it("REJECTS a forged/garbage createToken", async () => {
    const before = roomRegistry.active;
    await expect(makeRoom().onCreate(opts({ createToken: "0.deadbeefdeadbeefdeadbeefdeadbeef" }))).rejects.toThrow();
    expect(roomRegistry.active).toBe(before);
  });

  it("ACCEPTS a valid server-minted createToken (the /_internal path)", async () => {
    const before = roomRegistry.active;
    const room = makeRoom();
    await room.onCreate(opts({ createToken: mintCreateToken(SECRET) }));
    expect(roomRegistry.active).toBe(before + 1);
    room.onDispose();
    expect(roomRegistry.active).toBe(before);
  });
});
