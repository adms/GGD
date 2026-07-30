/**
 * WebSocket payload compression (RFC 7692 `permessage-deflate`) for the
 * Colyseus transport — and, more importantly, the SIZE THRESHOLD below which a
 * message is sent as-is.
 *
 * WHY A THRESHOLD AT ALL (owner, 2026-07-30):
 *   「很小的訊息壓完可能反而變大（deflate 有固定的框架開銷）。所以要設一個
 *     門檻，只壓超過某個大小的訊息。」
 * That is exactly right and it is measurable: a raw-deflate block costs a few
 * bytes of header/alignment even when nothing compresses, so under some size
 * the "compressed" frame is LARGER than the original. See the measured
 * crossover in the numbers block below.
 *
 * ⚠️ THE TRAP THAT MAKES THE THRESHOLD A LIE IF YOU IGNORE IT.
 * `ws` only consults `threshold` when CONTEXT TAKEOVER IS DISABLED on the
 * sending side. From ws 8.21.1, lib/sender.js:
 *
 *     if (rsv1 && perMessageDeflate &&
 *         perMessageDeflate.params[isServer ? 'server_no_context_takeover'
 *                                           : 'client_no_context_takeover']) {
 *       rsv1 = byteLength >= perMessageDeflate._threshold;   // <- the threshold
 *     }
 *
 * With context takeover left ON (the ws default, and what a browser offers),
 * that branch never runs and EVERY message is compressed no matter how small —
 * the threshold field would sit in the config looking authoritative and doing
 * nothing. So `serverNoContextTakeover` is not a tuning knob here, it is the
 * PRECONDITION for the owner's requirement, and it defaults ON for that reason.
 * `wsCompression.test.ts` measures real bytes on a real socket in both modes so
 * this cannot regress silently.
 *
 * WHAT CONTEXT TAKEOVER COSTS US BY BEING OFF — and it is not small. Measured
 * on the same 3,249-frame corpus, one real client stream:
 *     server_no_context_takeover (threshold works):  −11.6% wire bytes
 *     context takeover           (threshold inert):  −40.3% wire bytes
 * Each message deflates from a cold LZ77 window instead of against the history
 * of the previous patches, which are near-duplicates of it. Per-message CPU is
 * NOT better for the no-context mode either (60.0 µs vs 51.5 µs/msg measured) —
 * resetting the context every message costs more than keeping it. What being
 * off does buy is the threshold itself, a few hundred KiB less per connection,
 * and frames that are independently decodable.
 * Flipping it is one env var; the trade is owner's call, not this file's.
 *
 * EVERY FIELD HERE IS A DECISION POINT, so every field is settable without a
 * rebuild (CLAUDE.md 第一守則). The game-server image bakes its code at build
 * time; these come from the environment, which is a compose/Helm edit and a
 * restart rather than a rebuild. They are read ONCE at boot because `ws` fixes
 * the extension parameters at `WebSocketServer` construction and negotiates
 * them per connection at the HTTP upgrade — there is no live-reload seam.
 */

/** Resolved, validated compression settings. */
export interface WsCompressionSettings {
  /** master switch — false means the extension is not offered at all */
  enabled: boolean;
  /**
   * Messages strictly smaller than this are sent uncompressed.
   * Only has an effect while `serverNoContextTakeover` is true (see file head).
   */
  thresholdBytes: number;
  /** zlib deflate level, 0 (store) … 9 (max). CPU vs ratio. */
  level: number;
  /** zlib memLevel, 1 … 9. Memory vs speed. */
  memLevel: number;
  /** LZ77 window, 9 … 15 bits. Smaller = less memory per connection. */
  serverMaxWindowBits: number;
  /** REQUIRED for `thresholdBytes` to mean anything — see the file head. */
  serverNoContextTakeover: boolean;
  /** ask the browser to drop its own deflate context between messages */
  clientNoContextTakeover: boolean;
  /** how many zlib jobs may be in flight on the libuv thread pool at once */
  concurrencyLimit: number;
}

