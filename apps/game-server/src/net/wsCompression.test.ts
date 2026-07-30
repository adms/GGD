/**
 * BEHAVIOUR GUARD for WebSocket payload compression (B2).
 *
 * This test does not check that an option object has a field. It opens a REAL
 * `WebSocketTransport` (the one apps/game-server/src/index.ts constructs),
 * connects a REAL `ws` client to it, sends REAL captured Colyseus frames, and
 * counts the bytes that actually cross the TCP socket
 * (`socket.bytesWritten`). Everything asserted below is a wire measurement.
 *
 * WHY THAT MATTERS HERE. Three different ways to "ship compression" produce a
 * perfectly healthy-looking config object and different wire behaviour:
 *   1. threshold set but `server_no_context_takeover` NOT negotiated
 *      -> ws ignores the threshold and compresses everything (see the file head
 *         of wsCompression.ts for the exact ws source line)
 *   2. threshold larger than every real message -> nothing is ever compressed,
 *      and the only evidence is bytes on the wire
 *   3. extension not negotiated at all (proxy stripped it, option mis-shaped)
 * A test that inspected settings would pass in all three.
 *
 * The frames are real: captured off a real MatchRoom's first client during a
 * 115-entity combat peak. `PATCH_FRAME` is a @colyseus/schema state patch,
 * `DAMAGE_EVENT` and `DEATH_EVENT` are msgpack broadcast events.
 *
 * MUTATIONS THIS TEST CATCHES (verified by running them):
 *   · thresholdBytes -> 65536 (nothing reaches the floor): red
 *   · serverNoContextTakeover -> false (threshold silently inert): red
 *   · enabled -> false: red
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import { AddressInfo } from "node:net";
import { WebSocketTransport, WebSocketClient } from "@colyseus/ws-transport";
import {
  DEFAULT_WS_COMPRESSION,
  installOutboundCopyGuard,
  perMessageDeflateOption,
  resolveWsCompression,
  wsCompressionBootLine,
  WS_COMPRESSION_BOUNDS,
  WS_COMPRESSION_ENV,
  type WsCompressionSettings,
} from "./wsCompression";

// `ws` is a transitive dependency of @colyseus/ws-transport, so resolve it
// THROUGH that package: the client here is byte-for-byte the same
// implementation the shipped server transport negotiates against, and it offers
// permessage-deflate by default exactly like a browser does.
const req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WS: any = createRequire(req.resolve("@colyseus/ws-transport"))("ws");

/** Real 2,405 B @colyseus/schema state patch (115 entities, round 1 peak). */
const PATCH_FRAME = Buffer.from(
    "D4REAQAAhaxoAACKzAAAAP/MjYQHunTChUyYcL+GgHhzv4cdN56+/8yOhBmkccKFGujcvf/Mj4Tk9WbChf2eR0CG8iDNvodb" +
    "jmq//8yQhO7RrMGFFxlGwYa69G6+h6bueL//zJGEXS6owYYAAIA/hwAAAACPIAD/zJKETIvNwYWk8gpBhl8mnD6Hx81zP48A" +
    "AP/Mk4T7hZlBhcRYRcD/zJWErwCLQYUsUrE/hvqpUD6H7qB6P//MloQme2hChSEdB8H/zJiE0XxnQoXVkfE/hl/5XT+HjA7/" +
    "vv/MnYQs3qzBhbf2I8GG4u+Ou4dg/3+//8yehJrLxkGFi2odQYYy5Bu//8yghNqoysGFgfYcQYZG8bq+h19Tbr+JZmZmQf/M" +
    "oYTAUKlBhQn8vUCHNCFbv//MooSY1uFBhZz1K0GGS586v//MpoQGHKlBhXZq3sCGCmoCv4eASlw//8ynhArT6UGFRsY9QYf5" +
    "3DC//8yrhPQZRsKFIshLQYZCiya/h4BrQr//zK2E6FGwQYXTOvJAhgFIAb+HM/Vcv//MroQnqjZChd4AWEGGAao5P4eTQDC/" +
    "/8yvhCJwY0KFjGcBwYbqF38/h080rL3/zLCEUTw8QoW5KWTBho00YT+HlXbzPv/MsoQkEnHChV5Zzr+G0a9Nv4cUaRg//8yz" +
    "hHPpn8H/zLSErUVkwoX0vJZAhsiiv76HVWRtv//MtYRRym3ChUgkSb//zLaEBjf0wYVP821Bhj8JHz+HnZtIv//Mt4RxtbdB" +
    "hfekEsGGou0Hv4ea7lg//8y4hI7vP0KFHKlZQYbbFCU/h8upQ7//zLuErLivQYUwHwjBhnnp7L6HAPJiP//MvYSkQ8bBhWw1" +
    "/UCGrG9Iv4edQB8//8y/hIwDdcKFyDEHwIZTMn89h66Afz//zMCE6YtewoXnbxlBhvPLn76HXjZzv//MwYSYsWvChYteSUCG" +
    "2u98P4ez7h2+/8zDhLuRuUGFlS8jQYbQRfO+/8zEhFZnskGFaEjdwP/MxYR8fmBChf6AH8GGg/81P4cHCTQ//8zGhJ/NjEGF" +
    "ld0dQIZu23G+h87BeL//zMeERne4QYU9vSXBhqvu8r6HPFlhP//MyYSk5a7BhVxoV8GGuil6Poc+Png//8zKhNlyWsKFCig2" +
    "QYavP7a+h5s7b7//zMuEtE29wYVWcQVBhuKFe7+Hf6s+Pv/MzIS8ybXBhVolSsGGlR13P4f2toU+/8zNhPvTc8KFzMZGwIbY" +
    "/Mi9h6TDfj//zM6ELZZewoVMkyxBhhVniL6Hfb92v//Mz4TzcWrChbc7hkCG4ccdP4fBmEm//8zQhNrFvkGFkp04QYaJrPC+" +
    "/8zRhFYOkUGFbdRnwIb/Dy0/hxCkPD//zNOEGPI7QoWWboTBhqxZTT+HEd0YP//M1IRThL1Bhcn2OcGGU+DwvodQ5mE//8zV" +
    "hE8nbkKFbeEtwYYPeQG/h3jYXD//zNmE+r8CwoXmiJPBhvmwYD+H/lr1Pv/M2oSwGnbChTqSbT7/zNuEyvgEwoWKlY1BhtFW" +
    "JT+HEnJDv//M3IThcFvChfvnUMGGC1ftvodf1WI//8zdhMp3B8KFE0eVwYZm72M/h3gU6T7/zN6Enly7wYW0ulnBhkG9VD+H" +
    "nmYOP//M34TTtAnChXb6jkGGHioxP4c0yzi//8zghKG0X8KFtitIwYbiVNS+h7jyaD//zOGEaxBxQoWqiwE/hl/5Xb+HjA7/" +
    "Pv/M4oSKlzdChQU7h0GG2JcfP4c+Kki//8zjhHDyW0KFRZlKwYb7dRM/h4JDUT//zOSEPjKXQYWQ7oZAhllr2r2HOYp+v//M" +
    "5YTqDMRBha4mTkGGvN3uvofCbmK//8zmhAnaMkKFhp2IQYYRlyc/h9aEQb//zOiEZEWTQYX4a0tAhtofKT6H+Xt8v//M6YRk" +
    "5XHChUESqsCGVyIlvoc5pnw//8zqhGK1jsH/zOuEulhqwoXzz6pAhjTUsj6HjuBvv//M7IQ6LMLBhYxLasGGPJpDP4dKJyU/" +
    "/8zthGbzdMKF97yMwIZfFF88h+35fz//zO6EtcaXwf/M74Q6osTBhWbdEEGGAQx0v4emn5q+/8zwhHyx0cGFk2heQYY4IN09" +
    "h+CAfr//zPGETWEMwoWX8JZBhlNrLj+HGmM7v//M84T7TzFChTazkUGGZ3AjP4eICUW//8z0hF9FWUKFvOJXQYZeBZY+h5fD" +
    "dL//zPWE/ENqQoX1zqZAht1IUL6H+qV6v//M9oSpPmlChR2lRz//zPeEtzRqQoUVw+jAhmIDDb+HXqlVv//M+IQ96FRCha3D" +
    "X0GGY2q3PoeCAm+//8z5hHTLM0KFrOqVwYZkWEg/h+VdHz//zPqEAkrIQYX3fmPBhkuy776HkzZiP//M+4SccWnChYER2kCG" +
    "myInPocqkXy//8z8hDPNeMKFCWbQv4ZWfFs/h9zDAz//zP2EArUQwoXm3p1BhoPhMD+HtBA5v//M/oRh81PChS2Bd0GG55S4" +
    "vocHyW6//8z/hNbevMGFqVQbQYYBgGa/hxzD3r7/zQABhM6ixcGFsxV8wYY5ui0/h1YHPD//zQEBhLeWo8GF6IgmwYbwmPy+" +
    "hxOtXr//zQIBhKRfWMKFODBwQYYrCJe+h8qbdL//zQMBhOWAbcKF0qnGQIb/vOo+h2KCY7//zQQBhFZ+zsGFiqmBwYZNpj0/" +
    "h9r0Kz//zQUBhBKcbUKFa3GqP4ZCznC/h/vDrT7/zQYBhPW+bEKF6JEFwYZO0X+/h26YGj3/zQcBhCarV0KFSXFvQYZcVJQ+" +
    "h4gFdb//zQgBhJH/mkGFH07aQIaTdRW+hy1Cfb//zQkBhBza0kGFpTl8wYYcH/2+h/mGXj//zQoBhBDKZUKF70sVwYZsqwA/" +
    "h4ZQXT//zQsBhDsyU0KFs0V2QYZN/LM+hyqpb7//zQwBhPtJlEGFliq/QIa/sJg8h530f7//zQ0BhIa6yUGF03B2wYbPz+K+" +
    "h7aCZT//zQ4BhIKAl0GFD+3OwIYnikW8hz37fz//zREBhCc+p8GFffo3wYZUNya/h0WzQr//zRIBhEad00GFpauHwYYhzu6+" +
    "h99yYj//zRMBhLZXGMKF+QWxwYawaFw/h/42Aj//zRQBhL1PecKFGMkGv4YUunA/h60zrr7/zRUBhEZYccKFbXMuwYa6qUa9" +
    "h9+yfz//zRYBhJoanUGFMYAuwYacS5S9h/dTfz8=",
  "base64",
);
/** Real 156 B msgpack `damage` broadcast event. */
const DAMAGE_EVENT = Buffer.from("DaVldmVudN4AA6R0eXBlpmRhbWFnZaR0aWNrzQEPpGRhdGHeAAuheMtAMaI4JX4nraF6y7/igM8Lf215pnNvdXJjZQemdGFyZ2V0WaZhbW91bnQ5pHR5cGWocGh5c2ljYWynZG1nVHlwZahwaHlzaWNhbKdibG9ja2VkwqRjcml0wqtraWxsaW5nQmxvd8Kmb3JpZ2lupWJhc2lj", "base64");
/** Real 49 B msgpack `death` broadcast event. */
const DEATH_EVENT = Buffer.from("DaVldmVudN4AA6R0eXBlpWRlYXRopHRpY2vNARukZGF0Yd4AAqJpZFmma2lsbGVyCQ==", "base64");

