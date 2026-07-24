/**
 * A tiny, dependency-free, SUBSCRIBE-ONLY Redis client.
 *
 * WHY NOT `redis` / `ioredis`. This process needs exactly one Redis capability:
 * hold a connection open and hand me the payloads published on one channel. A
 * full client would add a dependency (and a lockfile edit) to a game-server
 * whose entire Redis surface is 30 lines of the RESP wire format — and it would
 * bring a connection pool, a command queue and a cluster layer that nothing
 * here uses. The protocol below is the complete subset needed: AUTH,
 * SUBSCRIBE, and the push frames Redis sends afterwards.
 *
 * WHAT THIS IS ALLOWED TO DO, AND WHAT IT IS NOT. It may never be load-bearing.
 * The subscriber carries INVALIDATIONS — "the whitelist changed" — and the
 * shard answers by re-fetching the authoritative document over HTTP. So every
 * failure mode of this class (Redis absent, Redis unreachable, connection
 * dropped, garbage on the wire) degrades to exactly the behaviour the shard had
 * before the bus existed: values refresh on their cache TTL. That is why
 * `start()` never throws and never rejects, and why a connection error is a
 * logged state change rather than an exception anybody has to catch.
 *
 * THE OWNER RUNS THIS ON A LAPTOP. `GGD_CONTENT_BUS=0`, or simply not having
 * Redis, must leave the game fully playable. Nothing in the game loop, the
 * match-creation path or the boot sequence awaits this class.
 */
import { createConnection, type Socket } from "node:net";

/** Observable connection state (surfaced on /healthz). */
export type SubscriberState = "idle" | "connecting" | "subscribed" | "retrying" | "stopped";

export interface RedisSubscriberOptions {
  host: string;
  port: number;
  /** REDIS_PASSWORD, when the deploy sets one (AUTH is sent before SUBSCRIBE). */
  password?: string;
  /** Channels to subscribe to on every (re)connect. */
  channels: readonly string[];
  /** Called for each delivered message. Must never throw (we guard anyway). */
  onMessage: (channel: string, payload: string) => void;
  /** Called on every state transition — used for logging + /healthz. */
  onState?: (state: SubscriberState, detail?: string) => void;
  /** First retry delay; doubles up to reconnectMaxMs with jitter. */
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  /** How long a TCP connect may take before we call it a failure. */
  connectTimeoutMs?: number;
  /** Injectable connector (tests). */
  connectImpl?: typeof createConnection;
}

/** Encode a Redis command as a RESP array of bulk strings. */
export function encodeCommand(...args: string[]): string {
  let out = `*${args.length}\r\n`;
  for (const a of args) out += `$${Buffer.byteLength(a)}\r\n${a}\r\n`;
  return out;
}

/** One decoded RESP value. Nulls decode to `null`. */
export type RespValue = string | number | null | RespValue[];

interface Decoded {
  value: RespValue;
  /** index just past the consumed bytes */
  next: number;
}

/**
 * Decode ONE RESP value starting at `from`. Returns null when the buffer holds
 * only a partial value — the caller keeps the bytes and retries after the next
 * chunk. TCP splits frames wherever it likes, so "incomplete" is the normal
 * case, not an error case.
 */
export function decodeResp(buf: Buffer, from = 0): Decoded | null {
  if (from >= buf.length) return null;
  const type = buf[from];
  const lineEnd = buf.indexOf("\r\n", from + 1, "utf8");
  if (lineEnd === -1) return null;
  const head = buf.toString("utf8", from + 1, lineEnd);
  const afterHead = lineEnd + 2;

  switch (type) {
    // +simple  -error  :integer
    case 0x2b:
      return { value: head, next: afterHead };
    case 0x2d:
      return { value: head, next: afterHead };
    case 0x3a:
      return { value: Number(head), next: afterHead };
    // $bulk
    case 0x24: {
      const len = Number(head);
      if (Number.isNaN(len)) return { value: null, next: afterHead };
      if (len < 0) return { value: null, next: afterHead };
      const end = afterHead + len;
      if (buf.length < end + 2) return null; // body (or its CRLF) not here yet
      return { value: buf.toString("utf8", afterHead, end), next: end + 2 };
    }
    // *array
    case 0x2a: {
      const count = Number(head);
      if (Number.isNaN(count) || count < 0) return { value: null, next: afterHead };
      const items: RespValue[] = [];
      let cursor = afterHead;
      for (let i = 0; i < count; i++) {
        const item = decodeResp(buf, cursor);
        if (!item) return null; // the array is not fully buffered yet
        items.push(item.value);
        cursor = item.next;
      }
      return { value: items, next: cursor };
    }
    default:
      // Not RESP. Treat the byte as consumed so a desynced stream cannot spin
      // forever; the connection is torn down by the caller on the next error.
      return { value: null, next: from + 1 };
  }
}

