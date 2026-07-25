/**
 * voxelLook — the per-champion appearance of the blocky humanoid, derived
 * DETERMINISTICALLY from the champion id (owner directive #226).
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------
 * 44 champions share FOUR model docs (`champ.sela` 18, `champ.thorne` 11,
 * `champ.skin.barbarian` 9, `champ.skin.rogue` 6). Those doc ids are frozen —
 * `packages/shared/src/sim/content/skeleton.ts` and `sim/mobs.ts` pin two of
 * them and `packages/shared/src/sim/**` is off-limits — and giving each
 * champion its own modelKey would silently change `championIdentity`'s "shared
 * name component AND same mesh" clause, re-splitting champion pairs the login
 * marquee, the curation starter set and the codex currently merge.
 *
 * So the mesh stays 4-to-many and the LOOK is applied at runtime. Nothing here
 * is random: the same champion id yields the same figure on every client, in
 * every session, with no network sync — which is the only property that
 * matters, since a desynced palette would make callouts ("the purple one")
 * mean different things to different players.
 *
 * `ChampionView` is constructed with the MODEL key, not the champion id
 * (`EntityViewRegistry` passes `e.key`), so it CANNOT differentiate the 44 on
 * its own — the pre-#226 `ACCENTS` table proves it: two hardcoded entries for
 * 44 heroes. The champion id arrives through the existing
 * `ViewContentHooks.modelOverrideFor` seam, which `GameApp` already populates
 * from the seat table.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS PURE, AND WHY THAT MATTERS
 * ---------------------------------------------------------------------------
 * No Babylon import, no scene access, no `Math.random`, no clock. The whole
 * derivation is a hash and some table lookups, so the 44-champion spread is
 * unit-testable without a GPU (`voxelLook.test.ts`) and the sim tree is
 * untouched. `voxelSkin.ts` is the half that talks to Babylon.
 */

/** 8 palette slots, in the generator's `SLOT` order. `[r,g,b]`, each 0..1. */
export type VoxelPalette = readonly [
  Rgb, // skin
  Rgb, // cloth primary
  Rgb, // cloth secondary
  Rgb, // accent (hat / pack)
  Rgb, // trim / metal
  Rgb, // boot / glove
  Rgb, // eye / dark
  Rgb, // prop
];

export type Rgb = readonly [number, number, number];

/** Which optional prop boxes this champion wears. */
export interface VoxelProps {
  hat: boolean;
  pack: boolean;
  belt: boolean;
  pauldron: boolean;
  weapon: boolean;
}

/**
 * Per-joint multipliers written straight to `bone.scaling`. Safe ONLY because
 * the bake is rigidly skinned (one joint per box, weight 1.0) and no clip
 * animates scale — see `tools/voxel-gen/clips.ts`.
 */
export interface VoxelProportions {
  head: number;
  torsoWidth: number;
  armLength: number;
  legLength: number;
  /** shoulder joint offset in world units (±), widening or narrowing the stance */
  shoulderOffset: number;
}