interface WireResult {
  /** bytes that left the TCP socket, per sent frame, in order */
  wire: number[];
  /** the permessage-deflate parameters the two ends actually agreed on */
  negotiated: Record<string, unknown> | null;
}

const openServers: HttpServer[] = [];
afterEach(() => {
  for (const s of openServers.splice(0)) s.close();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Pair {
  /** server-side ws socket */
  conn: any;
  /** client-side ws socket */
  client: any;
  transport: WebSocketTransport;
}

/**
 * A real transport built from `settings` with a real ws client attached.
 * Nothing is re-implemented: `perMessageDeflateOption` is the shipping factory
 * and `WebSocketTransport` is the class index.ts constructs.
 */
async function connectPair(settings: WsCompressionSettings): Promise<Pair> {
  const httpServer = createServer();
  openServers.push(httpServer);
  await new Promise<void>((res) => httpServer.listen(0, "127.0.0.1", res));
  const port = (httpServer.address() as AddressInfo).port;

  // THE SHIPPED CONSTRUCTION — same call shape as apps/game-server/src/index.ts.
  const transport = new WebSocketTransport({
    server: httpServer,
    maxPayload: 64 * 1024,
    perMessageDeflate: perMessageDeflateOption(settings) as any,
  });
  const wss = (transport as any).wss;
  // The transport's own connection handler looks the room up in the matchMaker
  // and closes anything without a seat reservation. Everything under test lives
  // in the WebSocketServer's options (frame compression), so take the socket
  // and skip the seat check. The perMessageDeflate wiring is untouched.
  wss.removeAllListeners("connection");

  let client: any;
  const conn: any = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("client never connected")), 10_000);
    wss.on("connection", (sock: any) => {
      clearTimeout(t);
      resolve(sock);
    });
    client = new WS(`ws://127.0.0.1:${port}`);
    client.on("error", reject);
  });
  return { conn, client, transport };
}

