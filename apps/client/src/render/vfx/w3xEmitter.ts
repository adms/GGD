/**
 * W3X PARTICLE-EMITTER CONTRACT (the layer BENEATH the #123 primitive library).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The archaeology (`docs/legacy/_vfx-fidelity-w3x.md`) settled #98: a WC3 orb / locust
 * swarm / "particle effect" is a PARTICLE EMITTER BOUND TO AN ATTACHMENT POINT,
 * not a mesh. That is why `mdx→glb` produced ~1 KB shells — the geometry never
 * existed. 238 `PRE2` emitters across 132 imported models were dropped by the
 * converter, so re-converting can never work; the emitter has to be REBUILT.
 *
 * `primitives.ts` is the STYLISED rebuild (a readable nova/tornado/beam that
 * many abilities share). THIS file is the FAITHFUL one: a pure, total mapping
 * from the WC3 `ParticleEmitter2` parameter block onto a `vfx@1` doc, which the
 * shipped `vfx/particleFactory.toParticleSystem` already turns into a Babylon
 * `ParticleSystem`. So a WC3 effect becomes DATA, not bespoke code, and the
 * moment `tools/w3x-import` lands a raw emitter dump it is a data swap here —
 * not a rewrite.
 *
 * NO `@babylonjs` IMPORT ON PURPOSE. This module is pure so it runs in the doc
 * generator, in the editor and in Node tests with no GPU. The Babylon-side
 * concerns that a `vfx@1` doc cannot carry (model-space emission, flat quads,
 * animated emission tracks, pooling and disposal) live in `W3xEmitterRig.ts`,
 * which consumes `W3xEmitterRuntimeFlags` returned from here.
 *
 * THE BINARY THIS MIRRORS (`docs/legacy/_vfx-fidelity-w3x.md` §4.4, 171-byte payload)
 * -------------------------------------------------------------------------
 *   float32 speed, variation, latitude, gravity, lifespan, emissionRate,
 *           length, width
 *   uint32  filterMode {0 blend, 1 additive, 2 modulate, 3 modulate2x,
 *                       4 alphakey}
 *   uint32  rows, columns
 *   uint32  headOrTail {0 head, 1 tail, 2 both}
 *   float32 tailLength, timeMiddle
 *   float32 segmentColor[3][3]   // start / middle / end RGB 0..1
 *   uint8   segmentAlpha[3]
 *   float32 segmentScaling[3]
 *   int32   headIntervals[6], tailIntervals[6]
 *   uint32  textureId → TEXS[textureId]
 *   uint32  squirt               // 1 = one-shot burst
 *   int32   priorityPlane ; uint32 replaceableId
 *   node.flags 0x1000 particle · 0x8000 unshaded · 0x20000 lineEmitter
 *              0x80000 modelSpace · 0x100000 xYQuad
 *   optional KP2S/KP2R/KP2L/KP2G/KP2E/KP2N/KP2W/KP2V animation tracks
 *
 * EVERY MAPPING DECISION IS STATED. Where Babylon (or `vfx@1`) has no
 * equivalent, the closest behaviour is picked and the compromise is recorded in
 * the returned `notes` — machine-readable, so an audit page can list exactly
 * what was approximated instead of the reader having to trust prose.
 */
import type { VfxDoc, VfxBlendMode } from "@ggd/shared/content";

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * WC3 MODEL units → GGD world units.
 *
 * This is the SAME factor the glb exporter baked into every imported mesh
 * (`tools/w3x-import/extract_particles.py` DEFAULT_SCALE = 1/36, mirroring
 * `models.py`), so an emitter lands at the size of the model it was authored
 * against.
 *
 * NOT to be confused with the GAMEPLAY distance conversion `11/600` (600 WC3
 * range = 11 world units) used for ability ranges. They are different
 * conversions for different quantities; using `11/600` here shrinks every
 * emitter by ~1.5× ([[ggd-faithful-import-over-rescale]]: a verified WC3 value
 * beats a sanity cap — report it, do not quietly rescale it).
 *
 * Heroes are normalised to 1.7 units tall, so their emitters need that model's
 * own `scale_factor` passed as `opts.worldScale` instead of this default.
 */
