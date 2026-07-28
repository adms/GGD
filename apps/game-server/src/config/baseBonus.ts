/**
 * 基礎加成 resolution — the game-server side of the admin 基礎加成 page (#273),
 * made to actually mean 「下一場生效」 (task #278).
 *
 * ── THE BUG THIS CLOSES ──────────────────────────────────────────────────────
 * The admin page told the operator 「從下一場開始生效」. It was not true. The
 * page writes `config/base-bonus` into the DURABLE CONTENT OVERLAY, and the
 * shard reads that overlay exactly ONCE, at boot (config/contentOverlay.ts),
 * into the `Configs` registry. `MatchController` then read `Configs` in its
 * constructor. So the value a match used was the value the process booted with:
 * changing it needed a game-server restart, and nothing anywhere said so — the
 * operator saved, saw 「✓」, played a match, and got the old numbers.
 *
 * The neighbouring 戰鬥系統 table does not have this problem because it is
 * resolved through a TTL cache AT MATCH CREATION (config/combatEnv.ts). This
 * module is deliberately the SAME SHAPE, over the overlay bundle instead of the
 * `/combat-env` endpoint, because that bundle is where the base-bonus doc lives:
 *
 *   1. content default — the `config.base-bonus@1` doc loaded at boot
 *      (content/config/base-bonus.json: maxHealth +300);
 *   2. overlay override — `docs["config/base-bonus"]` from the platform's
 *      public GET /api/v1/content-overlay/bundle. Overlay BEATS content.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 * NEW MATCHES ONLY, exactly like combat-env: the resolved table is snapshotted
 * into `SimWorld.baseBonus` before tick 0 and into `MatchState.baseBonusJson`,
 * and nothing here holds a reference to a live room. A match in progress can
 * never see a change. The table is also written into the replay header, so a
 * recording plays back on the numbers it was recorded with rather than on
 * whatever the overlay says at playback time.
 *
 * ── FAIL-SAFE ────────────────────────────────────────────────────────────────
 * Any failure (unreachable platform, non-200, junk body) resolves to the CONTENT
 * default — which, on a shard that booted with the overlay applied, is already
 * the operator's value. So the worst case of an outage is the pre-#278 behaviour,
 * never a silent revert to the shipped 300.
 */
