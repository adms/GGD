/**
 * 內容樹**讀一次**就好 —— 兩層快取（本機檔案 + Redis，TTL 24 小時）。
 *
 * owner 2026-08-23 逐字：
 * > 「大量重複IO的地方先讀取後合成暫存起來(Redis with lifetime 24HR)
 * >   不要每次都去大量抓檔案造成 storage 瓶頸與壽命縮短」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 量到的（2026-08-23，M-series，暖檔案快取）
 * ─────────────────────────────────────────────────────────────────────────────
 *   `new ContentLoader(new FsContentSource(content)).load()`  = 1 manifest
 *   + 14 份 `_index.json` + **1,712 份文件 = 1,727 次 `readFile`**
 *
 *   | 段 | ms |
 *   |---|---:|
 *   | 1,727 次 readFile + JSON.parse | 168 |
 *   | 1,712 次 Zod `.parse()`        | 169 |
 *   | 合計（冷 352 / 暖 210）        | ~340 |
 *
 * ⇒ 快取存的是 **Zod 之後**的東西，所以兩段一起省掉。⛔ 只快取「檔案內容」
 *   （＝ `bundle.json` 已經在做的事）只省得到上面那一半。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 誰**不可以**走這一層
 * ─────────────────────────────────────────────────────────────────────────────
 * · `shippedBundleIsCurrent.test.ts`         —— 它的工作是抓「產物過期」
 * · `shippedBundleHasTrackedSources.test.ts` —— 它的工作是抓「來源沒進版控」
 * · `bundle.test.ts`                         —— 它在 temp 樹上重建打包器
 * 讀快取等於把 2026-08-01／08-02 兩次生產事故的閘拆了。
 * ⭐ 結構上擋住：這是一支**要自己 import 才會用到**的新函式，
 *   `ContentLoader` 一個位元組都沒改；而且 `rootDir` 不是出貨那棵樹時它直接退回。
 *   閘：`contentCache.test.ts` 的「那三支不可以 import 這個模組」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 開關（⭐ owner 2026-08-23：「留後台開關可以簡易 rollback」）
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 這是**建置期工具**的快取，⛔ 不是出貨的遊戲行為 —— 它不進
 * `content/config/*.json`（那三個住處是給玩家看得到的參數用的）。
 * 一鍵回頭是環境變數，預設值＝我挑的那個：
 *
 * | 變數 | 預設 | 意思 |
 * |---|---|---|
 * | `GGD_CONTENT_CACHE` | `auto` | `off` = ⛔ 整層關掉（rollback 就是這一格）· `file` = 只用本機檔案 · `redis` = 只用 Redis · `auto` = 兩層都用 |
 * | `GGD_CONTENT_CACHE_TTL_S` | `86400` | Redis TTL（owner 指名的 24 小時）與檔案層的過期線 |
 * | `REDIS_ADDR` / `REDIS_PASSWORD` | `127.0.0.1:6379` | 跟 platform / game-server 同一組（`apps/game-server/src/config/cluster.ts`） |
 * | `GGD_CONTENT_CACHE_DIR` | `node_modules/.cache/ggd-content` | ⛔ 不進 repo |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **唯一**一個量到的差別：`-0` 會變成 `0`
 * ─────────────────────────────────────────────────────────────────────────────
 * 快取走 JSON 序列化，而 `JSON.stringify(-0) === "0"`。
 * ⭐ 這**不是**新的漂移，而是**出貨已經在做的事**：
 *   · `content/bundle.json` 裡 `-0` 出現 **0 次**（它也是 JSON 序列化出來的）
 *     ⇒ 瀏覽器端從第一天起拿到的就是 `0`
 *   · `hashDoc()` 走 `stableStringify` ⇒ 內容定址層**本來就把兩者當同一份文件**
 *   · 產生器要把值寫回 JSON 時也一律 `JSON.stringify` ⇒ 寫出來一樣是 `0`
 * ⇒ 觀察得到差別的只剩 `Object.is(x, -0)` 與 `1/x === -Infinity`。
 * ⛔ 所以這裡**不**為了 `-0` 付一個 replacer/reviver 的代價（hydrate 27 → ~70 ms）。
 * 閘：`contentCache.test.ts` 逐份比對，而且**只**允許這一個差別 ——
 * 多冒出任何第二種差別（少一個鍵、Date 變字串…）就會紅。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { DanglingRefError } from "./../errors";
import { ContentLoader, type LoadResult, type QuarantineEntry } from "./../loader";
import { FsContentSource } from "./../node/FsContentSource";
import { COLLECTION_NAMES, isCollectionName, type CollectionName } from "./../schema/index";
import type { ContentLoadPolicy } from "./../schema/config";
import { ContentStore } from "./../store";
import type { Manifest } from "./../types";
import { CACHE_FORMAT, computeFingerprint, type Fingerprint } from "./fingerprint";
import { TinyRedis, parseRedisUrl, type RedisCacheOptions } from "./redis";

const HERE = dirname(fileURLToPath(import.meta.url));
/** repo 根（`packages/shared/src/content/cache` → 上五層）。 */
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const SHIPPED_CONTENT_DIR = join(REPO_ROOT, "content");

