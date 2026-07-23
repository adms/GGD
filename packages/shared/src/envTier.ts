/**
 * envTier — THE ONE authoritative classifier of the serving environment for a
 * request, from the caller's socket address / host. Task #127 (environment-
 * graded content gate).
 *
 * Three tiers:
 *   - "loopback": the request came from this machine (::1, 127.0.0.0/8, or a
 *     localhost name). Full single-player + copyright-restricted content.
 *   - "lan":      a private-network peer (10./172.16-31./192.168./169.254.,
 *     IPv6 ULA fc00::/7, IPv6 link-local fe80::/10, or an *.local mDNS name).
 *     A phone on the same wifi is here — and is ALLOWED (the couch/LAN flow the
 *     user tests on `client-lan --host 0.0.0.0` must keep working).
 *   - "public":   anything else, INCLUDING an unknown/garbled address. The
 *     copyright gate refuses to serve the restricted mounts to this tier.
 *
 * FAIL-SAFE DIRECTION. An address we cannot positively place in loopback or lan
 * is "public" — the gate then DENIES. Better to refuse a legitimate viewer than
 * to hand Blizzard-owned / imported-champion assets to the open internet.
 *
 * ADDRESS ONLY, NEVER A FORWARDED HEADER. Callers must pass the SOCKET peer
 * (vite: `req.socket.remoteAddress`; nginx: `$remote_addr`) — never
 * `X-Forwarded-For` / `X-Real-IP`, which the caller writes and can forge. This
 * mirrors the project-wide doctrine (apps/content-api/src/guard.ts and
 * apps/platform/internal/server/devsurface_test.go both refuse to trust a
 * forwarded address in any decision).
 *
 * Deliberately dependency-free and framework-free so both the vite dev
 * middleware (apps/client/vite.config.ts) and any other TS tool can import it;
 * the nginx layer re-expresses the SAME table as a `geo` block (nginx/**), two
 * independent implementations of one rule so neither is the single point of
 * failure.
 */

/** The serving-environment tier of a single request, by its peer address. */
export type EnvTier = "loopback" | "lan" | "public";

/**
 * Strip a trailing `:port` from a bare host/IP.
 * - `[::1]:39527` → `::1` (bracketed IPv6 literal, optional port)
 * - `192.168.0.6:39527` → `192.168.0.6`
 * - `host.local:8080` → `host.local`
 * An unbracketed IPv6 literal (multiple colons) is left untouched.
 */
function stripPort(host: string): string {
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    return close >= 0 ? host.slice(1, close) : host;
  }
  const colon = host.indexOf(":");
  if (colon >= 0 && host.indexOf(":", colon + 1) === -1) {
    // exactly one colon → host:port (IPv4 or a name); an IPv6 literal has more.
    if (/^\d+$/.test(host.slice(colon + 1))) return host.slice(0, colon);
  }
  return host;
}

/** Lower/trim, strip a `:port`, an IPv6 zone id and brackets, unwrap `::ffff:`. */
function normalize(input: string | undefined | null): string {
  if (typeof input !== "string") return "";
  let a = input.trim().toLowerCase();
  if (a === "") return "";
  a = stripPort(a);
  const pct = a.indexOf("%"); // fe80::1%en0 → fe80::1
  if (pct >= 0) a = a.slice(0, pct);
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (a.startsWith("::ffff:")) a = a.slice("::ffff:".length); // IPv4-mapped IPv6
  return a;
}

/** Parse a dotted-quad into its four octets, or null if it is not one. */
function ipv4Octets(addr: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return o as [number, number, number, number];
}

/** The numeric value of an IPv6 address's first hextet, or null if not IPv6. */
function firstHextet(addr: string): number | null {
  if (!addr.includes(":")) return null;
  const head = addr.split(":")[0] ?? "";
  if (head === "") return 0; // "::1", "::" — leading run of zeroes
  if (!/^[0-9a-f]{1,4}$/.test(head)) return null;
  return parseInt(head, 16);
}

function isLoopbackAddr(addr: string): boolean {
  if (addr === "::1" || addr === "0:0:0:0:0:0:0:1") return true;
  const o = ipv4Octets(addr);
  return o !== null && o[0] === 127; // 127.0.0.0/8
}

function isPrivateV4(o: [number, number, number, number]): boolean {
  const [a, b] = o;
  if (a === 10) return true; //            10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; //          192.168.0.0/16
  if (a === 169 && b === 254) return true; //          169.254.0.0/16 (link-local)
  return false;
}

/**
 * Classify a bare host or IP (no port required) into its environment tier.
 * Pass the SOCKET PEER address, never a forwarded header. See the file header.
 */
export function classifyEnvTier(hostOrAddr: string | undefined | null): EnvTier {
  const a = normalize(hostOrAddr);
  if (a === "") return "public"; // fail-safe: unknown ⇒ deny

  // Loopback names (RFC 6761 reserves .localhost for loopback).
  if (
    a === "localhost" ||
    a === "ip6-localhost" ||
    a === "localhost.localdomain" ||
    a.endsWith(".localhost")
  ) {
    return "loopback";
  }
  if (isLoopbackAddr(a)) return "loopback";

  // mDNS names resolve only on the local link → LAN.
  if (a.endsWith(".local")) return "lan";

  const o = ipv4Octets(a);
  if (o !== null) return isPrivateV4(o) ? "lan" : "public";

  const h = firstHextet(a);
  if (h !== null) {
    if ((h & 0xfe00) === 0xfc00) return "lan"; // ULA        fc00::/7
    if ((h & 0xffc0) === 0xfe80) return "lan"; // link-local fe80::/10
    return "public"; // a global/routable (or unrecognized) IPv6
  }

  // A non-loopback, non-.local hostname (e.g. play.example.com) or anything we
  // cannot classify ⇒ public.
  return "public";
}

/**
 * May a request in this tier be served the copyright-restricted / single-player
 * content? True for loopback + lan, false for public. The serving layers'
 * whole decision is `mayServeRestrictedContent(classifyEnvTier(peer))`.
 */
export function mayServeRestrictedContent(tier: EnvTier): boolean {
  return tier !== "public";
}

/** Convenience: does this peer address land in the public tier (⇒ deny)? */
export function isPublicPeer(hostOrAddr: string | undefined | null): boolean {
  return classifyEnvTier(hostOrAddr) === "public";
}
