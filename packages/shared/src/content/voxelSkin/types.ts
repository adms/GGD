/**
 * voxelSkin/types — the shared vocabulary for task #231's per-champion voxel
 * skin: the RECIPE (what a champion looks like), the frozen ladders every
 * choice is drawn from, and ATLAS_FACES (the 64×64 face-rect table the painter
 * writes into and the renderer reads back as Babylon `faceUV`).
 *
 * WHY A RECIPE AND NOT PIXELS. 114 champions × even a 1 KB PNG is 114 KB of new
 * art debt on a task whose whole reason for existing (#226) is that the old
 * champion bodies were too heavy. So nothing is shipped as an image: the
 * generator emits ~200 bytes of INSTRUCTIONS per champion and `paint.ts` paints
 * the 16 KB atlas on the client, into a RawTexture, at view-construction time.
 *
 * WHY NOT PURE PER-FACE VERTEX COLOURS. A 6-box figure painted in flat per-part
 * colours reads as coloured blocks, not a character. Eyes, a belt, a chest
 * emblem, an eyepatch — the things that actually tell 114 heroes apart at MOBA
 * camera distance — need per-face PIXELS. 1 texel = 1 voxel-pixel, so the atlas
 * is exactly as coarse as the body.
 *
 * THIS LAYOUT IS OURS. It is deliberately NOT the Minecraft/Mojang skin layout
 * (no 64×64 player-skin rect ordering, no reuse of their UV conventions, no
 * asset of theirs anywhere in the pipeline) — every rect below was chosen for
 * this project's part list, and 2.3× of the sheet is left free precisely so
 * #226 can change that part list without a layout rewrite.
 */

/** Atlas dimensions. Power of two, 1 texel per voxel-pixel. */
export const ATLAS_W = 64;
export const ATLAS_H = 64;

/** A rect in atlas texel space, origin TOP-LEFT (painting order). */
export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The six faces of a box, in BABYLON'S `CreateBox({faceUV})` order.
 * VertexData.CreateBox builds faces against normals
 * `[+Z, -Z, +X, -X, +Y, -Y]`, and the procedural figure's FRONT is +Z
 * (`facingToYaw` = `atan2(fx, fz)`, so local +Z is the facing direction).
 */
export type BoxFace = "front" | "back" | "right" | "left" | "top" | "bottom";

/** Face order for `faceUV[]` — index i is Babylon's face i. Do not reorder. */
export const FACE_ORDER: readonly BoxFace[] = Object.freeze([
  "front",
  "back",
  "right",
  "left",
  "top",
  "bottom",
] as const);

/** The parts the atlas reserves space for. `legs` is shared by both legs. */
export type SkinPart = "head" | "torso" | "armL" | "armR" | "legs";

export type FaceRects = Readonly<Record<BoxFace, AtlasRect>>;

const rects = (
  spec: Record<BoxFace, [number, number, number, number]>,
): FaceRects =>
  Object.freeze({
    front: Object.freeze({ x: spec.front[0], y: spec.front[1], w: spec.front[2], h: spec.front[3] }),
    back: Object.freeze({ x: spec.back[0], y: spec.back[1], w: spec.back[2], h: spec.back[3] }),
    right: Object.freeze({ x: spec.right[0], y: spec.right[1], w: spec.right[2], h: spec.right[3] }),
    left: Object.freeze({ x: spec.left[0], y: spec.left[1], w: spec.left[2], h: spec.left[3] }),
    top: Object.freeze({ x: spec.top[0], y: spec.top[1], w: spec.top[2], h: spec.top[3] }),
    bottom: Object.freeze({ x: spec.bottom[0], y: spec.bottom[1], w: spec.bottom[2], h: spec.bottom[3] }),
  }) as FaceRects;