export const W3X_MODEL_UNIT = 1 / 36;

/**
 * `latitude` UNIT WARNING. The MDX spec says radians. Empirically, this map's
 * v800 files store DEGREES (observed values 0..180 — `extract_particles.py`
 * confirms the same reading independently). A radians reading would collapse
 * every cone to <10°, i.e. every WC3 spray would render as a pencil beam.
 * Default therefore is "deg"; pass "rad" for a file that really stores radians.
 */
export type W3xAngleUnit = "deg" | "rad";

// ---------------------------------------------------------------------------
// The PRE2 parameter block, 1:1
// ---------------------------------------------------------------------------

/** `filterMode` enum, exactly as stored. */
export const W3X_FILTER_MODE = {
  blend: 0,
  additive: 1,
  modulate: 2,
  modulate2x: 3,
  alphaKey: 4,
} as const;
export type W3xFilterMode = (typeof W3X_FILTER_MODE)[keyof typeof W3X_FILTER_MODE];

/** `headOrTail` enum: which billboard the emitter draws. */
export const W3X_HEAD_OR_TAIL = { head: 0, tail: 1, both: 2 } as const;
export type W3xHeadOrTail = (typeof W3X_HEAD_OR_TAIL)[keyof typeof W3X_HEAD_OR_TAIL];

/** MDX node flag bits that change how the emitter behaves (not what it looks like). */
export const W3X_NODE_FLAG = {
  particleEmitter: 0x1000,
  unshaded: 0x8000,
  lineEmitter: 0x20000,
  modelSpace: 0x80000,
  xYQuad: 0x100000,
} as const;

/** A scalar `KP2*` animation track: (frameMs, value) keys on the model timeline. */
export interface W3xFloatTrack {
  /** [frame (ms on the model timeline), value] — sorted ascending by frame */
  keys: readonly (readonly [number, number])[];
  /** 0 none (step) · 1 linear · 2 hermite · 3 bezier (both resampled linearly) */
  interp?: number;
  /** global-sequence id, or -1 when the track runs on the model timeline */
  globalSeq?: number;
}

/**
 * One WC3 `ParticleEmitter2`. Field names mirror the binary (and the Python
 * `w3xlib.particles.ParticleEmitter2` dataclass) so the dataset the sibling
 * lane emits deserialises into this with no translation layer.
 */
export interface W3xParticleEmitter {
  /** MDX node name, e.g. "BlizParticle02" — diagnostics only */
  name: string;
  /** MDX object id */
  objectId?: number;
  /** parent node id; resolved by the extractor to `anchorNode` */
  parentId?: number;
  /** the BONE/ATCH node name this emitter hangs off (→ `anchorBone`) */
  anchorNode?: string;

  /** initial particle speed, WC3 model units/sec */
  speed: number;
  /** speed spread as a FRACTION of speed (0.5 = ±50%) */
  variation: number;
  /** max deviation from the emitter axis — see `W3xAngleUnit` */
  latitude: number;
  /** downward acceleration, WC3 model units/sec² (POSITIVE means down) */
  gravity: number;
  /** particle lifetime, seconds */
  lifespan: number;
  /** particles/sec (or, with `squirt`, particles per burst) */
  emissionRate: number;
  /** emission-rectangle FULL extent along the node's local Y */
  length: number;
  /** emission-rectangle FULL extent along the node's local X */
  width: number;

  filterMode: W3xFilterMode;
  /** flipbook grid over the texture (1×1 = no flipbook) */
  rows: number;
  cols: number;
  headOrTail: W3xHeadOrTail;
  /** tail stretch, WC3 model units */
  tailLength: number;
  /** where the MIDDLE colour/alpha/scale segment sits, 0..1 of lifespan */
  timeMiddle: number;