/**
 * Send `frames` through a real transport built from `settings` and report what
 * each one cost on the wire.
 */
async function measureWire(
  settings: WsCompressionSettings,
  frames: Buffer[],
): Promise<WireResult> {
  const { conn, transport } = await connectPair(settings);
  const negotiated = conn._extensions?.["permessage-deflate"]?.params ?? null;
  const sock = conn._socket;

  // Warm the deflate machinery: the very first message on a fresh context pays
  // allocation costs that have nothing to do with the size question.
  for (const f of frames) {
    await new Promise<void>((res) => conn.send(f, { binary: true }, () => res()));
  }

  const wire: number[] = [];
  for (const f of frames) {
    const before = sock.bytesWritten;
    await new Promise<void>((res) => conn.send(f, { binary: true }, () => res()));
    wire.push(sock.bytesWritten - before);
  }
  conn.close();
  transport.shutdown();
  return { wire, negotiated };
}

const withDefaults = (over: Partial<WsCompressionSettings>): WsCompressionSettings => ({
  ...DEFAULT_WS_COMPRESSION,
  ...over,
});

/** wire[i], but a missing sample is a broken measurement, not `undefined`. */
const w = (r: WireResult, i: number): number => {
  const v = r.wire[i];
  if (v === undefined) throw new Error(`no wire sample at index ${i}`);
  return v;
};

