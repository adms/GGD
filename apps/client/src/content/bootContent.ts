/**
 * bootContent — loads the FULL authored content set into the shared sim +
 * content registries at client boot, so every imported champion (93+) is
 * selectable in champ-select, predictable by LocalPrediction, and resolvable
 * for rendering. Mirrors packages/shared's loader.test.ts but over HTTP:
 *
 *     const { store } = await new ContentLoader(new HttpContentSource(...)).load();
 *     registerAll(store);
 *
 * If the fetch/parse/ref-check throws, we fall back to registerSkeletonContent()
 * (sela/thorne) so the game still works, and surface a non-fatal warning.
 *
 * Idempotent: `ensureContentLoaded()` runs the load exactly once (single-flight
 * promise) so HMR / re-entry / multiple boot paths never double-register.
 */
import {
  ContentLoader,
  HttpContentSource,
  registerAll,
  type ContentSource,
  type HttpContentSourceOptions,
} from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";

/** Default content mount — nginx serves it in prod; the vite plugin in dev. */
export const CONTENT_BASE_URL = "/content";

/**
 * Build HttpContentSource options with an explicitly-bound `fetch`. The shared
 * source stores the fetch fn and calls it as `this.fetchFn(url)`; the browser's
 * `fetch` throws "Illegal invocation" unless `this` is the global — so we wrap
 * it in an arrow that always calls the global `fetch`.
 */
function httpOptions(baseUrl: string): HttpContentSourceOptions {
  const opts: HttpContentSourceOptions = { baseUrl };
  if (typeof fetch === "function") opts.fetchFn = (input, init) => fetch(input, init);
  return opts;
}

export interface ContentBootResult {
  /** true = full content loaded; false = skeleton fallback (sela/thorne only). */
  ok: boolean;
  /** number of champions now in the registry (full roster or fallback 2). */
  championCount: number;
  /** manifest content version on success, e.g. "cv_7c552d1dfbe7". */
  contentVersion?: string;
  /** failure reason when `ok` is false. */
  error?: string;
}

export interface ContentBootOptions {
  /** content mount base (default "/content"). Ignored when `source` is given. */
  baseUrl?: string;
  /** inject a ContentSource (tests) — otherwise an HttpContentSource is built. */
  source?: ContentSource;
}

/**
 * Load + register all content once. Testable: pass a mock `source`. On any
 * failure it registers the skeleton fallback and returns `{ ok: false }` rather
 * than throwing, so the caller can boot the game with a warning.
 */
export async function loadAllContent(opts: ContentBootOptions = {}): Promise<ContentBootResult> {
  const source = opts.source ?? new HttpContentSource(httpOptions(opts.baseUrl ?? CONTENT_BASE_URL));
  try {
    const { store, manifest } = await new ContentLoader(source).load();
    registerAll(store);
    return { ok: true, championCount: Champions.ids().length, contentVersion: manifest.contentVersion };
  } catch (err) {
    registerSkeletonContent();
    return {
      ok: false,
      championCount: Champions.ids().length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---- content-ready signal (client-side, React-free) --------------------------
// Boot no longer blocks first paint: main.tsx paints the app shell immediately
// and kicks this load off in the BACKGROUND. This tiny observable lets the UI
// (via a ui/ hook) and the match-start gate learn when the registries are
// populated WITHOUT awaiting. `phase` flips loading→ready the moment the
// single-flight load settles — full set OR skeleton fallback, either way the
// registry is usable. Kept dependency-free (no React) so it stays testable and
// obeys the client-08 arch gate (React only under ui/* + main.tsx).

export type ContentBootPhase = "loading" | "ready";

export interface ContentBootSnapshot {
  phase: ContentBootPhase;
  /** the settled boot result once `phase === "ready"` (null while loading). */
  result: ContentBootResult | null;
}

/** Stable-identity snapshot: only re-assigned on an actual change, so it is
 *  safe to hand straight to React's useSyncExternalStore (no render loop). */
let bootSnapshot: ContentBootSnapshot = { phase: "loading", result: null };
const bootListeners = new Set<() => void>();

function publishBootSnapshot(next: ContentBootSnapshot): void {
  bootSnapshot = next;
  for (const l of [...bootListeners]) l();
}

/** Current content-boot snapshot (stable identity between changes). */
export function getContentBootSnapshot(): ContentBootSnapshot {
  return bootSnapshot;
}

/** Subscribe to content-boot phase changes; returns an unsubscribe fn. */
export function subscribeContentBoot(listener: () => void): () => void {
  bootListeners.add(listener);
  return () => {
    bootListeners.delete(listener);
  };
}

/** true once the registries are populated (full set or skeleton fallback). */
export function isContentReady(): boolean {
  return bootSnapshot.phase === "ready";
}

let bootPromise: Promise<ContentBootResult> | null = null;

/** Single-flight content boot — safe to call from any/every boot path or HMR. */
export function ensureContentLoaded(opts: ContentBootOptions = {}): Promise<ContentBootResult> {
  if (!bootPromise) {
    bootPromise = loadAllContent(opts).then((res) => {
      // Flip the readiness signal the moment the load settles. loadAllContent
      // never rejects (on failure it registers the skeleton fallback and
      // returns ok:false), so reaching here always means the registries are
      // usable — the match-start gate can proceed.
      publishBootSnapshot({ phase: "ready", result: res });
      return res;
    });
  }
  return bootPromise;
}

/** Test-only: forget the single-flight promise + reset the signal to loading. */
export function __resetContentBoot(): void {
  bootPromise = null;
  publishBootSnapshot({ phase: "loading", result: null });
}