  /** [start, middle, end] RGB, each 0..1 */
  segmentColor: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
  /** [start, middle, end] alpha, each 0..255 */
  segmentAlpha: readonly [number, number, number];
  /** [start, middle, end] particle size, WC3 model units */
  segmentScaling: readonly [number, number, number];

  /** 1 = emit the whole `emissionRate` at once (a one-shot burst) */
  squirt?: number;
  /** MDX sort hint; see the mapping note — Babylon has no per-particle plane */
  priorityPlane?: number;
  /** MDX node flags (see `W3X_NODE_FLAG`) */
  flags?: number;

  /**
   * The emitter node's PIVOT in MDX model coordinates (`PIVT` chunk).
   *
   * THIS IS NOT COSMETIC. A WC3 multi-emitter effect gets much of its SHAPE
   * from where its emitters SIT, not from their parameters: `DivineRing`'s 20
   * emitters are near-identical and arranged in a circle — the ring IS the
   * pivot layout. Drop the pivots and all 20 collapse onto one point, which
   * renders as a single blinding column instead of a ring. (Exactly what the
   * audition page showed the first time this ran.)
   */
  pivot?: readonly [number, number, number];

  /** KP2E — emission rate over time */
  emissionTrack?: W3xFloatTrack;
  /** KP2V — visibility (0/1) over time; gates the emitter on animation */
  visibilityTrack?: W3xFloatTrack;
  /** KP2W / KP2N / KP2S / KP2R / KP2L / KP2G — the rest, keyed by tag */
  tracks?: Readonly<Record<string, W3xFloatTrack>>;
}

// ---------------------------------------------------------------------------
// Mapping options + the honest-compromise ledger
// ---------------------------------------------------------------------------

export interface W3xMappingOptions {
  /** doc id to stamp (must equal the content filename stem) */
  id: string;
  /** WC3 model units → world units (default `W3X_MODEL_UNIT`) */
  worldScale?: number;
  /** how `latitude` is stored in this file (default "deg", see the warning) */
  latitudeUnit?: W3xAngleUnit;
  /** content-relative texture path (`assets/...`); omitted when unresolved */
  texture?: string;
  /**
   * true when `texture` really is the WC3 atlas this emitter was authored
   * against. `rows`×`cols` slicing is only emitted when this holds — slicing a
   * SUBSTITUTED single-frame CC0 sprite into a 8×8 grid renders confetti.
   */
  textureIsAtlas?: boolean;
  /** true = an always-on attachment (orb / aura), not a one-shot cast */
  ambient?: boolean;
  /**
   * multiply the emission rate / burst count. 1 = faithful. The BUDGET is a
   * separate, explicit decision — see `emitterBudget.ts` — so fidelity and
   * performance never get silently mixed into one number.
   */
  densityScale?: number;
}

/** A single place where the rebuild could not be exact, and what was done. */
export interface W3xMappingNote {
  /** the WC3 concept, by its binary field name */
  field: string;
  /** "exact" · "approximated" · "dropped" */
  kind: "exact" | "approximated" | "dropped";
  /** what happened and why (shown verbatim on the audition page) */
  detail: string;
}

export interface W3xEmitterMapping {
  /** the `vfx@1` doc — schema-valid, renderable by the shipped factory */
  doc: VfxDoc;
  /** the WC3 behaviours the DOC cannot carry; applied by `W3xEmitterRig` */
  runtime: W3xEmitterRuntimeFlags;
  /** every non-exact decision, machine-readable */
  notes: W3xMappingNote[];
}

/**
 * WC3 behaviours that survive into Babylon but have no `vfx@1` field. These are
 * applied to the built `ParticleSystem` by `W3xEmitterRig` — keeping them OUT
 * of the doc means the 436 existing content docs stay valid and the schema
 * (owned by another lane) needs no change to land this engine.
 */
