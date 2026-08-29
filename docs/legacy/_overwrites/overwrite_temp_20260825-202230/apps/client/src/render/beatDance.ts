/**
 * render/beatDance — the procedural shuffle 喪標麥可 dances while 「四拍令咒」
 * is building, and the GATE that proves you can actually see it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS PROCEDURAL
 * ---------------------------------------------------------------------------
 * His model is `assets/models/props/guardian_skeleton.glb` (a KayKit skeleton,
 * also the arena guardian). Its clips are Idle / Idle_Combat / Walking_D /
 * Spellcast_* / Hit_A / Hit_B / Taunt / Death_C / Skeletons_Awaken. There is no
 * dance in there and none may be added, so the dance is generated — the same
 * answer the project already gives elsewhere (`packages/shared/src/voxel/boxman.ts`'s
 * hand-authored joint hierarchy, the procedural login scene, the voxel figure).
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS DRIVEN FROM THE VIEW ROOT AND NOT FROM BONES
 * ---------------------------------------------------------------------------
 * Two hard reasons, in order of weight:
 *
 *  1. AN ANIMATION GROUP WOULD WIN. Babylon evaluates its animatables inside
 *     `scene.render()`, i.e. AFTER the client's frame callback has run. Any bone
 *     pose written from the frame loop is overwritten by whatever clip
 *     `ClipAnimator` is currently playing, every frame, silently. A bone-level
 *     dance would therefore be a feature that ships and is never seen — which is
 *     precisely the failure this file's second half exists to prevent. The view
 *     ROOT is not touched by any animation group, so a root pose survives.
 *  2. TERRITORY. `ChampionView`'s limb nodes and GLB skeletons are private, and
 *     `render/**` belongs to another workstream this cycle. The root is public
 *     (`EntityViewRegistry.getChampionView(id).root`), so nothing here needs to
 *     reach into somebody else's file.
 *
 * A root pose is not a poor substitute. At a 68°-pitch camera the moves that
 * READ are the whole-body ones — the glide, the lean, the swivel, the spin —
 * and every one of those is a rigid-body transform. See THE MEASUREMENT below:
 * ground-plane travel projects onto the screen with a factor of ~1.0, while
 * VERTICAL travel projects with cos(68°) ≈ 0.37. A bob is the least visible
 * thing you can do at this camera; a slide is the most visible.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT (method borrowed from #247's render/leapFraming.ts)
 * ---------------------------------------------------------------------------
 * This project has shipped three features nobody could see. So "is the dance
 * visible" is answered here with arithmetic, through the REAL combat rig
 * (`CAMERA_PITCH_RAD` = 68°, `DOLLY_MIN` = 10 — the CLOSEST zoom and the
 * worst case; ⚠️ GH#361 moved the shipped DEFAULT out to the far clamp, Babylon's
 * default fov 0.8), and `beatDance.test.ts` runs it as a gate:
 *
 *   • every tracked body point stays inside the safe frustum, AND
 *   • the peak-to-peak SCREEN travel of the body clears MIN_SCREEN_TRAVEL,
 *     expressed as a fraction of viewport height so it is resolution-free.
 *
 * The body is sampled at real joints rather than at the root, because the root
 * is a point and a dance is a silhouette. The joint proportions mirror
 * `packages/shared/src/voxel/boxman.ts` (PX = 1.8/32; hips at 12px, head at 24px, hands at
 * ±6px, feet at ±2px), normalised to fractions of body height so any champion
 * scale can be measured.
 */
import { CAMERA_PITCH_RAD, DOLLY_MIN } from "./CameraRig";

// ---------------------------------------------------------------------------
// camera model (the shipped combat rig)
// ---------------------------------------------------------------------------

/** Babylon's default vertical fov. The rig never assigns `camera.fov`. */
export const DEFAULT_FOV_RAD = 0.8;
/** Narrowest layout the client supports; the tighter horizontal half-angle. */
export const MIN_ASPECT = 4 / 3;
/** Safety bites out of each half-angle: the HUD's bar at the bottom, shake elsewhere. */
export const VERTICAL_MARGIN = 0.12;
export const HORIZONTAL_MARGIN = 0.05;

