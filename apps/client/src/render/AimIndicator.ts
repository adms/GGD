/**
 * AimIndicator — the ground telegraph for ability aiming AND hold-to-preview.
 *
 *   • DRAG-AIM (touch): a thin ground line for skillshots/dashes (and targeted
 *     hints) or a disc at the drag-projected point for ground casts.
 *   • HOLD-PREVIEW (task #152; touch finger-hold OR desktop mouse-hold): a dashed
 *     cast-RANGE ring plus a dashed AoE disc centred on the caster, so a player
 *     holding a button sees exactly how far it reaches and how big it lands.
 *
 * Driven once per frame by the GameApp from a plain `AimIndicatorState` (the
 * touch `touchFrame.indicator`, else a held-slot preview it resolves). Meshes are
 * created lazily and simply toggled/transformed, never re-allocated per frame —
 * the dashed rings rebuild ONLY when the previewed radius actually changes (a new
 * ability), so a steady hold allocates nothing.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateDashedLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AimIndicatorState } from "../input/TouchInput";

const LINE_WIDTH = 0.4;
const Y = 0.07; // just above the ground plane (telegraphs sit at 0.05/0.06)
/** world-space dash pitch — one dash+gap cell every ~this many units */
const DASH_PITCH = 0.7;
const RANGE_COLOR = new Color3(0.45, 0.75, 1.0); // blue — cast reach
const AOE_COLOR = new Color3(1.0, 0.62, 0.23); // amber — where it lands

export class AimIndicator {
  private line: Mesh | null = null;
  private disc: Mesh | null = null;
  // hold-preview dashed rings (task #152); cached radius so a steady hold on one
  // ability never rebuilds geometry — only a change of previewed size does.
  private ring: LinesMesh | null = null;
  private ringR = -1;
  private aoe: LinesMesh | null = null;
  private aoeR = -1;

  constructor(private readonly scene: Scene) {}

  update(state: AimIndicatorState): void {
    const isLine = state?.kind === "line";
    const isDisc = state?.kind === "disc";
    const isRange = state?.kind === "range";

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
    } else if (this.line) {
      this.line.setEnabled(isLine);
    }

    if (state?.kind === "disc") {
      const disc = (this.disc ??= this.makeDisc());
      disc.setEnabled(true);
      disc.scaling.set(state.radius, state.radius, 1);
      disc.position.set(state.x, Y, state.z);
    } else if (this.disc) {
      this.disc.setEnabled(isDisc);
    }

    // hold-preview: dashed cast-range ring + dashed AoE disc, both centred on the
    // caster. `range`/`radius` arrive already scaled by the combat-env factor.
    if (isRange && state.range > 0.1) {
      this.ring = this.dashedRing(this.ring, this.ringR, state.range, RANGE_COLOR, "aim-range");
      this.ringR = state.range;
      this.ring.setEnabled(true);
      this.ring.position.set(state.x, Y, state.z);
    } else if (this.ring) {
      this.ring.setEnabled(false);
    }

    if (isRange && state.radius !== null && state.radius > 0.1) {
      this.aoe = this.dashedRing(this.aoe, this.aoeR, state.radius, AOE_COLOR, "aim-aoe");
      this.aoeR = state.radius;
      this.aoe.setEnabled(true);
      this.aoe.position.set(state.x, Y, state.z);
    } else if (this.aoe) {
      this.aoe.setEnabled(false);
    }
  }

  dispose(): void {
    this.line?.dispose(false, true);
    this.disc?.dispose(false, true);
    this.ring?.dispose(false, true);
    this.aoe?.dispose(false, true);
    this.line = null;
    this.disc = null;
    this.ring = null;
    this.aoe = null;
    this.ringR = -1;
    this.aoeR = -1;
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

  /**
   * A flat dashed circle at `radius` (world units, in the XZ plane). Reuses the
   * existing mesh when the radius is unchanged; rebuilds it (disposing the old)
   * only when a different-sized ability is previewed, so a steady hold is
   * allocation-free. Dash count tracks the circumference → constant dash density.
   */
  private dashedRing(
    existing: LinesMesh | null,
    cachedR: number,
    radius: number,
    color: Color3,
    name: string,
  ): LinesMesh {
    if (existing && Math.abs(cachedR - radius) < 0.05) return existing;
    existing?.dispose(false, true);
    const seg = 96;
    const pts: Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const dashNb = Math.max(24, Math.round((2 * Math.PI * radius) / DASH_PITCH));
    const mesh = CreateDashedLines(name, { points: pts, dashSize: 1, gapSize: 1, dashNb }, this.scene);
    mesh.color = color;
    mesh.alpha = 0.85;
    mesh.isPickable = false;
    return mesh;
  }
}