export type CacheMode = "auto" | "off" | "file" | "redis";
export type CacheHit = "miss" | "file" | "redis";

export interface CacheReport {
  mode: CacheMode;
  hit: CacheHit;
  key: string;
  fingerprint: Fingerprint;
  /** 序列化後的位元組數（gzip 後）。 */
  bytes: number;
  /** 每一段的 wall-clock（ms）。 */
  timings: { fingerprint: number; read: number; hydrate: number; load: number; write: number };
  /** ⚠️ 退回了就要出聲 —— 呼叫端負責印。 */
  notes: string[];
}

export type CachedLoadResult = LoadResult & { cache: CacheReport };

interface Payload {
  v: number;
  manifest: Manifest;
  policyUsed: ContentLoadPolicy;
  quarantined: QuarantineEntry[];
  /** `DanglingRefError` 的建構參數 —— 類別實例過不了 JSON，這裡存的是**造它的材料**。 */
  warnings: Array<[string, string, string, string, string]>;
  docs: Partial<Record<CollectionName, Record<string, unknown>>>;
}

function envMode(env: NodeJS.ProcessEnv): CacheMode {
  const raw = (env.GGD_CONTENT_CACHE ?? "auto").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return "off";
  if (raw === "file" || raw === "redis" || raw === "auto") return raw;
  return "auto";
}

function envTtlSeconds(env: NodeJS.ProcessEnv): number {
  const n = Number(env.GGD_CONTENT_CACHE_TTL_S);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400;
}

function cacheDir(env: NodeJS.ProcessEnv): string {
  return env.GGD_CONTENT_CACHE_DIR ?? join(REPO_ROOT, "node_modules/.cache/ggd-content");
}

/** `REDIS_ADDR` (`host:port`) ＋ `REDIS_PASSWORD`，或整條 `GGD_CONTENT_CACHE_REDIS_URL`。 */
export function redisOptionsFromEnv(env: NodeJS.ProcessEnv): RedisCacheOptions {
  const url = env.GGD_CONTENT_CACHE_REDIS_URL;
  if (url) {
    const parsed = parseRedisUrl(url);
    if (parsed) return parsed;
  }
  const addr = (env.REDIS_ADDR ?? "127.0.0.1:6379").trim();
  const idx = addr.lastIndexOf(":");
  const host = idx === -1 ? addr : addr.slice(0, idx);
  const port = idx === -1 ? 6379 : Number(addr.slice(idx + 1));
  return {
    host: host || "127.0.0.1",
    port: Number.isFinite(port) && port > 0 ? port : 6379,
    password: env.REDIS_PASSWORD || undefined,
  };
}

/** 快取鍵裡的「內容」那一半：⭐ 只有 loader 真的會讀的東西。 */
function contentPathspecs(): string[] {
  return [...COLLECTION_NAMES.map((c) => `content/${c}`), "content/manifest.json"];
}

export function contentCacheKey(
  env: NodeJS.ProcessEnv = process.env,
  policy: ContentLoadPolicy | "content" = "content",
): Fingerprint {
  return computeFingerprint({
    repoRoot: REPO_ROOT,
    contentPaths: contentPathspecs(),
    codePaths: ["packages/shared/src"],
    salt: `policy=${policy}`,
  });
}

// ── 序列化 ────────────────────────────────────────────────────────────────────

