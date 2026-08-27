/// <reference types="vitest/config" />
// #724/F-17 —— 檔尾的 in-source 守衛用得到 `import.meta.vitest` 的型別。
/// <reference types="vitest/importMeta" />
import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";
// task #101: live digests of the icon style-spec sources, so the asset console
// can prove its one snapshotted section is current (dev/preview only).
import { serveIconConsoleStamp } from "./dev/iconConsoleStamp";
// task #66 / P0-6(a): env-first, git-second, LOUD-third build stamp resolution.
import { computeBuildStamp } from "./dev/buildStamp";

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
  // The AI-generated icon set ships as 128² WebP (tools/icon-gen/convert-webp.mjs).
  // Prod nginx picks image/webp up from the stock mime.types; this dev server has
  // no such table, so without this entry every icon is served as
  // application/octet-stream over `client-lan` — the path the owner actually plays on.
  ".webp": "image/webp",
  ".json": "application/json",
  ".wav": "audio/wav",
  // BGM is MP3. Web Audio's decodeAudioData ignores the content type, so the
  // game never needed this — but a plain <audio> element (the BGM audition
  // page, /bgm-audition.html) does: served as application/octet-stream some
  // browsers refuse to play it. nginx already sends audio/mpeg in prod.
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/**
 * ---- DEV/PREVIEW COMPRESSION (the LAN path the owner actually plays on) ------
 *
 * vite has NO compression in the dev server at all — `compression()` exists only
 * inside `preview()` (vite 5.4.21, dist/node/chunks/dep-*.js), and even in
 * preview it is registered AFTER this plugin's middleware, so /content/** would
 * never reach it. Verified live against the running :39527 dev server:
 * a champion .glb came back at its full uncompressed size with no
 * Content-Encoding even though the request advertised `gzip, deflate, br, zstd`.
 *
 * So the negotiation lives here, in the handler that actually serves the bytes.
 * MEASURED on this repo: 163 .glb 36,525,948 → 19,518,292 B (gzip -9 sidecars);
 * live against this very handler, knight.glb 1,103,872 → 391,665 B on the fly
 * and the 279 app source modules 6,762,605 → 2,410,119 B. Over wifi that is the
 * whole game's load time.
 *
 * Extensions NOT listed here are already-compressed containers (mp3, ogg, png,
 * webp) — measured on this repo's own files, gzip buys 1.0 % on mp3 and 0.4 %
 * on png, and one png actually got BIGGER. Compressing them is pure CPU.
 */
const COMPRESSIBLE_EXT = new Set([".glb", ".gltf", ".json", ".wav", ".svg", ".txt", ".wasm"]);
/** Below this, the gzip header costs more than the saving (measured: 22 content docs under 256 B went 3,924 → 3,704 B, 9 of them GREW). */
const COMPRESS_MIN_BYTES = 256;
/** On-the-fly level. -6 is the point where extra CPU stops buying bytes on glb. */
const GZIP_LEVEL = 6;
/** Do not hold a >16 MB source in memory to compress it; stream it raw instead. */
const COMPRESS_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
/** Compressed-body cache: a champion glb costs ~120 ms of CPU to gzip, and a match re-requests the same handful of models constantly. */
const COMPRESSED_CACHE_MAX_BYTES = 64 * 1024 * 1024;

type CachedBody = { body: Buffer; mtimeMs: number; size: number };
const compressedCache = new Map<string, CachedBody>();
let compressedCacheBytes = 0;

function rememberCompressed(file: string, stat: Stats, body: Buffer): void {
  if (body.length > COMPRESSED_CACHE_MAX_BYTES) return;
  // FIFO eviction — Map preserves insertion order. Good enough: the working set
  // is a few dozen models, not an unbounded stream of distinct URLs.
  while (compressedCacheBytes + body.length > COMPRESSED_CACHE_MAX_BYTES) {
    const oldest = compressedCache.keys().next();
    if (oldest.done === true) break;
    const evicted = compressedCache.get(oldest.value);
    compressedCache.delete(oldest.value);
    compressedCacheBytes -= evicted?.body.length ?? 0;
  }
  compressedCache.set(file, { body, mtimeMs: stat.mtimeMs, size: stat.size });
  compressedCacheBytes += body.length;
}

