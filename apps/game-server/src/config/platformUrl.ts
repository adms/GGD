/**
 * Platform URL + env resolution for the game-server's platform fetches
 * (curation whitelist in curation/whitelist.ts, combat-env override in
 * config/combatEnv.ts).
 *
 * DEV-ENV FAIL-SAFE (task #48). In the cluster the game-server reaches the
 * platform through the k8s service host `platform:8080`. That name only
 * resolves inside the cluster — on a developer's box (or in a unit test) it is
 * an unresolvable host, so the whitelist and combat-env fetches would abort and
 * the callers would have to fail safe on EVERY match. Two defenses live here so
 * that a dev box behaves sanely by default:
 *
 *   1. the platform base URL is read from GGD_PLATFORM_URL with a sensible
 *      LOCALHOST fallback (http://localhost:8080 — the port the platform binds
 *      in local dev). The k8s deployment sets GGD_PLATFORM_URL=http://platform:8080
 *      explicitly; a dev box with nothing set therefore talks to a
 *      locally-running platform instead of an unresolvable cluster host.
 *   2. warnOnce() collapses the loud fail-safe degradation logs to a single
 *      clear line per distinct condition, so an offline dev box (or a real
 *      platform outage in prod) reports the degradation once rather than
 *      spewing an identical error on every match creation.
 *
 * The actual FAIL-SAFE behavior (curation → allow-all, combat-env → bundled
 * content defaults) lives in the two caller modules; this module only owns URL
 * resolution and the one-time logging they share.
 */

type EnvLike = Record<string, string | undefined>;

/** The dev fallback: a platform bound on the same box (matches local dev). */
export const DEFAULT_PLATFORM_URL = "http://localhost:8080";

/**
 * Resolve the platform base URL from the environment. GGD_PLATFORM_URL wins
 * (k8s sets it to http://platform:8080); otherwise the localhost dev fallback.
 * A blank / whitespace-only value is treated as unset so an empty env var does
 * not turn into a broken base URL.
 */
export function resolvePlatformUrl(env: EnvLike = process.env): string {
  const raw = env.GGD_PLATFORM_URL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_PLATFORM_URL;
}

/** The resolved platform base URL for this process. */
export const PLATFORM_URL = resolvePlatformUrl();

// One-time degradation logging ------------------------------------------------

const warned = new Set<string>();

/**
 * Log a fail-safe degradation message exactly once per distinct `key` for the
 * lifetime of the process (or until resetWarnOnce()). Keeps an offline dev box
 * or a platform outage from logging the same line on every match creation while
 * still making the first, clear degradation obvious. Routed to console.error so
 * it surfaces at the same level as the original loud logs.
 */
export function warnOnce(key: string, message: string, ...rest: unknown[]): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (rest.length > 0) console.error(message, ...rest);
  else console.error(message);
}

/** Has a warnOnce key already fired? (tests / introspection) */
export function hasWarned(key: string): boolean {
  return warned.has(key);
}

/** Clear the warnOnce dedup set (tests). */
export function resetWarnOnce(): void {
  warned.clear();
}
