/**
 * fireworkMath — PURE timeline, easing and framing math for the task #93
 * victory fireworks. Babylon-free so the whole shape of the celebration is
 * unit-testable: a firework that plays for the wrong length, droops the wrong
 * way or never fades is a bug you otherwise only find by watching it.
 *
 * TWO TIERS, and they are deliberately NOT the same effect at two sizes:
 *
 *   TIER 1 — round win. A short volley of small peony bursts as punctuation
 *     over the grey screen. It fires several times a match, so it is 1.5 s
 *     end to end, uses the pooled preset toolkit, and never repeats the same
 *     scatter twice (`smallVolley` is seeded by round).
 *   TIER 2 — match win (吃雞). ONE launch, one break, and a full-screen roast
 *     chicken that holds long enough to be read, laughed at, and screenshotted
 *     before it droops out. It happens once, so it takes its time.
 *
 * The tier-2 curve is a real firework's, not a logo reveal's: hard outward
 * rush → a HOLD where the formation is legible and still → gravity droop with
 * the points drifting apart and cooling to ember. Skipping the hold is the
 * classic mistake; without it the shape is only fully formed for a few frames
 * and nobody can tell what it was.
 */

// ---------------------------------------------------------------------------
// tier 2 — the roast chicken
// ---------------------------------------------------------------------------

/**
 * Segment lengths in ms. HOLD_MS is the acceptance criterion in numeric form:
 * it is how long the chicken is fully formed and near-still. At 400 ms the
 * shape flashes past; 1.25 s is long enough to register the joke and take a
 * screenshot, short enough that the settlement screen is not kept waiting.
 */
export const CHICKEN_TIMELINE = {
  launchMs: 620,
  expandMs: 470,
  holdMs: 1250,
  droopMs: 1950,
} as const;

export const CHICKEN_TOTAL_MS =
  CHICKEN_TIMELINE.launchMs +
  CHICKEN_TIMELINE.expandMs +
  CHICKEN_TIMELINE.holdMs +
  CHICKEN_TIMELINE.droopMs;

/** Moment the shell breaks — everything shape-related is relative to this. */
export const CHICKEN_BREAK_MS = CHICKEN_TIMELINE.launchMs;

export type FireworkPhase = "idle" | "launch" | "expand" | "hold" | "droop" | "done";

