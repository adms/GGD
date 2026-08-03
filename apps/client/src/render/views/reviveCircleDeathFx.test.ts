/**
 * GH#267 —— 「角色死亡後的特效持續太久」的守衛。
 *
 * 被測的是**出貨的那一個**（失敗形態⑤）：真的 `ReviveCircleView`、真的
 * NullEngine Scene、真的 `Configs.tryGet("vfx-cleanup")` 讀取路徑。測試不呼叫
 * 任何注入用的接縫，也不掃原始碼字串（失敗形態⑥）—— 它把後台文件註冊進去，
 * 然後去**讀最終物件**（`ParticleSystem.emitRate`、材質的 `alpha`）。
 *
 * 斷言的是**機制**不是數字（owner 2026-08-03）：沒有一條斷言抄出貨值。
 * 「燒多久」「剩多亮」都是測試自己註冊進去的，所有期望值都從那份文件推導。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Configs, type ConfigDoc } from "@ggd/shared/content";
import { ReviveCircleView, type ReviveCircleVisualState } from "./ReviveCircleView";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

afterEach(() => {
  Configs.clear();
});

/** 一份後台文件。`burnSec` / `calmScale` 是第二階段要落進 Zod 的那兩格。 */
function installPolicy(burnSec: number, calmScale: number, relight = true): void {
  Configs.register({
    id: "vfx-cleanup",
    schema: "config.vfx-cleanup@1",
    enabled: true,
    purgeSharedPoolsOnRoundEnd: true,
    maxPooledRings: 24,
    deathFxBurnSec: burnSec,
    deathFxCalmScale: calmScale,
    deathFxRelightOnChannel: relight,
  } as unknown as ConfigDoc);
}

const IDLE: ReviveCircleVisualState = { progress: 0.4, channelling: false, contested: false };
const CHANNELLING: ReviveCircleVisualState = { progress: 0.4, channelling: true, contested: false };

/** 同一個 entityId ⇒ 同一個 flicker 相位，兩個 view 才可以逐格比較。 */
const ENTITY_ID = 7;
const BORN_MS = 10_000;

function mkCircle(): ReviveCircleView {
  const v = new ReviveCircleView(scene, "desktop");
  v.activate(ENTITY_ID, 1, 2);
  return v;
}

/** 從 view 的實際渲染樹上撈出地上那圈的材質（讀最終物件，不讀輸入）。 */
function ringAlpha(v: ReviveCircleView): number {
  const mesh = v.root
    .getChildMeshes(false)
    .find((m: AbstractMesh) => m.name.endsWith("-ring"));
  if (!mesh?.material) throw new Error("ring mesh not found");
  return (mesh.material as StandardMaterial).alpha;
}

describe("GH#267 死亡火焰的存續時間是後台可調的", () => {
  it("燒完設定的秒數之後，往天上飄的餘燼真的收斂到設定的比例", () => {
    const CALM = 0.1;
    installPolicy(2, CALM);
    const v = mkCircle();

    v.update(BORN_MS, IDLE); // 第一幀 latch 出生時間
    const hot = v.emberSystem.emitRate;
    expect(hot).toBeGreaterThan(0);

    // 還在燃燒視窗內 —— 一格都沒變
    v.update(BORN_MS + 1_000, IDLE);
    expect(v.emberSystem.emitRate).toBeCloseTo(hot, 6);

    // 遠遠超過視窗 —— 收斂到 calmScale
    v.update(BORN_MS + 60_000, IDLE);
    expect(v.emberSystem.emitRate).toBeCloseTo(hot * CALM, 6);

    v.dispose();
  });

  it("改設定值真的改變存續時間（同一個時刻，長視窗還在燒、短視窗已經收）", () => {
    const T = BORN_MS + 30_000;

    installPolicy(5, 0.1);
    const short = mkCircle();
    short.update(BORN_MS, IDLE);
    const hot = short.emberSystem.emitRate;
    short.update(T, IDLE);
    const shortRate = short.emberSystem.emitRate;

    installPolicy(600, 0.1); // 同一份 view 程式碼，只有後台那一格不同
    const long = mkCircle();
    long.update(BORN_MS, IDLE);
    long.update(T, IDLE);
    const longRate = long.emberSystem.emitRate;

    expect(longRate).toBeCloseTo(hot, 6); // 長視窗：完全沒收
    expect(shortRate).toBeLessThan(longRate * 0.5); // 短視窗：已經收掉

    short.dispose();
    long.dispose();
  });

  it("有人踩進來復活時火立刻燒回全亮（收斂不可以吃掉進度讀取）", () => {
    installPolicy(2, 0.1);
    const v = mkCircle();

    v.update(BORN_MS, CHANNELLING);
    const hot = v.emberSystem.emitRate;

    v.update(BORN_MS + 60_000, IDLE);
    expect(v.emberSystem.emitRate).toBeLessThan(hot * 0.5);

    v.update(BORN_MS + 60_100, CHANNELLING);
    expect(v.emberSystem.emitRate).toBeCloseTo(hot, 6);

    v.dispose();
  });

  it("地上那圈不受收斂影響 —— 它是「這裡還救得回來」的錨點", () => {
    const T = BORN_MS + 30_000;

    installPolicy(600, 0.1); // 永遠燒
    const burning = mkCircle();
    burning.update(BORN_MS, IDLE);
    burning.update(T, IDLE);

    installPolicy(0, 0.1); // 立刻收
    const calmed = mkCircle();
    calmed.update(BORN_MS, IDLE);
    calmed.update(T, IDLE);

    // 火收了……
    expect(calmed.emberSystem.emitRate).toBeLessThan(burning.emberSystem.emitRate * 0.5);
    // ……但同一個時刻、同一個相位下，地上的環一格都沒動
    expect(ringAlpha(calmed)).toBeCloseTo(ringAlpha(burning), 6);

    burning.dispose();
    calmed.dispose();
  });

  it("沒有後台文件時退回出貨預設，而不是 0 或 NaN", () => {
    Configs.clear();
    const v = mkCircle();
    v.update(BORN_MS, IDLE);
    const hot = v.emberSystem.emitRate;
    expect(Number.isFinite(hot)).toBe(true);
    expect(hot).toBeGreaterThan(0);
    v.dispose();
  });
});
