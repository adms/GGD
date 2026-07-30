/**
 * `EventBatcher` + its settings — the unit half of the 合批 guard.
 *
 * The wire-level behaviour lives in `eventBatchWire.test.ts` (a real MatchRoom,
 * real frames, batched-vs-not stream comparison). THIS file pins the two things
 * that file cannot isolate:
 *   • ORDER, on inputs a real match will not reliably produce (a 300-event tick,
 *     a private send in the middle of a burst, a tick boundary inside a drain);
 *   • the SETTINGS surface — every knob rejected out of range rather than
 *     silently clamped (#277/#279), and every knob with an UPPER bound.
 *
 * The sink here records `{channel, payload}` rather than sending anything, and
 * every assertion reads the FLATTENED stream through the shipped
 * `unpackEventBatch` — the same function the browser client runs. So a change
 * to the wire shape has to keep both ends honest, and no assertion depends on
 * which internal method was called.
 */
import { describe, expect, it } from "vitest";
import { MSG, unpackEventBatch, type EventMessage } from "@ggd/shared/protocol/messages";
import {
  EventBatcher,
  DEFAULT_EVENT_BATCH,
  EVENT_BATCH_BOUNDS,
  EVENT_BATCH_ENV,
  resolveEventBatch,
  type EventBatchSettings,
} from "./eventBatch";

/** Records what the room would have put on the wire. */
class RecordingSink {
  readonly sent: { channel: string; payload: unknown }[] = [];
  one = (payload: EventMessage): void => {
    this.sent.push({ channel: MSG.EVENT, payload });
  };
  batch = (payload: { tick: number; evs: [string, Record<string, unknown>][] }): void => {
    this.sent.push({ channel: MSG.EVENT_BATCH, payload });
  };
  /** one entry per `ws.send()` — the WebSocket frame count for ONE client */
  get frames(): number {
    return this.sent.length;
  }
  /** what the client's frame loop would end up with, in arrival order */
  stream(): EventMessage[] {
    const out: EventMessage[] = [];
    for (const s of this.sent) {
      if (s.channel === MSG.EVENT) out.push(s.payload as EventMessage);
      else out.push(...unpackEventBatch(s.payload as never));
    }
    return out;
  }
}

const ev = (type: string, tick = 10, n = 0): EventMessage => ({ type, tick, data: { n } });

function make(over: Partial<EventBatchSettings> = {}): { b: EventBatcher; s: RecordingSink } {
  const s = new RecordingSink();
  return { b: new EventBatcher({ ...DEFAULT_EVENT_BATCH, ...over }, s), s };
}

