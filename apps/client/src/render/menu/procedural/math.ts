/**
 * Pure animation math for the login menu scene. No Babylon, no DOM — plain
 * numbers so vitest can pin the drift/bob/pulse curves without a GPU. Unlike
 * the deterministic sim (where trig is banned), this is client *presentation*
 * only, so `Math.sin/cos` are fair game here.
 *
 * Every function is a total, side-effect-free function of `t` (seconds elapsed)
 * and a config, EXCEPT the `*Into` variants which write into a caller-owned
 * output object so the per-frame render loop stays allocation-free.
 */

// ---------------------------------------------------------------------------
// camera drift — a slow continuous orbit + a gentle multi-axis bob
// ---------------------------------------------------------------------------

export interface CameraDriftConfig {
  /** starting orbital angle (radians) */
  baseAlpha: number;
  /** starting pitch (radians; ArcRotateCamera beta) */
  baseBeta: number;
  /** starting distance to target */
  baseRadius: number;
  /** target height the camera looks at */
  baseTargetY: number;
  /** continuous orbit rate (radians/sec) — the "always alive" drift */
  orbitSpeed: number;
  /** small alpha sway on top of the orbit */
  alphaAmp: number;
  alphaSpeed: number;
  /** pitch bob */
  betaAmp: number;
  betaSpeed: number;
  /** dolly bob */
  radiusAmp: number;
  radiusSpeed: number;
  /** look-at height bob */
  targetYAmp: number;
  targetYSpeed: number;
  /**
   * Optional slow "majestic reveal": the camera starts pulled back by
   * `revealRadius` and eases in exponentially with time-constant `revealTau`
   * (seconds). Both default to 0 (no reveal) so callers/tests that omit them
   * keep the pure base-pose-at-t=0 behaviour.
   */
  revealRadius?: number;
  revealTau?: number;
}

export interface CameraPose {
  alpha: number;
  beta: number;
  radius: number;
  targetY: number;
}

/** Write the drift pose for time `t` into `out` (allocation-free hot path). */
export function writeCameraDrift(out: CameraPose, t: number, c: CameraDriftConfig): CameraPose {
  const reveal = (c.revealRadius ?? 0) * Math.exp(-t / (c.revealTau ?? 1));
  out.alpha = c.baseAlpha + t * c.orbitSpeed + Math.sin(t * c.alphaSpeed) * c.alphaAmp;
  out.beta = c.baseBeta + Math.sin(t * c.betaSpeed) * c.betaAmp;
  out.radius = c.baseRadius + Math.sin(t * c.radiusSpeed) * c.radiusAmp + reveal;
  out.targetY = c.baseTargetY + Math.sin(t * c.targetYSpeed) * c.targetYAmp;
  return out;
}

/** Allocating convenience wrapper (tests / one-off callers). */
export function cameraDrift(t: number, c: CameraDriftConfig): CameraPose {
  return writeCameraDrift({ alpha: 0, beta: 0, radius: 0, targetY: 0 }, t, c);
}

// ---------------------------------------------------------------------------
// floating-island layout + bob
// ---------------------------------------------------------------------------

export interface IslandSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  /** phase offset so islands bob out of sync */
  bobPhase: number;
  bobAmp: number;
  bobSpeed: number;
  /** starting yaw + slow spin rate (rad/sec), signed so some spin each way */
  spinPhase: number;
  spinSpeed: number;
}

/**
 * Deterministically scatter `count` islands around a ring at varying radius,
 * height and phase. No RNG: a cheap integer hash of the index gives each
 * island a distinct-but-stable pose, so the layout is identical every boot and
 * trivially unit-testable.
 */
export function islandLayout(count: number): IslandSpec[] {
  const out: IslandSpec[] = [];
  for (let i = 0; i < count; i++) {
    // golden-angle spread keeps neighbours far apart around the ring
    const ang = i * 2.399963229728653 + 0.6;
    const h = hash01(i * 7 + 1);
    const h2 = hash01(i * 13 + 5);
    const radius = 16 + h * 12; // 16..28 out from centre
    out.push({
      x: Math.cos(ang) * radius,
      y: -2 + h2 * 9, // staggered heights, spread around eye level
      z: Math.sin(ang) * radius,
      scale: 0.7 + h * 0.8, // 0.7..1.5
      bobPhase: ang,
      bobAmp: 0.5 + h2 * 0.7,
      bobSpeed: 0.25 + h * 0.35,
      spinPhase: ang * 0.5,
      spinSpeed: (h2 < 0.5 ? -1 : 1) * (0.04 + h * 0.06),
    });
  }
  return out;
}

