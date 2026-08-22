/**
 * GH#556 —— owner 2026-08-22:「戰鬥進到**第二回合**變得非常 lag，之後**每回合越來
 * 越嚴重**，直到整個地圖無回應」。
 *
 * 「越來越嚴重」= **無界成長**，所以這一檔量的不是「有沒有呼叫 dispose」，而是
 * **回合邊界之後場上還剩下多少東西**，跑 6 個回合看它是不是常數。
 *
 * ⚠️ 每回合用**不同的** modelKey / vfx doc id —— ⛔ 那不是為了製造洩漏，那是真實
 * 情況（英雄升級解鎖 R/EX、第 3 回合起殭屍加入、每回合換地圖 #145），而 2026-08-22
 * 新接的三層全部是 **per-key** 的池子。
 *
 * ── 量到的（修之前，8 個回合、每回合 3 個新 modelKey）─────────────────────────
 *   `modelfx-*` TransformNode：72 → 144 → 216 → 288 → … → 576（**+72/回合**）
 *   其餘每一項都是平的（ParticleSystem 79、mesh 65、材質 42、常駐特效 24、
 *   特效文字 48）—— 所以 `AmbientVfx.extrasSig` 的冪等**真的擋住了**每幀重掛，
 *   `ScreenFxLayer` / `FloatingTextFx` 的固定池也真的是固定的。
 *
 * ⭐ 根因是 GH#270 逐字記過的同一句話，換一層再犯一次：
 *   「**per-key 上限只有在 key 的數量有上界時才構成上界**」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { createRoundFx, type RoundFx } from "../render/roundFxRegistry";
import { RoundVfxLifecycle } from "../render/roundVfxLifecycle";

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

function doc(id: string, mode: "burst" | "continuous"): VfxDoc {
  return {
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
    ...(mode === "burst" ? { mode, burstCount: 8 } : { mode, rate: 30 }),
  } as VfxDoc;
}

/** ⭐ 出貨的組裝點（失敗形態⑤：⛔ 這裡一個 FX 都不自己 new）。 */
function makeFx(): RoundFx {
  return createRoundFx(scene, {
    vfx: {
      entityPos: (id) => ({ x: id % 7, z: id % 5 }),
      vfxDoc: (key) => doc(key, "burst"),
      localEntityId: () => 1,
      teamOf: () => 0,
      modelDocFor: (k) => ({ glbPath: `${k}.glb` }),
      loadModelContainer: async () => null,
    },
    ambient: {
      bindingsFor: (key) => [{ vfx: `amb.${key}` }],
      vfxDocFor: (id) => (/^(amb|pv)\./.test(id) ? doc(id, "continuous") : null),
      ribbonDocFor: () => null,
    },
    fireRing: { vfxDocFor: () => null },
    victory: { cameraFor: () => null },
    whirlwind: { createTexture: () => null },
  });
}

/** 每幀成本代理量：這一幀 Babylon 要走訪幾個東西。 */
function load(): Record<string, number> {
  return {
    modelFxNodes: scene.transformNodes.filter((n) => n.name.startsWith("modelfx-")).length,
    systems: scene.particleSystems.length,
    meshes: scene.meshes.length,
    materials: scene.materials.length,
  };
}

/** 跑一個回合。⚠️ `syncAmbient` 是 GameApp **每一幀**跑的，而且 extras 是新陣列。 */
function playRound(fx: RoundFx, round: number, startMs: number): number {
  let now = startMs;
  const roots = new Map<number, TransformNode>();
  for (let h = 0; h < 6; h++) roots.set(h, new TransformNode(`hero-r${round}-${h}`, scene));
  for (let i = 0; i < 90; i++) {
    const ev = (type: string, data: unknown): void =>
      fx.vfx.handleEvent({ tick: i, type, data } as unknown as EventMessage, now);
    ev("vfxSpawn", { x: i % 7, z: i % 5, vfxId: `fx.r${round}-a${i % 12}` });
    ev("hitImpact", { source: 100 + i, target: 200 + i, amount: 120, x: i % 9, z: (i * 3) % 9 });
    ev("modelFxSpawn", {
      caster: i % 6,
      target: (i + 1) % 6,
      spec: { modelKey: `mfx.r${round}-${i % 3}`, motion: "line", speed: 12, count: 2 },
    });
    ev("screenFlash", {
      caster: 1,
      spec: { applyTo: "self", colorRgb: [255, 0, 0], peakAlpha: 0.4, durationMs: 200 },
    });
    ev("floatingText", { at: i % 6, text: `${i}Hit` });
    // ⭐ 冪等驗證：每幀重呼 attach，extras 每次都是**新陣列**（GameApp 就是這樣呼的）
    for (const [id, root] of roots) fx.ambient.attach(id, `model-r${round}`, root, [`pv.${round}`]);
    fx.ambient.tick(now, 16);
    fx.ambient.sweep(new Set(roots.keys()));
    now += 16;
    fx.vfx.update(now);
  }
  fx.victoryFx.playRoundVolley(now, round);
  now += 30_000; // 商店時間：證明「等一等自己會掉」不成立
  fx.vfx.update(now);
  fx.ambient.sweep(new Set<number>());
  for (const r of roots.values()) r.dispose(false, true);
  return now;
}

describe("每回合的殘留是常數，⛔ 不隨回合數成長 (round-vfx-cleanup)", () => {
  it("六個回合、每回合換一批 modelKey/doc id —— 邊界之後的場景負載一格都沒長", () => {
    cover("round-vfx-cleanup");
    const fx = makeFx();
    const life = new RoundVfxLifecycle(fx.registry);
    let now = 1000;
    let peak = load();
    const after: Record<string, number>[] = [];
    for (let round = 1; round <= 6; round++) {
      life.sync("combat");
      now = playRound(fx, round, now);
      peak = load();
      life.sync("resolution");
      after.push(load());
    }
    // 這一場真的畫了東西（否則下面的「沒成長」是空話）
    expect(peak.modelFxNodes).toBeGreaterThan(0);
    expect(peak.systems).toBeGreaterThan(0);
    // ⭐ 核心：第 2…6 回合的殘留 == 第 1 回合的殘留。⛔ 不是「小於某個數字」——
    //    一個門檻值會隨出貨預算漂掉，而「常數」是這個缺陷的定義本身。
    const base = after[0]!;
    for (let i = 1; i < after.length; i++) {
      expect({ round: i + 1, ...after[i]! }).toEqual({ round: i + 1, ...base });
    }
  });
});