describe("ws compression — bytes on a real socket", () => {
  it("compresses the big state patch and leaves small events untouched (shipping default)", async () => {
    const frames = [PATCH_FRAME, DAMAGE_EVENT, DEATH_EVENT];
    const off = await measureWire(withDefaults({ enabled: false }), frames);
    const on = await measureWire(DEFAULT_WS_COMPRESSION, frames);

    // The precondition without which ws never even looks at `threshold`.
    expect(on.negotiated).toBeTruthy();
    expect(on.negotiated?.server_no_context_takeover).toBe(true);
    expect(off.negotiated).toBeNull();

    // Sanity: uncompressed, the wire cost is the payload plus a small header.
    expect(w(off, 0)).toBe(PATCH_FRAME.length + 4);
    expect(w(off, 1)).toBe(DAMAGE_EVENT.length + 4);
    expect(w(off, 2)).toBe(DEATH_EVENT.length + 2);

    // ABOVE the threshold: fewer bytes actually leave the machine.
    expect(PATCH_FRAME.length).toBeGreaterThanOrEqual(DEFAULT_WS_COMPRESSION.thresholdBytes);
    expect(w(on, 0)).toBeLessThan(w(off, 0) * 0.95);

    // BELOW the threshold: byte-for-byte identical to not having the extension.
    expect(DAMAGE_EVENT.length).toBeLessThan(DEFAULT_WS_COMPRESSION.thresholdBytes);
    expect(DEATH_EVENT.length).toBeLessThan(DEFAULT_WS_COMPRESSION.thresholdBytes);
    expect(w(on, 1)).toBe(w(off, 1));
    expect(w(on, 2)).toBe(w(off, 2));
  }, 30_000);

  it("a threshold above every real message means nothing is compressed", async () => {
    // This is the shape of the mutation the guard has to catch, asserted
    // directly so the guard's own sensitivity is visible rather than implied.
    const frames = [PATCH_FRAME, DAMAGE_EVENT];
    const off = await measureWire(withDefaults({ enabled: false }), frames);
    const inert = await measureWire(
      withDefaults({ thresholdBytes: WS_COMPRESSION_BOUNDS.thresholdBytes.max }),
      frames,
    );
    expect(inert.negotiated?.server_no_context_takeover).toBe(true);
    expect(w(inert, 0)).toBe(w(off, 0));
    expect(w(inert, 1)).toBe(w(off, 1));
  }, 30_000);

  it("without server_no_context_takeover the threshold is INERT — ws compresses everything", async () => {
    // The ws trap, measured. `serverNoContextTakeover: false` keeps the exact
    // same thresholdBytes, and the 49 B death event still gets compressed.
    const frames = [PATCH_FRAME, DAMAGE_EVENT, DEATH_EVENT];
    const off = await measureWire(withDefaults({ enabled: false }), frames);
    const ctx = await measureWire(withDefaults({ serverNoContextTakeover: false }), frames);

    expect(ctx.negotiated).toBeTruthy();
    expect(ctx.negotiated?.server_no_context_takeover).toBeUndefined();
    expect(DEATH_EVENT.length).toBeLessThan(DEFAULT_WS_COMPRESSION.thresholdBytes);
    // Below the threshold and compressed anyway — that is the whole point.
    expect(w(ctx, 2)).toBeLessThan(w(off, 2));
    expect(w(ctx, 1)).toBeLessThan(w(off, 1));
  }, 30_000);
});

