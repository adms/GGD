/**
 * The CLIENT half of 每 tick 的事件合批.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE SERVER GUARD. The server can batch
 * perfectly and the feature still be a total loss, because colyseus.js DROPS
 * messages whose type has no registered handler — silently, no error, no
 * warning. A `RoomConnection.bind` that forgot `MSG.EVENT_BATCH` would produce
 * exactly the S2 symptom eventFanout.ts's header lists nine times: HP bars
 * drain, nothing else happens. So the assertion here is not "the unpack
 * function works" (that is `eventBatch.test.ts`'s job) — it is 「合批的訊息真的
 * 有被 RoomConnection 收下、解開、照順序放進 frame loop 的佇列」.
 *
 * WHAT IS REAL: the shipped `RoomConnection.bind` and the shipped
 * `drainEvents`. The fake is a Room object that records handlers and lets the
 * test deliver a message the way the socket would.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Room } from "colyseus.js";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { MSG, type EventBatchMessage, type EventMessage } from "@ggd/shared/protocol/messages";
import { RoomConnection, clearEvadeSightings, drainEvadeSightings } from "./RoomConnection";

/** Minimal stand-in for the colyseus.js Room the socket hands `bind`. */
class FakeRoom {
  readonly handlers = new Map<string, (msg: unknown) => void>();
  onMessage(type: string, fn: (msg: unknown) => void): void {
    this.handlers.set(type, fn);
  }
  onLeave(): void {}
  deliver(type: string, msg: unknown): void {
    const h = this.handlers.get(type);
    // Mirrors colyseus.js: an unregistered type is DROPPED, not thrown. Making
    // that visible is the point of this harness.
    if (h) h(msg);
  }
}

function bound(): { conn: RoomConnection; room: FakeRoom } {
  const conn = new RoomConnection();
  const room = new FakeRoom();
  // `bind` is private; it is the shipped entry point every connect path calls.
  (conn as unknown as { bind(r: Room<MatchState>): void }).bind(room as unknown as Room<MatchState>);
  return { conn, room };
}

const batch = (tick: number, types: string[]): EventBatchMessage => ({
  tick,
  evs: types.map((t, i) => [t, { n: i }] as [string, Record<string, unknown>]),
});

beforeEach(() => clearEvadeSightings());

describe("client accepts batched events (ct-b01)", () => {
  it("RoomConnection REGISTERS a handler for the batch channel", () => {
    const { room } = bound();
    // Without this, every batched tick is silently discarded and combat goes
    // mute while the schema keeps updating — the exact S2 shape.
    expect(room.handlers.has(MSG.EVENT_BATCH)).toBe(true);
    expect(room.handlers.has(MSG.EVENT)).toBe(true);
  });

  it("a batch drains as the SAME sequence the unbatched wire would give", () => {
    const seq = ["castBegin", "damage", "hitImpact", "damage", "death"];
    const { conn: batched, room: rb } = bound();
    rb.deliver(MSG.EVENT_BATCH, batch(42, seq));

    const { conn: singles, room: rs } = bound();
    seq.forEach((t, i) => rs.deliver(MSG.EVENT, { type: t, tick: 42, data: { n: i } }));

    const a = batched.drainEvents();
    const b = singles.drainEvents();
    expect(a).toEqual(b); // item for item, INCLUDING order
    expect(a.map((e: EventMessage) => e.type)).toEqual(seq);
    expect(a.every((e: EventMessage) => e.tick === 42)).toBe(true);
  });

  it("both wire shapes interleave into ONE ordered queue", () => {
    const { conn, room } = bound();
    room.deliver(MSG.EVENT_BATCH, batch(7, ["castBegin", "damage"]));
    room.deliver(MSG.EVENT, { type: "castRejected", tick: 7, data: {} });
    room.deliver(MSG.EVENT_BATCH, batch(7, ["hitImpact"]));
    expect(conn.drainEvents().map((e: EventMessage) => e.type)).toEqual([
      "castBegin",
      "damage",
      "castRejected",
      "hitImpact",
    ]);
  });

  it("迴避 inside a batch still reaches its own buffer", () => {
    // The side-channel is the one consumer that does NOT read `queuedEvents`,
    // so a batch path that only pushed to the queue would drop every dodge —
    // and dropping a dodge is indistinguishable from a lost packet on screen.
    const { conn, room } = bound();
    room.deliver(MSG.EVENT_BATCH, {
      tick: 3,
      evs: [
        ["damage", { n: 0 }],
        ["evade", { source: 1, target: 2, x: 5, z: 6 }],
      ],
    } satisfies EventBatchMessage);
    expect(conn.drainEvents()).toHaveLength(2);
    const dodges = drainEvadeSightings();
    expect(dodges).toHaveLength(1);
    expect(dodges[0]!.target).toBe(2);
  });

  it("a malformed pair is skipped, not thrown — one bad entry never mutes the tick", () => {
    const { conn, room } = bound();
    room.deliver(MSG.EVENT_BATCH, {
      tick: 9,
      evs: [["damage", { n: 0 }], [42 as never, {}], ["death", { n: 1 }]],
    } as EventBatchMessage);
    expect(conn.drainEvents().map((e: EventMessage) => e.type)).toEqual(["damage", "death"]);
  });
});
