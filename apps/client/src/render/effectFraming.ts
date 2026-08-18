/**
 * effectFraming — THE GATE that decides whether a VISUAL EFFECT is actually on
 * the player's screen, evaluated through the camera the game really ships.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * This project has now shipped the same bug three times: something is built,
 * unit-tested green, declared done — and the player never sees it.
 *
 *   · #93 victory fireworks — the round-win volley is placed `SMALL_DISTANCE`
 *     (22 u) straight down the camera's forward axis. Under the #161 combat
 *     camera (68° pitch, eye 9.27 u up) that axis points into the ground: the
 *     whole volley lives ~8–11 u BELOW an opaque floor. The particles are
 *     alive, on-frame in NDC, and contribute zero pixels.
 *   · #247 leap — an apex authored in WC3 units left the champion above the
 *     top of the frustum for most of the flight.
 *   · The tier-2 chicken only survives because its mesh happens to sit in
 *     `renderingGroupId = 1`, where Babylon clears the depth buffer first.
 *     Luck, not design.
 *
 * `render/leapFraming.ts` (#247) answered "is this ARC framed?" with
 * arithmetic. This module generalises that to "is this EFFECT visible?", and
 * adds the axis #93 was missing: OCCLUSION. Being inside the frustum is not
 * the same as being drawn.
 *
 * Three failure modes, three answers, all mechanical:
 *   1. NEVER DRAWN   — the sample set is empty / behind the near plane.
 *   2. OFF-FRAME     — outside the frustum half-angles (the #247 failure).
 *   3. OCCLUDED      — inside the frustum but behind opaque arena geometry,
 *                      which for a flat arena means "under the floor plane"
 *                      (the #93 failure).
 *
 * ---------------------------------------------------------------------------
 * THE CAMERA MODEL
 * ---------------------------------------------------------------------------
 * Both cameras the game presents through are modelled here from the SHIPPED
 * constants, imported rather than copied:
 *
 *   COMBAT   `CameraRig` — a TargetCamera looking at a ground point (y = 0),
 *            eye `dolly` away along a ray of pitch `CAMERA_PITCH_RAD` (68°).
 *            The worst case for vertical framing is the closest zoom
 *            (`DOLLY_MIN` = 10; ⚠️ GH#361: no longer the default
 *            the player starts at, so that is the default here.
 *   SETTLEMENT `settlementCameraPose` — the match-end hero shot: a LOW camera
 *            (y = 1.15) tilted slightly UP at the champion's chest. Its
 *            forward axis rises, which is why the match-win chicken is visible
 *            and the round-win volley is not: the same camera-space placement
 *            means opposite things under the two cameras.
 *
 * Nothing here is Babylon-aware, so a gate test runs in the node env in
 * milliseconds and a failure prints WHY and BY HOW MUCH.
 */
import { CAMERA_PITCH_RAD, DOLLY_MIN } from "./CameraRig";
import { FLOOR_TOP_Y } from "./ArenaGround";
import { settlementCameraPose } from "./settlementCamera";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Babylon's default vertical field of view (radians). Neither rig ever assigns
 * `camera.fov`, so this IS the shipped value. Same constant `leapFraming` uses;
 * kept as a parameter everywhere so a future rig change is one edit.
 */
export const DEFAULT_FOV_RAD = 0.8;

/**
 * Worst realistic aspect ratio — the narrowest layout the client supports.
 * Narrower viewport ⇒ tighter horizontal half-angle, so 4:3 is the gate's
 * horizontal worst case. (Vertical framing does not depend on aspect.)
 */
export const MIN_ASPECT = 4 / 3;

/**
 * Fraction of each half-angle reserved as safety, matching `leapFraming`: the
 * HUD bites into the bottom of the viewport and a shake impulse swings the eye,
 * so "exactly on the edge" reads as "clipped" in play.
 */
export const VERTICAL_MARGIN = 0.12;
export const HORIZONTAL_MARGIN = 0.05;

/**
 * The arena floor is an opaque, depth-writing disc of this radius (every
 * shipped arena zone uses `boundaryRadius: 24`) sitting at `FLOOR_TOP_Y`.
 * Anything below it, inside it, seen from above, is not drawn — this is the
 * single fact #93's round firework fell through.
 */
