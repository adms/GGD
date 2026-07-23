/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
// task #101: live digests of the icon style-spec sources, so the asset console
// can prove its one snapshotted section is current (dev/preview only).
import { serveIconConsoleStamp } from "./dev/iconConsoleStamp";
// task #127: the ONE authoritative environment-tier classifier (loopback | lan
// | public). This dev/LAN server is deliberately published to the wifi
// (`client-lan --host 0.0.0.0`), so the copyright-restricted mounts must be
// served to a loopback/LAN peer and refused to a genuinely public one.
import { classifyEnvTier, mayServeRestrictedContent } from "@ggd/shared/envTier";

const CONTENT_DIR = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * COPYRIGHT GATE (content/assets/blizzard-local/README.md): extracted
 * Blizzard-owned WC3 assets live OUTSIDE the deployable content/ tree, in the
 * git-ignored runtime store data/blizzard-overlay/. This dev server is the
 * only place (plus the dev-profile nginx include nginx/dev/blizzard-overlay.conf)
 * that maps the stable /content/assets/blizzard-local/** URLs onto it — prod
 * nginx serves /content from the repo content/ dir and 404s these URLs.
 */
const BLIZZARD_OVERLAY_DIR = fileURLToPath(new URL("../../data/blizzard-overlay", import.meta.url));
const BLIZZARD_OVERLAY_MOUNT = "/content/assets/blizzard-local";

