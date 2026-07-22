/**
 * chickenSilhouette — the PURE point-cloud authoring for the task #93 match-win
 * (吃雞) firework: a roast chicken, sampled from an analytic silhouette into a
 * few thousand coloured points that the GPU shell (`ChickenFireworkFx`) then
 * flies particles into.
 *
 * WHY A SILHOUETTE AND NOT A SPRITE. A shaped firework is not a picture that
 * fades in — it is a burst whose particles ARRIVE at a formation and then droop
 * out of it. That needs a per-particle TARGET, which means the shape has to
 * exist as data (points), not as pixels. Sampling an analytic silhouette also
 * means the shape can be retuned by moving one number and re-looked-at, which
 * is exactly what the acceptance criterion ("can a player tell it is a roast
 * chicken?") demanded — see the iteration notes at the bottom of this comment.
 *
 * WHY AN SDF UNION. The bird is authored as a handful of ellipses and tapered
 * capsules (iq's 2D round-cone) unioned with min(), minus a few subtractive
 * "cuts" that carve the creases where a thigh meets the body. Sampling is then
 * trivially correct: a grid point is INSIDE when d < 0, and the boundary can be
 * walked by projecting band points down the gradient. No polygon winding, no
 * self-intersection, no triangulation.
 *
 * WHAT MAKES IT READ (rewritten after three blind judges unanimously rejected
 * the first shipped shape as "a cat/fox face with two ears" — the honest
 * failure and its fix are recorded here so nobody re-introduces it):
 *   1. A WIDE, LOW BODY. The bird is a food-mound, WIDER than it is tall. The
 *      original was near-round, and a round mass with two things on top is a
 *      face by default. Wide-and-low is the first thing that says "food, not
 *      animal".
 *   2. TWO SHORT, FAT, CLOSE-TOGETHER DRUMSTICKS standing up in a TIGHT V
 *      (~17° each), meat-heavy clubs with white bone knuckles at the top. The
 *      first version splayed them 49° wide and tapered them thin — that is
 *      exactly the silhouette of ears/horns. Legs that are chunky, near
 *      vertical and close read as trussed drumsticks; the space between them
 *      shows the breast (a CONVEX bulge, never a concave forehead-valley).
 *   3. THE PLATE. A wide, thin, COOL-WHITE ellipse under a warm golden mass
 *      says "food on a dish" before the eye has resolved any outline at all.
 *   4. COLOUR SEPARATION. Roast gold body, bone-white knuckles, cool-white
 *      plate. Three values, and the drumsticks stay legible half-drooped.
 * No wing nubs, no tail: they read as flank spikes and pushed the first
 * version toward "bat". The whole read is body + two drumsticks + plate.
 *
 * Y IS UP, x is right, units are "shape units": the bird spans x∈[-1,1] and
 * y∈[-0.78, 1.0], so the shell can scale by a single factor to fill a frame.
 *
 * Babylon-free and deterministic (seeded PRNG) so chickenSilhouette.test.ts can
 * assert the topology that carries the joke — two lobes above the body, a plate
 * wider than the bird, bone at the top of each leg — instead of asserting that
 * some pixels were drawn.
 */

/** Which anatomical part a point belongs to (drives colour + fade order). */
export type ChickenPart = "plate" | "body" | "thigh" | "shank" | "knuckle" | "wing" | "tail";

/** Axis-aligned-in-local-space ellipse, optionally rotated by `rot` radians. */
export interface EllipsePrim {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot?: number;
  part: ChickenPart;
}

/** Tapered capsule (iq 2D round cone): radius `ra` at a → `rb` at b. */
export interface ConePrim {
  kind: "cone";
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ra: number;
  rb: number;
  part: ChickenPart;
}

export type ChickenPrim = EllipsePrim | ConePrim;