/**
 * SHIPPED DEFAULTS.
 *
 * `thresholdBytes: 256` is measured, not chosen for looks. 3,249 REAL outgoing
 * frames (join full-state, champ select, mob ramp, 115-entity combat peak) were
 * replayed over a real socket with and without the extension, and each frame's
 * cost compared against its own uncompressed cost:
 *
 *   payload     wire vs uncompressed     messages that got smaller
 *   ≤  48 B          +7.2%                        1%
 *   48– 64 B         +3.6%                       35%
 *   64– 96 B         +1.0%                        4–41%
 *   96–112 B        −11.0%                      100%     <- CROSSOVER = 96 B
 *   160–192 B        −4.9%                      100%
 *   256–384 B       −13.3%                      100%
 *   2048–3072 B     −12.1%                      100%
 *
 * So the owner's instinct is exactly right and the crossover is 96 bytes: below
 * it a "compressed" frame is BIGGER than the original. The shipped threshold is
 * higher than the crossover on purpose — sweeping it over the same corpus, a
 * threshold of 96 saves 11.69% of wire bytes and 256 saves 11.18%, but 256
 * performs 41% of the deflate calls instead of 72%. The 96–256 band pays ~50 µs
 * of CPU per message to save ~8 bytes; 256 buys 96% of the byte win for 57% of
 * the work.
 */
export const DEFAULT_WS_COMPRESSION: WsCompressionSettings = {
  enabled: true,
  thresholdBytes: 256,
  level: 6,
  memLevel: 8,
  serverMaxWindowBits: 15,
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
  concurrencyLimit: 10,
};

/** Bounds. A field with only a lower bound is half a validator (CLAUDE.md). */
export const WS_COMPRESSION_BOUNDS = {
  /** 0 = compress everything; the transport's maxPayload is the ceiling. */
  thresholdBytes: { min: 0, max: 64 * 1024 },
  level: { min: 0, max: 9 },
  memLevel: { min: 1, max: 9 },
  /** zlib cannot honour windowBits 8 for raw deflate; it silently becomes 9. */
  serverMaxWindowBits: { min: 9, max: 15 },
  concurrencyLimit: { min: 1, max: 1024 },
} as const;

/** Env var names, one per decision point. */
export const WS_COMPRESSION_ENV = {
  enabled: "GGD_WS_COMPRESSION",
  thresholdBytes: "GGD_WS_COMPRESSION_THRESHOLD",
  level: "GGD_WS_COMPRESSION_LEVEL",
  memLevel: "GGD_WS_COMPRESSION_MEMLEVEL",
  serverMaxWindowBits: "GGD_WS_COMPRESSION_WINDOW_BITS",
  serverNoContextTakeover: "GGD_WS_COMPRESSION_SERVER_NO_CONTEXT",
  clientNoContextTakeover: "GGD_WS_COMPRESSION_CLIENT_NO_CONTEXT",
  concurrencyLimit: "GGD_WS_COMPRESSION_CONCURRENCY",
} as const;

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

function int(
  raw: string | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  // Out of range falls back to the default rather than clamping: a silent clamp
  // is how "50 typed as 500" reaches production looking accepted (#277/#279).
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (n < bounds.min || n > bounds.max) return fallback;
  return n;
}

/**
 * Resolve settings from an env bag. Pure — the env is a parameter so this is
 * unit-testable without touching `process.env`.
 */
export function resolveWsCompression(
  env: NodeJS.ProcessEnv = process.env,
  defaults: WsCompressionSettings = DEFAULT_WS_COMPRESSION,
): WsCompressionSettings {
  const E = WS_COMPRESSION_ENV;
  const B = WS_COMPRESSION_BOUNDS;
  return {
    enabled: bool(env[E.enabled], defaults.enabled),
    thresholdBytes: int(env[E.thresholdBytes], defaults.thresholdBytes, B.thresholdBytes),
    level: int(env[E.level], defaults.level, B.level),
    memLevel: int(env[E.memLevel], defaults.memLevel, B.memLevel),
    serverMaxWindowBits: int(
      env[E.serverMaxWindowBits],
      defaults.serverMaxWindowBits,
      B.serverMaxWindowBits,
    ),
    serverNoContextTakeover: bool(
      env[E.serverNoContextTakeover],
      defaults.serverNoContextTakeover,
    ),
    clientNoContextTakeover: bool(
      env[E.clientNoContextTakeover],
      defaults.clientNoContextTakeover,
    ),
    concurrencyLimit: int(env[E.concurrencyLimit], defaults.concurrencyLimit, B.concurrencyLimit),
  };
}

/**
 * The shape `ws` wants, straight into `new WebSocketTransport({ ... })`.
 * `false` (not `undefined`) when disabled: ws treats undefined as "use my
 * default", and its default for a WebSocketServer is already false, but saying
 * it explicitly means a future ws default flip cannot turn compression on here
 * behind our back.
 *
 * The return type is intentionally the structural shape rather than an import
 * from `ws` — this module is the single place the mapping lives, and the
 * transport is the only consumer.
 */
export interface PerMessageDeflateOption {
  threshold: number;
  serverNoContextTakeover: boolean;
  clientNoContextTakeover: boolean;
  serverMaxWindowBits: number;
  concurrencyLimit: number;
  zlibDeflateOptions: { level: number; memLevel: number };
}

