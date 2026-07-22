/**
 * CameraRig — angled top-down MOBA camera (~55° pitch). Follow-lock on the
 * local champion (Space toggles), edge-pan when the cursor hugs the viewport
 * border, arrow-key pan, wheel dolly with clamps. Also owns screenToGround:
 * a picking ray built by Babylon intersected with the mathematical y=0 plane
 * (pure math in input/Picking — never mesh picking).
 */
import type { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { intersectRayGround } from "../input/Picking";
import type { CursorState, PanKeys } from "../input/InputCapture";
import type { AnchorPose, CameraGroundView } from "../frameBus";
import { shakeDecayEnvelope } from "./combatFeedback";
import { settlementCameraPose } from "./settlementCamera";

/** Camera pitch from horizontal — exported so sightline math (ArenaScene's
 *  occluder audit) derives its height cap from the SAME angle. */
export const CAMERA_PITCH_RAD = (55 * Math.PI) / 180;
export const DOLLY_MIN = 10;
const DOLLY_MAX = 40;
/** while spectating (dead), allow a much wider zoom-out to watch the whole fight */
const DOLLY_MAX_DEAD = 90;
/**
 * Default zoom — the CLOSEST allowed dolly, so the champion starts as large as
 * the clamp permits (#31a). Derived from DOLLY_MIN so the two can never drift.
 */
export const DOLLY_DEFAULT = DOLLY_MIN;
const PAN_SPEED = 26; // units/sec
const EDGE_PX = 24;
const FOLLOW_LERP_HALFLIFE_MS = 90;

/** Max simultaneous shake impulses (pre-allocated; allocation-free hot path). */
const MAX_SHAKES = 6;
/** Shake oscillation rate (rad/ms) — ~8–10 Hz jitter. */
const SHAKE_FREQ = 0.052;

interface ShakeImpulse {
  active: boolean;
  amp: number;
  ageMs: number;
  durationMs: number;
  phase: number;
}

export interface CameraUpdateArgs {
  dtMs: number;
  localPos: Vec2 | null;
  cursor: CursorState | null;
  panKeys: PanKeys | null;
  viewportWidth: number;
  viewportHeight: number;
}

export class CameraRig {
  readonly camera: TargetCamera;
  followLock = true;
  /** spectator mode: set while the followed champion is dead (see setDead). */
  private dead = false;
  /**
   * Victory-settlement front-view (see setSettlement). While set, the rig
   * ignores follow/pan/shake and holds a cinematic frontal hero shot of the
   * still champion, orbiting + dollying purely off elapsed time.
   */
  private settle: { pos: Vec2; facing: Vec2 } | null = null;
  private settleElapsedMs = 0;
  private target: Vec2;
  private dolly = DOLLY_DEFAULT;

  /** Pre-allocated shake-impulse pool + the current summed offset (world units). */
  private readonly shakes: ShakeImpulse[] = Array.from({ length: MAX_SHAKES }, () => ({
    active: false,
    amp: 0,
    ageMs: 0,
    durationMs: 0,
    phase: 0,
  }));
  private shakePhaseSeed = 0;
  private shakeX = 0;
  private shakeY = 0;

  /**
   * Ground-plane description of the LAST APPLIED transform (see
   * `recordSightline`) — the minimap's viewport box is built from this.
   */
  private readonly sightline = {
    targetX: 0,
    targetZ: 0,
    dolly: DOLLY_DEFAULT,
    pitchRad: CAMERA_PITCH_RAD,
    yawRad: 0,
  };

  constructor(
    private readonly scene: Scene,
    initialTarget: Vec2,
  ) {
    this.target = { x: initialTarget.x, z: initialTarget.z };
    this.camera = new TargetCamera("rig", Vector3.Zero(), scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 250;
    scene.activeCamera = this.camera;
    this.apply();
  }

  toggleFollow(): void {
    this.followLock = !this.followLock;
  }

  /** True while spectating a dead champion (free-pan + wider zoom-out). */
  get spectating(): boolean {
    return this.dead;
  }

  /** World-space camera eye position (read-only; decor auto-fade sightlines). */
  get eye(): { x: number; y: number; z: number } {
    return this.camera.position;
  }

  private get dollyMax(): number {
    return this.dead ? DOLLY_MAX_DEAD : DOLLY_MAX;
  }

  zoomBy(wheelDeltaY: number): void {
    this.dolly = Math.min(this.dollyMax, Math.max(DOLLY_MIN, this.dolly + wheelDeltaY * 0.02));
  }

  /**
   * Death-spectator transition. On ALIVE→DEAD unlock follow (free pan across the
   * whole arena), widen the zoom-out clamp, and optionally recenter on the
   * ongoing fight so the player isn't staring at the corpse. On DEAD→ALIVE
   * (respawn) re-lock follow, snap to the hero, and restore the normal clamp.
   * A manual Space toggle while dead is respected until respawn re-locks.
   * No-op when the state is unchanged, so calling it every frame is cheap.
   */
  setDead(dead: boolean, center?: Vec2 | null): void {
    if (dead === this.dead) return;
    this.dead = dead;
    if (dead) {
      this.followLock = false; // free pan while spectating
      if (center) this.jumpTo(center); // frame the fight once
    } else {
      this.followLock = true; // re-lock on respawn
      this.dolly = Math.min(this.dolly, DOLLY_MAX); // restore the normal zoom clamp
      if (center) this.jumpTo(center); // snap back to the hero
    }
  }

  jumpTo(point: Vec2): void {
    this.target = { x: point.x, z: point.z };
    this.apply();
  }

  /**
   * Look at a world point WITHOUT moving the champion — the minimap's
   * left-click "peek" (LoL). Breaks follow-lock exactly like an edge-pan does,
   * so Space (toggleFollow) snaps back to the hero; no-op during the
   * settlement hero shot, which owns the camera outright.
   */
  focusOn(point: Vec2): void {
    if (this.settle) return;
    this.followLock = false;
    this.jumpTo(point);
  }

  /**
   * The rig's CURRENT ground-plane view, for the minimap viewport box
   * (frameBus.cameraView). Sightline geometry comes from `sightline`, recorded
   * by whichever apply path last flushed the transform (normal rig OR the
   * settlement hero shot) — deliberately NOT from `camera.getTarget()`, whose
   * `_currentTarget` is only refreshed when Babylon recomputes the view matrix
   * and is therefore a frame stale (or plain wrong before the first render).
   * fov/aspect are read live off the camera and this rig's viewport rect, so a
   * split-screen quadrant reports its own shape.
   */
  groundView(): CameraGroundView {
    const engine = this.scene.getEngine();
    const vp = this.camera.viewport;
    const w = engine.getRenderWidth() * (vp.width || 1);
    const h = engine.getRenderHeight() * (vp.height || 1);
    return {
      ...this.sightline,
      fovRad: this.camera.fov,
      aspect: h > 0 ? w / h : 1,
    };
  }

  /**
   * Record where the just-applied camera transform meets the GROUND plane:
   * the centre ray is walked from the eye to y=0, so `dolly` is the true
   * eye→ground distance and `pitch`/`yaw` describe that same ray. This keeps
   * the published view self-consistent (eyeY === dolly·sin pitch) for any
   * camera, including the settlement shot that looks at a raised point.
   */
  private recordSightline(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    lookX: number,
    lookY: number,
    lookZ: number,
  ): void {
    const dx = lookX - eyeX;
    const dy = lookY - eyeY;
    const dz = lookZ - eyeZ;
    const len = Math.hypot(dx, dy, dz) || 1;
    const flat = Math.hypot(dx, dz);
    const s = this.sightline;
    s.pitchRad = Math.atan2(-dy, flat);
    s.yawRad = Math.atan2(dx, dz);
    const down = -dy / len;
    if (down > 1e-6 && eyeY > 0) {
      s.dolly = eyeY / down;
      s.targetX = eyeX + (dx / len) * s.dolly;
      s.targetZ = eyeZ + (dz / len) * s.dolly;
    } else {
      // camera level with / below the ground: no intersection to report
      s.dolly = len;
      s.targetX = lookX;
      s.targetZ = lookZ;
    }
  }

  /** True while the settlement front-view is active (input should be disabled). */
  get inSettlement(): boolean {
    return this.settle !== null;
  }

  /**
   * Enter the victory-settlement hero shot: ease to a cinematic FRONTAL low-angle
   * view of the LOCAL champion at `pos` facing `facing` (its planar facing), with
   * a slow orbit + dolly-in (see settlementCamera). Overrides spectator/follow so
   * the still champion is framed from the front. Idempotent per position: calling
   * again with the same target does not restart the animation (avoids a jarring
   * re-dolly on every frame the outcome stays decided).
   */
  setSettlement(pos: Vec2, facing: Vec2 | null): void {
    const same =
      this.settle !== null &&
      this.settle.pos.x === pos.x &&
      this.settle.pos.z === pos.z;
    if (same) return;
    this.settle = { pos: { x: pos.x, z: pos.z }, facing: facing ? { x: facing.x, z: facing.z } : { x: 0, z: 1 } };
    this.settleElapsedMs = 0;
    this.dead = false; // settlement front-view supersedes the death spectator
  }

  /** Leave the settlement front-view (match teardown / restart). */
  clearSettlement(): void {
    this.settle = null;
    this.settleElapsedMs = 0;
  }

  /**
   * Queue a decaying camera-shake impulse of peak amplitude `amp` (world units,
   * already quality-scaled by the caller) lasting `durationMs`. Reuses a free
   * pool slot; when all are busy the weakest (lowest remaining amplitude) is
   * stolen. Fire-and-forget from the event drain — the decay runs in `update`.
   */
  addShake(amp: number, durationMs: number): void {
    if (!(amp > 0) || !(durationMs > 0)) return;
    let slot = this.shakes.find((s) => !s.active);
    if (!slot) {
      // steal the impulse with the least remaining amplitude
      slot = this.shakes[0]!;
      for (const s of this.shakes) {
        if (s.amp * shakeDecayEnvelope(s.ageMs, s.durationMs) <
            slot.amp * shakeDecayEnvelope(slot.ageMs, slot.durationMs)) {
          slot = s;
        }
      }
    }
    slot.active = true;
    slot.amp = amp;
    slot.ageMs = 0;
    slot.durationMs = durationMs;
    this.shakePhaseSeed += 1.7; // decorrelate successive shakes (no rng needed)
    slot.phase = this.shakePhaseSeed;
  }

  /** Advance every live shake impulse and re-sum the current camera offset. */
  private advanceShake(dtMs: number): void {
    let ox = 0;
    let oy = 0;
    for (const s of this.shakes) {
      if (!s.active) continue;
      s.ageMs += dtMs;
      const env = shakeDecayEnvelope(s.ageMs, s.durationMs);
      if (env <= 0) {
        s.active = false;
        continue;
      }
      const mag = s.amp * env;
      ox += mag * Math.sin(s.ageMs * SHAKE_FREQ + s.phase);
      oy += mag * Math.cos(s.ageMs * SHAKE_FREQ * 1.3 + s.phase);
    }
    this.shakeX = ox;
    this.shakeY = oy;
  }

  update(args: CameraUpdateArgs): void {
    // Settlement front-view: ignore follow/pan/shake; ease the cinematic hero
    // shot purely off elapsed time so the still champion is framed frontally.
    if (this.settle) {
      this.settleElapsedMs += args.dtMs;
      this.applySettlement();
      return;
    }

    this.advanceShake(args.dtMs);
    const dt = Math.min(args.dtMs, 100) / 1000;

    if (this.followLock && args.localPos) {
      // exp-smoothed follow
      const k = 1 - Math.pow(0.5, args.dtMs / FOLLOW_LERP_HALFLIFE_MS);
      this.target.x += (args.localPos.x - this.target.x) * k;
      this.target.z += (args.localPos.z - this.target.z) * k;
    } else {
      let panX = 0;
      let panZ = 0;
      if (args.panKeys) {
        if (args.panKeys.up) panZ += 1;
        if (args.panKeys.down) panZ -= 1;
        if (args.panKeys.left) panX -= 1;
        if (args.panKeys.right) panX += 1;
      }
      if (args.cursor?.inside && args.viewportWidth > 0 && args.viewportHeight > 0) {
        if (args.cursor.x <= EDGE_PX) panX -= 1;
        else if (args.cursor.x >= args.viewportWidth - EDGE_PX) panX += 1;
        if (args.cursor.y <= EDGE_PX) panZ += 1;
        else if (args.cursor.y >= args.viewportHeight - EDGE_PX) panZ -= 1;
      }
      this.target.x += panX * PAN_SPEED * dt;
      this.target.z += panZ * PAN_SPEED * dt;
    }
    this.apply();
  }

  /** Cursor (CSS px, canvas-relative) → planar ground point, or null. */
  screenToGround(x: number, y: number): Vec2 | null {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.camera);
    return intersectRayGround({
      origin: { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      dir: { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
    });
  }

  /** World point → CSS-pixel screen pose (for the DOM world-anchor layer). */
  projectToScreen(x: number, y: number, z: number): AnchorPose {
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const projected = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(w, h),
    );
    const scale = engine.getHardwareScalingLevel();
    return {
      sx: projected.x * scale,
      sy: projected.y * scale,
      visible: projected.z > 0 && projected.z < 1,
    };
  }

  /** Flush the current settlement hero-shot pose to the camera transform. */
  private applySettlement(): void {
    const s = this.settle!;
    const pose = settlementCameraPose(s.pos, s.facing, this.settleElapsedMs);
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.camera.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z));
    this.recordSightline(
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.target.x,
      pose.target.y,
      pose.target.z,
    );
  }

  private apply(): void {
    const back = this.dolly * Math.cos(CAMERA_PITCH_RAD);
    const up = this.dolly * Math.sin(CAMERA_PITCH_RAD);
    // shake jitters the camera POSITION only (target held) → a subtle angular
    // wobble that reads as impact without dragging the framing off the fight.
    const eyeX = this.target.x + this.shakeX;
    const eyeY = up + this.shakeY;
    const eyeZ = this.target.z - back;
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.setTarget(new Vector3(this.target.x, 0, this.target.z));
    this.recordSightline(eyeX, eyeY, eyeZ, this.target.x, 0, this.target.z);
  }
}
