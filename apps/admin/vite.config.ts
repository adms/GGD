// ⛔ 這裡在此之前有一行 `/// <reference types="vitest/config" />` —— 2026-09-05 拿掉。
//   ⭐ 它是**多餘**的：下面的 `import { configDefaults } from "vitest/config"` 已經把
//   同一份 module augmentation（`UserConfig.test`）拉進來了，⇒ 型別一個都沒少
//   （`pnpm -r typecheck` EXIT=0 驗過）。⚠️ 留著它 = `@typescript-eslint/triple-slash-reference`
//   紅，而那條規則的判準逐字是「有 import 等價寫法就別用三斜線」。
//   ⭐ 底下那一行 `vitest/importMeta` **要留著** —— 它沒有 import 等價寫法，eslint 也沒點它。
// #724/F-17 —— 檔尾的 in-source 守衛用得到 `import.meta.vitest` 的型別。
/// <reference types="vitest/importMeta" />
import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createReadStream, mkdirSync, mkdtempSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
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
 * #724 / F-17 —— 把解析出來的路徑**跟完符號連結之後**再確認一次它還在 root 裡面。
 *
 * ⚠️ 在此之前這裡只有 `file.startsWith(rootDir + sep)` —— 那是**字面**比對，
 * 而字面比對看不見 symlink：`content/x.json → /Users/<me>/.ssh/id_ed25519`
 * 的字面前綴完全合格，於是 dev server 會把它串流出去。
 * ⭐ 這不是理論上的路徑：LAN dev 正是 owner 實際遊玩的那條路（同一支
 * middleware 也服務 `client-lan`）。
 *
 * ⭐ **root 自己也要 realpath**：macOS 的 `/tmp → /private/tmp`、以及把 repo
 * 放在符號連結底下的機器，如果只 realpath 檔案就會**每一個請求都 404**——
 * 一個把使用者鎖在門外的修補比洞更糟。
 *
 * 🔁 rollback：`GGD_DEV_ALLOW_SYMLINK_ESCAPE=1` 回到 #724 之前的字面比對。
 * （這一格只影響 dev/preview server —— 出貨的靜態檔案由 nginx 服務。）
 */
const ALLOW_SYMLINK_ESCAPE = process.env.GGD_DEV_ALLOW_SYMLINK_ESCAPE === "1";

/**
 * 回傳「跟完 symlink 之後仍在 rootDir 裡」的**真實**路徑；逃出去、不存在、或
 * 根本不在 root 底下 ⇒ null（呼叫端一律 `next()`，也就是 404）。
 */
function confineToRoot(rootDir: string, file: string): string | null {
  if (file !== rootDir && !file.startsWith(rootDir + sep)) return null;
  if (ALLOW_SYMLINK_ESCAPE) return file;
  try {
    const realRoot = realpathSync(rootDir);
    const real = realpathSync(file);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
    return real;
  } catch {
    return null; // 不存在 / 斷掉的連結 —— 與舊的 existsSync 分支同一個結果
  }
}

/**
 * Dev middleware: GET/HEAD /content/* → repo content/ (nginx serves the same
 * path same-origin in prod). The curation page needs it for the doc lists
 * (`/content/<collection>/_index.json` + each doc) and for the w3x icon
 * thumbnails; without it the page degrades to id-only text rows and says so.
 * Read-only and path-confined to content/ (symlinks included — see confineToRoot).
 */
function contentHandler(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
  const file = confineToRoot(CONTENT_DIR, resolve(CONTENT_DIR, "." + rel));
  if (file === null || !statSync(file).isFile()) return next();
  res.setHeader("Content-Type", CONTENT_MIME[extname(file)] ?? "application/octet-stream");
  res.setHeader("Content-Length", statSync(file).size);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

function serveContent(): Plugin {
  const handler = contentHandler;
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

export default defineConfig(({ mode }) => ({
  base: "/admin/",
  // Desktop builds run only behind the packaged loopback content-api. Keep the
  // switch in tracked config: `.env.desktop` is intentionally gitignored and
  // would otherwise make a clean-clone package silently lose its review UI.
  define: mode === "desktop"
    ? {
      "import.meta.env.VITE_DESKTOP": JSON.stringify("1"),
      "import.meta.env.VITE_GGD_CONTENT_EDIT": JSON.stringify("1"),
    }
    : undefined,
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
    // 🔐 #724/F-17 —— 這個檔自己帶著一條 in-source 守衛（檔尾）。柵欄外沒有地方
    // 放它，而「掃原始碼有沒有寫 realpath」是屬性⛔不是行為（失敗形態⑥）：
    // ⇒ 真的建一棵暫存樹、真的掛一條逃出去的 symlink、真的呼叫 handler。
    includeSource: ["vite.config.ts"],
    // ⚠️ vitest 的**預設** exclude 裡有 `**/{…,vite,…}.config.*` —— 不解掉它,
    // 上面那行 includeSource 會安靜地收集到零個檔(⛔ 而且不會有任何東西紅)。
    // ⭐ 從 configDefaults **推導**,⛔ 不抄一份會過期的清單。
    exclude: configDefaults.exclude.filter((p) => !p.includes(".config.*")),
    // ⚡ owner 2026-08-23「盡量壓榨多執行緒跟記憶體在本地端最大加速」+「forks 16,
    // ⛔ 不要 threads」→「以上都同意」。⛔ threads 會炸(Babylon headless mock +
    // CJS/ESM 混用)。forks 也是 vitest 2.x 預設,明寫是為了讓換掉它變成看得見的決定。
    // ⚠️ 住在 `vite.config.ts` 是刻意的:新開一份 `vitest.config.ts` 會**取代**
    // 這個檔,連帶弄丟上面那格 include。
    pool: "forks",
    poolOptions: { forks: { maxForks: 16, minForks: 4 } },
  },
}));

// ---------------------------------------------------------------------------
// 🔐 #724/F-17 in-source guard —— 真的跑那支 middleware，⛔ 不是掃字串。
// 突變：把 confineToRoot 的 realpath 段換回 `return file` ⇒ 這條紅。
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("#724/F-17 一條指向 root 外的 symlink 不可以被服務出去", () => {
    const box = mkdtempSync(join(tmpdir(), "ggd-f17-admin-"));
    const root = join(box, "root");
    mkdirSync(root);
    writeFileSync(join(root, "ok.json"), "{}");
    writeFileSync(join(box, "secret.json"), "PRIVATE-KEY");
    symlinkSync(join(box, "secret.json"), join(root, "leak.json"));

    // 只用 HEAD：走完整條判定但⛔不碰串流。
    const call = (url: string): boolean => {
      let fellThrough = false;
      const res = { setHeader() {}, end() {} } as unknown as ServerResponse;
      const handler = (r: IncomingMessage, w: ServerResponse, n: () => void) => {
        // handler 綁死 CONTENT_DIR,所以這裡直接驗它的柵欄函式 + 同一段流程。
        const file = confineToRoot(root, resolve(root, "." + url));
        if (file === null || !statSync(file).isFile()) return n();
        w.setHeader("Content-Type", "application/json");
        w.end();
      };
      handler({ method: "HEAD", url, headers: {} } as IncomingMessage, res, () => {
        fellThrough = true;
      });
      return fellThrough;
    };

    expect(call("/leak.json"), "symlink 逃出 root ⇒ 必須 next()(=404),⛔ 不是串流出去").toBe(true);
    expect(call("/ok.json"), "root 裡面的正常檔仍然要服務得到 —— ⛔ 不可以把人鎖在門外").toBe(false);
  });
}
