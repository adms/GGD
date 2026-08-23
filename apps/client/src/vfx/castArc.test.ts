/**
 * ⚡ GH#571 —— 「一堆閃電特效**都沒有真的出現**」的**第二半**。
 *
 * owner 2026-08-23:「你需要認真找一個**演算法以及特效貼圖**來做出閃電的效果
 * 一堆閃電特效如 **皮卡丘 飛鼠先生 雷神之槌** 等雷電特效 都沒有真的出現」。
 *
 * 第一半（`chainLightningArc.test.ts`）接的是**連鎖**那一種，而它只涵蓋出貨 28 支
 * 雷電技能裡的 2 支（86-04 打雷絕招 / 65-04 天譴＝飛鼠先生）。其餘 26 支的「閃電」
 * 逐字只是一份 `fx.prim.lightning.*` 的**粒子預設** —— 粒子做不出一道有分岔的
 * 鋸齒電弧，所以 owner 點名的另外兩個例子（**雷神之槌** 15-01、**皮卡丘** 58-04）
 * 到 `arcCastPlan` 出現之前一道弧都沒有。
 *
 * ⭐ 這裡跑的是**出貨的那兩支技能的 JSON**（`content/abilities/` 讀進真的
 * `Abilities` 登錄表），⛔ 不是手寫的夾具 —— 失敗形態⑤（被測的不是出貨的那個）
 * 正是這一族的前科：家族規則掛在 `vfxKey` 的 token 上，而**出貨的 token 長什麼樣
 * 只有出貨的檔案知道**（雷神之槌的閃電根本不在頂層 `vfxKey`，它在第二層）。
 *
 * ⛔ 沒有任何斷言抄出貨數值（第二守則）：道數／長度／顏色全部從 `ARC_CAST_*`
 * 那張表推導，owner 調參數這個檔案不會紅。
 *
 * 突變驗證：`VfxSystem.handleEvent` 的 `case "abilityCast"` 裡那一段
 * `for (const req of arcCastPlan(...)) this.strikeArc(...)` 刪掉 → ①② 全紅
 * （場上零條弧）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSystem } from "./VfxSystem";
import { ARC_CAST_SHAPES } from "./arcBolt";

/** 出貨的那一份 JSON，⛔ 不是我在這裡重打一份。 */
function shipped(id: string): void {
  const p = fileURLToPath(new URL(`../../../../content/abilities/${id}.json`, import.meta.url));
  const doc = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
  Abilities.register(id as AbilityId, doc as never);
}

const CASTER = 7;
const AT = { x: 1.5, z: -2 };

let engine: NullEngine;
let scene: Scene;
let fx: VfxSystem;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  fx = new VfxSystem(scene, { entityPos: (id) => (id === CASTER ? AT : null) });
});
afterEach(() => {
  fx.dispose();
  scene.dispose();
  engine.dispose();
});

/** `sim/abilities/abilitySystem.ts` 的 `world.emit("abilityCast", …)` 逐欄位。 */
function cast(abilityId: string, point?: { x: number; z: number }): void {
  const ev: EventMessage = {
    type: "abilityCast",
    tick: 3,
    data: { caster: CASTER, slot: "Q", abilityId, ...(point ? { point } : {}) },
  };
  fx.handleEvent(ev, 0);
}

/** 場上真的看得到的弧帶（⛔ 不讀 `ArcBoltFx` 自家的計數器 —— 失敗形態⑦）。 */
function arcMeshes() {
  return scene.meshes.filter((m) => m.name.startsWith("vfx-arc") && m.isEnabled());
}

/** 一條弧帶的 xz 頂點範圍。 */
function extent(m: (typeof scene.meshes)[number]) {
  const p = m.getVerticesData(VertexBuffer.PositionKind)!;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]!);
    maxX = Math.max(maxX, p[i]!);
    minZ = Math.min(minZ, p[i + 2]!);
    maxZ = Math.max(maxZ, p[i + 2]!);
  }
  return { minX, maxX, minZ, maxZ };
}

describe("⚡ 施法電弧 —— 出貨的雷電技能按下去,場上真的有一道電弧", () => {
  it("① 雷神之槌（15-01 雷神槍「巨神殺手」）的弧真的從施法者拉到落點", () => {
    shipped("godie-emfr.q");
    expect(arcMeshes()).toHaveLength(0);

    const point = { x: AT.x + 5, z: AT.z + 1 };
    cast("godie-emfr.q", point);

    const meshes = arcMeshes();
    expect(meshes.length, "零條弧 = 這一族的閃電在遊戲裡不存在").toBeGreaterThan(0);

    // 幾何:一定要有一條**橫跨兩端**的主幹。⛔ 不是「有網格」而已 ——
    // 一條長在原地的弧會通過那個斷言,而畫面上完全讀不出「打到那裡」。
    const span = Math.hypot(point.x - AT.x, point.z - AT.z);
    const main = meshes
      .map(extent)
      .find((e) => e.maxX - e.minX >= span * 0.9 && e.minX <= AT.x + 1e-6);
    expect(main, "沒有任何一條弧橫跨施法者→落點 = 它沒有打到目標").toBeDefined();
    expect(main!.maxX).toBeGreaterThanOrEqual(point.x - 1e-6);
  });

  it("② 皮卡丘（58-04 瘋狂皮卡丘,自身型）從身上炸開好幾道,⛔ 不是一道長度 0 的弧", () => {
    shipped("godie-ofar.r");
    // 自身型的 `abilityCast` 本來就不帶 `point` —— 那正是這 12 支在此之前
    // 一道弧都沒有的原因（沒有第二個端點就等於「不畫」）。
    cast("godie-ofar.r");

    const meshes = arcMeshes();
    const burst = ARC_CAST_SHAPES["explosion"]!;
    expect(burst.mode).toBe("burst"); // 表改了模式,這條測試要跟著換問題
    expect(meshes.length, "自身型雷電技能一道弧都沒有").toBeGreaterThanOrEqual(burst.count);

    // 它們要**往不同方向**散開 —— N 道疊在同一條線上,畫面上就是一道。
    const dirs = new Set(
      meshes.map((m) => {
        const e = extent(m);
        return `${Math.sign((e.minX + e.maxX) / 2 - AT.x)}|${Math.sign((e.minZ + e.maxZ) / 2 - AT.z)}`;
      }),
    );
    expect(dirs.size, "每一道都指向同一邊 = 那不是炸開,是一坨").toBeGreaterThan(1);
  });

  it("③ ⛔ 不是每一支技能都變成閃電 —— 表上沒有的元素一道弧都不畫", () => {
    shipped("godie-udea.q"); // 65-01 神出鬼沒:`fx.prim.arcane.pulse-sm`
    cast("godie-udea.q", { x: AT.x + 5, z: AT.z });
    expect(arcMeshes(), "奧術技能長出電弧 = 家族規則的範圍失控了").toHaveLength(0);
  });
});