/**
 * THE LAYOUT. Voxel dimensions match ChampionView's procedural figure exactly
 * (head 8³, torso 8w×12h×4d, every limb 4×12×4 — classic 8:12:4 proportions),
 * so one texel is one voxel-pixel on every face.
 *
 *   head   6 × (8×8)                                   384 texels
 *   torso  2×(8×12) + 2×(4×12) + 2×(8×4)               352
 *   armL   4×(4×12) + 2×(4×4)                          224
 *   armR   4×(4×12) + 2×(4×4)                          224
 *   legs   4×(4×12) + 2×(4×4)   (shared L/R)           224
 *   motifs 6 × (8×8)                                   384
 *   ------------------------------------------------  1,792 of 4,096 used
 *
 * armL and armR get SEPARATE regions on purpose: an asymmetric motif (one
 * pauldron, one bandaged arm) has to be expressible or half the melee roster
 * looks mirror-symmetric.
 */
export const ATLAS_FACES: Readonly<Record<SkinPart, FaceRects>> = Object.freeze({
  head: rects({
    front: [0, 0, 8, 8],
    back: [8, 0, 8, 8],
    right: [16, 0, 8, 8],
    left: [24, 0, 8, 8],
    top: [32, 0, 8, 8],
    bottom: [40, 0, 8, 8],
  }),
  torso: rects({
    front: [0, 8, 8, 12],
    back: [8, 8, 8, 12],
    right: [16, 8, 4, 12],
    left: [20, 8, 4, 12],
    top: [24, 8, 8, 4],
    bottom: [32, 8, 8, 4],
  }),
  armL: rects({
    front: [0, 20, 4, 12],
    back: [4, 20, 4, 12],
    right: [8, 20, 4, 12],
    left: [12, 20, 4, 12],
    top: [16, 20, 4, 4],
    bottom: [20, 20, 4, 4],
  }),
  armR: rects({
    front: [24, 20, 4, 12],
    back: [28, 20, 4, 12],
    right: [32, 20, 4, 12],
    left: [36, 20, 4, 12],
    top: [40, 20, 4, 4],
    bottom: [44, 20, 4, 4],
  }),
  legs: rects({
    front: [0, 32, 4, 12],
    back: [4, 32, 4, 12],
    right: [8, 32, 4, 12],
    left: [12, 32, 4, 12],
    top: [16, 32, 4, 4],
    bottom: [20, 32, 4, 4],
  }),
});

/**
 * Six 8×8 cells for motif geometry (hood/horns/cape/…). A motif box samples one
 * cell on every face — it is a small accessory, not a second character.
 */
export const MOTIF_CELLS: readonly AtlasRect[] = Object.freeze([
  Object.freeze({ x: 0, y: 44, w: 8, h: 8 }),
  Object.freeze({ x: 8, y: 44, w: 8, h: 8 }),
  Object.freeze({ x: 16, y: 44, w: 8, h: 8 }),
  Object.freeze({ x: 24, y: 44, w: 8, h: 8 }),
  Object.freeze({ x: 32, y: 44, w: 8, h: 8 }),
  Object.freeze({ x: 40, y: 44, w: 8, h: 8 }),
]);

// ---------------------------------------------------------------------------
// Ladders. Every one is FROZEN and ORDERED: a choice is `seed % arr.length`, so
// reordering or inserting mid-list re-rolls the whole roster. Append only.
// ---------------------------------------------------------------------------

/** `[name, [r,g,b]]` — 0..1 linear-ish gamma colour, the same space the
 *  StandardMaterial `diffuseColor` slot the tint multiplies into uses. */
export type Tone = readonly [string, readonly [number, number, number]];

/**
 * SKIN tones. Named for the MATERIAL, never for a people: the ladder has to
 * express a construct, an undead, a beast and a plant as easily as a person,
 * because a third of this roster is not human.
 */
export const SKIN_TONES: readonly Tone[] = Object.freeze([
  ["pale", [0.93, 0.84, 0.76]],
  ["fair", [0.87, 0.72, 0.58]],
  ["tan", [0.74, 0.56, 0.4]],
  ["deep", [0.47, 0.33, 0.24]],
  ["ash", [0.62, 0.63, 0.6]],
  ["corpse", [0.55, 0.62, 0.58]],
  ["chrome", [0.72, 0.75, 0.8]],
  ["verdigris", [0.42, 0.62, 0.55]],
  ["fur-ochre", [0.72, 0.58, 0.34]],
  ["fur-snow", [0.9, 0.9, 0.88]],
  ["ink", [0.28, 0.28, 0.32]],
  ["jade", [0.55, 0.72, 0.56]],
] as const);

