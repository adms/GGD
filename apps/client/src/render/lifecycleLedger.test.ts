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
 * M2 `EntityViewRegistry` 建構子拿掉 `gaugeContainers("view", …)`
 *    → FAIL：`view:champions` 不在被指名的名單裡（那一格從帳本上整個消失）。
 *    ⭐ 這是承重的那一條：接線在**出貨的建構子**裡，⛔ 不是測試自己註冊一格量表
 *    （失敗形態⑤ —— 那樣量到的是一個虛構通道）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LifecycleLedger, lifecycleLedger, type LedgerScene } from "./lifecycleLedger";
import { createRoundFx } from "./roundFxRegistry";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";
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

  it("⭐ 一行接線：登記了但**沒回收**的容器，帳本要指名它（⛔ 不是自製夾具）", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    lifecycleLedger.reset();
    // ⭐ 出貨的 registry —— 接線住在**它的建構子**裡，所以這條線量的是真的通道
    const reg = new EntityViewRegistry(scene, new AssetManager(scene));
    const pose = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });
    const ents: EntityViewState[] = [];
    let id = 0;
    for (let r = 1; r <= 4; r++) {
      // 每回合再進 10 個，而且**一個都沒有離場** ⇒ champions 只增不減＝「累積」
      for (let i = 0; i < 10; i++)
        ents.push({ id: ++id, kind: 0, seatId: 0, key: "champ.sela", teamId: 1,
          x: 0, z: 0, fx: 1, fz: 0, alive: true });
      reg.sync({ entities: ents, poseFor: pose, nowMs: r * 16, dtMs: 16, loadModels: false });
      lifecycleLedger.markRound(r);
    }
    expect(lifecycleLedger.suspects().map((s) => s.kind)).toContain("view:champions");
    scene.dispose();
    engine.dispose();
  });
});
