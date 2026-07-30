/**
 * 「只有一個人要看」的事件不要廣播給全房 —— the BEHAVIOUR guard.
 *
 * WHAT IS ACTUALLY UNDER TEST. A real `MatchRoom`: its real `onCreate`, its real
 * `MSG.INPUT` handler (so the payload goes through `sanitizeInputMessage`, the
 * rate limiter, the seat mailbox and `HumanDriver`), its real `loop()`, the real
 * sim's `CommandSystem` producing the real `castRejected` / `buyRejected`, and
 * the real `deliverSimEvent` doing the routing. Nothing about the rejection is
 * hand-written — failure ⑤ (「被測的不是出貨的那個」) is what killed the 變身
 * rebuild guard, and a hand-rolled `world.emit("castRejected", …)` here would be
 * the same mistake one lane over.
 *
 * WHAT IS STUBBED, and why that is not the bug. There is no socket in-process,
 * so the two SINKS are recorded instead of transmitted:
 *   • `room.broadcast` is replaced with a function that appends to EVERY fake
 *     client's inbox — which is exactly what Colyseus's own
 *     `Room.broadcastMessageType` does (`for (client of this.clients)
 *     client.enqueueRaw(encodedMessage)`, @colyseus/core 0.16.24);
 *   • each fake client's `send` appends to its own inbox — exactly what
 *     `WebSocketClient.send` does (`getMessageBytes.raw(Protocol.ROOM_DATA, …)`
 *     then `enqueueRaw`).
 * So the assertions NEVER look at which function was called. They only ask WHO
 * RECEIVED THE MESSAGE, which is the only thing a player can observe and the
 * only thing that stays true if the delivery is refactored again. That is what
 * makes reverting `deliverSimEvent` to a plain broadcast go red (see the
 * mutation log in the commit message).
 *
 * THE CONTROL that stops a false green: every "only one client got it" case is
 * paired with an assertion that a WORLD event from the SAME run reached ALL of
 * them. Without it, a fanout that had broken completely — nobody gets anything —
 * would satisfy "the other two received no rejection" and the suite would
 * certify a wire that is entirely dead.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientArray } from "@colyseus/core";
import { MSG } from "@ggd/shared/protocol/messages";
import { TICK_MS } from "@ggd/shared/constants";
import type { SimEvent } from "@ggd/shared/sim/SimWorld";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";
import { Whitelist } from "../curation/whitelist";
import type { Seat } from "../seat/Seat";
import {
  PRIVATE_EVENT_RULES,
  PRIVATE_EVENT_FANOUT,
  privateEventAddress,
  isPrivateEvent,
  isFannedOutEvent,
  FANNED_OUT_EVENT_TYPES,
} from "./eventFanout";

// Recordings are a real side effect of onCreate; keep them out of data/replays
// (the directory #207 found drowned in 95 test artefacts). Set before the first
// room is built — `replayDir()` reads the env on every call.
const REPLAY_TMP = mkdtempSync(join(tmpdir(), "ggd-private-events-"));
beforeAll(() => {
  process.env.GGD_REPLAY_DIR = REPLAY_TMP;
});
afterAll(async () => {
  // `onDispose` seals recordings with `void rec.abandon()`, so give the pending
  // async writes a turn before the directory goes away — otherwise the teardown
  // prints ENOENT noise that looks like a failure and is not one.
  await new Promise((r) => setTimeout(r, 50));
  delete process.env.GGD_REPLAY_DIR;
  rmSync(REPLAY_TMP, { recursive: true, force: true });
});

interface Delivered {
  readonly type: string;
  readonly message: { type: string; tick: number; data: Record<string, unknown> };
}

/** A client that records what reached it, whichever path put it there. */
class FakeClient {
  readonly inbox: Delivered[] = [];
  userData: Record<string, unknown> = {};
  constructor(readonly sessionId: string) {}
  send(type: string, message: unknown): void {
    this.inbox.push({ type, message: message as Delivered["message"] });
  }
  leave(): void {}
  /** every MSG.EVENT this client saw, in arrival order */
  events(): Delivered["message"][] {
    return this.inbox.filter((d) => d.type === MSG.EVENT).map((d) => d.message);
  }
  countOf(evType: string): number {
    return this.events().filter((m) => m.type === evType).length;
  }
}

type InputHandler = (client: FakeClient, msg: unknown) => void;

