/**
 * AimIndicator — the ground telegraph for ability aiming AND hold-to-preview.
 *
 *   • DRAG-AIM (touch): a thin ground line for skillshots/dashes (and targeted
 *     hints) or a disc at the drag-projected point for ground casts.
 *   • HOLD-PREVIEW (task #152; touch finger-hold, desktop mouse-hold/HOVER, a
 *     held Q/W/E/R/F/D key, or a pad face button — GH#367): the 技能範圍指引.
 *     A cast-RANGE circle plus an AoE circle centred on the caster, so a player
 *     holding a button sees exactly how far it reaches and how big it lands.
 *
 * ⭐ THE HOLD-PREVIEW LOOK IS OWNER-SPECIFIED (GH#367, 2026-08-18):
 * > 「**特殊顏色框框 + 顏色半透明填滿**」
 * ⇒ each circle is TWO meshes: a translucent filled disc + a solid coloured rim
 * torus. It used to be a dashed outline and nothing else — an outline alone
 * reads as "a line on the floor", and the thing the player actually has to
 * judge is the AREA (am I inside it?), which only a fill answers at a glance.
 * ⛔ Every alpha / colour / thickness here comes from `ui/abilityRangeGuide`,
 * NOT from literals in this file (第一守則: they are 決策點, one 住處).
 *
 * Driven once per frame by the GameApp from a plain `AimIndicatorState` (the
 * touch `touchFrame.indicator`, else a held-slot preview it resolves). Meshes are
 * created lazily and simply toggled/transformed, never re-allocated per frame —
 * the FILL is a unit disc that only ever gets scaled, and the rim torus rebuilds
 * ONLY when the previewed radius actually changes (a new ability), so a steady
 * hold allocates nothing.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AimIndicatorState } from "../input/TouchInput";
import { ABILITY_RANGE_GUIDE, type Rgb01 } from "../ui/abilityRangeGuide";
import { createGroundQuad, placeGroundQuad } from "./groundShapes";

const LINE_WIDTH = 0.4;
const Y = 0.07; // just above the ground plane (telegraphs sit at 0.05/0.06)
/**
 * Stacking order inside the preview, all within 2 cm so nothing ever floats:
 * range fill → range rim → AoE fill → AoE rim. The AoE is drawn ON TOP because
 * it is the smaller circle and the one being aimed; painting the wide range
 * fill over it would wash the amber out to nothing.
 */
const Y_RANGE_FILL = Y;
const Y_RANGE_RIM = Y + 0.005;
const Y_AOE_FILL = Y + 0.01;
const Y_AOE_RIM = Y + 0.015;

/** One circle of the guide: a scaled unit disc + a rim rebuilt on radius change. */
interface GuideCircle {
  fill: Mesh | null;
  rim: Mesh | null;
  /** radius the current rim mesh was BUILT at (-1 = none yet) */
  rimR: number;
}

const emptyCircle = (): GuideCircle => ({ fill: null, rim: null, rimR: -1 });

export class AimIndicator {
  private line: Mesh | null = null;
  private disc: Mesh | null = null;
  // hold-preview circles (task #152 / GH#367)
  private readonly rangeCircle: GuideCircle = emptyCircle();
  private readonly aoeCircle: GuideCircle = emptyCircle();

  constructor(private readonly scene: Scene) {}

