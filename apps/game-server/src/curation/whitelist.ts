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
import type { ItemId } from "@ggd/shared/ids";
import { PLATFORM_URL, warnOnce } from "../config/platformUrl";

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

  allowsChampion(id: string): boolean {
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
    return this.bypass ? [...ids] : ids.filter((id) => this.champions.has(id));
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
    if (this.bypass) return candidateIds.length > 0;
    return candidateIds.some((id) => this.champions.has(id));
  }

  get championCount(): number {
    return this.champions.size;
  }
  get itemCount(): number {
    return this.items.size;
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

/**
 * Fetch the whitelist once from the platform. Never throws: on ANY failure it
 * fails safe to allow-all and logs loudly (see the fail-safe policy above).
 * When bypass is on it does not even hit the network.
 */
export async function fetchWhitelist(baseUrl: string, opts: FetchOpts = {}): Promise<Whitelist> {
  const bypass = opts.bypass ?? WHITELIST_BYPASS;
  if (bypass) return Whitelist.allowAll();

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
      return Whitelist.allowAll();
    }
    const doc = parseDoc(await res.json());
    if (!doc) {
      warnOnce(
        "whitelist-malformed",
        `[whitelist] malformed whitelist body from ${url} — FAILING SAFE to allow-all.`,
      );
      return Whitelist.allowAll();
    }
    if (doc.champions.length === 0) {
      console.warn(
        `[whitelist] platform whitelist is EMPTY (no champions enabled). Human champ-select will ` +
          `show the empty-state; bots fall back to the full pool so the match still runs. ` +
          `Enable content in the admin console (or apply the starter set).`,
      );
    }
    return new Whitelist(doc, false);
  } catch (err) {
    warnOnce(
      "whitelist-unreachable",
      `[whitelist] could not reach the platform at ${url} — FAILING SAFE to allow-all ` +
        `(content filtering DISABLED for this match).`,
      err,
    );
    return Whitelist.allowAll();
  } finally {
    clearTimeout(timer);
  }
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
    this.inflight = fetchWhitelist(this.baseUrl, this.opts)
      .then((wl) => {
        this.cached = wl;
        this.expiresAt = expiresAt;
        return wl;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Drop the cache (tests / forced refresh). */
  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
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