import { baseBonusFromDoc, DEFAULT_BASE_BONUS, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { Configs } from "@ggd/shared/content";
import { PLATFORM_URL, warnOnce, clearDegradation } from "./platformUrl";

/** The overlay key the admin 基礎加成 page writes. */
export const BASE_BONUS_OVERLAY_KEY = "config/base-bonus";

/** Degradation-registry keys this module can raise. */
const DEGRADE_KEYS = ["base-bonus-status", "base-bonus-unreachable"];

/** Short cache TTL so a burst of match creations shares one fetch. */
const DEFAULT_TTL_MS = 5_000;

/**
 * The table from the boot-time content registry (which already has the overlay
 * laid over it). A missing / junk doc answers the SHIPPED default — see
 * `baseBonusFromDoc`: 「缺文件 = 預設」, not 「缺文件 = 沒有」.
 */
export function contentBaseBonus(): BaseBonusTable {
  return baseBonusFromDoc(Configs.tryGet("base-bonus"));
}

/**
 * Pull `config/base-bonus` out of an overlay-bundle body. `null` when the body
 * is not a bundle or carries no such doc — the caller then keeps the content
 * default rather than inventing an empty table.
 */
export function parseOverlayBaseBonus(body: unknown): BaseBonusTable | null {
  if (typeof body !== "object" || body === null) return null;
  const docs = (body as { docs?: unknown }).docs;
  if (typeof docs !== "object" || docs === null) return null;
  const doc = (docs as Record<string, unknown>)[BASE_BONUS_OVERLAY_KEY];
  if (doc === undefined) return null;
  // A doc of the WRONG SCHEMA would make `baseBonusFromDoc` answer the SHIPPED
  // default, which reads as 「the operator never set anything」 — wrong. Treat it
  // as 「no override」 instead, so the content layer (which may itself carry the
  // operator's boot-time value) stays in charge.
  const d = doc as { schema?: unknown };
  if (d.schema !== "config.base-bonus@1") return null;
  return baseBonusFromDoc(doc);
}

export interface FetchOpts {
  /** injectable fetch (tests) — defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** per-request timeout */
  timeoutMs?: number;
  /** override the content default (tests) */
  contentDefault?: BaseBonusTable;
}

export interface BaseBonusResult {
  readonly table: BaseBonusTable;
  /**
   * true  — the platform served a usable bundle (whether or not it carried an
   *         override; an absent override is a real answer, not a failure).
   * false — this is the content fallback; the overlay was NOT consulted.
   */
  readonly ok: boolean;
}

export function overlayBundleUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/v1/content-overlay/bundle`;
}

export async function fetchBaseBonusResult(
  baseUrl: string,
  opts: FetchOpts = {},
): Promise<BaseBonusResult> {
  const content = opts.contentDefault ?? contentBaseBonus();
  const doFetch = opts.fetchImpl ?? fetch;
  const url = overlayBundleUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3_000);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) {
      warnOnce(
        "base-bonus-status",
        `[base-bonus] platform returned ${res.status} for ${url} — FAILING SAFE to the content ` +
          `default (an admin 基礎加成 edit made since this shard booted is NOT in this match).`,
      );
      return { table: content, ok: false };
    }
    const overlay = parseOverlayBaseBonus(await res.json());
    clearDegradation(...DEGRADE_KEYS);
    return { table: overlay ?? content, ok: true };
  } catch (err) {
    warnOnce(
      "base-bonus-unreachable",
      `[base-bonus] could not reach the platform at ${url} — FAILING SAFE to the content default ` +
        `(an admin 基礎加成 edit made since this shard booted is NOT in this match).`,
      err,
    );
    return { table: content, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** TTL cache — the same shape as CombatEnvCache, for the same reason. */
export class BaseBonusCache {
  private cached: BaseBonusTable | null = null;
  private expiresAt = 0;
  private inflight: Promise<BaseBonusTable> | null = null;
  private lastGood: BaseBonusTable | null = null;
  private refreshing: Promise<BaseBonusResult> | null = null;

  constructor(
    private readonly baseUrl: string = PLATFORM_URL,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly opts: FetchOpts = {},
  ) {}

  async get(now: number = Date.now()): Promise<BaseBonusTable> {
    if (this.cached && now < this.expiresAt) return this.cached;
    if (this.inflight) return this.inflight;
    const expiresAt = now + this.ttlMs;
    this.inflight = fetchBaseBonusResult(this.baseUrl, this.opts)
      .then(({ table, ok }) => {
        if (ok) this.lastGood = table;
        this.cached = table;
        this.expiresAt = expiresAt;
        return table;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Eager re-fetch (content-bus announcement / forced refresh). */
  async refresh(now: number = Date.now()): Promise<BaseBonusResult> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = fetchBaseBonusResult(this.baseUrl, this.opts)
      .then((result) => {
        if (result.ok) {
          this.lastGood = result.table;
          this.cached = result.table;
          this.expiresAt = now + this.ttlMs;
          return result;
        }
        if (this.lastGood) {
          this.cached = this.lastGood;
          this.expiresAt = now + this.ttlMs;
          return { ...result, table: this.lastGood };
        }
        return result;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
  }

  reset(): void {
    this.invalidate();
    this.lastGood = null;
  }
}

let sharedCache: BaseBonusCache | null = null;
export function sharedBaseBonusCache(): BaseBonusCache {
  if (!sharedCache) sharedCache = new BaseBonusCache();
  return sharedCache;
}

export { DEFAULT_BASE_BONUS };
