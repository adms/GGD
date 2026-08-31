import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";

/** Client-only payload synthesized by VfxScriptPlayer. It never enters SimWorld. */
export interface ScriptBeamEvent {
  x: number;
  z: number;
  dx: number;
  dz: number;
  lengthU: number;
  widthU: number;
  heightU: number;
  pitchDeg: number;
  travelU: number;
  durationSec: number;
  colorRgb: readonly [number, number, number];
  alpha: number;
}

interface LiveBeam {
  root: TransformNode;
  core: Mesh;
  glow: Mesh;
  muzzle: Mesh;
  coreMat: StandardMaterial;
  glowMat: StandardMaterial;
  muzzleMat: StandardMaterial;
  bornMs: number;
  untilMs: number;
  alpha: number;
  startX: number;
  startZ: number;
  dx: number;
  dz: number;
  travelU: number;
}

const rgb = (c: readonly [number, number, number]): Color3 =>
  new Color3(c[0] / 255, c[1] / 255, c[2] / 255);

/**
 * A deterministic horizontal beam for authored VFX scripts.
 *
 * Imported WC3 pillar models cannot reliably express this: their long axis and
 * baked material differ per asset, and tinting a yellow baked texture does not
 * make a blue Kamehameha. This renderer owns only emissive geometry; gameplay
 * distance, collision and damage remain in the ability effect graph.
 */
export class ScriptBeamFx {
  private readonly live: LiveBeam[] = [];

  constructor(private readonly scene: Scene) {}

  spawn(spec: ScriptBeamEvent, nowMs: number): void {
    const length = Math.max(0.1, spec.lengthU);
    const width = Math.max(0.05, spec.widthU);
    const dLen = Math.hypot(spec.dx, spec.dz);
    const dx = dLen > 1e-6 ? spec.dx / dLen : 0;
    const dz = dLen > 1e-6 ? spec.dz / dLen : 1;
    const root = new TransformNode("vfx-script-beam", this.scene);
    root.position.set(spec.x, spec.heightU, spec.z);
    root.rotation.y = Math.atan2(dx, dz);
    root.rotation.x = (spec.pitchDeg * Math.PI) / 180;

    const color = rgb(spec.colorRgb);
    const coreMat = this.material("vfx-script-beam-core", Color3.White(), Math.min(1, spec.alpha));
    const glowMat = this.material("vfx-script-beam-glow", color, Math.min(0.34, spec.alpha * 0.34));
    const muzzleMat = this.material("vfx-script-beam-muzzle", color, Math.min(0.72, spec.alpha * 0.72));

    const core = MeshBuilder.CreateCylinder(
      "vfx-script-beam-core-mesh",
      { height: length, diameter: width * 0.42, tessellation: 16 },
      this.scene,
    );
    core.rotation.x = Math.PI / 2;
    core.position.z = length / 2;
    core.material = coreMat;
    core.isPickable = false;
    core.parent = root;

    const glow = MeshBuilder.CreateCylinder(
      "vfx-script-beam-glow-mesh",
      { height: length, diameter: width, tessellation: 20 },
      this.scene,
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.z = length / 2;
    glow.material = glowMat;
    glow.isPickable = false;
    glow.parent = root;

    const muzzle = MeshBuilder.CreateSphere(
      "vfx-script-beam-muzzle-mesh",
      { diameter: width * 1.35, segments: 12 },
      this.scene,
    );
    muzzle.material = muzzleMat;
    muzzle.isPickable = false;
    muzzle.parent = root;

    this.live.push({
      root,
      core,
      glow,
      muzzle,
      coreMat,
      glowMat,
      muzzleMat,
      bornMs: nowMs,
      untilMs: nowMs + spec.durationSec * 1000,
      alpha: spec.alpha,
      startX: spec.x,
      startZ: spec.z,
      dx,
      dz,
      travelU: spec.travelU,
    });
  }

  update(nowMs: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const beam = this.live[i]!;
      if (nowMs >= beam.untilMs) {
        this.disposeOne(beam);
        this.live.splice(i, 1);
        continue;
      }
      const span = Math.max(1, beam.untilMs - beam.bornMs);
      const t = (nowMs - beam.bornMs) / span;
      const travel = beam.travelU * Math.min(1, t / 0.85);
      beam.root.position.x = beam.startX + beam.dx * travel;
      beam.root.position.z = beam.startZ + beam.dz * travel;
      const fade = t < 0.78 ? Math.min(1, t / 0.08) : Math.max(0, (1 - t) / 0.22);
      beam.coreMat.alpha = beam.alpha * fade;
      beam.glowMat.alpha = Math.min(0.34, beam.alpha * 0.34) * fade;
      beam.muzzleMat.alpha = Math.min(0.72, beam.alpha * 0.72) * fade;
      const pulse = 0.92 + Math.sin(t * Math.PI * 8) * 0.08;
      beam.glow.scaling.set(pulse, 1, pulse);
      beam.muzzle.scaling.setAll(0.94 + Math.sin(t * Math.PI * 10) * 0.08);
    }
  }

  clear(): void {
    for (const beam of this.live) this.disposeOne(beam);
    this.live.length = 0;
  }

  dispose(): void {
    this.clear();
  }

  private material(name: string, color: Color3, alpha: number): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = color;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alpha = alpha;
    return mat;
  }

  private disposeOne(beam: LiveBeam): void {
    beam.core.dispose();
    beam.glow.dispose();
    beam.muzzle.dispose();
    beam.coreMat.dispose();
    beam.glowMat.dispose();
    beam.muzzleMat.dispose();
    beam.root.dispose();
  }
}
