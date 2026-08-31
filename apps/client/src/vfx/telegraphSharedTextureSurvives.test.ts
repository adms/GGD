/**
 * telegraph-shared-texture-survives — 回合邊界的回收不可以讓預告圈畫不出來。
 *
 * ── 這條守衛的來歷 ────────────────────────────────────────────────────
 * #262（回收洩漏的粒子/mesh）第一版的修法在回合邊界對 fill / shock 網格呼叫
 * `m.dispose(false, true)`。Babylon 的第二個參數
 * (`disposeMaterialAndTextures`) 會一路傳到 `material.dispose(false, true)`，
 * 而 fill 的材質 emissive/opacity 兩個槽指的都是 `sharedFor()`
 * **每個 scene 只建一次的共用 `circleTex`** —— 於是第一個回合邊界就把它殺了。
 *
 * `trimTelegraphPools` 不刪 `sharedByScene` 的條目，所以 `s.circleTex` 仍指著
 * 那張死掉的 Texture。第二回合建出來的新材質又指回同一張，`isBlocking` 預設
 * true → `isReadyOrNotBlocking()` 恆 false → `StandardMaterial.isReadyForSubMesh`
 * 直接 `return false` → **那個 submesh 一張 frame 都不會被畫**。
 *
 * 症狀是 #228 的核心元件（隨吟唱填滿的魔法陣圓盤）在**出貨預設**下從第 2 回合起
 * 靜悄悄消失。外圈 ring 沒有貼圖所以還在 —— 肉眼看像「預告變弱」而不是「不見」。
 *
 * ── 為什麼舊的 33 條測試全綠 ──────────────────────────────────────────
 * 它們斷言的是 `scene.meshes.length > baseMeshes`（**屬性**：網格在不在場景圖上），
 * 而缺陷是「材質永遠 ready 不了」（**行為**：畫不畫得出來）。一個 ready 不了的
 * mesh 確實還在 `scene.meshes` 裡。這正是第⑦種故障：掃屬性代替掃行為。
 *
 * 所以這一條**只讀 `isReadyOrNotBlocking()`**，那是 Babylon 自己在
 * `isReadyForSubMesh` 裡用來決定畫不畫的同一個問題。
 *
 * 突變驗證（2026-07-30 實跑）：
 *   1. `disposeButKeepSharedTextures` 改回 `m.dispose(false, true)`
 *      → 「第二回合的填充仍畫得出來」紅（`isReadyOrNotBlocking()` = false）
 *   2. 材質那行 `mat?.dispose(true, false)` 改成 `mat?.dispose(true, true)`
 *      → 同一條紅（第二個參數才是元凶，不是 dispose 材質這件事本身）
 *   3. 整個 `if (cap === 0)` 區塊拿掉
 *      → 「cap 0 要真的回收掉 fill/shock」紅（確認這條沒有把洩漏修法一起否定掉）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { cover } from "@ggd/shared/testkit/cover";

// QualityController 讀 WebGL 能力，在 NullEngine 下沒有意義。
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: () => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TelegraphLayer } from "./TelegraphLayer";
import { trimTelegraphPools } from "./Telegraph";

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

function newLayer(): TelegraphLayer {
  return new TelegraphLayer(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    castProgress: () => 1,
  });
}

/** 演一回合的預告圈，讓 fill 網格真的被建出來又還回池子。 */
function playRound(layer: TelegraphLayer, casts: number, startMs: number): number {
  let now = startMs;
  for (let i = 0; i < casts; i++) {
    layer.begin(i, { kind: "circle", x: i % 9, z: (i * 3) % 9, radius: 1 + i * 0.13 }, "enemy", 600, now);
    now += 16;
    layer.update(now);
  }
  now += 5_000; // 全部演完並 release 回池子
  layer.update(now);
  return now;
}

const firstFillMaterial = (): StandardMaterial => {
  const m = scene.meshes.find((x) => x.name === "telegraph-fill") as Mesh | undefined;
  if (!m) throw new Error("沒有任何 telegraph-fill 網格 —— 這一輪根本沒演出來，測試前提就壞了");
  return m.material as StandardMaterial;
};

describe("回合邊界回收後，預告圈仍畫得出來 (telegraph-shared-texture-survives)", () => {
  it("第二回合的魔法陣填充仍然 ready —— 讀的是行為，不是網格數量", () => {
    cover("telegraph-shared-texture-survives");
    const layer = newLayer();

    let now = playRound(layer, 5, 1_000);
    const r1 = firstFillMaterial();
    expect(r1.emissiveTexture).toBeNull();
    expect(r1.opacityTexture?.isReadyOrNotBlocking()).toBe(true);

    // 回合邊界：出貨預設就是 cap 0（purgeSharedPoolsOnRoundEnd: true）
    layer.clear();
    trimTelegraphPools(scene, 0);

    now = playRound(layer, 3, now + 5_000);
    const r2 = firstFillMaterial();
    // ⛔ 這兩行就是這條守衛的全部。改壞 disposeButKeepSharedTextures 就會紅。
    expect(r2.emissiveTexture).toBeNull();
    expect(r2.opacityTexture?.isReadyOrNotBlocking()).toBe(true);

    layer.dispose();
  });

  it("撐過三個回合邊界都還畫得出來（不是只有第二回合僥倖）", () => {
    cover("telegraph-shared-texture-survives");
    const layer = newLayer();
    let now = 1_000;
    for (let round = 0; round < 4; round++) {
      now = playRound(layer, 3, now + 5_000);
      const mat = firstFillMaterial();
      expect(mat.emissiveTexture, `第 ${round + 1} 回合`).toBeNull();
      layer.clear();
      trimTelegraphPools(scene, 0);
    }
    layer.dispose();
  });

  it("而且 cap 0 真的有回收掉 fill / shock —— 沒有把洩漏修法一起否定掉", () => {
    cover("telegraph-shared-texture-survives");
    // 這一條是反向的保險：如果為了保住貼圖乾脆不 dispose 網格，#262 就白做了。
    const layer = newLayer();
    playRound(layer, 5, 1_000);
    layer.clear();
    expect(trimTelegraphPools(scene, 0)).toBeGreaterThan(0);
    expect(scene.meshes.filter((m) => m.name === "telegraph-fill")).toEqual([]);
    layer.dispose();
  });
});
