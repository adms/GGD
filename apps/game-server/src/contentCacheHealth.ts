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
 * ── ⛔⛔ ①在 2026-08-30 之前是**正式環境的必然**（量到的，⛔ 不是推測）────────
 *
 *   · `docker/compose.yaml`：`../content:/srv/content:ro` ＋ `CONTENT_DIR: /srv/content`
 *   · `contentCache.ts`：`SHIPPED_CONTENT_DIR = <repo 根>/content`（從模組自己的
 *     位置往上五層推導；出貨映像是 `pnpm deploy /out` ⇒ 模組住
 *     `/app/node_modules/@ggd/shared/src/content/cache` ⇒ 上五層是
 *     ⭐ **`/app/node_modules`** —— ⚠️ 2026-08-30 複驗更正，⛔ **不是 `/app`**）
 *   ⇒ 容器裡 `/srv/content !== /app/node_modules/content` ⇒ **每次開機保證 miss，而且靜默**。
 *
 * ⭐ 所以這一格的第一個工作**不是報喜，是報那件事**：`engaged:false` 加上一句
 * `reason` 指名是哪一種。⛔ 沒有它，這張票會變成「grep 得到 `loadContentCached`
 * 所以做完了」，而玩家那條路上一個位元組都沒省 —— 也就是 CLAUDE.md 記過的
 * 「它在**哪一個環境**沒有在跑」。
 *
 * ── ✅ 2026-08-30：①與它底下的兩層都修掉了（GH#717，同一批）───────────────
 *
 * | 層 | 在此之前 | 現在 |
 * |---|---|---|
 * | ⓵ 樹認不得 | `rootDir !== SHIPPED_CONTENT_DIR` ⇒ 容器保證 miss | `isDeclaredContentRoot()`：出貨樹**或** `CONTENT_DIR` 宣告的那一棵 |
 * | ⓶ 指紋 | 容器沒有 `.git` ⇒ `read-all` **2,368 次開檔**（⛔ 比不用快取的 1,778 還多）| 沒有 git ⇒ `manifest`（`manifest.json` 的雜湊鏈）**1 次開檔** |
 * | ⓷ 程式碼那一半 | 字面路徑 `packages/shared/src` 在 `/app/node_modules` 底下不存在 ⇒ 程式碼那一組**空的**（`paths` 586→**1**，鍵不含 schema）| `PARSER_SRC_DIR`＝模組自己的位置 ⇒ 兩種佈局都對 |
 *
 * ⚠️ ⭐ **⓷ 在此之前被⓵蓋著**（走不到那條路），修了⓵它就會活起來 —— 所以三層
 * **必須同一批修**，⛔ 不能只修最上面那一層。
 *
 * ── ⛔⛔ 2026-08-30 **複驗**：三層裡當時只有 ⓵ 有守衛（量到的，⛔ 不是讀碼推論）──
 *
 * 把 ⓶（`contentDigestFile`）與 ⓷（`PARSER_SRC_DIR`）各自改回壞掉的那一版，
 * `contentCacheShippedPath.test.ts` ＋ `contentCache.test.ts` 六條**全綠** ——
 * 因為當時測 ⓶⓷ 的那一條**自己造 `computeFingerprint` 的參數**（失敗形態⑤：
 * 被測的不是出貨的那個），而 `contentCacheKey()` 傳什麼它一個字都沒問。
 * ⇒ ⭐ 現在那條改成**在真的出貨佈局裡跑真的 `loadContentCached()`**
 * （`<box>/app/node_modules/@ggd/shared` 是**實體拷貝**，⛔ 不是 symlink ——
 * node 會把 symlink 解析回真實路徑，於是 `import.meta.url` 又變成 repo 佈局，
 * ⭐ 那正是「出貨那條路」量不到的原因）。
 *
 * ── 量到的（2026-08-27／30，M-series，暖 OS 快取，**每一次都是新的行程**）────
 *
 * | 路徑 | wall-clock | `readFile` 次數 |
 * |---|---:|---:|
 * | `new ContentLoader(new FsContentSource(content)).load()` | **475 / 488 / 538 ms** | **1,778**（1 manifest + **15** `_index.json` + 1,762 份文件） |
 * | `loadContentCached()` 命中檔案層（本機，git 指紋） | **173 / 175 ms** | **1**（＋ 2 個 git 子行程讀 `.git/index`） |
 *
 * ⚠️ **2026-08-30 複驗更正**：這一格第一版寫 `1,763`（1＋14＋1,748）——⛔ 三個數字都不對。
 * 逐次計數（包住 `ContentSource` 的三支方法，⛔ 不是猜）得到 1＋15＋1,762。
 * ⇒ **−64% wall-clock**，內容檔的讀取次數 **1,778 → 1**。
 * ⚠️ 本機命中那 173 ms 裡有 **144–147 ms 是算指紋**（`git ls-files` + `git status`）。
 * ⭐ 容器沒有 git ⇒ 走 `manifest`：內容那一半是 **1 次開檔**，⛔ 不是 1,783。
 * ⇒ `fingerprint` 這一格在正式環境上應該是 **`manifest`**；看到 `read-all`
 *   就代表 `manifest.json` 讀不到／不合格，而那條路 **IO 一點都沒省**。
 *
 * ── ⚠️⚠️ 「正式環境應該是 `engaged=true`」**有一個前提**，⛔ 不要漏讀 ─────────
 *
 * `index.ts` 只讓**沒有 platform overlay 的那一趟**走快取（`shouldUseRuntimeCache`
 * 的第一行），而那是**正確性**，⛔ 不是保守。⇒ 只要後台有人存過一份 override，
 * `fetchOverlayBundle()` 就不是 null ⇒ ⭐ **`engaged=false` 是對的答案**，
 * `reason` 會逐字說「帶 platform overlay 的那一趟**刻意不走快取**」。
 * ⛔ 看到它**不要**去「修好」快取 —— 那會讓 owner 在後台改的設定被舊快取蓋住
 * （CLAUDE.md：「deploy 成功但玩家那一場沒變」）。
 * ⇒ 判準：先讀 `reason`，⛔ 不是先看 `engaged`。
 */
