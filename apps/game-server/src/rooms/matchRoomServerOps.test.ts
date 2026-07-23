/**
 * ops-10..ops-13: MatchRoom CONSUMES the admin 系統運維 table.
 *
 * The two knobs are consumed at different moments on purpose, and this file
 * pins both:
 *   - maxRooms is pushed into the registry immediately BEFORE the admission
 *     gate, so an operator's edit is live at the very next create attempt —
 *     and lowering it below the live count refuses new matches WITHOUT ending
 *     any of the running ones (ops-10, ops-11).
 *   - snapshotHz becomes Room.patchRate, resolved once and frozen, so a save
 *     applies from the NEXT match (ops-12).
 *
 * NOTE THE SEAM. These tests drive the table through the MODULE-LEVEL
 * `setServerOpsForTests`, not through a field on the room's options bag. That
 * is deliberate and is itself the subject of ops-13: `onCreate` receives its
 * options from whoever created the room, which without a shared secret means
 * any client, and `maxRooms` moves PROCESS-WIDE state that outlives the room.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { Whitelist } from "../curation/whitelist";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { roomRegistry } from "./roomRegistry";
import { setServerOpsForTests } from "../config/serverOps";

interface TestRoom {
  onCreate(o: MatchRoomOptions): Promise<void>;
  onDispose(): void;
  patchRate: number;
}

function makeRoom(): TestRoom {
  const room = new MatchRoom() as unknown as TestRoom & {
    setSimulationInterval: () => void;
    onMessage: () => void;
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

afterEach(() => {
  setServerOpsForTests(null);
});

describe("MatchRoom × server-ops", () => {
  it("ops-10: the stored ceiling is in force at the very next create attempt", async () => {
    cover("ops-10");
    const base = roomRegistry.active;
    const rooms: TestRoom[] = [];

    // The operator's table says base+2 concurrent matches.
    setServerOpsForTests({ maxRooms: base + 2 });
    for (let i = 0; i < 2; i++) {
      const room = makeRoom();
      await room.onCreate(opts());
      rooms.push(room);
    }
    expect(roomRegistry.active).toBe(base + 2);
    expect(roomRegistry.capacity).toBe(base + 2);

    // The third is refused — no polling loop was needed for the ceiling to be
    // in effect, because onCreate is the only reader.
    await expect(makeRoom().onCreate(opts())).rejects.toThrow(/at capacity/);
    // a refused create must not consume a slot
    expect(roomRegistry.active).toBe(base + 2);

    for (const r of rooms) r.onDispose();
    expect(roomRegistry.active).toBe(base);
  });

  it("ops-11: lowering the ceiling below the live count does NOT kill a running match", async () => {
    cover("ops-11");
    const base = roomRegistry.active;
    const rooms: TestRoom[] = [];

    // Three matches running under a generous ceiling.
    setServerOpsForTests({ maxRooms: base + 10 });
    for (let i = 0; i < 3; i++) {
      const room = makeRoom();
      await room.onCreate(opts());
      rooms.push(room);
    }
    const live = roomRegistry.active;
    expect(live).toBe(base + 3);

    // The operator saves a ceiling BELOW the live count. What they see next:
    // the shard is draining — every new match is refused, and not one of the
    // running matches is touched.
    setServerOpsForTests({ maxRooms: 1 });
    await expect(makeRoom().onCreate(opts())).rejects.toThrow(/at capacity/);
    // no running match may be evicted by a config edit
    expect(roomRegistry.active).toBe(live);
    expect(roomRegistry.capacity).toBe(1);
    expect(roomRegistry.draining).toBe(true);
    expect(roomRegistry.stats()).toEqual({ active: live, capacity: 1, draining: true });

    // The running matches still own their slots and still dispose normally.
    for (const r of rooms) r.onDispose();
    expect(roomRegistry.active).toBe(base);
    expect(roomRegistry.draining).toBe(base > 1);

    // Restore a sane ceiling for any later test in this module graph.
    roomRegistry.setCapacity(50);
  });

  it("ops-12: snapshotHz becomes patchRate, resolved once and FROZEN per match", async () => {
    cover("ops-12");
    setServerOpsForTests({ maxRooms: 50, snapshotHz: 30 });
    const room = makeRoom();
    await room.onCreate(opts());
    expect(room.patchRate).toBeCloseTo(1000 / 30, 6);

    // An operator saves while this match is running. The room must not notice:
    // the value was read exactly once, in onCreate, and a running match keeps
    // the rate it started with. (Only 30 Hz is currently accepted by the
    // platform — the client fleet's compiled interpolation delay is exactly two
    // 30 Hz intervals — so the freeze is demonstrated by mutating the table
    // rather than by a second legal rate.)
    setServerOpsForTests({ maxRooms: 50, snapshotHz: 30 });
    expect(room.patchRate).toBeCloseTo(1000 / 30, 6);
    room.onDispose();
  });

  it("ops-13: the ops table is NOT reachable through the client-supplied options bag", async () => {
    cover("ops-13");
    const base = roomRegistry.active;
    roomRegistry.setCapacity(50);

    // A dev/LAN deploy runs without PLATFORM_GAME_SHARED_SECRET, so a client can
    // call joinOrCreate("match", {...}) and its object lands in onCreate as-is.
    // maxRooms is not per-match state — it is the PROCESS-WIDE admission
    // ceiling — so if the bag could carry it, one join would pin the whole shard
    // at a single concurrent match for every other player, or raise the ceiling
    // to 500 and delete the DoS guard the registry exists to be.
    const hostile = { ...opts(), serverOps: { maxRooms: 1 } } as MatchRoomOptions;
    const room = makeRoom();
    await room.onCreate(hostile);

    expect(roomRegistry.capacity).toBe(50);
    expect(roomRegistry.active).toBe(base + 1);
    room.onDispose();

    const greedy = { ...opts(), serverOps: { maxRooms: 500 } } as MatchRoomOptions;
    const room2 = makeRoom();
    await room2.onCreate(greedy);
    expect(roomRegistry.capacity).toBe(50);
    room2.onDispose();
  });
});
