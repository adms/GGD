/**
 * THE THREE FAMILIES THE OWNER NAMED: 球體 (orb) / 蝗蟲群 (locust) / 粒子 (particle).
 *
 * 「[技能戰鬥效果] 及 [球體/蝗蟲群/粒子特效] 要記得明確比照原 w3x 實作」
 *
 * `w3xEmitter.ts` turns ONE WC3 `PRE2` block into ONE `vfx@1` doc. That is the
 * atom. This file is the MOLECULE: a WC3 effect is N emitters sitting at N
 * PIVOTS, hanging off ONE attachment point, living for as long as the thing
 * that owns it. None of that fits in a `vfx@1` doc, and the `vfx` collection
 * schema is owned by another lane — so the composite lands as a data
 * file that ships ALONGSIDE the docs: `content/assets/vfx/w3x-families.json`.
 *
 * (It started life as `content/vfx/_w3x-families.json`, mirroring
 * `content/models/_standin-overrides.json`. `fsStore` does skip `_`-prefixed
 * files, but `packages/shared/src/content/vfxParticles.test.ts` scans the
 * directory itself and skips only `_index.json` by name, so any other sidecar
 * there fails schema validation. Living under `assets/` sidesteps a rule that
 * is not this lane's to change and is served by exactly the same route.)
 *
 * WHY A COMPOSITE LAYER IS THE WHOLE POINT
 * ----------------------------------------
 * `DivineRing.mdx` is 20 near-identical emitters. Their parameters do not
 * describe a ring — their PIVOTS do (5 helpers on a ~93-unit circle, 4 emitters
 * stacked on each). Feed the 20 docs to the renderer without the layout and you
 * get one blinding column, which is what the audition page showed the first
 * time. The layout is data, so it belongs in data.
 *
 * PROVENANCE, NOT VIBES
 * ---------------------
 * Every effect here is generated from `tools/w3x-import/out/emitters/*.json`
 * (the sibling lane's byte-exact `PRE2` dump: 294/294 emitters consumed their
 * full declared `inclusiveSize`) joined to `MODEL_REFS.json` (every model-valued
 * object-data field, classified). Nothing is authored by eye. Each effect
 * carries the source model, its mdx/glb byte counts, the real
 * `Textures\*.blp` path per layer, and which w3x object ids reference it.
 *
 * WHAT IS *NOT* FAITHFUL, STATED ONCE, LOUDLY
 * -------------------------------------------
 * 73 of the 81 distinct emitter textures live in `war3.mpq`, not in the map.
 * Geometry, timing, colour and alpha are faithful; the TEXTURE is a CC0 stand-in
 * picked by the same deterministic rule `tools/w3x-import/extract_particles.py`
 * already uses, so this layer and the 282 extractor docs agree. The true path is
 * recorded per layer as `wc3Texture` and `textureSubstituted: true`, so the
 * moment #81/#116 lands real art it is a lookup swap, not a re-derivation.
 */
import type { VfxDoc } from "@ggd/shared/content";
import {
  W3X_MODEL_UNIT,
  w3xEmitterToVfxDoc,
  type W3xEmitterRuntimeFlags,
  type W3xMappingNote,
  type W3xParticleEmitter,
} from "./w3xEmitter";

// ---------------------------------------------------------------------------
// The families
// ---------------------------------------------------------------------------

/**
 * · `orb` 球體 — a PERSISTENT effect bolted to a bone (weapon / chest / hand /
 *   origin). WC3 spells this `Asph` ("Sphere"), whose entire job is to attach a
 *   model to a unit forever, plus buff art, which persists for the buff. These
 *   are the ones that render as NOTHING today, because the mdx→glb conversion
 *   left a ~1 KB shell.
 * · `locust` 蝗蟲群 — many small short-lived motes filling the volume around a
 *   unit: a dense cloud with individual flicker, not a smooth cone. Decided by
 *   MEASURING the original parameters (see `emitterShape`), not by name.
 * · `particle` 粒子 — the general one-shot: burst, trail, nova, impact.
 */
export type W3xFamily = "orb" | "locust" | "particle";

export const W3X_FAMILIES: readonly W3xFamily[] = ["orb", "locust", "particle"];

/** The owner's own words, for the audition page and any live report. */
export const W3X_FAMILY_LABEL: Readonly<Record<W3xFamily, string>> = {
  orb: "球體 / orb",
  locust: "蝗蟲群 / locust swarm",
  particle: "粒子 / particle",
};

