/**
 * vfx@1 — data-driven particle definition. Consumed by a shared
 * `toParticleSystem` Babylon factory (client + editor preview use the SAME
 * factory so preview == ship). Referenced by ability/projectile `vfxKey`
 * (SOFT ref: content may name vfx that aren't authored yet).
 *
 * Task #30 extends vfx@1 with the WC3 MDX particle-emitter feature set —
 * every new field is OPTIONAL so previously-authored docs stay valid:
 * gravity, multi-stop color/size gradients, modulate/alphaKey blends,
 * sprite-sheet flipbooks, stretched (tail) billboards, emit-power ranges,
 * named-bone anchoring and the ambient (lives-with-the-entity) flag.
 *
 * ribbon@1 — WC3 RIBB emitters: a swept trail strip behind a named bone.
 * Ribbon docs live in the SAME `vfx` collection; the collection schema
 * discriminates on the `schema` field (see `zVfxCollectionDoc`).
 */
import { z } from "zod";
import { zId } from "./common";

const zUnit = z.number().min(0).max(1);
/** [r, g, b, a] each 0..1 */
export const zRgba = z.tuple([zUnit, zUnit, zUnit, zUnit]);

export const zEmitter = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("point") }).strict(),
  z.object({ shape: z.literal("sphere"), radius: z.number().positive() }).strict(),
  z
    .object({
      shape: z.literal("cone"),
      radius: z.number().positive(),
      angleDeg: z.number().min(1).max(180),
    })
    .strict(),
]);

/**
 * WC3 filter modes → Babylon particle blend modes:
 * additive → BLENDMODE_ONEONE · alpha → BLENDMODE_STANDARD ·
 * modulate → BLENDMODE_MULTIPLY · alphaKey → BLENDMODE_STANDARD (the texture
 * carries hard 0/1 alpha).
 */
export const zVfxBlendMode = z.enum(["additive", "alpha", "modulate", "alphaKey"]);
export type VfxBlendMode = z.infer<typeof zVfxBlendMode>;

const zStopT = z.number().min(0).max(1);
/** [t 0..1, [r,g,b,a]] — gradient key over particle life */
export const zColorStop = z.tuple([zStopT, zRgba]);
/** [t 0..1, size>=0] — size key over particle life */
export const zSizeStop = z.tuple([zStopT, z.number().min(0)]);

/** WC3 rows×cols flipbook texture (requires `texture` on the doc). */
export const zSpriteSheet = z
  .object({
    rows: z.number().int().min(1),
    cols: z.number().int().min(1),
    /** seconds for one full cell cycle; absent = one cycle per particle life */
    cycleSec: z.number().positive().optional(),
    randomStartCell: z.boolean().optional(),
  })
  .strict();

const zVfxDocBase = z
  .object({
    id: zId,
    schema: z.literal("vfx@1"),
    emitter: zEmitter,
    mode: z.enum(["continuous", "burst"]),
    /** particles/sec (continuous mode) */
    rate: z.number().positive().optional(),
    /** particles per burst (burst mode) */
    burstCount: z.number().int().positive().optional(),
    lifetimeSec: z
      .object({ min: z.number().positive(), max: z.number().positive() })
      .strict(),
    /** particle size over life (2-stop legacy; `sizeStops` overrides) */
    size: z.object({ start: z.number().positive(), end: z.number().min(0) }).strict(),
    /** particle color over life (2-stop legacy; `colorStops` overrides) */
    color: z.object({ start: zRgba, end: zRgba }).strict(),
    blendMode: zVfxBlendMode,
    /** optional texture path relative to content/ (under assets/) */
    texture: z.string().regex(/^assets\//).optional(),
    // ---------------- WC3 extensions (task #30) — ALL optional ----------------
    /** world-units/s^2; negative = downward (WC3 gravity maps to -y) */
    gravityY: z.number().optional(),
    /** up to 4 stops sorted by t; overrides color.start/end when present */
    colorStops: z.array(zColorStop).min(1).max(4).optional(),
    /** up to 4 stops sorted by t; overrides size.start/end when present */
    sizeStops: z.array(zSizeStop).min(1).max(4).optional(),
    /** flipbook cell animation over the doc's texture */
    spriteSheet: zSpriteSheet.optional(),
    /** WC3 tail particles → BILLBOARDMODE_STRETCHED */
    stretched: z.boolean().optional(),
    /** stretch ratio for stretched billboards */
    tailLength: z.number().positive().optional(),
    /** emit power override (WC3 speed ± variation) */
    speed: z.object({ min: z.number().min(0), max: z.number().min(0) }).strict().optional(),
    /** named glb joint node to parent the emitter to */
    anchorBone: z.string().min(1).optional(),
    /** true = lives while the entity lives (ambient channel, not a one-shot) */
    ambient: z.boolean().optional(),
  })
  .strict();

type VfxDocShape = z.infer<typeof zVfxDocBase>;

function stopsSorted(stops: readonly (readonly [number, unknown])[]): boolean {
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]![0] <= stops[i - 1]![0]) return false;
  }
  return true;
}

