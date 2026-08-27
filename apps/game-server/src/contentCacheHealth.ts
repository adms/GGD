/**
 * contentCacheHealth.ts —— 「**執行期的內容快取這一次開機到底有沒有生效**」(GH#717)。
 *
 * ── 這個檔案為什麼存在 ────────────────────────────────────────────────────
 *
 * owner 2026-08-23 逐字：
 * > 「大量重複 IO 的地方先讀取後合成暫存起來（Redis with lifetime 24HR）」
 *
 * 快取層 2026-08-23 就寫好了（`@ggd/shared/content/cache`），而 2026-08-26 重量
 * 的結果是：**`apps/` 底下零個消費端** —— 12 個消費端全部是 `tools/`。
 * ⇒ 那句話只在「產生器跑得快一點」上生效，⛔ 在玩家會走到的路徑上從沒生效過。
 *
 * ── ⭐ 而「接上去」只解決一半，另一半是**它會不會安靜地沒生效** ──────────
 *
 * `loadContentCached()` 對三種情況會**原封不動退回**沒有快取的那條路：
 *
 *   ① `rootDir` 不是它認得的出貨樹（`SHIPPED_CONTENT_DIR`）
 *   ② `GGD_CONTENT_CACHE=off`
 *   ③ Redis 連不上（退檔案層）／檔案層也沒有（退讀內容樹）
 *
 * 三種都是**對的設計**（fail-open：一台沒有 Redis 的機器要照樣跑得起來），
 * ⛔ 但三種都**長得跟正常一模一樣** —— 這正是 CLAUDE.md 那條
 * 「fail-open 沒錯，**靜默**才是缺陷」。⇒ 這一格就是那個「說得出來」的地方。
 *
 * ── ⛔⛔ 而①在**正式環境是必然發生的**，這是量到的，⛔ 不是推測 ────────────
 *
 *   · `docker/compose.yaml`：`../content:/srv/content:ro` ＋ `CONTENT_DIR: /srv/content`
 *   · `contentCache.ts`：`SHIPPED_CONTENT_DIR = <repo 根>/content`（從模組自己的
 *     位置往上五層推導）
 *   ⇒ 容器裡 `/srv/content !== <app 根>/content` ⇒ **快取一定不會啟用**。
 *
 * ⭐ 所以這一格的第一個工作**不是報喜，是報那件事**：`engaged:false` 加上一句
 * `reason` 指名是哪一種。⛔ 沒有它，這張票會變成「grep 得到 `loadContentCached`
 * 所以做完了」，而玩家那條路上一個位元組都沒省 —— 也就是 CLAUDE.md 記過的
 * 「它在**哪一個環境**沒有在跑」。
 *
 * ⚠️ 要讓①在正式環境也能命中，得動 `packages/shared/src/content/cache/**`
 * （讓呼叫端宣告「這就是出貨樹」），**那在本 lane 的檔案柵欄外** ⇒ 已寫進回報。
 *
 * ── 量到的（2026-08-27，M-series，暖 OS 快取，**每一次都是新的行程**）────────
 *
 * | 路徑 | wall-clock | `readFile` 次數 |
 * |---|---:|---:|
 * | `new ContentLoader(new FsContentSource(content)).load()` | **475 / 488 ms** | **1,763**（1 manifest + 14 `_index.json` + 1,748 份文件） |
 * | `loadContentCached()` 命中檔案層 | **173 / 175 ms** | **1**（＋ 2 個 git 子行程讀 `.git/index`） |
 *
 * ⇒ **−64% wall-clock**，內容檔的讀取次數 **1,763 → 1**。
 * ⚠️ 命中那 173 ms 裡有 **144–147 ms 是算指紋**（`git ls-files` + `git status`），
 * ⛔ 不是解析內容 —— 也就是說**沒有 git 的環境（容器）會退回 `read-all`
 * 逐檔雜湊**，那條路 IO 省不到，只省得到 Zod。⭐ 這是第二個柵欄外的待辦。
 */
import type { CacheHit, CacheMode, CacheReport } from "@ggd/shared/content/cache/index";

/** 誰回答了這一次載入。`none` = 快取沒有參與（⛔ 不是「壞了」，見 `reason`）。 */
export type ContentCacheBackend = "redis" | "file" | "none";

export interface ContentCacheSnapshot {
  /** 執行期快取這一格開著嗎（`GGD_CONTENT_CACHE_RUNTIME`）。 */
  readonly enabled: boolean;
  /** ⭐ 這一次開機**真的**由快取回答了嗎。`false` 時 `reason` 一定不是 null。 */
  readonly engaged: boolean;
  readonly backend: ContentCacheBackend;
  /** `GGD_CONTENT_CACHE`（`auto` / `off` / `file` / `redis`）。 */
  readonly mode: CacheMode | "n/a";
  /** owner 指名的 24；來自 `GGD_CONTENT_CACHE_TTL_S`。 */
  readonly ttlHours: number;
  /** `engaged` 為 false 時**指名是哪一種**；true 時是 null。 */
  readonly reason: string | null;
  /** 這一次內容載入的 wall-clock（毫秒，整數）。 */
  readonly ms: number;
}

/** 出貨預設 = **開**（第〇·六守則：優先權大的更新後都是預設啟動）。 */
export const DEFAULT_RUNTIME_CACHE_ENABLED = true;
/** owner 2026-08-23 逐字指名的「lifetime 24HR」。 */
export const DEFAULT_CACHE_TTL_HOURS = 24;