/** Encodings the client will accept, honouring an explicit `;q=0` refusal. */
function acceptedEncodings(req: IncomingMessage): Set<string> {
  const accepted = new Set<string>();
  for (const part of String(req.headers["accept-encoding"] ?? "").split(",")) {
    const [token, ...params] = part.trim().split(";");
    const name = (token ?? "").toLowerCase();
    if (name === "") continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (q !== undefined && Number(q.slice(2)) === 0) continue;
    accepted.add(name);
  }
  return accepted;
}

/**
 * A precompressed sidecar written by nginx/precompress.sh, IF it is not stale.
 * The mtime check is the whole point: a regenerated .glb next to a stale
 * .glb.gz would otherwise serve the OLD model to every gzip-capable client and
 * the new one only to clients that refuse gzip — a divergence that is very hard
 * to see. Stale ⇒ ignored, and we fall back to compressing on the fly.
 */
function freshSidecar(rootDir: string, file: string, suffix: string, stat: Stats): { path: string; size: number } | null {
  // #724/F-17 —— sidecar 也要過同一道柵欄：`foo.glb.gz` 自己就可以是一條
  // 指向 root 外的 symlink，而它跟本體走的是**不同**的解析路徑。
  const path = confineToRoot(rootDir, file + suffix);
  if (path === null) return null;
  const side = statSync(path);
  if (!side.isFile() || side.mtimeMs < stat.mtimeMs) return null;
  return { path, size: side.size };
}

/**
 * #724 / F-17 —— 把解析出來的路徑**跟完符號連結之後**再確認一次它還在 root 裡面。
 *
 * ⚠️ 在此之前這裡只有 `file.startsWith(rootDir + sep)` —— 那是**字面**比對，
 * 而字面比對看不見 symlink：`content/x.json → ~/.ssh/id_ed25519` 的字面前綴
 * 完全合格，於是 dev server 會把它串流出去。
 * ⭐ 這不是理論上的路徑：`client-lan`（`--host`）正是 owner 實際遊玩的那條路，
 * 所以這支 middleware 對整個區網開著。
 *
 * ⭐ **root 自己也要 realpath**：macOS 的 `/tmp → /private/tmp`、以及把 repo
 * 或 `data/blizzard-overlay/` 放在符號連結底下的機器，如果只 realpath 檔案就會
 * **每一個請求都 404** —— 一個把使用者鎖在門外的修補比洞更糟。
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
  if (ALLOW_SYMLINK_ESCAPE) return existsSync(file) ? file : null;
  try {
    const realRoot = realpathSync(rootDir);
    const real = realpathSync(file);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
    return real;
  } catch {
    return null; // 不存在 / 斷掉的連結 —— 與舊的 existsSync 分支同一個結果
  }
}

/** GET/HEAD static file handler rooted at `rootDir` (path-traversal safe). */
function staticHandler(rootDir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
    const file = confineToRoot(rootDir, resolve(rootDir, "." + rel));
    if (file === null || !statSync(file).isFile()) return next();
    const stat = statSync(file);
    res.setHeader("Content-Type", CONTENT_MIME[extname(file)] ?? "application/octet-stream");
    // The IDENTITY size, always, whatever encoding we end up negotiating below.
    // apps/client/public/model-budget.html verifies its own freshness by HEADing
    // every shipping asset and comparing the served length against the bytes the
    // report recorded from disk. Once a response is compressed, Content-Length is
    // the COMPRESSED size and that comparison silently turns into ~163 false
    // "this report is stale" alarms (measured: knight.glb sidecar reports 391,665
    // against a recorded 1,103,872). Stating the raw size out of band keeps the
    // check meaningful instead of forcing the page to give up on it.
    res.setHeader("X-Raw-Length", String(stat.size));

    const compressible = COMPRESSIBLE_EXT.has(extname(file)) && stat.size >= COMPRESS_MIN_BYTES;
    // Vary goes on every compressible response, compressed or not, so a shared
    // cache never hands a gzip body to a client that asked for identity.
    if (compressible) res.setHeader("Vary", "Accept-Encoding");
    const accepted = compressible ? acceptedEncodings(req) : new Set<string>();

    // 1) Precompressed sidecar — zero CPU, best ratio (gzip -9 / brotli -11).
    //    Same artifacts nginx serves via gzip_static / brotli_static in prod.
    for (const [encoding, suffix] of [
      ["br", ".br"],
      ["gzip", ".gz"],
    ] as const) {
      if (!accepted.has(encoding)) continue;
      const sidecar = freshSidecar(rootDir, file, suffix, stat);
      if (sidecar === null) continue;
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Content-Length", sidecar.size);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(sidecar.path).pipe(res);
      return;
    }

    // 2) Compress on the fly. GET only: HEAD is used solely as an existence
    //    probe here (render/AssetManager.ts checks `res.ok`, never the length),
    //    so it is not worth spending CPU to answer one.
    if (compressible && req.method === "GET" && accepted.has("gzip") && stat.size <= COMPRESS_MAX_SOURCE_BYTES) {
      res.setHeader("Content-Encoding", "gzip");
      const hit = compressedCache.get(file);
      if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
        res.setHeader("Content-Length", hit.body.length);
        res.end(hit.body);
        return;
      }
      const gzipStream = createGzip({ level: GZIP_LEVEL });
      const chunks: Buffer[] = [];
      gzipStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      gzipStream.on("end", () => rememberCompressed(file, stat, Buffer.concat(chunks)));
      gzipStream.pipe(res);
      createReadStream(file).pipe(gzipStream);
      return;
    }

    // 3) Identity — already-compressed formats, HEAD, and clients without gzip.
    res.setHeader("Content-Length", stat.size);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}

