/**
 * voxelSkin/generate — the generator itself (task #231).
 *
 * `generateVoxelSkin(input)` is a PURE function from a champion's own identity
 * to its look. `generateAllVoxelSkins(inputs)` runs it over the roster in
 * id-sorted order with a collision ratchet, and is what guarantees the property
 * the owner actually asked for: no two champions look the same.
 *
 * THE FOUR-LAYER OVERRIDE CHAIN — highest wins, first match per axis:
 *   L1  hand-authored override      content/models/_voxel-skins.json
 *   L2  keyword rules               rules.ts (稱號 / 本名 / tags / hint / desc)
 *   L3  element band                the dominant ability vfx element
 *   L4  hash                        pick(id, salt, channel, frozenLadder)
 *
 * INPUTS THAT WERE DELIBERATELY REJECTED, and why (measured on the live roster):
 *   • `role` is a pure function of `attackType` — 79 fighter / 32 marksman and
 *     three singletons. Keying anything off it would put 79 look-alikes on the
 *     contact sheet.
 *   • `buildPriority` is byte-identical on 99 of 114 docs (15 distinct lists).
 *   • the champion `icon` — 141 files but only 87 distinct byte-hashes across
 *     24 duplicate groups (the map author reused BLPs; one file covers both
 *     Pikachus AND 曹操孟德), so sampling it would CLONE looks, not separate them.
 *   • `tint` — see palette.ts. It multiplies into the same diffuse slot at
 *     render time, so feeding it in here would tint the 20 tinted champions
 *     twice. It is an OUTPUT-side channel, never an input.
 */
import { channel, frac, pick } from "./hash";
import {
  ELEMENT_BANDS,
  avoidTeamHue,
  dominantElement,
  elementOf,
  fromHex,
  hsvToRgb,
  luminance,
  repairEyeContrast,
  repairOutfitLuminance,
  secondaryElement,
  toHex,
} from "./palette";
import { matchRules, type RuleHit } from "./rules";
import { silhouetteHint } from "./hints";
import {
  BACK_MOTIFS,
  EMBLEMS,
  EYE_STYLES,
  FACE_MARKS,
  HAIR_STYLES,
  HAIR_TONES,
  HEAD_MOTIFS,
  LEG_STYLES,
  METAL_TONES,
  MOTIF_BOX_COST,
  MOUTH_STYLES,
  SHOULDER_MOTIFS,
  SKIN_TONES,
  STAND_IN_MODEL_KEYS,
  TOP_STYLES,
  type BackMotif,
  type Emblem,
  type EyeStyle,
  type FaceMark,
  type HairStyle,
  type HeadMotif,
  type LegStyle,
  type MouthStyle,
  type ShoulderMotif,
  type TopStyle,
  type VoxelSkinInput,
  type VoxelSkinOverride,
  type VoxelSkinRecipe,
  type Tone,
} from "./types";

const toneNamed = (ladder: readonly Tone[], name: string): Tone =>
  ladder.find((t) => t[0] === name) ?? (ladder[0] as Tone);

/** 稱號 (title) and 本名 (proper name) from the doc's `"稱號 - 本名"` convention. */
export function splitName(name: string | undefined): { title: string; proper: string } {
  const n = name ?? "";
  const i = n.indexOf(" - ");
  if (i < 0) return { title: n, proper: n };
  return { title: n.slice(0, i), proper: n.slice(i + 3) };
}

/**
 * Everything the keyword rules read, in one string.
 *
 * THE DESCRIPTION IS DELIBERATELY NOT IN HERE, and that is a real constraint
 * rather than an oversight. The client resolves a champion through
 * `Champions` (the sim `ChampionDef`), which carries name / tags / modelKey /
 * attackType / ability vfxKeys but NOT `description` — that field only exists on
 * the authored JSON doc. A haystack that included it would make the client
 * generate a DIFFERENT skin from the one the contact sheet and the tests
 * generated, which breaks the one property this whole task rests on. So the
 * input surface is exactly the intersection of what every consumer can see.
 * (The 稱號 is the motif-dense string anyway: 「七夜怪談 - 貞子」 carries the
 * ghost, 「白木老樹精」 carries the tree.)
 */