/** A sampled point of the silhouette (one firework particle's destination). */
export interface SilhouettePoint {
  /** shape-space position, y up */
  x: number;
  y: number;
  /** emissive colour, 0..1+ (additive blending — rim points may exceed 1) */
  r: number;
  g: number;
  b: number;
  /** per-point size multiplier around the shell's base particle size */
  size: number;
  /** true for points projected onto the outline (crisper edge, brighter) */
  rim: boolean;
  part: ChickenPart;
  /** stable 0..1 per-point seed: twinkle phase, drift, fade stagger */
  seed: number;
}

// ---------------------------------------------------------------------------
// the bird
// ---------------------------------------------------------------------------

/**
 * Drumstick geometry — REDESIGNED after the blind-judge rejection. The prior
 * numbers (splay 0.86 rad / 49°, attach ±0.28, taper 0.22→0.042) were the
 * failure: wide + long + thin = a pair of ears/horns. The rule that actually
 * makes it a drumstick and not an ear:
 *
 *   SPLAY 0.30 rad (~17° from vertical). NEAR-VERTICAL and CLOSE, so the two
 *     legs read as "two drumsticks held up together", never as ears at the
 *     corners of a face. Widen this past ~25° and the ears come back.
 *   ATTACH (±0.19, 0.075). Close to centre, so the fat thighs sit ON TOP of
 *     the breast mound with the breast bulging up CONVEX between them — the
 *     old design left a concave valley there, which is a forehead.
 *   FAT + SHORT. r0 0.25 thigh, len 0.46. A drumstick is a stubby meat club;
 *     a long thin shaft is a horn. The bulge at ~half-length is the meat.
 *   KNUCKLE 0.088 — reads as an exposed bone end, the only pure-white mass on
 *     the bird apart from the dish. Kept small so it is a bone, not a pom-pom.
 */
const LEG = {
  // JUDGE FIX (all 3 rejected iter7 as "cat/fox face with two ears"). The
  // wide 49° splay + long thin taper WAS the ears. A trussed roast bird holds
  // its drumsticks UP, CLOSE TOGETHER and CHUNKY — meat-heavy clubs, not
  // gracile horns. New pose: near-vertical, attached close to centre, short
  // and FAT, bone knuckles near the top-centre where ears can never converge.
  attachX: 0.19,
  attachY: 0.075,
  splay: 0.30, // ~17° from vertical — a tight V, not a wide fork
  len: 0.46,
  kneeFrac: 0.52,
  r0: 0.25, // fat thigh where it meets the breast
  rKnee: 0.16,
  // still meat on the bone: a wire shank reads as a cotton-bud on a stick
  r1: 0.078,
  bulge: 0.245,
  knuckleR: 0.088,
} as const;

/** One drumstick, `s` = ±1 for left/right. */
function drumstick(s: number): ChickenPrim[] {
  const dx = Math.sin(LEG.splay) * s;
  const dy = Math.cos(LEG.splay);
  const ax = s * LEG.attachX;
  const ay = LEG.attachY;
  const kx = ax + dx * LEG.len * LEG.kneeFrac;
  const ky = ay + dy * LEG.len * LEG.kneeFrac;
  const tx = ax + dx * LEG.len;
  const ty = ay + dy * LEG.len;
  return [
    // thigh — buried in the breast, so the leg GROWS out of the body
    { kind: "cone", ax, ay, bx: kx, by: ky, ra: LEG.r0, rb: LEG.rKnee, part: "thigh" },
    // the meat bulge that makes it a drumstick and not a horn
    {
      kind: "ellipse",
      cx: ax + dx * LEG.len * LEG.kneeFrac * 0.55,
      cy: ay + dy * LEG.len * LEG.kneeFrac * 0.55,
      rx: LEG.bulge,
      ry: LEG.bulge * 0.92,
      rot: -s * LEG.splay,
      part: "thigh",
    },
    // shank — the taper to bone
    { kind: "cone", ax: kx, ay: ky, bx: tx, by: ty, ra: LEG.rKnee, rb: LEG.r1, part: "shank" },
    // knuckle — the exposed bone end. THE tell. Keep it fat and keep it white.
    {
      kind: "ellipse",
      cx: tx + dx * LEG.knuckleR * 0.45,
      cy: ty + dy * LEG.knuckleR * 0.45,
      rx: LEG.knuckleR,
      ry: LEG.knuckleR,
      part: "knuckle",
    },
  ];
}