/**
 * Compress the JS/CSS modules VITE ITSELF serves (dev only).
 *
 * staticHandler above owns /content/**; this owns the other half of a cold LAN
 * load — the transformed source modules and the prebundled deps, which vite
 * sends completely uncompressed (verified: /src/main.tsx → 16,638 B, no
 * Content-Encoding). vite's own `compression()` exists only in `preview()`.
 *
 * MOUNTS, not a global wrapper. These five prefixes are the ones vite's
 * transform / raw-fs / static middlewares answer, and none of them is proxied
 * (/api and /colyseus go to the platform and Colyseus and must never be touched
 * — a wrapped proxy response would break the lobby WebSocket and any streaming
 * body). Registration order is what makes this work at all: vite runs
 * `configureServer` hooks BEFORE it installs transformMiddleware
 * (dist/node/chunks/dep-BK3b2jBa.js:63337 vs :63375), so patching the response
 * here happens upstream of the code that writes it.
 */
const DEV_COMPRESS_MOUNTS = ["/src", "/@fs", "/@id", "/@vite", "/node_modules"] as const;
/** Only these content types. Everything else — images, audio, fonts — passes through untouched. */
const DEV_COMPRESS_TYPE = /\b(javascript|json|css|html|plain|svg\+xml|wasm)\b/;