export interface IslandPose {
  y: number;
  rotationY: number;
}

/** Vertical bob + slow yaw for an island at time `t`. */
export function islandBob(t: number, s: IslandSpec): IslandPose {
  return {
    y: s.y + Math.sin(t * s.bobSpeed + s.bobPhase) * s.bobAmp,
    rotationY: s.spinPhase + t * s.spinSpeed,
  };
}

// ---------------------------------------------------------------------------
// cloud drift (horizontal scroll with wrap-around)
// ---------------------------------------------------------------------------

/**
 * Advance `x` by `dxPerSec * dt`, wrapping back into `[min, max]` so a cloud
 * that drifts off one side re-enters the other. Handles multi-span jumps
 * (large dt / hidden-tab catch-up) without an unbounded loop.
 */
export function wrapDrift(x: number, dxPerSec: number, dt: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return x;
  let nx = x + dxPerSec * dt;
  // fold back into range (works for arbitrarily large deltas)
  nx = min + (((nx - min) % span) + span) % span;
  return nx;
}

// ---------------------------------------------------------------------------
// glow / bloom pulse (constant animation, optionally audio-reactive)
// ---------------------------------------------------------------------------

export interface GlowPulseConfig {
  /** baseline value */
  base: number;
  /** amplitude of the constant sine breathing */
  amp: number;
  /** breathing rate (rad/sec) */
  speed: number;
  /** extra push contributed by the (optional) audio level at full loudness */
  audioBoost: number;
}

/**
 * A gentle breathing value for the magic circle's emissive / bloom weight. The
 * constant sine keeps it alive with no audio; when an analyser level (0..1) is
 * available it adds a musical push on top. Result is bounded to
 * `[base, base + amp + audioBoost]`.
 */
export function glowPulse(t: number, c: GlowPulseConfig, audioLevel = 0): number {
  const sine = 0.5 + 0.5 * Math.sin(t * c.speed);
  const lvl = clamp01(audioLevel);
  return c.base + c.amp * sine + c.audioBoost * lvl;
}

/** Mean of a byte frequency/time-domain buffer, normalised to 0..1. */
export function analyserLevel(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  return clamp01(sum / (data.length * 255));
}

// ---------------------------------------------------------------------------
// boss-battle FX schedulers — pure, deterministic, staggered.
//
// Every spawner runs on its own periodic clock offset per-index so that the
// dragon breath, the kamehameha beams, the explosions and the combat flashes
// never all fire on the same frame (the "something is always happening, but not
// everything at once" rule). These are total functions of (t, index/offset,
// config); the `write*` variants fill a caller-owned struct so the render loop
// stays allocation-free.
// ---------------------------------------------------------------------------

/**
 * Local time within a periodic cycle: `((t + offset) mod period)` folded into
 * `[0, period)`. `offset` staggers one emitter's clock against its siblings.
 */
export function cycleTime(t: number, period: number, offset = 0): number {
  if (period <= 0) return 0;
  const x = (t + offset) % period;
  return x < 0 ? x + period : x;
}

/**
 * A stable per-index clock offset that spreads `count` emitters across a
 * `period`: an even slot plus a deterministic sub-slot jitter, so no two share
 * a phase and they don't all peak together. Pure (index-hashed, no RNG).
 */
export function staggerOffset(index: number, count: number, period: number): number {
  if (count <= 0 || period <= 0) return 0;
  const even = ((index % count) + count) % count / count; // 0..1 evenly spaced
  const jitter = hash01(index * 2 + 1) * (period / count) * 0.5; // sub-slot wobble
  return even * period + jitter;
}

/**
 * Radius of an expanding shockwave / blast front at normalised progress
 * `p∈[0,1]`, eased so it snaps out fast then decelerates. `0 → 0`, `1 → maxRadius`.
 */
export function shockwaveRadius(progress01: number, maxRadius: number): number {
  const p = clamp01(progress01);
  return maxRadius * (1 - (1 - p) * (1 - p)); // ease-out quad
}

// --- kamehameha beam / shockwave pillar ------------------------------------

