/**
 * #366 —— 發射器**方位**的守衛。
 *
 * owner 要的四個參數是大小/顏色/透明度/**方位**,而方位在這之前是死的:
 * `facingDeg` 只是一個型別欄位 + 一支沒有 production 呼叫者的 `resolveSpatial()`。
 *
 * ⚠️ 斷言一律讀**最終的 Babylon 物件**,⛔ 不讀 VfxDoc —— 「JSON 寫了 orient」
 * 和「畫出來真的轉了」是兩件事,而這個 repo 已經被中間層吃掉過參數三次
 * (`flyHeight` / `anchor` / per-ability `alpha`,全都在一行之內蒸發)。
 *
 * ⛔ 這裡不驗**數字**(540°/s 是不是對的角速度是 owner 的視覺決定,而且住在
 * primitives / 後台),只驗**機制會不會發生**。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Particle } from "@babylonjs/core/Particles/particle";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "./particleFactory";
import { tornado } from "../render/vfx/primitives";
import { applyArtParams } from "../render/vfx/artParams";

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

const make = (doc: VfxDoc): ParticleSystem =>
  toParticleSystem(doc, scene, { createTexture: () => null });

/** 問真的 system:一顆生在 `at` 的粒子,初始方向是什麼? */
function directionAt(ps: ParticleSystem, at: Vector3): Vector3 {
  const particle = new Particle(ps);
  particle.position.copyFrom(at);
  const out = new Vector3(0, 0, 0);
  const world = Matrix.Identity();
  // 沒有裝 hook 時就問 emitter type 自己那支 —— 兩條路徑用同一個問法。
  if (ps.startDirectionFunction) ps.startDirectionFunction(world, out, particle, false);
  else ps.particleEmitterType.startDirectionFunction(world, out, particle, false, world);
  return out;
}

describe("#366 發射器方位", () => {
  /**
   * ⭐ 承重的那一條(突變驗證就驗它):**龍捲風真的在轉**。
   *
   * 一顆生在軸側邊 (+X) 的粒子,如果只是「往上噴的錐」,它的方向會落在
   * XY 平面上 —— z 分量只有錐角的隨機散開。旋轉存在時,切線(軸 × 徑向 = +Z)
   * 會壓過那點散開,而且**換一邊生的粒子切線要反向** —— 那是「繞著軸轉」而不是
   * 「整團往同一邊歪」的判準。
   */
  it("JSON 給了 swirl,Babylon 拿到的方向真的帶切線 —— 而且兩側反向", () => {
    const ps = make(tornado({ id: "fx.t.spin", color: [0.6, 0.8, 1] }));
    const plusX = directionAt(ps, new Vector3(1, 0, 0));
    const minusX = directionAt(ps, new Vector3(-1, 0, 0));
    // 軸 = +Y,徑向 = ±X ⇒ 切線 = 軸 × 徑向 = ∓Z... 兩側必然異號,且量級要壓過錐角散開。
    expect(Math.sign(plusX.z)).toBe(-Math.sign(minusX.z));
    expect(Math.abs(plusX.z)).toBeGreaterThan(1);
    expect(Math.abs(minusX.z)).toBeGreaterThan(1);
  });

  /**
   * 「橫放的柱狀砲」的機制。柱狀特效**往哪邊長**是重力決定的,所以放倒它就是
   * 把重力轉出 Y 軸 —— ⛔ 不是第二支 primitive。
   */
  it("pitchDeg 0 把柱狀特效的重力從垂直轉成水平（= 橫放的柱狀砲）", () => {
    const upright = make(tornado({ id: "fx.t.up", color: [1, 1, 1] }));
    const laid = make(
      tornado({ id: "fx.t.laid", color: [1, 1, 1], orient: { pitchDeg: 0, swirlDegPerSec: 0 } }),
    );
    // 直立:重力全在 +Y,水平分量 0。
    expect(upright.gravity.y).toBeGreaterThan(0);
    expect(Math.hypot(upright.gravity.x, upright.gravity.z)).toBeCloseTo(0, 6);
    // 放倒:同樣的量級整個跑到水平面上。
    expect(Math.abs(laid.gravity.y)).toBeCloseTo(0, 6);
    expect(Math.hypot(laid.gravity.x, laid.gravity.z)).toBeCloseTo(upright.gravity.y, 6);
  });

  /** `facingDeg` 不再是死的:它折進 doc,所以會**換 pool key**,兩個方向不會共用同一個 system。 */
  it("facingDeg 折進 doc.orient，而且轉了方位的 doc 不是同一個物件", () => {
    const base = tornado({ id: "fx.t.face", color: [1, 1, 1] });
    const east = applyArtParams(base, { facingDeg: 90 });
    expect(east).not.toBe(base);
    expect(east.orient?.yawDeg).toBe(90);
    // ABSENT ≠ ZERO:只轉方位,旋轉要留著。
    expect(east.orient?.swirlDegPerSec).toBe(base.orient?.swirlDegPerSec);
    // 恆等的方位不該憑空多開一格池。
    expect(applyArtParams(base, { facingDeg: 0 })).toBe(base);
  });

  /** 向後相容:633 份沒有 `orient` 的出貨文件連 hook 都不該被裝上。 */
  it("沒有 orient 的文件走的是升級前一位元不差的路徑", () => {
    const plain = make({
      id: "fx.t.plain",
      schema: "vfx@1",
      emitter: { shape: "cone", radius: 0.3, angleDeg: 30 },
      mode: "burst",
      burstCount: 8,
      lifetimeSec: { min: 0.2, max: 0.4 },
      size: { start: 0.4, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
      gravityY: -3,
    });
    expect(plain.startDirectionFunction).toBeFalsy();
    expect(plain.gravity.x).toBe(0);
    expect(plain.gravity.z).toBe(0);
    expect(plain.gravity.y).toBe(-3);
  });
});
