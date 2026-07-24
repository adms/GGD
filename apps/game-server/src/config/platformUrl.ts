/**
 * Platform URL resolution + fail-safe degradation reporting for every
 * game-server → platform fetch (curation whitelist in curation/whitelist.ts,
 * combat-env in config/combatEnv.ts, server-ops in config/serverOps.ts).
 *
 * THE BUG THIS MODULE EXISTS TO KILL (task #48). The game-server originally
 * hardcoded the Kubernetes service host `platform:8080`. That name resolves
 * ONLY inside the cluster, so on the owner's dev box and on the LAN host it was
 * an unresolvable host on every single boot: the whitelist fetch aborted and
 * fell back to allow-all, the combat-env fetch aborted and fell back to the
 * bundled content defaults, and the server-ops fetch aborted and fell back to
 * compiled ceilings. All three failures were designed to be SILENT-ish
 * (fail-safe, never brick a match), which is exactly why this hid for so long:
 * the owner tuned multipliers in the admin console and then played matches that
 * had never once read them, with nothing in the logs saying so.
 *
 * The fix has three parts, all here:
 *
 *  1. RESOLUTION ORDER — explicit env, then a sensible local default, then the
 *     k8s name, and never the k8s name on a laptop:
 *
 *       a. GGD_PLATFORM_URL   explicit operator intent, always wins.
 *       b. http://platform:8080   ONLY when this process is demonstrably running
 *          inside a Kubernetes pod (KUBERNETES_SERVICE_HOST is injected into
 *          every pod by the kubelet). In-cluster that name is correct and
 *          `localhost` would be the game pod talking to ITSELF.
 *       c. http://localhost:8080   the dev/LAN default — the port the platform
 *          binds locally (see .claude/launch.json `platform`).
 *
 *     Deploys still set GGD_PLATFORM_URL explicitly (helm configmap, docker
 *     compose) — (b) is the safety net for a deploy that forgets, not the
 *     mechanism. Symmetrically, (c) means a dev box that sets nothing talks to
 *     the platform it actually has.
 *
 *  2. LOUD, NOT SILENT — warnOnce() prints a fail-safe degradation once per
 *     distinct condition (so an offline box does not spew per match) AND files
 *     it in a process-wide DEGRADATION REGISTRY. clearDegradation() retracts it
 *     when the platform comes back, so the registry describes NOW, not "ever".
 *
 *  3. SURFACED, NOT JUST LOGGED — the registry is served on GET /healthz
 *     (`platform` block in index.ts) and probed once at boot by
 *     probePlatformAtBoot(), which prints a banner naming the resolved URL, how
 *     it was chosen, and — when it answers — how many champions the curation
 *     list actually enables. "48 champions enabled" vs "UNREACHABLE → allow-all"
 *     on the boot line is the difference between tuning that works and tuning
 *     that quietly evaporates.
 *
 * The actual FAIL-SAFE behaviors (curation → allow-all, combat-env → bundled
 * content defaults, server-ops → compiled ceilings) stay in the caller modules;
 * this module owns URL resolution and the degradation reporting they share.
 */

type EnvLike = Record<string, string | undefined>;

/** The dev/LAN fallback: a platform bound on the same box (matches local dev). */
export const DEFAULT_PLATFORM_URL = "http://localhost:8080";

/** The Kubernetes Service host — correct IN-CLUSTER ONLY, never on a dev box. */
export const CLUSTER_PLATFORM_URL = "http://platform:8080";

/** Which rung of the resolution order produced the URL. */
export type PlatformUrlSource = "env" | "cluster" | "localhost";

export interface PlatformUrlResolution {
  /** the resolved base URL (no trailing slash normalization — callers strip) */
  readonly url: string;
  readonly source: PlatformUrlSource;
  /** human-readable one-liner for the boot log / healthz */
  readonly reason: string;
}

/**
 * Are we running inside a Kubernetes pod? The kubelet injects
 * KUBERNETES_SERVICE_HOST into every container's environment, so its presence
 * is the cheapest reliable in-cluster signal — and its ABSENCE is what keeps
 * `platform:8080` off a developer's laptop.
 */
