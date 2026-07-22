/**
 * useAssetConsole — the I/O half of the asset console.
 *
 * THE LIVE ELEMENT THAT MATTERS MOST IS PROVIDER STATUS, so it polls. Not
 * because the value changes often, but because the moment an operator saves a
 * key in the admin console this page has to flip to the real state without
 * anyone reloading anything. A page that said "no provider configured" as
 * static text would be a stale report in a new place — which is the entire
 * failure mode this task exists to remove.
 *
 * Three independent feeds, deliberately not merged into one request:
 *
 *   readiness   GET /api/v1/ai/readiness      every 6s  (the running platform)
 *   spec        GET the published style spec  once + on demand
 *   stamp       GET the dev-server digest     alongside the spec
 *
 * Each fails independently and says so. A dead platform must not blank the
 * style spec, and a missing style spec must not hide provider status.
 *
 * FAILURE NEVER LOOKS LIKE SUCCESS: a failed poll leaves the previous answer
 * standing but marks the probe unreachable, and the page renders "cannot tell"
 * differently from "no provider" — the two have completely different fixes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  READINESS_URL,
  STAMP_URL,
  STYLE_SPEC_URL,
  compareFreshness,
  parseReadiness,
  parseStamp,
  parseStyleSpec,
  type Freshness,
  type ProviderProbe,
  type StampEntry,
  type StyleSpec,
} from "@ggd/shared/assetConsole/assetConsoleData";

/** Provider status re-check interval. Cheap: one small JSON, no auth. */
export const PROVIDER_POLL_MS = 6000;

/** An HTTP error that keeps its status, so callers can tell 404 from "dead". */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, signal ? { signal, cache: "no-store" } : { cache: "no-store" });
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

// ------------------------------------------------------------- provider ---

export interface ProviderState {
  readonly probe: ProviderProbe;
  readonly polling: boolean;
  readonly setPolling: (v: boolean) => void;
  readonly refresh: () => void;
  readonly checkedAt: number | null;
}

export function useProviderReadiness(): ProviderState {
  const [probe, setProbe] = useState<ProviderProbe>({ state: "loading" });
  const [polling, setPolling] = useState(true);
  const busy = useRef(false);

  const check = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const raw = await getJson(READINESS_URL);
      setProbe({ state: "ok", readiness: parseReadiness(raw), at: Date.now() });
    } catch (err) {
      setProbe({
        state: "unreachable",
        error: err instanceof Error ? err.message : String(err),
        status: err instanceof HttpError ? err.status : null,
        at: Date.now(),
      });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = (): void => {
      if (alive) void check();
    };
    run();
    const timer = polling ? setInterval(run, PROVIDER_POLL_MS) : null;
    return () => {
      alive = false;
      if (timer !== null) clearInterval(timer);
    };
  }, [polling, check]);

  return {
    probe,
    polling,
    setPolling,
    refresh: () => void check(),
    checkedAt: probe.state === "loading" ? null : probe.at,
  };
}

// ----------------------------------------------------------- style spec ---

export interface SpecState {
  readonly spec: StyleSpec | null;
  readonly stamp: readonly StampEntry[] | null;
  readonly freshness: Freshness;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

/**
 * Loads the published style spec AND, in the same pass, the dev server's live
 * digest of the Python sources it was generated from. They are fetched together
 * because a spec without its freshness check is exactly the artefact this page
 * refuses to display uncritically.
 */
export function useStyleSpec(): SpecState {
  const [spec, setSpec] = useState<StyleSpec | null>(null);
  const [stamp, setStamp] = useState<readonly StampEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const specP = getJson(STYLE_SPEC_URL).then(parseStyleSpec, () => null);
    // The stamp endpoint is dev-only. Its absence is a normal, expected state
    // (a production build) — never an error, but never silently ignored either:
    // it downgrades freshness to "unknown", which the page renders loudly.
    const stampP = getJson(STAMP_URL).then(parseStamp, () => null);

    void Promise.all([specP, stampP]).then(([s, st]) => {
      if (!alive) return;
      setSpec(s);
      setStamp(st);
      if (s === null) {
        setError(
          `找不到或無法解析 ${STYLE_SPEC_URL} —— 先執行 python3 tools/icon-console/emit_style_spec.py`,
        );
      }
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [epoch]);

  return {
    spec,
    stamp,
    freshness: compareFreshness(spec?.sources ?? [], stamp),
    loading,
    error,
    reload: useCallback(() => setEpoch((e) => e + 1), []),
  };
}
