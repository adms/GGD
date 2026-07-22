/**
 * ViewportManager — Babylon multi-viewport split-screen for couch play.
 * ONE Scene, one camera (CameraRig) per local player, each clipped to its
 * viewport rect: 1 player = full screen, 2 = vertical halves (left|right),
 * 3-4 = 2x2 grid (with 3 players the bottom-right quadrant stays empty — the
 * DOM HUD parks the scoreboard there).
 */
import type { Scene } from "@babylonjs/core/scene";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { CameraRig } from "./CameraRig";
import { viewportRects } from "./viewportRects";

export class ViewportManager {
  readonly rigs: CameraRig[] = [];

  constructor(scene: Scene, initialTarget: Vec2, playerCount: number) {
    const rects = viewportRects(playerCount);
    for (const rect of rects) {
      const rig = new CameraRig(scene, initialTarget);
      rig.camera.viewport = new Viewport(rect.x, rect.y, rect.w, rect.h);
      this.rigs.push(rig);
    }
    if (this.rigs.length > 1) {
      // multi-view: activeCameras drives rendering, one pass per viewport
      scene.activeCameras = this.rigs.map((r) => r.camera);
    } else {
      scene.activeCamera = this.rigs[0]!.camera;
    }
  }

  get count(): number {
    return this.rigs.length;
  }

  /** The camera rig following local player k. */
  rigFor(player: number): CameraRig {
    return this.rigs[Math.min(player, this.rigs.length - 1)]!;
  }

  /** Player 0's rig — mouse picking + world-anchor projection. */
  get primary(): CameraRig {
    return this.rigs[0]!;
  }
}
