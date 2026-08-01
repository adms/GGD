/**
 * Content whitelist — the game-server's authoritative enforcement of the
 * operator-curated content set.
 *
 * The imported roster is far larger than what should ship enabled, so the
 * platform keeps a DEFAULT-EMPTY whitelist of champion / item / ability ids
 * (data/curation/whitelist.json, served at GET /api/v1/curation/whitelist).
 * The game-server is the authority that actually enforces it: at match
 * creation it fetches the whitelist (short-TTL process cache) and filters the
 * playable champion pool, the RANDOM/bot pool, the shop catalogue and the
 * draft/loot offers, and rejects a SELECT_CHAMPION for a non-whitelisted
 * champion.
 *
 * FAIL-SAFE POLICY (deliberate, documented): if the platform is unreachable or
 * returns junk, we DO NOT brick live matches — the fetch falls back to a
 * permissive "allow-all" whitelist (identical to the dev bypass) and logs
 * loudly. A whitelist-service outage must never take the game down; an
 * operator misconfiguration is visible in the logs and via the empty-state UX
 * on the client, not as an unplayable match. Set GGD_WHITELIST_BYPASS=1 to
 * force allow-all for local testing.
 */
import { isRetiredChampionId } from "@ggd/shared/content/championRetirement";
import type { ItemId } from "@ggd/shared/ids";
import { PLATFORM_URL, warnOnce, clearDegradation, BOOT_PROBE_KEY } from "../config/platformUrl";

/** Degradation-registry keys this module can raise (see config/platformUrl.ts). */
const DEGRADE_KEYS = ["whitelist-status", "whitelist-malformed", "whitelist-unreachable"];

// Re-exported for existing importers (combat-env, MatchController); the actual
// env resolution + localhost dev fallback lives in config/platformUrl.ts.
export { PLATFORM_URL };

/** The wire shape served by GET /api/v1/curation/whitelist. */
export interface WhitelistDoc {
  version: number;
  updatedAt?: string;
  champions: string[];
  items: string[];
  abilities: string[];
}

/** Process-wide bypass: disables all filtering (local dev/testing). */
export const WHITELIST_BYPASS = process.env.GGD_WHITELIST_BYPASS === "1";

/** Short cache TTL so a burst of match creations shares one fetch. */
const DEFAULT_TTL_MS = 5_000;

/**
 * An immutable whitelist snapshot with membership tests. When `bypass` is true
 * every id is allowed and the filter helpers are pass-through, so the default
 * (no-whitelist) code path is byte-for-byte identical to the pre-whitelist
 * behavior.
 */
export class Whitelist {
  readonly bypass: boolean;
  private readonly champions: ReadonlySet<string>;
  private readonly items: ReadonlySet<string>;
  private readonly abilities: ReadonlySet<string>;

  constructor(doc: Partial<WhitelistDoc> | null, bypass: boolean) {
    this.bypass = bypass;
    this.champions = new Set(doc?.champions ?? []);
    this.items = new Set(doc?.items ?? []);
    this.abilities = new Set(doc?.abilities ?? []);
  }

  /** A permissive whitelist: everything allowed (bypass / fail-safe). */
  static allowAll(): Whitelist {
    return new Whitelist(null, true);
  }

  /**
   * ⚠️ 下架檢查在 `bypass` **之前**,那是重點。`bypass` 是 fail-open —— 平台連不上
   * 時整份白名單消失、119 隻全開。下架不是營運狀態是內容事實(QWER 全空的半成品),
   * 所以它必須在 fail-open 那條路上也擋得住。同理它也擋在
   * `filterChampions` / `hasAnyChampion` 的 bypass 之前。
   */
  allowsChampion(id: string): boolean {
    if (isRetiredChampionId(id)) return false;
    return this.bypass || this.champions.has(id);
  }
  allowsItem(id: string): boolean {
    return this.bypass || this.items.has(id);
  }
  allowsAbility(id: string): boolean {
    return this.bypass || this.abilities.has(id);
  }

  /** Keep only whitelisted champion ids (identity when bypassing). */
  filterChampions(ids: readonly string[]): string[] {
    return ids.filter((id) => this.allowsChampion(id));
  }
  /** Keep only whitelisted item ids (identity when bypassing). */
  filterItems(ids: readonly ItemId[]): ItemId[] {
    return this.bypass ? [...ids] : ids.filter((id) => this.items.has(id));
  }

