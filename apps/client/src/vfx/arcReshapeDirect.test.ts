/**
 * ⚡ GH#781 —— 電弧幾何**直寫頂點**之後，畫面必須與 Babylon 原路徑逐 float 相同。
 *
 * owner 2026-08-27：「閃電演算法太過耗效能 請深入分析原因」。量到的最大 CPU 項
 * 是 `CreateRibbon(…, { instance })` 每次重算 ComputeNormals＋包圍盒（法線與
 * 包圍盒在這個材質上**零讀者**）——修法是 reshape 直寫 position buffer。
 *
 * ⭐ ① 是承重線：直寫的佈局假設（path-major）若錯，整條弧會變成亂序三角形湯，
 *    而「有 mesh、有頂點、材質 ready」的守衛全部照綠（失敗形態⑦）。
 *    所以參考值拿 **Babylon 自己的 instance 路徑**當佈局原作者，逐 float 比對。
 * ⭐ ② 是後台那一格（`maxConcurrentArcs`）的防死旋鈕線。
 *
 * 突變（2026-08-27，一條承重線）：把 `ArcBoltFx.reshape` 的
 * `updateVerticesData` 那一行拿掉 → ① 紅（頂點停在 0）→ 改回來綠。
 *
 * @visual-proof 斷言的是**送進 GPU 的 position buffer 本身**（getVerticesData
 * 逐 float 對 Babylon 參考路徑）—— 直寫佈局錯 = 弧變亂序三角形湯,這裡就紅。
 * ⚠️ 誠實界線：這證明幾何正確到達 draw buffer,**像素/幀時間的真瀏覽器 A/B
 * 仍未驗收** —— 補拍指引在 docs/_reports/lightning-perf_temp_20260827.md §五。
 */
import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { DEFAULT_MAX_CONCURRENT_ARCS } from "@ggd/shared/content/schema/vfx";
import { ArcBoltFx } from "./ArcBoltFx";
import {
  arcBoltSpec,
  arcStripPaths,
  ARC_TINTS,
  buildArcPath,
  maxConcurrentArcs,
  setMaxConcurrentArcs,
} from "./arcBolt";

const FROM = { x: 1, y: 0.95, z: 2 };
const TO = { x: 6, y: 0.95, z: 5 };
const SEED = 7;

afterEach(() => setMaxConcurrentArcs(undefined));

describe("⚡ GH#781 電弧直寫頂點 + 同場上限", () => {
  it("① 直寫的頂點與 Babylon 自己的 CreateRibbon(instance) 逐 float 相同", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fx = new ArcBoltFx(scene, { maxStrips: 1 });
    const spec = arcBoltSpec(ARC_TINTS.lightning, { forks: 0 });
    fx.strike(FROM, TO, spec, 0, SEED);
    const mesh = scene.meshes.find((m) => m.name.startsWith("vfx-arc"));
    expect(mesh, "strike 之後場上要有一條弧").toBeTruthy();
    const got = Array.from(mesh!.getVerticesData(VertexBuffer.PositionKind)!);

    // 參考值：同一組折線交給 **Babylon 的 instance 路徑**寫 —— 它是佈局的原作者。
    const pts = buildArcPath(FROM, TO, spec, SEED);
    const { left, right } = arcStripPaths(pts, spec.halfWidth);
    const toV = (path: readonly (readonly [number, number, number])[]) =>
      path.map(([x, y, z]) => new Vector3(x, y, z));
    const ref = CreateRibbon(
      "ref",
      { pathArray: [toV(left.map(() => [0, 0, 0] as const)), toV(right.map(() => [0, 0, 0] as const))], updatable: true },
      scene,
    );
    CreateRibbon("ref", { pathArray: [toV(left), toV(right)], instance: ref });
    const want = Array.from(ref.getVerticesData(VertexBuffer.PositionKind)!);

    expect(got, "佈局或數值任何一個 float 漂了 = 弧被畫成亂序三角形").toEqual(want);
    fx.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("② 後台的電弧同場上限真的管得動池子（⛔ 不是死旋鈕）", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fx = new ArcBoltFx(scene); // ⭐ 不帶 opts —— 走出貨那條讀後台的路
    try {
      setMaxConcurrentArcs(4);
      const spec = arcBoltSpec(ARC_TINTS.lightning, { forks: 0 });
      for (let i = 0; i < 10; i++) fx.strike(FROM, TO, spec, i, i);
      expect(fx.poolSize, "調成 4 之後池子還在長 = 那一格是死旋鈕").toBe(4);
      // 界外夾回 Zod 的上下界（後台耐久 overlay 走寬鬆路徑不跑 Zod）
      setMaxConcurrentArcs(0);
      expect(maxConcurrentArcs()).toBe(4);
      // 留白 = 出貨預設，⛔ 不是 0
      setMaxConcurrentArcs(undefined);
      expect(maxConcurrentArcs()).toBe(DEFAULT_MAX_CONCURRENT_ARCS);
    } finally {
      fx.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
