import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

/** The gameplay boundary is authoritative. Model-specific stand/hand effects
 * remain ordinary authored VFX; this view only shows the temporal field. */
export class TimeStopView {
  readonly root: TransformNode;
  private readonly ring;
  private readonly disc;
  private readonly rimMaterial: StandardMaterial;
  private readonly fillMaterial: StandardMaterial;
  constructor(scene: Scene) {
    this.root = new TransformNode("timeStop", scene);
    this.rimMaterial = new StandardMaterial("timeStopRim", scene);
    this.fillMaterial = new StandardMaterial("timeStopFill", scene);
    for (const m of [this.rimMaterial, this.fillMaterial]) {
      m.disableLighting = true; m.backFaceCulling = false; m.emissiveColor = new Color3(.7, .7, .76);
    }
    this.rimMaterial.alpha = .9; this.fillMaterial.alpha = .15;
    this.ring = MeshBuilder.CreateTorus("timeStopBoundary", { diameter: 2, thickness: .025, tessellation: 64 }, scene);
    this.disc = MeshBuilder.CreateDisc("timeStopInterior", { radius: 1, tessellation: 64 }, scene);
    this.disc.rotation.x = Math.PI / 2;
    this.ring.material = this.rimMaterial; this.disc.material = this.fillMaterial;
    for (const mesh of [this.ring, this.disc]) { mesh.parent = this.root; mesh.position.y = .045; mesh.isPickable = false; }
    this.root.setEnabled(false);
  }
  activate(radius: number): void {
    this.ring.scaling.set(radius, 1, radius); this.disc.scaling.set(radius, radius, 1);
    this.root.setEnabled(true);
  }
  setPose(x: number, z: number): void { this.root.position.x = x; this.root.position.z = z; }
  deactivate(): void { this.root.setEnabled(false); }
  dispose(): void { this.root.dispose(); this.rimMaterial.dispose(); this.fillMaterial.dispose(); }
}