/**
 * The two legs as separate GROUPS. The sampler draws each group's own outline
 * even where the body swallows it (see `sampleChickenSilhouette`), which is
 * what puts a crease between thigh and breast — without it the leg dissolves
 * into the body mass and the bird goes back to being a blob.
 */
export function chickenLegGroups(): ChickenPrim[][] {
  return [drumstick(-1), drumstick(1)];
}

/**
 * The full silhouette, in draw-agnostic order. Exported so the audition page
 * and the tests can reason about the same geometry the sampler uses.
 */
export function chickenPrims(): ChickenPrim[] {
  return [
    // --- platter: a shallow dish the bird SITS IN. Iteration 2 ran it to the
    // full frame width and the long horizontal bar flattened the composition
    // into a manta ray; iteration 1 floated it below a gap and it read as a
    // separate saucer. It only has to peek out either side and touch.
    // two stacked lenses: the dish plus the step of its rim/foot, which is
    // what separates "a dish" from "a horizontal bar of light"
    { kind: "ellipse", cx: 0, cy: -0.545, rx: 0.95, ry: 0.078, part: "plate" },
    { kind: "ellipse", cx: 0, cy: -0.600, rx: 0.73, ry: 0.055, part: "plate" },

    // --- body: a WIDE, LOW roasted mound (wider than tall — a food mound, not
    // a round face). The BREAST DOME rises CONVEX at the top-centre so the
    // space between the legs is a full bulge, not a forehead-valley: a valley
    // between two upward appendages is the exact thing that read as ears.
    { kind: "ellipse", cx: 0, cy: -0.16, rx: 0.74, ry: 0.40, part: "body" },
    { kind: "ellipse", cx: 0, cy: 0.0, rx: 0.44, ry: 0.36, part: "body" },

    // --- the legs -----------------------------------------------------------
    // NO wing nubs and NO tail: round 1 shipped both and they were the reason
    // the bird read as a bat. Spiky appendages at the flanks fight the two
    // appendages that matter. Dropping them was the single biggest gain.
    ...drumstick(-1),
    ...drumstick(1),
  ];
}

/**
 * Subtractive shapes. None survive: every crease that was tried (a line across
 * the breast, a nick at the shoulder) read as decorative strapping rather than
 * anatomy. The thigh/breast separation is drawn instead as an INNER CONTOUR by
 * the sampler, which follows the leg's real outline through the body.
 */
export function chickenCuts(): ChickenPrim[] {
  return [];
}

/** Shape-space bounding box of the silhouette (sampler + shell framing). */
export const CHICKEN_BOUNDS = { minX: -0.97, maxX: 0.97, minY: -0.66, maxY: 0.66 } as const;

// ---------------------------------------------------------------------------
// signed distance
// ---------------------------------------------------------------------------

function sdEllipse(px: number, py: number, e: EllipsePrim): number {
  let dx = px - e.cx;
  let dy = py - e.cy;
  if (e.rot) {
    const c = Math.cos(-e.rot);
    const s = Math.sin(-e.rot);
    const nx = dx * c - dy * s;
    dy = dx * s + dy * c;
    dx = nx;
  }
  const k = Math.hypot(dx / e.rx, dy / e.ry);
  // sign is EXACT (k<1 ⟺ inside); the magnitude is the usual scaled estimate,
  // which is all the boundary projection needs.
  return (k - 1) * Math.min(e.rx, e.ry);
}

