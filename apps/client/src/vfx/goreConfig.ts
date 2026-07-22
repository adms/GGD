/**
 * goreConfig — the STYLE KNOB for the blood / impact-debris layer (task #39).
 *
 * This is an anime brawler whose roster is Pikachu, 初音 and 妙蛙種子 next to
 * 死亡騎士 and 鋼彈, so "how bloody is a hit" is a tone decision, not a
 * hard-coded one. Three styles:
 *
 *   · "blood"    — red droplets + mist + a fading ground pool (the DEFAULT;
 *                  this is what the 濺血 request asked for)
 *   · "stylized" — the same directional spray, but as a damage-type-tinted
 *                  energy burst with NO red and no ground pool (the setting a
 *                  streamer / a squeamish player / a ratings board wants)
 *   · "off"      — the blood layer emits NOTHING at all (task #33's impact kit
 *                  still fires, so hits keep reading — they just don't bleed)
 *
 * Three layers feed the effective config, most specific last:
 *   1. DEFAULT_GORE_CONFIG            — the shipped contract (blood, 0.85)
 *   2. content/config/gore.json       — art-directed baseline + per-champion
 *                                       overrides (`applyGoreDoc`)
 *   3. the user's graphics settings   — style choice + intensity MULTIPLIER
 *                                       (`setGoreOverride`)
 *
 * Per-champion overrides can only ever make a hit LESS bloody
 * (`off < stylized < blood`, resolved with `minGoreStyle`): a mechanical or
 * undead champion never bleeds red, and — crucially — a champion doc can never
 * re-introduce blood for a player who chose "stylized" or "off". The player's
 * choice is a floor, never a suggestion.
 *
 * Deliberately Babylon-free plain data so the content layer (ContentDb) can
 * push the doc in without dragging the render seam along (client-08 gate).
 */

/** How a landed hit sprays. */
export type GoreStyle = "blood" | "stylized" | "off";

/** Every style, most-bloody last (also the `minGoreStyle` ordering). */
export const GORE_STYLES: readonly GoreStyle[] = ["off", "stylized", "blood"];

/** Rank used to pick the LESS bloody of two styles. */
const GORE_RANK: Record<GoreStyle, number> = { off: 0, stylized: 1, blood: 2 };

export interface GoreConfig {
  /** global style (the art-directed baseline, overridable by the user) */
  style: GoreStyle;
  /** 0..1 spray density/size multiplier (0 = the layer emits nothing) */
  intensity: number;
  /** championId → per-champion style; may only REDUCE gore, never raise it */
  championStyles: Readonly<Record<string, GoreStyle>>;
}

/** The shipped contract: red blood at a strong-but-not-silly density. */
export const DEFAULT_GORE_CONFIG: GoreConfig = {
  style: "blood",
  intensity: 0.85,
  championStyles: {},
};

/** The user's layer: a style choice ("default" = defer) + an intensity scale. */
export interface GoreOverride {
  /** "default" defers to the content doc; anything else wins outright */
  style: GoreStyle | "default";
  /** 0..1 multiplier applied ON TOP of the content doc's intensity */
  intensityScale: number;
}

export const DEFAULT_GORE_OVERRIDE: GoreOverride = { style: "default", intensityScale: 1 };

/** Resolved, ready-to-fire settings for ONE hit. */
export interface ResolvedGore {
  style: GoreStyle;
  /** 0..1; always 0 when style is "off" */
  intensity: number;
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(1, Math.max(0, n));
}

function asStyle<F>(v: unknown, fallback: F): GoreStyle | F {
  return v === "blood" || v === "stylized" || v === "off" ? v : fallback;
}

/** The LESS bloody of two styles (off < stylized < blood). */
export function minGoreStyle(a: GoreStyle, b: GoreStyle): GoreStyle {
  return GORE_RANK[a] <= GORE_RANK[b] ? a : b;
}

