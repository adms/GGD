/**
 * loopbackOnly — the admin console's bind-address lock (task #102).
 *
 * THE RULE THIS ENFORCES: authorisation by REACHABILITY, not by DETECTION.
 * The admin console proxies `/content-api` to the dev content-api on
 * 127.0.0.1:8787, and the content-api grants write authority to any LOOPBACK
 * peer. A proxy hop launders the source address — whoever reaches this vite
 * server, the content-api sees 127.0.0.1 — so the only thing that can keep a
 * LAN device out is that it cannot open the socket in the first place.
 *
 * `server.host: "127.0.0.1"` in vite.config.ts does that… right up until
 * someone types `--host`. A CLI flag silently overrides the config file, and
 * this repo PROVES the user does reach for it: `client-lan` in
 * .claude/launch.json exists exactly so a phone can join the playtest. One
 * absent-minded `pnpm --filter @ggd/admin dev --host 0.0.0.0` would publish the
 * content editor — and, through the proxy, unauthenticated write access to
 * every champion/ability/item JSON — to the whole wifi.
 *
 * So the flag is not merely discouraged, it is fatal: `configResolved` reads
 * the RESOLVED host (CLI flag already applied) and throws. Vite prints the
 * error and exits; the server never binds. This is the vite equivalent of
 * apps/content-api/src/index.ts:30-36, which exits(1) on a non-loopback HOST —
 * two services, one rule, each enforcing it independently.
 *
 * NOTE the deliberate absence of an escape hatch: no env var, no
 * `--force-lan`, no trusted-CIDR option. Every one of those is a hole with a
 * comment on it. If the console genuinely must be shared one day, it needs the
 * platform's argon2id + JWT + AdminOnly gate — which the rest of the console
 * already uses — not an address it can be talked into trusting.
 */
import type { Plugin } from "vite";

/**
 * Vite's `server.host` / `preview.host` after CLI resolution.
 *   - `undefined`  → vite's default, which is loopback. Allowed.
 *   - `false`      → loopback. Allowed.
 *   - `true`       → "listen on all addresses" (the bare `--host` flag). REFUSED.
 *   - a string     → must be a loopback name/address.
 */
export type ResolvedHost = string | boolean | undefined;

/**
 * True for ::1, 127.0.0.0/8, the IPv4-mapped forms node reports on a
 * dual-stack listener, and the loopback hostnames.
 *
 * Deliberately a THIRD independent implementation of the rule already written
 * in apps/content-api/src/guard.ts and apps/client/vite.config.ts. One shared
 * helper would be tidier and would also be a single point of failure for the
 * whole authorisation model; three that agree are cheap insurance.
 */
export function isLoopbackHostValue(host: ResolvedHost): boolean {
  if (host === undefined || host === false) return true; // vite's loopback default
  if (host === true) return false; // bare `--host` = all interfaces
  let h = host.trim().toLowerCase();
  if (h === "") return false;
  const pct = h.indexOf("%");
  if (pct >= 0) h = h.slice(0, pct);
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "localhost" || h === "ip6-localhost" || h === "localhost.localdomain") return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("::ffff:")) h = h.slice("::ffff:".length);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m === null) return false;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  return octets[0] === 127;
}

/** The refusal message, exported so the test asserts the real text. */
export function refusalMessage(which: "server" | "preview", host: ResolvedHost): string {
  return (
    `@ggd/admin refuses to bind ${which}.host=${JSON.stringify(host)} — the operations ` +
    "console proxies /content-api to the dev content-api, which grants WRITE access to " +
    "content/ to any loopback peer. A proxy hop launders the caller's address, so binding " +
    "anything but loopback would hand every device on the wifi unauthenticated write " +
    "access to every champion / ability / item JSON.\n" +
    "  → Drop the --host flag. The console is http://127.0.0.1:60721/admin/ and it only " +
    "ever needs to run on this machine.\n" +
    "  → The phone playtest uses the GAME client (`client-lan`, port 39527), which has no " +
    "content-api route at all."
  );
}

/**
 * Refuse to start unless the resolved dev/preview host is loopback.
 *
 * `configResolved` is the right hook: it runs after vite has merged the config
 * file with the CLI flags, and before any listener is created, so throwing here
 * means the socket is never opened rather than closed after the fact.
 */
export function loopbackOnly(): Plugin {
  return {
    name: "ggd-admin-loopback-only",
    // `pre` so this decides before any other plugin can react to the config
    enforce: "pre",
    configResolved(config) {
      const serverHost = config.server?.host as ResolvedHost;
      if (!isLoopbackHostValue(serverHost)) {
        throw new Error(refusalMessage("server", serverHost));
      }
      const previewHost = config.preview?.host as ResolvedHost;
      if (!isLoopbackHostValue(previewHost)) {
        throw new Error(refusalMessage("preview", previewHost));
      }
    },
  };
}