/** iq's exact 2D rounded-cone (tapered capsule) SDF. */
function sdCone(px: number, py: number, c: ConePrim): number {
  const bax = c.bx - c.ax;
  const bay = c.by - c.ay;
  const l2 = bax * bax + bay * bay;
  if (l2 < 1e-9) return Math.hypot(px - c.ax, py - c.ay) - c.ra;
  const rr = c.ra - c.rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - c.ax;
  const pay = py - c.ay;
  const y = pax * bax + pay * bay;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const x2 = qx * qx + qy * qy;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - c.rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - c.ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - c.ra;
}

function sdPrim(px: number, py: number, p: ChickenPrim): number {
  return p.kind === "ellipse" ? sdEllipse(px, py, p) : sdCone(px, py, p);
}

/** Union distance + the part that owns the nearest surface. */
export function sdChickenPart(
  px: number,
  py: number,
  prims: readonly ChickenPrim[] = chickenPrims(),
  cuts: readonly ChickenPrim[] = chickenCuts(),
): { d: number; part: ChickenPart } {
  let d = Infinity;
  let part: ChickenPart = "body";
  for (const p of prims) {
    const dp = sdPrim(px, py, p);
    if (dp < d) {
      d = dp;
      part = p.part;
    }
  }
  for (const c of cuts) {
    const dc = sdPrim(px, py, c);
    if (-dc > d) d = -dc; // subtraction: max(d, -dCut)
  }
  return { d, part };
}

/** Union signed distance: < 0 inside the roast chicken. */
export function sdChicken(px: number, py: number): number {
  return sdChickenPart(px, py).d;
}

// ---------------------------------------------------------------------------
// colour
// ---------------------------------------------------------------------------

/**
 * Roast gold, top-lit: bright crisp skin up top, deep caramel underneath.
 *
 * THREE VALUES CARRY THE JOKE and they must stay far apart: warm gold bird,
 * bone-white knuckles, COOL-white dish. Once the burst starts to droop the
 * outline goes soft, and colour is the only thing still saying which blob is
 * a leg and which is the plate.
 */
function roastColor(y: number, jitter: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (y + 0.6) / 1.2)); // 0 at the belly, 1 up top
  const r = 1.0;
  const g = 0.38 + 0.46 * t + jitter * 0.05;
  const b = 0.05 + 0.26 * t * t + jitter * 0.04;
  return [r, g, b];
}

function colorFor(part: ChickenPart, x: number, y: number, jitter: number): [number, number, number] {
  switch (part) {
    case "plate":
      // the one COLD value in the effect, so the warm bird pops off it
      return [0.58 + jitter * 0.05, 0.78 + jitter * 0.04, 1.0];
    case "knuckle":
      return [1.0, 0.96 + jitter * 0.03, 0.84 + jitter * 0.06];
    case "shank": {
      // the shank pales toward the bone end — reads as meat sliding off bone
      const c = roastColor(y, jitter);
      const pale = Math.min(1, Math.max(0, (Math.abs(x) - 0.42) / 0.36)) * 0.45;
      return [c[0], c[1] + (1 - c[1]) * pale, c[2] + (1 - c[2]) * pale];
    }
    case "thigh": {
      // meat is lighter than skin: lifts the leg off the breast behind it
      const c = roastColor(y, jitter);
      return [c[0], Math.min(1, c[1] * 1.16 + 0.05), Math.min(1, c[2] * 1.5 + 0.05)];
    }
    default:
      return roastColor(y, jitter);
  }
}

// ---------------------------------------------------------------------------
// sampling
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) — same seed ⇒ byte-identical cloud. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleOptions {
  /** grid pitch for interior points (shape units). Smaller = denser. */
  fillSpacing?: number;
  /** target pitch BETWEEN outline points (shape units) */
  rimSpacing?: number;
  /** half-width of the band that gets projected onto the outline */
  rimBand?: number;
  seed?: number;
  /**
   * Hard ceiling on total points. Overflow is decimated by a deterministic
   * stride, never truncated — chopping the tail of the array would delete
   * whole limbs, and the limbs ARE the joke.
   */
  maxPoints?: number;
}

