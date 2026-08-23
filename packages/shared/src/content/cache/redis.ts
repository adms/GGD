/**
 * 一支**零相依**、只會 GET/SET/PING 的 Redis 客戶端。
 *
 * ⭐ 為什麼不用 `ioredis`：同一個 repo 已經有先例
 * （`apps/game-server/src/config/redisSubscriber.ts` 的檔頭把理由寫完了）——
 * 這裡需要的 Redis 能力剛好三個指令，而把 `ioredis` 加進 `packages/shared`
 * 等於一次 lockfile 編輯（併行 lane 的撞車熱點）＋ 讓一個**瀏覽器也會 import 的
 * 套件**多一個 node-only 相依。
 *
 * ⚠️ 這一層**永遠不可以是承重的**：連不上 / 逾時 / 線上有垃圾，一律退回檔案層，
 * 而檔案層 miss 就退回真的讀內容樹 —— 也就是**沒有快取之前的行為**。
 * ⇒ 所以每一個公開方法都 `Promise<T | null>`，⛔ 不 throw。
 * ⭐ 但退回**必須出聲**（CLAUDE.md：fail-open 沒錯，靜默才是缺陷）——
 *   `note` 回呼會被呼叫一次，呼叫端負責印那一行。
 */
import { createConnection, type Socket } from "node:net";

export interface RedisCacheOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
}

/** `redis://[user:pass@]host:port[/db]` → options。⛔ 解析不了回 null。 */
export function parseRedisUrl(url: string): RedisCacheOptions | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") return null;
    if (u.protocol === "rediss:") return null; // ⛔ TLS 不在這 30 行的範圍內
    const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined;
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? Number(u.port) : 6379,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: Number.isFinite(db) ? db : undefined,
    };
  } catch {
    return null;
  }
}

function encode(...args: (string | Buffer)[]): Buffer {
  const head = Buffer.from(`*${args.length}\r\n`);
  const parts: Buffer[] = [head];
  for (const a of args) {
    const b = Buffer.isBuffer(a) ? a : Buffer.from(a);
    parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

/** 一個完整的 RESP 回覆，或 `null`（位元組還沒到齊）。 */
type Reply = { value: Buffer | string | number | null; next: number };

function decode(buf: Buffer, from: number): Reply | null {
  if (from >= buf.length) return null;
  const eol = buf.indexOf("\r\n", from + 1, "utf8");
  if (eol === -1) return null;
  const head = buf.toString("utf8", from + 1, eol);
  const after = eol + 2;
  switch (buf[from]) {
    case 0x2b: // +simple
      return { value: head, next: after };
    case 0x2d: // -error
      return { value: new Error(head) as never, next: after };
    case 0x3a: // :integer
      return { value: Number(head), next: after };
    case 0x24: {
      // $bulk
      const len = Number(head);
      if (len === -1) return { value: null, next: after };
      if (buf.length < after + len + 2) return null;
      return { value: buf.subarray(after, after + len), next: after + len + 2 };
    }
    default:
      return { value: null, next: after }; // ⛔ 陣列等等這裡用不到
  }
}

export class TinyRedis {
  private sock: Socket | null = null;
  private buf = Buffer.alloc(0);
  private readonly waiting: Array<(r: Reply["value"] | Error) => void> = [];

  constructor(private readonly opts: RedisCacheOptions) {}

  private get commandTimeoutMs(): number {
    return this.opts.commandTimeoutMs ?? 3000;
  }

  /** 連線 + AUTH + SELECT。失敗回 false（⛔ 不 throw）。 */
  async connect(): Promise<boolean> {
    if (this.sock) return true;
    const ok = await new Promise<boolean>((res) => {
      let settled = false;
      const done = (v: boolean): void => {
        if (settled) return;
        settled = true;
        res(v);
      };
      const s = createConnection({ host: this.opts.host, port: this.opts.port });
      s.setNoDelay(true);
      const timer = setTimeout(() => {
        s.destroy();
        done(false);
      }, this.opts.connectTimeoutMs ?? 1500);
      s.once("connect", () => {
        clearTimeout(timer);
        this.sock = s;
        done(true);
      });
      s.once("error", () => {
        clearTimeout(timer);
        this.sock = null;
        done(false);
      });
      s.on("data", (chunk) => {
        this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
        for (;;) {
          const r = decode(this.buf, 0);
          if (r === null) break;
          this.buf = this.buf.subarray(r.next);
          this.waiting.shift()?.(r.value);
        }
      });
      s.on("close", () => {
        this.sock = null;
        while (this.waiting.length) this.waiting.shift()?.(new Error("closed"));
      });
    });
    if (!ok) return false;
    if (this.opts.password !== undefined) {
      const r =
        this.opts.username !== undefined
          ? await this.send("AUTH", this.opts.username, this.opts.password)
          : await this.send("AUTH", this.opts.password);
      if (r instanceof Error || r === null) return this.fail();
    }
    if (this.opts.db !== undefined && this.opts.db !== 0) {
      const r = await this.send("SELECT", String(this.opts.db));
      if (r instanceof Error || r === null) return this.fail();
    }
    return true;
  }

  private fail(): boolean {
    this.close();
    return false;
  }

  private send(...args: (string | Buffer)[]): Promise<Reply["value"] | Error> {
    const s = this.sock;
    if (!s) return Promise.resolve(new Error("not connected"));
    return new Promise((res) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        res(new Error("command timeout"));
      }, this.commandTimeoutMs);
      this.waiting.push((v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res(v);
      });
      s.write(encode(...args));
    });
  }

  async ping(): Promise<boolean> {
    const r = await this.send("PING");
    return r === "PONG";
  }

  async get(key: string): Promise<Buffer | null> {
    const r = await this.send("GET", key);
    return Buffer.isBuffer(r) ? r : null;
  }

  /** `SET key value EX <ttl>`。回傳有沒有真的寫進去。 */
  async setEx(key: string, value: Buffer, ttlSeconds: number): Promise<boolean> {
    const r = await this.send("SET", key, value, "EX", String(Math.max(1, Math.floor(ttlSeconds))));
    return r === "OK";
  }

  close(): void {
    this.sock?.destroy();
    this.sock = null;
  }
}
