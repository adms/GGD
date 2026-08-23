/**
 * GH#429 —— owner:「戰鬥進到**第二回合**變得非常 lag，之後**每回合越來越嚴重**，
 * 直到整個地圖無回應」。「越來越嚴重」= 無界成長 ⇒ 這裡量**回合邊界之後場上還剩
 * 多少**，跑 6 回合看它是不是常數（⛔ 不是「有沒有呼叫 dispose」）。每回合換一批
 * modelKey / doc id —— ⛔ 不是造假：英雄解鎖 R/EX、殭屍加入、每回合換地圖（#145）。
 *
 * 量到的（修之前，8 回合 × 每回合 3 個新 modelKey）：`modelfx-*` TransformNode
 * **72 → 144 → … → 576（+72/回合）**；其餘全平（ParticleSystem 79 / mesh 65 /
 * 材質 42 / 常駐特效 24 / 特效文字 48）⇒ `AmbientVfx.extrasSig` 的冪等真的擋住
 * 了每幀重掛，`ScreenFxLayer` / `FloatingTextFx` 的固定池真的是固定的。
 * ⭐ 根因是 GH#270 那句話換一層再犯：**per-key 上限只有在 key 數有上界時才是上界**。
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

const doc = (id: string, mode: "burst" | "continuous"): VfxDoc =>
  ({
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
    ...(mode === "burst" ? { mode, burstCount: 8 } : { mode, rate: 30 }),
  }) as VfxDoc;

/** ⭐ 出貨的組裝點（失敗形態⑤：⛔ 這裡一個 FX 都不自己 new）。 */
const makeFx = (): RoundFx =>
  createRoundFx(scene, {
    vfx: {
      entityPos: (id) => ({ x: id % 7, z: id % 5 }),
      vfxDoc: (key) => doc(key, "burst"),
      modelDocFor: (k) => ({ glbPath: `${k}.glb` }),
      loadModelContainer: async () => null,
    },
    ambient: {
      bindingsFor: (key) => [{ vfx: `amb.${key}` }],
      vfxDocFor: (id) => (/^(amb|pv)\./.test(id) ? doc(id, "continuous") : null),
      ribbonDocFor: () => null,
    },
    // 必填（GH#546）—— 這兩支不驗開關視覺，回 0 = 一律關。
    // ⭐ 它刻意是必填:少了它「開關型技能的手部特效不掛」會靜靜發生。
    ambientToggleMask: () => 0,
    fireRing: { vfxDocFor: () => null },
    whirlwind: { createTexture: () => null },
  });

/** 每幀成本代理量：這一幀 Babylon 要走訪幾個東西。 */
const load = (): Record<string, number> => ({
  modelFxNodes: scene.transformNodes.filter((n) => n.name.startsWith("modelfx-")).length,
  systems: scene.particleSystems.length,
  meshes: scene.meshes.length,
  materials: scene.materials.length,
});

/** 跑一個回合。⚠️ `syncAmbient` 是 GameApp **每一幀**跑的，extras 每次都是新陣列。 */
function playRound(fx: RoundFx, round: number, startMs: number): number {
  let now = startMs;
  const roots = new Map<number, TransformNode>();
  for (let h = 0; h < 6; h++) roots.set(h, new TransformNode(`hero-r${round}-${h}`, scene));
  for (let i = 0; i < 90; i++) {
    const ev = (type: string, data: unknown): void =>
      fx.vfx.handleEvent({ tick: i, type, data } as unknown as EventMessage, now);
    ev("vfxSpawn", { x: i % 7, z: i % 5, vfxId: `fx.r${round}-a${i % 12}` });
    ev("hitImpact", { source: 100 + i, target: 200 + i, amount: 120, x: i % 9, z: (i * 3) % 9 });
    // ⛔⛔ 這個夾具在 2026-08-23 之前是 `{ caster, spec: { …, motion: "line" } }`
    //    （GH#608）—— 出貨路徑**從來不產生**那個形狀，而 `motion` 這個欄位
    //    在 repo 裡根本不存在。它照樣生得出節點（舊消費端只問 `spec` 在不在），
    //    所以這條「殘留不成長」的守衛量的是一個**虛構通道**的殘留。
    // ⭐ 現在的形狀與 `sim/effects/spawnModelFx.ts` 的 `ModelFxSpawnEvent` 逐格相同。
    ev("modelFxSpawn", {
      caster: i % 6,
      modelKey: `mfx.r${round}-${i % 3}`,
      path: "radial",
      speed: 12,
      x: i % 7,
      z: i % 5,
      zone: 0,
      instances: [
        { x: i % 7, z: i % 5, dx: 1, dz: 0, dist: 6, durationSec: 0.5 },
        { x: i % 7, z: i % 5, dx: -1, dz: 0, dist: 6, durationSec: 0.5 },
      ],
    });
    for (const [id, root] of roots) fx.ambient.attach(id, `model-r${round}`, root, [`pv.${round}`]);
    fx.ambient.tick(now, 16);
    fx.ambient.sweep(new Set(roots.keys()));
    fx.vfx.update((now += 16));
  }
  fx.vfx.update((now += 30_000)); // 商店時間：證明「等一等自己會掉」不成立
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
    // ⭐ 核心：第 2…6 回合的殘留 == 第 1 回合。⛔ 不是「小於某個門檻」——
    //    門檻會隨出貨預算漂掉，而「常數」就是這個缺陷的定義本身。
    for (let i = 1; i < after.length; i++) {
      expect({ round: i + 1, ...after[i]! }).toEqual({ round: i + 1, ...after[0]! });
    }
  });
});