/** Coerce any raw/partial blob (content doc, storage) onto a valid config. */
export function normalizeGoreConfig(raw: unknown, base: GoreConfig = DEFAULT_GORE_CONFIG): GoreConfig {
  const o = (raw ?? {}) as Partial<GoreConfig>;
  const styles: Record<string, GoreStyle> = {};
  const rawStyles = (o.championStyles ?? {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(rawStyles)) {
    const s = asStyle(v, "blood");
    // an override that doesn't reduce gore is pointless — drop it so the map
    // can never be used to force blood onto a champion
    if (s !== "blood") styles[id] = s;
  }
  return {
    style: asStyle(o.style, base.style),
    intensity: typeof o.intensity === "number" ? clamp01(o.intensity) : base.intensity,
    championStyles: styles,
  };
}

/** Coerce a raw user override (settings blob) onto a valid override. */
export function normalizeGoreOverride(raw: unknown): GoreOverride {
  const o = (raw ?? {}) as Partial<GoreOverride>;
  return {
    style: o.style === "default" ? "default" : asStyle(o.style, "default"),
    intensityScale: typeof o.intensityScale === "number" ? clamp01(o.intensityScale) : 1,
  };
}

/**
 * Fold the user override onto the content config: an explicit style wins
 * outright, the intensity scale multiplies. PURE.
 */
export function mergeGore(cfg: GoreConfig, override: GoreOverride): GoreConfig {
  return {
    style: override.style === "default" ? cfg.style : override.style,
    intensity: clamp01(cfg.intensity * clamp01(override.intensityScale)),
    championStyles: cfg.championStyles,
  };
}

/**
 * Resolve the style + intensity for a hit on `championId`. PURE.
 *   · "off" (or intensity 0) → nothing at all, whatever the champion says
 *   · a per-champion override may only REDUCE gore (minGoreStyle)
 */
export function resolveGore(cfg: GoreConfig, championId?: string | null): ResolvedGore {
  if (cfg.style === "off") return { style: "off", intensity: 0 };
  const perChamp = championId ? cfg.championStyles[championId] : undefined;
  const style = perChamp ? minGoreStyle(cfg.style, perChamp) : cfg.style;
  if (style === "off") return { style: "off", intensity: 0 };
  const intensity = clamp01(cfg.intensity);
  // an intensity of 0 is an "off" by another name — say so, so callers can
  // take the same cheap early-out
  return intensity <= 0 ? { style: "off", intensity: 0 } : { style, intensity };
}

// ---------------------------------------------------------------------------
// Process-wide state (plain pub/sub — no Zustand, no Babylon)
// ---------------------------------------------------------------------------

let contentCfg: GoreConfig = DEFAULT_GORE_CONFIG;
let userOverride: GoreOverride = DEFAULT_GORE_OVERRIDE;
let effective: GoreConfig = DEFAULT_GORE_CONFIG;
const listeners = new Set<(cfg: GoreConfig) => void>();

function recompute(): void {
  effective = mergeGore(contentCfg, userOverride);
  for (const fn of listeners) fn(effective);
}

/** The live effective config (content doc + user override). */
export function goreConfig(): GoreConfig {
  return effective;
}

/**
 * Ingest `content/config/gore.json` (or null when it's absent/404 — the
 * shipped default then stands). Called by ContentDb once content settles.
 */
export function applyGoreDoc(doc: unknown): void {
  contentCfg = doc ? normalizeGoreConfig(doc) : DEFAULT_GORE_CONFIG;
  recompute();
}

/** Apply the user's graphics-settings layer (style choice + intensity scale). */
export function setGoreOverride(raw: Partial<GoreOverride>): void {
  userOverride = normalizeGoreOverride({ ...userOverride, ...raw });
  recompute();
}

/** Subscribe to effective-config changes; returns an unsubscriber. */
export function onGoreConfigChange(fn: (cfg: GoreConfig) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test seam: drop back to the shipped contract. */
export function resetGoreConfig(): void {
  contentCfg = DEFAULT_GORE_CONFIG;
  userOverride = DEFAULT_GORE_OVERRIDE;
  recompute();
}
