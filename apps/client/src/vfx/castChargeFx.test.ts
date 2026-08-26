/**
 * @visual-proof gh788-cast-charge —— 蓄力集氣：吟唱 ≥ 門檻的施放,隊色細光束
 * 由外向身體內縮。
 *
 * 承重的那一條線（觸發接線）：**castBegin 的授權窗口 → CastPillarFx.begin →
 * 集氣長出來**,而且顏色是 wire 隊伍解析出來的隊色。其餘斷言是靜態可判的
 * 可見性不變量（天譴五層的②:alpha > 0、emissive 非全黑、isEnabled、尺寸非零
 * —— additive 疊全黑/出生 alpha 0 那一族不用 GPU 就判得出來）。
 *
 * ⛔ 出貨數值不住在這裡:門檻/道數全部從 DEFAULT_FEEL_FX 推導,owner 改後台
 * 這支不會用錯誤訊息紅。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DEFAULT_FEEL_FX } from "@ggd/shared/content";
import { TEAM_COLORS } from "../render/views/ChampionView";
import { CastPillarFx } from "./CastPillarFx";
import { pillarPalette } from "./castPillar";
import {
  CastChargeFx,
  CHARGE_CHEST_Y,
  CHARGE_FADE_MS,
  CHARGE_IN_MS,
  NEUTRAL_CHARGE_RGB,
  chargeTravel,
  readCastCharge,
} from "./CastChargeFx";

const TAG = "gh788-cast-charge";
const CC = DEFAULT_FEEL_FX.castCharge!;
const THRESHOLD_MS = CC.minCastSec * 1000;
const FIRE = pillarPalette("fx.prim.fire.nova", null);

let engine: NullEngine;
beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => engine.dispose());

/** 出貨接線的形狀:CastPillarFx 帶著 entityPos + teamOf(wire 的隊伍編號)。 */
function harness(team: number | null = 2): { scene: Scene; fx: CastPillarFx } {
  const scene = new Scene(engine);
  const fx = new CastPillarFx(
    scene,
    { entityPos: () => ({ x: 3, z: -4 }), teamOf: () => team },
    { createTexture: () => null },
  );
  return { scene, fx };
}

/** 光束到胸口 (0, CHEST_Y, 0)（pivot 區域座標）的距離。 */
function distToChest(fx: CastPillarFx, id: number, beamIx: number): number {
  const b = fx.chargeFx!.beamsOf(id)[beamIx]!;
  const dx = b.position.x;
  const dy = b.position.y - CHARGE_CHEST_Y;
  const dz = b.position.z;
  return Math.hypot(dx, dy, dz);
}

