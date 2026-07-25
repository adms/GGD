/**
 * voxelSkin/palette — hue bands per ability element, and the three DETERMINISTIC
 * LEGIBILITY REPAIRS that keep a generated palette readable once the rest of the
 * render stack has had its way with it.
 *
 * The repairs are the load-bearing part of this file, and each one exists
 * because a real channel would otherwise destroy the colour:
 *
 *  1. LUMINANCE CLAMP [0.16, 0.58] on `outfitPrimary`, measured on real
 *     relative luminance (0.2126R + 0.7152G + 0.0722B), not on HSV `v`.
 *     The FLOOR is what survives task #49: Berserker's w3x tint is
 *     [0.3137,0.3137,0.3137] and multiplies straight into the same diffuse slot
 *     this colour lives in, so a 0.16 outfit lands at ~0.05 — dark, but still a
 *     surface. The prototype's first pass clamped HSV `v` instead and produced a
 *     0.125-luminance outfit that the tint crushed to black. The CEILING keeps
 *     the white #64 hit-flash overlay legible on top.
 *  2. EYE CONTRAST — the eye colour is stepped until |Δluminance| from
 *     outfitPrimary ≥ 0.28. Eyes are the cheapest identity read on an 8×8 face.
 *  3. TEAM-HUE RESERVATION — a saturated slot landing within ±22° of a team
 *     hue is rotated +42°, so no generated outfit can be misread as a team
 *     colour at combat distance.
 *
 * All three are BOUNDED loops over deterministic arithmetic — no randomness, no
 * iteration-order dependence, no "try again until it looks right".
 */

export type Rgb = readonly [number, number, number];

/** One element's hue band. `h` degrees, `sat`/`val` 0..1. */
export interface ElementBand {
  h: number;
  sat: number;
  val: number;
}

/**
 * The 17 element bands. The element comes from segment 3 of the ability
 * `vfxKey` (`vfx.<family>.<element>.<name>`), which is the only art-grade
 * signal populated on 456/456 abilities across all 114 champions.
 *
 * `physical` is deliberately the DESATURATED band: "no magic school" should
 * read as leather-and-steel, not as a colour of its own.
 */
export const ELEMENT_BANDS: Readonly<Record<string, ElementBand>> = Object.freeze({
  fire: Object.freeze({ h: 18, sat: 0.78, val: 0.62 }),
  blood: Object.freeze({ h: 352, sat: 0.7, val: 0.42 }),
  holy: Object.freeze({ h: 46, sat: 0.5, val: 0.8 }),
  lightning: Object.freeze({ h: 52, sat: 0.85, val: 0.78 }),
  arcane: Object.freeze({ h: 276, sat: 0.6, val: 0.6 }),
  void: Object.freeze({ h: 288, sat: 0.42, val: 0.28 }),
  nature: Object.freeze({ h: 108, sat: 0.55, val: 0.5 }),
  earth: Object.freeze({ h: 32, sat: 0.42, val: 0.44 }),
  ice: Object.freeze({ h: 196, sat: 0.55, val: 0.74 }),
  wind: Object.freeze({ h: 168, sat: 0.4, val: 0.68 }),
  ki: Object.freeze({ h: 14, sat: 0.62, val: 0.66 }),
  physical: Object.freeze({ h: 210, sat: 0.3, val: 0.5 }),
  sound: Object.freeze({ h: 320, sat: 0.5, val: 0.62 }),
  particle: Object.freeze({ h: 240, sat: 0.45, val: 0.58 }),
  locust: Object.freeze({ h: 84, sat: 0.5, val: 0.38 }),
  orb: Object.freeze({ h: 186, sat: 0.6, val: 0.66 }),
  "?": Object.freeze({ h: 220, sat: 0.25, val: 0.5 }),
});

/**
 * Tie-break order for the dominant element. FROZEN AND EXPLICIT because the
 * alternative — whichever key `Object.keys` happened to yield first — is
 * exactly the kind of latent non-determinism this project already got bitten by
 * (#198). Rarer / more characterful schools win ties over `physical`.
 */
export const ELEMENT_PRIORITY: readonly string[] = Object.freeze([
  "void",
  "blood",
  "holy",
  "ice",
  "fire",
  "lightning",
  "nature",
  "arcane",
  "ki",
  "earth",
  "wind",
  "sound",
  "orb",
  "locust",
  "particle",
  "physical",
  "?",
]);

/** Element of one vfxKey (`vfx.<family>.<element>.<name>`), "?" when absent. */
export function elementOf(vfxKey: string | undefined | null): string {
  if (!vfxKey) return "?";
  const seg = vfxKey.split(".")[2];
  return seg && ELEMENT_BANDS[seg] ? seg : "?";
}

const priorityIndex = (e: string): number => {
  const i = ELEMENT_PRIORITY.indexOf(e);
  return i < 0 ? ELEMENT_PRIORITY.length : i;
};

