import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface MotionPose { motionState: string; x: number; z: number; fx: number; fz: number; tetherX?: number; tetherZ?: number }
export const MOTION_PHASE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  accelerating: "加速", cruising: "滑行", turning: "急轉", braking: "煞車", collision: "碰撞停止", stopped: "停止", pulling: "牽引",
});
const COLORS: Readonly<Record<string, Color3>> = {
  accelerating: new Color3(0.1, 0.45, 1), cruising: new Color3(0, 0.9, 1), turning: new Color3(1, 0.5, 0.1),
  braking: new Color3(1, 0.85, 0.1), collision: new Color3(1, 0.12, 0.1), stopped: new Color3(0.4, 0.5, 0.6), pulling: new Color3(0.75, 0.8, 1),
};
/** Gameplay state marker and tether shared by the live client and Forge replay. */
export class AbilityMotionView {
  readonly root: TransformNode;
  readonly board: TransformNode;
  readonly rope;
  readonly material: StandardMaterial;
  constructor(scene: Scene) {
    this.root = new TransformNode("abilityMotion", scene);
    this.board = new TransformNode("driveBoard", scene); this.board.parent = this.root;
    this.material = new StandardMaterial("motionStateColor", scene); this.material.disableLighting = true;
    const deck = MeshBuilder.CreateBox("driveDeck", { width: 0.45, depth: 0.95, height: 0.045 }, scene);
    deck.parent = this.board; deck.position.y = 0.13; deck.material = this.material; deck.isPickable = false;
    for (const x of [-0.21, 0.21]) for (const z of [-0.3, 0.3]) {
      const wheel = MeshBuilder.CreateCylinder("driveWheel", { diameter: 0.12, height: 0.08, tessellation: 10 }, scene);
      wheel.parent = this.board; wheel.position.set(x, 0.06, z); wheel.rotation.z = Math.PI / 2; wheel.material = this.material; wheel.isPickable = false;
    }
    this.rope = MeshBuilder.CreateLines("grappleTether", { points: [Vector3.Zero(), Vector3.Zero()], updatable: true }, scene);
    this.rope.parent = this.root; this.rope.isPickable = false; this.rope.color = COLORS.pulling!;
    this.root.setEnabled(false);
  }
  sync(pose: MotionPose): void {
    const color = COLORS[pose.motionState];
    this.root.setEnabled(!!color);
    if (!color) return;
    this.root.position.set(pose.x, 0, pose.z);
    this.material.emissiveColor = color;
    const pulling = pose.motionState === "pulling";
    this.board.setEnabled(!pulling); this.rope.setEnabled(pulling);
    this.board.rotation.y = Math.atan2(pose.fx, pose.fz);
    if (pulling) MeshBuilder.CreateLines("grappleTether", { instance: this.rope,
      points: [new Vector3(0, 0.45, 0), new Vector3((pose.tetherX ?? pose.x) - pose.x, 0.45, (pose.tetherZ ?? pose.z) - pose.z)] });
  }
  deactivate(): void { this.root.setEnabled(false); }
  dispose(): void { this.root.dispose(); this.material.dispose(); }
}
