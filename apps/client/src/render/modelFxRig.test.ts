/**
 * 三個新特效通道的**一條**薄守衛（體驗層 ⇒ ⛔ 不開對抗輪，第零守則⑦）。
 *
 * 驗的是三條**承重線**，⛔ 不是三組數字：
 *   ① `ModelFxRig` 壽命到之後真的**回收**進 free-list，重放時**重用**（池子不長大）
 *      —— 拿掉 `release()` 的入池，或拿掉 `acquire()` 的 `free.pop()`，這一條就紅。
 *      這是 #131（孤兒發射器卡在場中央）在模型通道上的同一個形狀。
 *   ② `prefers-reduced-motion` 下震動**不會**送到相機（無障礙硬要求）。
 *   ③ 克勞德一次七刀 ⇒ 七個字同時進得去、事後**整池回收**（⛔ 不是每次 new）。
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ModelFxRig } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "./modelFxPath";
import { ScreenFxLayer } from "../vfx/ScreenFxLayer";
import { FloatingTextFx } from "../vfx/FloatingTextFx";

/**
 * ⭐ **線路形狀**（GH#606）—— `radial count:3`，三個方向由 sim 解算完送來。
 * ⛔ 舊版這裡是 `ModelFxMotionSpec` ＋ `facingRad`，而出貨路徑從來不產生它。
 */
const WIRE: ModelFxSpawnEvent = {
  caster: 1 as never,
  modelKey: "fx.test.orb",
  path: "radial",
  speed: 10,
  x: 0,
  z: 0,
  zone: 0,
  spinDegPerSec: 720,
  instances: [
    { x: 0, z: 0, dx: 1, dz: 0, dist: 5, durationSec: 0.5 },
    { x: 0, z: 0, dx: -0.5, dz: 0.866, dist: 5, durationSec: 0.5 },
    { x: 0, z: 0, dx: -0.5, dz: -0.866, dist: 5, durationSec: 0.5 },
  ],
};
const VIEWER = { isCaster: true, isVictim: true };

describe("moving-model FX rig", () => {
  it("壽命到就回收，重放時重用同一批節點（⛔ 池子不長大）", () => {
    const scene = new Scene(new NullEngine());
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1 }),
      loadContainer: () => Promise.resolve(null),
    });

    expect(rig.spawn(WIRE)).toBe(3);
    expect(rig.liveCount).toBe(3);
    expect(rig.pooledCount).toBe(0);

    // 走完全程 → 到期
    rig.tick(2000);
    expect(rig.liveCount).toBe(0);
    expect(rig.pooledCount).toBe(3); // ← 回收發生了

    rig.spawn(WIRE);
    expect(rig.liveCount).toBe(3);
    expect(rig.pooledCount).toBe(0); // ← 重用發生了（⛔ 沒有新造）

    rig.resetForRound();
    expect(rig.liveCount).toBe(0);
    rig.dispose();
  });
});

describe("screen FX", () => {
  it("reduced-motion 下震動不送到相機，一般情況下會送", () => {
    const sent: number[] = [];
    const opts = { host: null, addShake: (a: number) => sent.push(a) };
    const spec = { amplitude: 0.2, durationSec: 0.3 };
    expect(new ScreenFxLayer({ ...opts, reducedMotion: true }).shake(spec, VIEWER)).toBe(false);
    expect(new ScreenFxLayer({ ...opts, reducedMotion: false }).shake(spec, VIEWER)).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

describe("floating text", () => {
  it("同一點七發全部進得去且分道，到期整池回收", () => {
    const fx = new FloatingTextFx();
    const poolSize = fx.entries.length; // ⛔ 不抄字面值（第二守則:驗機制不驗數字）
    for (let i = 1; i <= 7; i++) expect(fx.spawn({ text: `${i}Hit`, x: 0, y: 2, z: 0 })).toBe(true);
    expect(fx.liveCount).toBe(7);
    expect(new Set(fx.entries.filter((e) => e.active).map((e) => e.lane)).size).toBe(7);
    for (let i = 0; i < 40; i++) fx.tick(100);
    expect(fx.liveCount).toBe(0);
    expect(fx.entries).toHaveLength(poolSize); // 池是固定的，⛔ 沒有長大
  });
});