export function isInCluster(env: EnvLike = process.env): boolean {
  return (env.KUBERNETES_SERVICE_HOST ?? "").trim().length > 0;
}

/**
 * Resolve the platform base URL and say WHY. See the resolution order in the
 * module docblock. A blank / whitespace-only GGD_PLATFORM_URL is treated as
 * unset so an empty env var does not turn into a broken base URL.
 */
export function resolvePlatformUrlDetailed(env: EnvLike = process.env): PlatformUrlResolution {
  const raw = env.GGD_PLATFORM_URL?.trim();
  if (raw && raw.length > 0) {
    return { url: raw, source: "env", reason: "GGD_PLATFORM_URL set explicitly" };
  }
  if (isInCluster(env)) {
    return {
      url: CLUSTER_PLATFORM_URL,
      source: "cluster",
      reason:
        "GGD_PLATFORM_URL unset and KUBERNETES_SERVICE_HOST is present — using the in-cluster " +
        "Service host. Set GGD_PLATFORM_URL in the deploy to be explicit.",
    };
  }
  return {
    url: DEFAULT_PLATFORM_URL,
    source: "localhost",
    reason:
      "GGD_PLATFORM_URL unset and not running in Kubernetes — using the local dev default. " +
      "Start the platform on :8080, or set GGD_PLATFORM_URL.",
  };
}

/** Resolve just the platform base URL (see resolvePlatformUrlDetailed). */
export function resolvePlatformUrl(env: EnvLike = process.env): string {
  return resolvePlatformUrlDetailed(env).url;
}

/** How this process resolved the platform, decided once at import. */
export const PLATFORM_URL_RESOLUTION = resolvePlatformUrlDetailed();

/** The resolved platform base URL for this process. */
export const PLATFORM_URL = PLATFORM_URL_RESOLUTION.url;

// Degradation registry --------------------------------------------------------

/** One active fail-safe degradation: what fell back, when, and how often. */
export interface Degradation {
  readonly key: string;
  readonly message: string;
  /** ISO timestamp of the FIRST occurrence in this degraded stretch */
  readonly since: string;
  /** how many times it has recurred (repeats are log-suppressed, not lost) */
  readonly occurrences: number;
}

const warned = new Map<string, { message: string; since: string; occurrences: number }>();

/**
 * Log a fail-safe degradation exactly once per distinct `key` (until the
 * condition clears) and file it in the registry so /healthz can show it.
 *
 * Once-per-key keeps an offline dev box or a platform outage from printing the
 * same line on every match creation, while the FIRST line is still loud and the
 * registry keeps counting the suppressed repeats. Routed to console.error so a
 * silent degradation is impossible to mistake for normal output.
 */
export function warnOnce(key: string, message: string, ...rest: unknown[]): void {
  const existing = warned.get(key);
  if (existing) {
    existing.occurrences += 1;
    return;
  }
  warned.set(key, { message, since: new Date().toISOString(), occurrences: 1 });
  if (rest.length > 0) console.error(message, ...rest);
  else console.error(message);
}

/**
 * Retract a degradation because the underlying fetch just SUCCEEDED. Callers
 * invoke this on their happy path so /healthz reports the platform as healthy
 * again after a transient outage instead of staying red for the process
 * lifetime — and so a LATER outage warns loudly again rather than being
 * swallowed by the first one's dedup entry.
 */
export function clearDegradation(...keys: string[]): void {
  for (const key of keys) warned.delete(key);
}

/** Has a warnOnce key fired and not been cleared? (tests / introspection) */
export function hasWarned(key: string): boolean {
  return warned.has(key);
}

/** Every currently-active degradation, oldest first. */
export function degradations(): Degradation[] {
  return [...warned.entries()]
    .map(([key, v]) => ({
      key,
      message: v.message,
      since: v.since,
      occurrences: v.occurrences,
    }))
    .sort((a, b) => a.since.localeCompare(b.since));
}

/** Clear the whole registry (tests). */
export function resetWarnOnce(): void {
  warned.clear();
}