function compressDevModules(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (!acceptedEncodings(req).has("gzip")) return next();

    const rawWriteHead = res.writeHead.bind(res);
    const rawWrite = res.write.bind(res);
    const rawEnd = res.end.bind(res);
    let gzipStream: ReturnType<typeof createGzip> | null = null;
    let decided = false;

    /** Called at the last moment before the first byte, when the headers are final. */
    const decide = (): void => {
      if (decided) return;
      decided = true;
      const type = String(res.getHeader("Content-Type") ?? "");
      const declared = Number(res.getHeader("Content-Length") ?? "0");
      if (
        res.statusCode !== 200 || // 204/304/errors have no body worth touching
        res.getHeader("Content-Encoding") !== undefined || // never double-encode
        res.getHeader("Content-Range") !== undefined || // range responses must stay byte-exact
        !DEV_COMPRESS_TYPE.test(type) ||
        (declared > 0 && declared < COMPRESS_MIN_BYTES)
      ) {
        return;
      }
      res.removeHeader("Content-Length"); // length changes → chunked
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      gzipStream = createGzip({ level: GZIP_LEVEL });
      gzipStream.on("data", (chunk: Buffer) => rawWrite(chunk));
      gzipStream.on("end", () => rawEnd());
    };

    res.writeHead = ((status: number, ...rest: unknown[]) => {
      // writeHead(status, [reason], [headers]) — stage any inline headers onto
      // the response so decide() sees the real Content-Type, then flush.
      const headers = rest.find((r) => typeof r === "object" && r !== null);
      if (headers !== undefined) {
        for (const [key, value] of Object.entries(headers as Record<string, number | string | string[]>)) {
          res.setHeader(key, value);
        }
      }
      res.statusCode = status;
      decide();
      return rawWriteHead(status);
    }) as typeof res.writeHead;

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      decide();
      if (gzipStream === null) return (rawWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
      return gzipStream.write(chunk as Buffer);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      decide();
      if (gzipStream === null) return (rawEnd as (...a: unknown[]) => ServerResponse)(chunk, ...rest);
      if (chunk !== undefined && typeof chunk !== "function") gzipStream.end(chunk as Buffer);
      else gzipStream.end();
      return res;
    }) as typeof res.end;

    next();
  };

  return {
    name: "ggd-compress-dev-modules",
    apply: "serve", // dev only: `vite preview` already runs vite's own compression()
    configureServer(server) {
      for (const mount of DEV_COMPRESS_MOUNTS) server.middlewares.use(mount, middleware);
    },
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

/*
 * RETIRED: copyrightTierGate() (task #127, removed by #239 on 2026-07-26).
 *
 * A `ggd-copyright-tier-gate` plugin used to sit here and 403 two mounts —
 * /content/assets/models/imported and the blizzard-local overlay — for any peer
 * that @ggd/shared/envTier classified as `public`, mirroring the nginx gate.
 * Both halves are gone, by explicit owner decision made AFTER being shown that
 * static /content/assets/** authenticates nobody: the invite code (#174) and
 * the approval queue (#126) gate registration and the platform API, not bytes.
 * The prod gate was also topologically dead — see nginx/nginx.conf's
 * $ggd_env_tier block and docs/copyright-content-gate.md.
 *
 * Do not re-add this as a bug fix. Removing it makes `client-lan --host 0.0.0.0`
 * behave the same way the deployed edge does, which is the point.
 *
 * classifyEnvTier itself is still very much alive — apps/client/src/ui/cheats.ts
 * uses it to keep the 🐞 cheat button loopback-only — so envTier.ts and its
 * 46-case table test stay exactly as they are.
 */

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
 * ASSET-REVIEW API (GH#664) — dev-only wiring for public/asset-review.html.
 *
 * The queue/ledger logic lives OUTSIDE this app, in tools/review/middleware.mjs
 * (the cross-lane contract: GET /__review/queue, POST /__review/verdict writing
 * docs/_review/approvals.json). It is imported DYNAMICALLY at configureServer
 * time so this config never hard-depends on it: if the module is missing or
 * throws, the routes answer 503 with a JSON body naming exactly what is absent
 * — the review page renders that message instead of a white screen.
 *
 * `apply: "serve"` + configureServer: this cannot exist in a production build,
 * and nothing under tools/ is ever bundled.
 */
const REVIEW_ROUTE_PREFIX = "/__review";

function assetReviewApi(): Plugin {
  return {
    name: "ggd-asset-review-api",
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
        server.middlewares.use(REVIEW_ROUTE_PREFIX, (_req, res) => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "review middleware unavailable",
              detail,
              hint:
                "tools/review/middleware.mjs（GH#664 的跨 lane 契約）尚未落地或載入失敗；" +
                "asset-review.html 需要它供應 /__review/queue 與 /__review/verdict。",
            }),
          );
        });
      }
    },
  };
}

/**
 * VFX-SCRIPT STUDIO API (GH#838) — dev-only wiring for public/vfx-script-studio.html.
 * 與上面的 assetReviewApi 同一個模式：路由邏輯住 tools/vfx-forge/middleware.mjs
 * （動態 import；缺席 ⇒ 503 指名），`apply:"serve"` ⇒ 出貨 build 不存在這條路。
 */
