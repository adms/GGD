/**
 * DEV-WRITE GUARD — the server half of task #96's two-layer authorisation.
 *
 * The user's rule 「localhost 在本機存儲的情況下視同管理者權限可編輯」 is a fine
 * developer convenience and a terrible production default, so the convenience is
 * granted ONLY when the process can prove all of the following. A client-side
 * check is not access control; this file is the enforcement, and it does not
 * trust anything the client says.
 *
 *   1. NOT production — already enforced twice (buildServer throws on
 *      NODE_ENV=production, index.ts exits). This guard does not replace those.
 *   2. The PEER is loopback — `req.raw.socket.remoteAddress` must be ::1 or in
 *      127.0.0.0/8 (incl. the IPv4-mapped ::ffff:127.0.0.1). We read the SOCKET
 *      and never `X-Forwarded-For` / `X-Real-IP` / `req.ip`: those are
 *      attacker-supplied strings, and the dev nginx include really does set them
 *      (nginx/dev/content-api.conf) — trusting them would hand write authority
 *      to any machine on the LAN.
 *   3. The ORIGIN, when the browser sends one, is a known local dev origin.
 *      Rule 2 alone does NOT cover this: a random website the user is browsing
 *      runs in a browser ON the dev machine, so ITS requests to
 *      http://127.0.0.1:8787 also arrive from a loopback peer. Absent `Origin`
 *      is allowed only because rule 2 has already restricted the peer to a local
 *      process (curl, vitest, the editor's node tooling).
 *
 * READS STAY OPEN. Content is not secret, and the codex must remain readable
 * from a phone on the LAN — only the mutating verbs are gated.
 *
 * KNOWN CONSEQUENCE (documented, deliberate): under
 * `docker compose --profile dev` the content-api sits behind the nginx
 * container, so the peer is the docker bridge IP and WRITES THROUGH THAT PATH
 * 403. Reads are unaffected. The primary flow — `pnpm dev:editor` / `dev:all`,
 * vite on the host proxying to 127.0.0.1:8787 — has a genuinely loopback peer
 * and is unharmed. There is deliberately NO trusted-proxy CIDR escape hatch:
 * that is a hole with a comment on it.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Browser origins allowed to mutate content: the local dev servers only.
 *
 * TASK #102 removed the game client (:39527). That server is the one the user
 * deliberately publishes to the LAN (`client-lan`, --host 0.0.0.0) and it no
 * longer proxies /content-api at all, so listing its origin here would only
 * describe a door that no longer exists. Content editing now happens in the
 * admin console on :60721, whose vite server refuses to bind anything but
 * loopback.
 *
 * This list is the SECOND check, never the first: an absent `Origin` is
 * allowed by design (see isAllowedOrigin), so curl is not stopped here — the
 * loopback PEER check is what stops it.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:60721", // @ggd/admin operations console (內容管理 — task #102)
  "http://127.0.0.1:60721",
  "http://localhost:5174", // apps/editor
  "http://127.0.0.1:5174",
  "http://localhost:8088", // docker dev edge (nginx)
  "http://127.0.0.1:8088",
];

/** HTTP verbs that can change something on disk. */
const MUTATING = new Set(["PUT", "POST", "DELETE", "PATCH"]);

/**
 * True for ::1, 127.0.0.0/8 and the IPv4-mapped forms node reports on a
 * dual-stack listener (`::ffff:127.0.0.1`). Anything else — including an
 * absent/garbled address — is NOT loopback.
 */
export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (typeof addr !== "string" || addr === "") return false;
  let a = addr.trim().toLowerCase();
  // strip a zone id (fe80::1%en0) and brackets ([::1])
  const pct = a.indexOf("%");
  if (pct >= 0) a = a.slice(0, pct);
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (a === "::1" || a === "0:0:0:0:0:0:0:1") return true;
  if (a.startsWith("::ffff:")) a = a.slice("::ffff:".length);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (!m) return false;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  return octets[0] === 127;
}

/** A host string safe to bind the dev service to (loopback names included). */
export function isLoopbackHost(host: string | undefined | null): boolean {
  if (typeof host !== "string" || host === "") return false;
  const h = host.trim().toLowerCase();
  if (h === "localhost" || h === "ip6-localhost" || h === "localhost.localdomain") return true;
  return isLoopbackAddress(h);
}

/** `Origin` is optional; when present it must be a known local dev origin. */
export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (origin === undefined || origin === null || origin === "") return true;
  return ALLOWED_ORIGINS.includes(origin.trim());
}

export interface GuardInput {
  method: string;
  /** the PEER address off the socket — never a forwarded header */
  remoteAddress: string | undefined;
  origin?: string | undefined;
}

export type GuardVerdict = { ok: true } | { ok: false; code: number; message: string };

/**
 * The whole decision, as a pure function so it can be unit-tested without a
 * server. Note there is no header parameter other than `origin`: forwarded
 * headers are not an input to this decision by construction.
 */
export function guardVerdict(input: GuardInput): GuardVerdict {
  if (!MUTATING.has(input.method.toUpperCase())) return { ok: true };
  if (!isLoopbackAddress(input.remoteAddress)) {
    return {
      ok: false,
      code: 403,
      message:
        "content edits are loopback-only: this request did not come from the dev machine " +
        `(peer ${input.remoteAddress ?? "unknown"}). Forwarded headers are ignored by design.`,
    };
  }
  if (!isAllowedOrigin(input.origin)) {
    return {
      ok: false,
      code: 403,
      message:
        `origin "${String(input.origin)}" may not write content — ` +
        "only the local dev servers may (cross-site write attempt refused).",
    };
  }
  return { ok: true };
}

/**
 * Install the guard on every request. Registered as `onRequest`, the earliest
 * Fastify lifecycle hook, so a refused write never reaches routing, body
 * parsing or the filesystem.
 */
export function registerDevWriteGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const verdict = guardVerdict({
      method: req.method,
      // req.raw.socket, NOT req.ip: req.ip would follow `trustProxy` if anyone
      // ever turned it on, and this decision must never be header-driven.
      remoteAddress: req.raw.socket?.remoteAddress,
      origin: req.headers.origin,
    });
    if (verdict.ok) return;
    await reply.code(verdict.code).send({ error: verdict.message });
  });
}