  update(state: AimIndicatorState): void {
    const isLine = state?.kind === "line";
    const isDisc = state?.kind === "disc";

    if (state?.kind === "line") {
      const line = (this.line ??= this.makeLine());
      line.setEnabled(true);
      // shared with the #228 telegraph corridor (render/groundShapes)
      placeGroundQuad(line, state.fromX, state.fromZ, state.dirX, state.dirZ, state.length, LINE_WIDTH, Y);
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

    // 技能範圍指引 (GH#367): filled + rimmed cast-range circle and AoE circle,
    // both centred on the caster. `range`/`radius` arrive ALREADY scaled by the
    // live combat-env `abilityRange` factor (GameApp.resolveHoldPreview, #125/#136)
    // — ⛔ this class must never re-derive a reach of its own.
    const guide = state?.kind === "range" ? state : null;
    const at = { x: guide?.x ?? 0, z: guide?.z ?? 0 };
    const rangeR = guide && guide.range > 0.1 ? guide.range : null;
    const aoeR = guide && guide.radius !== null && guide.radius > 0.1 ? guide.radius : null;

    this.paintCircle(this.rangeCircle, "aim-range", rangeR, at, {
      rgb: ABILITY_RANGE_GUIDE.rangeRgb,
      fillAlpha: ABILITY_RANGE_GUIDE.rangeFillAlpha,
      yFill: Y_RANGE_FILL,
      yRim: Y_RANGE_RIM,
    });
    this.paintCircle(this.aoeCircle, "aim-aoe", aoeR, at, {
      rgb: ABILITY_RANGE_GUIDE.aoeRgb,
      fillAlpha: ABILITY_RANGE_GUIDE.aoeFillAlpha,
      yFill: Y_AOE_FILL,
      yRim: Y_AOE_RIM,
    });
  }

  dispose(): void {
    this.line?.dispose(false, true);
    this.disc?.dispose(false, true);
    this.line = null;
    this.disc = null;
    for (const c of [this.rangeCircle, this.aoeCircle]) {
      c.fill?.dispose(false, true);
      c.rim?.dispose(false, true);
      c.fill = null;
      c.rim = null;
      c.rimR = -1;
    }
  }

  /** Drag-aim (touch) line/disc — same blue as the range guide, on purpose. */
  private material(name: string): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.emissiveColor = new Color3(...ABILITY_RANGE_GUIDE.rangeRgb);
    mat.disableLighting = true;
    mat.alpha = 0.45;
    return mat;
  }

  private makeLine(): Mesh {
    // flat on the ground: local +Y → world +Z, then yawed toward the aim dir;
    // the plane is centered, so placeGroundQuad puts it at from + dir·length/2
    const mesh = createGroundQuad(this.scene, "aim-line");
    mesh.material = this.material("aim-line-mat");
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
   * Draw (or hide) one circle of the guide — 「顏色半透明填滿」 + 「特殊顏色框框」.
   * `radius === null` hides it; anything else places both meshes at (x, z).
   *
   * The FILL is a unit disc that is only ever re-SCALED, so changing ability
   * costs nothing. The RIM is rebuilt when the radius changes because its
   * thickness is an ABSOLUTE world width: scaling one torus would make a
   * long-range skill's border as fat as a small skill's whole AoE.
   */
  private paintCircle(
    c: GuideCircle,
    name: string,
    radius: number | null,
    at: { x: number; z: number },
    look: { rgb: Rgb01; fillAlpha: number; yFill: number; yRim: number },
  ): void {
    if (radius === null) {
      c.fill?.setEnabled(false);
      c.rim?.setEnabled(false);
      return;
    }
    const fill = (c.fill ??= this.makeGuideFill(`${name}-fill`, look.rgb, look.fillAlpha));
    fill.setEnabled(true);
    fill.scaling.set(radius, radius, 1);
    fill.position.set(at.x, look.yFill, at.z);

    if (!c.rim || Math.abs(c.rimR - radius) >= 0.05) {
      c.rim?.dispose(false, true);
      c.rim = this.makeGuideRim(`${name}-rim`, radius, look.rgb);
      c.rimR = radius;
    }
    c.rim.setEnabled(true);
    c.rim.position.set(at.x, look.yRim, at.z);
  }

  /** Unit disc lying flat in XZ — the 半透明填滿, scaled to the live radius. */
  private makeGuideFill(name: string, rgb: Rgb01, alpha: number): Mesh {
    const mesh = MeshBuilder.CreateDisc(name, { radius: 1, tessellation: 64 }, this.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.isPickable = false;
    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(...rgb);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alpha = alpha;
    mesh.material = mat;
    return mesh;
  }

  /** Flat torus on XZ — the 「特殊顏色框框」 at constant world thickness. */
  private makeGuideRim(name: string, radius: number, rgb: Rgb01): Mesh {
    const mesh = MeshBuilder.CreateTorus(
      name,
      {
        diameter: radius * 2,
        thickness: ABILITY_RANGE_GUIDE.rimThickness,
        tessellation: 64,
      },
      this.scene,
    );
    mesh.isPickable = false;
    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(...rgb);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alpha = ABILITY_RANGE_GUIDE.rimAlpha;
    mesh.material = mat;
    return mesh;
  }
}