/** HAIR tones — anime-bright on purpose; this is a parody roster. */
export const HAIR_TONES: readonly Tone[] = Object.freeze([
  ["black", [0.1, 0.1, 0.13]],
  ["ink-blue", [0.14, 0.18, 0.34]],
  ["silver", [0.8, 0.82, 0.86]],
  ["ash", [0.52, 0.5, 0.48]],
  ["crimson", [0.62, 0.14, 0.16]],
  ["gold", [0.86, 0.72, 0.28]],
  ["jade", [0.24, 0.56, 0.4]],
  ["violet", [0.46, 0.28, 0.62]],
  ["rose", [0.86, 0.52, 0.62]],
  ["orange", [0.86, 0.46, 0.16]],
  ["teal", [0.2, 0.58, 0.6]],
  ["white", [0.95, 0.95, 0.93]],
] as const);

/** METAL tones — belt/cuff/boot hardware. Weapon tags steer the pick. */
export const METAL_TONES: readonly Tone[] = Object.freeze([
  ["steel", [0.66, 0.69, 0.74]],
  ["brass", [0.76, 0.6, 0.26]],
  ["gunmetal", [0.3, 0.32, 0.36]],
  ["bone", [0.86, 0.84, 0.74]],
] as const);

export const HAIR_STYLES = Object.freeze([
  "bowl",
  "spiky",
  "long-back",
  "topknot",
  "bald",
  "shaved-band",
  "braid",
  "tufts",
] as const);
export type HairStyle = (typeof HAIR_STYLES)[number];

export const EYE_STYLES = Object.freeze([
  "dot",
  "slash",
  "closed",
  "visor-bar",
  "wide",
  "single-eyepatch",
] as const);
export type EyeStyle = (typeof EYE_STYLES)[number];

export const MOUTH_STYLES = Object.freeze([
  "neutral",
  "fang",
  "grin",
  "mask-band",
  "stitch",
] as const);
export type MouthStyle = (typeof MOUTH_STYLES)[number];

export const FACE_MARKS = Object.freeze([
  "none",
  "scar",
  "forehead-gem",
  "warpaint",
  "tribal-band",
  "tear-line",
] as const);
export type FaceMark = (typeof FACE_MARKS)[number];

/** In-house 3×3 glyph vocabulary for the chest emblem. Shapes, not logos. */
export const EMBLEMS = Object.freeze([
  "cross",
  "chevron",
  "star",
  "ring",
  "bolt",
  "skull",
  "leaf",
  "gear",
  "drop",
  "flame",
  "crescent",
  "eye",
  "spiral",
  "grid",
  "arrow",
  "bone",
] as const);
export type Emblem = (typeof EMBLEMS)[number];

export const TOP_STYLES = Object.freeze([
  "tunic",
  "plate",
  "robe",
  "jacket",
  "bare-chest",
  "vest",
  "kimono",
  "coat",
] as const);
export type TopStyle = (typeof TOP_STYLES)[number];

export const LEG_STYLES = Object.freeze([
  "trousers",
  "greaves",
  "skirt",
  "hakama",
  "shorts",
  "boots-tall",
] as const);
export type LegStyle = (typeof LEG_STYLES)[number];

/**
 * Motifs are extra GEOMETRY, in three exclusive slots so a silhouette can never
 * accumulate into noise: at most one head + one shoulder + one back motif, and
 * `none` is a real member of every slot.
 */
export const HEAD_MOTIFS = Object.freeze([
  "hood",
  "horns",
  "beast-ears",
  "brim-hat",
  "crown",
  "halo",
  "mask",
  "antenna",
  "headband",
  "none",
] as const);
export type HeadMotif = (typeof HEAD_MOTIFS)[number];

