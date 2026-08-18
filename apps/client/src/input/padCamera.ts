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
 * cannot mean "out" and "in" at the same time. So R3 walks the camera one notch
 * AWAY FROM THE DEFAULT per press and, once it has reached the last notch,
 * HOMES — back to the default distance and back onto the champion. That is both
 * halves of 「歸位 / 縮放」 on one button, and it means a lost player is never
 * more than a few presses from a known-good view, which is the thing a couch
 * player actually needs (nobody on a sofa is fine-tuning a dolly).
 *
 * ⚠️ "AWAY FROM THE DEFAULT" used to be spelled "OUT", because #31a shipped the
 * default AT the near clamp so away could only mean out. GH#361 moved the
 * shipped default to the FAR clamp, at which point three "out" presses became
 * three no-ops and the button did nothing at all. The direction is now derived
 * (`rig.zoomAwaySign`) so the control survives the next time owner moves the
 * default — including rolling it all the way back to #31a.
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
  /** absolute reset to the configured default distance (`zoom.defaultDolly`). */
  homeZoom(): void;
  /** which way a notch has to go to LEAVE the default: −1 = in, +1 = out. */
  readonly zoomAwaySign: number;
  toggleFollow(): void;
}

/**
 * Wheel-equivalent dolly delta per R3 notch, as a MAGNITUDE (see
 * `CameraRig.zoomBy`). The direction comes from `rig.zoomAwaySign`.
 *
 * ⚠️ GH#361: it used to be a signed `+120` ("one notch further OUT"), which was
 * only correct while the default zoom was the CLOSEST (#31a). Now that the
 * shipped default is the FARTHEST, stepping out is a no-op three times in a row
 * and the whole R3 control dies silently. The cycle is "step AWAY from the
 * default, then home", and which way that is falls out of the config.
 */
export const GAMEPAD_ZOOM_STEP = 120;

/** How many notches away from the default before the next press homes the camera. */
export const GAMEPAD_ZOOM_NOTCHES = 3;

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
        rig.homeZoom(); // 歸位: absolute reset to the configured default distance
        rig.followLock = true; // …and back onto the champion
        this.notch = 0;
      } else {
        rig.zoomBy(GAMEPAD_ZOOM_STEP * rig.zoomAwaySign); // 縮放: one notch away from the default
        this.notch += 1;
      }
    }
  }
}