export function perMessageDeflateOption(
  s: WsCompressionSettings = resolveWsCompression(),
): PerMessageDeflateOption | false {
  if (!s.enabled) return false;
  return {
    threshold: s.thresholdBytes,
    serverNoContextTakeover: s.serverNoContextTakeover,
    clientNoContextTakeover: s.clientNoContextTakeover,
    serverMaxWindowBits: s.serverMaxWindowBits,
    concurrencyLimit: s.concurrencyLimit,
    zlibDeflateOptions: { level: s.level, memLevel: s.memLevel },
  };
}

/**
 * ⛔ REQUIRED WHENEVER COMPRESSION IS ON. Not optional, not a tuning knob.
 *
 * THE BUG THIS PREVENTS. `@colyseus/schema` encodes every state patch into ONE
 * buffer it reuses for the next patch — `Encoder.encode(it, view, buffer =
 * this.sharedBuffer)` — and `SchemaSerializer.applyPatches` hands a SUBARRAY of
 * that buffer straight to every client's `raw()`:
 *
 *     const encodedChanges = this.encoder.encode(it);
 *     while (numClients--) { ... client.raw(encodedChanges); }   // no copy
 *
 * That is safe only while `ws.send()` reads the bytes before returning, which is
 * true with the extension OFF.
 *
 * WITH permessage-deflate it depends on whether a deflate is already running,
 * and the precise mechanism matters because the obvious guess is wrong:
 *   · queue empty  -> ws dispatches immediately and node's zlib copies the input
 *                     when `write()` is called, so a LONE message is safe.
 *                     (Verified: clobbering a buffer straight after
 *                     `deflateRaw.write(view)` still round-trips the original.)
 *   · deflate in flight -> ws parks the message in its OWN queue BY REFERENCE
 *                     (`Sender.enqueue([this.dispatch, data, opts, cb])`,
 *                     lib/sender.js) and only reads it when the queue drains.
 *                     The encoder overwrites the bytes long before that.
 * On this server the second case is the normal one: ~74 messages leave per
 * 33 ms frame across 12 sockets, so nearly everything after the first message
 * on a socket is parked.
 *
 * It is not theoretical. With a real MatchRoom, 12 real clients and the
 * 115-entity peak, turning compression on produced `"refId" not found` decode
 * failures on the clients where the same run with compression off produced
 * none. Driven unpaced (which lets the queue grow) it produced tens of
 * thousands. The failure is SILENT on the server — nothing throws, no metric
 * moves; the damage shows up as entities that stop updating on someone's screen.
 *
 * Broadcast events are NOT affected: `getMessageBytes.raw` already returns
 * `Buffer.from(...)`, a fresh copy. Only the state-patch path aliases.
 *
 * The copy costs one allocation + memcpy per outgoing message. That is why this
 * is only installed when compression is actually on.
 */
export function installOutboundCopyGuard(clientClass: { prototype: unknown }): boolean {
  const proto = clientClass.prototype as Record<string, unknown>;
  if (proto.__ggdOutboundCopyGuard) return false;
  const orig = proto.raw as (data: unknown, options?: unknown, cb?: unknown) => unknown;
  if (typeof orig !== "function") {
    throw new Error("installOutboundCopyGuard: client class has no raw() to wrap");
  }
  proto.raw = function (this: unknown, data: unknown, options?: unknown, cb?: unknown): unknown {
    return orig.call(
      this,
      data instanceof Uint8Array ? Buffer.from(data) : data,
      options,
      cb,
    );
  };
  proto.__ggdOutboundCopyGuard = true;
  return true;
}

/** One boot line, so a shard's compression posture is visible in the logs. */
export function wsCompressionBootLine(
  s: WsCompressionSettings = resolveWsCompression(),
): string {
  if (!s.enabled) return "[game-server] ws compression: OFF (permessage-deflate not offered)";
  const thresholdNote = s.serverNoContextTakeover
    ? `threshold=${s.thresholdBytes}B`
    : `threshold=${s.thresholdBytes}B (INERT — serverNoContextTakeover is off, ws compresses every message)`;
  return (
    `[game-server] ws compression: ON permessage-deflate ${thresholdNote} ` +
    `level=${s.level} memLevel=${s.memLevel} windowBits=${s.serverMaxWindowBits} ` +
    `serverNoCtx=${s.serverNoContextTakeover} clientNoCtx=${s.clientNoContextTakeover} ` +
    `concurrency=${s.concurrencyLimit}`
  );
}