export function haystackOf(input: VoxelSkinInput): string {
  const { title, proper } = splitName(input.name);
  return [
    title,
    proper,
    (input.tags ?? []).join(" "),
    input.modelHint ?? silhouetteHint(input.id),
  ].join(" ");
}

/** Diagnostics the admin sheet shows next to a tile (never read by the game). */
export interface VoxelSkinTrace {
  haystack: string;
  hits: RuleHit[];
}

/**
 * Generate one champion's recipe. Pure: the same input always yields the same
 * recipe, in node, in the browser and across builds.
 */
export function generateVoxelSkin(
  input: VoxelSkinInput,
  opts: { salt?: number; override?: VoxelSkinOverride | null; trace?: { out?: VoxelSkinTrace } } = {},
): VoxelSkinRecipe {
  const id = input.id;
  const salt = opts.salt ?? 1;
  const haystack = haystackOf(input);
  const { forced, hits } = matchRules(haystack);
  if (opts.trace) opts.trace.out = { haystack, hits };

  // ---- L3: element band --------------------------------------------------
  const elements = (input.vfxKeys ?? []).map(elementOf);
  const dom = dominantElement(elements.length ? elements : ["?"]);
  const sec = secondaryElement(elements.length ? elements : ["?"], dom);
  const band = ELEMENT_BANDS[dom] ?? ELEMENT_BANDS["?"]!;
  const band2 = ELEMENT_BANDS[sec] ?? band;

  // ---- palette -----------------------------------------------------------
  // ±23° of jitter inside the band: two void champions read as the same school
  // and are never the same colour.
  const h1 = avoidTeamHue(band.h + (frac(id, salt, "h1") * 46 - 23), band.sat);
  const s1 = Math.min(0.92, Math.max(0.18, band.sat + frac(id, salt, "s1") * 0.24 - 0.12));
  const v1 = Math.min(0.62, Math.max(0.2, band.val + frac(id, salt, "v1") * 0.22 - 0.11));
  const outfitPrimary = repairOutfitLuminance(h1, s1, v1); // repair 1

  // secondary: either a rotation of the primary hue, or (rot 0) the same hue
  // lifted in value — a two-tone outfit rather than two unrelated colours.
  const rot = pick(id, salt, "rot", [-32, 28, 150, 210, 0] as const);
  const vPrim = Math.max(luminance(outfitPrimary), 0.12);
  const h2 = avoidTeamHue(h1 + rot, s1);
  const v2 = rot === 0 ? Math.min(0.78, vPrim + 0.34) : Math.max(0.2, vPrim + 0.1);
  const outfitSecondary = hsvToRgb(h2, Math.max(0.12, s1 - 0.12), v2);

  const eyeHue = avoidTeamHue(band2.h + 180 + (frac(id, salt, "eh") * 40 - 20), 0.9);
  const eye = repairEyeContrast(eyeHue, outfitPrimary); // repair 2
  const accent = hsvToRgb(avoidTeamHue(h1 + 180, 0.8), 0.72, Math.min(0.92, vPrim + 0.45));

  const tags = (input.tags ?? []).join(" ");
  const skinTone = toneNamed(SKIN_TONES, forced.get("skin") ?? pick(id, salt, "skin", SKIN_TONES)[0]);
  const hairTone = pick(id, salt, "hair", HAIR_TONES);
  // weapon tags steer the hardware: a gunner's fittings are gunmetal, a
  // bladesman's are steel, everyone else draws from the ladder.
  const metalTone = /\bgun\b/.test(tags)
    ? toneNamed(METAL_TONES, "gunmetal")
    : /katana|sword|greatsword/.test(tags)
      ? toneNamed(METAL_TONES, "steel")
      : pick(id, salt, "metal", METAL_TONES);

  // ---- blocking ----------------------------------------------------------
  // a chrome construct with a fringe reads as a person in a costume, so the
  // material decides the hair before the hash gets a say.
  const hairStyle: HairStyle =
    skinTone[0] === "chrome" ? "bald" : pick(id, salt, "hs", HAIR_STYLES);
  const eyeStyle = (forced.get("eye") ?? pick(id, salt, "es", EYE_STYLES)) as EyeStyle;
  const mouth = (forced.get("mouth") ?? pick(id, salt, "mo", MOUTH_STYLES)) as MouthStyle;
  const mark = pick(id, salt, "mk", FACE_MARKS) as FaceMark;
  const emblem = pick(id, salt, "em", EMBLEMS) as Emblem;
  const top = (forced.get("top") ?? pick(id, salt, "top", TOP_STYLES)) as TopStyle;
  // melee and ranged draw legs from DIFFERENT channels, so the two silhouette
  // families do not converge on the same distribution.
  const legs = (forced.get("legs") ??
    pick(id, salt, input.attackType === "ranged" ? "lgR" : "lgM", LEG_STYLES)) as LegStyle;

  let motifHead = (forced.get("head") ?? pick(id, salt, "mh", HEAD_MOTIFS)) as HeadMotif;
  let motifShoulder = (forced.get("shoulder") ??
    pick(id, salt, "ms", SHOULDER_MOTIFS)) as ShoulderMotif;
  let motifBack = (forced.get("back") ?? pick(id, salt, "mb", BACK_MOTIFS)) as BackMotif;

  // TRIANGLE BUDGET, enforced here rather than hoped for: drop motifs
  // cheapest-slot-last until the box count is inside MAX_MOTIF_BOXES.
  const cost = (): number =>
    (MOTIF_BOX_COST[motifHead] ?? 0) +
    (MOTIF_BOX_COST[motifShoulder] ?? 0) +
    (MOTIF_BOX_COST[motifBack] ?? 0);
  if (cost() > 6) motifShoulder = "none";
  if (cost() > 6) motifBack = "none";
  if (cost() > 6) motifHead = "none";

  const recipe: VoxelSkinRecipe = {
    v: 1,
    championId: id,
    salt,
    element: dom,
    elementSecondary: sec,
    palette: {
      skin: toHex(skinTone[1]),
      hair: toHex(hairTone[1]),
      outfitPrimary: toHex(outfitPrimary),
      outfitSecondary: toHex(outfitSecondary),
      metal: toHex(metalTone[1]),
      eye: toHex(eye),
      accent: toHex(accent),
    },
    face: { eye: eyeStyle, mouth, mark },
    hair: { style: hairStyle, tone: hairTone[0] },
    outfit: { top, legs, emblem },
    motifs: { head: motifHead, shoulder: motifShoulder, back: motifBack },
    // THIS is the field that retires "18 champions with one face": a champion
    // on one of the four shared stand-in meshes has no art of its own, so it
    // wears the voxel body + this skin instead of the borrowed glb.
    preferVoxelBody: STAND_IN_MODEL_KEYS.includes(input.modelKey ?? ""),
  };

  return opts.override ? applyOverride(recipe, opts.override) : recipe;
}