export interface BeamPhaseConfig {
  /** full charge→fire→cooldown cycle length (s) */
  period: number;
  /** charge-glow ramp duration (s) */
  charge: number;
  /** beam-visible duration (s) */
  fire: number;
  /** shockwave-ring expand duration from muzzle, from fire start (s) */
  shockwave: number;
  /** shockwave-ring outer radius at full expand */
  maxRadius: number;
}

export interface BeamState {
  charging: boolean;
  firing: boolean;
  /** 0..1 charge orb intensity (ramps up during charge) */
  chargeK: number;
  /** 0..1 beam brightness (fast attack, hold, fast release) */
  beamK: number;
  /** 0..1 shockwave ring alpha (fades as it expands) */
  shockK: number;
  /** current shockwave outer radius */
  shockRadius: number;
}

/** Write the beam phase for `t` (staggered by `offset`) into `out`. */
export function writeBeamState(out: BeamState, t: number, offset: number, c: BeamPhaseConfig): BeamState {
  const lt = cycleTime(t, c.period, offset);
  out.charging = false;
  out.firing = false;
  out.chargeK = 0;
  out.beamK = 0;
  out.shockK = 0;
  out.shockRadius = 0;
  if (lt < c.charge) {
    out.charging = true;
    out.chargeK = c.charge > 0 ? lt / c.charge : 1; // ramp 0→1 over the charge
  } else if (lt < c.charge + c.fire) {
    out.firing = true;
    const f = c.fire > 0 ? (lt - c.charge) / c.fire : 1; // 0..1 across the fire
    out.beamK = f < 0.15 ? f / 0.15 : f > 0.8 ? clamp01((1 - f) / 0.2) : 1;
    const st = lt - c.charge; // seconds into the fire
    if (c.shockwave > 0 && st < c.shockwave) {
      const p = st / c.shockwave;
      out.shockRadius = shockwaveRadius(p, c.maxRadius);
      out.shockK = 1 - p; // bright at the muzzle, fades as the ring grows
    }
  }
  return out;
}

// --- explosions (loose per-index timer) ------------------------------------

export interface ExplosionPhaseConfig {
  /** nominal seconds between blasts at one site (jittered per index) */
  period: number;
  /** visible expand+fade duration of one blast (s) */
  duration: number;
  /** blast core / debris outer radius */
  maxRadius: number;
}

export interface ExplosionState {
  active: boolean;
  /** 0..1 progress through the blast */
  k: number;
  /** expanding core radius */
  radius: number;
  /** 0..1 bright core alpha (holds then fades) */
  coreAlpha: number;
  /** 0..1 lingering smoke alpha (rises after the flash, fades late) */
  smokeAlpha: number;
  /** 0..1 bloom-spike flash (peaks in the first instant) */
  flash: number;
}

/** Write the explosion phase for site `index` at `t` into `out`. */
export function writeExplosionState(out: ExplosionState, t: number, index: number, c: ExplosionPhaseConfig): ExplosionState {
  // jittered period + offset per index → sites never sync up
  const jitterP = c.period * (0.6 + hash01(index * 5 + 3) * 0.8); // 0.6..1.4× period
  const offset = hash01(index * 9 + 7) * jitterP;
  const lt = cycleTime(t, jitterP, offset);
  out.active = false;
  out.k = 0;
  out.radius = 0;
  out.coreAlpha = 0;
  out.smokeAlpha = 0;
  out.flash = 0;
  if (c.duration > 0 && lt < c.duration) {
    const p = lt / c.duration;
    out.active = true;
    out.k = p;
    out.radius = shockwaveRadius(p, c.maxRadius);
    out.coreAlpha = p < 0.5 ? 1 : clamp01(1 - (p - 0.5) / 0.5);
    out.flash = p < 0.12 ? p / 0.12 : clamp01(1 - (p - 0.12) / 0.35);
    out.smokeAlpha = clamp01(0.5 * (1 - p)) * (p < 0.2 ? p / 0.2 : 1);
  }
  return out;
}

// --- combat flashes (quick clash pops between unseen fighters) --------------

export interface FlashPhaseConfig {
  /** nominal seconds between pops at one clash point (jittered per index) */
  period: number;
  /** visible duration of one pop (s) — short */
  duration: number;
}

export interface FlashState {
  active: boolean;
  /** 0..1 progress */
  k: number;
  /** 0..1 sprite alpha (quick in, fade out) */
  alpha: number;
  /** pop scale multiplier */
  scale: number;
}