interface RoomHandle {
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: InputHandler) => void;
  broadcast: (type: string, message: unknown) => void;
  clients: ClientArray;
  privateFanout: boolean;
  onCreate(o: MatchRoomOptions): Promise<void>;
  onJoin(c: FakeClient, o: object): void;
  onDispose(): void;
  loop(dtMs: number): void;
  deliverSimEvent(ev: SimEvent): void;
  seatBySession: Map<string, number>;
  ctl: { phase: { phase: string }; seats: Map<number, Seat>; world: { tick: number; events: SimEvent[] } };
}

interface Harness {
  readonly room: RoomHandle;
  readonly clients: readonly FakeClient[];
  /** seatId claimed by clients[i] */
  seatOf(i: number): number;
  input(i: number, msg: unknown): void;
  /** run the REAL room loop for n ticks */
  run(ticks: number): void;
}

/**
 * A real MatchRoom with `humans` sockets joined, driven to `combat`.
 *
 * The champ-select + intermission clocks are the shipped ones (no fast-forward
 * knob exists on MatchRoomOptions), so this simply runs the real loop until the
 * phase machine says combat — a few thousand 30 Hz ticks, single-digit ms each.
 */
async function harness(matchId: string, humans = 3): Promise<Harness> {
  const room = new MatchRoom() as unknown as RoomHandle;
  room.setSimulationInterval = (): void => {};
  const handlers = new Map<string, InputHandler>();
  room.onMessage = (type, fn): void => {
    handlers.set(type, fn);
  };
  await room.onCreate({
    matchId,
    seed: 7,
    whitelist: Whitelist.allowAll(),
    combatEnv: {}, // injected → no platform fetch
  });

  const clients: FakeClient[] = [];
  for (let i = 0; i < humans; i++) {
    const c = new FakeClient(`sess-${i}`);
    room.onJoin(c, {});
    clients.push(c);
  }
  // The transport normally owns this array; populate it so `clients.getById`
  // (the REAL ClientArray method the room calls) can resolve a session.
  room.clients = new ClientArray();
  room.clients.push(...(clients as unknown as ClientArray));

  // Fan a broadcast to everyone, exactly as Room.broadcastMessageType does.
  room.broadcast = (type, message): void => {
    for (const c of clients) c.send(type, message);
  };

  const run = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) room.loop(TICK_MS);
  };
  let guard = 0;
  while (room.ctl.phase.phase !== "combat" && guard++ < 20_000) run(1);
  expect(room.ctl.phase.phase, "never reached combat — the harness is broken").toBe("combat");
  for (const c of clients) c.inbox.length = 0; // drop the pre-combat noise

  return {
    room,
    clients,
    seatOf: (i) => room.seatBySession.get(clients[i]!.sessionId)!,
    input: (i, msg) => handlers.get(MSG.INPUT)!(clients[i]!, msg),
    run,
  };
}

/** Press an ability the champion has not learned → a certain `castRejected`. */
const castLockedSlot = { seq: 1, commands: [{ kind: "castAbility", slot: "EX", target: { type: "self" } }] };
/** Buy while the shop is closed (we are in combat) → a certain `buyRejected`. */
const buyWhileClosed = { seq: 2, commands: [{ kind: "buyItem", itemId: "godie-i001" }] };