/** L1 — lay a partial hand-authored override over a generated recipe. */
export function applyOverride(base: VoxelSkinRecipe, ov: VoxelSkinOverride): VoxelSkinRecipe {
  return {
    ...base,
    palette: { ...base.palette, ...(ov.palette ?? {}) },
    face: { ...base.face, ...(ov.face ?? {}) },
    hair: { ...base.hair, ...(ov.hair ?? {}) },
    outfit: { ...base.outfit, ...(ov.outfit ?? {}) },
    motifs: { ...base.motifs, ...(ov.motifs ?? {}) },
    preferVoxelBody: ov.preferVoxelBody ?? base.preferVoxelBody,
  };
}

/**
 * THE LOOK SIGNATURE — the tuple the eye actually resolves at combat distance.
 * Colours are quantised to 5 bits per channel on purpose: two outfits three
 * 8-bit steps apart are the SAME outfit to a player, and a distinctness test
 * that counts them as different proves nothing.
 */
export function lookSignature(r: VoxelSkinRecipe): string {
  const q = (hex: string): string => {
    const c = fromHex(hex);
    return c.map((v) => Math.round(v * 31)).join(",");
  };
  return [
    q(r.palette.outfitPrimary),
    q(r.palette.outfitSecondary),
    q(r.palette.skin),
    q(r.palette.hair),
    r.hair.style,
    r.face.eye,
    r.outfit.top,
    r.outfit.legs,
    r.outfit.emblem,
    r.motifs.head,
    r.motifs.shoulder,
    r.motifs.back,
  ].join("|");
}

