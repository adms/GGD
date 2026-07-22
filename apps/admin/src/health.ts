/**
 * Console Hub health state — a pure reducer over per-service ping status, plus
 * a small fetch-with-timeout probe. The reducer is unit-tested; the probe is a
 * thin async wrapper (injectable fetch) used by the UI on an interval.
 */

export type HealthStatus = "unknown" | "checking" | "up" | "down";

export type HealthState = Record<string, HealthStatus>;

/** Initial state: every key starts "unknown". */
export function initHealth(keys: string[]): HealthState {
  const out: HealthState = {};
  for (const k of keys) out[k] = "unknown";
  return out;
}

/** Mark a key as being probed. Unknown keys are added. */
export function startChecking(state: HealthState, key: string): HealthState {
  if (state[key] === "checking") return state;
  return { ...state, [key]: "checking" };
}

/** Fold a ping result into the state. */
export function applyPingResult(state: HealthState, key: string, ok: boolean): HealthState {
  const next: HealthStatus = ok ? "up" : "down";
  if (state[key] === next) return state;
  return { ...state, [key]: next };
}

/** Reduce many results at once (parallel probe completion). */
export function applyPingResults(state: HealthState, results: Record<string, boolean>): HealthState {
  let next = state;
  for (const [key, ok] of Object.entries(results)) {
    next = applyPingResult(next, key, ok);
  }
  return next;
}

/**
 * Probe a URL, resolving true when it answers within timeoutMs. Cross-origin
 * services often reject CORS, so a network-level *response* (even an opaque
 * one, or an error status) still counts as "reachable/up"; only a timeout or a
 * hard network failure counts as down.
 */
export async function pingOnce(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchFn(url, { method: "GET", mode: "no-cors", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
