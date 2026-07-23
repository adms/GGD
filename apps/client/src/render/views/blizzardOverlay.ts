/**
 * blizzardOverlay — DEV-ONLY champion model fallback.
 *
 * COPYRIGHT GATE (content/assets/blizzard-local/README.md): the original
 * Warcraft III unit models are Blizzard-owned. They are extracted from the
 * developer's own MPQ archives into the git-ignored runtime store
 * `data/blizzard-overlay/`, which lives OUTSIDE the deployable `content/` tree
 * and is served ONLY by the vite dev middleware (`serveBlizzardOverlay()` in
 * apps/client/vite.config.ts) / the optional dev nginx include
 * (nginx/dev/blizzard-overlay.conf), both under the stable URL prefix
 * `/content/assets/blizzard-local/`. In any deployed build those URLs 404 and
 * this module resolves to exactly what it resolved to before it existed.
 *
 * WHAT IT DOES
 * ------------
 * Most `godie-*` champions ship with no model of their own: their `modelKey`
 * points at one of the four generic KayKit stand-ins under
 * `assets/models/champions/` (mage / rogue / barbarian / knight), shared by
 * dozens of champions. For those — and only those — this resolver substitutes
 * the champion's real WC3 unit model from the overlay manifest
 * (`assets/blizzard-local/MANIFEST.json`, unitId → { champId, glb, clips, … };
 * the same manifest task #27's voice fallback reads for `clips.what`).
 *
 * DEGRADATION CONTRACT (unchanged behavior when the overlay is absent)
 * -------------------------------------------------------------------
 *   • probe disabled (any non-dev build) → the shipped doc, no fetch at all;
 *   • probe in flight, champion has no dedicated model → `null`, i.e. "not yet"
 *     — ChampionView keeps its procedural voxel figure and retries next frame
 *     (exactly what it does before ContentDb resolves), so a slow overlay can
 *     never make a champion pop from stand-in → WC3 model mid-match;
 *   • probe settled with no overlay (404 / bad JSON / no entry) → the shipped
 *     doc, i.e. today's stand-in;
 *   • champion HAS a dedicated shipped model → that model, always. The overlay
 *     never overrides authored content.
 */
import type { ModelDoc } from "@ggd/shared/content";
import { BLIZZARD_LOCAL_GLB_PREFIX } from "./glbFacing";
import { fullAssetsEnabled } from "../../config/fullAssets";

/** Manifest path relative to the content mount (same doc as championVoice). */
export const BLIZZARD_OVERLAY_MANIFEST_PATH = "assets/blizzard-local/MANIFEST.json";

/** Content mount the overlay is served under in dev. */
export const CONTENT_BASE = "/content/";

/**
 * glbPath prefix of the four generic KayKit stand-in characters
 * (mage/rogue/barbarian/knight). A champion pointed at one of these has no
 * model of its own — that is the ONLY case the overlay fills in.
 */
export const STOCK_CHAMPION_GLB_PREFIX = "assets/models/champions/";

/**
 * The overlay .glbs are exported by tools/w3x-import already normalized to
 * ~1.7 world units tall (the same convention as the shipped
 * `imported.*` docs, which all carry scale 1.0), so no extra scaling.
 */
export const OVERLAY_MODEL_SCALE = 1;

/** Matches the shipped champion docs; only the sim would use it. */
export const OVERLAY_COLLISION_RADIUS = 0.6;

/** WC3 default clip names — used when a manifest entry carries no clipMap. */
export const DEFAULT_W3X_CLIP_MAP: ModelDoc["clipMap"] = {
  idle: "Stand",
  run: "Walk",
  attack: "Attack",
  cast: "Spell",
  hurt: "Stand",
  death: "Death",
};

/** One extracted unit, as the merged MANIFEST.json describes it. */
export interface BlizzardOverlayUnit {
  unitId: string;
  champId: string;
  /** content-relative path, e.g. "assets/blizzard-local/models/E00R.glb" */
  glb: string;
  clipMap: ModelDoc["clipMap"];
}

/** champId → unit. Empty map = manifest present but useless (still "settled"). */
export type BlizzardOverlayIndex = ReadonlyMap<string, BlizzardOverlayUnit>;

function asClipMap(v: unknown): ModelDoc["clipMap"] | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of ["idle", "run", "attack", "cast", "hurt", "death"] as const) {
    const s = o[k];
    if (typeof s !== "string" || s.length === 0) return null;
    out[k] = s;
  }
  return out as unknown as ModelDoc["clipMap"];
}

/**
 * Tolerant parse of the merged manifest — `{ units: { [unitId]: { champId,
 * glb, clipMap } } }`. Returns null when the doc is not a manifest at all;
 * individual malformed units are skipped, never thrown on. Entries whose glb
 * is not under the overlay prefix are REJECTED: a manifest can only ever point
 * at the local-only overlay, never at shipped content or a foreign URL.
 */