/**
 * How much on-screen travel makes a dance a dance, as a fraction of VIEWPORT
 * HEIGHT (peak to peak). 0.05 is ~54 px on a 1080p window; at the shipped
 * default zoom the whole champion is only about 10% of viewport height, so this
 * threshold is roughly HALF his own height of travel — a motion you cannot
 * miss, not one you would have to be told about. Below it the gate fails, which
 * is the whole point of having it. `beatDance.test.ts` pins both numbers.
 */
export const MIN_SCREEN_TRAVEL = 0.05;

// ---------------------------------------------------------------------------
// the body
// ---------------------------------------------------------------------------

export interface DanceJoint {
  name: string;
  /** height above the feet, as a fraction of total body height */
  up: number;
  /** lateral offset, as a fraction of total body height (+ = the figure's right) */
  side: number;
  /** depth offset, same units */
  fwd: number;
}

/**
 * Boxman's hierarchy, normalised. `jointGlobals()` in tools/voxel-gen/boxman.ts
 * puts hips at 12px, head at 24px, hands at (±6, 24), feet at (±2, 12) on a
 * 32px figure — divide by 32 and you get these.
 */
export const DANCE_JOINTS: readonly DanceJoint[] = [
  { name: "head", up: 24 / 32, side: 0, fwd: 0 },
  { name: "chest", up: 18 / 32, side: 0, fwd: 0 },
  { name: "hips", up: 12 / 32, side: 0, fwd: 0 },
  { name: "handLeft", up: 24 / 32, side: -6 / 32, fwd: 0 },
  { name: "handRight", up: 24 / 32, side: 6 / 32, fwd: 0 },
  { name: "footLeft", up: 1 / 32, side: -2 / 32, fwd: 0 },
  { name: "footRight", up: 1 / 32, side: 2 / 32, fwd: 0 },
];

/**
 * 喪標麥可's on-screen height in GGD units: `guardian_skeleton.glb` at the
 * champion doc's `scale: 0.831`, whose `overhead` attach point sits at y = 2.25.
 * Used only as the default for the gate; the pose itself is scale-free.
 */
export const ZOMBIEX_BODY_HEIGHT = 2.25;

// ---------------------------------------------------------------------------
// the choreography
// ---------------------------------------------------------------------------

/** Peak lateral glide, GGD units, at full energy. His collision radius is 0.6. */
export const SLIDE_AMP = 0.36;
/** Peak fore/aft glide. Together with SLIDE_AMP the feet trace an ellipse. */
export const STEP_AMP = 0.24;
/** Peak body lean away from the glide, radians (~15°) — the Smooth-Criminal tilt. */
export const LEAN_MAX = 0.26;
/** Peak hip/shoulder swivel about the vertical, radians (~23°). */
export const SWIVEL_MAX = 0.4;
/** Vertical bob. Small ON PURPOSE: at 68° it barely projects (see the header). */
export const BOB_AMP = 0.1;
/** The knee-drop accent on each beat onset. */
export const POP_DROP = 0.09;
/** How fast the beat accent decays, per beat. */
export const POP_DECAY = 8;
/** Full turns the payoff spin makes across bar 2. */
export const SPIN_TURNS = 1;

const TWO_PI = Math.PI * 2;

export interface DanceInput {
  /** beats elapsed since the phrase started (fractional; 1 beat = 1 landed hit) */
  beats: number;
  /**
   * 0..1 — how much of the dance is switched on. Ramps with the stack count so
   * the body escalates from a twitch on stack 1 to the full shuffle on stack 4,
   * and falls back to 0 as the phrase releases (so nothing ever snaps).
   */
  energy: number;
  /** 0..1 progress through the payoff spin; 0 = not spinning */
  spin?: number;
}

export interface DancePose {
  /** world-frame position offsets, GGD units, ADDED on top of the synced pose */
  dx: number;
  dy: number;
  dz: number;
  /** ADDED to the view's facing yaw */
  yawRad: number;
  /** ABSOLUTE tilts (nothing else writes these two; cleared on stop) */
  pitchRad: number;
  rollRad: number;
}

export const REST_POSE: DancePose = { dx: 0, dy: 0, dz: 0, yawRad: 0, pitchRad: 0, rollRad: 0 };