describe("private events — a rejection reaches ONLY the player it is about", () => {
  it("castRejected goes to the one client whose champion was refused", async () => {
    const h = await harness("priv-cast");
    h.input(0, castLockedSlot);
    // long enough for the control below to have real world traffic in it (bots
    // engaging), and every extra tick is another chance for a stray rejection to
    // leak to a bystander — so it strengthens both halves, not just one.
    h.run(90);

    const mine = h.clients[0]!.countOf("castRejected");
    expect(mine, "the player who pressed the button got no answer at all").toBeGreaterThan(0);
    expect(
      [h.clients[1]!.countOf("castRejected"), h.clients[2]!.countOf("castRejected")],
      "somebody else's refused cast is still being delivered to bystanders",
    ).toEqual([0, 0]);

    // …and the wire is alive: a world event from the same run reached everybody.
    const world = h.clients.map((c) => c.events().filter((m) => !isPrivateEvent(m as unknown as SimEvent)).length);
    expect(Math.min(...world), "NO world events reached anyone — the fanout is dead, not private").toBeGreaterThan(0);
    expect(new Set(world).size, "world events are no longer reaching every client equally").toBe(1);
    h.room.onDispose();
  });

  it("buyRejected (entity + seatId in one payload) goes to the buyer only", async () => {
    const h = await harness("priv-buy");
    h.input(1, buyWhileClosed);
    h.run(4);

    expect(h.clients[1]!.countOf("buyRejected"), "the buyer was told nothing").toBeGreaterThan(0);
    expect(
      [h.clients[0]!.countOf("buyRejected"), h.clients[2]!.countOf("buyRejected")],
      "a shop rejection is still broadcast to the room",
    ).toEqual([0, 0]);
    h.room.onDispose();
  });

  it("two different players' rejections do not cross", async () => {
    const h = await harness("priv-cross");
    h.input(0, castLockedSlot);
    h.input(2, castLockedSlot);
    h.run(4);

    expect(h.clients[0]!.countOf("castRejected")).toBeGreaterThan(0);
    expect(h.clients[2]!.countOf("castRejected")).toBeGreaterThan(0);
    expect(h.clients[1]!.countOf("castRejected"), "the bystander received someone else's refusal").toBe(0);
    // each one got its OWN entity id back, not the other player's
    const idOf = (i: number): unknown =>
      h.clients[i]!.events().find((m) => m.type === "castRejected")!.data.entity;
    expect(idOf(0)).toBe(h.room.ctl.seats.get(h.seatOf(0))!.entityId);
    expect(idOf(2)).toBe(h.room.ctl.seats.get(h.seatOf(2))!.entityId);
    expect(idOf(0)).not.toBe(idOf(2));
    h.room.onDispose();
  });

  /**
   * A SEAT WITH NO SOCKET.
   *
   * This one does NOT come out of the sim, and that is a deliberate, stated
   * choice rather than a shortcut. MEASURED: an all-bot 6,000-tick match emits
   * only 31–70 private events across three seeds (6–10 `castRejected`, 25–60
   * `buyRejected`), i.e. roughly one per 100+ ticks and entirely seed-dependent.
   * A "run N ticks and hope a bot refuses something" test would be flaky, and a
   * flaky guard gets deleted. Worse, the first draft of exactly that test PASSED
   * against a mutation that put bot rejections back on the broadcast — it was
   * vacuous (failure ③), which is how this note came to exist.
   *
   * So the event is synthesised, but nothing else is: the payload SHAPE is the
   * one `sim/systems/CommandSystem.ts` really writes (pinned separately by the
   * addressing-rule suite below, which fails if the sim renames a field), the
   * entity id is read off a REAL bot seat in a REAL room, and the function under
   * test is the shipping `deliverSimEvent`. The human control in the same test
   * is what proves the harness can still deliver at all.
   */
  it("a seat with no socket (a BOT) is sent nothing at all", async () => {
    const h = await harness("priv-bot");
    const botSeat = [...h.room.ctl.seats.values()].find((s) => s.sessionId === null && s.entityId !== null);
    expect(botSeat, "no AI seat with a champion — the harness is broken").toBeDefined();

    const reject = (entity: number): SimEvent => ({
      type: "castRejected",
      tick: h.room.ctl.world.tick,
      data: { entity, slot: "Q", reason: "cooldown" },
    });
    h.room.deliverSimEvent(reject(botSeat!.entityId as unknown as number));
    expect(
      h.clients.map((c) => c.countOf("castRejected")),
      "a bot's refused cast is still reaching human sockets",
    ).toEqual([0, 0, 0]);

    // CONTROL: the same call for a HUMAN's entity does land, so the assertion
    // above is about routing and not about a dead harness.
    h.room.deliverSimEvent(reject(h.room.ctl.seats.get(h.seatOf(1))!.entityId as unknown as number));
    expect(h.clients.map((c) => c.countOf("castRejected"))).toEqual([0, 1, 0]);
    h.room.onDispose();
  });

  /**
   * THE FAIL-OPEN BRANCH, pinned. An id that belongs to no seat (a summon, a
   * mob, a stale entity from a previous round) must still reach everybody:
   * "unrecognised" is not "unaddressed", and turning it into silence is exactly
   * the invisible-feature class this wire has already produced nine times. The
   * mutation that deleted this fallback passed every other test in the file.
   */
  it("a private event naming an id no seat owns still reaches everybody", async () => {
    const h = await harness("priv-orphan");
    const owned = new Set([...h.room.ctl.seats.values()].map((s) => s.entityId));
    let orphan = 900_000;
    while (owned.has(orphan as never)) orphan++;
    h.room.deliverSimEvent({ type: "castRejected", tick: 1, data: { entity: orphan, slot: "Q", reason: "cooldown" } });
    expect(
      h.clients.map((c) => c.countOf("castRejected")),
      "an unrecognised recipient was silently dropped instead of broadcast",
    ).toEqual([1, 1, 1]);
    h.room.onDispose();
  });
});

