/**
 * bloodPresets — the PURE math + recipes for the 濺血 / impact-debris layer
 * (task #39). Everything here is Babylon-free and unit-tested; `BloodFx`
 * is the imperative shell that pushes these onto pooled ParticleSystems.
 *
 * WHY THIS EXISTS AT ALL. WC3 blood is a Blizzard BUILT-IN spawn model
 * (`Objects\Spawnmodels\<race>\<race>Blood\*.mdx`) — it was never part of the
 * custom map, so the 294 imported vfx docs could not possibly contain it, and
 * the extracted Blizzard assets are copyright-gated to the local-only overlay.
 * The shipping blood is therefore fully PROCEDURAL over the CC0 particle
 * sprites already in `content/assets/textures/particles/`.
 *
 * SHAPE OF A SPRAY (Diablo/LoL/fighting-game school, matching task #33's
 * impact kit so the two layer on ONE frame):
 *   · DROPLETS — the read. Stretched alpha-blend billboards fired in a cone
 *     along the DAMAGE VECTOR (attacker → victim), heavy gravity + drag so
 *     they arc down fast. 0.12–0.35 s: gone before the eye can count them.
 *   · MIST — the weight. A brief wide low-alpha haze at the wound, no
 *     direction bias, dies even faster than the droplets.
 *   · DECAL — the memory. One ground splat that fades over ~1.5 s, capped and
 *     pooled (see GroundDecalPool). Blood only: the stylized style dissipates
 *     as energy and deliberately leaves nothing on the floor.
 *
 * Nothing here is additive except the stylized style — additive red glows
 * PINK and reads as fire, which is why every WC3-era "blood" that used
 * additive looked like sparks. Blood is standard-blend, dark, and short.
 */
import type { GoreStyle } from "./goreConfig";
import {
  popShrinkStops,
  softBodyColorStops,
  hotToCoolStops,
  type BurstSpec,
  type Rgb,
} from "./vfxPresets";

// ---------------------------------------------------------------------------
// Damage vector
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  z: number;
}

/** Fallback spray direction when attacker/victim positions coincide. */
export const DEFAULT_SPRAY_DIR: Vec2 = { x: 0, z: 1 };

/** Below this planar separation the damage vector is treated as degenerate. */
export const MIN_SPRAY_LEN = 1e-4;

/**
 * The DAMAGE VECTOR as a unit planar direction: attacker → victim, i.e. the
 * way the hit was travelling, which is the way the spray continues. Returns
 * `fallback` (already unit) when the two points coincide or either is unknown.
 */
export function sprayDirection(
  from: Vec2 | null | undefined,
  to: Vec2 | null | undefined,
  fallback: Vec2 = DEFAULT_SPRAY_DIR,
): Vec2 {
  if (!from || !to) return fallback;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (!(len > MIN_SPRAY_LEN)) return fallback;
  return { x: dx / len, z: dz / len };
}

/** Upward tilt baked into every spray (blood arcs up-and-out, never flat). */
export const SPRAY_UP_BIAS = 0.55;

/**
 * Velocity-cone endpoints for a planar damage vector. Babylon's directed
 * sphere emitter picks each velocity component uniformly between
 * `direction1` and `direction2`, so a symmetric ± box around the aim vector
 * IS the cone. The midpoint is exactly (dir.x, upBias, dir.z) — that identity
 * is what "spray direction derived from the damage vector" is tested on.
 */
export function sprayCone(
  dir: Vec2,
  spread: number,
  upBias = SPRAY_UP_BIAS,
): { d1: [number, number, number]; d2: [number, number, number] } {
  const s = Math.max(0, spread);
  return {
    d1: [dir.x - s, upBias - s * 0.6, dir.z - s],
    d2: [dir.x + s, upBias + s * 0.6, dir.z + s],
  };
}

// ---------------------------------------------------------------------------
// Severity — how much a hit sprays
// ---------------------------------------------------------------------------

export type HitSeverity = "light" | "heavy" | "crit";

/** Damage at/above which a plain hit already counts as heavy. */
export const HEAVY_DAMAGE = 60;

/**
 * Severity of a landed hit. Crits and killing blows always spray the most;
 * otherwise the damage magnitude decides. PURE.
 */
