/**
 * A tiny, dependency-free REQUEST/RESPONSE Redis client — the write-side
 * sibling of config/redisSubscriber.ts (which is deliberately SUBSCRIBE-only).
 *
 * WHY NOT `redis` / `ioredis`: same answer as the subscriber's header. The
 * damage board needs exactly four commands (AUTH, ZADD, ZREMRANGEBYRANK,
 * ZREVRANGE + ZCARD for reads); pulling a full client into the game-server for
 * that would add a lockfile edit and a connection pool nothing uses. The RESP
 * codec is IMPORTED from redisSubscriber — one encoder, one decoder, no fork.
 *
 * WHAT THIS MAY NEVER BE: load-bearing. Every consumer wraps it fail-open
 * (see stats/damageBoard.ts) — Redis absent/unreachable/mid-restart means the
 * board misses one match's rows, never that a match is affected. `send()`
 * rejects instead of hanging forever (socket error/close rejects everything
 * in flight), and the caller adds its own deadline on top.
 */
import { createConnection, type Socket } from "node:net";
import { decodeResp, encodeCommand, type RespValue } from "../config/redisSubscriber";

/** The injectable surface — tests hand in a fake, production uses {@link RedisCommands}. */
export interface RedisCommandClient {
  send(...args: string[]): Promise<RespValue>;
  close(): void;
}

export interface RedisCommandsOptions {
  host: string;
  port: number;
  /** REDIS_PASSWORD, when the deploy sets one (AUTH is sent before anything else). */
  password?: string;
  /** How long a TCP connect may take before we call it a failure. */
  connectTimeoutMs?: number;
  /** Injectable connector (tests). */
  connectImpl?: typeof createConnection;
}

interface Pending {
  resolve: (v: RespValue) => void;
  reject: (e: Error) => void;
}

export class RedisCommands implements RedisCommandClient {
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pending: Pending[] = [];
  private connecting: Promise<void> | null = null;
  private dead: Error | null = null;

  constructor(private readonly opts: RedisCommandsOptions) {}

  private connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const connectImpl = this.opts.connectImpl ?? createConnection;
      const sock = connectImpl({ host: this.opts.host, port: this.opts.port });
      const timeoutMs = this.opts.connectTimeoutMs ?? 3_000;
      const timer = setTimeout(() => {
        sock.destroy(new Error(`redis: connect timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      sock.once("connect", () => {
        clearTimeout(timer);
        this.socket = sock;
        // AUTH rides the same pipeline as everything else; its reply is consumed
        // by the pending queue like any other.
        if (this.opts.password) {
          this.pending.push({
            resolve: () => {},
            reject: (e) => this.fail(e),
          });
          sock.write(encodeCommand("AUTH", this.opts.password));
        }
        resolve();
      });
      sock.on("data", (chunk: Buffer) => this.onData(chunk));
      // `.on`, not `.once` — a second error event with no listener would crash
      // the process, and a socket that already failed once can absolutely emit
      // again while being torn down. reject() after settle is a harmless no-op.
      sock.on("error", (err: Error) => {
        clearTimeout(timer);
        this.fail(err);
        reject(err);
      });
      sock.once("close", () => {
        this.fail(new Error("redis: connection closed"));
      });
    });
    // A failed connect must not leave a rejected promise cached forever as the
    // "current" connect — but this client is single-shot per match write, so a
    // dead client simply stays dead (`this.dead` short-circuits every send).
    this.connecting.catch(() => {});
    return this.connecting;
  }

  private onData(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    let cursor = 0;
    for (;;) {
      // decodeResp flattens `-ERR …` into a plain string — peek the type byte
      // so a Redis error rejects its command instead of masquerading as data.
      const isErr = this.buffer[cursor] === 0x2d;
      const decoded = decodeResp(this.buffer, cursor);
      if (!decoded) break;
      cursor = decoded.next;
      const p = this.pending.shift();
      if (p) {
        if (isErr) p.reject(new Error(`redis: ${String(decoded.value)}`));
        else p.resolve(decoded.value);
      }
    }
    this.buffer = cursor === 0 ? this.buffer : this.buffer.subarray(cursor);
  }

  private fail(err: Error): void {
    if (this.dead) return;
    this.dead = err;
    while (this.pending.length > 0) this.pending.shift()?.reject(err);
    this.socket?.destroy();
    this.socket = null;
  }

  async send(...args: string[]): Promise<RespValue> {
    if (this.dead) throw this.dead;
    await this.connect();
    const sock = this.socket;
    if (!sock || this.dead) throw this.dead ?? new Error("redis: not connected");
    return new Promise<RespValue>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      sock.write(encodeCommand(...args));
    });
  }

  close(): void {
    this.fail(new Error("redis: closed by caller"));
  }
}