export function blizzardOverlayFromDoc(doc: unknown): BlizzardOverlayIndex | null {
  if (!doc || typeof doc !== "object") return null;
  const units = (doc as { units?: unknown }).units;
  if (!units || typeof units !== "object") return null;
  const out = new Map<string, BlizzardOverlayUnit>();
  for (const [unitId, raw] of Object.entries(units as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { champId?: unknown; glb?: unknown; clipMap?: unknown };
    if (typeof o.champId !== "string" || o.champId.length === 0) continue;
    if (typeof o.glb !== "string" || !o.glb.startsWith(BLIZZARD_LOCAL_GLB_PREFIX)) continue;
    // first entry wins — a champion is bound to exactly one unit
    if (out.has(o.champId)) continue;
    out.set(o.champId, {
      unitId,
      champId: o.champId,
      glb: o.glb,
      clipMap: asClipMap(o.clipMap) ?? DEFAULT_W3X_CLIP_MAP,
    });
  }
  return out;
}

/**
 * True when `doc` is a champion's OWN model (authored/imported), false when it
 * is missing or one of the shared KayKit stand-ins — the "no shipped model"
 * condition the overlay fills in.
 */
export function hasDedicatedShippedModel(doc: ModelDoc | null | undefined): boolean {
  if (!doc) return false;
  return !doc.glbPath.startsWith(STOCK_CHAMPION_GLB_PREFIX);
}

/** Synthesize the ModelDoc ChampionView needs for an overlay unit. */
export function overlayModelDoc(unit: BlizzardOverlayUnit): ModelDoc {
  return {
    id: `blizzard-local.${unit.unitId.toLowerCase()}`,
    schema: "model@1",
    glbPath: unit.glb,
    scale: OVERLAY_MODEL_SCALE,
    collisionRadius: OVERLAY_COLLISION_RADIUS,
    clipMap: unit.clipMap,
  };
}

/**
 * Is this bundle allowed to look for the overlay at all?
 *
 * WAS `import.meta.env.DEV` — which constant-folds to `false` in every
 * `vite build` output, so a deployed client never issued the manifest request
 * no matter how many bytes were mounted behind nginx. #176 replaced it with an
 * explicit build flag that still DEFAULTS to `import.meta.env.DEV`, so local
 * development is unchanged and a family deploy can opt in with
 * VITE_GGD_FULL_ASSETS=1. See apps/client/src/config/fullAssets.ts for why this
 * is the layer that decides the outcome.
 */
const isDevBuild = fullAssetsEnabled;

function defaultFetch(url: string): Promise<Response> {
  if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
  return fetch(url);
}

export interface BlizzardOverlayOptions {
  /** probe the local-only overlay manifest (default: dev builds only) */
  enabled?: boolean;
  /** content mount base, default "/content/" */
  baseUrl?: string;
  fetchFn?: (url: string) => Promise<Response>;
  warn?: (msg: string, err?: unknown) => void;
}

/**
 * Single-flight, 404-tolerant probe of the overlay manifest plus the
 * synchronous resolve the EntityViewRegistry's `modelDocFor` hook needs.
 */
export class BlizzardOverlayModels {
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string) => Promise<Response>;
  private readonly warn: (msg: string, err?: unknown) => void;
  /** null until the probe settles; then the (possibly empty) index. */
  private idx: BlizzardOverlayIndex | null = null;
  private promise: Promise<BlizzardOverlayIndex | null> | null = null;

  readonly enabled: boolean;

  constructor(opts: BlizzardOverlayOptions = {}) {
    this.enabled = opts.enabled ?? isDevBuild();
    this.baseUrl = opts.baseUrl ?? CONTENT_BASE;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[blizzard-overlay] ${msg}`, err ?? ""));
  }

  /** True once the probe has settled (or was never going to run). */
  get settled(): boolean {
    return !this.enabled || this.idx !== null;
  }

  /** Loaded index, or null while the probe is disabled/in flight. */
  get index(): BlizzardOverlayIndex | null {
    return this.enabled ? this.idx : null;
  }

  /** Cached single-flight probe. Resolves null when the overlay is absent. */
  load(): Promise<BlizzardOverlayIndex | null> {
    if (!this.enabled) return Promise.resolve(null);
    if (!this.promise) {
      this.promise = this.fetchManifest().then((doc) => {
        const parsed = doc === null ? null : blizzardOverlayFromDoc(doc);
        // settle either way: a missing/garbage manifest must stop holding
        // champions back (they fall through to the shipped stand-in).
        this.idx = parsed ?? new Map<string, BlizzardOverlayUnit>();
        return parsed;
      });
    }
    return this.promise;
  }

  /** The overlay unit bound to a champion (null until loaded / not covered). */
  unitFor(champId: string | null | undefined): BlizzardOverlayUnit | null {
    if (!champId || !this.enabled) return null;
    return this.idx?.get(champId) ?? null;
  }

  /**
   * The model doc a champion should render with. `shipped` is whatever the
   * authored content resolved to (null while ContentDb is still loading).
   * Returning null means "nothing to upgrade to yet" — the caller keeps its
   * procedural fallback and asks again next frame.
   */
  resolve(shipped: ModelDoc | null, champId: string | null | undefined): ModelDoc | null {
    // Authored content always wins; nothing to probe for.
    if (!this.enabled || hasDedicatedShippedModel(shipped)) return shipped;
    if (!champId) return shipped;
    if (this.idx === null) {
      void this.load(); // lazy kick-off: a caller can never forget to prime it
      return null; // hold the stand-in upgrade until the probe settles
    }
    const unit = this.idx.get(champId);
    return unit ? overlayModelDoc(unit) : shipped;
  }

  /** Fetch the manifest; null on 404 / bad JSON / network error. */
  private async fetchManifest(): Promise<unknown> {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
    try {
      const res = await this.fetchFn(base + BLIZZARD_OVERLAY_MANIFEST_PATH);
      if (!res.ok) return null; // 404 = overlay not extracted / not deployed
      return (await res.json()) as unknown;
    } catch (err) {
      this.warn(`${BLIZZARD_OVERLAY_MANIFEST_PATH} failed to load (silent)`, err);
      return null;
    }
  }
}

/** Process-wide probe (one manifest fetch per client session). */
export const blizzardOverlayModels = new BlizzardOverlayModels();