export const SHOULDER_MOTIFS = Object.freeze([
  "pauldrons",
  "spikes",
  "epaulets",
  "shawl",
  "none",
] as const);
export type ShoulderMotif = (typeof SHOULDER_MOTIFS)[number];

export const BACK_MOTIFS = Object.freeze([
  "cape",
  "scarf-tail",
  "tail",
  "backpack",
  "wing-stubs",
  "none",
] as const);
export type BackMotif = (typeof BACK_MOTIFS)[number];

/** The seven painted colour slots, as `#rrggbb`. */
export interface VoxelPalette {
  skin: string;
  hair: string;
  outfitPrimary: string;
  outfitSecondary: string;
  metal: string;
  eye: string;
  accent: string;
}

/** How many BOXES a motif slot value costs (triangle budget lives on this). */
export const MOTIF_BOX_COST: Readonly<Record<string, number>> = Object.freeze({
  // head
  hood: 1,
  horns: 2,
  "beast-ears": 2,
  "brim-hat": 1,
  crown: 1,
  halo: 1,
  mask: 0, // texture-only — free geometry
  antenna: 1,
  headband: 1,
  // shoulder
  pauldrons: 2,
  spikes: 2,
  epaulets: 2,
  shawl: 1,
  // back
  cape: 1,
  "scarf-tail": 1,
  tail: 1,
  backpack: 1,
  "wing-stubs": 2,
  none: 0,
});

/** Hard ceiling asserted by the budget test — the whole point of #226. */
export const MAX_MOTIF_BOXES = 6;

/**
 * THE RECIPE — the complete, serialisable description of one champion's look.
 * Everything the painter and the body builder need; nothing they don't.
 */
export interface VoxelSkinRecipe {
  /** schema tag, so a stored recipe can be rejected when the generator moves on */
  v: 1;
  championId: string;
  /** salt actually used (1 = first try; >1 means a signature collision was broken) */
  salt: number;
  /** dominant / secondary ability element the palette band came from */
  element: string;
  elementSecondary: string;
  palette: VoxelPalette;
  face: { eye: EyeStyle; mouth: MouthStyle; mark: FaceMark };
  hair: { style: HairStyle; tone: string };
  outfit: { top: TopStyle; legs: LegStyle; emblem: Emblem };
  motifs: { head: HeadMotif; shoulder: ShoulderMotif; back: BackMotif };
  /**
   * true when this champion is on one of the four shared stand-in meshes and
   * should therefore wear the VOXEL BODY rather than adopt the shared glb.
   * This is the field that actually retires "18 champions with one face".
   */
  preferVoxelBody: boolean;
}

/**
 * The generator's input: the champion fields that carry ART signal, and nothing
 * else. Deliberately a narrow struct rather than the whole champion doc, so the
 * generator is callable from the admin sheet, the tests and the client without
 * dragging the sim schema along.
 *
 * `tint` is ABSENT ON PURPOSE — see palette.ts. Baking the #49 vertex tint into
 * the recipe would tint the 20 tinted champions twice.
 */
export interface VoxelSkinInput {
  id: string;
  /** full doc name, usually "稱號 - 本名" */
  name?: string;
  attackType?: string;
  modelKey?: string;
  tags?: readonly string[];
  /** dominant-element source: the 4 ability vfxKeys, in Q W E R order */
  vfxKeys?: readonly (string | undefined)[];
  /**
   * Abstract SILHOUETTE WORD carried over from the w3x hero row (see hints.ts)
   * — "PolarBear", "BansheeGhost", "VillagerKid". A hint, never a texture.
   */
  modelHint?: string;
}

/** A partial hand-authored override (layer L1). Any subset of any axis. */
export interface VoxelSkinOverride {
  palette?: Partial<VoxelPalette>;
  face?: Partial<VoxelSkinRecipe["face"]>;
  hair?: Partial<VoxelSkinRecipe["hair"]>;
  outfit?: Partial<VoxelSkinRecipe["outfit"]>;
  motifs?: Partial<VoxelSkinRecipe["motifs"]>;
  preferVoxelBody?: boolean;
  /** free-text authoring note; never read by the renderer */
  note?: string;
}

