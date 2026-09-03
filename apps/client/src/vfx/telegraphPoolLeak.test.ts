/**
 * #262 —— 「洩漏的粒子/mesh 回收」的第二條:**Telegraph 的每個 Scene 共用的
 * 預告圈網格 free-list**。
 *
 * #259(回合邊界清場)是真的做了事,但它清的是**有主的**東西:
 * `TelegraphLayer.live` 裡的每一個 Live、`VfxSystem` 自己的 pool、rig 的
 * free-list。ring 網格在 `release()` 之後就不屬於任何 Telegraph 了 —— 它進到
 * `Telegraph.ts` 的 `sharedByScene`(per-scene WeakMap),key 是**半徑字串**,
 * 一個 key 上限 8 個網格、每個網格自帶一份 StandardMaterial。
 * 沒有人清它,`TelegraphLayer.dispose()` 也不清(它只走 `live`)。
 * arena 的 Scene 活過整場比賽,所以那些網格從第一次施法起就在 `scene.meshes`
 * 裡,每一張 frame 都被走訪。
 *
 * 修之前實測(60 個不同半徑 × 6 回合,每回合 `layer.clear()`):
 *   R1..R6 殘留固定 72 mesh / 73 material / 13 texture / 12 particleSystem,
 *   而且 **`layer.dispose()` 之後一模一樣**。
 *
 * ⚠️ 斷言讀 `scene.meshes.length` / `scene.materials.length` —— scene 上真的
 * 還在的物件,不是 `telegraphPoolStats` 那個自家計數器(第⑦種故障)。
 * `telegraphPoolStats` 只用來證明「free-list 真的被填過」,不當判準。
 *
 * 突變驗證:把 `VfxSystem.resetForRound()` 的 `trimTelegraphPools(...)` 那一行
 * 刪掉 → 「回合邊界修剪」那條紅;把 `dispose()` 的 `disposeTelegraphShared(...)`
 * 刪掉 → 「整場結束歸零」那條紅。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import type { VfxDoc } from "@ggd/shared/content";
import { TelegraphLayer } from "./TelegraphLayer";
import { telegraphPoolStats, trimTelegraphPools, disposeTelegraphShared } from "./Telegraph";
import { VfxSystem } from "./VfxSystem";
import { readVfxCleanupPolicy, ringCapForRoundBoundary } from "./vfxCleanupPolicy";
import { DEFAULT_VFX_CLEANUP } from "@ggd/shared/content";

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

/**
 * 材質數,扣掉 Babylon 自己的 `defaultMaterial` —— 它是引擎在第一個網格出現時
 * 才 lazily 建的內建物件,不是我們洩漏的東西。不扣掉的話「歸零」這條斷言會被
 * 一個跟缺陷無關的 +1 弄紅(第④種故障:斷言方向跟缺陷無關)。
 */
function ownedMaterials(): number {
  return scene.materials.filter((m) => m !== scene.defaultMaterial).length;
}

function layerFor(): TelegraphLayer {
  return new TelegraphLayer(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    castProgress: () => 1,
  });
}

/**
 * 一個回合:`casts` 個**不同半徑**的施法。半徑各不相同不是造假的前提 ——
 * 預告圈的半徑是 `def.radius × abilityRange`,48 位英雄 × 5 格技能各有自己的
 * AoE,而 `radiusKey` 是 `radius.toFixed(2)`,所以每一個都是一條新的 free-list。
 */
function playRound(layer: TelegraphLayer, casts: number, startMs: number): number {
  let now = startMs;
  for (let i = 0; i < casts; i++) {
    layer.begin(
      i,
      { kind: "circle", x: i % 9, z: (i * 3) % 9, radius: 1 + i * 0.13 },
      "enemy",
      600,
      now,
    );
    now += 16;
    layer.update(now);
  }
  now += 5_000;
  layer.update(now);
  return now;
}

