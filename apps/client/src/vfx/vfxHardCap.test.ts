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
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";

// QualityController singleton 在 import 期就碰 localStorage — stub 掉（同 roundReset）
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { toParticleSystem } from "./particleFactory";
import { vfxHardCapExemptPrefixes, vfxHardMaxLifeSec } from "./vfxCleanupPolicy";
import { MODEL_FX_NODE_PREFIX, sweepVfxHardCap } from "./vfxHardCap";
import { VfxSystem } from "./VfxSystem";

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

  /**
   * 🟣 GH#784 —— mesh 半邊：地上殘留的紫色圈圈是 `spawnModelFx` 的圈型**模型**
   * （oblivionaura／midchilder 魔法陣／tome 環），它們是 mesh，⛔ 不在
   * `scene.particleSystems` 裡 ⇒ 上面那條掃描對它們結構性失明，壽命執行只剩
   * rig 的 live-list 一道 —— 那一道漏了（GH#782），圈就永遠留在地上。
   *
   * 這裡驗**機制**：一個 `modelfx-` 頂層節點連續亮超過同一格上限 ⇒ 被關掉；
   * 子節點不各自計時（關逐子節點會把池化重用打成永久黑）；被 rig 正常
   * release（關掉）過的，碼表歸零 —— 重用拿到新的碼表，⛔ 不是繼承前一發的年齡。
   */
  it("🟣 modelfx- 頂層節點吃同一格上限；子節點不各自計時；重用拿新碼表", () => {
    const cap = vfxHardMaxLifeSec();
    const t0 = 1000; // 與上一個 it 的碼表錯開（WeakMap 以物件為鍵，錯開只是保險）

    const root = new TransformNode(`${MODEL_FX_NODE_PREFIX}imported.oblivionaura-7`, scene);
    const axis = new TransformNode(`${MODEL_FX_NODE_PREFIX}axis-imported.oblivionaura-7`, scene);
    axis.parent = root;
    const bystander = new TransformNode("champ-3-formpart", scene);

    // 洩漏的形狀：根一直亮著、沒有人 release ⇒ 到期被關（reclaimed 說出來）。
    sweepVfxHardCap(scene, t0);
    expect(sweepVfxHardCap(scene, t0 + cap * 0.5).reclaimed).toBe(0);
    const swept = sweepVfxHardCap(scene, t0 + cap + 0.001);
    expect(swept.reclaimed).toBe(1);
    expect(root.isEnabled()).toBe(false);
    // ⭐ 子節點自己的旗標不被動 —— rig 的池化重用只重新啟用根（modelFxRig:560）。
    expect(axis.isEnabled(false)).toBe(true);
    expect(bystander.isEnabled()).toBe(true);

    // 池化重用：rig 重新啟用根 ⇒ 新的碼表，⛔ 不繼承上一發的年齡。
    const t1 = t0 + cap + 10;
    root.setEnabled(true);
    sweepVfxHardCap(scene, t1);
    expect(sweepVfxHardCap(scene, t1 + cap * 0.5).reclaimed).toBe(0);
    expect(root.isEnabled()).toBe(true);
    expect(sweepVfxHardCap(scene, t1 + cap + 0.001).reclaimed).toBe(1);
    expect(root.isEnabled()).toBe(false);

    for (const n of [axis, root, bystander]) n.dispose();
  });

  /**
   * 🟣 出貨消費端的真鏈路（⛔ 不是手造的洩漏形狀）：`modelFxSpawn` 走**真的**
   * `VfxSystem` → 真的 `ModelFxRig`。夾具照 `godie-etyr.q`（14-01）的
   * oblivionaura 圈型模型：static 一具、`durationSec 0`（作者沒填 lifeSec）
   * ⇒ 壽命 = 同一格上限。斷言「一場打完地面殘留圈計數 = 0」的可判那一半：
   * 跨過上限之後，場上**畫得出來的** `modelfx-` 頂層節點是 0 個。
   */
  it("🟣 出貨形狀的圈型模型（durationSec 0）跨過上限後畫得出來的 = 0", () => {
    const cap = vfxHardMaxLifeSec();
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxDoc: () => null,
      localEntityId: () => 1,
      teamOf: () => 0,
      modelDocFor: (k) => ({ glbPath: `${k}.glb` }),
      loadModelContainer: () => new Promise(() => {}), // glb 永遠在串流 —— 首發空殼那條真路
    });
    const enabledRoots = (): number =>
      scene.transformNodes.filter(
        (n) => n.name.startsWith(MODEL_FX_NODE_PREFIX) && n.parent === null && n.isEnabled(),
      ).length;

    vfx.update(0);
    vfx.handleEvent(
      {
        tick: 1,
        type: "modelFxSpawn",
        data: {
          caster: 3,
          modelKey: "imported.oblivionaura",
          path: "static",
          speed: 0,
          x: 2,
          z: 3,
          zone: 0,
          instances: [{ x: 2, z: 3, dx: 0, dz: 0, dist: 0, durationSec: 0 }],
        },
      } as unknown as EventMessage,
      0,
    );
    vfx.update(16);
    expect(enabledRoots()).toBe(1); // 真的生出來了（指認的那一半，⛔ 不是空轉）
    for (let t = 1; t * 1000 <= (cap + 2) * 1000; t++) vfx.update(t * 1000);
    expect(enabledRoots()).toBe(0); // 一場打完：畫得出來的殘留圈 = 0
    vfx.dispose();
  });
});