function dehydrate(r: LoadResult): Payload {
  const docs: Partial<Record<CollectionName, Record<string, unknown>>> = {};
  for (const c of COLLECTION_NAMES) {
    const ids = r.store.ids(c);
    if (ids.length === 0) continue;
    const byId: Record<string, unknown> = {};
    for (const id of ids) byId[id] = r.store.get(c, id);
    docs[c] = byId;
  }
  return {
    v: CACHE_FORMAT,
    manifest: r.manifest,
    policyUsed: r.policyUsed,
    quarantined: r.quarantined,
    warnings: r.warnings.map((w) => [
      w.fromCollection,
      w.fromId,
      w.field,
      w.targetCollection,
      w.targetId,
    ]),
    docs,
  };
}

function hydrate(p: Payload): LoadResult {
  const store = new ContentStore();
  for (const [name, byId] of Object.entries(p.docs)) {
    if (!isCollectionName(name) || !byId) continue;
    for (const [id, doc] of Object.entries(byId)) store.add(name, id, doc);
  }
  return {
    store,
    manifest: p.manifest,
    warnings: p.warnings.map((a) => new DanglingRefError(a[0], a[1], a[2], a[3], a[4])),
    quarantined: p.quarantined,
    policyUsed: p.policyUsed,
  };
}

/** gzip level 1 —— 2.4 MB → ~0.4 MB，代價個位數 ms。 */
function pack(p: Payload): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(p), "utf8"), { level: 1 });
}

function unpack(buf: Buffer): Payload | null {
  try {
    const p = JSON.parse(gunzipSync(buf).toString("utf8")) as Payload;
    return p.v === CACHE_FORMAT ? p : null;
  } catch {
    return null;
  }
}

// ── 檔案層 ────────────────────────────────────────────────────────────────────

function filePath(env: NodeJS.ProcessEnv, key: string): string {
  return join(cacheDir(env), `${key}.gz`);
}

function readFileLayer(env: NodeJS.ProcessEnv, key: string, ttlS: number): Buffer | null {
  const f = filePath(env, key);
  try {
    if (Date.now() - statSync(f).mtimeMs > ttlS * 1000) return null;
    return readFileSync(f);
  } catch {
    return null;
  }
}

function writeFileLayer(env: NodeJS.ProcessEnv, key: string, buf: Buffer, ttlS: number): void {
  const dir = cacheDir(env);
  try {
    mkdirSync(dir, { recursive: true });
    const target = filePath(env, key);
    const tmp = `${target}.tmp-${process.pid}`;
    writeFileSync(tmp, buf);
    renameSync(tmp, target);
    // ⭐ 順手掃掉過期的：鍵含內容雜湊 ⇒ 每次內容一動就多一份，⛔ 不掃會長到爆。
    const now = Date.now();
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".gz") || name === `${key}.gz`) continue;
      const p = join(dir, name);
      if (now - statSync(p).mtimeMs > ttlS * 1000) rmSync(p, { force: true });
    }
  } catch {
    /* 快取寫不進去⛔ 不是錯誤 —— 下一次照樣讀內容樹 */
  }
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

export interface LoadCachedOptions {
  rootDir?: string;
  policy?: ContentLoadPolicy;
  env?: NodeJS.ProcessEnv;
  /** ⚠️ 退回／命中的那一行由誰印。預設 `console.error`（⛔ 不吃掉 stdout）。 */
  log?: (line: string) => void;
  /** 測試用：⛔ 不要寫回任何一層。 */
  readOnly?: boolean;
}

/**
 * `new ContentLoader(new FsContentSource(dir)).load()` 的 drop-in 替身。
 *
 * ⭐ `rootDir` 不是出貨那棵樹（temp 樹 / 夾具樹）時**原封不動退回**沒有快取的路徑。
 */