/** Write the clash-flash phase for point `index` at `t` into `out`. */
export function writeFlashState(out: FlashState, t: number, index: number, c: FlashPhaseConfig): FlashState {
  const jitterP = c.period * (0.5 + hash01(index * 11 + 2) * 1.0); // 0.5..1.5× period
  const offset = hash01(index * 17 + 13) * jitterP;
  const lt = cycleTime(t, jitterP, offset);
  out.active = false;
  out.k = 0;
  out.alpha = 0;
  out.scale = 0;
  if (c.duration > 0 && lt < c.duration) {
    const p = lt / c.duration;
    out.active = true;
    out.k = p;
    out.alpha = p < 0.25 ? p / 0.25 : clamp01(1 - (p - 0.25) / 0.75);
    out.scale = 0.4 + p * 0.9; // small pop that grows as it fades
  }
  return out;
}

// --- fire dragon flight path (layered sine, allocation-free) ----------------

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface DragonPathConfig {
  centerX: number;
  centerY: number;
  centerZ: number;
  /** horizontal loop radii (X/Z) — the dragon weaves an ellipse */
  radiusX: number;
  radiusZ: number;
  /** vertical weave amplitude */
  height: number;
  /** main loop rate (rad/sec) */
  loopSpeed: number;
  /** secondary vertical weave rate (rad/sec) */
  weaveSpeed: number;
  /** per-dragon phase offset (staggers 1–2 dragons apart) */
  phase: number;
}

/**
 * Sample the dragon's smooth serpentine flight position at time `t` into `out`.
 * Layered sines give an organic weaving loop that stays bounded within
 * `radius*1.2` / `height*1.3` of the centre — deterministic and testable.
 */
export function writeDragonPoint(out: Vec3Like, t: number, c: DragonPathConfig): Vec3Like {
  const a = t * c.loopSpeed + c.phase;
  out.x = c.centerX + Math.cos(a) * c.radiusX + Math.sin(a * 1.7) * c.radiusX * 0.15;
  out.z = c.centerZ + Math.sin(a) * c.radiusZ + Math.cos(a * 1.3) * c.radiusZ * 0.15;
  out.y = c.centerY + Math.sin(t * c.weaveSpeed + c.phase) * c.height + Math.sin(a * 2.3) * c.height * 0.3;
  return out;
}

// ---------------------------------------------------------------------------
// dragon roar — near/far volume + stereo pan (login-immersion, task #20)
//
// The two login dragons roar on their own staggered breath clocks; the SCENE
// turns each roar into a panned, distance-attenuated SFX. The volume/pan MATH
// is pure + testable here; the Babylon projection (world→screen) that feeds
// `panFromScreenX` lives in LoginScene (it needs the live camera/viewport).
// ---------------------------------------------------------------------------

export interface RoarVolumeConfig {
  /** at/under this camera distance the roar plays at `nearVolume` (loudest) */
  nearDist: number;
  /** at/over this camera distance the roar plays at `farVolume` (quietest) */
  farDist: number;
  /** volume multiplier for a NEAR (close/big) dragon */
  nearVolume: number;
  /** volume multiplier for a FAR (distant) dragon */
  farVolume: number;
}

/**
 * Roar loudness for a dragon at `distance` from the camera: a linear ramp from
 * `nearVolume` (close) down to `farVolume` (far), clamped outside the band so a
 * dragon right on top of / far beyond the camera never over/under-shoots. A
 * degenerate band (farDist ≤ nearDist) collapses to `nearVolume`.
 */
export function roarVolume(distance: number, c: RoarVolumeConfig): number {
  if (!(c.farDist > c.nearDist)) return c.nearVolume;
  const p = clamp01((distance - c.nearDist) / (c.farDist - c.nearDist));
  return c.nearVolume + (c.farVolume - c.nearVolume) * p;
}

/**
 * Stereo pan (-1 left … 0 centre … +1 right) from a projected screen-x pixel in
 * a viewport `width` wide. Non-finite input / a zero-width viewport → centred
 * (0), so a pre-first-render projection can never emit NaN into the mixer.
 */
export function panFromScreenX(screenX: number, width: number): number {
  if (!Number.isFinite(screenX) || !(width > 0)) return 0;
  const ndc = (screenX / width) * 2 - 1;
  return ndc < -1 ? -1 : ndc > 1 ? 1 : ndc;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Deterministic hash of an integer into [0,1). Pure, no state. */
function hash01(n: number): number {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x ^= x >>> 15;
  return (x >>> 0) / 0x100000000;
}
