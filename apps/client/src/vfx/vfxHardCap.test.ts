/**
 * ⏳ GH#570 —— 「**不管什麼特效**，產生後最多三秒，之後強制清理回收」的守衛。
 *
 * owner 2026-08-23：「我發現**還是有特效超過三秒以上停留在場上**（老毛病，
 * **飛向天空的殘留半透明煙霧**）⋯請妳作一個**終極限制**⋯**三秒後一律強制清理回收**」。
 *
 * 這一條驗的是**機制**，⛔ 不是數字：上限從 `vfxHardMaxLifeSec()`（＝那一格
 * config）推導，⛔ 測試裡一個 3.0 都沒有（第二守則：出貨數值住進測試＝第四個住處）。
 *
 * 三個斷言，各自關掉一種「做了但玩家拿不到」的形態：
 *   ① 走 vfx 管線的一次性特效 → 到期**沒有粒子留在場上**（`getActiveCount() === 0`）
 *   ② ⭐ **不走**管線、直接 `new ParticleSystem` 的東西也被收掉 —— 這是 owner
 *      那句「不管什麼特效，包含技能、**場地特效**等」的落地。少了它，兜底就只是
 *      「管線裡再加一格政策」，而 owner 已經說過那樣還是會漏。
 *   ③ 常駐特效（顯式旗標 / 豁免表）**一顆粒子都不少** —— 豁免必須是說出來的。
 *
 * ⚠️ `ps.animate(true)`（preWarm）是 NullEngine 上唯一會真的生粒子/老化的路徑，
 * 理由逐字寫在 `gh270EmitterBudget.test.ts` 的檔頭（沒有 GL ⇒ `isReady()` 永遠
 * false ⇒ `animate()` 與 `scene.render()` 一顆都不生）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "./particleFactory";
import { vfxHardCapExemptPrefixes, vfxHardMaxLifeSec } from "./vfxCleanupPolicy";
import { sweepVfxHardCap } from "./vfxHardCap";

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

/** 一份「飛向天空的半透明煙霧」—— alpha 從不歸零,所以 #569 的尾段夾子不動它。 */
const SMOKE: VfxDoc = {
  id: "fx.test-sky-smoke",
  schema: "vfx@1",
  emitter: { shape: "cone", radius: 0.85, angleDeg: 1 },
  mode: "continuous",
  rate: 50,
  lifetimeSec: { min: 8, max: 8 },
  size: { start: 0.28, end: 0.56 },
  color: { start: [1, 1, 1, 0.4], end: [1, 1, 1, 0.4] },
  blendMode: "alpha",
  speed: { min: 2.2, max: 6.7 },
};

/** 直接 new 出來的系統（⛔ 不走 vfx 管線）—— 場地特效就是這個形狀。 */
function rawSystem(name: string): ParticleSystem {
  const ps = new ParticleSystem(name, 64, scene);
  ps.emitter = new Vector3(0, 1, 0);
  ps.createPointEmitter(new Vector3(-1, 1, -1), new Vector3(1, 1, 1));
  ps.minLifeTime = 8;
  ps.maxLifeTime = 8;
  ps.emitRate = 50;
  return ps;
}

/** 燒到有粒子在飛。 */
function ignite(ps: ParticleSystem): void {
  ps.start();
  for (let i = 0; i < 4; i++) ps.animate(true);
}

describe("⏳ GH#570 終極三秒上限", () => {
  it("到期把非豁免的特效**清乾淨**，常駐與豁免的一顆都不動", () => {
    const cap = vfxHardMaxLifeSec();
    const exemptName = `${vfxHardCapExemptPrefixes()[0] ?? "torch-flame-"}0`;

    const managed = toParticleSystem(SMOKE, scene, { name: "vfx-sky-smoke" });
    const stray = rawSystem("stray-scene-smoke"); // ⛔ 不走管線
    const persistent = toParticleSystem(SMOKE, scene, {
      name: "vfx-hero-glow",
      persistent: true,
    });
    const exempt = rawSystem(exemptName); // 豁免表裡的場地特效
    for (const ps of [managed, stray, persistent, exempt]) ignite(ps);
    for (const ps of [managed, stray, persistent, exempt]) {
      expect(ps.getActiveCount()).toBeGreaterThan(0);
    }

    // 起跑（第一次掃只是按下碼表），然後跨過上限。
    sweepVfxHardCap(scene, 0);
    expect(sweepVfxHardCap(scene, cap * 0.5).reclaimed).toBe(0); // 還沒到期 ⇒ 不碰
    const swept = sweepVfxHardCap(scene, cap + 0.001);

    expect(swept.reclaimed).toBe(2);
    // ⭐ 「強制清理回收」= 粒子真的不見了,⛔ 不是變透明。
    expect(managed.getActiveCount()).toBe(0);
    expect(stray.getActiveCount()).toBe(0);
    // ⭐ 常駐的兩條路（程式旗標 / 資料豁免）一顆粒子都不少。
    expect(persistent.getActiveCount()).toBeGreaterThan(0);
    expect(exempt.getActiveCount()).toBeGreaterThan(0);

    for (const ps of [managed, stray, persistent, exempt]) ps.dispose();
  });
});