export async function loadContentCached(opts: LoadCachedOptions = {}): Promise<CachedLoadResult> {
  const env = opts.env ?? process.env;
  const rootDir = resolve(opts.rootDir ?? SHIPPED_CONTENT_DIR);
  const mode = envMode(env);
  const ttlS = envTtlSeconds(env);
  const notes: string[] = [];
  const timings = { fingerprint: 0, read: 0, hydrate: 0, load: 0, write: 0 };
  /**
   * ⚠️ 退回**一定要當場出聲**（CLAUDE.md：fail-open 沒錯，靜默才是缺陷）。
   * ⛔ 不可以只塞進 `notes` 等最後印 —— 命中的那幾條路會提早 return，
   *    於是「Redis 掛了」這件事在最常見的情況下**永遠不會被說出來**。
   */
  const log = opts.log ?? ((l: string) => console.error(`[content-cache] ${l}`));
  const note = (line: string): void => {
    notes.push(line);
    log(line);
  };

  const fresh = async (): Promise<LoadResult> => {
    const t = performance.now();
    const r = await new ContentLoader(new FsContentSource(rootDir)).load(
      opts.policy ? { policy: opts.policy } : undefined,
    );
    timings.load = performance.now() - t;
    return r;
  };

  if (mode === "off" || rootDir !== SHIPPED_CONTENT_DIR) {
    // ⛔ 這一條**不**印：它是呼叫端自己指定的，⛔ 不是意外的退回。
    // fail-loud 要喊的是「我本來以為有快取,結果沒有」,⛔ 不是「你叫我關掉我就關掉」。
    if (mode === "off") notes.push("GGD_CONTENT_CACHE=off ⇒ 直接讀內容樹");
    const r = await fresh();
    const fp: Fingerprint = { key: "", source: "read-all", dirty: 0, paths: 0, ms: 0 };
    return { ...r, cache: { mode, hit: "miss", key: "", fingerprint: fp, bytes: 0, timings, notes } };
  }

  const fp = contentCacheKey(env, opts.policy ?? "content");
  timings.fingerprint = fp.ms;
  const key = `ggd-content:v${CACHE_FORMAT}:${fp.key}`;

  const useFile = mode === "auto" || mode === "file";
  const useRedis = mode === "auto" || mode === "redis";

  let packed: Buffer | null = null;
  let hit: CacheHit = "miss";
  const tRead = performance.now();
  if (useFile) {
    packed = readFileLayer(env, fp.key, ttlS);
    if (packed) hit = "file";
  }
  let redis: TinyRedis | null = null;
  if (!packed && useRedis) {
    redis = new TinyRedis(redisOptionsFromEnv(env));
    if (await redis.connect()) {
      packed = await redis.get(key);
      if (packed) hit = "redis";
    } else {
      const o = redisOptionsFromEnv(env);
      note(`Redis 連不上（${o.host}:${o.port}）⇒ 退回${useFile ? "檔案層" : "讀內容樹"}`);
      redis.close();
      redis = null;
    }
  }
  timings.read = performance.now() - tRead;

  if (packed) {
    const tH = performance.now();
    const payload = unpack(packed);
    if (payload) {
      const r = hydrate(payload);
      timings.hydrate = performance.now() - tH;
      // ⭐ redis 命中而檔案層沒有 ⇒ 補寫檔案層（下一個行程連 redis 都不用連）
      if (hit === "redis" && useFile && !opts.readOnly) writeFileLayer(env, fp.key, packed, ttlS);
      redis?.close();
      return {
        ...r,
        cache: { mode, hit, key, fingerprint: fp, bytes: packed.length, timings, notes },
      };
    }
    note("快取內容解不開（格式變了？）⇒ 退回讀內容樹");
  }

  const r = await fresh();
  let bytes = 0;
  if (!opts.readOnly) {
    const tW = performance.now();
    const buf = pack(dehydrate(r));
    bytes = buf.length;
    if (useFile) writeFileLayer(env, fp.key, buf, ttlS);
    if (useRedis) {
      redis ??= new TinyRedis(redisOptionsFromEnv(env));
      if (await redis.connect()) await redis.setEx(key, buf, ttlS);
    }
    timings.write = performance.now() - tW;
  }
  redis?.close();
  return { ...r, cache: { mode, hit: "miss", key, fingerprint: fp, bytes, timings, notes } };
}

/** 這個 repo 有沒有 git（`read-all` 退路要不要出聲）。 */
export function hasGit(repoRoot = REPO_ROOT): boolean {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** ⛔ 只給測試/CLI：把兩層都清掉。 */
export function clearFileLayer(env: NodeJS.ProcessEnv = process.env): number {
  const dir = cacheDir(env);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".gz")) continue;
    rmSync(join(dir, name), { force: true });
    n++;
  }
  return n;
}

export { CACHE_FORMAT } from "./fingerprint";
