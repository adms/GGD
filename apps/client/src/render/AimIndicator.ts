/**
 * AimIndicator — the touch drag-aim telegraph: a thin ground line for
 * skillshots/dashes (and targeted-aim hints) or a disc at the drag-projected
 * point for ground casts. Driven once per frame by the GameApp from the plain
 * `touchFrame.indicator` state (input/TouchInput) — meshes are created lazily
 * and simply toggled/transformed, never re-allocated.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AimIndicatorState } from "../input/TouchInput";

const LINE_WIDTH = 0.4;
const Y = 0.07; // just above the ground plane (telegraphs sit at 0.05/0.06)

export class AimIndicator {
  private line: Mesh | null = null;
  private disc: Mesh | null = null;

  constructor(private readonly scene: Scene) {}

  update(state: AimIndicatorState): void {
    if (state?.kind === "line") {
      const line = (this.line ??= this.makeLine());
      line.setEnabled(true);
      line.scaling.set(LINE_WIDTH, state.length, 1);
      // plane local +Y (pre-rotation) points along world +Z after rotation.x
      line.rotation.y = Math.atan2(state.dirX, state.dirZ);
      line.position.set(
        state.fromX + (state.dirX * state.length) / 2,
        Y,
        state.fromZ + (state.dirZ * state.length) / 2,
      );
    } else {
      this.line?.setEnabled(false);
    }

    if (state?.kind === "disc") {
      const disc = (this.disc ??= this.makeDisc());
      disc.setEnabled(true);
      disc.scaling.set(state.radius, state.radius, 1);
      disc.position.set(state.x, Y, state.z);
    } else {
      this.disc?.setEnabled(false);
    }
  }

  dispose(): void {
    this.line?.dispose(false, true);
    this.disc?.dispose(false, true);
    this.line = null;
    this.disc = null;
  }

  private material(name: string): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.emissiveColor = new Color3(0.45, 0.75, 1.0);
    mat.disableLighting = true;
    mat.alpha = 0.45;
    return mat;
  }

  private makeLine(): Mesh {
    const mesh = MeshBuilder.CreatePlane(
      "aim-line",
      { size: 1, sideOrientation: 2 /* DOUBLESIDE */ },
      this.scene,
    );
    // flat on the ground: local +Y → world +Z, then yawed toward the aim dir;
    // the plane is centered, so update() places it at from + dir·length/2
    mesh.rotation.x = Math.PI / 2;
    mesh.material = this.material("aim-line-mat");
    mesh.isPickable = false;
    return mesh;
  }

  private makeDisc(): Mesh {
    const mesh = MeshBuilder.CreateDisc("aim-disc", { radius: 1, tessellation: 48 }, this.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.material = this.material("aim-disc-mat");
    mesh.isPickable = false;
    return mesh;
  }
}
