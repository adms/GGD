/**
 * NightFlagView — the 暗夜旗 of 71-00 暗夜契約 (EntityState.kind 7, key
 * "prop.night-flag"). Pooled world view, fully procedural: there is no banner
 * asset, and the whole point is the RING, not the pole.
 *
 * owner, 2026-07-30: 「黑色圈圈特效」, and the size of the circle IS the aura
 * radius —— 「這樣玩家看得出來範圍到哪裡，而不只是『有東西發生』」.
 *
 * THREE THINGS THIS FILE REFUSES TO DO, each because of a real past failure:
 *
 *  1. IT NEVER COMPUTES THE RADIUS. The ring is scaled from `radius`, which the
 *     server packs into `EntityState.shield` AFTER the combat-env `abilityRange`
 *     factor. A client that re-derived it from the config doc would drift the
 *     moment an operator changed `nightPact.auraRadius` or the range multiplier
 *     — and a range indicator that disagrees with the rule it indicates is worse
 *     than none. (#22's cautionary tale one step further: the flower was there
 *     and invisible; a wrong ring is there and lying.)
 *  2. IT IS NOT A PARTICLE SYSTEM. `content/vfx/` has no black ring — the
 *     closest families (`fx.fam.shockwave-ring.void.*`) are one-shot ADDITIVE
 *     bursts that fade in ~0.5 s, i.e. exactly wrong for a persistent boundary,
 *     and additive black is invisible by construction (adding 0 changes
 *     nothing). A persistent boundary is geometry, like the revive circle's.
 *  3. IT ALLOCATES NOTHING PER FRAME. All idle motion is `Math.sin(nowMs)`
 *     written into existing vectors/scalars, the ReviveCircleView contract.
 *
 * CLIENT-SIDE RENDER ONLY — nothing here feeds the sim. Flags are server
 * entities, interpolated, never predicted.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

/** Ring geometry is authored at radius 1 and SCALED to the wire radius. */
const REF_RADIUS = 1;
/** Rim thickness as a FRACTION of the radius, so a big ring is not hairline. */
const RIM_FRACTION = 0.055;
/** The shaded interior disc sits just under the rim so they never z-fight. */
const DISC_Y = 0.021;
const RIM_Y = 0.026;

/** 黑夜 — a near-black with a faint violet lean so it reads as night, not a hole. */
const NIGHT_RGB: readonly [number, number, number] = [0.06, 0.045, 0.11];
/** The rim is lifted so the BOUNDARY is the readable part at any zoom. */
const RIM_RGB: readonly [number, number, number] = [0.28, 0.2, 0.42];

const DISC_ALPHA = 0.34;
const RIM_MIN_ALPHA = 0.55;
const RIM_MAX_ALPHA = 0.95;
/** rad/ms — a slow breath, deliberately much calmer than the revive strobe. */
const BEAT_SPEED = 0.0026;

export class NightFlagView {
  readonly root: TransformNode;
  private readonly disc: Mesh;
  private readonly rim: Mesh;
  private readonly discMat: StandardMaterial;
  private readonly rimMat: StandardMaterial;
  private radius = 1;

  constructor(scene: Scene) {
    this.root = new TransformNode("nightFlag", scene);

    this.discMat = new StandardMaterial("nightFlagDisc", scene);
    this.discMat.diffuseColor = new Color3(0, 0, 0);
    this.discMat.emissiveColor = new Color3(...NIGHT_RGB);
    this.discMat.specularColor = new Color3(0, 0, 0);
    this.discMat.alpha = DISC_ALPHA;
    this.discMat.disableLighting = true;
    // NOT additive: black added to the floor is a no-op, which is how a "black
    // ring" ends up invisible. Standard alpha blending darkens instead.
    this.discMat.backFaceCulling = false;

    this.rimMat = new StandardMaterial("nightFlagRim", scene);
    this.rimMat.diffuseColor = new Color3(0, 0, 0);
    this.rimMat.emissiveColor = new Color3(...RIM_RGB);
    this.rimMat.specularColor = new Color3(0, 0, 0);
    this.rimMat.alpha = RIM_MAX_ALPHA;
    this.rimMat.disableLighting = true;
    this.rimMat.backFaceCulling = false;

    this.disc = MeshBuilder.CreateDisc("nightFlagDiscMesh", { radius: REF_RADIUS, tessellation: 48 }, scene);
    this.disc.rotation.x = Math.PI / 2;
    this.disc.position.y = DISC_Y;
    this.disc.material = this.discMat;
    this.disc.isPickable = false;
    this.disc.parent = this.root;

    this.rim = MeshBuilder.CreateTorus(
      "nightFlagRimMesh",
      { diameter: REF_RADIUS * 2, thickness: RIM_FRACTION * 2, tessellation: 48 },
      scene,
    );
    this.rim.position.y = RIM_Y;
    this.rim.material = this.rimMat;
    this.rim.isPickable = false;
    this.rim.parent = this.root;

    this.root.setEnabled(false);
  }

  /**
   * Take this pooled view for `radius` (WORLD UNITS, straight off the wire).
   * A non-positive radius is clamped to a visible minimum rather than silently
   * collapsing the ring to a point — a disarmed/legacy snapshot must still show
   * SOMETHING at the flag rather than nothing at all.
   */
  activate(radius: number): void {
    this.radius = radius > 0 ? radius : 1;
    this.root.scaling.set(this.radius, 1, this.radius);
    this.root.setEnabled(true);
  }

  deactivate(): void {
    this.root.setEnabled(false);
  }

  setPose(x: number, z: number): void {
    this.root.position.x = x;
    this.root.position.z = z;
  }

  /** The authoritative radius this view is currently drawn at (tests + HUD). */
  currentRadius(): number {
    return this.radius;
  }

  /** Per-frame breath. No allocation; `nowMs` is the shared frame clock. */
  update(nowMs: number): void {
    const beat = 0.5 + 0.5 * Math.sin(nowMs * BEAT_SPEED);
    this.rimMat.alpha = RIM_MIN_ALPHA + (RIM_MAX_ALPHA - RIM_MIN_ALPHA) * beat;
  }

  dispose(): void {
    this.disc.dispose();
    this.rim.dispose();
    this.discMat.dispose();
    this.rimMat.dispose();
    this.root.dispose();
  }
}