/** Max salt escalations before we give up and let a duplicate through. */
const MAX_SALT = 12;

export interface GenerateAllResult {
  recipes: Map<string, VoxelSkinRecipe>;
  /** championIds that needed a salt > 1 to clear a signature collision */
  escalated: string[];
  /** signatures that STILL collide after MAX_SALT (should always be empty) */
  unresolved: string[];
}

/**
 * Generate the whole roster with the collision ratchet.
 *
 * ORDER-STABLE BY CONSTRUCTION: the inputs are walked in id-sorted order, so
 * the salt a given champion ends up with does not depend on the order the
 * caller happened to read the content directory in. That is what lets the
 * committed snapshot be a meaningful review artifact.
 */
export function generateAllVoxelSkins(
  inputs: readonly VoxelSkinInput[],
  overrides: Readonly<Record<string, VoxelSkinOverride>> = {},
): GenerateAllResult {
  const sorted = [...inputs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const recipes = new Map<string, VoxelSkinRecipe>();
  const used = new Map<string, string>();
  const escalated: string[] = [];
  const unresolved: string[] = [];

  for (const input of sorted) {
    const ov = Object.prototype.hasOwnProperty.call(overrides, input.id)
      ? overrides[input.id]
      : null;
    let salt = 1;
    let recipe = generateVoxelSkin(input, { salt, override: ov });
    let sig = lookSignature(recipe);
    while (used.has(sig) && salt < MAX_SALT) {
      salt++;
      recipe = generateVoxelSkin(input, { salt, override: ov });
      sig = lookSignature(recipe);
    }
    if (salt > 1) escalated.push(input.id);
    if (used.has(sig)) unresolved.push(input.id);
    used.set(sig, input.id);
    recipes.set(input.id, recipe);
  }
  return { recipes, escalated, unresolved };
}

/**
 * The COMPACT wire form — positional arrays instead of keys. This is what the
 * budget number quotes (207 B/champion raw, ~42 B gzipped); the verbose recipe
 * is a review artifact, not an asset.
 */
export function compactRecipe(r: VoxelSkinRecipe): unknown[] {
  return [
    r.palette.skin,
    r.palette.hair,
    r.palette.outfitPrimary,
    r.palette.outfitSecondary,
    r.palette.metal,
    r.palette.eye,
    r.palette.accent,
    r.face.eye,
    r.face.mouth,
    r.face.mark,
    r.hair.style,
    r.outfit.top,
    r.outfit.legs,
    r.outfit.emblem,
    r.motifs.head,
    r.motifs.shoulder,
    r.motifs.back,
    r.preferVoxelBody ? 1 : 0,
  ];
}

/** Total boxes of extra motif geometry this recipe adds to the body. */
export function motifBoxCount(r: VoxelSkinRecipe): number {
  return (
    (MOTIF_BOX_COST[r.motifs.head] ?? 0) +
    (MOTIF_BOX_COST[r.motifs.shoulder] ?? 0) +
    (MOTIF_BOX_COST[r.motifs.back] ?? 0)
  );
}

/** Deterministic per-champion texture seed, used by the painter's dither. */
export function textureSeed(r: VoxelSkinRecipe): number {
  return channel(r.championId, r.salt, "tex");
}