/** Ships at full quality; mobile/low tiers scale `fillSpacing` up (see shell). */
export const CHICKEN_DEFAULTS: Required<Omit<SampleOptions, "seed">> = {
  fillSpacing: 0.034,
  rimSpacing: 0.024,
  rimBand: 0.020,
  maxPoints: 2400,
};

/** How far a leg's contour is followed into the body. See pass 3. */
const CREASE_DEPTH = 0.115;

function gradient(px: number, py: number, prims: readonly ChickenPrim[], cuts: readonly ChickenPrim[]): [number, number] {
  const h = 1e-3;
  const gx = sdChickenPart(px + h, py, prims, cuts).d - sdChickenPart(px - h, py, prims, cuts).d;
  const gy = sdChickenPart(px, py + h, prims, cuts).d - sdChickenPart(px, py - h, prims, cuts).d;
  const len = Math.hypot(gx, gy) || 1;
  return [gx / len, gy / len];
}

/**
 * Sample the roast chicken into a coloured point cloud.
 *
 * Two passes, because a firework reads as OUTLINE first and mass second:
 *   • FILL — a jittered grid of interior points, giving the bird body.
 *   • RIM  — band points projected down the SDF gradient onto the outline and
 *     then hashed into `rimSpacing` cells, which yields an evenly spaced,
 *     crisp edge. A cloud that is only fill has soft edges and dissolves into
 *     a blob at distance; only-rim reads as a wireframe and loses the plate.
 */