/** Shape of `content/models/_voxel-skins.json`. */
export interface VoxelSkinOverridesFile {
  schema?: string;
  note?: string;
  overrides?: Record<string, VoxelSkinOverride>;
}

export const VOXEL_SKINS_SCHEMA = "voxel-skins@1";

/**
 * The four generic stand-in meshes (#77/#226). A champion pointing at one of
 * these has no art of its own — it is exactly the population this task exists
 * to finish — so its recipe sets `preferVoxelBody`.
 */
export const STAND_IN_MODEL_KEYS: readonly string[] = Object.freeze([
  "champ.sela",
  "champ.thorne",
  "champ.skin.barbarian",
  "champ.skin.rogue",
]);

// ===========================================================================
// THE BARCODE — 特徵生成 (docs/_體素特徵生成規格.md)
// ===========================================================================
//
// WHY THIS EXISTS AT ALL, NEXT TO THE RECIPE ABOVE.
// `VoxelSkinRecipe` optimises for "no two champions look alike": it is a hash
// chain, and its own file header records WHY it refuses to sample the hero
// icons (141 icon files, only 87 distinct byte-hashes, 24 duplicate groups —
// sampling them CLONES looks instead of separating them).
//
// The barcode optimises for the OPPOSITE thing: "does it look like the actual
// character". Two green-haired characters SHOULD look alike. The two standards
// genuinely fight, so the barcode does not replace the recipe — it is a higher
// authority laid on top of it, for the minority of champions where a real-world
// "本人" exists to compare against. The generator stays the L3 floor for every
// w3x original unit, which has no likeness to be faithful to.
//
// THE MODEL. A character is a standing rectangle; the top-to-bottom stack of
// flat colour bands IS the character's signature. 香吉士 = yellow hair / skin /
// black suit / black shoes. 魯夫 = straw brown + RED HAT BAND + black brim /
// skin / red vest / blue shorts / BARE SHINS / brown sandals.

/**
 * One band of the barcode.
 *
 * `frac` is a share of the WHOLE FIGURE's height, not of its part — that is
 * what makes the admin's CSS preview (a stack of `<div style="height:N%">`)
 * the same object as the 3D skin. `barcodeToParts` re-normalises per part.
 */
export interface BarcodeBand {
  /** '#rrggbb', lowercase or uppercase; compared case-insensitively. */
  hex: string;
  /** Share of total figure height, 0..1 exclusive of 0. Present bands sum to 1. */
  frac: number;
}

/**
 * THE ELEVEN SLOTS, IN ANATOMICAL ORDER — top of the head to the sole.
 *
 * ORDER IS THE DATA. This array is not a lookup convenience: index 0 is the
 * topmost band on the figure and index 10 is the bottom-most, and
 * `barcodeToParts` lays the bands out in exactly this sequence. Reordering it
 * re-stacks every character (Luffy's red hat band would migrate down his face).
 * Append is meaningless here too — a new slot has an anatomical POSITION, so it
 * must be inserted where it belongs and every stored barcode re-checked.
 *
 * WHY `top` AND `pants` ARE TWO SLOTS AND MAY NEVER BE MERGED.
 * Sanji's black suit is two blocks with a hairline between them. They are the
 * same hex. They are NOT the same band, because the hairline is the HIP JOINT:
 * `top` paints `torso` and `pants` paints `legs`, and those are two boxes that
 * rotate independently. Merge them because the colours match and the figure
 * stops being able to walk.
 *
 *   色帶是外觀，分節是結構，兩者不可互相吃掉。
 *
 * The same argument holds for every cross-part neighbour pair (`face`/`collar`
 * at the neck, `waist`/`pants` at the hip). Colour equality is never a reason
 * to collapse two slots.
 */
export const BARCODE_SLOTS = Object.freeze([
  "hair",
  "hatBand",
  "hatBrim",
  "face",
  "collar",
  "chestTrim",
  "top",
  "waist",
  "pants",
  "shin",
  "shoe",
] as const);