/**
 * The pose at a point in the phrase. Pure, deterministic, no rng — this is
 * presentation driven off the beat-stack count the sim already produces, and
 * the sim never learns it exists.
 *
 * The glide is expressed in WORLD space, not in the champion's local frame, and
 * that is deliberate: `CameraRig`'s yaw is FIXED, so a world-frame ellipse has
 * the same screen-space amplitude wherever the fight is and whichever way he is
 * facing. A local-frame glide would collapse to nearly nothing whenever he
 * happened to face the camera — an invisible feature by geometry.
 */
export function dancePose(input: DanceInput): DancePose {
  const energy = Math.min(1, Math.max(0, input.energy));
  if (energy <= 0) return { ...REST_POSE };
  const u = input.beats;
  const phase = u - Math.floor(u);
  const pop = Math.exp(-POP_DECAY * phase);

  // ground-plane ellipse: one full circuit per two beats
  const dx = SLIDE_AMP * energy * Math.sin(Math.PI * u);
  const dz = STEP_AMP * energy * Math.sin(Math.PI * u + Math.PI / 2);
  // two bobs per beat, minus the knee-drop accent on the onset
  const dy = energy * (BOB_AMP * (0.5 - 0.5 * Math.cos(2 * TWO_PI * u)) - POP_DROP * pop);

  // lean LEADS the glide (it is the glide's derivative), which is what makes a
  // slide read as weight transfer rather than as the model being dragged.
  const rollRad = -LEAN_MAX * energy * Math.cos(Math.PI * u);
  const pitchRad = LEAN_MAX * 0.35 * energy * (pop - 0.3 * Math.cos(TWO_PI * u));
  let yawRad = SWIVEL_MAX * energy * Math.sin(TWO_PI * u);

  const spin = Math.min(1, Math.max(0, input.spin ?? 0));
  if (spin > 0) {
    // ease-in-out so the turn accelerates out of the empowered hit and settles
    // on the last note rather than stopping dead.
    const eased = spin < 0.5 ? 2 * spin * spin : 1 - Math.pow(-2 * spin + 2, 2) / 2;
    yawRad += SPIN_TURNS * TWO_PI * eased;
  }

  return { dx, dy, dz, yawRad, pitchRad, rollRad };
}

// ---------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------

export interface DanceFramingOptions {
  /** camera distance to its ground target; defaults to DOLLY_MIN — the CLOSEST zoom (⚠️ since GH#361 that is no longer the shipped default) */
  dolly?: number;
  fovRad?: number;
  aspect?: number;
  /** where the camera is looking; default = the dancer's own feet */
  target?: { x: number; z: number };
  /** the dancer's feet in world space */
  at?: { x: number; z: number };
  bodyHeight?: number;
  /** how many beats of the dance to sample */
  beats?: number;
  /** samples per beat */
  samplesPerBeat?: number;
  energy?: number;
  /** include the payoff spin across the sampled window */
  spin?: boolean;
}

