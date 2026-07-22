/**
 * iconConsoleStamp — the LIVE half of the asset console's freshness check.
 *
 * THE PROBLEM. Almost everything the asset console shows is fetched at view
 * time from the same files the game reads, so it cannot go stale. One thing
 * cannot: the icon STYLE SPEC (the pinned prompt prefix, the negative
 * constraints and the description→visual-subject lexicons) lives in Python, in
 * tools/icon-gen/src/prompt.py, and no browser can import it. A generator
 * (tools/icon-console/emit_style_spec.py) snapshots it into
 * content/assets/icon-console/style-spec.json.
 *
 * A snapshot that cannot prove it is current is exactly the failure the console
 * exists to eliminate — the day someone tunes PREFIX, the page would keep
 * displaying the old art direction with total confidence.
 *
 * THE FIX. This middleware hashes those Python sources ON EVERY REQUEST and
 * returns the digests. The page compares them against the digests the snapshot
 * recorded when it was written, and shows a loud STALE banner naming the exact
 * command to rerun when they disagree. That makes the one non-live section of
 * the page self-policing.
 *
 * DEV/PREVIEW ONLY, and deliberately so: there is no build hook here, so
 * nothing in a production bundle depends on it. When the endpoint is absent the
 * console says "freshness check unavailable in this build" and falls back to
 * showing the snapshot's own timestamp — degraded, but never silently wrong.
 *
 * READ-ONLY, GET/HEAD ONLY, and the file list is a FIXED ALLOWLIST — it is not
 * a path parameter. This cannot be turned into an arbitrary-file reader.
 *
 * LOOPBACK ONLY. This is the ONE vite server the project publishes to the LAN
 * (`client-lan` runs it with --host 0.0.0.0 so a phone can play), and a device
 * on the wifi has no business enumerating repo internals — not even digests.
 * Unlike the content-api case there is no proxy in front of this middleware, so
 * `req.socket.remoteAddress` IS the real peer and the check actually holds. A
 * refused caller gets the same answer as a production build: no stamp, and the
 * console degrades to "freshness unverifiable" rather than to a false "fresh".
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * The sources the published style spec is derived from. MUST stay in step with
 * SOURCE_FILES in tools/icon-console/emit_style_spec.py — a file listed there
 * but not here is a blind spot: it could change without the page noticing.
 * assetConsole.test.ts pins the two lists together.
 */
export const STAMP_SOURCES = [
  "tools/icon-gen/src/prompt.py",
  "tools/icon-gen/src/plan.py",
  "tools/icon-gen/src/pricing.json",
] as const;

export const STAMP_ROUTE = "/icon-console/source-stamp";

export interface StampEntry {
  path: string;
  sha256: string;
  bytes: number;
  mtime: string;
  /** false when the file is gone — itself a finding worth showing */
  exists: boolean;
}

/** Hash the allowlisted sources as they are RIGHT NOW. */
export async function readStamp(root = REPO_ROOT): Promise<StampEntry[]> {
  return Promise.all(
    STAMP_SOURCES.map(async (rel): Promise<StampEntry> => {
      const file = resolve(root, rel);
      try {
        const [raw, st] = await Promise.all([readFile(file), stat(file)]);
        return {
          path: rel,
          sha256: createHash("sha256").update(raw).digest("hex"),
          bytes: raw.byteLength,
          mtime: new Date(st.mtimeMs).toISOString().replace(/\.\d+Z$/, "Z"),
          exists: true,
        };
      } catch {
        return { path: rel, sha256: "", bytes: 0, mtime: "", exists: false };
      }
    }),
  );
}

/**
 * True for ::1, 127.0.0.0/8 and the IPv4-mapped forms node reports on a
 * dual-stack listener. Mirrors the rule in vite.config.ts and
 * apps/content-api/src/guard.ts — independent copies so none is a single point
 * of failure.
 */
export function isLoopbackPeer(addr: string | undefined): boolean {
  if (typeof addr !== "string" || addr === "") return false;
  let a = addr.trim().toLowerCase().split("%")[0] ?? "";
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (a === "::1" || a === "0:0:0:0:0:0:0:1") return true;
  if (a.startsWith("::ffff:")) a = a.slice("::ffff:".length);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  return m !== null && Number(m[1]) === 127 && m.slice(1, 5).every((o) => Number(o) <= 255);
}

function handler(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!isLoopbackPeer(req.socket.remoteAddress)) {
    // Terminal, not next(): nothing else should answer this path.
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("icon-console source stamp is loopback-only (this device is not the dev machine)");
    return;
  }
  void readStamp().then(
    (sources) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      // Never cached: a cached freshness check is a contradiction in terms.
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(JSON.stringify({ checkedAt: new Date().toISOString(), sources }));
    },
    () => next(),
  );
}

/** Dev middleware: GET /icon-console/source-stamp → live digests of the sources. */
export function serveIconConsoleStamp(): Plugin {
  return {
    name: "ggd-icon-console-stamp",
    configureServer(server) {
      server.middlewares.use(STAMP_ROUTE, handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(STAMP_ROUTE, handler);
    },
  };
}