export interface W3xEmitterRuntimeFlags {
  /** node flag 0x80000: particles follow the emitter → `ps.isLocal = true` */
  modelSpace: boolean;
  /** node flag 0x100000: flat quad, not a camera billboard */
  xYQuad: boolean;
  /** node flag 0x20000: emit along a line rather than a rectangle */
  lineEmitter: boolean;
  /** `headOrTail === both` — needs a SECOND head-only system (see `expandHeadAndTail`) */
  wantsHeadAndTail: boolean;
  /** MDX sort hint, forwarded for a caller that wants renderingGroupId */
  priorityPlane: number;
  /**
   * The emitter's offset from its anchor, in WORLD units and Babylon axes.
   *
   * MDX is Z-up right-handed, glTF/Babylon is Y-up: `(x, y, z) → s·(x, z, −y)`,
   * the SAME conversion `tools/w3x-import/w3xlib/gltf.py` bakes into every
   * imported mesh, so an emitter lands where it does on the original model.
   */
  pivotOffset?: { x: number; y: number; z: number };
  /** KP2E over the model timeline, in SECONDS, world-scaled where applicable */
  emissionTrack?: W3xFloatTrack;
  /** KP2V over the model timeline, in SECONDS */
  visibilityTrack?: W3xFloatTrack;
  /** seconds per model frame-unit for the tracks above (MDX frames are ms) */
  trackFrameSec: number;
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
function finite(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}
function r3(v: number): number {
  const x = Math.round(v * 1000) / 1000;
  return x === 0 ? 0 : x;
}
function r4(v: number): number {
  const x = Math.round(v * 10000) / 10000;
  return x === 0 ? 0 : x;
}

/**
 * WC3 filter mode → `vfx@1` blend.
 *
 * COMPROMISE: `modulate2x` (3) has NO Babylon particle blend. Babylon offers
 * ONEONE / STANDARD / ADD / MULTIPLY / MULTIPLYADD; none is "multiply then
 * double". MULTIPLY is the closest — it keeps the darkening/tinting behaviour
 * and only loses the 2× brightening, which reads as a slightly dimmer effect
 * rather than a wrong one. (MULTIPLYADD would brighten but also stops the
 * emitter from darkening what is behind it, which is the point of modulate.)
 */
export function blendForFilterMode(mode: W3xFilterMode): VfxBlendMode {
  switch (mode) {
    case W3X_FILTER_MODE.additive:
      return "additive";
    case W3X_FILTER_MODE.modulate:
    case W3X_FILTER_MODE.modulate2x:
      return "modulate";
    case W3X_FILTER_MODE.alphaKey:
      return "alphaKey";
    case W3X_FILTER_MODE.blend:
    default:
      return "alpha";
  }
}

/**
 * Sample a `KP2*` track at `tSec`. MDX keys are frames on a millisecond
 * timeline; `frameSec` converts (1/1000 by default).
 *
 * Hermite/bezier tangents are dropped by the extractor, so every interpolation
 * is resampled LINEARLY here; step (`interp === 0`) holds the previous key.
 * The emitter tracks in this map are 2–3 keys, where linear is within a hair of
 * the original curve — but this IS an approximation and is reported as one.
 */
export function sampleTrack(track: W3xFloatTrack, tSec: number, frameSec = 1 / 1000): number {
  const keys = track.keys;
  if (keys.length === 0) return 0;
  const t = tSec / frameSec;
  if (t <= keys[0]![0]) return keys[0]![1];
  const last = keys[keys.length - 1]!;
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (t <= b[0]) {
      if (track.interp === 0) return a[1];
      const span = b[0] - a[0];
      const u = span <= 0 ? 0 : (t - a[0]) / span;
      return a[1] + (b[1] - a[1]) * u;
    }
  }
  return last[1];
}