const VFXSTUDIO_ROUTE_PREFIX = "/__vfxstudio";

function vfxStudioApi(): Plugin {
  return {
    name: "ggd-vfx-studio-api",
    apply: "serve",
    async configureServer(server) {
      const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
      try {
        const href = new URL("../../tools/vfx-forge/middleware.mjs", import.meta.url).href;
        const mod = (await import(/* @vite-ignore */ href)) as {
          createVfxStudioMiddleware: (
            root: string,
          ) => (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
        };
        server.middlewares.use(mod.createVfxStudioMiddleware(repoRoot));
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        server.middlewares.use(VFXSTUDIO_ROUTE_PREFIX, (_req, res) => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "vfx studio middleware unavailable",
              detail,
              hint: "tools/vfx-forge/middleware.mjs（GH#838）尚未落地或載入失敗；vfx-script-studio.html 需要它供應 /__vfxstudio/*。",
            }),
          );
        });
      }
    },
  };
}

/**
 * BUILD STAMP (task #66). Computed ONCE here, at config-evaluation time on the
 * build machine — never at runtime in the browser — and handed to the client as
 * `import.meta.env.VITE_BUILD_STAMP` via `define` below, so the bottom-pinned
 * VersionBadge makes every screenshot traceable to a build.
 *
 * THE RULES NOW LIVE IN ./dev/buildStamp (and are unit tested there). The short
 * version, because it was a real production defect (P0-6(a)): git is NOT the
 * only source any more. A container has neither `.git` (excluded by
 * .dockerignore) nor a git binary (node:22-alpine), so asking git alone made
 * EVERY image bake the plausible-looking string "dev" — two different images on
 * ggd.adms.ai were indistinguishable, which defeats the badge entirely. The
 * host now threads `GGD_BUILD_STAMP` in as a docker build arg, and when nothing
 * can identify the build the stamp is a LOUD `UNSTAMPED-BUILD` instead.
 */
const BUILD_STAMP = computeBuildStamp();

/**
 * THE DEV BADGE HAD NO BUILD IDENTITY AT ALL (playtest P8, 2026-07-24).
 *
 * `define` above is a COMPILE-TIME substitution — and in SERVE mode vite owns
 * `import.meta.env` and synthesizes it per request, so a define keyed on
 * `import.meta.env.VITE_BUILD_STAMP` is simply not applied there. MEASURED
 * against this very server: the VersionBadge read `undefined` and fell back to
 * "dev", so every dev screenshot was untraceable — the exact thing #66 exists
 * to prevent. (Compounding it, `computeBuildStamp()` runs exactly ONCE, when
 * vite evaluates this config, so even where the define does land it freezes on
 * the sha and date the server booted with.)
 *
 * The fix cannot be another `define` — nothing re-evaluates one short of a
 * restart. So in DEV ONLY the stamp becomes a tiny live endpoint: one git call
 * per poll, on the dev machine, answered fresh. `apply: "serve"` means it does
 * not exist in a production build or in `vite preview`, where the baked literal
 * is correct by construction (the build and the stamp are the same act) and a
 * stale sha is a true report of a stale artifact rather than a bug.
 */
const BUILD_STAMP_ROUTE = "/__ggd-build-stamp";

function liveBuildStamp(): Plugin {
  const handler = (_req: IncomingMessage, res: ServerResponse): void => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    // Quiet: the badge polls every 15 s, and one provenance line per poll would
    // drown the dev log. The banner already fired once at config evaluation.
    res.end(computeBuildStamp(process.env, () => undefined));
  };
  return {
    name: "ggd-live-build-stamp",
    apply: "serve", // dev only — a built bundle's baked stamp is already exact
    configureServer(server) {
      server.middlewares.use(BUILD_STAMP_ROUTE, handler);
    },
  };
}