describe("ws compression — the reused encode buffer", () => {
  /**
   * Reproduce, at the byte level, what SchemaSerializer.applyPatches does:
   *
   *     const encodedChanges = this.encoder.encode(it);  // view on sharedBuffer
   *     client.raw(encodedChanges);                      // no copy
   *     ...next patch overwrites the same bytes...
   *
   * `guard` decides whether installOutboundCopyGuard is in place. Returns what
   * the CLIENT actually received.
   */
  async function sendThenOverwrite(guard: boolean): Promise<Buffer> {
    const { conn, client, transport } = await connectPair(DEFAULT_WS_COMPRESSION);
    const proto = (WebSocketClient as any).prototype;
    const savedRaw = proto.raw;
    const savedMark = proto.__ggdOutboundCopyGuard;
    try {
      if (guard) {
        delete proto.__ggdOutboundCopyGuard;
        installOutboundCopyGuard(WebSocketClient as any);
      }
      // The SHIPPED client wrapper, not a stand-in: this is the class the
      // transport hands to every room, and raw() is the method the serializer
      // calls.
      const wrapper = new WebSocketClient("test-session", conn);

      const shared = Buffer.alloc(4096); // stands in for Encoder.sharedBuffer
      PATCH_FRAME.copy(shared, 0);
      const encodedChanges = shared.subarray(0, PATCH_FRAME.length);

      const got: Buffer[] = [];
      const received = new Promise<Buffer>((res) => {
        client.on("message", (d: Buffer) => {
          got.push(Buffer.from(d));
          if (got.length === 2) res(got[1] as Buffer);
        });
      });

      // WHY A PRIMER FIRST. Node's zlib copies its input when the deflate
      // actually starts, so a lone message is safe. The damage happens when a
      // deflate is ALREADY in flight: ws then parks the next message in its own
      // send queue by reference (`Sender.enqueue([this.dispatch, data, ...])`,
      // no copy) and only reads it later. On the real server that is the normal
      // case — ~74 messages leave per 33 ms frame, so almost everything after
      // the first one is parked. One primer reproduces it exactly.
      wrapper.raw(Buffer.alloc(3000, 0x5a));
      wrapper.raw(encodedChanges);
      // The very next broadcastPatch() writes over the same buffer.
      shared.fill(0xab);

      const second = await received;
      conn.close();
      transport.shutdown();
      return second;
    } finally {
      proto.raw = savedRaw;
      if (savedMark === undefined) delete proto.__ggdOutboundCopyGuard;
      else proto.__ggdOutboundCopyGuard = savedMark;
    }
  }

  it("WITHOUT the copy guard, compression sends the OVERWRITTEN bytes", async () => {
    // Documents the defect the guard exists for. If this ever starts passing
    // through unchanged, ws or @colyseus/schema changed and the guard's cost
    // can be reconsidered — but silently keeping the guard would then be the
    // only safe reading, so it is asserted rather than assumed.
    const got = await sendThenOverwrite(false);
    expect(got.length).toBe(PATCH_FRAME.length);
    expect(got.equals(PATCH_FRAME)).toBe(false);
    expect(got.every((b) => b === 0xab)).toBe(true);
  }, 30_000);

  it("WITH the copy guard, the client receives the bytes that were encoded", async () => {
    const got = await sendThenOverwrite(true);
    expect(got.equals(PATCH_FRAME)).toBe(true);
  }, 30_000);

  it("the guard is idempotent — a second install does not double-wrap", () => {
    const proto = (WebSocketClient as any).prototype;
    const savedRaw = proto.raw;
    const savedMark = proto.__ggdOutboundCopyGuard;
    try {
      delete proto.__ggdOutboundCopyGuard;
      expect(installOutboundCopyGuard(WebSocketClient as any)).toBe(true);
      const once = proto.raw;
      expect(installOutboundCopyGuard(WebSocketClient as any)).toBe(false);
      expect(proto.raw).toBe(once);
    } finally {
      proto.raw = savedRaw;
      if (savedMark === undefined) delete proto.__ggdOutboundCopyGuard;
      else proto.__ggdOutboundCopyGuard = savedMark;
    }
  });
});