/** Shared sanity refinements (applied by zVfxDoc AND the collection union). */
function vfxRefinements(doc: VfxDocShape, ctx: z.RefinementCtx): void {
  if (doc.mode === "continuous" && doc.rate === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rate"],
      message: 'rate is required when mode is "continuous"',
    });
  }
  if (doc.mode === "burst" && doc.burstCount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["burstCount"],
      message: 'burstCount is required when mode is "burst"',
    });
  }
  if (doc.lifetimeSec.max < doc.lifetimeSec.min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lifetimeSec", "max"],
      message: "lifetimeSec.max must be >= lifetimeSec.min",
    });
  }
  if (doc.colorStops && !stopsSorted(doc.colorStops)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["colorStops"],
      message: "colorStops must be sorted by t (strictly ascending)",
    });
  }
  if (doc.sizeStops && !stopsSorted(doc.sizeStops)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sizeStops"],
      message: "sizeStops must be sorted by t (strictly ascending)",
    });
  }
  if (doc.spriteSheet && doc.texture === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spriteSheet"],
      message: "spriteSheet requires a texture",
    });
  }
  if (doc.speed && doc.speed.max < doc.speed.min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["speed", "max"],
      message: "speed.max must be >= speed.min",
    });
  }
}

export const zVfxDoc = zVfxDocBase.superRefine(vfxRefinements);

export type VfxDoc = z.infer<typeof zVfxDoc>;

/**
 * ribbon@1 — WC3 RIBB emitter: a two-sided swept strip trailing a named glb
 * joint (`anchorBone`; falls back to the model root). Vertex alpha fades with
 * sample age; `uvScrollPerSec` scrolls the texture along the strip.
 */
export const zRibbonDoc = z
  .object({
    id: zId,
    schema: z.literal("ribbon@1"),
    /** optional texture path relative to content/ (under assets/) */
    texture: z.string().regex(/^assets\//).optional(),
    /** strip extent above the anchor path (world units) */
    widthAbove: z.number().min(0),
    /** strip extent below the anchor path (world units) */
    widthBelow: z.number().min(0),
    /** seconds a trail sample lives before fading out entirely */
    lifespanSec: z.number().positive(),
    color: zRgba,
    /** texture u-offset scroll speed (cycles/sec, signed) */
    uvScrollPerSec: z.number().optional(),
    blendMode: zVfxBlendMode,
    /** named glb joint node to trail behind */
    anchorBone: z.string().min(1).optional(),
  })
  .strict();

export type RibbonDoc = z.infer<typeof zRibbonDoc>;

/**
 * The `vfx` collection accepts particle docs AND ribbon docs (discriminated
 * on `schema`). The union carries the same vfx@1 sanity refinements.
 */
export const zVfxCollectionDoc = z
  .discriminatedUnion("schema", [zVfxDocBase, zRibbonDoc])
  .superRefine((doc, ctx) => {
    if (doc.schema === "vfx@1") vfxRefinements(doc, ctx);
  });

export type AnyVfxDoc = z.infer<typeof zVfxCollectionDoc>;

// ---------------------------------------------------------------------------
// config.vfx-families@1 — the 21 w3x art families, live-tunable
// ---------------------------------------------------------------------------

/**
 * `content/config/vfx-families.json` — the console's knobs for the w3x art
 * family layer (`apps/client/src/render/vfx/w3xArtFamilies.ts`).
 *
 * WHY IT IS CONFIG AND NOT CONSTANTS (第一守則). 33 Blizzard stock models
 * collapse into 21 parameterised prototypes, and every one of them is a
 * judgement call the owner has the right to overturn without a rebuild: how big
 * a WC3 `usca` of 5.0 should read on a much closer camera, whether 消散 should
 * be violet or grey, whether the whole evidence layer should be switched off
 * and every ability fall back to the name-classified `fx.prim.*` baseline.
 * Every one of those is a field here.
 *
 * SHAPE, and what each part overrides:
 *   · top level      — master switch + the WC3→doc scale compression
 *   · `families`     — per-family prototype defaults (shape/colour/size/α/time/height)
 *   · `abilities`    — per-CALL-SITE overrides, keyed by GGD ability doc id.
 *                      This is where 「同一顆 WarStompCaster，這一支放大、那一支
 *                      轉紅」 lives, and it is what the map's own numbers are
 *                      loaded into by `w3xFamilyArt.ts`.
 *
 * EVERY numeric field is bounded on BOTH sides. `validateField` in the console
 * only checked `min` until 2026-07-29, so an un-capped field lets 50 be typed
 * as 500, pass the form, and be silently clamped (or rejected) downstream —
 * the #277/#279 shape. A tint is 0..255 per channel because that is the unit
 * `war3map.w3u` stores (`uclr/uclg/uclb`); the renderer divides by 255.
 *
 * ABSENT ≠ ZERO. An omitted per-ability field means "the map did not state
 * one, use the family default" — never "0". The console must write `undefined`
 * (drop the key), not a zero, when the operator clears a box.
 */
const zW3xFamilyId = z.enum([
  "shockwaveRing",
  "blink",
  "burst",
  "dissipate",
  "missile",
  "boltStrike",
  "tornado",
  "groundDust",
  "flamePillar",
  "mirrorImage",
  "resurrect",
  "mark",
  "lightColumn",
  "portal",
  "breath",
  "levelUp",
  "cloud",
  "shine",
  "blood",
  "starfall",
  "uncategorised",
]);
export type W3xFamilyId = z.infer<typeof zW3xFamilyId>;

/** The 13 silhouettes `render/vfx/primitives.ts` ships. */
const zVfxPrimitiveKind = z.enum([
  "nova",
  "explosion",
  "shockwave",
  "tornado",
  "beam",
  "bolt",
  "dash",
  "swarm",
  "summon",
  "slash",
  "pulse",
  "column",
  "fall",
]);

/** The 13 colours `render/vfx/elements.ts` ships. */
const zVfxElement = z.enum([
  "fire",
  "ice",
  "lightning",
  "wind",
  "earth",
  "holy",
  "void",
  "physical",
  "nature",
  "arcane",
  "blood",
  "ki",
  "sound",
]);

/** WC3 vertex colour, 0..255 per channel (`uclr`/`uclg`/`uclb` units). */
export const zW3xTint255 = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
]);