export interface ChickenBurstState {
  phase: FireworkPhase;
  /** 0..1 along the launch comet's rise (only meaningful in "launch") */
  cometT: number;
  /** 0..1 opacity of the launch comet */
  cometAlpha: number;
  /** silhouette scale multiplier; 0 until the break */
  expand: number;
  /** extra outward push applied on top of `expand` as the burst ages */
  drift: number;
  /** downward offset in shape units (gravity sag) */
  droop: number;
  /** master opacity of the formation */
  alpha: number;
  /** 0..1 white break flash */
  flash: number;
  /** 0..1 colour cool-down toward ember red as it dies */
  cool: number;
  /** true when anything at all should be drawn */
  visible: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Fast-out, hard-decelerating — a shell's burst, not a UI tween. */
export function burstEase(t: number): number {
  const k = clamp01(t);
  return 1 - Math.pow(1 - k, 4);
}

/** Launch rise: fast off the ground, coasting as it runs out of impulse. */
export function launchEase(t: number): number {
  const k = clamp01(t);
  return 1 - Math.pow(1 - k, 2.1);
}

/** How far the formation sags, in shape units, at the end of the droop. */
export const DROOP_MAX = 0.62;
/** How much the cloud spreads apart while it dies (1 = not at all). */
export const DRIFT_MAX = 1.17;

/**
 * The whole tier-2 shot as a function of time since it was fired.
 *
 * Note the expansion OVERSHOOTS by ~4% and settles back: a formation that
 * eases monotonically into place looks like it was tweened, while a real
 * shell's particles fly past their equilibrium and get pulled back by drag.
 */
export function chickenBurstState(tMs: number): ChickenBurstState {
  const T = CHICKEN_TIMELINE;
  const idle: ChickenBurstState = {
    phase: "idle",
    cometT: 0,
    cometAlpha: 0,
    expand: 0,
    drift: 1,
    droop: 0,
    alpha: 0,
    flash: 0,
    cool: 0,
    visible: false,
  };
  if (tMs < 0) return idle;
  if (tMs >= CHICKEN_TOTAL_MS) return { ...idle, phase: "done" };

  // --- launch ---------------------------------------------------------------
  if (tMs < T.launchMs) {
    const k = tMs / T.launchMs;
    return {
      ...idle,
      phase: "launch",
      cometT: launchEase(k),
      // the comet dims as it tops out, so the break is the brightest moment
      cometAlpha: k < 0.12 ? k / 0.12 : 1 - 0.45 * clamp01((k - 0.55) / 0.45),
      visible: true,
    };
  }

  const since = tMs - T.launchMs;
  // the break flash covers the first ~140 ms, hiding the formation's arrival
  const flash = since < 140 ? Math.pow(1 - since / 140, 2) : 0;

  // --- expand ---------------------------------------------------------------
  if (since < T.expandMs) {
    const k = since / T.expandMs;
    const e = burstEase(k);
    return {
      ...idle,
      phase: "expand",
      expand: e * (1 + 0.045 * Math.sin(Math.PI * k)),
      drift: 1,
      alpha: clamp01(since / 90),
      flash,
      visible: true,
    };
  }

  // --- hold: the money window ----------------------------------------------
  const held = since - T.expandMs;
  if (held < T.holdMs) {
    const k = held / T.holdMs;
    return {
      ...idle,
      phase: "hold",
      // a barely-there breath so it is alive without being unreadable
      expand: 1 + 0.012 * Math.sin(k * Math.PI * 2.2),
      drift: 1 + 0.02 * k,
      // starts sagging under its own weight before the fade begins
      droop: 0.06 * k * k,
      alpha: 1,
      flash,
      cool: 0.12 * k,
      visible: true,
    };
  }

  // --- droop + fade ---------------------------------------------------------
  const k = clamp01((held - T.holdMs) / T.droopMs);
  return {
    ...idle,
    phase: "droop",
    expand: 1,
    drift: 1 + (DRIFT_MAX - 1) * k,
    droop: 0.06 + DROOP_MAX * k * k,
    alpha: Math.pow(1 - k, 1.7),
    cool: 0.12 + 0.88 * Math.pow(k, 0.8),
    visible: true,
  };
}

// ---------------------------------------------------------------------------
// tier 1 — the small round-win volley
// ---------------------------------------------------------------------------

/** One small shell in a round-win volley. */
export interface SmallShot {
  /** ms after the volley starts that this shell is launched */
  delayMs: number;
  /** horizontal position in the frame, -1 (left edge) .. 1 (right edge) */
  u: number;
  /** vertical position in the frame, -1 (bottom) .. 1 (top) */
  v: number;
  /** 0..1 index into the celebration palette */
  hue: number;
  /** burst radius multiplier around the base size */
  scale: number;
}

/** Rise time before a small shell breaks. */
export const SMALL_LAUNCH_MS = 210;
/** How long a small burst's particles live. */
export const SMALL_BURST_MS = 620;
/** Shells per round-win volley. */
export const SMALL_SHOT_COUNT = 4;
/** Gap between shells — irregular, so it reads as a volley not a metronome. */
export const SMALL_STAGGER_MS = 165;

/** End-to-end length of a round-win volley. Kept SHORT: it fires every round. */
export const SMALL_VOLLEY_MS =
  (SMALL_SHOT_COUNT - 1) * SMALL_STAGGER_MS + SMALL_LAUNCH_MS + SMALL_BURST_MS;

/** Deterministic PRNG (mulberry32) — same seed ⇒ same volley. */
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

/**
 * Lay out one round-win volley.
 *
 * Seeded by round number so round 2 does not look like round 1 — the task's
 * "must not become tiresome by round four" is a LAYOUT problem as much as a
 * duration one. Shells are spread across horizontal bands so two never stack
 * on top of each other, and they stay in the upper half of the frame, clear of
 * the HUD and of the champions still standing on the floor.
 */
export function smallVolley(seed: number, count = SMALL_SHOT_COUNT): SmallShot[] {
  const rnd = mulberry32((seed >>> 0) * 0x9e3779b1 + 0x5f);
  const shots: SmallShot[] = [];
  for (let i = 0; i < count; i++) {
    // one band per shell, alternating outward from the centre
    const band = (i + 0.5) / count; // 0..1 left→right
    const side = i % 2 === 0 ? -1 : 1;
    shots.push({
      delayMs: Math.round(i * SMALL_STAGGER_MS + rnd() * 55),
      u: (band * 2 - 1) * 0.82 + side * rnd() * 0.1,
      v: 0.16 + rnd() * 0.5,
      hue: rnd(),
      scale: 0.82 + rnd() * 0.42,
    });
  }
  return shots;
}

/** Per-shot state at `tMs` after the volley started. */
export interface SmallShotState {
  phase: "idle" | "launch" | "burst" | "done";
  /** 0..1 along the rise */
  cometT: number;
  /** true exactly on the frame the shell breaks (edge-triggered) */
  breaks: boolean;
}

/**
 * Edge-triggered break test: true only on the frame whose window
 * [tPrevMs, tMs) contains the shell's break. The shell fires ONE pooled burst
 * and the pool owns it from there, so a level-triggered test would re-fire it
 * every frame and blow the pool's LRU.
 */
export function smallShotState(shot: SmallShot, tPrevMs: number, tMs: number): SmallShotState {
  const breakAt = shot.delayMs + SMALL_LAUNCH_MS;
  const end = breakAt + SMALL_BURST_MS;
  const breaks = tPrevMs < breakAt && tMs >= breakAt;
  if (tMs < shot.delayMs) return { phase: "idle", cometT: 0, breaks: false };
  if (tMs < breakAt) {
    return { phase: "launch", cometT: launchEase((tMs - shot.delayMs) / SMALL_LAUNCH_MS), breaks };
  }
  return { phase: tMs < end ? "burst" : "done", cometT: 1, breaks };
}

/** Celebration palette for tier 1 — warm festival colours, no team colours. */
export const SMALL_PALETTE: readonly (readonly [number, number, number])[] = [
  [1.0, 0.82, 0.30], // gold
  [1.0, 0.45, 0.55], // rose
  [0.55, 0.85, 1.0], // ice blue
  [0.72, 1.0, 0.55], // lime
  [1.0, 0.62, 0.20], // amber
  [0.85, 0.62, 1.0], // violet
];

export function smallTint(hue: number): readonly [number, number, number] {
  const i = Math.min(SMALL_PALETTE.length - 1, Math.floor(clamp01(hue) * SMALL_PALETTE.length));
  return SMALL_PALETTE[i]!;
}

// ---------------------------------------------------------------------------
// framing — camera-relative placement (shared by both tiers)
// ---------------------------------------------------------------------------

/**
 * Half-extents of the camera frustum at `distance`, for a vertical-fixed FOV.
 * Both tiers place themselves in CAMERA space rather than in the arena, so the
 * celebration frames identically whatever the match camera is doing — and, for
 * tier 2, so "full screen" means full screen instead of "whatever 30 world
 * units happens to look like from here".
 */
export function frustumHalfExtents(
  fovY: number,
  aspect: number,
  distance: number,
): { halfW: number; halfH: number } {
  const halfH = Math.tan(fovY / 2) * distance;
  return { halfH, halfW: halfH * aspect };
}

/** Camera-space offset of a frame position (u, v ∈ -1..1) at `distance`. */
export function framePoint(
  u: number,
  v: number,
  fovY: number,
  aspect: number,
  distance: number,
): { x: number; y: number } {
  const { halfW, halfH } = frustumHalfExtents(fovY, aspect, distance);
  return { x: u * halfW, y: v * halfH };
}

/**
 * THE #235 FIX, in one number: the WORLD HEIGHT the tier-1 volley bursts at.
 *
 * Camera-space framing alone put the round-win volley `SMALL_REF_DISTANCE`
 * straight down the view axis — and the shipped combat camera's view axis DIVES
 * at 68°, so every shell of every volley landed 9–10.4 world units BELOW an
 * opaque, depth-writing arena floor. On-frame in NDC, alive, 209 particles,
 * zero pixels. Nobody ever saw a round firework.
 *
 * So the shells are anchored to a real height ABOVE THE ARENA instead — a
 * fireworks display happens in the sky, not at a fixed distance from your eye —
 * and the frame coordinates (u, v) now say WHERE ON THAT SKY PLANE, which keeps
 * the "always framed, whatever the camera is doing" property that made
 * camera-space placement attractive in the first place.
 *
 * 5.0 u clears every champion (≈1.7 u), the 2.4 u prop-height cap, and the
 * fire-ring band, and sits under the 9.27 u eye so the plane is actually in
 * front of a downward-looking camera at all.
 */
export const SMALL_SKY_Y = 5.0;

/**
 * The distance the tier-1 look was TUNED at. It is no longer where the shells
 * are placed — it is the reference the placement scales sizes against, so the
 * on-screen size of a peony is exactly what it was when the effect was
 * authored, even though it now sits 5 u from the eye instead of 22.
 */
export const SMALL_REF_DISTANCE = 22;

/** Never place a shell closer than this to the eye (near-plane sanity). */
export const SMALL_MIN_DISTANCE = 2.5;

/**
 * ON-SCREEN SIZE GAIN for the tier-1 volley, over the size it was authored at.
 *
 * Measured, not chosen for taste. Rendered through the REAL combat camera onto
 * the REAL arena floor and diffed against the same frame with the effect off
 * (`scripts/captureRealCamera.mjs`), the volley at its own peak changed **0.42%**
 * of the frame — against **3.83%** for the routine cast telegraph a player is
 * already expected to notice mid-fight. A once-a-round CELEBRATION that is an
 * order of magnitude quieter than a Q press is not a celebration.
 *
 * The reason it is quiet is the same #161 camera change that buried it: the
 * tier-1 look was tuned against a 21° eye-level shot where the floor was a
 * narrow dark band, and at 68° the frame is filled with high-contrast
 * stonework. Gain is applied to sizes, speeds and gravity together, so the
 * burst grows without changing its shape or its timing.
 */
export const SMALL_SCREEN_GAIN = 2.8;

export interface SkyPlacement {
  /** distance from the eye along the view ray through (u, v) */
  distance: number;
  /**
   * Size/speed/gravity multiplier that keeps the burst's ON-SCREEN size equal
   * to what it was at `SMALL_REF_DISTANCE`. A firework placed 4× closer must be
   * 4× smaller, and its gravity 4× weaker, or a peony swallows the screen.
   */
  scale: number;
}

/**
 * Where on the view ray through frame position `v` does the sky plane sit?
 *
 * The camera has no roll in either shipped rig, so `right.y` is 0 and the
 * horizontal frame coordinate cannot change a point's height — only `v` can.
 * That makes this exact rather than iterative:
 *
 *     y(d) = eyeY + d · (fwdY + v · tan(fov/2) · upY)  =  skyY
 *
 * A camera whose ray never reaches the plane (looking away from it, or exactly
 * along it) falls back to the reference distance, which is the pre-#235
 * behaviour — wrong, but no worse than it was, and it never divides by zero.
 */
export function skyPlacement(
  v: number,
  fovY: number,
  eyeY: number,
  fwdY: number,
  upY: number,
  skyY: number = SMALL_SKY_Y,
  refDistance: number = SMALL_REF_DISTANCE,
): SkyPlacement {
  const dirY = fwdY + v * Math.tan(fovY / 2) * upY;
  const need = skyY - eyeY;
  let d = refDistance;
  if (Math.abs(dirY) > 1e-4) {
    const solved = need / dirY;
    if (solved > 0) d = solved;
  }
  d = Math.min(refDistance, Math.max(SMALL_MIN_DISTANCE, d));
  return { distance: d, scale: (d / refDistance) * SMALL_SCREEN_GAIN };
}

/**
 * Scale (shape units → world units) that makes a `shapeW × shapeH` silhouette
 * cover `coverage` of the SHORTER frame axis at `distance`. Fitting to the
 * shorter axis is what keeps the chicken whole on a phone in portrait as well
 * as on an ultrawide — a width-only fit runs the drumsticks off the top.
 */
export function fitScale(
  shapeW: number,
  shapeH: number,
  fovY: number,
  aspect: number,
  distance: number,
  coverage = 0.86,
): number {
  const { halfW, halfH } = frustumHalfExtents(fovY, aspect, distance);
  return Math.min((halfW * 2 * coverage) / shapeW, (halfH * 2 * coverage) / shapeH);
}