/**
 * A resilient subscribe-only connection. `start()` connects, AUTHs if needed,
 * SUBSCRIBEs, and reconnects forever with capped exponential backoff. Every
 * transition is reported through `onState` so the shard can SAY it is not
 * receiving invalidations instead of silently not receiving them — the exact
 * failure shape #48 existed to eliminate.
 */
export class RedisSubscriber {
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private retryTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private stopped = false;
  private _state: SubscriberState = "idle";
  private _lastError: string | null = null;
  /** ISO time we last entered "subscribed". */
  private _connectedAt: string | null = null;

  constructor(private readonly opts: RedisSubscriberOptions) {}

  get state(): SubscriberState {
    return this._state;
  }
  get lastError(): string | null {
    return this._lastError;
  }
  get connectedAt(): string | null {
    return this._connectedAt;
  }

  private setState(state: SubscriberState, detail?: string): void {
    this._state = state;
    if (state === "subscribed") {
      this._connectedAt = new Date().toISOString();
      this._lastError = null;
    }
    if (detail && (state === "retrying" || state === "idle")) this._lastError = detail;
    this.opts.onState?.(state, detail);
  }

  /** Connect (and keep reconnecting). Safe to call once; never throws. */
  start(): void {
    if (this.stopped) return;
    this.connect();
  }

  /** Close the connection and stop reconnecting. Idempotent. */
  stop(): void {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const sock = this.socket;
    this.socket = null;
    if (sock) {
      sock.removeAllListeners();
      sock.destroy();
    }
    this.setState("stopped");
  }

  private connect(): void {
    if (this.stopped) return;
    this.setState("connecting");
    this.buffer = Buffer.alloc(0);

    const connectImpl = this.opts.connectImpl ?? createConnection;
    let sock: Socket;
    try {
      sock = connectImpl({ host: this.opts.host, port: this.opts.port });
    } catch (err) {
      // A synchronous throw (bad host shape) must not escape into the caller.
      this.scheduleRetry(err instanceof Error ? err.message : String(err));
      return;
    }
    this.socket = sock;
    // Never let the bus hold the process open: this is an accessory, and a
    // shard that has finished its work should exit even with the socket idle.
    sock.unref?.();
    sock.setNoDelay?.(true);

    const timeout = setTimeout(() => {
      sock.destroy();
      this.scheduleRetry(`connect timed out after ${this.opts.connectTimeoutMs ?? 5_000}ms`);
    }, this.opts.connectTimeoutMs ?? 5_000);
    timeout.unref?.();

    sock.once("connect", () => {
      clearTimeout(timeout);
      if (this.opts.password) sock.write(encodeCommand("AUTH", this.opts.password));
      if (this.opts.channels.length > 0) {
        sock.write(encodeCommand("SUBSCRIBE", ...this.opts.channels));
      }
      // Optimistic: Redis has accepted the SUBSCRIBE by the time it answers.
      // The confirmation frame flips us to "subscribed" in onData.
    });

    sock.on("data", (chunk: Buffer) => this.onData(chunk));

    const fail = (why: string) => {
      clearTimeout(timeout);
      if (this.socket !== sock) return; // already replaced
      sock.removeAllListeners();
      sock.destroy();
      this.socket = null;
      this.scheduleRetry(why);
    };
    sock.on("error", (err) => fail(err.message));
    sock.on("close", () => fail("connection closed by peer"));
  }

  private onData(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const decoded = decodeResp(this.buffer, 0);
      if (!decoded) return; // wait for more bytes
      this.buffer = this.buffer.subarray(decoded.next);
      this.handleValue(decoded.value);
      if (this.buffer.length === 0) return;
    }
  }

  private handleValue(value: RespValue): void {
    if (!Array.isArray(value) || value.length < 3) return;
    const kind = typeof value[0] === "string" ? value[0].toLowerCase() : "";
    if (kind === "subscribe") {
      this.attempt = 0; // a successful subscribe resets the backoff
      this.setState("subscribed");
      return;
    }
    if (kind !== "message") return;
    const channel = typeof value[1] === "string" ? value[1] : "";
    const payload = typeof value[2] === "string" ? value[2] : "";
    try {
      this.opts.onMessage(channel, payload);
    } catch (err) {
      // A throwing handler must never kill the subscription: the next
      // invalidation still has to be delivered.
      console.error("[content-bus] message handler threw", err);
    }
  }

  private scheduleRetry(why: string): void {
    if (this.stopped) return;
    const base = this.opts.reconnectBaseMs ?? 1_000;
    const max = this.opts.reconnectMaxMs ?? 30_000;
    const backoff = Math.min(max, base * 2 ** Math.min(this.attempt, 10));
    // Jitter so a Redis restart does not get a synchronised stampede from
    // every shard at once.
    const delay = Math.round(backoff * (0.5 + Math.random() * 0.5));
    this.attempt += 1;
    this.setState("retrying", why);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
    this.retryTimer.unref?.();
  }
}