/** Most-frequent element; ties broken by ELEMENT_PRIORITY, never by key order. */
export function dominantElement(elements: readonly string[]): string {
  if (elements.length === 0) return "?";
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const e of elements) {
    if (!counts.has(e)) order.push(e);
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  let best = order[0] as string;
  for (const e of order) {
    const c = counts.get(e) ?? 0;
    const b = counts.get(best) ?? 0;
    if (c > b || (c === b && priorityIndex(e) < priorityIndex(best))) best = e;
  }
  return best;
}

/** Highest-priority element that is NOT the dominant one (falls back to it). */
export function secondaryElement(elements: readonly string[], dominant: string): string {
  const rest = elements.filter((e) => e !== dominant);
  if (rest.length === 0) return dominant;
  let best = rest[0] as string;
  for (const e of rest) if (priorityIndex(e) < priorityIndex(best)) best = e;
  return best;
}

// --- colour maths ----------------------------------------------------------

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  const t: Rgb =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [t[0] + m, t[1] + m, t[2] + m];
}

/** ITU-R BT.709 relative luminance — what the EYE reads, not HSV `v`. */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function toHex(c: Rgb): string {
  return (
    "#" +
    [c[0], c[1], c[2]]
      .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function fromHex(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// --- the three repairs ------------------------------------------------------

/** Team palette hues (matches ChampionView.TEAM_COLORS: blue/red/green/gold). */
export const TEAM_HUES: readonly number[] = Object.freeze([222, 2, 140, 47]);

/** Saturation at/above which a hue could be MISTAKEN for a team colour. */
export const TEAM_HUE_SAT_FLOOR = 0.45;
/** Reservation half-width, degrees. */
export const TEAM_HUE_GUARD_DEG = 22;
/** Rotation applied when a hue lands inside the reservation. */
export const TEAM_HUE_ROTATE_DEG = 42;

/** Shortest angular distance between two hues, degrees (0..180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Repair 3 — rotate a saturated hue out of any team-colour reservation. */
export function avoidTeamHue(h: number, sat: number): number {
  if (sat < TEAM_HUE_SAT_FLOOR) return ((h % 360) + 360) % 360;
  let hh = ((h % 360) + 360) % 360;
  for (let guard = 0; guard < 4; guard++) {
    const clash = TEAM_HUES.some((t) => hueDistance(hh, t) < TEAM_HUE_GUARD_DEG);
    if (!clash) break;
    hh = (hh + TEAM_HUE_ROTATE_DEG) % 360;
  }
  return hh;
}

/** Repair 1 bounds. See the module header for why each end exists. */
export const OUTFIT_LUM_MIN = 0.16;
export const OUTFIT_LUM_MAX = 0.58;

/**
 * Repair 1 — walk HSV `v` until the MEASURED luminance is inside the window.
 * ≤6 steps, always terminates, always deterministic.
 */
export function repairOutfitLuminance(h: number, s: number, v0: number): Rgb {
  let v = v0;
  let rgb = hsvToRgb(h, s, v);
  for (let i = 0; i < 6; i++) {
    const l = luminance(rgb);
    if (l >= OUTFIT_LUM_MIN && l <= OUTFIT_LUM_MAX) break;
    v = l < OUTFIT_LUM_MIN ? Math.min(0.98, v + 0.09) : Math.max(0.08, v - 0.07);
    rgb = hsvToRgb(h, s, v);
  }
  return rgb;
}

/** Repair 2 — minimum luminance separation between eye and outfitPrimary. */
export const EYE_CONTRAST_MIN = 0.28;

/**
 * Repair 2 — walk a FIXED candidate ladder and take the first that clears the
 * contrast floor, else the one that clears it by the most.
 *
 * The ladder ends at near-white and near-black on purpose: outfitPrimary is
 * already clamped to [0.16, 0.58] by repair 1, and |1.0 − 0.58| = 0.42 > 0.28,
 * so a qualifying eye colour is GUARANTEED to exist rather than hoped for. The
 * first version of this stepped a single value upward and simply gave up after
 * four tries — which produced a 0.218 separation on a real champion, i.e. an
 * eye you could not find on the face.
 */
const EYE_CANDIDATES: readonly (readonly [number, number])[] = Object.freeze([
  [0.85, 0.9],
  [0.85, 0.98],
  [0.3, 1.0],
  [0.85, 0.35],
  [0.45, 0.14],
  [0.0, 1.0],
  [0.0, 0.06],
]);

export function repairEyeContrast(hue: number, against: Rgb): Rgb {
  const target = luminance(against);
  let best = hsvToRgb(hue, 0.85, 0.9);
  let bestGap = -1;
  for (const [s, v] of EYE_CANDIDATES) {
    const c = hsvToRgb(hue, s, v);
    const gap = Math.abs(luminance(c) - target);
    if (gap >= EYE_CONTRAST_MIN) return c;
    if (gap > bestGap) {
      bestGap = gap;
      best = c;
    }
  }
  return best;
}
