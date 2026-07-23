/**
 * feedbackPresets — PURE recipes for the generic combat-feedback gaps task #33
 * did NOT cover (task #39, item 3). Everything task #33 built is the landed-hit
 * kit; these are the moments AROUND a hit that still had no visual at all:
 *
 *   · MUZZLE FLASH (`projectileSpawn`) — every ranged attack/ability used to
 *     spawn its projectile out of thin air. Now the cast origin pops a
 *     white-hot flare plus forward streaks aimed down the shot.
 *   · LANDING DUST (`knockdown`) — a body slamming into the floor produced no
 *     floor reaction whatsoever. Now a flat radial ring of dust + dirt specks
 *     kicks outward from the impact point.
 *   · BLOCK / PARRY (`hitImpact` with `blocked`) — a blocked hit fired the
 *     exact same warm spark as a clean one, so guarding read as taking damage.
 *     Now it gets its own cool steel clink: a tight bright flash and a few
 *     short sparks REBOUNDING back toward the attacker, no smoke, no blood.
 *
 * Same 8-knob BurstSpec vocabulary as vfxPresets/bloodPresets so all three
 * layers stay poolable and tunable from one place.
 */
import {
  hotToCoolStops,
  popShrinkStops,
  softBodyColorStops,
  type BurstSpec,
  type Rgb,
} from "./vfxPresets";
import type { DecalSpec } from "./bloodPresets";

// ---------------------------------------------------------------------------
// Muzzle flash
// ---------------------------------------------------------------------------

/** Muzzle-flash tints: warm for physical shots, arcane for magic. */
export const MUZZLE_TINTS = {
  physical: [1, 0.85, 0.45],
  magic: [0.7, 0.6, 1],
  true: [1, 1, 1],
} as const satisfies Record<string, Rgb>;

export interface MuzzleRecipe {
  /** the pop at the barrel/hand — 1–2 frames, stays put */
  flash: BurstSpec;
  /** thin streaks racing away down the shot line */
  streaks: BurstSpec;
  /** velocity-cone half-width (narrow: a shot is not a spray) */
  spread: number;
}

/** Muzzle cone half-width — tight, so the flash reads as aimed. */
export const MUZZLE_SPREAD = 0.16;

/**
 * Cast-origin flash for a spawning projectile. `power` (0..1) scales the
 * flare with the shot's weight; the streaks are drag-heavy so they die inside
 * a tenth of a second and never trail behind the projectile itself.
 */
export function muzzleRecipe(tint: Rgb, power = 1): MuzzleRecipe {
  const p = Math.min(1, Math.max(0.2, power));
  return {
    flash: {
      count: 2,
      lifetimeSec: { min: 0.028, max: 0.055 },
      speed: { min: 0, max: 0.5 },
      sizeStops: popShrinkStops(0.85 * p, { popT: 0.2, endFrac: 0.3 }),
      colorStops: hotToCoolStops(tint, { hotT: 0.28 }),
      blend: "additive",
      texture: "assets/textures/particles/muzzle_02.png",
    },
    streaks: {
      count: Math.max(3, Math.round(8 * p)),
      lifetimeSec: { min: 0.05, max: 0.13 },
      speed: { min: 9, max: 17 },
      sizeStops: popShrinkStops(0.1 * p),
      colorStops: hotToCoolStops(tint),
      blend: "additive",
      drag: 0.7, // energy, not debris: it decelerates instead of falling
      stretched: true,
      tailLength: 3,
      directed: { radius: 0.08, spreadRad: MUZZLE_SPREAD },
      texture: "assets/textures/particles/spark_05_rotated.png",
    },
    spread: MUZZLE_SPREAD,
  };
}

// ---------------------------------------------------------------------------
// Landing / knockdown dust
// ---------------------------------------------------------------------------

/** Arena floor dust (warm gray-tan, deliberately desaturated). */
export const DUST_TINT: Rgb = [0.62, 0.58, 0.5];
/** Heavier grit thrown with the dust. */
export const GRIT_TINT: Rgb = [0.45, 0.4, 0.34];

export interface DustRecipe {
  /** the flat outward ring of soft dust */
  puff: BurstSpec;
  /** heavier specks that arc up and fall back */
  grit: BurstSpec;
}

/**
 * Floor reaction for a body hitting the ground (or any grounded slam).
 * `power` 0..1 scales radius/count. Both layers are STANDARD blend — dust is
 * a weight cue, and additive dust turns into fog the moment two land together.
 */
export function landingDustRecipe(power = 1): DustRecipe {
  const p = Math.min(1, Math.max(0.25, power));
  return {
    puff: {
      count: Math.max(4, Math.round(14 * p)),
      lifetimeSec: { min: 0.18, max: 0.45 },
      speed: { min: 2, max: 5 * p + 1.5 },
      sizeStops: popShrinkStops(0.62 * p + 0.2, { popT: 0.22 }),
      colorStops: softBodyColorStops(DUST_TINT, 0.3),
      blend: "alpha",
      gravityY: 0.4, // barely lifts as it spreads
      drag: 0.85,
      flatRing: { radius: 0.45 * p + 0.15, height: 0.08 },
      texture: "assets/textures/particles/smoke_05.png",
    },
    grit: {
      count: Math.max(3, Math.round(9 * p)),
      lifetimeSec: { min: 0.16, max: 0.36 },
      speed: { min: 3, max: 7 * p + 1 },
      sizeStops: popShrinkStops(0.09 * p + 0.03, { endFrac: 0.4 }),
      colorStops: softBodyColorStops(GRIT_TINT, 0.85),
      blend: "alpha",
      gravityY: -16, // specks arc and drop
      drag: 0.2,
      flatRing: { radius: 0.3 * p + 0.1, height: 0.1 },
      texture: "assets/textures/particles/dirt_02.png",
    },
  };
}