/**
 * THE AUDITION/DEBUG PAGES MUST NOT BE IN A PRODUCTION BUNDLE (F-16 / GH#83).
 *
 * `apps/client/public/` holds 14 hand-written audition/debug pages
 * (bgm-audition, model-budget, frame-data, w3x-emitter-audition, …). They are
 * genuinely useful ON A DEV MACHINE — that is why they live in `public/`, where
 * the dev server hands them out for free. But vite copies `public/` VERBATIM
 * into `dist/`, `docker/edge.Dockerfile` copies `dist/` verbatim into the image,
 * and nginx's `try_files $uri` serves any real file it finds. Three hops, none
 * of them filtering, and the pages end up publicly served on ggd.adms.ai.
 *
 * That is not a tidiness complaint. Those pages render data fetched from
 * `/content` through `innerHTML = <template literal>` — 45 such sinks across the
 * set — and nginx's CSP has `frame-ancestors 'none'` and NO `script-src`
 * (F-15), so anything injected there executes with the site's origin. They have
 * zero value to a player.
 *
 * WHY THE RULE IS "EVERY .html EXCEPT index.html" AND NOT A LIST OF 14 NAMES.
 * The set grew from 5 (at the audit) to 14 without anyone noticing, which is
 * exactly what a name list cannot survive — page #15 would ship. `index.html` is
 * the ONLY html the game needs: it is vite's entry, emitted from the package
 * root, not copied from `public/`. So the shipping set is a closed set of one,
 * and every other top-level html in the output is by construction a debug page.
 *
 * THE ESCAPE HATCH IS AN ENV VAR, NOT A CODE EDIT (第一守則): set
 * `GGD_INCLUDE_DEBUG_PAGES=1` on the build to keep them — the same shape as
 * `GGD_INCLUDE_EDITOR` in docker/edge.Dockerfile, which gates /editor/ the same
 * way. Default 0: shipping them has to be a decision somebody typed.
 *
 * ⚠️ This strips the BUILD output only (`apply: "build"`). `pnpm dev` still
 * serves all 14 from `public/` — the pages keep working where they are used.
 * `vite preview` serves `dist/`, so it sees the stripped set; that is correct,
 * preview exists to show what the image will contain.
 */
const DEBUG_PAGES_ENV = "GGD_INCLUDE_DEBUG_PAGES";

/** The one html a player's browser actually loads (vite's entry). */
const SHIPPING_HTML = "index.html";

