/**
 * Combat-env resolution — the game-server side of the admin 戰鬥系統 dynamic
 * config (task #28). At MATCH CREATION the server resolves the global
 * combat-environment multiplier table from two layers:
 *
 *   1. content defaults — the `config.combat-env@1` doc loaded from the
 *      content tree at boot (content/config/combat-env.json, all 1.0 today);
 *   2. admin override — the platform's operator-edited table, served publicly
 *      at GET /api/v1/combat-env (data/config/combat-env.json via the admin
 *      console 戰鬥系統 page). Admin keys BEAT content keys.
 *
 * The merged table is normalized once (normalizeCombatEnv) and snapshotted
 * into the match (MatchController → SimWorld + MatchState.combatEnvJson).
 * NEW MATCHES ONLY: a running match keeps the table it started with — that is
 * the deterministic-safe dynamic config; a change applies from the next match.
 *
 * FAIL-SAFE POLICY (deliberate, mirroring curation/whitelist.ts): if the
 * platform is unreachable or returns junk, we DO NOT brick match creation —
 * the resolve falls back to the CONTENT DEFAULTS (neutral all-1.0 when the
 * content doc is absent too) and logs loudly. Set GGD_COMBAT_ENV_BYPASS=1 to
 * skip the platform fetch entirely for local testing.
 */
import {
  normalizeCombatEnv,
  COMBAT_ENV_KEYS,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import { Configs, type ConfigCombatEnvDoc } from "@ggd/shared/content";
import { PLATFORM_URL } from "../curation/whitelist";

/** Process-wide bypass: skip the platform fetch (local dev/testing). */
export const COMBAT_ENV_BYPASS = process.env.GGD_COMBAT_ENV_BYPASS === "1";

/** Short cache TTL so a burst of match creations shares one fetch. */
const DEFAULT_TTL_MS = 5_000;

/** A sparse multiplier table (missing keys = neutral 1.0). */
export type CombatEnvPartial = Partial<Record<CombatEnvKey, number>>;

/**
 * Content-default multipliers from the `config.combat-env@1` doc (registered
 * at boot by the ContentLoader). Absent/unexpected doc (unit tests, skeleton
 * boot) -> empty partial, i.e. the neutral table.
 */
export function contentCombatEnv(): CombatEnvPartial {
  const doc = Configs.tryGet("combat-env") as unknown as ConfigCombatEnvDoc | undefined;
  if (!doc || doc.schema !== "config.combat-env@1" || typeof doc.multipliers !== "object") {
    return {};
  }
  return doc.multipliers;
}

/**
 * Parse the platform's GET /api/v1/combat-env body into a sparse table,
 * tolerating junk: only known keys with finite number values survive (the
 * final normalizeCombatEnv pass re-checks anyway — this keeps the merge from
 * spreading unknown keys around).
 */
export function parseCombatEnvDoc(body: unknown): CombatEnvPartial | null {
  if (typeof body !== "object" || body === null) return null;
  const mult = (body as Record<string, unknown>).multipliers;
  if (typeof mult !== "object" || mult === null) return null;
  const m = mult as Record<string, unknown>;
  const out: CombatEnvPartial = {};
  for (const k of COMBAT_ENV_KEYS) {
    const v = m[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export interface FetchOpts {
  /** injectable fetch (tests) — defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** override the process bypass flag (tests) */
  bypass?: boolean;
  /** per-request timeout */
  timeoutMs?: number;
  /** override the content defaults (tests) — defaults to contentCombatEnv() */
  contentDefaults?: CombatEnvPartial;
}

/**
 * Resolve the effective combat-env table once: content defaults + admin
 * override merged (admin wins per key), normalized onto the all-1.0 default.
 * Never throws: on ANY platform failure it fails safe to the content defaults
 * and logs loudly (see the fail-safe policy above). When bypass is on it does
 * not even hit the network.
 */
export async function fetchCombatEnv(
  baseUrl: string,
  opts: FetchOpts = {},
): Promise<CombatEnvMultipliers> {
  const content = opts.contentDefaults ?? contentCombatEnv();
  const bypass = opts.bypass ?? COMBAT_ENV_BYPASS;
  if (bypass) return normalizeCombatEnv(content);

  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/combat-env`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3_000);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(
        `[combat-env] platform returned ${res.status} for ${url} — FAILING SAFE to content ` +
          `defaults (admin 戰鬥系統 override NOT applied to this match). Fix the platform or ` +
          `set GGD_COMBAT_ENV_BYPASS=1.`,
      );
      return normalizeCombatEnv(content);
    }
    const admin = parseCombatEnvDoc(await res.json());
    if (!admin) {
      console.error(
        `[combat-env] malformed combat-env body from ${url} — FAILING SAFE to content defaults.`,
      );
      return normalizeCombatEnv(content);
    }
    // Admin override beats the content default, key by key.
    return normalizeCombatEnv({ ...content, ...admin });
  } catch (err) {
    console.error(
      `[combat-env] could not reach the platform at ${url} — FAILING SAFE to content defaults ` +
        `(admin 戰鬥系統 override NOT applied to this match).`,
      err,
    );
    return normalizeCombatEnv(content);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A tiny TTL cache so a burst of match creations shares a single fetch. Each
 * match still snapshots its own frozen table via get(); within the TTL window
 * that table is reused. Never throws (fetchCombatEnv fails safe).
 */
export class CombatEnvCache {
  private cached: CombatEnvMultipliers | null = null;
  private expiresAt = 0;
  private inflight: Promise<CombatEnvMultipliers> | null = null;

  constructor(
    private readonly baseUrl: string = PLATFORM_URL,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly opts: FetchOpts = {},
  ) {}

  async get(now: number = Date.now()): Promise<CombatEnvMultipliers> {
    if (this.cached && now < this.expiresAt) return this.cached;
    if (this.inflight) return this.inflight;
    // Expiry is measured off the same clock reading passed to get(), so an
    // injected test clock and the real Date.now() default both behave.
    const expiresAt = now + this.ttlMs;
    this.inflight = fetchCombatEnv(this.baseUrl, this.opts)
      .then((table) => {
        this.cached = table;
        this.expiresAt = expiresAt;
        return table;
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
let sharedCache: CombatEnvCache | null = null;
export function sharedCombatEnvCache(): CombatEnvCache {
  if (!sharedCache) sharedCache = new CombatEnvCache();
  return sharedCache;
}
