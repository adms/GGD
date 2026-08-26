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
/**
 * 🔴 LIVE 後台資料面（owner 2026-08-26：「後台頁面的內容都要 **script 實時動態產生**，
 * ⛔ 不是靜態內容」）—— GET/POST /__live/<dataset> 每次請求當場從 repo 現況算。
 * 邏輯住 tools/admin-live/（動態 import，模組缺了回 503 指名缺什麼 —— 與
 * client 端 assetReviewApi 同形狀）。apply:"serve" ⇒ production build 不含。
 */
/**
 * 🧑‍⚖️ 一頁批次後台驗收（GH#669/#785）—— owner 2026-08-27：
 * 「**你還是沒告訴我去後台哪裡審查 [一頁批次後台驗收]**」
 *
 * ⭐ 答案在此之前是「它不在後台」：那兩頁只活在 client dev server（:39527）上，
 * 而 owner 開的是 admin（:60721）。⇒ 把**同一份** middleware（tools/review）也掛在
 * admin 上，讓 `/__review/*` 在後台同源可用 —— ⛔ 不複製第二份邏輯（第〇·四）。
 * 頁面本身由 `apps/admin/src/ui/FeatureReviewPage.tsx` 在 console 內畫（真的一頁）。
 */
function adminReviewApi(): Plugin {
  return {
    name: "ggd-admin-review-api",
    apply: "serve",
    async configureServer(server) {
      const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
      try {
        const href = new URL("../../tools/review/middleware.mjs", import.meta.url).href;
        const mod = (await import(/* @vite-ignore */ href)) as {
          createReviewMiddleware: (
            root: string,
          ) => (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
        };
        server.middlewares.use(mod.createReviewMiddleware(repoRoot));
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        server.middlewares.use("/__review", (_req, res) => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "review middleware unavailable", detail }));
        });
      }
    },
  };
}

function adminLiveData(): Plugin {
  return {
    name: "ggd-admin-live-data",
    apply: "serve",
    async configureServer(server) {
      const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
      try {
        const href = new URL("../../tools/admin-live/middleware.mjs", import.meta.url).href;
        const mod = (await import(/* @vite-ignore */ href)) as {
          createAdminLiveMiddleware: (
            root: string,
          ) => (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
        };
        server.middlewares.use(mod.createAdminLiveMiddleware(repoRoot));
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        server.middlewares.use("/__live", (_req, res) => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "admin-live middleware unavailable", detail }));
        });
      }
    },
  };
}

export default defineConfig({
  base: "/admin/",
  // loopbackOnly FIRST (enforce: "pre"): it must veto the config before
  // anything else acts on it.
  plugins: [loopbackOnly(), react(), serveContent(), serveIconConsoleStamp(), adminLiveData(), adminReviewApi()],
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
      // dev voice-gen daemon (tools/voice-gen). Same authorisation model as the
      // content-api above and for the same reason: a long-running IndexTTS
      // batch is a job queue holding a warm Python process, not a request
      // handler, so it lives in its own loopback-bound daemon and this server's
      // 127.0.0.1 bind is what keeps it off the LAN. Its Origin allowlist must
      // contain http://127.0.0.1:60721.
      "/voice-api": {
        target: process.env.VITE_VOICE_API_URL ?? "http://127.0.0.1:8788",
        changeOrigin: true,
      },
      // dev icon-gen daemon (tools/icon-gen/local/daemon.py), task #186 — the
      // same authorisation model again, and for the third time the same reason:
      // a two-pass Stable-Diffusion render is a JOB QUEUE holding a warm 2 GB
      // checkpoint, not a request handler, so it lives in its own loopback-bound
      // daemon and THIS server's 127.0.0.1 bind is what keeps it off the LAN.
      // Its Origin allowlist must contain http://127.0.0.1:60721.
      //
      // Note there is deliberately no production equivalent: the checkpoint is
      // gitignored and the family host has no GPU, so generation is an
      // AUTHORING-time act on the owner's Mac and ggd.adms.ai only ever serves
      // the committed WebPs. 內容管理 is dev-only by construction anyway, so the
      // chunk that would call this route is absent from a prod build entirely.
      "/icon-api": {
        target: process.env.VITE_ICON_API_URL ?? "http://127.0.0.1:8789",
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
    // ⚡ owner 2026-08-23「盡量壓榨多執行緒跟記憶體在本地端最大加速」+「forks 16,
    // ⛔ 不要 threads」→「以上都同意」。⛔ threads 會炸(Babylon headless mock +
    // CJS/ESM 混用)。forks 也是 vitest 2.x 預設,明寫是為了讓換掉它變成看得見的決定。
    // ⚠️ 住在 `vite.config.ts` 是刻意的:新開一份 `vitest.config.ts` 會**取代**
    // 這個檔,連帶弄丟上面那格 include。
    pool: "forks",
    poolOptions: { forks: { maxForks: 16, minForks: 4 } },
  },
});