  /**
   * Does the whitelist enable at least one of the given champion ids? Used by
   * the server to detect the "zero playable champions" state (bots then fall
   * back so a botted match still runs; the human empty-state is a client
   * concern surfaced via champ-select).
   */
  hasAnyChampion(candidateIds: readonly string[]): boolean {
    return candidateIds.some((id) => this.allowsChampion(id));
  }

  get championCount(): number {
    return this.champions.size;
  }
  get itemCount(): number {
    return this.items.size;
  }

  /**
   * The enabled id sets, for the MATCH REPLAY header (task #175).
   *
   * The whitelist is a first-class sim input, not just a UI filter: it reaches
   * the sim as `world.itemEligible` and is consulted BEFORE an rng roll
   * (economy/legendaryOrb.ts), so a different whitelist shifts the random stream
   * and desyncs everything after it. It is also fail-safe — an unreachable
   * platform yields allow-all — so "same server, same seed" does NOT determine a
   * match on its own. A recording therefore stores the resolved sets verbatim
   * and playback rebuilds this exact object from them.
   */
  snapshotChampions(): string[] {
    return [...this.champions];
  }
  snapshotItems(): string[] {
    return [...this.items];
  }
  snapshotAbilities(): string[] {
    return [...this.abilities];
  }
}

/** Parse an unknown JSON body into a WhitelistDoc, tolerating missing lists. */
function parseDoc(body: unknown): WhitelistDoc | null {
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

export interface FetchOpts {
  /** injectable fetch (tests) — defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** override the process bypass flag (tests) */
  bypass?: boolean;
  /** per-request timeout */
  timeoutMs?: number;
}

/** A fetch outcome plus WHETHER THE PLATFORM ACTUALLY ANSWERED. */
export interface WhitelistResult {
  readonly whitelist: Whitelist;
  /**
   * true  — the platform served a usable document (or bypass is configured,
   *         which is a deliberate answer, not a failure).
   * false — this is the fail-safe allow-all, i.e. NOTHING is being filtered.
   *
   * `Whitelist.bypass` cannot carry this: it is true for both the deliberate
   * GGD_WHITELIST_BYPASS and the fail-safe fallback, and the refresh path has
   * to tell those apart (see WhitelistCache.refresh).
   */
  readonly ok: boolean;
  /** `updatedAt` from the served document, when there was one. */
  readonly updatedAt?: string;
}

/**
 * Fetch the whitelist once from the platform. Never throws: on ANY failure it
 * fails safe to allow-all and logs loudly (see the fail-safe policy above).
 * When bypass is on it does not even hit the network.
 */
export async function fetchWhitelistResult(
  baseUrl: string,
  opts: FetchOpts = {},
): Promise<WhitelistResult> {
  const bypass = opts.bypass ?? WHITELIST_BYPASS;
  if (bypass) return { whitelist: Whitelist.allowAll(), ok: true };

  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/curation/whitelist`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3_000);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) {
      warnOnce(
        "whitelist-status",
        `[whitelist] platform returned ${res.status} for ${url} — FAILING SAFE to allow-all ` +
          `(content filtering DISABLED for this match). Fix the platform or set GGD_WHITELIST_BYPASS=1.`,
      );
      return { whitelist: Whitelist.allowAll(), ok: false };
    }
    const doc = parseDoc(await res.json());
    if (!doc) {
      warnOnce(
        "whitelist-malformed",
        `[whitelist] malformed whitelist body from ${url} — FAILING SAFE to allow-all.`,
      );
      return { whitelist: Whitelist.allowAll(), ok: false };
    }
    if (doc.champions.length === 0) {
      console.warn(
        `[whitelist] platform whitelist is EMPTY (no champions enabled). Human champ-select will ` +
          `show the empty-state; bots fall back to the full pool so the match still runs. ` +
          `Enable content in the admin console (or apply the starter set).`,
      );
    }
    // The platform answered with a usable document: retract any earlier
    // degradation so /healthz stops reporting an outage that has ended (and so
    // a LATER outage warns loudly again instead of being deduped away).
    clearDegradation(...DEGRADE_KEYS, BOOT_PROBE_KEY);
    return { whitelist: new Whitelist(doc, false), ok: true, updatedAt: doc.updatedAt };
  } catch (err) {
    warnOnce(
      "whitelist-unreachable",
      `[whitelist] could not reach the platform at ${url} — FAILING SAFE to allow-all ` +
        `(content filtering DISABLED for this match).`,
      err,
    );
    return { whitelist: Whitelist.allowAll(), ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** `fetchWhitelistResult` without the outcome flag (unchanged behaviour). */
export async function fetchWhitelist(baseUrl: string, opts: FetchOpts = {}): Promise<Whitelist> {
  return (await fetchWhitelistResult(baseUrl, opts)).whitelist;
}

/**
 * A tiny TTL cache so a burst of match creations shares a single fetch. Each
 * match still resolves its own snapshot via get(); within the TTL window that
 * snapshot is reused. Never throws (fetchWhitelist fails safe).
 */
export class WhitelistCache {
  private cached: Whitelist | null = null;
  private expiresAt = 0;
  private inflight: Promise<Whitelist> | null = null;
  /** The last whitelist the platform actually SERVED (never a fail-safe). */
  private lastGood: Whitelist | null = null;
  private refreshing: Promise<WhitelistResult> | null = null;

  constructor(
    private readonly baseUrl: string = PLATFORM_URL,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly opts: FetchOpts = {},
  ) {}

  async get(now: number = Date.now()): Promise<Whitelist> {
    if (this.cached && now < this.expiresAt) return this.cached;
    if (this.inflight) return this.inflight;
    // Expiry is measured off the same clock reading passed to get(), so an
    // injected test clock and the real Date.now() default both behave.
    const expiresAt = now + this.ttlMs;
    this.inflight = fetchWhitelistResult(this.baseUrl, this.opts)
      .then(({ whitelist, ok }) => {
        if (ok) this.lastGood = whitelist;
        this.cached = whitelist;
        this.expiresAt = expiresAt;
        return whitelist;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /**
   * Re-run the fetch NOW because the platform announced a change.
   *
   * TWO THINGS MAKE THIS DIFFERENT FROM get():
   *
   *  1. It is EAGER. get() is lazy by design — the value is resolved when a
   *     match needs it. An invalidation has no match waiting on it, so if the
   *     refresh merely dropped the cache, a FAILED refresh would stay invisible
   *     until the next match creation, at which point it would look like a
   *     fresh failure. Fetching now is what lets /healthz answer "your change
   *     landed at 09:31:04" or "your change did NOT land, here is why".
   *
   *  2. A FAILED REFRESH KEEPS THE LAST KNOWN GOOD. get() fails safe to
   *     allow-all because a match is waiting and must not be bricked. Here
   *     nothing is waiting, and adopting allow-all would mean an INVALIDATION
   *     MESSAGE — arriving while the platform happens to be down — silently
   *     switching content filtering off for every subsequent match. A refresh
   *     that cannot reach the platform therefore changes nothing except the
   *     recorded failure. (A process that has never had a good answer has no
   *     last-known-good to keep, so it still fails safe, which is the real
   *     fail-safe case.) Mirrors ServerOpsCache's outage policy.
   *
   * Single-flight: concurrent invalidations share one in-flight fetch, so a
   * burst of admin clicks cannot fan out into a burst of HTTP requests.
   */
  async refresh(now: number = Date.now()): Promise<WhitelistResult> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = fetchWhitelistResult(this.baseUrl, this.opts)
      .then((result) => {
        if (result.ok) {
          this.lastGood = result.whitelist;
          this.cached = result.whitelist;
          this.expiresAt = now + this.ttlMs;
          return result;
        }
        if (this.lastGood) {
          // Hold the line: keep serving what the platform last really said.
          this.cached = this.lastGood;
          this.expiresAt = now + this.ttlMs;
          return { ...result, whitelist: this.lastGood };
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

/**
 * The process-wide cache used by MatchRoom. Constructed lazily so tests can
 * import the module without a platform running.
 */
let sharedCache: WhitelistCache | null = null;
export function sharedWhitelistCache(): WhitelistCache {
  if (!sharedCache) sharedCache = new WhitelistCache();
  return sharedCache;
}