describe("觸發接線:施法窗口 → 集氣（隊色）", () => {
  it("吟唱 ≥ 門檻長出集氣,顏色=wire 隊伍解析的隊色,而且真的看得見", () => {
    cover(TAG);
    const { fx } = harness(2);
    fx.begin(7, Math.max(600, THRESHOLD_MS), FIRE, 1000);
    expect(fx.chargeFx!.has(7)).toBe(true);

    // 可見性不變量（靜態可判,不用 GPU）:淡入完成後 alpha > 0、emissive 非全黑
    fx.update(1000 + CHARGE_IN_MS + 20);
    const mat = fx.chargeFx!.materialOf(7)!;
    expect(mat.alpha).toBeGreaterThan(0.05);
    expect(mat.alpha).toBeLessThan(1); // 夾在轉不透明之前 —— 蓋不住施法者
    const team = TEAM_COLORS[2]!;
    expect([mat.emissiveColor.r, mat.emissiveColor.g, mat.emissiveColor.b]).toEqual([...team]);
    const beams = fx.chargeFx!.beamsOf(7);
    expect(beams.length).toBeGreaterThan(0);
    for (const b of beams) {
      expect(b.isEnabled()).toBe(true);
      expect(Number.isFinite(b.position.x + b.position.y + b.position.z)).toBe(true);
    }
    // 至少一道光束當下有非零長度（全部歸零 = 畫面上什麼都沒有）
    expect(Math.max(...beams.map((b) => b.scaling.z))).toBeGreaterThan(0.01);
  });

  it("內縮:同一循環內光束單調靠近身體（集氣的靈魂）", () => {
    cover(TAG);
    const { fx } = harness(0);
    fx.begin(9, 4000, FIRE, 1000);
    // beam 0 的相位是 0:取同一個循環內的三個時刻（< convergeSec）
    const cycleMs = CC.convergeSec * 1000;
    fx.update(1000 + cycleMs * 0.15);
    const d1 = distToChest(fx, 9, 0);
    fx.update(1000 + cycleMs * 0.45);
    const d2 = distToChest(fx, 9, 0);
    fx.update(1000 + cycleMs * 0.8);
    const d3 = distToChest(fx, 9, 0);
    expect(d2).toBeLessThan(d1);
    expect(d3).toBeLessThan(d2);
    // 純函式那一半:行程單調遞增、端點釘死
    expect(chargeTravel(0)).toBe(0);
    expect(chargeTravel(1)).toBe(1);
    expect(chargeTravel(0.3)).toBeLessThan(chargeTravel(0.7));
  });

  it("門檻以下的吟唱沒有集氣;取消即停(打斷 → 短淡出 → 熄)", () => {
    cover(TAG);
    const { fx } = harness(1);
    // 門檻以下(僅在門檻 > 0 時有「以下」可言 —— 出貨 0.3 有)
    if (THRESHOLD_MS > 0) {
      fx.begin(5, THRESHOLD_MS / 2, FIRE, 1000);
      expect(fx.chargeFx!.has(5)).toBe(false);
      expect(fx.has(5)).toBe(true); // 光柱照畫 —— 集氣的門檻不是光柱的
    }
    // 取消即停
    fx.begin(6, 1000, FIRE, 2000);
    fx.update(2000 + CHARGE_IN_MS);
    const bright = fx.chargeFx!.materialOf(6)!.alpha;
    fx.interrupt(6, 2400);
    fx.update(2400 + CHARGE_FADE_MS / 2);
    expect(fx.chargeFx!.materialOf(6)!.alpha).toBeLessThan(bright); // 正在收光
    fx.update(2400 + CHARGE_FADE_MS + 20);
    expect(fx.chargeFx!.has(6)).toBe(false);
    // castEnd 掉包也不會永遠轉下去(兜底)
    fx.begin(8, 500, FIRE, 9000);
    fx.update(9000 + 500 + 5000);
    expect(fx.chargeFx!.has(8)).toBe(false);
  });

  it("查不到隊伍 → 中性色(⛔ 不假設紅藍);後台 enabled=false → 一根都不畫", () => {
    cover(TAG);
    const { fx } = harness(null);
    fx.begin(3, 800, FIRE, 1000);
    const mat = fx.chargeFx!.materialOf(3)!;
    const rgb = [mat.emissiveColor.r, mat.emissiveColor.g, mat.emissiveColor.b];
    expect(rgb).toEqual([...NEUTRAL_CHARGE_RGB]);
    for (const t of TEAM_COLORS) expect(rgb).not.toEqual([...t]);

    // rollback 開關(GH#788 的一格):enabled=false = 逐位元回到功能之前
    const scene = new Scene(engine);
    const off = new CastChargeFx(
      scene,
      { entityPos: () => ({ x: 0, z: 0 }) },
      { readPolicy: () => ({ schema: "config.feel-fx@1", castCharge: { enabled: false } }) },
    );
    off.begin(1, 5000, 0);
    expect(off.has(1)).toBe(false);
    expect(off.slotCount).toBe(0); // 連網格都沒建
    // 政策讀取:壞 override 逐格退回出貨值,界外夾回上下界
    expect(readCastCharge(null)).toEqual(CC);
    expect(readCastCharge({ schema: "config.feel-fx@1", castCharge: { beamCount: 999 } }).beamCount).toBe(24);
  });

  it("預算:同一位施法者重複施放重用同一個 slot,warm-up 後零配置", () => {
    cover(TAG);
    const { scene, fx } = harness(0);
    fx.begin(11, 600, FIRE, 1000);
    fx.finish(11, 1600);
    fx.update(1600 + CHARGE_FADE_MS + 20);
    const meshes = scene.meshes.length;
    const materials = scene.materials.length;
    fx.begin(11, 900, FIRE, 3000);
    fx.update(3100);
    expect(fx.chargeFx!.has(11)).toBe(true);
    expect(fx.chargeFx!.slotCount).toBe(1);
    expect(scene.meshes.length).toBe(meshes);
    expect(scene.materials.length).toBe(materials);
  });
});

/**
 * ⭐ 突變紀錄（承重那一條 —— 內縮方向）:
 * `CastChargeFx.chargeTravel` 的 `return t * t;` 改成 `return (1 - t) * (1 - t);`
 * ⇒ 「內縮:同一循環內光束單調靠近身體」兩組斷言紅(光束變成向外飛散),
 *   端點斷言 chargeTravel(0)=0 也紅。改回後綠。
 */