export interface VoxelLook {
  palette: VoxelPalette;
  props: VoxelProps;
  proportions: VoxelProportions;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit. Chosen over anything fancier because it is six lines, has no
 * dependencies, and is stable across engines — the property that makes "same
 * champion id ⇒ same look, on every client" a fact rather than a hope.
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    // charCodeAt can exceed 0xff for the CJK ids in this roster; fold the high
    // byte in too, or 皮卡丘 and 皮卡丘X would collide on their shared prefix.
    h ^= (s.charCodeAt(i) >> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A tiny stream of independent values from one seed. Successive `next(n)` calls
 * consume different bits, so the eight look axes do not correlate (slicing the
 * SAME hash eight ways makes hue track head size, which reads as an accident).
 */
class Bits {
  private h: number;
  constructor(seed: number) {
    this.h = seed >>> 0;
  }
  next(n: number): number {
    // xorshift32 step — one multiply-free mix per draw, deterministic.
    let x = this.h;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.h = x;
    return x % n;
  }
  /** true with probability `num/den` */
  chance(num: number, den: number): boolean {
    return this.next(den) < num;
  }
}

// ---------------------------------------------------------------------------
// Colour tables
// ---------------------------------------------------------------------------

const hex = (h: string): Rgb => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
];

/** Human-ish skin tones, dark → light. */
const SKIN: readonly Rgb[] = ["3f2a1c", "5c3a22", "7a4f2e", "9c6b3f", "c08c56", "d9a878", "e8c6a0", "f2dcc0"].map(hex);

/**
 * Cloth hues at three values each. 12 hues × 3 values = 36 primaries, and the
 * secondary is drawn independently, so two champions sharing a tunic colour
 * almost never share the sleeves as well.
 */
const HUES: readonly string[] = [
  "b03535", "b06a2a", "b09b2a", "6f9b2a", "2f9b4a", "2a9b8f",
  "2a6fb0", "3a3ab0", "6a2ab0", "a02a8f", "8a5a3a", "4a4a52",
];
const VALUE_SCALES: readonly number[] = [0.55, 0.8, 1.0];

/** Metals / trims. */
const TRIM: readonly Rgb[] = ["c8ccd4", "d8b24a", "b0742a", "8a8f99", "5f6670", "e0e4ea"].map(hex);
/** Boots + gloves — always the darkest band so the figure reads grounded. */
const BOOT: readonly Rgb[] = ["241a12", "2c3340", "1c1f24", "3a2a1a", "2a1f2e", "141414"].map(hex);
/** Eye / dark detail. A bright entry here reads as a glow. */
const EYE: readonly Rgb[] = ["151a22", "1a1522", "2a1010", "c8e05a"].map(hex);
/** Prop (weapon haft / staff shaft). */
const PROP: readonly Rgb[] = ["8a6136", "6b5236", "7d5a33", "9aa2ad", "4a4038", "b9b39a", "5a4a6a", "3a4a3a"].map(hex);

function cloth(bits: Bits): Rgb {
  const base = hex(HUES[bits.next(HUES.length)]!);
  const v = VALUE_SCALES[bits.next(VALUE_SCALES.length)]!;
  return [base[0] * v, base[1] * v, base[2] * v];
}

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

/**
 * PROPORTION SETS ARE COMPENSATING PAIRS ON PURPOSE. Longer legs come with a
 * shorter arm reach and a smaller head, so the TOTAL silhouette stays within a
 * few percent of 1.8 u and #150's uniform on-screen height survives.
 *
 * It is also why these are applied AFTER `ChampionView` measures the loaded
 * hierarchy: `nativeH` is always the archetype's exact 1.8, so the
 * normalisation factor cannot drift champion to champion.
 *
 * Note `legLength` is a scale on the FOOT joint, which is the hip pivot: the
 * leg box hangs below it, so scaling y there lengthens the leg downward. The
 * generator grounds the figure at load, and `ChampionView` re-grounds on
 * `min.y` after scaling, so a longer leg does not sink the model.
 */
const PROPORTIONS: readonly VoxelProportions[] = [
  { head: 1.0, torsoWidth: 1.0, armLength: 1.0, legLength: 1.0, shoulderOffset: 0 },
  { head: 1.14, torsoWidth: 0.9, armLength: 0.94, legLength: 0.96, shoulderOffset: -0.012 },
  { head: 0.9, torsoWidth: 1.16, armLength: 1.08, legLength: 1.0, shoulderOffset: 0.02 },
  { head: 1.08, torsoWidth: 1.08, armLength: 0.96, legLength: 0.94, shoulderOffset: 0.014 },
  { head: 0.94, torsoWidth: 0.88, armLength: 1.12, legLength: 1.06, shoulderOffset: -0.008 },
  { head: 1.0, torsoWidth: 1.2, armLength: 1.0, legLength: 0.92, shoulderOffset: 0.026 },
  { head: 1.12, torsoWidth: 0.96, armLength: 1.04, legLength: 1.02, shoulderOffset: 0.006 },
  { head: 0.92, torsoWidth: 1.04, armLength: 0.92, legLength: 1.08, shoulderOffset: -0.016 },
];

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Archetype-specific bias so a mage still reads as a mage after seeding. */
interface ArchetypeBias {
  /** probability numerator out of 8 for each prop */
  hat: number;
  pack: number;
  belt: number;
  pauldron: number;
  weapon: number;
}

const BIAS: Readonly<Record<string, ArchetypeBias>> = {
  mage: { hat: 6, pack: 6, belt: 6, pauldron: 1, weapon: 7 },
  knight: { hat: 6, pack: 5, belt: 7, pauldron: 7, weapon: 7 },
  barbarian: { hat: 2, pack: 2, belt: 7, pauldron: 6, weapon: 7 },
  rogue: { hat: 6, pack: 5, belt: 6, pauldron: 2, weapon: 6 },
  undead: { hat: 1, pack: 1, belt: 2, pauldron: 1, weapon: 2 },
};

const DEFAULT_BIAS: ArchetypeBias = { hat: 4, pack: 4, belt: 5, pauldron: 4, weapon: 5 };

/** The four shipped stand-in doc ids → the archetype baked into their .glb. */
export const ARCHETYPE_BY_MODEL_KEY: Readonly<Record<string, string>> = {
  "champ.sela": "mage",
  "champ.thorne": "knight",
  "champ.skin.barbarian": "barbarian",
  "champ.skin.rogue": "rogue",
  "champ.blocky.undead": "undead",
};

/**
 * The look for one champion. `archetype` only biases which props are likely
 * (a mage usually keeps its hat, a barbarian usually does not) — it never
 * decides a colour, so two champions on the same mesh are still distinct.
 *
 * Pure and total: an unknown archetype falls back to a neutral bias, and an
 * empty id yields the seed-0 look rather than throwing.
 */
export function voxelLookFor(championId: string, archetype: string): VoxelLook {
  const bits = new Bits(fnv1a(`${championId} ${archetype}`));
  const bias = BIAS[archetype] ?? DEFAULT_BIAS;
  return {
    palette: [
      SKIN[bits.next(SKIN.length)]!,
      cloth(bits),
      cloth(bits),
      cloth(bits),
      TRIM[bits.next(TRIM.length)]!,
      BOOT[bits.next(BOOT.length)]!,
      EYE[bits.next(EYE.length)]!,
      PROP[bits.next(PROP.length)]!,
    ],
    props: {
      hat: bits.chance(bias.hat, 8),
      pack: bits.chance(bias.pack, 8),
      belt: bits.chance(bias.belt, 8),
      pauldron: bits.chance(bias.pauldron, 8),
      weapon: bits.chance(bias.weapon, 8),
    },
    proportions: PROPORTIONS[bits.next(PROPORTIONS.length)]!,
  };
}

/**
 * The accent colour for the PROCEDURAL fallback figure (`ChampionView`'s box
 * man, shown until the .glb lands or when it fails to load). Reading it from
 * the same seed is what keeps the two code paths from drifting: the fallback
 * and the baked mesh are the same character in the same colours, so a champion
 * does not change appearance mid-load.
 */
export function fallbackAccentFor(championId: string | null | undefined, archetype: string): [number, number, number] {
  if (!championId) return [0.5, 0.5, 0.55];
  const c = voxelLookFor(championId, archetype).palette[3];
  return [c[0], c[1], c[2]];
}