describe("預告圈的共用網格池在回合邊界被交回去 (vfx-leak-reclaim)", () => {
  it("same-frame audit hides carriers without clearing lifetime state", async () => {
    const layer = layerFor();
    layer.begin(1, { kind: "circle", x: 0, z: 0, radius: 2 }, "enemy", 600, 1000);
    const carriers = scene.meshes.filter((mesh) => mesh.name.startsWith("telegraph-"));
    expect(layer.activeCount).toBe(1);
    expect(carriers.some((mesh) => mesh.isEnabled())).toBe(true);
    await layer.withHiddenForAudit(async () => {
      expect(layer.activeCount).toBe(1);
      expect(carriers.every((mesh) => !mesh.isEnabled())).toBe(true);
    });
    expect(layer.activeCount).toBe(1);
    expect(carriers.some((mesh) => mesh.isEnabled())).toBe(true);
    layer.dispose();
    disposeTelegraphShared(scene);
  });

  it("`TelegraphLayer.clear()` 之後網格還在池子裡 —— #259 沒有清到這一層", () => {
    cover("vfx-leak-reclaim");
    const layer = layerFor();
    playRound(layer, 30, 1000);
    layer.clear();
    // 這是缺陷的形狀,不是回歸:clear() 把場上的圈 release 回 free-list,
    // 網格一個都沒有離開 scene。這條測試釘住「為什麼還需要 trim」。
    expect(telegraphPoolStats(scene).rings).toBeGreaterThan(0);
    expect(scene.meshes.length).toBeGreaterThan(0);
    layer.dispose();
    disposeTelegraphShared(scene);
  });

  it("trim 到 0 之後 scene 上真的一個網格都不剩,而且下一回合還畫得出來", () => {
    cover("vfx-leak-reclaim");
    const layer = layerFor();
    const baseMeshes = scene.meshes.length;
    const baseMats = ownedMaterials();
    let now = playRound(layer, 30, 1000);
    layer.clear();
    expect(scene.meshes.length).toBeGreaterThan(baseMeshes);

    trimTelegraphPools(scene, 0);
    expect(scene.meshes.length).toBe(baseMeshes);
    expect(ownedMaterials()).toBe(baseMats);
    expect(telegraphPoolStats(scene)).toEqual({ rings: 0, fills: 0, shocks: 0 });

    // 池子是 lazy 的:清掉之後下一回合照樣要畫得出東西,不是被永久關掉
    now = playRound(layer, 3, now + 5000);
    expect(scene.meshes.length).toBeGreaterThan(baseMeshes);
    layer.dispose();
    disposeTelegraphShared(scene);
  });

  it("留 cap 個:殘留數不隨回合成長,而且 <= cap", () => {
    cover("vfx-leak-reclaim");
    const layer = layerFor();
    const cap = 8;
    let now = 1000;
    const residual: number[] = [];
    for (let r = 1; r <= 4; r++) {
      now = playRound(layer, 30, now);
      layer.clear();
      trimTelegraphPools(scene, cap);
      residual.push(telegraphPoolStats(scene).rings);
      now += 5000;
    }
    for (const n of residual) expect(n).toBeLessThanOrEqual(cap);
    // 單調成長是這個 issue 的症狀 —— 第 4 回合不可以比第 1 回合高
    expect(residual[3]!).toBeLessThanOrEqual(residual[0]!);
    layer.dispose();
    disposeTelegraphShared(scene);
  });
});