// ---------------------------------------------------------------------------
// Block / parry
// ---------------------------------------------------------------------------

/** Cool steel — a guard is metal on metal, never the warm flesh spark. */
export const BLOCK_TINT: Rgb = [0.82, 0.92, 1];

export interface BlockRecipe {
  flash: BurstSpec;
  sparks: BurstSpec;
  /** velocity-cone half-width for the rebound fan */
  spread: number;
}

/** Rebound fan half-width — wide, sparks scatter off a guard. */
export const BLOCK_SPREAD = 0.7;

// ---------------------------------------------------------------------------
// Walking dust (task #147) — velocity-gated foot puffs
// ---------------------------------------------------------------------------

/** Kicked-up arena dust behind a moving foot (warm gray-tan, desaturated). */
export const WALK_DUST_TINT: Rgb = [0.66, 0.62, 0.54];

/**
 * A small soft puff kicked up as a champion moves — the "walk" beat the
 * playtest flagged as missing. Unlike the landing-dust ring, this one GROWS and
 * FADES: it is born small, EXPANDS over its life (sizeStops climb, not
 * pop-shrink), RISES on a gentle positive gravity, and goes fully transparent.
 * STANDARD blend (additive dust reads as smoke the moment two overlap) and a
 * tiny particle count — it fires every stride, so it must stay cheap.
 */
export function walkDustRecipe(): BurstSpec {
  return {
    count: 3,
    lifetimeSec: { min: 0.32, max: 0.5 },
    speed: { min: 0.35, max: 1.1 },
    // grow, don't shrink: small → mid → wide as it dissipates
    sizeStops: [
      [0, 0.12],
      [0.35, 0.34],
      [1, 0.6],
    ],
    colorStops: softBodyColorStops(WALK_DUST_TINT, 0.26),
    blend: "alpha",
    gravityY: 0.7, // rises as it expands
    drag: 0.9,
    flatRing: { radius: 0.14, height: 0.05 }, // low kick, hugging the ground
    texture: "assets/textures/particles/smoke_05.png",
  };
}

// ---------------------------------------------------------------------------
// Cast-ground scorch (task #147) — a fading mark where an ability lands/casts
// ---------------------------------------------------------------------------

/** Dark scorched-earth tint for an ability's ground mark. */
export const SCORCH_TINT: Rgb = [0.16, 0.12, 0.1];
/** Cast scorch lingers a touch longer than a blood pool — an ability scars. */
export const SCORCH_LIFE_MS = 2600;

/**
 * The fading ground decal an ability stamps at its cast/land point (scorched /
 * cracked earth). Reuses the pooled `GroundDecalPool` (same hard cap + fade as
 * the blood splats). `radius` is the ability footprint; the mark sits a little
 * under it so it reads as ground damage, not a halo.
 */
export function castScorchSpec(radius: number): DecalSpec {
  return {
    radius: Math.min(3, Math.max(0.4, radius)),
    lifeMs: SCORCH_LIFE_MS,
    alpha: 0.5,
    tint: SCORCH_TINT,
    texture: "assets/textures/particles/scorch_01.png",
  };
}

/**
 * Guard clink. The sparks are aimed BACK toward the attacker by the caller
 * (negated damage vector): visually deflecting the hit is the entire point,
 * which is what separates it from a clean hit at a glance.
 */
export function blockRecipe(power = 1): BlockRecipe {
  const p = Math.min(1, Math.max(0.3, power));
  return {
    flash: {
      count: 2,
      lifetimeSec: { min: 0.03, max: 0.05 },
      speed: { min: 0, max: 0.3 },
      sizeStops: popShrinkStops(0.62 * p, { popT: 0.22, endFrac: 0.25 }),
      colorStops: hotToCoolStops(BLOCK_TINT, { hotT: 0.25 }),
      blend: "additive",
      texture: "assets/textures/particles/flare_01.png",
    },
    sparks: {
      count: Math.max(5, Math.round(14 * p)),
      lifetimeSec: { min: 0.09, max: 0.2 },
      speed: { min: 5, max: 10 * p + 2 },
      sizeStops: popShrinkStops(0.1 * p + 0.03),
      colorStops: hotToCoolStops(BLOCK_TINT),
      blend: "additive",
      gravityY: -20, // steel sparks die fast and drop hard
      drag: 0.35,
      stretched: true,
      tailLength: 2,
      directed: { radius: 0.12, spreadRad: BLOCK_SPREAD },
      texture: "assets/textures/particles/spark_05_rotated.png",
    },
    spread: BLOCK_SPREAD,
  };
}
