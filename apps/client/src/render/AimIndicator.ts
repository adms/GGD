/**
 * AimIndicator — the ground telegraph for ability aiming AND hold-to-preview.
 *
 *   • DRAG-AIM (touch): a thin ground line for skillshots/dashes (and targeted
 *     hints) or a disc at the drag-projected point for ground casts.
 *   • HOLD-PREVIEW (task #152; touch finger-hold, desktop mouse-hold/HOVER, a
 *     held Q/W/E/R/F/D key, or a pad face button — GH#367): the 技能範圍指引.
 *     A cast-RANGE circle centred on the CASTER plus an AoE circle centred on
 *     WHERE THE SHOT LANDS (GH#415), so a player holding a button sees both how
 *     far it reaches and where the blast will actually be.
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
import type { TargetMarkerState } from "./views/targetMarker";

const LINE_WIDTH = 0.4;
const Y = 0.07; // just above the ground plane (telegraphs sit at 0.05/0.06)
/**
 * Stacking order inside the preview, all within 2 cm so nothing ever floats:
 * range fill → range rim → AoE fill → AoE rim. The AoE is drawn ON TOP because
 * it is the smaller circle and the one being aimed; painting the wide range
 * fill over it would wash the amber out to nothing.
 */
/** One step of the stack. ⛔ 每一層都從它推導，不要再打第二次 0.005。 */
const LAYER = 0.005;
const Y_RANGE_FILL = Y;
const Y_RANGE_RIM = Y + LAYER;
const Y_AOE_FILL = Y + LAYER * 2;
const Y_AOE_RIM = Y + LAYER * 3;

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
  /** 手把軟鎖定的「這一發會打誰」環（GH#519）。 */
  private readonly targetCircle: GuideCircle = emptyCircle();

  constructor(private readonly scene: Scene) {}

  /**
   * @param target 手把軟鎖定到的那個人的腳下環（GH#519），null = 沒鎖到任何人。
   *   ⚠️ 它**與 `state` 無關**：`AimIndicatorState` 是「這一發打去哪」，這一格是
   *   「這一發打**誰**」。⛔ 不把它塞進那個 union —— 那個 union 是觸控與滑鼠共用的，
   *   而軟鎖定只有手把有，多出來的五個 nullable 欄位對另外兩條路永遠是 null。
   */
  update(state: AimIndicatorState, target: TargetMarkerState | null = null): void {
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

    // 技能範圍指引 (GH#367): filled + rimmed cast-range circle and AoE circle.
    // `range`/`radius` arrive ALREADY scaled by the live combat-env `abilityRange`
    // factor (GameApp.resolveHoldPreview, #125/#136) — ⛔ this class must never
    // re-derive a reach of its own.
    //
    // ⭐ GH#415 —— TWO CENTRES, not one:
    //   · cast-RANGE circle → the CASTER (`x`/`z`). That circle answers「我能打多遠」.
    //   · AoE circle        → THE LANDING POINT (`aoeX`/`aoeZ`, already clamped to
    //     range by `resolveAoeCenter`). That circle answers「這一發會炸到哪」.
    // ⛔ Painting the AoE at the caster (what this did until 2026-08-19) draws a
    // circle in a place nothing will happen, and players position themselves by it.
    const guide = state?.kind === "range" ? state : null;
    const at = { x: guide?.x ?? 0, z: guide?.z ?? 0 };
    const rangeR = guide && guide.range > 0.1 ? guide.range : null;
    // ⚠️ no landing point (skillshot corridor / no valid target) = NO AoE circle.
    //    ⛔ Do not fall back to the caster — that is the exact lie being fixed.
    const hasAoeAt = guide?.aoeX !== null && guide?.aoeX !== undefined && guide.aoeZ !== null;
    const aoeR = guide && hasAoeAt && guide.radius !== null && guide.radius > 0.1 ? guide.radius : null;
    const aoeAt = { x: guide?.aoeX ?? 0, z: guide?.aoeZ ?? 0 };

    this.paintCircle(this.rangeCircle, "aim-range", rangeR, at, {
      rgb: ABILITY_RANGE_GUIDE.rangeRgb,
      fillAlpha: ABILITY_RANGE_GUIDE.rangeFillAlpha,
      yFill: Y_RANGE_FILL,
      yRim: Y_RANGE_RIM,
    });
    this.paintCircle(this.aoeCircle, "aim-aoe", aoeR, aoeAt, {
      rgb: ABILITY_RANGE_GUIDE.aoeRgb,
      fillAlpha: ABILITY_RANGE_GUIDE.aoeFillAlpha,
      yFill: Y_AOE_FILL,
      yRim: Y_AOE_RIM,
    });

    // ⭐ GH#519 ——「這一發會打**誰**」。純手把玩家沒有游標：`nearestEnemy` 挑完
    // 直接送出，於是人堆裡他按下去才知道打錯人。這個環是那個答案。
    // ⛔ 它不是第三種指引，是**同一支 `paintCircle`** 的第三次呼叫（issue 明說
    // 「復用 AimIndicator，⛔ 不要另做一套渲染」）。
    //
    // 顏色/透明度/粗細一格都不是這裡發明的：`rgb`/`alpha` 走 `paletteFor(relation)`
    // （敵紅友綠，`config.range-guide@1` 的後台欄位），`rimThickness` 同一份文件同一格。
    // 高度走 marker 自己的 `y` —— 它被夾在自己人光環之上、瞄準指引之下，
    // 所以鎖到自己時兩個環不會疊成一個（失敗形態①）。
    this.paintCircle(
      this.targetCircle,
      "aim-target",
      target ? target.diameter / 2 : null,
      { x: target?.x ?? 0, z: target?.z ?? 0 },
      {
        rgb: target?.rgb ?? ABILITY_RANGE_GUIDE.aoeRgb,
        // ⚠️ 填色走 AoE 那一格的**半透明**值，⛔ 不是 `target.alpha` ——
        // 後者是預告環的峰值不透明度（≈1.0），拿去填一個腳下的圓盤會把角色的
        // 下半身糊掉。`alpha` 的正確去處是**框**（下面那一行）。
        fillAlpha: ABILITY_RANGE_GUIDE.aoeFillAlpha,
        yFill: target?.y ?? Y,
        yRim: (target?.y ?? Y) + LAYER,
        rimAlpha: target?.alpha,
        rimThickness: target?.rimThickness,
      },
    );
  }

  dispose(): void {
    this.line?.dispose(false, true);
    this.disc?.dispose(false, true);
    this.line = null;
    this.disc = null;
    for (const c of [this.rangeCircle, this.aoeCircle, this.targetCircle]) {
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
    look: {
      rgb: Rgb01;
      fillAlpha: number;
      yFill: number;
      yRim: number;
      /** 框的不透明度。省略 = 範圍指引的那一格（出貨兩個圈都用它）。 */
      rimAlpha?: number;
      /** 框的世界寬度。省略 = 範圍指引的那一格。 */
      rimThickness?: number;
    },
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
      c.rim = this.makeGuideRim(`${name}-rim`, radius, look.rgb, look.rimAlpha, look.rimThickness);
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
  private makeGuideRim(
    name: string,
    radius: number,
    rgb: Rgb01,
    alpha = ABILITY_RANGE_GUIDE.rimAlpha,
    thickness = ABILITY_RANGE_GUIDE.rimThickness,
  ): Mesh {
    const mesh = MeshBuilder.CreateTorus(
      name,
      {
        diameter: radius * 2,
        thickness,
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
    mat.alpha = alpha;
    mesh.material = mat;
    return mesh;
  }
}