export function sampleChickenSilhouette(opts: SampleOptions = {}): SilhouettePoint[] {
  const o = { ...CHICKEN_DEFAULTS, ...opts };
  const prims = chickenPrims();
  const cuts = chickenCuts();
  const rnd = mulberry32(opts.seed ?? 0x63686b6e);
  const pts: SilhouettePoint[] = [];

  const push = (x: number, y: number, part: ChickenPart, rim: boolean, dim = 1): void => {
    const j = rnd() * 2 - 1;
    const [r, g, b] = colorFor(part, x, y, j);
    // the interior is deliberately DIMMER than the outline: hundreds of
    // overlapping additive fill points otherwise blow the body out to white
    // and swallow the silhouette that the rim is drawing
    const boost = (rim ? 1.35 : 0.85) * dim;
    pts.push({
      x,
      y,
      r: r * boost,
      g: g * boost,
      b: b * boost,
      size: rim ? 0.78 + rnd() * 0.2 : 0.9 + rnd() * 0.45,
      rim,
      part,
      seed: rnd(),
    });
  };

  // --- pass 1: interior fill ------------------------------------------------
  const fs = o.fillSpacing;
  for (let gy = CHICKEN_BOUNDS.minY; gy <= CHICKEN_BOUNDS.maxY; gy += fs) {
    for (let gx = CHICKEN_BOUNDS.minX; gx <= CHICKEN_BOUNDS.maxX; gx += fs) {
      const x = gx + (rnd() - 0.5) * fs * 0.85;
      const y = gy + (rnd() - 0.5) * fs * 0.85;
      const { d, part } = sdChickenPart(x, y, prims, cuts);
      if (d < -o.rimBand * 0.55) push(x, y, part, false);
    }
  }

  // --- pass 2: the silhouette outline --------------------------------------
  const seen = new Set<number>();
  const key = (x: number, y: number): number =>
    Math.round((x - CHICKEN_BOUNDS.minX) / o.rimSpacing) * 65536 +
    Math.round((y - CHICKEN_BOUNDS.minY) / o.rimSpacing);

  /** Walk a band point onto `group`'s zero level set (2 Newton steps). */
  const project = (
    gx: number,
    gy: number,
    group: readonly ChickenPrim[],
    groupCuts: readonly ChickenPrim[],
  ): [number, number] => {
    let x = gx;
    let y = gy;
    for (let i = 0; i < 2; i++) {
      const { d } = sdChickenPart(x, y, group, groupCuts);
      const [nx, ny] = gradient(x, y, group, groupCuts);
      x -= d * nx;
      y -= d * ny;
    }
    return [x, y];
  };

  const probe = o.rimSpacing * 0.6;
  for (let gy = CHICKEN_BOUNDS.minY; gy <= CHICKEN_BOUNDS.maxY; gy += probe) {
    for (let gx = CHICKEN_BOUNDS.minX; gx <= CHICKEN_BOUNDS.maxX; gx += probe) {
      if (Math.abs(sdChickenPart(gx, gy, prims, cuts).d) > o.rimBand) continue;
      const [x, y] = project(gx, gy, prims, cuts);
      const k = key(x, y);
      if (seen.has(k)) continue;
      seen.add(k);
      // colour the outline from just INSIDE it, so an edge point never picks
      // up whatever primitive happens to be nearest on the outside
      const [nx, ny] = gradient(x, y, prims, cuts);
      const inside = sdChickenPart(x - nx * o.rimBand, y - ny * o.rimBand, prims, cuts);
      push(x, y, inside.d < 0 ? inside.part : sdChickenPart(x, y, prims, cuts).part, true);
    }
  }

  // --- pass 3: CREASES — each drumstick's own outline for a short span past
  // the point where the body swallows it. This is the seam between thigh and
  // breast, and it is the difference between "a plump bird with two legs" and
  // "a lumpy blob": the union outline alone cannot express a limb overlapping
  // the mass behind it. Subtractive cuts were tried first and read as
  // decorative strapping.
  //
  // CREASE_DEPTH is the whole trick. Following the leg's contour all the way
  // through the body traces the buried thigh bulge as a complete RING, and two
  // bright rings on a face-shaped mass read as goggles — measurably worse than
  // no crease at all. A crease is a stub, not an outline.
  for (const leg of chickenLegGroups()) {
    for (let gy = CHICKEN_BOUNDS.minY; gy <= CHICKEN_BOUNDS.maxY; gy += probe) {
      for (let gx = CHICKEN_BOUNDS.minX; gx <= CHICKEN_BOUNDS.maxX; gx += probe) {
        if (Math.abs(sdChickenPart(gx, gy, leg, EMPTY).d) > o.rimBand) continue;
        const [x, y] = project(gx, gy, leg, EMPTY);
        const depth = -sdChickenPart(x, y, prims, cuts).d; // how deep inside
        // keep ONLY the shallow buried span — exposed span is already pass 2
        if (depth < o.rimBand * 0.5 || depth > CREASE_DEPTH) continue;
        const k = key(x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        // fade the crease out with depth so it dies away instead of stopping
        const fade = 1 - depth / CREASE_DEPTH;
        push(x, y, sdChickenPart(x, y, leg, EMPTY).part, true, 0.55 + 0.45 * fade);
      }
    }
  }

  return decimate(pts, o.maxPoints);
}

const EMPTY: readonly ChickenPrim[] = [];

/**
 * Even, deterministic thinning to a cap. Stride sampling keeps every part of
 * the bird proportionally represented; slicing would amputate.
 */
export function decimate<T>(pts: T[], max: number): T[] {
  if (pts.length <= max || max <= 0) return pts;
  const out: T[] = [];
  const stride = pts.length / max;
  for (let i = 0; out.length < max; i++) {
    const idx = Math.floor(i * stride);
    if (idx >= pts.length) break;
    out.push(pts[idx]!);
  }
  return out;
}

/** Count of points per part (tests + audition readout). */
export function partHistogram(pts: readonly SilhouettePoint[]): Record<ChickenPart, number> {
  const h: Record<ChickenPart, number> = {
    plate: 0,
    body: 0,
    thigh: 0,
    shank: 0,
    knuckle: 0,
    wing: 0,
    tail: 0,
  };
  for (const p of pts) h[p.part]++;
  return h;
}