/**
 * The `platform` block served on GET /healthz. An operator (or the owner
 * wondering why his tuned numbers did nothing) can curl the game-server and see
 * which platform it resolved, how, and whether anything is currently running on
 * fail-safe defaults.
 */
export function platformStatus(): {
  url: string;
  source: PlatformUrlSource;
  reason: string;
  degraded: boolean;
  degradations: Degradation[];
} {
  const active = degradations();
  return {
    url: PLATFORM_URL,
    source: PLATFORM_URL_RESOLUTION.source,
    reason: PLATFORM_URL_RESOLUTION.reason,
    degraded: active.length > 0,
    degradations: active,
  };
}

// Boot probe ------------------------------------------------------------------

/** Registry key for the boot-probe degradation (also cleared by a later 200). */
export const BOOT_PROBE_KEY = "platform-unreachable-boot";

export interface BootProbeResult {
  readonly ok: boolean;
  readonly url: string;
  readonly source: PlatformUrlSource;
  /** champions enabled by the curation whitelist, when the probe succeeded */
  readonly championCount?: number;
  readonly detail?: string;
}

/**
 * Probe the platform ONCE at boot and say — loudly — what the rest of this
 * process is going to do about it.
 *
 * This is the piece that makes #48 impossible to re-hide. The per-match
 * warnOnce lines only appear once someone starts a match and only in the middle
 * of a busy log; this prints a banner at startup, next to the "listening on
 * :2567" line the owner already reads, stating either
 *
 *   [platform] OK http://localhost:8080 (localhost) — curation: 48 champions enabled
 *
 * or a multi-line DEGRADED banner naming every subsystem that will serve
 * defaults. It probes the curation endpoint specifically because that is the
 * exact contract that was failing, and because the champion count is the number
 * that tells the owner whether he is playing HIS curated roster or allow-all.
 *
 * Never throws and never blocks boot: the caller fires it and moves on.
 */
export async function probePlatformAtBoot(
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; log?: typeof console.log } = {},
): Promise<BootProbeResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const log = opts.log ?? console.log;
  const { url, source, reason } = PLATFORM_URL_RESOLUTION;
  const probeUrl = `${url.replace(/\/$/, "")}/api/v1/curation/whitelist`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3_000);

  const degrade = (detail: string): BootProbeResult => {
    warnOnce(
      BOOT_PROBE_KEY,
      [
        "",
        "  ┌──────────────────────────────────────────────────────────────────────────┐",
        "  │ [platform] CANNOT REACH THE PLATFORM — THIS SHARD WILL SERVE DEFAULTS    │",
        "  └──────────────────────────────────────────────────────────────────────────┘",
        `    url     : ${url}  (source: ${source})`,
        `    why     : ${reason}`,
        `    probe   : ${probeUrl}`,
        `    error   : ${detail}`,
        "    effect  : curation  → ALLOW-ALL (your admin whitelist is NOT enforced)",
        "              combat-env→ bundled content defaults (your 戰鬥系統 tuning is NOT applied)",
        "              server-ops→ compiled maxRooms / snapshotHz (系統運維 values NOT applied)",
        "    fix     : start the platform on :8080, or set GGD_PLATFORM_URL to reach it.",
        "              This is task #48: these fallbacks used to be silent, which is how",
        "              matches ran on numbers nobody had tuned.",
        "",
      ].join("\n"),
    );
    return { ok: false, url, source, detail };
  };

  try {
    const res = await doFetch(probeUrl, { signal: controller.signal });
    if (!res.ok) return degrade(`HTTP ${res.status}`);
    const body = (await res.json()) as { champions?: unknown };
    const champions = Array.isArray(body?.champions) ? body.champions.length : 0;
    clearDegradation(BOOT_PROBE_KEY);
    log(
      `[platform] OK ${url} (source: ${source}) — curation: ${champions} champion(s) enabled` +
        (champions === 0
          ? "; whitelist is EMPTY, so champ-select shows the empty-state (apply the starter set in the admin console)"
          : ""),
    );
    return { ok: true, url, source, championCount: champions };
  } catch (err) {
    return degrade(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
