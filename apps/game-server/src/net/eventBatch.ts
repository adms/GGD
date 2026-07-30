/**
 * PER-TICK EVENT BATCHING — many sim events from one tick, one WebSocket frame.
 *
 * ─────────────────────────────────────────────────────────── WHY (MEASURED) ──
 * `room.broadcast(MSG.EVENT, …)` is not free per event. Colyseus 0.16 only
 * queues messages while a client is still JOINING (`WebSocketClient.enqueueRaw`,
 * @colyseus/ws-transport 0.16.5); once joined, every broadcast is an immediate
 * `ws.send()` PER CLIENT. So an N-event tick in a 12-seat room performs 12N
 * socket writes, each paying a colyseus envelope (1 B protocol + 6 B for the
 * "event" type string), a WS frame header, a write syscall, and — above
 * `wsCompression`'s 256 B threshold — its own deflate job on the libuv pool.
 *
 * Measured, not assumed. Real `SimWorld` ticks (arena.godie, 2 zones, 12 level-50
 * champions, shipped mob cap), replayed through the REAL colyseus encoder over
 * 12 REAL sockets with the shipped `DEFAULT_WS_COMPRESSION`, paced at 30 Hz:
 *
 *   population        events/tick        frames/tick        server CPU/tick
 *                     mean  p99  max     before → after     before → after
 *   50 mobs/zone      8.2    23   36      98.2  →  12       2.87 ms → 1.27 ms
 *   600 mobs/zone    29.5    58   67     353.9  →  12       9.27 ms → 1.75 ms
 *
 *   wire bytes/s to ONE client:  45,155 → 16,199 (−64.1%) at the shipped cap,
 *                               184,191 → 26,760 (−85.5%) at 600/zone.
 *
 * The byte win is MOSTLY A COMPRESSION WIN, not a framing win: uncompressed the
 * same corpus only drops 48,691 → 41,679 B/s (−14.4%). Batching lifts nearly
 * every message over the 256 B deflate threshold and hands zlib one redundant
 * blob instead of 98 tiny ones. Both effects are real; the honest headline is
 * "−64% wire, −56% CPU at the shipped cap", not "−14% framing".
 *
 * ──────────────────────────────────────────────── WHAT IS *NOT* CONFIGURABLE ──
 * THE FLUSH POINT. A batch is flushed at the END OF THE TICK THAT FILLED IT,
 * always. Holding events for a later tick would trade smoothness for bandwidth,
 * and owner asked for the opposite (「不要跨 tick 合批 —— owner 要的是順暢不是省
 * 頻寬」). Same-tick batching costs exactly zero latency because those events
 * were going out in the same 33.3 ms slice anyway. This is the one hard-coded
 * decision in this file and this paragraph is its stated reason (CLAUDE.md:
 * 寫死才需要理由).
 *
 * ─────────────────────────────────────────────────────────── ORDER IS THE API ──
 * Sim events are causally linked — `castBegin` then `castRejected`, `damage`
 * then `death`, `attackWindup` then `basicAttackHit`. The client drain applies
 * them in arrival order, so a batch that reorders is a behaviour change even
 * though every event still arrives. Two rules keep the order exact:
 *   1. events go into `evs` in push order and are never sorted or grouped;
 *   2. a SINGLE-RECIPIENT event (`privateEventAddress` names a seat) forces a
 *      flush of the pending batch FIRST, so that recipient sees the same
 *      relative order it would have seen on the unbatched wire. Private events
 *      are 0.6–1.1% of the stream, so the frame saving barely moves.
 * `eventBatch.test.ts` mutates both of those.
 */
import { MSG, type EventMessage, type EventBatchMessage } from "@ggd/shared/protocol/messages";

/** Resolved, validated batching settings. */
export interface EventBatchSettings {
  /** master switch — false reproduces the pre-batching wire exactly */
  enabled: boolean;
  /**
   * Fewer than this many pending events in a tick are sent as individual
   * `MSG.EVENT` messages instead. 1 = always wrap. The default 2 exists because
   * wrapping a LONE event costs ~10 bytes of array envelope and saves nothing.
   */
  minBatchSize: number;
  /**
   * Hard ceiling on events per batch. A tick above it emits several batches,
   * IN ORDER. This is what stops one pathological tick from producing a single
   * multi-hundred-KB frame that stalls the socket and blows the transport's
   * maxPayload. Measured worst tick so far is 67 events (600 zombies/zone).
   */
  maxBatchSize: number;
  /**
   * Batch single-recipient events too (per recipient). Default FALSE: the
   * private-delivery rules exist so 「冷卻中」 reaches one player and nobody
   * else, and the safe reading of a new knob is the one that changes nothing.
   */
  batchPrivate: boolean;
}

/**
 * SHIPPED DEFAULTS. `enabled` is on because the measurement above is decisive at
 * BOTH populations and same-tick batching has no latency cost; `GGD_EVENT_BATCH=0`
 * reverts it without a rebuild.
 */
export const DEFAULT_EVENT_BATCH: EventBatchSettings = {
  enabled: true,
  minBatchSize: 2,
  maxBatchSize: 256,
  batchPrivate: false,
};

