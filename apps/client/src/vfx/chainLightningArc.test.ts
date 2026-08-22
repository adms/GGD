/**
 * ⚡ GH#571 —— 「一堆閃電特效**都沒有真的出現**」的**一條**承重守衛。
 *
 * owner 2026-08-23:「你需要認真找一個**演算法以及特效貼圖**來做出閃電的效果
 * 一堆閃電特效如 皮卡丘 飛鼠先生 雷神之槌 等雷電特效 都沒有真的出現」。
 *
 * 缺陷不是「沒有演算法」——`arcBolt`/`ArcBoltFx` 早就在了。缺陷是 **sim 發的是
 * `chainLightning`,而客戶端唯一的入口是 `vfxArc`**,兩個名字從來沒接上
 * (`eventFanout.ts` 自己的註解逐字記著這件事)。所以這裡只問票上那兩件事:
 *
 *   ① **一則 `chainLightning` 事件 ⇒ 場上真的長出一條弧**,而且它連在
 *      施法者與目標之間(讀真的 Babylon 頂點,⛔ 不讀自家計數器/不 grep 原始碼)。
 *   ② **它真的在抖**:同一發閃電在**兩個不同的幀**上折線頂點**不一樣**,
 *      而**兩端一個位元都沒動** —— 一條會脫靶的閃電比沒有閃電更糟。
 *
 * ⛔ 沒有任何斷言抄出貨數值(第二守則):重抖的時間窗從 `ARC_BOLT_TUNING.rejitterHz`
 * 推導,owner 調參數這個檔案不會紅。
 *
 * 突變驗證:`VfxSystem.handleEvent` 的 `case "chainLightning"` 裡那一行
 * `this.strikeArc(...)` 刪掉 → ① 紅(場上零條弧)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VfxSystem } from "./VfxSystem";
import { ARC_BOLT_TUNING } from "./arcBolt";

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

const FROM = { x: -3, z: 2 };
const TO = { x: 4, z: -1 };

/** 一跳 = sim 真的送出來的那個形狀(`sim/effects/chainLightning.ts` 的 emit)。 */
function hop(nowMs: number): void {
  fx.handleEvent(
    {
      type: "chainLightning",
      tick: 5,
      data: {
        caster: 1,
        chains: 1,
        hits: 1,
        segments: [{ x: FROM.x, z: FROM.z, x2: TO.x, z2: TO.z }],
      },
    },
    nowMs,
  );
}

/** 主幹 = X 跨距最大的那一條(分岔只有主幹的 forkLength 那麼長)。 */
function mainArc() {
  let best: { mesh: import("@babylonjs/core/Meshes/mesh").Mesh; span: number } | null = null;
  for (const m of scene.meshes) {
    if (!m.name.startsWith("vfx-arc") || !m.isEnabled()) continue;
    const p = m.getVerticesData(VertexBuffer.PositionKind);
    if (!p) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      lo = Math.min(lo, p[i]!);
      hi = Math.max(hi, p[i]!);
    }
    if (!best || hi - lo > best.span) best = { mesh: m as never, span: hi - lo };
  }
  return best?.mesh ?? null;
}

/**
 * 折線的第 k 個節點 = 弧帶左右兩條 path 同一格的**中點**。
 * `CreateRibbon([left, right])` 先排完 left 再排 right,所以右邊那一格差 3n。
 */
function node(pos: ArrayLike<number>, k: number): [number, number, number] {
  const n = pos.length / 3 / 2;
  const i = k < 0 ? n + k : k;
  const l = i * 3;
  const r = (n + i) * 3;
  return [
    (pos[l]! + pos[r]!) / 2,
    (pos[l + 1]! + pos[r + 1]!) / 2,
    (pos[l + 2]! + pos[r + 2]!) / 2,
  ];
}

describe("⚡ chainLightning → 場上真的有一道會抖的閃電", () => {
  it("① sim 的一跳事件長出一條連在兩端之間的弧", () => {
    expect(mainArc()).toBeNull();
    hop(0);
    const mesh = mainArc();
    expect(mesh, "沒有任何弧 = 事件沒有消費端,整族閃電等於不存在").not.toBeNull();

    const pos = mesh!.getVerticesData(VertexBuffer.PositionKind)!;
    const head = node(pos, 0);
    const tail = node(pos, -1);
    expect(head[0]).toBeCloseTo(FROM.x, 6);
    expect(head[2]).toBeCloseTo(FROM.z, 6);
    expect(tail[0]).toBeCloseTo(TO.x, 6);
    expect(tail[2]).toBeCloseTo(TO.z, 6);
  });

  it("② 它真的在抖 —— 中段每一格時間窗換一條折線,而兩端釘死不動", () => {
    hop(0);
    const mesh = mainArc()!;
    const first = Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!);

    // 剛好跨過一個重抖窗(從參數表推導,⛔ 不抄字面值)
    const stepMs = 1000 / ARC_BOLT_TUNING.rejitterHz;
    fx.update(stepMs * 1.5);
    const second = Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!);

    expect(second, "兩幀之間一個頂點都沒動 = 它是一條畫好的亮線,不是電").not.toEqual(first);
    // ⭐ 但兩端不准動:一條會脫靶的閃電比沒有閃電更糟。
    expect(node(second, 0)[0]).toBeCloseTo(FROM.x, 6);
    expect(node(second, 0)[2]).toBeCloseTo(FROM.z, 6);
    expect(node(second, -1)[0]).toBeCloseTo(TO.x, 6);
    expect(node(second, -1)[2]).toBeCloseTo(TO.z, 6);
  });
});