export type BarcodeSlot = (typeof BARCODE_SLOTS)[number];

/** The three boxes a barcode paints. `armL`/`armR` are driven by `sleeve`. */
export type BarcodePart = "head" | "torso" | "legs";

/** Part order, top to bottom — the order `barcodeToParts` reports them in. */
export const BARCODE_PARTS: readonly BarcodePart[] = Object.freeze([
  "head",
  "torso",
  "legs",
] as const);

/**
 * Slot → part (規格 §7). Fixed: this is anatomy, not configuration.
 * head 1–4 · torso 5–8 · legs 9–11.
 */
export const BARCODE_SLOT_PART: Readonly<Record<BarcodeSlot, BarcodePart>> = Object.freeze({
  hair: "head",
  hatBand: "head",
  hatBrim: "head",
  face: "head",
  collar: "torso",
  chestTrim: "torso",
  top: "torso",
  waist: "torso",
  pants: "legs",
  shin: "legs",
  shoe: "legs",
});

/**
 * Typical whole-figure share per slot (規格 §2.2), as `[min, max]`.
 *
 * ADVISORY, NOT A CONSTRAINT — `validateBarcode` reports a violation at `warn`,
 * never `error`. The table is not simultaneously satisfiable: a character
 * wearing only hair/face/top/pants/shoe (Sanji) has a maximum total of
 * 0.20+0.14+0.26+0.28+0.08 = 0.96, so normalising him to 1.0 MUST push at least
 * one band out of range. Treating the table as hard would reject a correct
 * barcode. See `BAND_FRAC_TYPICAL_INFEASIBLE_NOTE`.
 *
 * `shin`'s floor is 0 because a bare shin is the ABSENT case (Sanji has none) —
 * a band that is present always carries frac > 0, which is a separate check.
 */
export const BARCODE_TYPICAL_FRAC: Readonly<
  Record<BarcodeSlot, readonly [number, number]>
> = Object.freeze({
  hair: Object.freeze([0.12, 0.2] as const),
  hatBand: Object.freeze([0.02, 0.04] as const),
  hatBrim: Object.freeze([0.01, 0.03] as const),
  face: Object.freeze([0.08, 0.14] as const),
  collar: Object.freeze([0.02, 0.05] as const),
  chestTrim: Object.freeze([0.02, 0.04] as const),
  top: Object.freeze([0.18, 0.26] as const),
  waist: Object.freeze([0.03, 0.08] as const),
  pants: Object.freeze([0.18, 0.28] as const),
  shin: Object.freeze([0.0, 0.12] as const),
  shoe: Object.freeze([0.03, 0.08] as const),
});

/**
 * The eleven slots, every key present, absent ones explicitly `null`.
 *
 * A total `Record` and not a `Partial` on purpose: "this character has no
 * shin" is a STATEMENT, and a stored barcode that simply omits the key is
 * indistinguishable from one an editor truncated. Explicit nulls also make
 * the seed JSON self-documenting about the fixed slot order.
 */
export type BarcodeBands = Readonly<Record<BarcodeSlot, BarcodeBand | null>>;

/**
 * Sleeve rule (規格 §2.4) — the arms are NOT in the barcode, because the
 * barcode is a mid-axis section. `long` = whole arm in `top`'s colour;
 * `short` = upper half `top`, lower half `face` (skin); `none` = all skin.
 */
export type SleeveKind = "long" | "short" | "none";

/**
 * WHO DECIDED THIS BARCODE. MANDATORY — never optional, never defaulted.
 *
 * Three months from now, an ugly champion raises exactly one question: did the
 * owner ask for this, or did the extractor produce garbage? The two answers
 * have OPPOSITE remedies — leave it alone versus re-extract and fix the guard —
 * and nothing else in the record can tell them apart. `manual` outranks
 * `extracted` outranks `keyword` outranks `generated` (規格 §3, L0..L3).
 */
export type BarcodeSource = "manual" | "extracted" | "keyword" | "generated";