// ---------------------------------------------------------------------------
// Shape metrics — computed from the RAW WC3 numbers, deliberately unit-free
// ---------------------------------------------------------------------------

/**
 * `latitude` above a hemisphere is an authoring typo, not a wider cone.
 * `LasercannonfinalRED` stores 666/555/333/111 and `SephBoom` stores 900 —
 * the author was mashing repeated digits. WC3 cannot spray wider than a full
 * sphere, so 180° is the ceiling and everything past it means the same thing.
 * (`tools/w3x-import/extract_emitters.py` clamps identically and warns.)
 */
export function coneAngleDeg(latitude: number): number {
  if (!Number.isFinite(latitude)) return 0;
  return latitude < 0 ? 0 : latitude > 180 ? 180 : latitude;
}

export interface W3xEmitterShape {
  /** rate × lifespan — how many particles are alive at once, steady state */
  concurrency: number;
  /**
   * particle size ÷ cloud extent, both in WC3 units. Small = many distinct
   * motes (a swarm); large = a few fat puffs (smoke). Unit-free on purpose, so
   * the world-scale choice can never change the classification.
   */
  granularity: number;
  /** the cloud's own extent: how far a particle gets, or the emitter box */
  extent: number;
  /** cone half-angle after the >180 clamp */
  coneAngleDeg: number;
  /**
   * true when the emission is not a directed jet: either it sprays through at
   * least a hemisphere, or it barely moves at all (so the emitter box, not the
   * velocity, decides where the particles are).
   */
  enveloping: boolean;
  /** the 蝗蟲群 test — see `SWARM_*` below */
  swarmLike: boolean;
}

/**
 * A 蝗蟲群 needs to read as MANY THINGS, so: enough of them alive at once that
 * you see a cloud rather than a stream (`SWARM_MIN_CONCURRENCY`), each small
 * enough against the cloud that the individual mote is legible rather than
 * merged into soup (`SWARM_MAX_GRANULARITY`), short-lived enough to flicker
 * (`SWARM_MAX_LIFESPAN_SEC`), and non-directional so it surrounds the unit.
 *
 * The thresholds were picked by running the classifier over all 238 emitters
 * and reading the ranked list, not by taste: concurrency ≥ 90 is the top ~6%
 * (the median emitter carries 21 particles), and granularity ≤ 0.4 separates
 * `Boomnl`'s mote storm (0.25) from `flamessmoke`'s fat puffs (0.8+).
 */
export const SWARM_MIN_CONCURRENCY = 90;
export const SWARM_MAX_GRANULARITY = 0.4;
export const SWARM_MAX_LIFESPAN_SEC = 3;
/**
 * …and it has to be big enough to SURROUND something. A WC3 hero model is
 * roughly 100–200 model units tall, so a dense mote cloud narrower than that is
 * an edge highlight, not a swarm: `1hswd_01`'s blade shimmer is 1,000 tiny
 * motes in a 50×3 sliver along the sword, which passes every other test and is
 * obviously not a 蝗蟲群. This threshold is what separates it from `Boomnl`'s
 * 66×70 box with 200 units of travel.
 */
export const SWARM_MIN_EXTENT_WC3 = 100;

export function emitterShape(em: W3xParticleEmitter): W3xEmitterShape {
  const life = Math.max(em.lifespan, 0);
  const cone = coneAngleDeg(em.latitude);
  const travel = Math.max(em.speed, 0) * life;
  const box = Math.max(Math.abs(em.length), Math.abs(em.width));
  const extent = Math.max(travel, box, 1e-6);
  const size = Math.max(...em.segmentScaling.map((s) => Math.abs(s)), 0);
  const concurrency = Math.max(em.emissionRate, 0) * life;
  const granularity = size / extent;
  // "Barely moves" = the velocity carries a particle less far than the emitter
  // box it was born in, so the box shape dominates and there is no jet.
  const enveloping = cone >= 90 || travel <= box;
  return {
    concurrency,
    granularity,
    extent,
    coneAngleDeg: cone,
    enveloping,
    swarmLike:
      concurrency >= SWARM_MIN_CONCURRENCY &&
      granularity <= SWARM_MAX_GRANULARITY &&
      extent >= SWARM_MIN_EXTENT_WC3 &&
      life > 0 &&
      life <= SWARM_MAX_LIFESPAN_SEC &&
      enveloping,
  };
}

