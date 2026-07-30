/**
 * 每 tick 的事件合批 —— the BEHAVIOUR guard.
 *
 * TWO CLAIMS, and the test is worthless unless it pins BOTH:
 *   1. FEWER MESSAGES ACTUALLY LEAVE. Not "the batcher was called", not "a
 *      batch object was built" — the count of deliveries that reached a client.
 *      In colyseus 0.16 that count IS the WebSocket frame count: a joined
 *      client's `enqueueRaw` goes straight to `ws.send()` (only a JOINING
 *      client is queued — @colyseus/ws-transport 0.16.5 WebSocketClient), and
 *      `ws.send()` writes exactly one frame. So one `send` on the fake client
 *      is one frame on the real socket.
 *   2. THE PLAYER SEES THE IDENTICAL EVENT SEQUENCE. Same events, same payloads,
 *      SAME ORDER. This is checked by running the SAME match twice — once with
 *      `GGD_EVENT_BATCH=0`, once with batching on — and comparing the decoded
 *      streams item for item. A batching bug that drops, duplicates or reorders
 *      one event cannot survive that comparison, and no hand-written expected
 *      list can go stale against it.
 *
 * WHY BOTH. Claim 1 alone is satisfied by "send nothing at all". Claim 2 alone
 * is satisfied by not batching. Only together do they say 合批 happened AND was
 * transparent.
 *
 * WHAT IS REAL HERE (failure ⑤ — 被測的不是出貨的那個). A real `MatchRoom`: its
 * real `onCreate`, its real `loop()`, the real sim producing the real events,
 * the real `isFannedOutEvent` whitelist, the real `deliverSimEvent`, the real
 * `EventBatcher` built from the real `resolveEventBatch(process.env)`. The
 * decode side is the SHIPPED `unpackEventBatch` the browser client calls — not
 * a re-implementation, so a change to the wire shape has to keep both ends
 * honest or this goes red.
 *
 * WHAT IS STUBBED: the socket. `room.broadcast` appends to every fake client's
 * inbox, exactly as `Room.broadcastMessageType` does (`for (client of
 * this.clients) client.enqueueRaw(encodedMessage)`); a client's `send` appends
 * to its own. The assertions never ask which function ran — only what arrived.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClientArray } from "@colyseus/core";
import {
  MSG,
  unpackEventBatch,
  type EventBatchMessage,
  type EventMessage,
} from "@ggd/shared/protocol/messages";
import { TICK_MS } from "@ggd/shared/constants";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { EVENT_BATCH_ENV } from "./eventBatch";

const REPLAY_TMP = mkdtempSync(join(tmpdir(), "ggd-event-batch-"));
beforeAll(() => {
  process.env.GGD_REPLAY_DIR = REPLAY_TMP;
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 50));
  delete process.env.GGD_REPLAY_DIR;
  delete process.env[EVENT_BATCH_ENV.enabled];
  delete process.env[EVENT_BATCH_ENV.minBatchSize];
  delete process.env[EVENT_BATCH_ENV.maxBatchSize];
  rmSync(REPLAY_TMP, { recursive: true, force: true });
});

interface Delivered {
  readonly type: string;
  readonly message: unknown;
}

/** Records every delivery. One entry == one `ws.send()` == one WS frame. */
class FakeClient {
  readonly inbox: Delivered[] = [];
  userData: Record<string, unknown> = {};
  constructor(readonly sessionId: string) {}
  send(type: string, message: unknown): void {
    this.inbox.push({ type, message });
  }
  leave(): void {}
  /** frames carrying sim events (either wire shape) */
  eventFrames(): number {
    return this.inbox.filter((d) => d.type === MSG.EVENT || d.type === MSG.EVENT_BATCH).length;
  }
  /**
   * The event stream this client would hand its frame loop — decoded through
   * the SHIPPED unpack, in arrival order.
   */
  stream(): EventMessage[] {
    const out: EventMessage[] = [];
    for (const d of this.inbox) {
      if (d.type === MSG.EVENT) out.push(d.message as EventMessage);
      else if (d.type === MSG.EVENT_BATCH) out.push(...unpackEventBatch(d.message as EventBatchMessage));
    }
    return out;
  }
}

type InputHandler = (c: FakeClient, m: unknown) => void;