export function severityForHit(
  amount: number,
  opts: { crit?: boolean; killingBlow?: boolean } = {},
): HitSeverity {
  if (opts.crit || opts.killingBlow) return "crit";
  return amount >= HEAVY_DAMAGE ? "heavy" : "light";
}

/**
 * Continuous 0..1 magnitude WITHIN a severity band, so two 20-damage pokes
 * don't spray identically to a 59-damage swing. Saturates at HEAVY_DAMAGE.
 */
export function damageScale(amount: number): number {
  if (!(amount > 0)) return 0;
  return Math.min(1, amount / HEAVY_DAMAGE);
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Per-severity spray tuning at intensity 1. */
export const BLOOD_TUNING = {
  light: {
    dropletN: 10,
    dropletSize: 0.1,
    speed: 6,
    life: 0.22,
    mistN: 4,
    mistSize: 0.42,
    spread: 0.45,
    decalRadius: 0.5,
  },
  heavy: {
    dropletN: 20,
    dropletSize: 0.13,
    speed: 8.5,
    life: 0.3,
    mistN: 7,
    mistSize: 0.6,
    spread: 0.5,
    decalRadius: 0.75,
  },
  crit: {
    dropletN: 34,
    dropletSize: 0.16,
    speed: 11,
    life: 0.35,
    mistN: 11,
    mistSize: 0.8,
    spread: 0.58,
    decalRadius: 1.05,
  },
} as const satisfies Record<HitSeverity, Record<string, number>>;

/** Shortest droplet life (s) — the brief in the task is 0.12–0.35 s. */
export const MIN_DROPLET_LIFE = 0.12;
/** Longest droplet life (s); the recipe must never exceed this. */
export const MAX_DROPLET_LIFE = 0.35;

/** Arterial red (dark, standard-blend — additive red reads as fire). */
export const BLOOD_TINT: Rgb = [0.62, 0.04, 0.05];
/** Mist is darker + desaturated so the haze doesn't read as pink smoke. */
export const BLOOD_MIST_TINT: Rgb = [0.38, 0.05, 0.06];
/** Ground pool: darker still (dried/deoxygenated). */
export const BLOOD_DECAL_TINT: Rgb = [0.3, 0.02, 0.03];

/** Stylized (no-red) energy tints per damage type. */
export const STYLIZED_TINTS = {
  physical: [1, 0.82, 0.35],
  magic: [0.62, 0.55, 1],
  true: [1, 1, 1],
} as const satisfies Record<string, Rgb>;

/** CC0 sprites (already shipped under content/assets/textures/particles). */
const TEX_DROPLET = "assets/textures/particles/circle_05.png";
const TEX_MIST = "assets/textures/particles/smoke_04.png";
const TEX_SPARK = "assets/textures/particles/spark_05_rotated.png";
const TEX_GLOW = "assets/textures/particles/light_01.png";
/** Irregular splat silhouette — reads as a pool, not as a perfect circle. */
export const TEX_BLOOD_DECAL = "assets/textures/particles/scorch_02.png";

// ---------------------------------------------------------------------------
// Ground decal
// ---------------------------------------------------------------------------

export interface DecalSpec {
  /** world-unit radius of the splat */
  radius: number;
  /** total life in ms (fade included) */
  lifeMs: number;
  /** peak alpha at birth */
  alpha: number;
  /** flat emissive tint (decals are unlit) */
  tint: Rgb;
  /** content-relative texture path */
  texture: string;
}

/** Ground pools linger ~1.5 s — long enough to register, short enough to forget. */
export const DECAL_LIFE_MS = 1500;
/** Fraction of the life held at full alpha before the fade starts. */
export const DECAL_HOLD = 0.35;

/**
 * Decal alpha over normalized life: held at peak through DECAL_HOLD, then a
 * smooth (1-k)² fade to exactly 0 at t=1. PURE + monotonically non-increasing.
 */
export function decalFade(t: number): number {
  const k = Math.min(Math.max(t, 0), 1);
  if (k >= 1) return 0;
  if (k <= DECAL_HOLD) return 1;
  const f = (k - DECAL_HOLD) / (1 - DECAL_HOLD);
  return (1 - f) * (1 - f);
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface BloodRecipe {
  /** the read: stretched droplets fired along the damage vector */
  droplets: BurstSpec;
  /** the weight: a brief wide low-alpha haze at the wound */
  mist: BurstSpec;
  /** the memory: a fading ground splat (blood style only; null otherwise) */
  decal: DecalSpec | null;
  /** velocity-cone half-width fed to sprayCone */
  spread: number;
}

/** Round a scaled count up, but never below 1 when the layer is emitting. */
function countAt(base: number, intensity: number): number {
  return Math.max(1, Math.ceil(base * intensity));
}

/**
 * The layered spray for one landed hit. Returns null for style "off" or a
 * non-positive intensity — the caller then emits NOTHING (task #33's impact
 * kit still fires, so the hit still reads).
 *
 * `dmgType` only matters for the stylized style, whose whole point is a
 * damage-type-tinted energy burst instead of red.
 */
export function bloodRecipe(
  style: GoreStyle,
  severity: HitSeverity,
  intensity: number,
  dmgType: keyof typeof STYLIZED_TINTS = "physical",
): BloodRecipe | null {
  if (style === "off" || !(intensity > 0)) return null;
  const t = BLOOD_TUNING[severity];
  const i = Math.min(1, Math.max(0, intensity));
  const life = Math.min(MAX_DROPLET_LIFE, Math.max(MIN_DROPLET_LIFE, t.life));
  const stylized = style === "stylized";
  const tint: Rgb = stylized ? STYLIZED_TINTS[dmgType] : BLOOD_TINT;

  const droplets: BurstSpec = {
    count: countAt(t.dropletN, i),
    lifetimeSec: { min: MIN_DROPLET_LIFE, max: life },
    speed: { min: t.speed * 0.45, max: t.speed },
    sizeStops: popShrinkStops(t.dropletSize * (0.7 + 0.3 * i), { popT: 0.1, endFrac: 0.15 }),
    colorStops: stylized
      ? hotToCoolStops(tint, { hotT: 0.2 })
      : [
          // full-strength arterial red, then darkening as it thins out — never
          // a white-hot start (that is what made additive "blood" read as fire)
          [0, [tint[0], tint[1], tint[2], 1]],
          [0.55, [tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.7, 0.9]],
          [1, [tint[0] * 0.3, tint[1] * 0.3, tint[2] * 0.3, 0]],
        ],
    blend: stylized ? "additive" : "alpha",
    gravityY: -18, // droplets are heavy: they arc down harder than sparks
    drag: 0.3,
    stretched: true,
    tailLength: stylized ? 2.4 : 1.8,
    directed: { radius: 0.16, spreadRad: t.spread },
    texture: stylized ? TEX_SPARK : TEX_DROPLET,
  };

  const mist: BurstSpec = {
    count: countAt(t.mistN, i),
    // ALWAYS shorter-lived than the droplets: the mist is a flash of weight at
    // the wound, and a haze that outlives the spray reads as lingering smoke
    lifetimeSec: { min: 0.08, max: Math.min(0.24, life * 0.8) },
    speed: { min: 0.5, max: 2.2 },
    sizeStops: popShrinkStops(t.mistSize * (0.7 + 0.3 * i), { popT: 0.18 }),
    colorStops: stylized
      ? softBodyColorStops(tint, 0.22 * i)
      : softBodyColorStops(BLOOD_MIST_TINT, 0.3 * i),
    blend: stylized ? "additive" : "alpha",
    gravityY: -4,
    drag: 0.8,
    emitterRadius: 0.28,
    texture: stylized ? TEX_GLOW : TEX_MIST,
  };

  return {
    droplets,
    mist,
    // stylized energy dissipates — it deliberately leaves NOTHING on the floor
    decal: stylized
      ? null
      : {
          radius: t.decalRadius * (0.6 + 0.4 * i),
          lifeMs: DECAL_LIFE_MS,
          alpha: Math.min(0.85, 0.7 * i + 0.15),
          tint: BLOOD_DECAL_TINT,
          texture: TEX_BLOOD_DECAL,
        },
    spread: t.spread,
  };
}
