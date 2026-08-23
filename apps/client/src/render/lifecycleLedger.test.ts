/**
 * 🔬 生命週期登記表的守衛（owner 2026-08-23「到第七回合就很難動作⋯累積」）。
 *
 * ⭐ 承重的那一條是**「還在長」的判定**：它要抓得到無界洩漏，而且要**放過**
 * 一個長到頂就平掉的有界快取 —— 少了後者，警報會在每一場比賽亮著，而
 * 一個一直亮著的警報等於沒有警報。
 *
 * ── 突變紀錄（實跑）──────────────────────────────────────────────────────
 * M1 `roundFxRegistry.createRoundFx` 拿掉 `lifecycleLedger.bindScene(scene)`
 *    → FAIL：「出貨的組裝點要綁場景」，`kinds` 是 `[]`。改回來 → 綠。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LifecycleLedger, lifecycleLedger, type LedgerScene } from "./lifecycleLedger";
import { createRoundFx } from "./roundFxRegistry";
import { RoundVfxLifecycle } from "./roundVfxLifecycle";
import { healthWarnings } from "../ui/PerfOverlay";
import { perfBus } from "../perfBus";

/** 餵一串「逐回合這一類有幾個」，回傳最後被指名的類別。 */
function play(counts: readonly number[]): string[] {
  const led = new LifecycleLedger();
  const ps: { name: string }[] = [];
  const scene: LedgerScene = {
    meshes: [], materials: [], textures: [], transformNodes: [], particleSystems: ps,
  };
  led.bindScene(scene);
  let t = 0;
  for (const n of counts) {
    ps.length = 0;
    for (let i = 0; i < n; i++) ps.push({ name: `leak-${i}` });
    led.markRound(++t);
  }
  return led.suspects(8).map((s) => s.kind);
}

beforeEach(() => {
  perfBus.lifecycleGrowth = 0;
  perfBus.lifecycleWorst = "";
});

describe("🔬 生命週期登記表", () => {
  it("⭐ 無界洩漏被指名；長到頂就平掉的有界快取**不**被指名", () => {
    // 每回合 +10，從沒平過 ⇒ 這正是 owner 說的「累積」
    expect(play([10, 20, 30, 40])).toContain("ps:leak");
    // 有界快取：長到 32 就封頂（實測地面貼圖快取的形狀）⇒ ⛔ 不可以一直叫
    expect(play([4, 8, 12, 16, 32, 32])).toEqual([]);
    // 增量沒達到門檻（+3）⇒ 不叫
    expect(play([4, 5, 6, 7])).toEqual([]);
    // 掉下來過 ⇒ 不是累積
    expect(play([10, 40, 5, 40])).toEqual([]);
  });

  it("⭐ 出貨的組裝點真的綁了場景，回合邊界真的記得下一筆（⛔ 不是自製夾具）", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    lifecycleLedger.reset();
    const fx = createRoundFx(scene, {
      vfx: { entityPos: () => null },
      ambient: { bindingsFor: () => [], vfxDocFor: () => null, ribbonDocFor: () => null },
      ambientToggleMask: () => 0,
      fireRing: { vfxDocFor: () => null },
      whirlwind: { createTexture: () => null },
    });
    expect(fx.registry.names).toContain("lifecycleLedger");
    new RoundVfxLifecycle(fx.registry).sync("combat");
    const snap = lifecycleLedger.latest();
    expect(Object.keys(snap?.kinds ?? {}), "出貨的組裝點要綁場景").not.toEqual([]);
    expect(lifecycleLedger.history().length).toBe(1);
    expect(lifecycleLedger.report()).toContain("kind");
    scene.dispose();
    engine.dispose();
  });

  it("⭐ 非零就畫在畫面上（⛔ 不是一行沒有人讀的 console）", () => {
    expect(healthWarnings({ ...perfBus, lifecycleGrowth: 2, lifecycleWorst: "ps:leak" })).toEqual([
      "殘留累積 2 類（ps:leak）",
    ]);
    expect(healthWarnings({ ...perfBus, lifecycleGrowth: 0 })).toEqual([]);
  });
});