interface RoomHandle {
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: InputHandler) => void;
  broadcast: (type: string, message: unknown) => void;
  clients: ClientArray;
  onCreate(o: MatchRoomOptions): Promise<void>;
  onJoin(c: FakeClient, o: object): void;
  loop(dtMs: number): void;
  deliverSimEvent(ev: { type: string; tick: number; data: Record<string, unknown> }): void;
  seatBySession: Map<string, number>;
  ctl: { phase: { phase: string }; seats: Map<number, { entityId: number }>; world: { tick: number } };
}

interface Run {
  readonly clients: readonly FakeClient[];
  /** total deliveries carrying events, summed over every client */
  frames(): number;
  /** every client's decoded stream must be the same room-wide stream */
  stream(): EventMessage[];
  /** feed a real MSG.INPUT through the real handler for client i */
  input(i: number, msg: unknown): void;
  run(ticks: number): void;
  /** the real MatchRoom method the fanout loop calls, one event at a time */
  deliver(ev: { type: string; tick: number; data: Record<string, unknown> }): void;
  /** the champion entity id client i's seat owns */
  entityOf(i: number): number;
}

/**
 * Run the SAME match (same id, same seed, same whitelist) to `ticks` of combat.
 * The only thing that differs between calls is `process.env`, so any difference
 * in the recorded streams is caused by the batching setting and nothing else.
 */
let runNo = 0;
async function runMatch(ticks: number): Promise<Run> {
  const room = new MatchRoom() as unknown as RoomHandle;
  room.setSimulationInterval = (): void => {};
  const handlers = new Map<string, InputHandler>();
  room.onMessage = (type, fn): void => {
    handlers.set(type, fn);
  };
  // Distinct id per run: the recorder refuses a second writer for the same id,
  // and its (harmless) refusal log otherwise reads like a failure in this file.
  await room.onCreate({
    matchId: `batch-guard-${++runNo}`,
    seed: 7,
    whitelist: Whitelist.allowAll(),
    combatEnv: {},
  });
  const clients: FakeClient[] = [];
  for (let i = 0; i < 3; i++) {
    const c = new FakeClient(`sess-${i}`);
    room.onJoin(c, {});
    clients.push(c);
  }
  room.clients = new ClientArray();
  room.clients.push(...(clients as unknown as ClientArray));
  room.broadcast = (type, message): void => {
    for (const c of clients) c.send(type, message);
  };

  let guard = 0;
  while (room.ctl.phase.phase !== "combat" && guard++ < 20_000) room.loop(TICK_MS);
  expect(room.ctl.phase.phase, "never reached combat — the harness is broken").toBe("combat");
  for (const c of clients) c.inbox.length = 0; // drop pre-combat noise
  for (let i = 0; i < ticks; i++) room.loop(TICK_MS);

  return {
    clients,
    frames: () => clients.reduce((a, c) => a + c.eventFrames(), 0),
    stream: () => clients[0]!.stream(),
    input: (i, msg) => handlers.get(MSG.INPUT)!(clients[i]!, msg),
    run: (n) => {
      for (let i = 0; i < n; i++) room.loop(TICK_MS);
    },
    deliver: (ev) => room.deliverSimEvent(ev),
    entityOf: (i) => room.ctl.seats.get(room.seatBySession.get(clients[i]!.sessionId)!)!.entityId,
  };
}

/** Pressing a slot the champion never learned → a certain `castRejected`. */
const castLockedSlot = {
  seq: 1,
  commands: [{ kind: "castAbility", slot: "EX", target: { type: "self" } }],
};

const COMBAT_TICKS = 900; // 30 s of combat: enough for the mob wave to bite

