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
  BundleContentSource,
  ContentLoader,
  FallbackContentSource,
  HttpContentSource,
  registerAll,
  type ContentSource,
  type HttpContentSourceOptions,
} from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import { setContentAssetVersion } from "./assetVersion";

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
  /**
   * Which transport actually served the content: "bundle" = ONE request for
   * content/bundle.json; "per-doc" = the legacy 1 + 12 + 1,441-request path
   * (the bundle 404'd or failed its shape check). Surfaced so a stale deploy
   * is VISIBLE in the console instead of silently costing 1,453 round trips.
   */
  transport?: "bundle" | "per-doc";
  /** why the bundle was abandoned, when `transport === "per-doc"`. */
  transportReason?: string;
}

export interface ContentBootOptions {
  /** content mount base (default "/content"). Ignored when `source` is given. */
  baseUrl?: string;
  /** inject a ContentSource (tests) — otherwise the bundle+fallback pair is built. */
  source?: ContentSource;
  /**
   * Test/debug escape hatch: skip the bundle and go straight to per-doc
   * fetching. Production always leaves this off.
   */
  disableBundle?: boolean;
}

/**
 * Load + register all content once. Testable: pass a mock `source`. On any
 * failure it registers the skeleton fallback and returns `{ ok: false }` rather
 * than throwing, so the caller can boot the game with a warning.
 */
export async function loadAllContent(opts: ContentBootOptions = {}): Promise<ContentBootResult> {
  const baseUrl = opts.baseUrl ?? CONTENT_BASE_URL;
  const perDoc = (): HttpContentSource => new HttpContentSource(httpOptions(baseUrl));

  // Transport selection (this is ONLY a transport change — the ContentLoader,
  // the ContentStore and every registry below are identical either way):
  //   bundle  → 1 GET /content/bundle.json
  //   per-doc → 1 manifest + 12 _index.json + 1,441 doc GETs  (the old path,
  //             kept intact as the fallback so a stale/missing bundle cannot
  //             brick the client)
  let fallback: FallbackContentSource | null = null;
  let source: ContentSource;
  // undefined = the caller injected its own source, so we cannot name the transport
  let transport: "bundle" | "per-doc" | undefined;
  if (opts.source) {
    source = opts.source;
  } else if (opts.disableBundle) {
    source = perDoc();
    transport = "per-doc";
  } else {
    // same `this`-safe fetch binding as httpOptions() — see its note.
    const opt = httpOptions(baseUrl);
    fallback = new FallbackContentSource(
      new BundleContentSource(opt.fetchFn ? { baseUrl, fetchFn: opt.fetchFn } : { baseUrl }),
      perDoc(),
    );
    source = fallback;
  }

  try {
    const { store, manifest } = await new ContentLoader(source).load();
    registerAll(store);
    // Publish the tree's cache key. Every content ASSET url (glb / mp3 / icon)
    // is stamped `?h=<contentVersion>` from here on, which is the ONLY thing that
    // flips nginx from `no-cache` to `immutable` for those files. Set after the
    // load succeeds — a version we could not fully load must not pin assets.
    setContentAssetVersion(manifest.contentVersion);
    if (fallback) transport = fallback.didFallback ? "per-doc" : "bundle";
    return {
      ok: true,
      championCount: Champions.ids().length,
      contentVersion: manifest.contentVersion,
      ...(transport ? { transport } : {}),
      ...(fallback?.fallbackReason ? { transportReason: fallback.fallbackReason } : {}),
    };
  } catch (err) {
    registerSkeletonContent();
    return {
      ok: false,
      championCount: Champions.ids().length,
      error: err instanceof Error ? err.message : String(err),
      ...(fallback?.fallbackReason ? { transportReason: fallback.fallbackReason } : {}),
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
  setContentAssetVersion(null); // asset URLs return to the bare/revalidating form
  publishBootSnapshot({ phase: "loading", result: null });
}
