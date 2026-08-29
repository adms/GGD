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
 *   `ContentLoader` 一個位元組都沒改；而且 `rootDir` 不是**宣告過的**內容樹時它直接退回
 *   （`isDeclaredContentRoot`：出貨樹，或部署在 `CONTENT_DIR` 裡宣告的那一棵）。
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
 * | `GGD_CONTENT_CACHE_DIR` | `<REPO_ROOT>/node_modules/.cache/ggd-content` | ⛔ 不進 repo。⚠️ 出貨映像裡那個預設解析成 `/app/node_modules/node_modules/.cache/…`（見 `REPO_ROOT` 的註）而 `/app` 是 root 擁有的、行程是 `USER node` ⇒ **這一格要指到寫得動的地方**（compose 給 `/tmp/ggd-content-cache`），否則檔案層永遠不存在 |
 * | `GGD_CONTENT_CACHE_FINGERPRINT` | （空） | ⛔ `read-all` = 回頭逐份讀出來雜湊 · ⛔ `manifest` = 即使有 git 也走 manifest（＝2026-08-30 那一版的行為）|
 *
 * ⭐ 而「這一棵是不是出貨樹」**不是**環境變數 —— 它讀的是部署本來就在設的
 * `CONTENT_DIR`（見 `isDeclaredContentRoot`）。⛔ 不新開第二個要跟它同步的旋鈕。
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
import { dirname, join, relative, resolve, sep } from "node:path";
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
/**
 * repo 根（`packages/shared/src/content/cache` → 上五層）。
 *
 * ⚠️⚠️ **⛔ 它在出貨映像裡不是 `/app`**（2026-08-30 複驗更正，GH#717 —— 第一版在
 * **四個檔**裡都寫著「`REPO_ROOT` 是 `/app`」）。映像是 `pnpm deploy /out` ⇒
 * 這個模組住 `/app/node_modules/@ggd/shared/src/content/cache`，往上五層是
 * `content→src→shared→@ggd→node_modules` ⇒ ⭐ **`REPO_ROOT = /app/node_modules`**、
 * `SHIPPED_CONTENT_DIR = /app/node_modules/content`（兩個都不存在，⛔ 這正常 ——
 * 容器靠 `isDeclaredContentRoot` 的 `CONTENT_DIR` 那一半認樹）。
 * ⭐ 閘：`ops/contentCacheShippedPath.test.ts` 真的用出貨佈局跑一次並比對這兩個常數。
 */
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const SHIPPED_CONTENT_DIR = join(REPO_ROOT, "content");
/**
 * ⭐ **解析內容的那份程式碼真的住在哪** —— 從這個模組自己的位置推導（`…/src`）。
 *
 * ⛔ 在此之前它是字面值 `"packages/shared/src"`，而出貨映像是 `pnpm deploy /out`：
 * shared 住 `/app/node_modules/@ggd/shared/src`、`REPO_ROOT` 是 `/app/node_modules`
 * ⇒ `/app/node_modules/packages/shared/src` **不存在** ⇒ 指紋的程式碼那一組
 * **靜默變成空的**（量到：出貨佈局下 `paths` 586 → **1**）。
 * ⇒ schema 改了而快取鍵不動，而它看起來完全正常。
 */
export const PARSER_SRC_DIR = resolve(HERE, "../..");

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

/**
 * ⭐ owner 2026-08-23 逐字指名的「lifetime **24HR**」——**唯一的住處**。
 *
 * ⛔ 在此之前這個數字有兩份：這裡的字面值 `86400`，與
 * `apps/game-server/src/contentCacheHealth.ts` 的 `DEFAULT_CACHE_TTL_HOURS = 24`。
 * ⇒ 改一邊而另一邊不動，`/healthz` 會**報一個快取沒在用的 TTL**，而兩邊各自看起來都對
 * （第〇·四守則：第二個住處必然漂，且它漂的時候沒有任何東西會紅）。
 */
export const DEFAULT_CACHE_TTL_S = 86400;