/** Opt back in to shipping the debug pages. Anything but 1/true means "no". */
export function includeDebugPages(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[DEBUG_PAGES_ENV] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/**
 * Which of `names` (one directory listing of the build output) are debug pages.
 * Pure, so the guard can assert the RULE without running a 3-minute build.
 */
export function debugPagesToStrip(names: readonly string[]): string[] {
  return names.filter((n) => n.toLowerCase().endsWith(".html") && n !== SHIPPING_HTML).sort();
}

function stripDebugPages(): Plugin {
  let outDir = "";
  return {
    name: "ggd-strip-debug-pages",
    apply: "build", // dev/serve keeps every page; this is about the ARTEFACT
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // closeBundle, not generateBundle: these files are never part of the rollup
    // bundle at all — vite copies publicDir into outDir as a separate step, so
    // the only moment they exist to be removed is after the write is finished.
    closeBundle() {
      if (!existsSync(outDir)) return;
      const found = debugPagesToStrip(readdirSync(outDir));
      if (found.length === 0) return;
      if (includeDebugPages()) {
        // LOUD on purpose (第二守則: a fail-open needs someone to say so). This
        // build is publishing debug pages because an operator asked it to.
        console.warn(
          `[ggd] ${DEBUG_PAGES_ENV} is set — SHIPPING ${found.length} audition/debug page(s): ${found.join(", ")}`,
        );
        return;
      }
      for (const name of found) rmSync(resolve(outDir, name), { force: true });
      console.info(`[ggd] stripped ${found.length} audition/debug page(s) from the build output`);
    },
  };
}

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
  // (copyrightTierGate used to sit right after it, ahead of the two content
  // servers; retired by #239 — see the RETIRED note where it was defined.)
  // serveBlizzardOverlay before serveContent: it owns the longer
  // /content/assets/blizzard-local prefix. (serveContent would `next()` on those
  // URLs anyway — the files are not in content/ — but the order documents it.)
  plugins: [
    react(),
    contentApiGuard(),
    assetReviewApi(),
    vfxStudioApi(),
    liveBuildStamp(),
    serveIconConsoleStamp(),
    // compressDevModules only wraps the /src, /@fs, /@id, /@vite and
    // /node_modules mounts, so it is independent of the ordering above; the
    // /content handlers do their own negotiation inside staticHandler.
    compressDevModules(),
    serveBlizzardOverlay(),
    serveContent(),
    // LAST: it only acts after the whole build output (including the verbatim
    // publicDir copy) has been written. See stripDebugPages / GH#83.
    stripDebugPages(),
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
    // 🔐 #724/F-17 —— 這個檔自己帶著一條 in-source 守衛（檔尾）。柵欄外沒有地方
    // 放它，而「掃原始碼有沒有寫 realpath」是屬性⛔不是行為（失敗形態⑥）：
    // ⇒ 真的建一棵暫存樹、真的掛一條逃出去的 symlink、真的呼叫 staticHandler。
    includeSource: ["vite.config.ts"],
    // ⚠️ vitest 的**預設** exclude 裡有 `**/{…,vite,…}.config.*` —— 不解掉它,
    // 上面那行 includeSource 會安靜地收集到零個檔(⛔ 而且不會有任何東西紅)。
    // ⭐ 從 configDefaults **推導**,⛔ 不抄一份會過期的清單。
    exclude: configDefaults.exclude.filter((p) => !p.includes(".config.*")),
    // ⚡ owner 2026-08-23「盡量壓榨多執行緒跟記憶體在本地端最大加速」+「forks 16,
    // ⛔ 不要 threads」→「以上都同意」。⛔ threads 會炸 —— 而這個套件正是理由本身:
    // Babylon 的 headless mock 與 CJS/ESM 混用都住在這裡。forks 也是 vitest 2.x
    // 預設,明寫是為了讓換掉它變成一個看得見的決定。
    // ⚠️ 這一格住在 `vite.config.ts` 而不是 `vitest.config.ts`,是刻意的:新開一份
    // `vitest.config.ts` 會**取代**這個檔,連帶弄丟下面那行 setupFiles(GH#384)。
    pool: "forks",
    poolOptions: { forks: { maxForks: 16, minForks: 4 } },
    // GH#384 —— 逐技能特效綁定住在 `content/`，所以測試也要有人把它交進來
    //（線上交它的是 `ContentDb.load()`）。理由寫在那支檔頭。
    setupFiles: ["./src/testSetup.vfxContent.ts"],
  },
});

// ---------------------------------------------------------------------------
// 🔐 #724/F-17 in-source guard —— 真的跑出貨的那支 staticHandler,⛔ 不是掃字串。
// 突變：把 confineToRoot 的 realpath 段換回 `return file` ⇒ 這條紅。
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("#724/F-17 一條指向 root 外的 symlink 不可以被服務出去", () => {
    const box = mkdtempSync(join(tmpdir(), "ggd-f17-client-"));
    const root = join(box, "root");
    mkdirSync(root);
    writeFileSync(join(root, "ok.json"), "{}");
    writeFileSync(join(box, "secret.json"), "PRIVATE-KEY");
    symlinkSync(join(box, "secret.json"), join(root, "leak.json"));

    const serve = staticHandler(root);
    // 只用 HEAD:走完整條判定但⛔不碰串流。
    const fellThrough = (url: string): boolean => {
      let nexted = false;
      const res = { setHeader() {}, end() {} } as unknown as ServerResponse;
      serve({ method: "HEAD", url, headers: {} } as unknown as IncomingMessage, res, () => {
        nexted = true;
      });
      return nexted;
    };

    expect(fellThrough("/leak.json"), "symlink 逃出 root ⇒ 必須 next()(=404),⛔ 不是串流出去").toBe(true);
    expect(fellThrough("/ok.json"), "root 裡面的正常檔仍然要服務得到 —— ⛔ 不可以把人鎖在門外").toBe(false);
  });
}