/** Extraction verdict — same four-valued shape as `scan_ability_effects.py`. */
export type BarcodeVerdict = "PASS" | "SUSPECT" | "FAIL" | "DUPLICATE";

/** Evidence an `extracted` barcode carries so its verdict can be re-judged. */
export interface BarcodeExtraction {
  refImage: string;
  verdict: BarcodeVerdict;
  reasons: string[];
  /** Largest pairwise ΔE among the extracted bands — the 泥巴柱 guard (§4.2). */
  maxPairwiseDeltaE: number;
  /** Share of pixels left after background removal; < 0.4 is a FAIL. */
  foregroundRatio: number;
}

/**
 * ONE CHARACTER'S SIGNATURE. The single contract between the two halves of the
 * system: 後台永遠不產生像素，地端永遠不決定顏色.
 */
export interface VoxelBarcode {
  /** schema tag, so a stored barcode can be rejected when the model moves on */
  v: 1;
  /**
   * The champion this describes. Real champion ids only — with the single
   * exception of the `placeholder.` namespace, for a character the owner named
   * that the roster does not (yet) contain. See `PLACEHOLDER_BARCODE_PREFIX`.
   */
  championId: string;
  bands: BarcodeBands;
  sleeve: SleeveKind;
  /**
   * Colours for the face decals painted on `head.front` only. The STYLES stay
   * on the existing `EyeStyle`/`MouthStyle`/`FaceMark` ladders — this is the
   * colour channel they never had. 多拉A夢's black eyes and red nose are these,
   * not bands: they do not wrap the head, they sit on its front (規格 §2.3②).
   */
  faceColors: { eye: string; nose: string | null; mouth: string };
  /** MANDATORY audit field — see `BarcodeSource`. */
  source: BarcodeSource;
  /** Present iff `source === "extracted"`. */
  extraction?: BarcodeExtraction;
  /** Free-text authoring note. Never read by the painter or the renderer. */
  note?: string;
}

/**
 * Id namespace for a character the owner specified that has no champion doc.
 * Kept as a real, greppable prefix rather than a boolean flag so the census
 * test can hold every OTHER id to "resolves to a champion on disk" without an
 * escape hatch that a typo could fall into.
 */
export const PLACEHOLDER_BARCODE_PREFIX = "placeholder.";

/** True for the id namespace above. */
export function isPlaceholderBarcodeId(championId: string): boolean {
  return championId.startsWith(PLACEHOLDER_BARCODE_PREFIX);
}

/** Shape of `content/models/_voxel-barcodes.json`. */
export interface VoxelBarcodesFile {
  schema?: string;
  note?: string;
  /**
   * The file's own copy of `BARCODE_SLOTS`, written out so the anatomical order
   * is legible to a human editing the JSON — and so a test can catch a tool
   * that rewrote the file with the keys sorted alphabetically (which would put
   * `chestTrim` above `face` and re-stack every character).
   */
  slotOrder?: readonly string[];
  barcodes: Record<string, VoxelBarcode>;
}

export const VOXEL_BARCODES_SCHEMA = "voxel-barcodes@1";

/**
 * The 泥巴柱 (mud-column) floor, ΔE*ab (CIE76). A figure whose bands are all
 * within this of each other is a single smear, not a character — §4.2 grades it
 * FAIL. Measured, not defensive: the icon corpus is known to contain 24 groups
 * of byte-identical files, so extraction WILL produce these.
 */
export const BARCODE_MUD_COLUMN_DELTA_E = 25;

/** Fewest present bands before §4.2 calls the barcode SUSPECT. */
export const BARCODE_MIN_BANDS = 4;

/**
 * Why `BARCODE_TYPICAL_FRAC` is advisory. Kept as an exported string so the
 * admin editor can show the author the same sentence the validator applies.
 */
export const BAND_FRAC_TYPICAL_INFEASIBLE_NOTE =
  "§2.2 的典型佔比表無法同時滿足：只有 5 個槽的角色（例：香吉士 hair/face/top/pants/shoe）" +
  "上限總和僅 0.96，正規化到 1.0 必然把至少一條帶推出區間。因此超界只警告，不判錯。";