describe("ws compression — settings resolution", () => {
  const E = WS_COMPRESSION_ENV;

  it("defaults are the shipped ones and produce a real ws option object", () => {
    expect(resolveWsCompression({})).toEqual(DEFAULT_WS_COMPRESSION);
    const opt = perMessageDeflateOption(DEFAULT_WS_COMPRESSION);
    expect(opt).not.toBe(false);
    expect(opt && opt.threshold).toBe(DEFAULT_WS_COMPRESSION.thresholdBytes);
    expect(opt && opt.serverNoContextTakeover).toBe(true);
  });

  it("disabled resolves to `false`, not undefined (ws must not fall back to its own default)", () => {
    expect(perMessageDeflateOption(withDefaults({ enabled: false }))).toBe(false);
    expect(resolveWsCompression({ [E.enabled]: "0" }).enabled).toBe(false);
    expect(resolveWsCompression({ [E.enabled]: "off" }).enabled).toBe(false);
  });

  it("honours an in-range env override without a rebuild", () => {
    expect(resolveWsCompression({ [E.thresholdBytes]: "256" }).thresholdBytes).toBe(256);
    expect(resolveWsCompression({ [E.level]: "1" }).level).toBe(1);
    expect(resolveWsCompression({ [E.serverNoContextTakeover]: "0" }).serverNoContextTakeover).toBe(
      false,
    );
  });

  it("rejects out-of-range values on BOTH sides instead of clamping", () => {
    // #277/#279: a silent clamp is how a typo reaches production looking accepted.
    for (const bad of ["-1", "65537", "abc", "1.5", "1e9"]) {
      expect(resolveWsCompression({ [E.thresholdBytes]: bad }).thresholdBytes).toBe(
        DEFAULT_WS_COMPRESSION.thresholdBytes,
      );
    }
    for (const bad of ["-1", "10"]) {
      expect(resolveWsCompression({ [E.level]: bad }).level).toBe(DEFAULT_WS_COMPRESSION.level);
    }
    for (const bad of ["8", "16"]) {
      expect(resolveWsCompression({ [E.serverMaxWindowBits]: bad }).serverMaxWindowBits).toBe(
        DEFAULT_WS_COMPRESSION.serverMaxWindowBits,
      );
    }
  });

  it("the boot line says out loud when the threshold cannot work", () => {
    expect(wsCompressionBootLine(withDefaults({ serverNoContextTakeover: false }))).toContain(
      "INERT",
    );
    expect(wsCompressionBootLine(DEFAULT_WS_COMPRESSION)).not.toContain("INERT");
    expect(wsCompressionBootLine(withDefaults({ enabled: false }))).toContain("OFF");
  });
});