export const zVfxFamilyTuning = z
  .object({
    /** false = this family stops overriding; its abilities keep `fx.prim.*` */
    enabled: z.boolean(),
    /** the silhouette this family renders as */
    primitive: zVfxPrimitiveKind,
    /** the colour used when the ability has neither an element nor a w3x tint */
    element: zVfxElement,
    /** family base size multiplier (1 = the primitive's own size) */
    scale: z.number().min(0.1).max(6),
    /** family base opacity */
    alpha: z.number().min(0.05).max(1),
    /** >1 = longer/slower, <1 = snappier */
    timeScale: z.number().min(0.2).max(4),
    /** world-y the effect plays at (0.1 = on the floor, 3.5 = overhead) */
    heightY: z.number().min(0).max(8),
  })
  .strict();
export type VfxFamilyTuning = z.infer<typeof zVfxFamilyTuning>;

export const zVfxAbilityFamilyBinding = z
  .object({
    /** which prototype this ability plays (omit = keep the shipped binding) */
    family: zW3xFamilyId.optional(),
    /** false = this ONE ability falls back to its `fx.prim.*` classification */
    enabled: z.boolean().optional(),
    /** the map's own `usca`/`SetUnitScalePercent` for this call site */
    w3xScale: z.number().min(0.05).max(20).optional(),
    /** the map's own vertex tint for this call site, 0..255 */
    tint: zW3xTint255.optional(),
    /** the map's own `SetUnitFlyHeight`, WC3 units (128 units = 1 world unit) */
    flyHeight: z.number().min(-2000).max(2000).optional(),
    /** direct opacity override, after the family default */
    alpha: z.number().min(0.05).max(1).optional(),
    /** direct lifetime stretch override, after the family default */
    timeScale: z.number().min(0.2).max(4).optional(),
    /** WC3 attachment string, verbatim ("chest", "origin", "right,hand") */
    anchor: z.string().min(1).max(32).optional(),
  })
  .strict();
export type VfxAbilityFamilyBinding = z.infer<typeof zVfxAbilityFamilyBinding>;

export const zConfigVfxFamiliesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-families@1"),
    /** master switch: false = the whole evidence layer is off, `fx.prim.*` only */
    enabled: z.boolean(),
    /**
     * How hard a WC3 scale is compressed into doc space: `1 + (usca - 1) * gain`,
     * then clamped to [scaleMin, scaleMax]. gain 0 = ignore the map's scales
     * entirely; gain 1 = take them literally (a 10.0 call fills the screen).
     */
    scaleGain: z.number().min(0).max(1),
    scaleMin: z.number().min(0.1).max(4),
    scaleMax: z.number().min(0.2).max(8),
    families: z.record(zW3xFamilyId, zVfxFamilyTuning),
    abilities: z.record(z.string().min(1), zVfxAbilityFamilyBinding),
  })
  .strict();
export type ConfigVfxFamiliesDoc = z.infer<typeof zConfigVfxFamiliesDoc>;

/**
 * `scaleMin > scaleMax` is the one cross-field mistake the per-field bounds
 * cannot catch. It is NOT a schema error on purpose: `zConfigDoc` is a
 * `discriminatedUnion`, which only accepts plain `ZodObject` members, so a
 * `superRefine` here would break the whole config collection's parse. The
 * renderer therefore treats the pair as an unordered interval
 * (`resolveScaleMapping` in `render/vfx/familyTuning.ts` sorts them), which
 * degrades to "the operator typed them backwards" instead of "no VFX config
 * loads at all". `familyTuning.test.ts` pins that behaviour.
 */
export function vfxFamiliesScaleOrdered(doc: ConfigVfxFamiliesDoc): boolean {
  return doc.scaleMax >= doc.scaleMin;
}