function envTtlSeconds(env: NodeJS.ProcessEnv): number {
  const n = Number(env.GGD_CONTENT_CACHE_TTL_S);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CACHE_TTL_S;
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

/**
 * 快取鍵裡的「內容」那一半：⭐ 只有 loader 真的會讀的東西
 * （⛔ 不含 `bundle.json` / `assets/` / `_legacy/` —— loader 一份都不開）。
 */
const CONTENT_SUBPATHS: readonly string[] = [...COLLECTION_NAMES, "manifest.json"];

/** repo 相對的 posix 路徑（git pathspec 要的形狀）。 */
function repoRel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

/**
 * ⭐ `rootDir` 也折進鍵的**唯一住處** —— 內容樹在哪、程式碼在哪，兩個都由呼叫端給，
 * ⛔ 不再假設「內容一定在 `<repoRoot>/content`、程式碼一定在 `packages/shared/src`」。
 */
export function contentCacheKey(
  env: NodeJS.ProcessEnv = process.env,
  policy: ContentLoadPolicy | "content" = "content",
  rootDir: string = SHIPPED_CONTENT_DIR,
): Fingerprint {
  const rel = repoRel(rootDir);
  return computeFingerprint({
    repoRoot: REPO_ROOT,
    contentPaths: CONTENT_SUBPATHS.map((s) => `${rel}/${s}`),
    codePaths: [repoRel(PARSER_SRC_DIR)],
    salt: `policy=${policy}`,
    contentRoot: rootDir,
    contentSubpaths: CONTENT_SUBPATHS,
    codeRoot: PARSER_SRC_DIR,
    contentDigestFile: join(rootDir, "manifest.json"),
    forceReadAll: fingerprintOverride(env) === "read-all",
    forceManifest: fingerprintOverride(env) === "manifest",
  });
}

/** `GGD_CONTENT_CACHE_FINGERPRINT`：`""`＝自動 · `read-all` · `manifest`（⛔ 其餘一律當自動）。 */
function fingerprintOverride(env: NodeJS.ProcessEnv): "" | "read-all" | "manifest" {
  const raw = (env.GGD_CONTENT_CACHE_FINGERPRINT ?? "").trim().toLowerCase();
  return raw === "read-all" || raw === "manifest" ? raw : "";
}

/**
 * ⭐⭐ **GH#717 的承重那一行**：這一次的 `rootDir` 是不是「出貨的那棵內容樹」。
 *
 * ⛔ 在此之前這裡是 `rootDir !== SHIPPED_CONTENT_DIR`，而 `SHIPPED_CONTENT_DIR`
 * 是**從這個模組自己的位置推導**的（`<repoRoot>/content`）。出貨容器裡：
 *
 *   · `docker/compose.yaml`：`../content:/srv/content:ro` ＋ `CONTENT_DIR: /srv/content`
 *   · 映像佈局：`/app/node_modules/@ggd/shared/…` ⇒ `SHIPPED_CONTENT_DIR` 是
 *     ⭐ `/app/node_modules/content`（⚠️ 2026-08-30 複驗更正，⛔ 不是 `/app/content`）
 *   ⇒ 它與 `/srv/content` 不相等 ⇒ ⭐ **每一次開機都保證 miss，而且一個字都不說。**
 *
 * ⭐ 修法是讓**部署宣告**它，而宣告的住處**就是它已經在的那一格**（`CONTENT_DIR`）——
 * ⛔ 不是新開一個要跟它保持同步的第二個環境變數（第〇·四守則：第二個住處必然漂）。
 *
 * ⚠️ 這**沒有**打開「temp 樹 / 夾具樹也走快取」那條路：夾具樹的 `rootDir` 既不等於
 * 出貨樹，也不等於 `CONTENT_DIR` ⇒ 照舊退回。而抓「產物過期／來源沒進版控」的兩支閘
 * 從頭到尾不 import 這個模組（`contentCache.test.ts` 第三條在守）。
 */
export function isDeclaredContentRoot(rootDir: string, env: NodeJS.ProcessEnv): boolean {
  if (rootDir === SHIPPED_CONTENT_DIR) return true;
  const declared = (env.CONTENT_DIR ?? "").trim();
  return declared !== "" && resolve(declared) === rootDir;
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

/**
 * 回傳一句**退回原因**（寫不進去），成功回 `null`。
 *
 * ⚠️ 在此之前它是 `catch { /* 不是錯誤 *\/ }` —— 一個**完全靜默**的失敗。
 * ⭐ 而出貨映像裡它是**必然**的：`COPY --from=build /out/ ./` 是 root 擁有的，
 * 而 `USER node` 建不了 `<REPO_ROOT>/node_modules/.cache`（映像裡是
 * `/app/node_modules/node_modules/.cache`，⚠️ 2026-08-30 更正）⇒ EACCES ⇒ 檔案層永遠不存在，
 * 而外面看起來跟「這次剛好沒命中」一模一樣（fail-open 沒錯，**靜默**才是缺陷）。
 */
function writeFileLayer(
  env: NodeJS.ProcessEnv,
  key: string,
  buf: Buffer,
  ttlS: number,
): string | null {
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
    return null;
  } catch (e) {
    /* 快取寫不進去⛔ 不是錯誤 —— 下一次照樣讀內容樹。⭐ 但它要說出來。 */
    return `檔案層寫不進去（${dir}：${e instanceof Error ? e.message : String(e)}）⇒ 只剩 Redis／每次重讀`;
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

  const declared = isDeclaredContentRoot(rootDir, env);
  if (mode === "off" || !declared) {
    // ⛔ `off` **不**印：它是呼叫端自己指定的，⛔ 不是意外的退回。
    // fail-loud 要喊的是「我本來以為有快取,結果沒有」,⛔ 不是「你叫我關掉我就關掉」。
    if (mode === "off") notes.push("GGD_CONTENT_CACHE=off ⇒ 直接讀內容樹");
    // ⭐ 而「rootDir 不是宣告過的樹」**要印**：那正是 GH#717 在出貨容器裡發生的事，
    //    而它在此之前是**完全靜默**的 —— 一句 note 都沒有 ⇒ `/healthz` 只能用猜的。
    else
      note(
        `rootDir 不是宣告過的內容樹 ⇒ 直接讀內容樹（rootDir=${rootDir}；` +
          `CONTENT_DIR=${env.CONTENT_DIR ?? "<未設>"}；出貨樹=${SHIPPED_CONTENT_DIR}）`,
      );
    const r = await fresh();
    const fp: Fingerprint = { key: "", source: "read-all", dirty: 0, paths: 0, ms: 0 };
    return { ...r, cache: { mode, hit: "miss", key: "", fingerprint: fp, bytes: 0, timings, notes } };
  }

  const fp = contentCacheKey(env, opts.policy ?? "content", rootDir);
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
      if (hit === "redis" && useFile && !opts.readOnly) {
        const why = writeFileLayer(env, fp.key, packed, ttlS);
        if (why !== null) note(why);
      }
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
    if (useFile) {
      const why = writeFileLayer(env, fp.key, buf, ttlS);
      if (why !== null) note(why);
    }
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
