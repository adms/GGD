/**
 * NODE-ONLY —— 內容樹快取（`@ggd/shared/content/cache/index`）。
 *
 * ⛔ 刻意**不**從 `../index.ts` 再匯出：那一支是瀏覽器也會 import 的入口，
 * 而這裡用 `node:fs` / `node:net` / `node:child_process` / `node:zlib`。
 * （＝ `content/node/index.ts` 檔頭寫的同一條理由。）
 */
export {
  loadContentCached,
  contentCacheKey,
  clearFileLayer,
  redisOptionsFromEnv,
  hasGit,
  isDeclaredContentRoot,
  CACHE_FORMAT,
  DEFAULT_CACHE_TTL_S,
  REPO_ROOT,
  SHIPPED_CONTENT_DIR,
  PARSER_SRC_DIR,
  type CacheHit,
  type CacheMode,
  type CacheReport,
  type CachedLoadResult,
  type LoadCachedOptions,
} from "./contentCache";
export { computeFingerprint, type Fingerprint } from "./fingerprint";
export { TinyRedis, parseRedisUrl, type RedisCacheOptions } from "./redis";