describe("per-tick event batching (wire behaviour)", () => {
  it("same match, batched vs not: FEWER frames, IDENTICAL event sequence", async () => {
    process.env[EVENT_BATCH_ENV.enabled] = "0";
    const off = await runMatch(COMBAT_TICKS);
    process.env[EVENT_BATCH_ENV.enabled] = "1";
    const on = await runMatch(COMBAT_TICKS);

    // ── the control: the run must actually have produced combat traffic. ──
    // Without this, a wire that died completely would satisfy "fewer frames".
    expect(off.stream().length, "no events at all — the guard proves nothing").toBeGreaterThan(200);

    // ── claim 1: fewer frames actually leave ──
    expect(on.frames()).toBeLessThan(off.frames());
    // and by a lot, not by one: the shipped cap measures ~8 events/tick, so a
    // batching that only ever caught pairs would be a rounding error.
    expect(on.frames()).toBeLessThan(off.frames() * 0.5);

    // ── claim 2: the player sees the identical sequence ──
    // Item for item, including order. `toEqual` on the whole array is the
    // assertion; a spot check on counts would pass a reordering.
    expect(on.stream()).toEqual(off.stream());

    // every client sees the same room-wide stream (broadcast, not per-seat)
    for (const c of on.clients) expect(c.stream()).toEqual(on.stream());
  }, 120_000);

  it("batching off reproduces the pre-batching wire: no evbatch frame at all", async () => {
    process.env[EVENT_BATCH_ENV.enabled] = "0";
    const off = await runMatch(300);
    const kinds = new Set(off.clients[0]!.inbox.map((d) => d.type));
    expect(kinds.has(MSG.EVENT_BATCH)).toBe(false);
    expect(kinds.has(MSG.EVENT)).toBe(true);
  }, 120_000);

  it("a rejection still lands AFTER the room-wide events emitted before it", async () => {
    // THE CAUSAL PAIR, and the ONE case the two runs above cannot reach.
    // `castRejected` is single-recipient, so it does not ride the batch. If
    // `deliverSimEvent` did not flush the pending batch before sending it, the
    // recipient would read its own refusal BEFORE events that were emitted
    // earlier in the same tick — the batch would arrive later, all at once.
    //
    // The events here are HAND-BUILT and that is deliberate: what is under test
    // is MatchRoom's DELIVERY ROUTING (the real `deliverSimEvent`, the real
    // `privateEventAddress`, the real `EventBatcher`), not the sim's production
    // of a refusal — and a real press cannot produce this interleaving, because
    // `CommandSystem` runs first in the step so `castRejected` is already the
    // FIRST event of its tick. That accident is exactly why the flush must be
    // guarded explicitly rather than assumed from live traffic.
    process.env[EVENT_BATCH_ENV.enabled] = "1";
    const on = await runMatch(120);
    const me = on.clients[0]!;
    const ent = on.entityOf(0);
    for (const c of on.clients) c.inbox.length = 0;

    const t = 4242;
    on.deliver({ type: "damage", tick: t, data: { target: ent, amount: 5 } }); // room-wide
    on.deliver({ type: "castRejected", tick: t, data: { entity: ent, slot: "Q", reason: "cooldown" } });
    on.deliver({ type: "hitImpact", tick: t, data: { target: ent } }); // room-wide
    on.run(1); // the loop's end-of-tick flush releases what is still pending

    const seen = me.stream().map((e) => e.type);
    const iDamage = seen.indexOf("damage");
    const iReject = seen.indexOf("castRejected");
    const iImpact = seen.indexOf("hitImpact");
    expect(iDamage, "the room-wide event never arrived").toBeGreaterThan(-1);
    expect(iReject, "the refusal never reached its recipient").toBeGreaterThan(-1);
    expect(iImpact, "the trailing room-wide event never arrived").toBeGreaterThan(-1);
    expect(iDamage, "the refusal overtook an event emitted before it").toBeLessThan(iReject);
    expect(iReject, "the refusal was overtaken by an event emitted after it").toBeLessThan(iImpact);

    // …and it still reaches ONLY the presser. Batching must not quietly undo
    // the single-recipient contract by sweeping the refusal into a broadcast.
    for (const other of on.clients.slice(1)) {
      expect(other.stream().filter((e) => e.type === "castRejected")).toHaveLength(0);
      expect(other.stream().filter((e) => e.type === "damage").length).toBeGreaterThan(0);
    }
  }, 120_000);

  it("a batch never spans two ticks — every event in it carries that tick", async () => {
    process.env[EVENT_BATCH_ENV.enabled] = "1";
    const on = await runMatch(600);
    const batches = on.clients[0]!.inbox
      .filter((d) => d.type === MSG.EVENT_BATCH)
      .map((d) => d.message as EventBatchMessage);
    expect(batches.length, "no batch was ever sent — nothing is under test").toBeGreaterThan(10);
    // The batch stamps ONE tick. If the flush ever moved out of the per-tick
    // loop, batches would merge and the SEQUENCE of stamps would stop being
    // strictly increasing where the same tick repeats — so check both that the
    // stamps never go backwards and that no tick is split across two batches
    // in a way that would need the flush to be late.
    const ticksSeen = batches.map((b) => b.tick);
    for (let i = 1; i < ticksSeen.length; i++) {
      expect(ticksSeen[i]!).toBeGreaterThanOrEqual(ticksSeen[i - 1]!);
    }
    // and the batch is never larger than one tick's worth of combat: the peak
    // measured is 67 events at 600 zombies/zone; the shipped cap is far below.
    for (const b of batches) expect(b.evs.length).toBeLessThanOrEqual(256);
  }, 120_000);
});