describe("private events — the rollback knob is real", () => {
  it("GGD_PRIVATE_EVENT_FANOUT=0 puts the rejection back on the broadcast", async () => {
    const h = await harness("priv-off");
    h.room.privateFanout = false; // what the env var sets at construction
    h.input(0, castLockedSlot);
    h.run(4);
    const counts = h.clients.map((c) => c.countOf("castRejected"));
    expect(Math.min(...counts), "the kill switch did not restore the broadcast").toBeGreaterThan(0);
    expect(new Set(counts).size, "the restored broadcast is not reaching everybody equally").toBe(1);
    h.room.onDispose();
  });

  it("ships with private delivery ON", () => {
    expect(PRIVATE_EVENT_FANOUT).toBe(true);
  });
});

describe("private events — the addressing rules match what the sim really emits", () => {
  /**
   * Every private type must (a) still be fanned out at all, and (b) resolve to a
   * recipient on the payload shape the sim actually writes. A rule that silently
   * stops resolving degrades to a broadcast, which is safe but is exactly the
   * regression this lane exists to remove — so it is pinned rather than trusted.
   */
  const REAL_PAYLOADS: Record<string, Record<string, unknown>> = {
    // sim/systems/CommandSystem.ts + sim/systems/ChampionFormSystem.ts
    castRejected: { entity: 42, slot: "Q", reason: "cooldown" },
    // sim/systems/CommandSystem.ts — rejections carry BOTH ids
    buyRejected: { entity: 42, seatId: 3, itemId: "x", reason: "no-gold" },
    sellRejected: { entity: 42, seatId: 3, itemSlot: 0, reason: "empty-slot" },
    undoRejected: { entity: 42, seatId: 3, reason: "empty-stack" },
    // sim/economy/shop.ts — confirmations carry only `id`
    itemBought: { id: 42, itemId: "x", slot: 0, gold: 10 },
    itemSold: { id: 42, itemId: "x", slot: 0, gold: 10 },
    shopUndone: { id: 42, kind: "buy", itemId: "x", slot: 0, gold: 10 },
    // sim/coins.ts — seat only, because `no-champion` is one of its reasons
    coinDropRejected: { seatId: 3, reason: "alive" },
  };

  it("covers every rule, and every rule covers a real emit", () => {
    expect(Object.keys(REAL_PAYLOADS).sort()).toEqual([...PRIVATE_EVENT_RULES.keys()].sort());
  });

  for (const [type, data] of Object.entries(REAL_PAYLOADS)) {
    it(`${type} is fanned out AND resolves a recipient`, () => {
      const ev: SimEvent = { type, tick: 1, data };
      expect(isFannedOutEvent(ev), `${type} is private but no longer crosses the wire at all`).toBe(true);
      expect(FANNED_OUT_EVENT_TYPES.has(type)).toBe(true);
      const addr = privateEventAddress(ev);
      expect(addr, `${type}'s rule does not name a recipient on the sim's real payload`).not.toBeNull();
    });
  }

  it("prefers the ENTITY id when the payload carries both (the client filters on it)", () => {
    const addr = privateEventAddress({ type: "buyRejected", tick: 1, data: REAL_PAYLOADS.buyRejected! });
    expect(addr).toEqual({ kind: "entity", id: 42 });
  });

  it("falls back to the SEAT id when there is no entity", () => {
    const addr = privateEventAddress({ type: "coinDropRejected", tick: 1, data: { seatId: 0, reason: "alive" } });
    expect(addr).toEqual({ kind: "seat", id: 0 });
  });

  it("a payload naming NOBODY degrades to a broadcast, never to silence", () => {
    // the renamed-field / new-emit-site case: private type, no usable id
    expect(privateEventAddress({ type: "castRejected", tick: 1, data: { slot: "Q", reason: "cooldown" } })).toBeNull();
    expect(privateEventAddress({ type: "castRejected", tick: 1, data: { entity: "42" } })).toBeNull();
  });

  it("leaves every OTHER fanned-out event room-wide", () => {
    for (const type of ["damage", "death", "mobSpawn", "mobBossSpawn", "coinDropped", "coinPickedUp", "rankUp"]) {
      expect(privateEventAddress({ type, tick: 1, data: { id: 1, entity: 1, seatId: 1 } }), `${type} was privatised`).toBeNull();
    }
  });
});
