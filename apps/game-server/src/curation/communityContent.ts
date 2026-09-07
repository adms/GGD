/**
 * ⭐⭐ GH#1025 Scope C —— **社群內容預設只進社群房**，shard 這一側。
 *
 * ── ⛔ 為什麼這個問題不能在 shard 上「推導」 ──────────────────────────────────
 * 熱套用那一刻我知道自己剛剛加了哪幾個 id（`contentHotApply.added`）——
 * ⛔ **重啟之後那個資訊就沒了**：開機讀的是一棵合併好的樹（`content/` ⊕ overlay），
 * 而樹上沒有任何一個位元組說某一份是玩家寫的。
 * ⇒ 拿熱套用集合當答案會得到
 *   「社群英雄在**重啟前**只進社群房、**重啟後**跑進官方房」——
 *   ⭐ 而那正是本 repo 記過的「壞掉跟正常長得一模一樣」。
 *
 * ⇒ 出身在 **`Promote` 的那一次寫入**就記進耐久覆蓋層（`Overlay.Community`，
 *   與內容同一個 mutex／同一次原子寫入／同一個 generation），platform 服務成
 *   `GET /api/v1/content-overlay/community`，⭐ 而這個檔就是它的消費端。
 *
 * ── ⭐ 這一支刻意長得像 `whitelist.ts` ──────────────────────────────────────
 * 同一條路已經有一個**對的**形狀：抓 → 短 TTL 行程快取 → **開房那一刻**取快照
 * → 快照是不可變的 ⇒ 進行中的對局不受影響。這裡是那個形狀的第二份，
 * ⛔ 不是第二種通知機制（公告仍然是 `chan:content` 上的 `content-overlay`，
 * 因為這份清單**就是**覆蓋層的一部分）。
 *
 * ── ⚠️ fail-safe 的方向，與它為什麼不是對稱的 ────────────────────────────────
 * 抓不到的時候有兩條路：
 *
 *  | 選 | 後果 |
 *  |---|---|
 *  | ⭐ 「不知道有社群內容」（**選這個**） | 官方房這一場會看得到社群內容 |
 *  | ⛔ 「全部都算社群內容」 | 官方房的白名單被清空 ⇒ **沒有英雄可以選** |
 *
 * ⇒ 與 `whitelist.ts` 的政策同一句話：「一次平台抖動不可以讓遊戲不能玩」。
 * ⭐ 而 fail-open 沒錯、**靜默**才是缺陷 —— 每一次失敗都 `warnOnce` 進
 *   degradation 登記，於是它上 `/healthz` 的 `content` 區塊。
 */
import { Configs, resolveUgc, UGC_DOC_ID } from "@ggd/shared/content";
import { DEFAULT_CONTENT_POOL, type ContentPool } from "@ggd/shared/roomSettings";
import { PLATFORM_URL, warnOnce, clearDegradation } from "../config/platformUrl";
import type { Whitelist } from "./whitelist";

/** Degradation-registry keys this module can raise (see config/platformUrl.ts). */
const DEGRADE_KEYS = [
  "community-content-status",
  "community-content-malformed",
  "community-content-unreachable",
];

/**
 * The wire shape served by GET /api/v1/content-overlay/community.
 *
 * ⭐ 逐欄位等於 `WhitelistDoc` —— 那是刻意的（Go 那一側的 `CommunityDoc`
 * 檔頭寫著同一句話）。
 */
export interface CommunityContentDoc {
  version: number;
  updatedAt?: string;
  champions: string[];
  items: string[];
  abilities: string[];
}

/** Short cache TTL so a burst of match creations shares one fetch. */
const DEFAULT_TTL_MS = 5_000;

/**
 * 一份不可變的「哪些 id 是社群來的」快照。
 *
 * ⚠️ `ok=false` ＝ **這一份是 fail-safe 的空集合**，⛔ 不是「真的一個都沒有」。
 * ⭐ 兩者一定要分得出來：前者代表官方房這一場**沒有在過濾**。
 */
export class CommunityContent {
  readonly ok: boolean;
  private readonly ids: ReadonlySet<string>;

  constructor(doc: Partial<CommunityContentDoc> | null, ok: boolean) {
    this.ok = ok;
    this.ids = new Set([
      ...(doc?.champions ?? []),
      ...(doc?.items ?? []),
      ...(doc?.abilities ?? []),
    ]);
  }

  /** 「這台主機上沒有任何社群內容」/ fail-safe 的空集合。 */
  static empty(ok: boolean): CommunityContent {
    return new CommunityContent(null, ok);
  }

  get size(): number {
    return this.ids.size;
  }

  /** ⭐ 三桶攤平成一個集合 —— 白名單那一側的 seam 也是按 id 問的。 */
  all(): string[] {
    return [...this.ids];
  }

  isCommunity(id: string): boolean {
    return this.ids.has(id);
  }
}

export interface CommunityFetchOpts {
  /** injectable fetch (tests) — defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** per-request timeout */
  timeoutMs?: number;
}

/** A fetch outcome plus WHETHER THE PLATFORM ACTUALLY ANSWERED. */
export interface CommunityContentResult {
  readonly community: CommunityContent;
  readonly ok: boolean;
  readonly updatedAt?: string;
}

function parseDoc(body: unknown): CommunityContentDoc | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    version: typeof b.version === "number" ? b.version : 1,
    updatedAt: typeof b.updatedAt === "string" ? b.updatedAt : undefined,
    champions: asStrings(b.champions),
    items: asStrings(b.items),
    abilities: asStrings(b.abilities),
  };
}

/**
 * Fetch the community-content list once. ⛔ Never throws: on ANY failure it
 * fails safe to "nothing is community content" and says so LOUDLY.
 */
