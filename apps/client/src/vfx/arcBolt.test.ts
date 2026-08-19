/**
 * ⚡ 一段電弧的守衛 —— **接線類，一條薄的，一次突變**（CLAUDE.md 第零守則 ③/⑦）。
 *
 * 只問兩件玩家看得出來的事：
 *   ① **要求一段弧 → 場上真的多了一條會發光的網格，而且它連在 A 與 B 之間。**
 *      斷言讀 `scene.meshes` 上真的存在的 Babylon 物件與它的**頂點範圍**，
 *      ⛔ 不讀 `ArcBoltFx` 自家的計數器（失敗形態 ⑦：掃屬性代替掃行為）。
 *   ② **它會被回收。** 一跳一閃：壽命到了要熄掉、重複打不會讓池子無限長、
 *      回合邊界要清乾淨、離場要歸零（#262 的前科就是這一條沒關）。
 *
 * ⛔ 沒有任何斷言抄出貨數值（第二守則）：壽命從 spec 自己讀回來，
 * 上限從 `ARC_BOLT_TUNING` 推導。owner 調參數這個檔案不會紅。
 *
 * 突變驗證：`VfxSystem.strikeArc()` 裡的 `return this.arcs.strike(...)` 改成
 * `return 0` → ①「vfxArc 事件會長出一條弧」紅。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VfxSystem } from "./VfxSystem";
import { arcBoltSpec } from "./arcBolt";

let engine: NullEngine;
let scene: Scene;
let fx: VfxSystem;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  fx = new VfxSystem(scene, { entityPos: () => null });
});
afterEach(() => {
  fx.dispose();
  scene.dispose();
  engine.dispose();
});

/** 場上真的看得到的弧帶（啟用中的 ribbon 網格）。 */
function liveArcs(): number {
  return scene.meshes.filter((m) => m.name.startsWith("vfx-arc") && m.isEnabled()).length;
}

const A = { x: -2, z: 1 };
const B = { x: 3, z: -1.5 };

function fire(nowMs: number): void {
  fx.handleEvent(
    { type: "vfxArc", tick: 0, data: { fromX: A.x, fromZ: A.z, toX: B.x, toZ: B.z, seed: 7 } },
    nowMs,
  );
}

describe("一段電弧：A → B", () => {
  it("① vfxArc 事件會長出一條真的連在兩端之間的弧", () => {
    expect(liveArcs()).toBe(0);
    fire(0);
    expect(liveArcs()).toBeGreaterThan(0);

    // 幾何:主幹的頂點必須橫跨 A→B。⛔ 不是「有一個網格」而已 ——
    // 一條長在原點的弧會通過那個斷言,卻完全沒有打到目標。
    const main = scene.meshes.find((m) => m.name.startsWith("vfx-arc") && m.isEnabled())!;
    const pos = main.getVerticesData(VertexBuffer.PositionKind)!;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]!);
      maxX = Math.max(maxX, pos[i]!);
    }
    expect(minX).toBeLessThan(A.x + 0.5);
    expect(maxX).toBeGreaterThan(B.x - 0.5);
  });

  it("② 一跳一閃:壽命到了熄掉、重複打不會讓池子長大、回合邊界清乾淨", () => {
    const lifeMs = arcBoltSpec().lifeMs; // 從參數表讀,⛔ 不抄字面值
    fire(0);
    fx.update(lifeMs * 0.5);
    expect(liveArcs()).toBeGreaterThan(0); // 還在燒
    fx.update(lifeMs + 1);
    expect(liveArcs()).toBe(0); // 熄了

    // 重複打 40 次 —— 網格被**重用**,場上的總數不會單調成長
    const after1 = scene.meshes.length;
    for (let i = 0; i < 40; i++) {
      fire(1000 + i * (lifeMs + 1));
      fx.update(1000 + i * (lifeMs + 1) + lifeMs + 1);
    }
    expect(scene.meshes.length).toBe(after1);

    fire(9000);
    fx.resetForRound();
    expect(liveArcs()).toBe(0); // 上一回合的電不會跟著進商店
  });
});