describe("EventBatcher — order", () => {
  it("a batch replays the EXACT push order, not a sorted or grouped one", () => {
    const { b, s } = make();
    // interleaved on purpose: anything that groups by type would pass a
    // "same multiset" check and fail this one.
    const seq = ["castBegin", "damage", "hitImpact", "damage", "death", "hitImpact"];
    seq.forEach((t, i) => b.push(ev(t, 10, i)));
    b.flush();
    expect(s.frames).toBe(1);
    expect(s.stream().map((e) => e.type)).toEqual(seq);
    expect(s.stream().map((e) => e.data.n)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("splitting at maxBatchSize keeps the order across the split", () => {
    const { b, s } = make({ maxBatchSize: 4 });
    for (let i = 0; i < 10; i++) b.push(ev("damage", 10, i));
    b.flush();
    // 4 + 4 + 2 → three frames instead of ten
    expect(s.frames).toBe(3);
    expect(s.stream().map((e) => e.data.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("a private send in the middle keeps that recipient's relative order", () => {
    // This is the MatchRoom sequence: two room-wide events, a flush forced by a
    // single-recipient send, then more room-wide events. The recipient must see
    // castBegin BEFORE its own castRejected — the causal pair.
    const { b, s } = make();
    b.push(ev("castBegin", 10, 0));
    b.push(ev("damage", 10, 1));
    b.flush(); // ← what deliverSimEvent does before a private send
    s.one(ev("castRejected", 10, 2));
    b.push(ev("hitImpact", 10, 3));
    b.flush();
    expect(s.stream().map((e) => e.type)).toEqual([
      "castBegin",
      "damage",
      "castRejected",
      "hitImpact",
    ]);
  });

  it("a tick boundary inside one drain starts a new batch, never a merged one", () => {
    const { b, s } = make();
    b.push(ev("damage", 10, 0));
    b.push(ev("damage", 10, 1));
    b.push(ev("damage", 11, 2)); // different tick → forces a flush first
    b.flush();
    expect(s.frames).toBe(2);
    const stream = s.stream();
    expect(stream.map((e) => e.tick)).toEqual([10, 10, 11]);
    expect(stream.map((e) => e.data.n)).toEqual([0, 1, 2]);
  });
});

describe("EventBatcher — frames", () => {
  it("N events in one tick become ONE frame instead of N", () => {
    const { b, s } = make();
    for (let i = 0; i < 24; i++) b.push(ev("damage", 10, i));
    b.flush();
    expect(s.frames).toBe(1);
    expect(s.stream()).toHaveLength(24);
  });

  it("disabled reproduces the pre-batching wire exactly: one frame per event", () => {
    const { b, s } = make({ enabled: false });
    for (let i = 0; i < 5; i++) b.push(ev("damage", 10, i));
    b.flush();
    expect(s.frames).toBe(5);
    expect(s.sent.every((x) => x.channel === MSG.EVENT)).toBe(true);
    expect(s.stream().map((e) => e.data.n)).toEqual([0, 1, 2, 3, 4]);
  });

  it("below minBatchSize the plain channel is used — a lone event is not wrapped", () => {
    const { b, s } = make({ minBatchSize: 3 });
    b.push(ev("damage", 10, 0));
    b.push(ev("death", 10, 1));
    b.flush();
    expect(s.sent.every((x) => x.channel === MSG.EVENT)).toBe(true);
    expect(s.stream().map((e) => e.type)).toEqual(["damage", "death"]);
  });

  it("flush on an empty tick sends nothing at all", () => {
    const { b, s } = make();
    b.flush();
    b.flush();
    expect(s.frames).toBe(0);
  });

  it("flush is idempotent — a double flush never duplicates an event", () => {
    const { b, s } = make();
    b.push(ev("damage", 10, 0));
    b.push(ev("damage", 10, 1));
    b.flush();
    b.flush();
    expect(s.frames).toBe(1);
    expect(s.stream()).toHaveLength(2);
  });
});

describe("event-batch settings", () => {
  it("an empty env yields the shipped defaults", () => {
    expect(resolveEventBatch({})).toEqual(DEFAULT_EVENT_BATCH);
  });

  it("每個欄位都可以從環境變數關掉／調整 — no rebuild needed", () => {
    const s = resolveEventBatch({
      [EVENT_BATCH_ENV.enabled]: "0",
      [EVENT_BATCH_ENV.minBatchSize]: "1",
      [EVENT_BATCH_ENV.maxBatchSize]: "64",
      [EVENT_BATCH_ENV.batchPrivate]: "true",
    });
    expect(s).toEqual({ enabled: false, minBatchSize: 1, maxBatchSize: 64, batchPrivate: true });
  });

  it("out of range falls back to the default instead of clamping (#277/#279)", () => {
    const B = EVENT_BATCH_BOUNDS;
    for (const bad of [String(B.maxBatchSize.max + 1), "0", "-5", "2.5", "abc", "1e9"]) {
      const s = resolveEventBatch({ [EVENT_BATCH_ENV.maxBatchSize]: bad });
      expect(s.maxBatchSize, `maxBatchSize=${bad} was accepted or clamped`).toBe(
        DEFAULT_EVENT_BATCH.maxBatchSize,
      );
    }
  });

  it("every numeric field has an UPPER bound, not only a lower one", () => {
    for (const [name, b] of Object.entries(EVENT_BATCH_BOUNDS)) {
      expect(Number.isFinite(b.max), `${name} has no finite upper bound`).toBe(true);
      expect(b.max).toBeGreaterThan(b.min);
    }
  });

  it("min above max cannot produce a config that reads enabled but batches nothing", () => {
    const s = resolveEventBatch({
      [EVENT_BATCH_ENV.minBatchSize]: "100",
      [EVENT_BATCH_ENV.maxBatchSize]: "10",
    });
    expect(s.maxBatchSize).toBeGreaterThanOrEqual(s.minBatchSize);
    // and it really batches: 100 events in a tick leave as one frame
    const sink = new RecordingSink();
    const b = new EventBatcher(s, sink);
    for (let i = 0; i < 100; i++) b.push(ev("damage", 10, i));
    b.flush();
    expect(sink.frames).toBe(1);
  });

  it("batching ships ON — the measurement is decisive at both populations", () => {
    // 8.2 events/tick at the shipped mob cap → 98 frames/tick → 12;
    // 29.5/tick at 600 zombies/zone → 354 → 12. Same-tick batching costs no
    // latency, so there is no reason to ship it off. `GGD_EVENT_BATCH=0` is the
    // rollback and `eventBatchWire.test.ts` proves that path still works.
    expect(DEFAULT_EVENT_BATCH.enabled).toBe(true);
    // …and private events are NOT swept into the broadcast by default.
    expect(DEFAULT_EVENT_BATCH.batchPrivate).toBe(false);
  });
});