/** Total duration of a track in seconds (0 when empty). */
export function trackDurationSec(track: W3xFloatTrack, frameSec = 1 / 1000): number {
  if (track.keys.length === 0) return 0;
  return (track.keys[track.keys.length - 1]![0] - track.keys[0]![0]) * frameSec;
}

/**
 * Three strictly-ascending gradient stop times for the WC3 start/middle/end
 * segments. `timeMiddle` may legitimately be 0 or 1 (a hard cut at one end);
 * `vfx@1` requires STRICTLY ascending stops, so the middle is nudged inside
 * (0,1) by one gradient epsilon. Visually indistinguishable, schema-valid.
 */
export function segmentStopTimes(timeMiddle: number): [number, number, number] {
  const EPS = 0.001;
  const mid = clamp(finite(timeMiddle, 0.5), EPS, 1 - EPS);
  return [0, r3(mid), 1];
}

// ---------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------

/**
 * WC3 `ParticleEmitter2` → a `vfx@1` doc + the runtime flags the doc cannot
 * carry + the ledger of every approximation.
 *
 * FIELD-BY-FIELD (the owner's condition 2 — judged, not guessed):
 *
 * | PRE2                       | Babylon / vfx@1                                   |
 * |----------------------------|---------------------------------------------------|
 * | `lifespan`                 | `minLifeTime = maxLifeTime` (WC3 has no spread)   |
 * | `emissionRate`             | `emitRate` — or `manualEmitCount` when `squirt`   |
 * | `speed` ± `variation`      | `minEmitPower` / `maxEmitPower`                   |
 * | `latitude`                 | `createConeEmitter(radius, angle)`                |
 * | `gravity`                  | `ps.gravity = (0, -gravity·scale, 0)`             |
 * | `width` / `length`         | cone base radius = max(w,l)/2 · scale             |
 * | `filterMode`               | `ps.blendMode` (see `blendForFilterMode`)         |
 * | `segmentColor` + `Alpha`   | `addColorGradient` × 3                            |
 * | `segmentScaling`           | `addSizeGradient` × 3                             |
 * | `rows` × `cols`            | sprite-cell flipbook                              |
 * | `headOrTail` + `tailLength`| `BILLBOARDMODE_STRETCHED` + `minScaleY/maxScaleY` |
 * | `textureId`                | `ps.particleTexture`                              |
 * | `parentId` → bone name     | emitter parented to that glb joint                |
 * | `squirt`                   | burst mode                                        |
 * | node `modelSpace`          | `ps.isLocal`                                      |
 * | node `xYQuad`              | `ps.isBillboardBased = false`                     |
 * | node `unshaded`            | no-op — Babylon particles are already unlit       |
 * | `priorityPlane`            | NO equivalent; forwarded, not applied             |
 * | `KP2*` tracks              | ⭐ `vfx@1` 的 `tracks.*`（GH#761 AC③）；執行期由 `W3xEmitterRig` 逐幀重播 |
 */