export const ARENA_FLOOR_RADIUS = 24;

/** A camera reduced to an eye and an orthonormal basis. */
export interface FramingPose {
  eye: Vec3;
  /** unit view direction */
  fwd: Vec3;
  /** unit screen-right */
  right: Vec3;
  /** unit screen-up */
  up: Vec3;
}

export interface CombatPoseOptions {
  /** camera distance to its ground target; default DOLLY_MIN (worst case) */
  dolly?: number;
  /** pitch from horizontal; default the shipped CAMERA_PITCH_RAD */
  pitchRad?: number;
  /** rig yaw; the rig never rotates in play, so default 0 */
  yawRad?: number;
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * The COMBAT camera as it is actually configured: looking at `target` on the
 * ground plane from `dolly` away at `pitchRad` above it.
 *
 * This mirrors `CameraRig.apply()`: eye = target + (back·cos, up·sin) rotated
 * by yaw, and the camera looks at the ground target, so `fwd` DIVES at the
 * pitch angle. That dive is the whole story of the #93 bug.
 */
export function combatCameraPose(target: Vec2, opts: CombatPoseOptions = {}): FramingPose {
  const dolly = opts.dolly ?? DOLLY_MIN;
  const pitch = opts.pitchRad ?? CAMERA_PITCH_RAD;
  const yaw = opts.yawRad ?? 0;
  const back = dolly * Math.cos(pitch);
  const eye: Vec3 = {
    x: target.x - Math.sin(yaw) * back,
    y: dolly * Math.sin(pitch),
    z: target.z - Math.cos(yaw) * back,
  };
  return poseLookingAt(eye, { x: target.x, y: 0, z: target.z });
}

/**
 * The SETTLEMENT hero-shot camera at `elapsedMs` after the freeze, built from
 * the shipped `settlementCameraPose` so the gate can never drift from the
 * cinematic the player actually watches the 吃雞 chicken through.
 */
export function settlementFramingPose(
  pos: Vec2,
  facing: Vec2 | null,
  elapsedMs: number,
): FramingPose {
  const p = settlementCameraPose(pos, facing, elapsedMs);
  return poseLookingAt(p.position, p.target);
}

/** Orthonormal basis for a camera at `eye` looking at `target` (no roll). */
export function poseLookingAt(eye: Vec3, target: Vec3): FramingPose {
  const fwd = norm({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
  // world up, unless the view is vertical (never is for either shipped rig)
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  const right = norm(cross(worldUp, fwd));
  const up = cross(fwd, right);
  return { eye, fwd, right, up };
}

export interface FramingOptions {
  fovRad?: number;
  aspect?: number;
  /** Y of the opaque floor plane; default the shipped FLOOR_TOP_Y. */
  floorY?: number;
  /** Radius of that opaque floor around `floorCenter`; 0 disables occlusion. */
  floorRadius?: number;
  floorCenter?: Vec2;
  /** Near plane — CameraRig ships minZ = 0.5. */
  minZ?: number;
  /** Set false to measure raw frustum occupancy with no safety margin. */
  useMargins?: boolean;
}

/** Where one world point lands, and whether anything of it reaches the screen. */
export interface PointFraming {
  /** distance along the view axis; ≤ minZ means behind the camera */
  depth: number;
  /** |vertical angle| / vertical half-angle (1 = exactly on the frame edge) */
  vRatio: number;
  /** |horizontal angle| / horizontal half-angle */
  hRatio: number;
  /** inside the frustum (with margins, unless disabled) */
  onFrame: boolean;
  /** below the opaque floor plane and inside its disc ⇒ never drawn */
  occluded: boolean;
  /** onFrame && !occluded && in front of the near plane */
  visible: boolean;
}

export function frameOccupancy(p: Vec3, pose: FramingPose, opts: FramingOptions = {}): PointFraming {
  const fov = opts.fovRad ?? DEFAULT_FOV_RAD;
  const aspect = opts.aspect ?? MIN_ASPECT;
  const minZ = opts.minZ ?? 0.5;
  const useMargins = opts.useMargins !== false;
  const floorY = opts.floorY ?? FLOOR_TOP_Y;
  const floorRadius = opts.floorRadius ?? ARENA_FLOOR_RADIUS;
  const floorCenter = opts.floorCenter ?? { x: 0, z: 0 };

  const tanV = Math.tan(fov / 2) * (useMargins ? 1 - VERTICAL_MARGIN : 1);
  const tanH = Math.tan(fov / 2) * aspect * (useMargins ? 1 - HORIZONTAL_MARGIN : 1);

  const v: Vec3 = { x: p.x - pose.eye.x, y: p.y - pose.eye.y, z: p.z - pose.eye.z };
  const depth = v.x * pose.fwd.x + v.y * pose.fwd.y + v.z * pose.fwd.z;
  const vy = v.x * pose.up.x + v.y * pose.up.y + v.z * pose.up.z;
  const vx = v.x * pose.right.x + v.y * pose.right.y + v.z * pose.right.z;

  const vRatio = depth > minZ ? Math.abs(vy / depth) / tanV : Infinity;
  const hRatio = depth > minZ ? Math.abs(vx / depth) / tanH : Infinity;
  const onFrame = depth > minZ && vRatio <= 1 && hRatio <= 1;

  // Occlusion by the arena floor. The eye is always above the floor in both
  // shipped rigs, so a sample below the floor plane and inside the floor disc
  // is hidden by it — no ray march needed, and being generous here would only
  // let the #93 class of bug back through.
  const underFloor = p.y < floorY;
  const dx = p.x - floorCenter.x;
  const dz = p.z - floorCenter.z;
  const insideDisc = floorRadius > 0 && Math.hypot(dx, dz) <= floorRadius;
  const occluded = underFloor && insideDisc && pose.eye.y > floorY;

  return { depth, vRatio, hRatio, onFrame, occluded, visible: onFrame && !occluded };
}

/** A named sample of an effect — the label is what a failing test prints. */
export interface EffectSample extends Vec3 {
  label?: string;
}

export interface VisibilityReport {
  /** the gate: every sample must reach the screen (see `require`) */
  ok: boolean;
  sampled: number;
  /** fraction of samples inside the frustum */
  onFrameFraction: number;
  /** fraction of samples hidden behind the floor */
  occludedFraction: number;
  /** fraction of samples that actually reach the screen */
  visibleFraction: number;
  worstVertical: number;
  worstHorizontal: number;
  /** human-readable, printed by a failing gate */
  reason?: string;
}

export interface VisibilityRequirement extends FramingOptions {
  /**
   * Minimum fraction of samples that must reach the screen. Default 1: an
   * effect whose job is to be SEEN gets no partial credit. A telegraph whose
   * top is allowed to run off the frame passes a lower bar deliberately, with
   * the number written at the call site.
   */
  minVisibleFraction?: number;
}

/**
 * Does this effect reach the player's screen through `pose`?
 *
 * `samples` must be the points the effect actually draws at — the READ of this
 * function is only as good as that set, which is why the callers derive their
 * samples from the shipped placement math rather than re-deriving positions.
 */
export function checkVisibility(
  samples: readonly EffectSample[],
  pose: FramingPose,
  req: VisibilityRequirement = {},
): VisibilityReport {
  const minVisible = req.minVisibleFraction ?? 1;
  if (samples.length === 0) {
    return {
      ok: false,
      sampled: 0,
      onFrameFraction: 0,
      occludedFraction: 0,
      visibleFraction: 0,
      worstVertical: Infinity,
      worstHorizontal: Infinity,
      reason: "the effect drew NOTHING — no samples to frame",
    };
  }

  let onFrame = 0;
  let occluded = 0;
  let visible = 0;
  let worstV = 0;
  let worstH = 0;
  let firstOff: string | undefined;
  let firstOccluded: string | undefined;

  for (const s of samples) {
    const f = frameOccupancy(s, pose, req);
    if (f.onFrame) onFrame++;
    if (f.occluded) occluded++;
    if (f.visible) visible++;
    if (Number.isFinite(f.vRatio) && f.vRatio > worstV) worstV = f.vRatio;
    if (Number.isFinite(f.hRatio) && f.hRatio > worstH) worstH = f.hRatio;
    const name = s.label ?? `(${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`;
    if (!f.onFrame && !firstOff) {
      firstOff =
        f.depth <= (req.minZ ?? 0.5)
          ? `${name} is BEHIND the camera (depth ${f.depth.toFixed(2)})`
          : `${name} is OFF-FRAME (${(Math.max(f.vRatio, f.hRatio) * 100).toFixed(0)}% of the safe half-angle)`;
    }
    if (f.occluded && !firstOccluded) {
      firstOccluded = `${name} is OCCLUDED — y=${s.y.toFixed(2)} is under the arena floor`;
    }
  }

  const n = samples.length;
  const visibleFraction = visible / n;
  const ok = visibleFraction >= minVisible - 1e-9;
  const reason = ok
    ? undefined
    : occluded > 0
      ? `${((occluded / n) * 100).toFixed(0)}% of the effect is behind the arena floor — ${firstOccluded}`
      : (firstOff ?? "the effect does not reach the screen");

  return {
    ok,
    sampled: n,
    onFrameFraction: onFrame / n,
    occludedFraction: occluded / n,
    visibleFraction,
    worstVertical: worstV,
    worstHorizontal: worstH,
    ...(reason ? { reason } : {}),
  };
}

/**
 * THE VERTICAL BUDGET. How high above `groundXZ` a point can be and still be
 * inside the frame through `pose`.
 *
 * This is the number a "beam to the sky" telegraph has to be designed against:
 * under the shipped combat camera it is ~6 u directly above the followed
 * champion and SHRINKS fast as the caster moves toward the top of the screen,
 * because the whole frustum is tilted. Anything taller is announcing itself
 * off-screen. Returns 0 when the ground point is not framed at all.
 */
export function verticalHeadroom(
  pose: FramingPose,
  groundXZ: Vec2,
  opts: FramingOptions = {},
): number {
  const lo = 0;
  const hi = 200;
  const at = (h: number): boolean =>
    frameOccupancy({ x: groundXZ.x, y: h, z: groundXZ.z }, pose, opts).onFrame;
  if (!at(lo)) return 0;
  if (at(hi)) return hi;
  // monotone in h for any downward-looking camera: bisect
  let a = lo;
  let b = hi;
  for (let i = 0; i < 48; i++) {
    const m = (a + b) / 2;
    if (at(m)) a = m;
    else b = m;
  }
  return a;
}

/**
 * Sample a vertical segment from `(x, y0, z)` to `(x, y1, z)` — the shape a
 * cast-telegraph beam draws, and the shape #247 proved leaves frame fastest.
 */
export function sampleVerticalSegment(
  groundXZ: Vec2,
  y0: number,
  y1: number,
  count = 17,
  label = "beam",
): EffectSample[] {
  const out: EffectSample[] = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({
      x: groundXZ.x,
      y: y0 + (y1 - y0) * t,
      z: groundXZ.z,
      label: `${label}@y=${(y0 + (y1 - y0) * t).toFixed(2)}`,
    });
  }
  return out;
}

/**
 * The ground-plane rectangle the camera can actually see, as a set of sample
 * points. Used to ask "does the effect still work for a caster at the EDGE of
 * the screen", which is where every framing assumption quietly dies.
 */
export function visibleGroundSamples(
  pose: FramingPose,
  opts: FramingOptions & { steps?: number } = {},
): EffectSample[] {
  const steps = opts.steps ?? 9;
  const out: EffectSample[] = [];
  // march the ground plane around the camera's target and keep what is framed
  const t = groundTargetOf(pose);
  const span = 24;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = t.x + (i / (steps - 1) - 0.5) * 2 * span;
      const z = t.z + (j / (steps - 1) - 0.5) * 2 * span;
      const f = frameOccupancy({ x, y: 0, z }, pose, opts);
      if (f.onFrame) out.push({ x, y: 0, z, label: `ground(${x.toFixed(1)}, ${z.toFixed(1)})` });
    }
  }
  return out;
}

/** Where this pose's view axis meets the ground plane (y = 0). */
export function groundTargetOf(pose: FramingPose): Vec2 {
  const t = pose.fwd.y !== 0 ? -pose.eye.y / pose.fwd.y : 0;
  return { x: pose.eye.x + pose.fwd.x * t, z: pose.eye.z + pose.fwd.z * t };
}
