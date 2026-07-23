/**
 * PER-INVOCATION ART PARAMS (task #50).
 *
 * One primitive-generated doc should serve many abilities with DIFFERENT
 * looks. `ArtParams` is that knob set: `scale`, `tint`, `alpha`, `count`,
 * `timeScale` transform the DOC (they map onto vfx@1 fields, so the transform
 * is authored once and rides the existing particleFactory → VfxSystem path);
 * `heightY` and `facingDeg` are SPATIAL and don't live in a VfxDoc — they are
 * surfaced for the invocation site (VfxSystem.play already takes a world `y`;
 * a directed emitter reads `facingDeg`), returned by `resolveSpatial`.
 *
 * Pure + unit-tested. Applying no params returns the doc unchanged (identity).
 */
import type { VfxDoc } from "@ggd/shared/content";
import type { Rgb } from "./primitives";

export interface ArtParams {
  /** multiply every size + the emitter radius */
  scale?: number;
  /** recolour: replace the ramp hue while keeping its white-hot→cool shape */
  tint?: Rgb;
  /** multiply every stop's alpha (0..1) */
  alpha?: number;
  /** override the burst particle count */
  count?: number;
  /** stretch/compress lifetimes (>1 = slower/longer, <1 = snappier) */
  timeScale?: number;
  /** world-y the effect spawns at (torso ~1.0, ground ~0.1) — spatial */
  heightY?: number;
  /** facing in degrees for directed primitives (beam/slash) — spatial */
  facingDeg?: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** True when `p` carries no doc-affecting knob (identity fast-path). */
function isDocIdentity(p: ArtParams): boolean {
  return (
    (p.scale === undefined || p.scale === 1) &&
    p.tint === undefined &&
    (p.alpha === undefined || p.alpha === 1) &&
    p.count === undefined &&
    (p.timeScale === undefined || p.timeScale === 1)
  );
}

/**
 * Recolour a stop's rgb toward `tint` while preserving its luminance profile
 * (so the white-hot core stays whiter than the tint stop). We scale the tint
 * by the stop's original max channel — a full-bright core → near-white tint,
 * a cooled stop → a dim tint.
 */
function retint(rgba: readonly [number, number, number, number], tint: Rgb): [number, number, number, number] {
  // AVERAGE brightness (not max): a whitened core (all channels high) keeps a
  // higher level than a saturated single-hue tint stop, so recolouring keeps
  // the core-brighter-than-tint flash shape instead of collapsing them.
  const level = (rgba[0] + rgba[1] + rgba[2]) / 3;
  return [round4(clamp01(tint[0] * level)), round4(clamp01(tint[1] * level)), round4(clamp01(tint[2] * level)), rgba[3]];
}

/**
 * Return a NEW VfxDoc with the doc-expressible art params applied. The doc is
 * treated as immutable; callers get a fresh object (safe to pool by a fresh
 * id). Spatial params (`heightY`/`facingDeg`) are ignored here — see
 * `resolveSpatial`.
 */
export function applyArtParams(doc: VfxDoc, p: ArtParams): VfxDoc {
  if (isDocIdentity(p)) return doc;
  const scale = p.scale ?? 1;
  const alpha = p.alpha ?? 1;
  const ts = p.timeScale ?? 1;

  const out: VfxDoc = { ...doc };

  if (scale !== 1) {
    out.size = { start: round(doc.size.start * scale) || 1e-3, end: round(doc.size.end * scale) };
    if (doc.sizeStops) out.sizeStops = doc.sizeStops.map(([t, s]) => [t, round(s * scale)]) as VfxDoc["sizeStops"];
    if (doc.emitter.shape === "sphere") out.emitter = { ...doc.emitter, radius: round(doc.emitter.radius * scale) };
    else if (doc.emitter.shape === "cone") out.emitter = { ...doc.emitter, radius: round(doc.emitter.radius * scale) };
  }

  if (p.tint || alpha !== 1) {
    const mapStop = (rgba: readonly [number, number, number, number]): [number, number, number, number] => {
      const base = p.tint ? retint(rgba, p.tint) : ([...rgba] as [number, number, number, number]);
      base[3] = round4(clamp01(rgba[3] * alpha));
      return base;
    };
    out.color = { start: mapStop(doc.color.start), end: mapStop(doc.color.end) };
    if (doc.colorStops) out.colorStops = doc.colorStops.map(([t, c]) => [t, mapStop(c)]) as VfxDoc["colorStops"];
  }

  if (ts !== 1) {
    out.lifetimeSec = { min: round(doc.lifetimeSec.min * ts), max: round(doc.lifetimeSec.max * ts) };
  }

  if (p.count !== undefined) out.burstCount = Math.max(1, Math.round(p.count));

  return out;
}

/** The spatial params, defaulted, for the invocation site (play y / facing). */
export function resolveSpatial(p: ArtParams, defaults: { heightY: number; facingDeg: number } = { heightY: 1, facingDeg: 0 }): {
  heightY: number;
  facingDeg: number;
} {
  return { heightY: p.heightY ?? defaults.heightY, facingDeg: p.facingDeg ?? defaults.facingDeg };
}
