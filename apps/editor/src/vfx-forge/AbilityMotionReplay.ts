import type { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { AbilityMotionView, MOTION_PHASE_LABELS } from "../../../client/src/render/views/AbilityMotionView";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
/** Replay only the positions/phases captured from actual SimWorld movement. */
export class AbilityMotionReplay {
  private readonly views = new Map<number, AbilityMotionView>();
  private wall?: Mesh;
  constructor(private readonly scene: Scene) {}
  onEvent(event: EventMessage): void {
    if (event.type === "previewObstacle") {
      const d = event.data;
      if (![d.x, d.z, d.halfW, d.halfD].every(v => typeof v === "number" && Number.isFinite(v))) return;
      if (!this.wall) {
        this.wall = MeshBuilder.CreateBox("previewCollisionWall", { size: 1 }, this.scene);
        const material = new StandardMaterial("previewWallMaterial", this.scene);
        material.diffuseColor = new Color3(0.4, 0.5, 0.65); material.alpha = 0.45;
        this.wall.material = material; this.wall.isPickable = false;
      }
      this.wall.position.set(Number(d.x), 0.5, Number(d.z)); this.wall.scaling.set(Number(d.halfW) * 2, 1, Number(d.halfD) * 2);
      this.wall.setEnabled(true); return;
    }
    if (event.type !== "abilityMotion") return;
    const d = event.data;
    if (![d.id, d.x, d.z, d.fx, d.fz, d.tetherX, d.tetherZ].every(v => typeof v === "number" && Number.isFinite(v)) || typeof d.motionState !== "string") return;
    const id = Number(d.id);
    let view = this.views.get(id);
    if (!view) { view = new AbilityMotionView(this.scene); this.views.set(id, view); }
    view.sync({ motionState: d.motionState, x: Number(d.x), z: Number(d.z), fx: Number(d.fx), fz: Number(d.fz), tetherX: Number(d.tetherX), tetherZ: Number(d.tetherZ) });
  }
  snapshot() {
    return [...this.views].filter(([, view]) => view.root.isEnabled()).map(([id, view]) => ({
      id, state: view.motionState, label: MOTION_PHASE_LABELS[view.motionState] ?? view.motionState,
      x: view.root.position.x, z: view.root.position.z,
    }));
  }
  reset(): void { for (const view of this.views.values()) view.deactivate(); this.wall?.setEnabled(false); }
  dispose(): void { for (const view of this.views.values()) view.dispose(); this.views.clear(); this.wall?.dispose(false, true); }
}