export interface DanceFramingResult {
  ok: boolean;
  /** peak-to-peak screen travel of the busiest joint, in viewport heights */
  screenTravel: number;
  /** which joint that was */
  busiestJoint: string;
  /** worst |vertical angle| / vertical half-angle over the sample, 0..1+ */
  worstVertical: number;
  worstHorizontal: number;
  reason?: string;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Project a world point into normalised frame coordinates. `nx`/`ny` are in
 * [-1, 1] across the FULL frame (before the safety margin), so screen travel in
 * viewport heights is `Δny / 2`, and horizontal travel converted to the same
 * unit is `Δnx / 2 * aspect`.
 */
function project(
  p: Vec3,
  eye: Vec3,
  fwd: Vec3,
  up: Vec3,
  tanV: number,
  tanH: number,
): { nx: number; ny: number; depth: number } {
  const v = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
  const depth = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
  const vy = v.y * up.y + v.z * up.z; // up.x is 0 in this rig
  const vx = v.x; // right is (1,0,0): yaw is fixed
  return { nx: depth > 0 ? vx / depth / tanH : 0, ny: depth > 0 ? vy / depth / tanV : 0, depth };
}

/**
 * Is the dance watchable? Samples the choreography over `beats` beats, tracks
 * every joint through the pose, and reports the worst frustum occupancy plus the
 * biggest peak-to-peak screen displacement any joint achieves.
 *
 * `ok` is the gate. The numbers are what a failing test prints, so an author can
 * see HOW invisible (or how out of frame) the dance became.
 */
export function checkDanceFraming(opts: DanceFramingOptions = {}): DanceFramingResult {
  const dolly = opts.dolly ?? DOLLY_MIN;
  const fov = opts.fovRad ?? DEFAULT_FOV_RAD;
  const aspect = opts.aspect ?? MIN_ASPECT;
  const bodyHeight = opts.bodyHeight ?? ZOMBIEX_BODY_HEIGHT;
  const at = opts.at ?? { x: 0, z: 0 };
  const target = opts.target ?? at;
  const beats = Math.max(1, opts.beats ?? 4);
  const perBeat = Math.max(4, opts.samplesPerBeat ?? 24);
  const energy = opts.energy ?? 1;
  const withSpin = opts.spin === true;

  const eye: Vec3 = {
    x: target.x,
    y: dolly * Math.sin(CAMERA_PITCH_RAD),
    z: target.z - dolly * Math.cos(CAMERA_PITCH_RAD),
  };
  const fwd: Vec3 = { x: 0, y: -Math.sin(CAMERA_PITCH_RAD), z: Math.cos(CAMERA_PITCH_RAD) };
  const up: Vec3 = { x: 0, y: Math.cos(CAMERA_PITCH_RAD), z: Math.sin(CAMERA_PITCH_RAD) };

  // half-angle tangents WITHOUT the margin (projection), and WITH it (the gate)
  const tanV = Math.tan(fov / 2);
  const tanH = tanV * aspect;
  const safeV = 1 - VERTICAL_MARGIN;
  const safeH = 1 - HORIZONTAL_MARGIN;

  const track = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
  for (const j of DANCE_JOINTS) track.set(j.name, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  let worstV = 0;
  let worstH = 0;
  let reason: string | undefined;
  const total = Math.round(beats * perBeat);

  for (let i = 0; i <= total; i++) {
    const u = (i / perBeat) % (beats + 1);
    const pose = dancePose({ beats: u, energy, spin: withSpin ? i / total : 0 });
    const cy = Math.cos(pose.yawRad);
    const sy = Math.sin(pose.yawRad);
    const cr = Math.cos(pose.rollRad);
    const sr = Math.sin(pose.rollRad);
    const cp = Math.cos(pose.pitchRad);
    const sp = Math.sin(pose.pitchRad);

    for (const j of DANCE_JOINTS) {
      // joint in the figure's own frame, in world units
      const lx = j.side * bodyHeight;
      const ly = j.up * bodyHeight;
      const lz = j.fwd * bodyHeight;
      // roll about +z (lean), then pitch about +x, then yaw about +y — the same
      // order a TransformNode with `rotation = (pitch, yaw, roll)` applies.
      const rx = lx * cr - ly * sr;
      const ry = lx * sr + ly * cr;
      const px = rx;
      const py = ry * cp - lz * sp;
      const pz = ry * sp + lz * cp;
      const wx = at.x + pose.dx + (px * cy + pz * sy);
      const wy = pose.dy + py;
      const wz = at.z + pose.dz + (-px * sy + pz * cy);

      const q = project({ x: wx, y: wy, z: wz }, eye, fwd, up, tanV, tanH);
      if (q.depth <= 0.01) {
        return {
          ok: false,
          screenTravel: 0,
          busiestJoint: j.name,
          worstVertical: Infinity,
          worstHorizontal: Infinity,
          reason: `joint ${j.name} passes behind the camera at beat ${u.toFixed(2)}`,
        };
      }
      const rv = Math.abs(q.ny) / safeV;
      const rh = Math.abs(q.nx) / safeH;
      if (rv > worstV) {
        worstV = rv;
        if (rv > 1 && !reason) {
          reason = `joint ${j.name} leaves the frame vertically at beat ${u.toFixed(2)} (${(rv * 100).toFixed(0)}% of the safe half-angle)`;
        }
      }
      if (rh > worstH) {
        worstH = rh;
        if (rh > 1 && !reason) {
          reason = `joint ${j.name} leaves the frame horizontally at beat ${u.toFixed(2)} (${(rh * 100).toFixed(0)}% of the safe half-angle)`;
        }
      }
      const t = track.get(j.name)!;
      if (q.nx < t.minX) t.minX = q.nx;
      if (q.nx > t.maxX) t.maxX = q.nx;
      if (q.ny < t.minY) t.minY = q.ny;
      if (q.ny > t.maxY) t.maxY = q.ny;
    }
  }

  let screenTravel = 0;
  let busiestJoint = DANCE_JOINTS[0]!.name;
  for (const [name, t] of track) {
    // both axes converted to VIEWPORT HEIGHTS: ny spans 2 across the height,
    // nx spans 2 across the width, and width = height × aspect.
    const dyH = (t.maxY - t.minY) / 2;
    const dxH = ((t.maxX - t.minX) / 2) * aspect;
    const travel = Math.hypot(dxH, dyH);
    if (travel > screenTravel) {
      screenTravel = travel;
      busiestJoint = name;
    }
  }

  const framed = worstV <= 1 && worstH <= 1;
  const bigEnough = screenTravel >= MIN_SCREEN_TRAVEL;
  if (framed && !bigEnough) {
    reason = `dance moves only ${(screenTravel * 100).toFixed(1)}% of viewport height (need ${(MIN_SCREEN_TRAVEL * 100).toFixed(0)}%)`;
  }
  return {
    ok: framed && bigEnough,
    screenTravel,
    busiestJoint,
    worstVertical: worstV,
    worstHorizontal: worstH,
    ...(framed && bigEnough ? {} : { reason: reason ?? "dance is not watchable" }),
  };
}

// ---------------------------------------------------------------------------
// applying it
// ---------------------------------------------------------------------------

/**
 * The shape of a Babylon `TransformNode` this module needs. Structural, so the
 * pose can be applied (and unit-tested) without importing Babylon.
 */
export interface PoseTarget {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

/**
 * Per-node record of the vertical offset this module last added, so the next
 * frame can take it back before adding a new one.
 *
 * ⛔ This exists because an earlier version of this file asserted that
 * `ChampionView.sync` re-authors `root.position.x/y/z` every frame and that
 * `+=` therefore could not accumulate. **Three of those four channels are
 * re-authored; `y` is not.** `EntityViewRegistry.ts:608` calls
 * `view.setPose(x, z, fx, fz)` and `ChampionView.setPose` writes only
 * `position.x` / `position.z`. The only writers of `root.position.y` are
 * `updateDissolve` / `resetDissolve`, and both return early for a living body.
 * So `+=` on `y` accumulated: `dy` has a positive mean (≈ +0.039/frame at full
 * energy), which levitates the dancer ~2.3 units/second and takes him out of a
 * 9.27-unit-high camera inside one phrase — permanently, because nothing ever
 * writes that channel back down.
 *
 * The fix does NOT depend on knowing which channels `sync` re-authors, and does
 * not need the body's base height: subtracting the previous offset before
 * adding the new one is identical to setting `base + dy`, whoever owns `base`.
 */
const lastDy = new WeakMap<PoseTarget, number>();

/**
 * Add the dance to whatever `ChampionView.sync` just wrote.
 *
 * MUST run AFTER `EntityViewRegistry.sync` in the same frame.
 *
 * - `position.x` / `position.z` / `rotation.y` are re-authored by `sync` every
 *   frame, so they take a plain `+=` offset that is wiped next frame.
 * - `position.y` is NOT re-authored (see `lastDy`), so the previous offset is
 *   taken back first — net effect is absolute, and idempotent if called twice.
 * - `rotation.x` / `rotation.z` are ours alone, so they are SET and are put
 *   back by `clearPose`.
 */
export function applyDancePose(node: PoseTarget, pose: DancePose): void {
  node.position.x += pose.dx;
  node.position.y += pose.dy - (lastDy.get(node) ?? 0);
  lastDy.set(node, pose.dy);
  node.position.z += pose.dz;
  node.rotation.y += pose.yawRad;
  node.rotation.x = pose.pitchRad;
  node.rotation.z = pose.rollRad;
}

/**
 * Put back everything this module owns: the two tilts, and the vertical offset.
 * `x` / `z` / `yaw` need no undo — `sync` re-authors them next frame.
 */
export function clearPose(node: PoseTarget): void {
  node.rotation.x = 0;
  node.rotation.z = 0;
  const dy = lastDy.get(node);
  if (dy !== undefined && dy !== 0) node.position.y -= dy;
  lastDy.set(node, 0);
}