export async function fetchCommunityContentResult(
  baseUrl: string,
  opts: CommunityFetchOpts = {},
): Promise<CommunityContentResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/content-overlay/community`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3_000);
  const failSafe = (key: string, msg: string, err?: unknown): CommunityContentResult => {
    warnOnce(
      key,
      `[community-content] ${msg} — FAILING SAFE to "no community content" ` +
        `(an OFFICIAL room will offer player-made content this match). ` +
        `⛔ The other direction would empty the roster, which is worse.`,
      err,
    );
    return { community: CommunityContent.empty(false), ok: false };
  };
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) {
      return failSafe("community-content-status", `platform returned ${res.status} for ${url}`);
    }
    const doc = parseDoc(await res.json());
    if (!doc) {
      return failSafe("community-content-malformed", `malformed body from ${url}`);
    }
    clearDegradation(...DEGRADE_KEYS);
    return { community: new CommunityContent(doc, true), ok: true, updatedAt: doc.updatedAt };
  } catch (err) {
    return failSafe("community-content-unreachable", `could not reach the platform at ${url}`, err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * TTL cache with the SAME outage policy as {@link WhitelistCache}: `get()` is
 * lazy and fails safe (a match is waiting), `refresh()` is eager and KEEPS THE
 * LAST KNOWN GOOD (nothing is waiting, so adopting the fail-safe would let one
 * badly-timed invalidation silently switch the community filter off for every
 * subsequent match).
 */
export class CommunityContentCache {
  private cached: CommunityContent | null = null;
  private expiresAt = 0;
  private inflight: Promise<CommunityContent> | null = null;
  private lastGood: CommunityContent | null = null;
  private refreshing: Promise<CommunityContentResult> | null = null;

  constructor(
    private readonly baseUrl: string = PLATFORM_URL,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly opts: CommunityFetchOpts = {},
  ) {}

  async get(now: number = Date.now()): Promise<CommunityContent> {
    if (this.cached && now < this.expiresAt) return this.cached;
    if (this.inflight) return this.inflight;
    const expiresAt = now + this.ttlMs;
    this.inflight = fetchCommunityContentResult(this.baseUrl, this.opts)
      .then(({ community, ok }) => {
        if (ok) this.lastGood = community;
        this.cached = community;
        this.expiresAt = expiresAt;
        return community;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  async refresh(now: number = Date.now()): Promise<CommunityContentResult> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = fetchCommunityContentResult(this.baseUrl, this.opts)
      .then((result) => {
        if (result.ok) {
          this.lastGood = result.community;
          this.cached = result.community;
          this.expiresAt = now + this.ttlMs;
          return result;
        }
        if (this.lastGood) {
          this.cached = this.lastGood;
          this.expiresAt = now + this.ttlMs;
          return { ...result, community: this.lastGood };
        }
        return result;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  /** Drop the cache (tests / forced refresh). Keeps the last known good. */
  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
  }

  /** Forget everything, including the last known good (tests). */
  reset(): void {
    this.invalidate();
    this.lastGood = null;
  }
}

let sharedCache: CommunityContentCache | null = null;
/** The process-wide cache used by MatchRoom. Constructed lazily (as tests import this module without a platform). */
export function sharedCommunityContentCache(): CommunityContentCache {
  if (!sharedCache) sharedCache = new CommunityContentCache();
  return sharedCache;
}

/** Tests only: swap the process cache (and get the old one back). */
export function setSharedCommunityContentCache(
  c: CommunityContentCache | null,
): CommunityContentCache | null {
  const prev = sharedCache;
  sharedCache = c;
  return prev;
}

// ─────────────────────────────── the config knob ──────────────────────────────

/**
 * ⭐⭐ `config.ugc@1` 的 `communityRoomOnly` —— ⭐ **這一格開關的消費端就是這一行。**
 *
 * ⚠️ 讀的是 `Configs` 登錄表，⭐ 而那一份**已經含後台覆蓋**（開機那一趟走的是
 * `content/` ⊕ overlay 的合併樹）。⛔ 讀不到（骨架／單元測試）⇒ `resolveUgc`
 * 回出貨預設 ＝ **on**。
 */
export function communityRoomOnly(): boolean {
  return resolveUgc(Configs.tryGet(UGC_DOC_ID)).communityRoomOnly;
}

/**
 * ⭐⭐ **開房那一刻**把這一場的內容池套到白名單快照上（GH#1025 Scope C）。
 *
 * ⛔ 拿掉這一支的呼叫 ＝ 社群內容跑進官方房，⭐ 而 `communityRoomPool.test.ts`
 * 的第一條會紅（承重線）。
 *
 * 三個提早結束的分支，每一個都有理由：
 *  · 這一場是 `community` 房 ⇒ ⭐ **不減**（社群房看得到全部，這就是它的定義）
 *  · `communityRoomOnly` 關著 ⇒ ⭐ 「社群內容」這個分類整個不生效（一鍵 rollback）
 *  · 清單是空的 ⇒ `Whitelist.excluding([])` 回**同一個物件**（零成本）
 *
 * ⚠️ 回傳的是一份**新的**快照 —— 共用 TTL 快取裡那一份一個位元組都沒有動，
 * 所以已經開的房不受影響（`liveRefresh.test.ts` 釘住的那條語意）。
 */
export function applyContentPool(
  whitelist: Whitelist,
  pool: ContentPool | undefined,
  community: CommunityContent | null,
): Whitelist {
  if ((pool ?? DEFAULT_CONTENT_POOL) === "community") return whitelist;
  if (!community) return whitelist;
  return whitelist.excluding(community.all());
}