/**
 * Which object-data fields make an effect PERSIST on a bone (→ 球體).
 *
 * `Asph` is literally WC3's "Sphere" ability: its target art is attached to the
 * unit and stays. Buff art (`buff.targetArt` / `buff.specialArt` /
 * `buff.effectArt`) persists for the buff's duration — which is why every
 * passive / DoT / aura visual lives there and why they all read as missing
 * today (correction M3 in `docs/legacy/_vfx-fidelity-w3x.md`).
 */
export function isPersistentAttachmentRef(ref: {
  field: string;
  baseId?: string;
}): boolean {
  if (ref.field.startsWith("buff.")) return true;
  return ref.baseId === "Asph" && ref.field === "ability.targetArt";
}

/**
 * Family precedence, and why it is this way round.
 *
 * SHAPE WINS OVER USE. The owner named three LOOKS, not three plumbing
 * categories, and the two axes genuinely cross: `Boomnl.mdx` is bolted to a
 * buff (so it persists like an orb) *and* is 3,400 concurrent motes (so it
 * reads as a swarm). Calling it an orb would empty the 蝗蟲群 bucket while
 * describing it wrongly. So a swarm-shaped effect is `locust` even when it
 * attaches — and `ambient`/`attach` are recorded independently, so it still
 * attaches and still persists. Nothing is lost by the ordering; only the label
 * changes.
 */
export function classifyFamily(input: {
  swarmLike: boolean;
  persistentAttachment: boolean;
}): W3xFamily {
  if (input.swarmLike) return "locust";
  if (input.persistentAttachment) return "orb";
  return "particle";
}

// ---------------------------------------------------------------------------
// Texture substitution — the SAME rule the Python extractor already uses
// ---------------------------------------------------------------------------

/**
 * Ported verbatim from `tools/w3x-import/extract_particles.py:KENNEY_RULES` so
 * the docs generated here and the 282 `godie-*-p*` docs pick the SAME sprite
 * for the same WC3 texture. Divergence here would look like a bug in the art.
 */
const KENNEY_RULES: readonly (readonly [readonly string[], readonly string[]])[] = [
  [["flame", "fire", "lava", "ember", "burn", "torch"],
    ["flame_01", "flame_02", "flame_03", "flame_04", "flame_05", "flame_06", "fire_01", "fire_02"]],
  [["flare", "sun"], ["flare_01"]],
  [["cloud", "smoke", "fog", "mist", "dust", "breath", "gas"],
    ["smoke_01", "smoke_02", "smoke_03", "smoke_04", "smoke_05", "smoke_06", "smoke_07", "smoke_08", "smoke_09", "smoke_10"]],
  [["lightning", "bolt", "elec", "spark", "thunder", "zap"],
    ["spark_01", "spark_02", "spark_03", "spark_04", "spark_05", "spark_06", "spark_07"]],
  [["glow", "light", "halo", "gloom", "moon", "shine"], ["light_01", "light_02", "light_03"]],
  [["star"], ["star_01", "star_04", "star_05", "star_06", "star_07", "star_08", "star_09"]],
  [["ring", "circle", "shockwave", "wave", "ripple"],
    ["circle_01", "circle_02", "circle_03", "circle_04", "circle_05"]],
  [["magic", "rune", "sigil", "holy", "divine", "enchant"],
    ["magic_01", "magic_02", "magic_03", "magic_04", "magic_05"]],
  [["slash", "claw", "blade"], ["slash_01", "slash_02", "slash_03", "slash_04"]],
  [["twirl", "swirl", "tornado", "wind", "vortex"], ["twirl_01", "twirl_02", "twirl_03"]],
  [["ribbon", "trace", "trail", "blur", "streak"],
    ["trace_01", "trace_02", "trace_03", "trace_05", "trace_06"]],
  [["rock", "stone", "earth", "dirt", "rubble"], ["dirt_01", "dirt_02", "dirt_03"]],
  [["frost", "ice", "snow", "crystal"], ["star_06", "star_09"]],
  [["water", "aqua", "splash", "bubble"], ["circle_02", "circle_03"]],
  [["blood", "gut", "gore"], ["dirt_02", "smoke_04"]],
  [["scorch", "crater"], ["scorch_01", "scorch_02", "scorch_03"]],
];
const KENNEY_DEFAULT = ["light_01", "light_02", "star_05"] as const;

