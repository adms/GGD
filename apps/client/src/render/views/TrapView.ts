import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
/** Shared procedural trap marker. The ring uses the exact authoritative radius. */
export class TrapView {
  readonly root: TransformNode;
  private readonly ring;
  private readonly card;
  private readonly material: StandardMaterial;
  constructor(scene: Scene) {
    this.root = new TransformNode("trap", scene);
    this.material = new StandardMaterial("trapMaterial", scene);
    this.material.disableLighting = true; this.material.backFaceCulling = false;
    this.ring = MeshBuilder.CreateTorus("trapRange", { diameter: 2, thickness: 0.035, tessellation: 48 }, scene);
    this.ring.position.y = 0.04; this.ring.parent = this.root;
    this.card = MeshBuilder.CreateBox("trapCard", { width: 0.6, depth: 0.85, height: 0.04 }, scene);
    this.card.position.y = 0.08; this.card.rotation.y = Math.PI / 4; this.card.parent = this.root;
    for (const mesh of [this.ring, this.card]) { mesh.material = this.material; mesh.isPickable = false; }
    this.root.setEnabled(false);
  }
  activate(radius: number, team: number, armed: boolean): void {
    this.ring.scaling.set(Math.max(0.01, radius), 1, Math.max(0.01, radius));
    this.material.emissiveColor = team === 0 ? new Color3(0.35, 0.65, 1) : team === 1 ? new Color3(1, 0.3, 0.4) : new Color3(0.8, 0.4, 1);
    this.material.alpha = armed ? 0.95 : 0.35;
    this.card.rotation.x = armed ? 0.2 : 0;
    this.root.setEnabled(true);
  }
  setPose(x: number, z: number): void { this.root.position.x = x; this.root.position.z = z; }
  deactivate(): void { this.root.setEnabled(false); }
  dispose(): void { this.root.dispose(); this.material.dispose(); }
}
