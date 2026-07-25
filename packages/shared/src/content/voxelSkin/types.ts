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
