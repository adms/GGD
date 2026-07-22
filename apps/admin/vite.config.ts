/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
// task #102: the console may only ever bind loopback — see the module header.
import { loopbackOnly } from "./src/dev/loopbackOnly";
// task #101's live freshness endpoint, IMPORTED rather than re-implemented: it
// hashes the Python sources the icon style spec was generated from, and the
// ICON 生成追蹤 page compares those digests against the ones the snapshot
// recorded. Without it here the page still renders — it just downgrades
// freshness to "unknown" and says so, which is the correct degraded state, but
// on the dev machine we can do better than "cannot tell".
// If #101 ever moves this module, THIS BUILD BREAKS — which is the failure we
// want, versus the page quietly displaying last week's art direction.
import { serveIconConsoleStamp } from "../client/dev/iconConsoleStamp";

const CONTENT_DIR = fileURLToPath(new URL("../../content", import.meta.url));

const CONTENT_MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".json": "application/json",
};

/**
 * Dev middleware: GET/HEAD /content/* → repo content/ (nginx serves the same
 * path same-origin in prod). The curation page needs it for the doc lists
 * (`/content/<collection>/_index.json` + each doc) and for the w3x icon
 * thumbnails; without it the page degrades to id-only text rows and says so.
 * Read-only and path-confined to content/.
 */
function serveContent(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
    const file = resolve(CONTENT_DIR, "." + rel);
    if (!file.startsWith(CONTENT_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
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
  return {
    name: "ggd-admin-serve-content",
    configureServer(server) {
      server.middlewares.use("/content", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/content", handler);
    },
  };
}

// The operations admin console. Served by nginx at /admin/ in prod (same-origin
// with /api, /editor/, /content); in dev it proxies /api to the local Go
// platform (default :8080, override VITE_PLATFORM_API_URL) and serves /content
// straight off the repo. The Console Hub's per-service URLs are configurable
// via VITE_* (see src/config.ts).
//
// TASK #102 — WHY THE CONTENT EDITOR LIVES HERE AND NOWHERE ELSE.
// `/content-api` reaches the dev content-api on 127.0.0.1:8787, which grants
// write authority to any LOOPBACK peer. That is only safe because THIS server
// binds 127.0.0.1 and loopbackOnly() makes `--host` fatal: a LAN device cannot
// open the socket, so it has nothing to launder its address through. The game
// client (LAN-published on :39527) deliberately has no such route — a guarded
// route is weaker than no route.
export default defineConfig({
  base: "/admin/",
  // loopbackOnly FIRST (enforce: "pre"): it must veto the config before
  // anything else acts on it.
  plugins: [loopbackOnly(), react(), serveContent(), serveIconConsoleStamp()],
  server: {
    // fixed ops-admin port (user-pinned): http://127.0.0.1:60721/admin/
    port: 60721,
    strictPort: true,
    // LOAD-BEARING, not a preference. Changing this — or overriding it with
    // --host — publishes unauthenticated content writes to the LAN.
    // loopbackOnly() throws rather than let that happen.
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.VITE_PLATFORM_API_URL ?? "http://localhost:8080",
        changeOrigin: true,
      },
      // dev content-api (apps/content-api). Same-origin, so the editor's Origin
      // is http://127.0.0.1:60721 — which the content-api's origin allowlist
      // must contain (guard.ts ALLOWED_ORIGINS).
      "/content-api": {
        target: process.env.VITE_CONTENT_API_URL ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    // the preview server inherits the same lock (loopbackOnly checks both)
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