const CRC32_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** zlib.crc32 over UTF-8 bytes — the Python rule picks candidates with it. */
export function crc32(s: string): number {
  let c = -1;
  const bytes = new TextEncoder().encode(s);
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Basename without the `.blp`/`.tga` extension, from a WC3 backslash path. */
export function wc3TextureStem(wc3Path: string): string {
  const base = wc3Path.replace(/\//g, "\\").split("\\").pop() ?? wc3Path;
  return base.replace(/\.(blp|tga|dds)$/i, "");
}

/** The CC0 stand-in for a Blizzard-stock texture. Deterministic. */
export function kenneySubstitute(stem: string): string {
  const low = stem.toLowerCase();
  for (const [keys, candidates] of KENNEY_RULES) {
    if (keys.some((k) => low.includes(k))) {
      return candidates[crc32(low) % candidates.length]!;
    }
  }
  return KENNEY_DEFAULT[crc32(low) % KENNEY_DEFAULT.length]!;
}

// ---------------------------------------------------------------------------
// The sidecar shape
// ---------------------------------------------------------------------------

/** One emitter of an effect, as it lands in `_w3x-families.json`. */
export interface W3xFamilyLayer {
  /** `content/vfx/<docId>.json` — a real, schema-valid `vfx@1` doc */
  docId: string;
  /** which `PRE2` this was, in the source model's own order */
  emitterIndex: number;
  /** MDX node name — diagnostics, and how the pivots were grouped */
  nodeName: string;
  /**
   * Offset from the attachment point, WORLD units, Babylon axes. Already
   * through the exporter's own `(x, y, z) → s·(x, z, −y)`, so it lands where
   * it lands on the original model. THE SHAPE OF A MULTI-EMITTER EFFECT LIVES
   * HERE — see the DivineRing note at the top of the file.
   */
  pivotOffset: { x: number; y: number; z: number };
  /** the real texture the emitter was authored against */
  wc3Texture: string;
  /** false only for the 8 textures that shipped inside the map archive */
  textureSubstituted: boolean;
  /** measured on the ORIGINAL numbers, before any world-scale conversion */
  shape: Pick<W3xEmitterShape, "concurrency" | "granularity" | "coneAngleDeg" | "swarmLike">;
  /** what the doc cannot carry; applied by `W3xEmitterRig` */
  runtime: W3xEmitterRuntimeFlags;
  /** every non-exact mapping decision, machine-readable */
  notes: W3xMappingNote[];
}

/**
 * A 蝗蟲群 that WC3 drew with UNITS, not particles.
 *
 * `A0IB 66-03 七夜怪談` (base `AUls` = Crypt Lord's Locust Swarm) spawns N real
 * units that orbit and ram. `vfx@1` cannot spawn units, so the rig reproduces
 * the LAYOUT — the count, the radius, the stagger, the tint, the member scale —
 * with the map's own mote emitter standing in for the absent Blizzard model.
 * Every number below was read out of `war3map.w3a` / `war3map.w3u`, not the
 * prose: verified by re-parsing the binaries in this session.
 */
export interface W3xSwarmLayout {
  /** members per ability level — `AUls` DataA */
  countPerLevel: readonly number[];
  /** seconds between spawns — `AUls` DataB */
  spawnIntervalSec: number;
  /** WC3 range the swarm covers — the ability's `aare` */
  radiusWc3: number;
  /** the same radius in world units */
  radiusWorld: number;
  /** how long the swarm lives — the ability's `adur` */
  durationSec: number;
  /** the reskinned member unit's `usca` */
  memberScale: number;
  /** the member's vertex tint, 0..1 rgb — `uclr`/`uclg`/`uclb` */
  memberTint: readonly [number, number, number];
  /** what WC3 actually drew, and why it is not here */
  memberModel: string;
  memberModelPresent: boolean;
}

export interface W3xFamilyEffect {
  /** vfx-doc-id prefix and pool key: `fx.w3x.<family>.<stem>` */
  id: string;
  family: W3xFamily;
  /** human label for the audition page / codex */
  label: string;
  source: {
    /** the imported `.mdx` this came from */
    model: string;
    mdxBytes: number;
    /** what the converter produced — the ~1 KB shells are the #98 evidence */
    glbBytes: number | null;
    assetClass: string;
    geosets: number;
    triangles: number;
  };
  /** WC3 attach string, `right,hand` style. ONE attachment, two comma tokens. */
  attach: string | null;
  /** true = lives with the entity (orb / buff art), false = one-shot */
  ambient: boolean;
  /** WC3 timed life, when the object data gives one */
  durationSec: number | null;
  layers: W3xFamilyLayer[];
  /** `ribbon@1` docs that belong to the same effect (reused, not regenerated) */
  ribbonDocIds: string[];
  swarm?: W3xSwarmLayout;
  /** which w3x objects reference this model, and through which field */
  usedBy: { objectId: string; baseId: string; field: string }[];
  /** the `fx.prim.*` presets this is intended to eventually replace */
  supersedes: string[];
  notes: string[];
}

export interface W3xFamilyManifest {
  schema: "w3x-vfx-families@1";
  /** how it was produced, so a reader can re-derive it */
  provenance: {
    dataset: string;
    modelRefs: string;
    emittersDecodedByteExact: string;
    worldUnitNote: string;
  };
  counts: Record<W3xFamily | "layers" | "effects", number>;
  effects: W3xFamilyEffect[];
}

// ---------------------------------------------------------------------------
// Building the families from the extractor dataset
// ---------------------------------------------------------------------------

/** The subset of `EMITTERS.json` this builder reads. Structural on purpose. */
export interface DatasetEmitter {
  index: number;
  name: string;
  anchorNode?: string | null;
  pivot?: readonly number[] | null;
  flags?: { raw?: number } | null;
  raw: {
    speed: number;
    variation: number;
    latitudeDeg: number;
    gravity: number;
    lifespanSec: number;
    emissionRatePerSec: number;
    length: number;
    width: number;
    filterMode: number;
    rows: number;
    cols: number;
    headOrTail: number;
    tailLength: number;
    timeMiddle: number;
    segmentColor: readonly (readonly number[])[];
    segmentAlpha: readonly number[];
    segmentScaling: readonly number[];
    squirt: number;
    priorityPlane: number;
    replaceableId?: number;
  };
  texture?: { wc3Path?: string | null } | null;
}

export interface DatasetModel {
  file: string;
  stem: string;
  bytes: number;
  glbBytes: number | null;
  meshScaleFactor: number;
  assetClass: string;
  geometry: { geosets: number; triangles: number };
  emitters: DatasetEmitter[];
  ribbons: { index: number }[];
}

export interface DatasetRef {
  objectId: string;
  baseId: string;
  field: string;
  form: string;
  value: string;
  basename?: string | null;
}

export interface DatasetAttachPoint {
  field: string;
  attachPoint: string;
}

export interface BuildFamiliesInput {
  models: readonly DatasetModel[];
  refs: readonly DatasetRef[];
  /** objectId → the attach points its art fields declare */
  attachments: Readonly<Record<string, { points?: readonly DatasetAttachPoint[] }>>;
  /** ids of `ribbon@1` docs that already exist, so they are reused not remade */
  existingRibbonDocIds?: readonly string[];
  /** hand-verified swarm layouts, keyed by the model they stand in for */
  swarms?: Readonly<Record<string, W3xSwarmLayout>>;
  /**
   * Effects WC3 drew with something other than an emitter — the `AUls` locust
   * swarm draws N unit models. They have no `.mdx`, so they carry NO layers:
   * the layout is real, the member art is an admitted hole. Inventing a donor
   * emitter here would be exactly the "looks about right" move the owner's bar
   * rules out ([[ggd-faithful-import-over-rescale]]).
   */
  syntheticEffects?: readonly SyntheticFamilyEffect[];
  /** `fx.prim.*` ids each effect is meant to replace, keyed by model file */
  supersedes?: Readonly<Record<string, readonly string[]>>;
  /** display labels, keyed by model file */
  labels?: Readonly<Record<string, string>>;
}

/** An effect the map expresses as UNITS, not emitters. Layout only, no art. */
export interface SyntheticFamilyEffect {
  id: string;
  family: W3xFamily;
  label: string;
  attach: string | null;
  ambient: boolean;
  swarm: W3xSwarmLayout;
  usedBy: { objectId: string; baseId: string; field: string }[];
  supersedes: string[];
  notes: string[];
}

export interface BuildFamiliesResult {
  manifest: W3xFamilyManifest;
  /** every generated `vfx@1` doc, ready to write to `content/vfx/` */
  docs: VfxDoc[];
}

/** Champions are normalised to this height (task #150) — the yardstick a
 *  "how big is that particle, really" check has to be measured against. */
export const CHAMPION_HEIGHT_WORLD = 1.7;

/** The 8 emitter textures that really did ship inside the map archive. */
const MAP_ARCHIVE_TEXTURE_STEMS = new Set([
  "babyface",
  "blue_glow2",
  "herocloudkfksword",
  "heroeva01effect",
  "ribbonblur1",
  "rockparticle",
  "zap1",
  "zap1b",
]);

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(mdx|mdl)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toEmitter(e: DatasetEmitter): W3xParticleEmitter {
  const r = e.raw;
  const rgb = (i: number): readonly [number, number, number] => {
    const c = r.segmentColor[i] ?? [1, 1, 1];
    return [c[0] ?? 1, c[1] ?? 1, c[2] ?? 1];
  };
  return {
    name: e.name,
    anchorNode: e.anchorNode ?? undefined,
    speed: r.speed,
    variation: r.variation,
    latitude: r.latitudeDeg,
    gravity: r.gravity,
    lifespan: r.lifespanSec,
    emissionRate: r.emissionRatePerSec,
    length: r.length,
    width: r.width,
    filterMode: r.filterMode as W3xParticleEmitter["filterMode"],
    rows: r.rows,
    cols: r.cols,
    headOrTail: r.headOrTail as W3xParticleEmitter["headOrTail"],
    tailLength: r.tailLength,
    timeMiddle: r.timeMiddle,
    segmentColor: [rgb(0), rgb(1), rgb(2)],
    segmentAlpha: [r.segmentAlpha[0] ?? 255, r.segmentAlpha[1] ?? 255, r.segmentAlpha[2] ?? 0],
    segmentScaling: [
      r.segmentScaling[0] ?? 1,
      r.segmentScaling[1] ?? 1,
      r.segmentScaling[2] ?? 1,
    ],
    squirt: r.squirt,
    priorityPlane: r.priorityPlane,
    flags: e.flags?.raw ?? 0,
    pivot: e.pivot && e.pivot.length === 3 ? [e.pivot[0]!, e.pivot[1]!, e.pivot[2]!] : undefined,
  };
}

/**
 * The one place a model's WC3 attach string is decided.
 *
 * A model can be referenced by several objects at different points (`wuqi.MDX`
 * is `right,hand` AND `weapon`). The effect gets the MOST COMMON one, ties
 * broken by first appearance, and every reference is still listed in `usedBy`
 * so the binding lane can override per-ability. `right,hand` is ONE attachment
 * written as two comma tokens (correction M6) — it is never split here.
 */
export function dominantAttach(
  refs: readonly DatasetRef[],
  attachments: BuildFamiliesInput["attachments"],
  filter?: (ref: DatasetRef) => boolean,
): string | null {
  const tally = new Map<string, number>();
  for (const ref of refs) {
    if (filter && !filter(ref)) continue;
    for (const p of attachments[ref.objectId]?.points ?? []) {
      if (p.field !== ref.field) continue;
      tally.set(p.attachPoint, (tally.get(p.attachPoint) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of tally) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

export function buildW3xFamilies(input: BuildFamiliesInput): BuildFamiliesResult {
  const refsByModel = new Map<string, DatasetRef[]>();
  for (const ref of input.refs) {
    if (ref.form !== "map-imported") continue;
    const key = (ref.basename ?? ref.value).toLowerCase();
    const list = refsByModel.get(key);
    if (list) list.push(ref);
    else refsByModel.set(key, [ref]);
  }
  const existingRibbons = new Set(input.existingRibbonDocIds ?? []);

  const effects: W3xFamilyEffect[] = [];
  const docs: VfxDoc[] = [];

  for (const model of input.models) {
    if (model.emitters.length === 0) continue;
    const refs = refsByModel.get(model.file.toLowerCase()) ?? [];
    const persistent = refs.some(isPersistentAttachmentRef);

    // The effect's family is decided by its DOMINANT emitter — the one that
    // carries the most particles, i.e. the one you actually see. A single
    // decorative spark on a 20-emitter ring must not rename the whole effect.
    const shapes = model.emitters.map((e) => emitterShape(toEmitter(e)));
    let dom = 0;
    for (let i = 1; i < shapes.length; i++) {
      if (shapes[i]!.concurrency > shapes[dom]!.concurrency) dom = i;
    }
    const swarm = input.swarms?.[model.file];
    const family = classifyFamily({
      swarmLike: shapes[dom]!.swarmLike || swarm !== undefined,
      persistentAttachment: persistent,
    });

    const stem = slug(model.stem || model.file);
    const id = `fx.w3x.${family}.${stem}`;
    // A model can be referenced by several objects at different points, and
    // they disagree: `DivineRing` is `chest` on the `Asph` orb (A0TP 球體(趙雲))
    // but `origin` on all three of `A10W`'s one-shot art slots. For an ORB the
    // defining reference is the persistent one — that is what made it an orb —
    // so a raw majority vote would put a chest ring around the feet.
    const attach =
      dominantAttach(refs, input.attachments, persistent ? isPersistentAttachmentRef : undefined) ??
      dominantAttach(refs, input.attachments);
    const layers: W3xFamilyLayer[] = [];
    const notes: string[] = [];

    model.emitters.forEach((e, i) => {
      const em = toEmitter(e);
      const wc3Path = e.texture?.wc3Path ?? "";
      const texStem = wc3Path ? wc3TextureStem(wc3Path) : "";
      const fromArchive =
        texStem !== "" && MAP_ARCHIVE_TEXTURE_STEMS.has(texStem.toLowerCase());
      const texture = fromArchive
        ? `assets/textures/particles/wc3/${slug(texStem)}.png`
        : `assets/textures/particles/${kenneySubstitute(texStem || model.stem)}.png`;
      const docId = `${id}.p${String(e.index).padStart(2, "0")}`;
      const mapping = w3xEmitterToVfxDoc(em, {
        id: docId,
        // Emitters ride the model they were authored against, so they take
        // THAT model's exporter scale. Heroes are normalised to 1.7 units tall,
        // which is a very different factor from the 1/36 prop default — using
        // the default on a hero puts the particles metres off the bone.
        worldScale: model.meshScaleFactor || W3X_MODEL_UNIT,
        latitudeUnit: "deg",
        texture,
        // Slicing a substituted single-frame CC0 sprite into the original's
        // 8×8 grid renders confetti, so the flipbook only survives when the
        // texture really is the WC3 atlas it was authored against.
        textureIsAtlas: fromArchive,
        ambient: persistent,
      });
      docs.push(mapping.doc);
      layers.push({
        docId,
        emitterIndex: e.index,
        nodeName: e.name,
        pivotOffset: mapping.runtime.pivotOffset ?? { x: 0, y: 0, z: 0 },
        wc3Texture: wc3Path,
        textureSubstituted: !fromArchive,
        shape: {
          concurrency: round(shapes[i]!.concurrency, 1),
          granularity: round(shapes[i]!.granularity, 3),
          coneAngleDeg: round(shapes[i]!.coneAngleDeg, 1),
          swarmLike: shapes[i]!.swarmLike,
        },
        runtime: mapping.runtime,
        notes: mapping.notes,
      });
    });

    // OVERSIZE, REPORTED NOT RESCALED. `LasercannonfinalRED` scales a particle
    // to 777 WC3 units — 21.6 world units, twelve times a champion's height —
    // and it whites out the screen. That IS the map's number, so it is ported
    // as-is and flagged here ([[ggd-faithful-import-over-rescale]]: raise the
    // guard knowingly, do not quietly shrink the content). The binding lane
    // needs to know before it ships one of these on an ability.
    const biggest = Math.max(
      0,
      ...docs
        .slice(docs.length - model.emitters.length)
        .map((d) => Math.max(d.size.start, ...(d.sizeStops?.map(([, s]) => s) ?? [0]))),
    );
    if (biggest > CHAMPION_HEIGHT_WORLD) {
      notes.push(
        `Largest particle is ${biggest.toFixed(2)} world units — ${(biggest / CHAMPION_HEIGHT_WORLD).toFixed(1)}× a champion's height. That is the map's own segmentScaling, ported unchanged; expect it to fill the screen.`,
      );
    }

    const ribbonDocIds = model.ribbons
      .map((r) => `godie-${slug(model.stem)}-r${r.index}`)
      .filter((rid) => existingRibbons.size === 0 || existingRibbons.has(rid));
    if (model.ribbons.length > 0 && ribbonDocIds.length < model.ribbons.length) {
      notes.push(
        `${model.ribbons.length - ribbonDocIds.length} of ${model.ribbons.length} RIBB ribbon(s) have no authored ribbon@1 doc yet — the trail layer is still missing.`,
      );
    }
    if (model.glbBytes !== null && model.glbBytes <= 2048 && model.geometry.triangles === 0) {
      notes.push(
        `The converted glb is ${model.glbBytes} B with 0 triangles: this asset IS its emitters (#98). Re-converting cannot help — the geometry never existed.`,
      );
    }
    if (attach === null && persistent) {
      notes.push(
        "No attach point in the object data. WC3 silently falls back to `origin`; reproducing that fallback IS the faithful port.",
      );
    }
    if (swarm && !swarm.memberModelPresent) {
      notes.push(
        `WC3 drew this swarm with ${swarm.countPerLevel[swarm.countPerLevel.length - 1]}× \`${swarm.memberModel}\` unit models, which this repo does not have (Blizzard stock — a licensing gap, #81/#116). The COUNT, RADIUS, STAGGER, TINT and SCALE below are the map's own numbers; the member sprite is a stand-in.`,
      );
    }

    effects.push({
      id,
      family,
      label: input.labels?.[model.file] ?? model.stem,
      source: {
        model: model.file,
        mdxBytes: model.bytes,
        glbBytes: model.glbBytes,
        assetClass: model.assetClass,
        geosets: model.geometry.geosets,
        triangles: model.geometry.triangles,
      },
      attach,
      ambient: persistent,
      durationSec: swarm?.durationSec ?? null,
      layers,
      ribbonDocIds,
      ...(swarm ? { swarm } : {}),
      usedBy: refs.map((r) => ({ objectId: r.objectId, baseId: r.baseId, field: r.field })),
      supersedes: [...(input.supersedes?.[model.file] ?? [])],
      notes,
    });
  }

  for (const syn of input.syntheticEffects ?? []) {
    effects.push({
      id: syn.id,
      family: syn.family,
      label: syn.label,
      source: {
        model: "(none — WC3 drew this with unit models, not an emitter)",
        mdxBytes: 0,
        glbBytes: null,
        assetClass: "unit-swarm",
        geosets: 0,
        triangles: 0,
      },
      attach: syn.attach,
      ambient: syn.ambient,
      durationSec: syn.swarm.durationSec,
      // Deliberately EMPTY. The layout below is the map's own; the member
      // sprite is the caller's choice, and the rig refuses to guess one.
      layers: [],
      ribbonDocIds: [],
      swarm: syn.swarm,
      usedBy: syn.usedBy,
      supersedes: syn.supersedes,
      notes: [
        `WC3 drew each swarm member as a \`${syn.swarm.memberModel}\` unit model. That asset is Blizzard stock and is not in this repo (#81 / #116), so this effect ships its LAYOUT — count per level, ring radius, spawn stagger, member scale, member tint, duration — and NO member art. Picking a stand-in emitter here would be inventing content, so the rig requires the caller to name one.`,
        ...syn.notes,
      ],
    });
  }

  effects.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const counts = {
    orb: effects.filter((e) => e.family === "orb").length,
    locust: effects.filter((e) => e.family === "locust").length,
    particle: effects.filter((e) => e.family === "particle").length,
    effects: effects.length,
    layers: docs.length,
  };

  return {
    manifest: {
      schema: "w3x-vfx-families@1",
      provenance: {
        dataset: "tools/w3x-import/out/emitters/EMITTERS.json (w3x-emitters@1)",
        modelRefs: "tools/w3x-import/out/emitters/MODEL_REFS.json",
        emittersDecodedByteExact:
          "294/294 PRE2+RIBB blocks consumed their full declared inclusiveSize",
        worldUnitNote:
          "Per-model meshScaleFactor (the factor the glb exporter baked into the mesh), NOT the 11/600 gameplay-distance constant.",
      },
      counts,
      effects,
    },
    docs,
  };
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  const x = Math.round(v * f) / f;
  return x === 0 ? 0 : x;
}

// ---------------------------------------------------------------------------
// Reading the sidecar back at runtime
// ---------------------------------------------------------------------------

/** Group an effect's layers by pivot, so identical stacks can be merged. */
export function pivotKey(p: { x: number; y: number; z: number }): string {
  return `${round(p.x, 3)},${round(p.y, 3)},${round(p.z, 3)}`;
}

/** How many distinct places an effect emits from — its LAYOUT, in one number. */
export function distinctPivotCount(effect: W3xFamilyEffect): number {
  return new Set(effect.layers.map((l) => pivotKey(l.pivotOffset))).size;
}

/** Look one up by id; `null` rather than throwing, so a missing effect degrades. */
export function findFamilyEffect(
  manifest: W3xFamilyManifest,
  id: string,
): W3xFamilyEffect | null {
  return manifest.effects.find((e) => e.id === id) ?? null;
}

export function effectsInFamily(
  manifest: W3xFamilyManifest,
  family: W3xFamily,
): W3xFamilyEffect[] {
  return manifest.effects.filter((e) => e.family === family);
}