/**
 * ⭐ **rollback 那一格**（owner 常設令：「留後台開關可以簡易 rollback」）。
 *
 * ⚠️ 它是**環境變數，⛔ 不是 `content/config/*.json` 的三個住處**，而那不是偷懶：
 * 這一格governs 的是**內容本身怎麼被載入**，而三個住處的第一個住處**就住在
 * 要被載入的那棵樹裡** ⇒ 先有雞還是先有蛋。⛔ 一個要先載入內容才讀得到的開關，
 * 沒有辦法決定內容要不要走快取。
 * ⇒ 同 `CONTENT_DIR` / `PORT` / `PLATFORM_GAME_SHARED_SECRET`：開機期的旋鈕住 env。
 * （快取層自己的檔頭也是這樣寫的：「一鍵回頭是環境變數」。）
 */
export function runtimeCacheEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.GGD_CONTENT_CACHE_RUNTIME ?? "").trim().toLowerCase();
  if (raw === "") return DEFAULT_RUNTIME_CACHE_ENABLED;
  return !(raw === "0" || raw === "off" || raw === "false" || raw === "no");
}

/**
 * ⭐⭐ **這一次載入該不該走快取** —— GH#717 的承重那一行。
 *
 * ⛔ `withOverlay` 為 true 時**永遠**是 false，而那不是保守是**正確性**：
 * `loadContentCached` 的失效鍵是「內容樹 × 解析它的程式碼」的指紋，
 * ⛔ **它看不見 platform 的 overlay**（後台改的那一份）。帶著 overlay 還走快取
 * ⇒ owner 在後台改了設定、下一場比賽拿到**被快取蓋住的舊內容** ——
 * 也就是 CLAUDE.md 記過的「後台的 override 會蓋掉 content/ 的檔案⋯
 * deploy 成功但玩家那一場沒變」。
 *
 * ⭐ 而「有沒有 overlay」正好就是「後台有沒有人改過東西」
 * ⇒ 這一行**結構上**保證了「後台一改就一定拿到新的」，
 * ⛔ 不是靠某個人記得在存檔的時候去 invalidate 一份快取。
 *
 * ⚠️ 它住在這裡而不是 `index.ts` 裡的一個 `&&`，理由和 `healthz.ts` 的檔頭逐字
 * 相同：`index.ts` 在 import 的當下就綁 port，所以寫在那裡的判斷**沒有任何測試
 * 碰得到** —— 那正是失敗形態②指向操作者的樣子。
 */
export function shouldUseRuntimeCache(opts: {
  withOverlay: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (opts.withOverlay) return false;
  return runtimeCacheEnabled(opts.env ?? process.env);
}

/** TTL 換算成小時（`/healthz` 上人讀的單位）。 */
export function cacheTtlHours(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.GGD_CONTENT_CACHE_TTL_S);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CACHE_TTL_HOURS;
  return Math.round((n / 3600) * 100) / 100;
}

const backendOf = (hit: CacheHit): ContentCacheBackend => (hit === "miss" ? "none" : hit);

/**
 * ⚠️ 模組層級的變數，理由和 `contentHealth.ts` 的 `lastQuarantined` 逐字相同：
 * 開機只發生一次，而 `/healthz` 要在那之後任何時候答得出來。
 */
let snapshot: ContentCacheSnapshot = {
  enabled: runtimeCacheEnabled(),
  engaged: false,
  backend: "none",
  mode: "n/a",
  ttlHours: cacheTtlHours(),
  reason: "尚未載入內容",
  ms: 0,
};

/** 走了快取那條路 —— 記下它**到底有沒有命中**。 */
export function recordCacheLoad(report: CacheReport, ms: number, env: NodeJS.ProcessEnv = process.env): void {
  const engaged = report.hit !== "miss";
  snapshot = {
    enabled: true,
    engaged,
    backend: backendOf(report.hit),
    mode: report.mode,
    ttlHours: cacheTtlHours(env),
    reason: engaged
      ? null
      : // ⭐ 指名**哪一種**沒命中。`notes` 是快取層自己記的退回原因（Redis 連不上…）；
        // 空的 notes ＋ miss 幾乎一定是 `rootDir` 不是它認得的出貨樹 —— 正式環境
        // 的 `/srv/content` 就是這一種，所以那一句要寫得能直接照著查。
        (report.notes.length > 0
          ? report.notes.join("；")
          : "快取未命中且沒有退回訊息 —— 最可能是 CONTENT_DIR 不是快取層認得的出貨樹" +
            "（正式環境 /srv/content ≠ <app 根>/content，見本檔檔頭）"),
    ms: Math.round(ms),
  };
}

/** ⛔ 沒有走快取 —— `why` 要說得出**為什麼**（overlay 在／被關掉／載入失敗）。 */
export function recordUncachedLoad(why: string, ms: number, env: NodeJS.ProcessEnv = process.env): void {
  snapshot = {
    enabled: runtimeCacheEnabled(env),
    engaged: false,
    backend: "none",
    mode: "n/a",
    ttlHours: cacheTtlHours(env),
    reason: why,
    ms: Math.round(ms),
  };
}

export function contentCacheHealth(): ContentCacheSnapshot {
  return snapshot;
}
