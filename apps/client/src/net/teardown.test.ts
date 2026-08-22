/**
 * restart-teardown: leaving/restarting must cleanly close every Colyseus room
 * and drop input sinks so no socket callback or coalesced flush fires after a
 * GameApp is disposed. Also covers the dev cheat routing (MSG.CHEAT to the
 * primary connection only).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { MSG, type EventMessage } from "@ggd/shared/protocol/messages";
import { RoomConnection } from "./RoomConnection";
import { MultiSession } from "./MultiSession";

interface FakeRoom {
  sent: { type: string; payload: unknown }[];
  left: boolean;
  send(type: string, payload: unknown): void;
  leave(consented?: boolean): Promise<number>;
  roomId: string;
}

function fakeRoom(): FakeRoom {
  const room: FakeRoom = {
    sent: [],
    left: false,
    send(type, payload) {
      room.sent.push({ type, payload });
    },
    leave() {
      room.left = true;
      return Promise.resolve(1);
    },
    roomId: "r1",
  };
  return room;
}

/** Inject a fake room onto a RoomConnection (bypasses the real socket). */
function attach(conn: RoomConnection, room: FakeRoom): void {
  (conn as unknown as { room: unknown }).room = room;
}

describe("RoomConnection cheat + teardown", () => {
  it("sendCheat emits MSG.CHEAT wrapping the cheat payload (cheat-payload)", () => {
    cover("cheat-payload");
    const conn = new RoomConnection("acc");
    const room = fakeRoom();
    attach(conn, room);
    conn.sendCheat({ kind: "setLevel", level: 18 });
    expect(room.sent).toEqual([{ type: MSG.CHEAT, payload: { cheat: { kind: "setLevel", level: 18 } } }]);
  });

  it("leave() closes the room, clears the event queue, and nulls the room (restart-teardown)", () => {
    cover("restart-teardown");
    const conn = new RoomConnection("acc");
    const room = fakeRoom();
    attach(conn, room);
    (conn as unknown as { queuedEvents: EventMessage[] }).queuedEvents.push({ type: "x", tick: 0, data: {} });
    // ⭐ GH#596 —— 先**真的指派**一個回呼再 leave()。在此之前這一行不存在，於是
    // 下面那條 `toBeNull()` 斷言的其實是「全 repo 沒有人指派 onDisconnect」——
    // 它在守一個缺陷，⛔ 不是在守 leave() 有沒有清掉它。
    conn.onDisconnect = () => {};
    conn.leave();
    expect(room.left).toBe(true);
    expect(conn.room).toBeNull();
    expect(conn.drainEvents()).toEqual([]); // queue cleared
    expect(conn.onDisconnect).toBeNull();
  });
});

describe("MultiSession teardown", () => {
  it("dispose leaves every connection and drops input sinks (idempotent) (restart-teardown)", () => {
    cover("restart-teardown");
    const ms = new MultiSession(["a", "a:p2"]);
    const rooms = ms.connections.map(() => fakeRoom());
    ms.connections.forEach((c, i) => attach(c, rooms[i]!));
    ms.senders.forEach((s) => (s.onSent = () => {}));

    ms.dispose();

    for (const r of rooms) expect(r.left).toBe(true); // all rooms left
    for (const s of ms.senders) expect(s.onSent).toBeNull(); // sinks dropped
    for (const c of ms.connections) expect(c.room).toBeNull();
    expect(() => ms.dispose()).not.toThrow(); // safe to call twice (Leave then unmount)
  });

  it("sendCheat routes to the PRIMARY connection only (cheat-payload)", () => {
    cover("cheat-payload");
    const ms = new MultiSession(["a", "a:p2"]);
    const rooms = ms.connections.map(() => fakeRoom());
    ms.connections.forEach((c, i) => attach(c, rooms[i]!));

    ms.sendCheat({ kind: "godMode", enabled: true });

    expect(rooms[0]!.sent).toHaveLength(1);
    expect(rooms[0]!.sent[0]!.type).toBe(MSG.CHEAT);
    expect(rooms[1]!.sent).toHaveLength(0); // couch guests never send cheats
  });
});
