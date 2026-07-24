/**
 * The dependency-free RESP subscriber (config/redisSubscriber.ts).
 *
 * These tests run against a REAL TCP server speaking the real subset of the
 * Redis wire protocol — not a mocked client object. That matters: the whole
 * reason this class exists instead of a dependency is that it owns its own
 * framing, and framing bugs (a bulk string split across two TCP segments, two
 * frames arriving in one segment) only show up on a socket.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { RedisSubscriber, decodeResp, encodeCommand } from "./redisSubscriber";

/** A fake Redis that accepts SUBSCRIBE and lets the test push messages. */
interface FakeRedis {
  port: number;
  /** push a `message` frame to every subscribed client */
  publish(channel: string, payload: string): void;
  /** push arbitrary raw bytes (framing tests) */
  raw(chunk: string): void;
  /** drop every live connection without closing the listener */
  dropConnections(): void;
  connections: number;
  close(): Promise<void>;
}

async function startFakeRedis(opts: { requireAuth?: boolean } = {}): Promise<FakeRedis> {
  const sockets = new Set<Socket>();
  let connections = 0;
  const server: Server = createServer((sock) => {
    connections += 1;
    sockets.add(sock);
    sock.on("error", () => {});
    sock.on("close", () => sockets.delete(sock));
    sock.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (text.includes("AUTH")) sock.write("+OK\r\n");
      // Answer a SUBSCRIBE with the confirmation frame Redis sends.
      const m = /\$9\r\nSUBSCRIBE\r\n\$\d+\r\n([^\r]+)\r\n/i.exec(text);
      if (m?.[1]) {
        const ch = m[1];
        sock.write(`*3\r\n$9\r\nsubscribe\r\n$${Buffer.byteLength(ch)}\r\n${ch}\r\n:1\r\n`);
      }
    });
    if (opts.requireAuth) {
      /* nothing extra: the AUTH reply above is enough for this client */
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    publish(channel, payload) {
      const frame =
        `*3\r\n$7\r\nmessage\r\n` +
        `$${Buffer.byteLength(channel)}\r\n${channel}\r\n` +
        `$${Buffer.byteLength(payload)}\r\n${payload}\r\n`;
      for (const s of sockets) s.write(frame);
    },
    raw(chunk) {
      for (const s of sockets) s.write(chunk);
    },
    dropConnections() {
      for (const s of sockets) s.destroy();
      sockets.clear();
    },
    get connections() {
      return connections;
    },
    close() {
      for (const s of sockets) s.destroy();
      sockets.clear();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const waitFor = async (pred: () => boolean, ms = 4_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
};

const openSubs: RedisSubscriber[] = [];
const openServers: FakeRedis[] = [];
afterEach(async () => {
  for (const s of openSubs.splice(0)) s.stop();
  for (const srv of openServers.splice(0)) await srv.close();
});

describe("RESP decoding", () => {
  it("decodes the frame shapes SUBSCRIBE traffic actually uses", () => {
    expect(decodeResp(Buffer.from("+OK\r\n"))?.value).toBe("OK");
    expect(decodeResp(Buffer.from(":1\r\n"))?.value).toBe(1);
    expect(decodeResp(Buffer.from("$5\r\nhello\r\n"))?.value).toBe("hello");
    expect(decodeResp(Buffer.from("$-1\r\n"))?.value).toBeNull();
    expect(decodeResp(Buffer.from("*2\r\n$3\r\nfoo\r\n:7\r\n"))?.value).toEqual(["foo", 7]);
  });

  it("returns null for a PARTIAL value instead of inventing one", () => {
    // TCP splits wherever it likes; "incomplete" is the normal case.
    expect(decodeResp(Buffer.from("$5\r\nhel"))).toBeNull();
    expect(decodeResp(Buffer.from("*3\r\n$7\r\nmessage\r\n"))).toBeNull();
    expect(decodeResp(Buffer.from("+OK"))).toBeNull();
  });

  it("reports where the value ended so the next one can be decoded", () => {
    const buf = Buffer.from("+OK\r\n:42\r\n");
    const first = decodeResp(buf, 0)!;
    expect(first.value).toBe("OK");
    expect(decodeResp(buf, first.next)?.value).toBe(42);
  });

  it("counts BYTES, not characters, for multi-byte payloads", () => {
    // The payload is JSON that can carry 戰鬥系統 in an error string; a
    // length-in-characters bug would truncate every such frame.
    const body = '{"kind":"combat-env","note":"戰鬥系統"}';
    const encoded = encodeCommand("PUBLISH", "chan:content", body);
    expect(encoded).toContain(`$${Buffer.byteLength(body)}\r\n`);
    const framed = Buffer.from(`$${Buffer.byteLength(body)}\r\n${body}\r\n`);
    expect(decodeResp(framed)?.value).toBe(body);
  });
});

describe("RedisSubscriber over a real socket", () => {
  it("subscribes and delivers published payloads", async () => {
    const fake = await startFakeRedis();
    openServers.push(fake);
    const got: string[] = [];
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: fake.port,
      channels: ["chan:content"],
      onMessage: (_c, p) => got.push(p),
    });
    openSubs.push(sub);
    sub.start();

    await waitFor(() => sub.state === "subscribed");
    fake.publish("chan:content", '{"kind":"curation","version":"abc123abc123"}');
    await waitFor(() => got.length === 1);
    expect(JSON.parse(got[0] ?? "{}").kind).toBe("curation");
  });

  it("reassembles a frame split across TCP segments", async () => {
    const fake = await startFakeRedis();
    openServers.push(fake);
    const got: string[] = [];
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: fake.port,
      channels: ["chan:content"],
      onMessage: (_c, p) => got.push(p),
    });
    openSubs.push(sub);
    sub.start();
    await waitFor(() => sub.state === "subscribed");

    const payload = '{"kind":"combat-env","version":"0123456789ab"}';
    const frame =
      `*3\r\n$7\r\nmessage\r\n$12\r\nchan:content\r\n` +
      `$${Buffer.byteLength(payload)}\r\n${payload}\r\n`;
    // Hand-deliver it in three pieces, one of them mid-payload.
    fake.raw(frame.slice(0, 10));
    await new Promise((r) => setTimeout(r, 20));
    fake.raw(frame.slice(10, 50));
    await new Promise((r) => setTimeout(r, 20));
    fake.raw(frame.slice(50));

    await waitFor(() => got.length === 1);
    expect(JSON.parse(got[0] ?? "{}").version).toBe("0123456789ab");
  });

  it("delivers two frames that arrive in ONE segment", async () => {
    const fake = await startFakeRedis();
    openServers.push(fake);
    const got: string[] = [];
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: fake.port,
      channels: ["chan:content"],
      onMessage: (_c, p) => got.push(p),
    });
    openSubs.push(sub);
    sub.start();
    await waitFor(() => sub.state === "subscribed");

    const one = (v: string) =>
      `*3\r\n$7\r\nmessage\r\n$12\r\nchan:content\r\n$${Buffer.byteLength(v)}\r\n${v}\r\n`;
    fake.raw(one("first") + one("second"));
    await waitFor(() => got.length === 2);
    expect(got).toEqual(["first", "second"]);
  });

  it("RECONNECTS after the server drops the connection", async () => {
    const fake = await startFakeRedis();
    openServers.push(fake);
    const states: string[] = [];
    const got: string[] = [];
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: fake.port,
      channels: ["chan:content"],
      onMessage: (_c, p) => got.push(p),
      onState: (s) => states.push(s),
      reconnectBaseMs: 20,
      reconnectMaxMs: 50,
    });
    openSubs.push(sub);
    sub.start();
    await waitFor(() => sub.state === "subscribed");
    expect(fake.connections).toBe(1);

    fake.dropConnections();
    await waitFor(() => states.includes("retrying"));
    // ...and it comes BACK, re-subscribes, and keeps delivering.
    await waitFor(() => sub.state === "subscribed" && fake.connections >= 2);
    fake.publish("chan:content", "after-reconnect");
    await waitFor(() => got.includes("after-reconnect"));
  });

  it("REDIS ABSENT: retries forever without throwing, and says why", async () => {
    // Port 1 is reserved and will refuse instantly — this is the laptop case.
    const states: string[] = [];
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: 1,
      channels: ["chan:content"],
      onMessage: () => {},
      onState: (s) => states.push(s),
      reconnectBaseMs: 10,
      reconnectMaxMs: 20,
    });
    openSubs.push(sub);
    expect(() => sub.start()).not.toThrow();

    await waitFor(() => sub.state === "retrying");
    expect(sub.lastError).toBeTruthy();
    // And it keeps trying rather than giving up silently.
    await waitFor(() => states.filter((s) => s === "retrying").length >= 2);
  });

  it("a THROWING message handler does not kill the subscription", async () => {
    const fake = await startFakeRedis();
    openServers.push(fake);
    const got: string[] = [];
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: fake.port,
      channels: ["chan:content"],
      onMessage: (_c, p) => {
        if (p === "boom") throw new Error("handler blew up");
        got.push(p);
      },
    });
    openSubs.push(sub);
    sub.start();
    await waitFor(() => sub.state === "subscribed");

    fake.publish("chan:content", "boom");
    fake.publish("chan:content", "still-here");
    await waitFor(() => got.includes("still-here"));
    expect(sub.state).toBe("subscribed");
  });

  it("stop() closes the socket and halts reconnection", async () => {
    const fake = await startFakeRedis();
    openServers.push(fake);
    const sub = new RedisSubscriber({
      host: "127.0.0.1",
      port: fake.port,
      channels: ["chan:content"],
      onMessage: () => {},
      reconnectBaseMs: 10,
    });
    openSubs.push(sub);
    sub.start();
    await waitFor(() => sub.state === "subscribed");

    sub.stop();
    expect(sub.state).toBe("stopped");
    const seen = fake.connections;
    await new Promise((r) => setTimeout(r, 120));
    expect(fake.connections).toBe(seen); // no reconnect attempts after stop()
  });
});