/**
 * Bounds. Every field has an UPPER bound, not only a lower one — a field with
 * only a `min` is half a validator, which is how 50-typed-as-500 reaches
 * production looking accepted (#277/#279).
 */
export const EVENT_BATCH_BOUNDS = {
  /** 1 = wrap even a lone event; above `maxBatchSize` would disable batching */
  minBatchSize: { min: 1, max: 4096 },
  /** 1 = one event per batch (pointless but legal); 4096 is well past any tick */
  maxBatchSize: { min: 1, max: 4096 },
} as const;

/** Env var names — one per decision point. */
export const EVENT_BATCH_ENV = {
  enabled: "GGD_EVENT_BATCH",
  minBatchSize: "GGD_EVENT_BATCH_MIN",
  maxBatchSize: "GGD_EVENT_BATCH_MAX",
  batchPrivate: "GGD_EVENT_BATCH_PRIVATE",
} as const;

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

function int(raw: string | undefined, fallback: number, b: { min: number; max: number }): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  // Out of range falls back rather than clamping: a silent clamp is how a typo
  // ships looking accepted (#277/#279).
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (n < b.min || n > b.max) return fallback;
  return n;
}

/** Resolve from an env bag. Pure — the env is a parameter, so this is testable. */
export function resolveEventBatch(
  env: NodeJS.ProcessEnv = process.env,
  defaults: EventBatchSettings = DEFAULT_EVENT_BATCH,
): EventBatchSettings {
  const E = EVENT_BATCH_ENV;
  const B = EVENT_BATCH_BOUNDS;
  const minBatchSize = int(env[E.minBatchSize], defaults.minBatchSize, B.minBatchSize);
  const maxBatchSize = int(env[E.maxBatchSize], defaults.maxBatchSize, B.maxBatchSize);
  return {
    enabled: bool(env[E.enabled], defaults.enabled),
    minBatchSize,
    // A min above the max would mean "batch nothing, ever" while still reading
    // as enabled — a config that lies. Cross-field, so it cannot live in bounds.
    maxBatchSize: Math.max(minBatchSize, maxBatchSize),
    batchPrivate: bool(env[E.batchPrivate], defaults.batchPrivate),
  };
}

/** Where a batcher puts finished messages. One implementation lives in MatchRoom. */
export interface EventBatchSink {
  /** send ONE event on the legacy `MSG.EVENT` channel (room-wide) */
  one(payload: EventMessage): void;
  /** send a batch on `MSG.EVENT_BATCH` (room-wide) */
  batch(payload: EventBatchMessage): void;
}

/** Message the sink was asked to send — the shape `MatchRoom.broadcast` takes. */
export type OutboundEvent =
  | { channel: typeof MSG.EVENT; payload: EventMessage }
  | { channel: typeof MSG.EVENT_BATCH; payload: EventBatchMessage };

/**
 * Accumulates one tick's room-wide events and emits them as few messages as the
 * settings allow. NOT reusable across ticks: `flush()` must run before the tick
 * ends — `MatchRoom` calls it right after the fanout loop, and again before any
 * single-recipient send (see the header).
 */
export class EventBatcher {
  private pending: EventMessage[] = [];

  constructor(
    private readonly settings: EventBatchSettings,
    private readonly sink: EventBatchSink,
  ) {}

  /** How many events are waiting. Diagnostics + guards; never a control input. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Queue a room-wide event. With batching off this sends immediately, so the
   * wire is byte-for-byte what it was before this file existed.
   */
  push(payload: EventMessage): void {
    if (!this.settings.enabled) {
      this.sink.one(payload);
      return;
    }
    // A batch carries ONE `tick` for all of its events, so a payload stamped
    // with a different tick must start a new batch or the client would read the
    // wrong timestamp off it. `SimWorld.step` clears `events` at the top and
    // increments `tick` at the bottom, so today every drain is single-tick —
    // this keeps that an ENFORCED invariant rather than an assumed one, because
    // `castAbilityNow` is explicitly documented as callable outside the tick.
    const head = this.pending[0];
    if (head !== undefined && head.tick !== payload.tick) this.flush();
    this.pending.push(payload);
    // Cap reached → emit now. Everything queued so far is from THIS tick, so
    // this is a split, not a cross-tick hold.
    if (this.pending.length >= this.settings.maxBatchSize) this.flush();
  }

  /**
   * Emit whatever is pending. Idempotent, and safe to call on a tick that
   * produced nothing.
   */
  flush(): void {
    const n = this.pending.length;
    if (n === 0) return;
    if (n < this.settings.minBatchSize) {
      // Below the wrap threshold: the plain channel is smaller AND is the path
      // every existing client already understands.
      for (const p of this.pending) this.sink.one(p);
      this.pending = [];
      return;
    }
    // ORDER: `pending` is in push order and is copied, not sorted.
    const tick = this.pending[0]!.tick;
    const evs: [string, Record<string, unknown>][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = this.pending[i]!;
      evs[i] = [p.type, p.data];
    }
    this.pending = [];
    this.sink.batch({ tick, evs });
  }
}