export function w3xEmitterToVfxDoc(em: W3xParticleEmitter, opts: W3xMappingOptions): W3xEmitterMapping {
  const notes: W3xMappingNote[] = [];
  const scale = opts.worldScale ?? W3X_MODEL_UNIT;
  const density = opts.densityScale ?? 1;
  const flags = em.flags ?? 0;

  // -- lifetime -------------------------------------------------------------
  // WC3 has ONE lifespan; Babylon takes a range. Faithful = min === max. The
  // primitive library deliberately spreads lifetimes to fake an ember tail;
  // that is a STYLE choice and must not leak into the faithful path.
  const life = Math.max(0.02, finite(em.lifespan, 0.5));
  if (em.lifespan <= 0) {
    notes.push({ field: "lifespan", kind: "approximated", detail: `lifespan ${em.lifespan} is not positive; clamped to ${life}s (vfx@1 requires > 0)` });
  }

  // -- emitter shape --------------------------------------------------------
  // WC3 emits from a RECTANGLE of `width` × `length` (full extents, halved
  // about the node — same as mdx-m3-viewer), sprayed within `latitude` of the
  // node axis. `vfx@1` offers point/sphere/cone only, so the rectangle becomes
  // the disc that bounds it: radius = max(width, length) / 2.
  const halfExtent = (Math.max(finite(em.width), finite(em.length)) / 2) * scale;
  const radius = Math.max(0.001, r3(halfExtent));
  if (em.width !== em.length) {
    notes.push({ field: "width/length", kind: "approximated", detail: `rectangular ${r3(em.width)}×${r3(em.length)} emission plane → bounding disc r=${radius} (vfx@1 has no box emitter)` });
  }
  const latDeg = opts.latitudeUnit === "rad" ? (finite(em.latitude) * 180) / Math.PI : finite(em.latitude);
  const angleDeg = clamp(r3(latDeg), 1, 180);
  if (latDeg < 1) {
    notes.push({ field: "latitude", kind: "approximated", detail: `latitude ${r3(latDeg)}° raised to the schema minimum 1° (a 0° cone is a perfectly straight line, which Babylon cannot express)` });
  }

  // -- speed ----------------------------------------------------------------
  // `variation` is a FRACTION of speed. A NEGATIVE speed is a real authoring
  // idiom (an inward-collapsing ring); Babylon emit power is a magnitude along
  // the emitter's outward direction, so the sign is folded and reported rather
  // than silently producing a still emitter.
  const varFrac = Math.abs(finite(em.variation));
  const speedMag = Math.abs(finite(em.speed));
  const speedMin = r4(speedMag * Math.max(0, 1 - varFrac) * scale);
  const speedMax = r4(speedMag * (1 + varFrac) * scale);
  if (em.speed < 0) {
    notes.push({ field: "speed", kind: "approximated", detail: `negative speed ${r3(em.speed)} (inward emission) folded to magnitude — Babylon emit power has no inward direction` });
  }

  // -- gravity --------------------------------------------------------------
  // WC3 gravity is a POSITIVE downward acceleration; vfx@1 is signed with
  // negative = down. Sign flip, then world-scale.
  const gravityY = r3(-finite(em.gravity) * scale);

  // -- colour / size over life ---------------------------------------------
  const [t0, t1, t2] = segmentStopTimes(em.timeMiddle);
  const colorStops = ([0, 1, 2] as const).map((i) => {
    const rgb = em.segmentColor[i] ?? ([1, 1, 1] as const);
    const a = clamp01(finite(em.segmentAlpha[i], 255) / 255);
    return [
      [t0, t1, t2][i]!,
      [r3(clamp01(finite(rgb[0], 1))), r3(clamp01(finite(rgb[1], 1))), r3(clamp01(finite(rgb[2], 1))), r3(a)],
    ] as [number, [number, number, number, number]];
  });
  const sizes = ([0, 1, 2] as const).map((i) => Math.max(0, finite(em.segmentScaling[i], 1) * scale));
  // vfx@1 requires size.start > 0; a genuinely-zero start segment is a legal
  // WC3 "grow in from nothing", so it becomes the smallest expressible size
  // rather than being rewritten into something visible.
  const startSize = Math.max(0.001, r3(sizes[0]!));
  const sizeStops: [number, number][] = [
    [t0, startSize],
    [t1, r3(sizes[1]!)],
    [t2, r3(sizes[2]!)],
  ];

  // -- emission -------------------------------------------------------------
  let rate = finite(em.emissionRate);
  if (rate < 0) {
    notes.push({ field: "emissionRate", kind: "approximated", detail: `negative emissionRate ${r3(rate)} folded to magnitude (authoring quirk)` });
    rate = Math.abs(rate);
  }
  if (rate <= 0 && em.emissionTrack && em.emissionTrack.keys.length > 0) {
    const peak = Math.max(...em.emissionTrack.keys.map(([, v]) => v));
    if (peak > 0) {
      rate = peak;
      notes.push({ field: "emissionRate", kind: "approximated", detail: `static emissionRate is 0; the emitter is driven entirely by its KP2E track — using its peak ${r3(peak)} as the base rate (W3xEmitterRig re-applies the real curve at runtime)` });
    }
  }
  if (rate <= 0) {
    rate = 10;
    notes.push({ field: "emissionRate", kind: "approximated", detail: "no usable emission rate anywhere; fell back to 10/s so the emitter is at least visible" });
  }

  const doc: VfxDoc = {
    id: opts.id,
    schema: "vfx@1",
    emitter: { shape: "cone", radius, angleDeg },
    mode: em.squirt ? "burst" : "continuous",
    lifetimeSec: { min: r3(life), max: r3(life) },
    size: { start: startSize, end: r3(sizes[2]!) },
    color: { start: colorStops[0]![1], end: colorStops[2]![1] },
    colorStops,
    sizeStops,
    blendMode: blendForFilterMode(em.filterMode),
    speed: { min: speedMin, max: speedMax },
  };

  if (em.squirt) {
    // `squirt` emits the whole rate in one instant instead of per second.
    doc.burstCount = Math.max(1, Math.round(rate * density));
  } else {
    doc.rate = Math.max(0.001, r3(rate * density));
  }

  if (gravityY !== 0) doc.gravityY = gravityY;

  if (opts.texture) {
    doc.texture = opts.texture;
    if (em.rows > 1 || em.cols > 1) {
      if (opts.textureIsAtlas) {
        doc.spriteSheet = { rows: Math.max(1, Math.trunc(em.rows)), cols: Math.max(1, Math.trunc(em.cols)), cycleSec: r3(life), randomStartCell: true };
      } else {
        notes.push({ field: "rows/cols", kind: "dropped", detail: `${em.rows}×${em.cols} flipbook dropped — the bound texture is a substituted single-frame sprite, and slicing it into cells renders garbage rather than an animation` });
      }
    }
  } else if (em.rows > 1 || em.cols > 1) {
    notes.push({ field: "rows/cols", kind: "dropped", detail: `${em.rows}×${em.cols} flipbook dropped — no texture resolved for this emitter` });
  }

  if (em.headOrTail !== W3X_HEAD_OR_TAIL.head) {
    doc.stretched = true;
    const tail = finite(em.tailLength);
    doc.tailLength = Math.max(0.001, r3(tail > 0 ? tail : 1));
  }
  if (em.headOrTail === W3X_HEAD_OR_TAIL.both) {
    notes.push({ field: "headOrTail", kind: "approximated", detail: '"both" draws a head billboard AND a stretched tail from the same particle. One Babylon ParticleSystem has ONE billboardMode, so this doc is the TAIL half; call expandHeadAndTail() to also get the head half as a second system' });
  }

  if (em.anchorNode) doc.anchorBone = em.anchorNode;
  if (opts.ambient) doc.ambient = true;

  // -- the flags a vfx@1 doc cannot carry ----------------------------------
  const runtime: W3xEmitterRuntimeFlags = {
    modelSpace: (flags & W3X_NODE_FLAG.modelSpace) !== 0,
    xYQuad: (flags & W3X_NODE_FLAG.xYQuad) !== 0,
    lineEmitter: (flags & W3X_NODE_FLAG.lineEmitter) !== 0,
    wantsHeadAndTail: em.headOrTail === W3X_HEAD_OR_TAIL.both,
    priorityPlane: finite(em.priorityPlane ?? 0),
    trackFrameSec: 1 / 1000,
  };
  if (em.emissionTrack && em.emissionTrack.keys.length > 0) runtime.emissionTrack = em.emissionTrack;
  if (em.visibilityTrack && em.visibilityTrack.keys.length > 0) runtime.visibilityTrack = em.visibilityTrack;
  if (em.pivot && (em.pivot[0] !== 0 || em.pivot[1] !== 0 || em.pivot[2] !== 0)) {
    // MDX (Z-up, RH) → Babylon (Y-up): (x, y, z) → s·(x, z, −y)
    runtime.pivotOffset = { x: r4(em.pivot[0] * scale), y: r4(em.pivot[2] * scale), z: r4(-em.pivot[1] * scale) };
  }

  if ((flags & W3X_NODE_FLAG.unshaded) !== 0) {
    notes.push({ field: "flags.unshaded", kind: "exact", detail: "no-op: Babylon particles are unlit already, so 'unshaded' is the default behaviour" });
  }
  if (runtime.lineEmitter) {
    notes.push({ field: "flags.lineEmitter", kind: "approximated", detail: "emits along a LINE, not a rectangle. vfx@1 has no line emitter; the cone above is the closest shape and W3xEmitterRig narrows it to a line at build time" });
  }
  if (runtime.xYQuad) {
    notes.push({ field: "flags.xYQuad", kind: "approximated", detail: "flat XY quads instead of camera billboards. Closest Babylon behaviour is isBillboardBased=false (particles orient by direction), applied by W3xEmitterRig" });
  }
  if (runtime.priorityPlane !== 0) {
    notes.push({ field: "priorityPlane", kind: "dropped", detail: `priorityPlane ${runtime.priorityPlane} has no Babylon equivalent — a ParticleSystem sorts by depth, not by an authored plane. Forwarded on the runtime flags for a caller that wants to map it to renderingGroupId` });
  }
  if (runtime.emissionTrack || runtime.visibilityTrack) {
    notes.push({ field: "KP2E/KP2V", kind: "approximated", detail: "animated emission/visibility have no vfx@1 field. W3xEmitterRig replays them per-frame onto ps.emitRate; hermite/bezier tangents were dropped upstream so the curve is resampled linearly" });
  }
  if (em.filterMode === W3X_FILTER_MODE.modulate2x) {
    notes.push({ field: "filterMode", kind: "approximated", detail: "modulate2x → MULTIPLY. Babylon has no multiply-then-double particle blend; MULTIPLY keeps the darkening and loses only the 2× brightening" });
  }
  if (density !== 1) {
    notes.push({ field: "emissionRate", kind: "approximated", detail: `density scaled ×${density} for the particle budget (see emitterBudget.ts) — the FAITHFUL rate is ${r3(rate)}` });
  }

  return { doc, runtime, notes };
}