describe("VfxSystem 的回合邊界真的驅動了修剪 (vfx-leak-reclaim)", () => {
  function burstDoc(id: string): VfxDoc {
    return {
      id,
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "burst",
      burstCount: 8,
      lifetimeSec: { min: 0.2, max: 0.5 },
      size: { start: 0.4, end: 0.1 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
    };
  }

  /**
   * ⚠️ 被測的是**出貨的那一個** `VfxSystem.resetForRound()`(第⑤種故障:
   * 被測的不是出貨的那個)。這裡不直接呼叫 `trimTelegraphPools`。
   */
  function makeVfx(): VfxSystem {
    return new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxDoc: (key) => burstDoc(key),
      localEntityId: () => 1,
      teamOf: () => 0,
    });
  }

  it("resetForRound() 之後預告圈網格離開 scene", () => {
    cover("vfx-leak-reclaim");
    const vfx = makeVfx();
    const baseMeshes = scene.meshes.length;
    const layer = layerFor();
    playRound(layer, 20, 1000);
    layer.clear();
    expect(scene.meshes.length).toBeGreaterThan(baseMeshes);

    vfx.resetForRound(); // ← 出貨路徑。預設政策 purgeSharedPoolsOnRoundEnd=true
    expect(telegraphPoolStats(scene).rings).toBe(0);
    expect(scene.meshes.length).toBe(baseMeshes);

    layer.dispose();
    vfx.dispose();
  });

  /**
   * ⚠️ 這一條刻意**不**先呼叫 `resetForRound()`。先清一次的話池子早就空了,
   * 「dispose 之後是 0」對「有沒有真的 dispose」完全沒有鑑別力 —— 把
   * `disposeTelegraphShared` 那一行刪掉測試照樣全綠(第③種故障)。所以這裡從
   * 「池子是滿的」直接跳到 dispose。
   *
   * 而且量的是 `scene.textures`:magic-circle 貼圖是 `disposeTelegraphShared`
   * 獨有的責任(`trimTelegraphPools` 故意不碰它),所以它是唯一能區分兩者的斷言。
   */
  it("dispose() 連 magic-circle 貼圖與 kick 粒子池都還回去 —— 不是只清網格", () => {
    cover("vfx-leak-reclaim");
    const vfx = makeVfx();
    const baseTextures = scene.textures.length;
    const baseSystems = scene.particleSystems.length;
    const layer = layerFor();
    playRound(layer, 20, 1000);
    layer.clear(); // 池子現在是滿的,而且沒有經過任何回合邊界
    expect(telegraphPoolStats(scene).rings).toBeGreaterThan(0);
    expect(scene.textures.length).toBeGreaterThan(baseTextures);
    expect(scene.particleSystems.length).toBeGreaterThan(baseSystems);

    layer.dispose(); // TelegraphLayer 只走自己的 live —— 共用池子它碰不到
    expect(telegraphPoolStats(scene).rings).toBeGreaterThan(0);

    vfx.dispose(); // ← 出貨路徑
    expect(telegraphPoolStats(scene)).toEqual({ rings: 0, fills: 0, shocks: 0 });
    expect(scene.textures.length).toBe(baseTextures);
    expect(scene.particleSystems.length).toBe(baseSystems);
  });
});

describe("回收上限是後台可調的 (vfx-leak-reclaim)", () => {
  it("enabled=false 是止血閥 —— 完全不修剪,回到 #259 的行為", () => {
    cover("vfx-leak-reclaim");
    expect(ringCapForRoundBoundary({ ...DEFAULT_VFX_CLEANUP, enabled: false })).toBe(Infinity);
  });

  it("purgeSharedPoolsOnRoundEnd=false 時 cap 就是 maxPooledRings", () => {
    cover("vfx-leak-reclaim");
    const cap = ringCapForRoundBoundary({
      ...DEFAULT_VFX_CLEANUP,
      purgeSharedPoolsOnRoundEnd: false,
      maxPooledRings: 12,
    });
    expect(cap).toBe(12);
  });

  it("出貨預設 = 回合結束強制清空", () => {
    cover("vfx-leak-reclaim");
    expect(ringCapForRoundBoundary(DEFAULT_VFX_CLEANUP)).toBe(0);
  });

  it("讀不到 / 半寫壞的 override 一律退回出貨政策,絕不變成「不回收」", () => {
    cover("vfx-leak-reclaim");
    expect(readVfxCleanupPolicy(undefined)).toEqual(DEFAULT_VFX_CLEANUP);
    expect(readVfxCleanupPolicy({ schema: "config.model-lod@1" })).toEqual(DEFAULT_VFX_CLEANUP);
    // schema 對、欄位被截斷 —— 這一份如果被採用,maxPooledRings 會是 undefined,
    // trim 收到 NaN 就變成「一個都不留」,靜默地把設定變成它的相反
    expect(
      readVfxCleanupPolicy({
        id: "vfx-cleanup",
        schema: "config.vfx-cleanup@1",
        enabled: true,
        purgeSharedPoolsOnRoundEnd: false,
      }),
    ).toEqual(DEFAULT_VFX_CLEANUP);
  });

  it("完整的 override 會被採用(否則上面那些退回都是空話)", () => {
    cover("vfx-leak-reclaim");
    const doc = {
      id: "vfx-cleanup",
      schema: "config.vfx-cleanup@1" as const,
      enabled: true,
      purgeSharedPoolsOnRoundEnd: false,
      maxPooledRings: 40,
    };
    expect(readVfxCleanupPolicy(doc)).toEqual(doc);
    expect(ringCapForRoundBoundary(readVfxCleanupPolicy(doc))).toBe(40);
  });
});