const CONTENT_MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".json": "application/json",
  ".wav": "audio/wav",
  // BGM is MP3. Web Audio's decodeAudioData ignores the content type, so the
  // game never needed this — but a plain <audio> element (the BGM audition
  // page, /bgm-audition.html) does: served as application/octet-stream some
  // browsers refuse to play it. nginx already sends audio/mpeg in prod.
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/** GET/HEAD static file handler rooted at `rootDir` (path-traversal safe). */
function staticHandler(rootDir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
    const file = resolve(rootDir, "." + rel);
    if (!file.startsWith(rootDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
      return next();
    }
    res.setHeader("Content-Type", CONTENT_MIME[extname(file)] ?? "application/octet-stream");
    res.setHeader("Content-Length", statSync(file).size);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}

/** Dev middleware: GET/HEAD /content/* → repo content/ (nginx serves it in prod). */
function serveContent(): Plugin {
  const handler = staticHandler(CONTENT_DIR);
  return {
    name: "ggd-serve-content",
    configureServer(server) {
      server.middlewares.use("/content", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/content", handler);
    },
  };
}

/**
 * DEV-ONLY middleware: /content/assets/blizzard-local/* → data/blizzard-overlay/*.
 * Serves the LOCAL-ONLY Blizzard asset overlay (models/sounds/MANIFEST.json)
 * from the git-ignored data/ store. Registered before serveContent (longer
 * mount prefix wins); if data/blizzard-overlay/ does not exist every request
 * falls through and 404s — exactly the deployed behavior, so consumers keep
 * their fallbacks. NEVER replicate this route in prod nginx.
 */
function serveBlizzardOverlay(): Plugin {
  const handler = staticHandler(BLIZZARD_OVERLAY_DIR);
  return {
    name: "ggd-serve-blizzard-overlay",
    configureServer(server) {
      server.middlewares.use(BLIZZARD_OVERLAY_MOUNT, handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(BLIZZARD_OVERLAY_MOUNT, handler);
    },
  };
}

/**
 * COPYRIGHT / ENVIRONMENT-TIER GATE (task #127). The mounts below carry
 * content that a genuinely PUBLIC deploy must not serve:
 *   - /content/assets/models/imported — the imported champion GLBs (anime /
 *     game-ripped models); these live INSIDE the deployable content/ tree, so
 *     without this gate the general serveContent() handler would hand them to
 *     anyone.
 *   - /content/assets/blizzard-local  — the dev-only Blizzard overlay mount
 *     (serveBlizzardOverlay above). Belt-and-suspenders: refuse it to a public
 *     peer even where the overlay store happens to exist.
 */
const COPYRIGHT_RESTRICTED_MOUNTS = [
  "/content/assets/models/imported",
  BLIZZARD_OVERLAY_MOUNT,
] as const;

/**
 * Refuse the copyright-restricted mounts to a genuinely PUBLIC peer, while
 * serving loopback + LAN unchanged (a phone on the wifi keeps working — this is
 * the LAN-published server). Classified off the SOCKET peer only
 * (req.socket.remoteAddress), never a forwarded header — see @ggd/shared/envTier
 * and the contentApiGuard note below on why a header cannot be trusted here.
 *
 * Registered BEFORE serveBlizzardOverlay + serveContent so connect runs it
 * first: a served tier falls through (next()) to the real static handlers; a
 * public tier gets a terminal 403 and the file is never read. The decision is
 * exactly `mayServeRestrictedContent(classifyEnvTier(peer))`, unit-pinned in
 * packages/shared/src/envTier.test.ts.
 */
function copyrightTierGate(): Plugin {
  const guard = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const tier = classifyEnvTier(req.socket.remoteAddress);
    if (mayServeRestrictedContent(tier)) return next();
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end(
      `copyright-restricted content is not served to a public host (env tier: ${tier}). ` +
        "The imported champion models and the Blizzard overlay are available only to a " +
        "loopback or LAN client (task #127).",
    );
  };
  const register = (server: { middlewares: { use: (path: string, fn: typeof guard) => void } }): void => {
    for (const mount of COPYRIGHT_RESTRICTED_MOUNTS) server.middlewares.use(mount, guard);
  };
  return {
    name: "ggd-copyright-tier-gate",
    configureServer(server) {
      register(server);
    },
    configurePreviewServer(server) {
      register(server);
    },
  };
}

/**
 * True for ::1, 127.0.0.0/8 and the IPv4-mapped forms node reports on a
 * dual-stack listener. Deliberately mirrors apps/content-api/src/guard.ts —
 * two independent implementations of one rule, so neither can be the single
 * point of failure.
 */
function isLoopback(addr: string | undefined): boolean {
  if (typeof addr !== "string" || addr === "") return false;
  let a = addr.trim().toLowerCase().split("%")[0] ?? "";
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (a === "::1" || a === "0:0:0:0:0:0:0:1") return true;
  if (a.startsWith("::ffff:")) a = a.slice("::ffff:".length);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  return m !== null && Number(m[1]) === 127 && m.slice(1, 5).every((o) => Number(o) <= 255);
}

/**
 * THE CONTENT-API TRIPWIRE (task #102). This server has NO /content-api proxy
 * any more, and this plugin exists so it can never quietly get one back.
 *
 * WHY THE ROUTE IS GONE, not merely guarded. This is the ONE vite server the
 * user deliberately publishes to the LAN — `client-lan` runs it with
 * `--host 0.0.0.0` so a phone on the wifi can play. A proxy hop LAUNDERS the
 * source address: the content-api would see 127.0.0.1 (the vite process made
 * the connection), so ITS loopback guard passes, and the phone gets write
 * access to content/. The previous defence was a peer check right here, at the
 * first hop that can still see the real client — correct, and still one plugin
 * reorder / one `configureServer` regression away from being bypassed.
 *
 * The origin allowlist does not save you either: `changeOrigin: true` rewrites
 * Host, not Origin, so a LAN *browser* is refused — but `curl` from the phone
 * sends no Origin at all, and an absent Origin is allowed by design
 * (apps/content-api/src/guard.ts). Only the peer check stood there, and the
 * peer check is exactly what a proxy launders.
 *
 * So: a guarded route is not as strong as no route. The editor now lives in the
 * admin console (http://127.0.0.1:60721/admin/ → 內容管理), whose vite server
 * BINDS loopback and refuses to start with a non-loopback --host, so there is
 * no front door to launder anything through. Here, every verb — GET included —
 * gets a flat 404, so a re-added proxy entry still cannot reach :8787.
 *
 * `req.socket.remoteAddress` ONLY, kept for the log line: X-Forwarded-For /
 * X-Real-IP are supplied by the caller and are never consulted. There is NO
 * configureBuild/closeBundle hook: nothing here can exist in a production build.
 */
function contentApiGuard(): Plugin {
  const deny = (req: IncomingMessage, res: ServerResponse, _next: () => void): void => {
    // NOT next(): falling through would hand the request to whatever else is
    // mounted (a re-added proxy, most of all). 404 is terminal on purpose.
    const peer = isLoopback(req.socket.remoteAddress) ? "loopback" : "remote";
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      `no content-api on the game server (peer: ${peer}). ` +
        "Content editing lives in the admin console: http://127.0.0.1:60721/admin/",
    );
  };
  return {
    name: "ggd-content-api-guard",
    configureServer(server) {
      server.middlewares.use("/content-api", deny);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/content-api", deny);
    },
  };
}

/**
 * BUILD STAMP (task #66). Computed ONCE here, at config-evaluation time on the
 * build machine — never at runtime in the browser — and handed to the client as
 * `import.meta.env.VITE_BUILD_STAMP` via `define` below, so the bottom-pinned
 * VersionBadge makes every screenshot traceable to a build. git is the only
 * source consulted; when it is absent (no repo / git not installed / a shallow
 * export) the whole stamp degrades to "dev" rather than throwing.
 */
function computeBuildStamp(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    if (!sha) return "dev";
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${sha} ${date}`;
  } catch {
    return "dev";
  }
}

const BUILD_STAMP = computeBuildStamp();

// The voxel game client. In dev the client talks to the local game-server
// directly (ws://localhost:2567, override with VITE_GAME_WS); the /colyseus
// proxy below covers the platform-style same-origin path as well.
export default defineConfig({
  base: "/",
  // Bake the build stamp into the bundle as a literal (see computeBuildStamp).
  // The VersionBadge reads this; there is deliberately no runtime git call.
  define: {
    "import.meta.env.VITE_BUILD_STAMP": JSON.stringify(BUILD_STAMP),
  },
  // contentApiGuard FIRST: it must decide before vite's proxy middleware runs.
  // copyrightTierGate before the two content servers: it must refuse a public
  // peer before serveBlizzardOverlay / serveContent can read a restricted file.
  // serveBlizzardOverlay before serveContent: it owns the longer
  // /content/assets/blizzard-local prefix. (serveContent would `next()` on those
  // URLs anyway — the files are not in content/ — but the order documents it.)
  plugins: [
    react(),
    contentApiGuard(),
    copyrightTierGate(),
    serveIconConsoleStamp(),
    serveBlizzardOverlay(),
    serveContent(),
  ],
  server: {
    // fixed game port (user-pinned): http://localhost:39527
    port: 39527,
    strictPort: true,
    proxy: {
      "/colyseus": {
        target: "http://localhost:2567",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/colyseus/, ""),
      },
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true, // lobby WebSocket (/api/v1/lobby/ws) rides the same proxy
      },
      // DELIBERATELY NO "/content-api" ENTRY — see contentApiGuard() above.
      // This is the LAN-published server (`client-lan` = --host 0.0.0.0); a
      // proxy here would launder a phone's source address into a loopback peer
      // and hand it write access to content/. /api is safe to proxy precisely
      // because the Go platform never trusts an address: laundering it buys an
      // attacker nothing but the same 401 they already get.
    },
  },
  build: {
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
