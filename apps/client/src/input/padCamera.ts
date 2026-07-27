/**
 * padCamera — turning a pad's {@link GamepadCameraIntent} into real camera
 * motion. Split out of `GameApp` so the ONE stateful part of the pad camera
 * (the R3 notch counter) is unit-testable against a fake rig, instead of living
 * inside a class that needs a WebGL context to construct.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY R3 IS A CYCLE (owner's 2026-07-27 map: 「R3 鏡頭歸位 / 縮放」)
 * ════════════════════════════════════════════════════════════════════════════
 * The retired modifier layer spent TWO buttons on zoom (RB+LT out, RB+RT in).
 * The new map spends one: a stick click, which is a single discrete event and
 * cannot mean "out" and "in" at the same time. So R3 walks the camera OUT one
 * notch per press and, once it has reached the last notch, HOMES — back to the
 * default distance and back onto the champion. That is both halves of 「歸位 /
 * 縮放」 on one button, and it means a lost player is never more than a few
 * presses from a known-good view, which is the thing a couch player actually
 * needs (nobody on a sofa is fine-tuning a dolly).
 *
 * The counter lives here rather than being read back off the rig because the
 * rig's dolly is also moved by the mouse wheel, the death-spectator transition
 * and the EX punch-in. Rather than try to stay in sync with all of them, the
 * cycle is deliberately self-healing: every lap ENDS in an absolute reset, so
 * however far out of step the counter got, one more press puts the camera
 * somewhere exactly known.
 */
import type { GamepadCameraIntent } from "./GamepadInput";

/**
 * The slice of `render/CameraRig` this needs. Structural, so the test drives a
 * plain object and this module keeps the client-08 "no @babylonjs in input/"
 * rule.
 */
export interface PadCameraRig {
  /** false = free-pan; the rig only applies `panVec` while this is false. */
  followLock: boolean;
  /** wheel-equivalent dolly delta; positive = out, negative = in. */
  zoomBy(wheelDeltaY: number): void;
  toggleFollow(): void;
}

/** Wheel-equivalent dolly delta per R3 notch (see CameraRig.zoomBy). */
export const GAMEPAD_ZOOM_STEP = 120;

/** How many notches out before the next press homes the camera. */
export const GAMEPAD_ZOOM_NOTCHES = 3;

/**
 * A zoom delta that ALWAYS reaches the near clamp, whatever the dolly is now.
 * `CameraRig.zoomBy` clamps to `[DOLLY_MIN, dollyMax]` and scales the wheel
 * delta by 0.02, and the widest clamp in the rig is the dead-spectator
 * `DOLLY_MAX_DEAD` (90) against `DOLLY_MIN` (10): (90-10)/0.02 = 4000. Doubled
 * for headroom, so "home" is an absolute reset to `DOLLY_DEFAULT` and not a
 * relative step that could land short.
 */
export const GAMEPAD_ZOOM_HOME_DELTA = -8000;

/**
 * One local player's pad camera state. Per player: in couch play each seat has
 * its own rig and its own idea of where it is looking.
 */
export class PadCameraControl {
  /** notches this camera has stepped out since its last home. */
  private notch = 0;

  /**
   * Apply one frame's camera intent. `pan` is deliberately NOT handled here —
   * it is continuous and has to be latched by the caller into the same frame's
   * `CameraRig.update({ panVec })` call, which is the frame loop's job.
   */
  apply(rig: PadCameraRig, cam: GamepadCameraIntent): void {
    if (cam.toggleFollow) {
      rig.toggleFollow();
      // A deliberate re-lock is also "put me back on my champion", so the next
      // R3 should start a fresh lap rather than home immediately.
      if (rig.followLock) this.notch = 0;
    }
    if (cam.zoomCycle) {
      if (this.notch >= GAMEPAD_ZOOM_NOTCHES) {
        rig.zoomBy(GAMEPAD_ZOOM_HOME_DELTA); // 歸位: back to DOLLY_DEFAULT
        rig.followLock = true; // …and back onto the champion
        this.notch = 0;
      } else {
        rig.zoomBy(GAMEPAD_ZOOM_STEP); // 縮放: one notch further out
        this.notch += 1;
      }
    }
  }
}