import { DEFAULT_CACHE_TTL_S } from "@ggd/shared/content/cache/index";
import type { CacheHit, CacheMode, CacheReport, Fingerprint } from "@ggd/shared/content/cache/index";

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
  /**
   * ⭐ **鍵是怎麼算出來的**（GH#717）：`git`（工作樹）· `manifest`（容器：`manifest.json`
   * 的雜湊鏈，1 次開檔）· `read-all`（逐份讀 —— ⚠️ 這一種比不用快取還多開檔）
   * · `n/a`（這一次沒走快取）。
   *
   * ⚠️ 這一格**不是裝飾**：`read-all` 出現在正式環境就代表「快取命中了，而 IO 一點都沒省」
   * —— 那正是 owner 那句話（「不要每次都去大量抓檔案」）沒有生效的樣子，
   * 而它與正常**長得一模一樣**，除非有人把它印出來。
   */
  readonly fingerprint: Fingerprint["source"] | "n/a";
  /** 這一次內容載入的 wall-clock（毫秒，整數）。 */
  readonly ms: number;
}

/** 出貨預設 = **開**（第〇·六守則：優先權大的更新後都是預設啟動）。 */
export const DEFAULT_RUNTIME_CACHE_ENABLED = true;
/**
 * owner 2026-08-23 逐字指名的「lifetime 24HR」——⭐ **推導**，⛔ 不是第二次寫下 24。
 * 唯一的住處是快取層自己的 `DEFAULT_CACHE_TTL_S`（它才是真的被拿去設 TTL 的那個值）。
 * ⚠️ 在此之前這裡是字面值 `24` ⇒ 有人改了那一邊，`/healthz` 會報一個快取沒在用的 TTL。
 */
export const DEFAULT_CACHE_TTL_HOURS = DEFAULT_CACHE_TTL_S / 3600;

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
  fingerprint: "n/a",
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
    fingerprint: report.fingerprint.source,
    reason: engaged
      ? null
      : // ⭐ 指名**哪一種**沒命中。`notes` 是快取層自己記的退回原因 —— 2026-08-30 起
        // 它涵蓋「樹認不得」「Redis 連不上」「檔案層寫不進去」三種（在此之前第一種
        // 是**完全靜默**的，所以這裡只能用猜的）。
        (report.notes.length > 0
          ? report.notes.join("；")
          : "第一次載入（快取是空的）—— 下一次開機才會命中。⚠️ 如果它每一次開機都這樣，" +
            "去看 fingerprint 那一格：鍵每次都在變就是這個症狀"),
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
    fingerprint: "n/a",
    reason: why,
    ms: Math.round(ms),
  };
}

export function contentCacheHealth(): ContentCacheSnapshot {
  return snapshot;
}