/**
 * `headOrTail === both` in two systems.
 *
 * WC3 draws BOTH a camera-facing head sprite and a velocity-stretched tail from
 * the same particle. A Babylon `ParticleSystem` has exactly one `billboardMode`,
 * so the honest rebuild is two systems sharing the emitter: the mapping's own
 * doc (the tail) plus a head-only twin at half the emission so the total
 * particle count matches WC3's ONE particle per emission.
 *
 * Returns `[doc]` unchanged when the emitter is head-only or tail-only.
 */
export function expandHeadAndTail(mapping: W3xEmitterMapping): VfxDoc[] {
  if (!mapping.runtime.wantsHeadAndTail) return [mapping.doc];
  const tail: VfxDoc = { ...mapping.doc };
  const head: VfxDoc = { ...mapping.doc, id: `${mapping.doc.id}-head` };
  delete head.stretched;
  delete head.tailLength;
  const halve = (d: VfxDoc): void => {
    if (d.mode === "burst") d.burstCount = Math.max(1, Math.round((d.burstCount ?? 1) / 2));
    else d.rate = Math.max(0.001, r3((d.rate ?? 10) / 2));
  };
  halve(tail);
  halve(head);
  return [tail, head];
}

/** True when every note is `exact` — i.e. the rebuild is 1:1 with the original. */
export function isFaithful(mapping: W3xEmitterMapping): boolean {
  return mapping.notes.every((n) => n.kind === "exact");
}
