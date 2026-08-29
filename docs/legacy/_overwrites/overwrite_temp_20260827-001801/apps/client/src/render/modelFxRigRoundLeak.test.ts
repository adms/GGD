/**
 * 🧹 GH#782 —— 場地特效清不乾淨（owner 2026-08-27 現場回報）的**回合級洩漏守衛**。
 *
 * 量的是玩家真的付得出代價的東西：**回合邊界清完之後，場景每一類物件的數量**
 * （mesh / material / texture / transformNode / **animationGroup** / geometry）——
 * ⛔ 不是「有沒有呼叫到 dispose」。逐回合換新的 modelKey（真實情況：升級解鎖、
 * 殭屍加入、每回合換地圖 #145），連跑多個回合之後計數線要**平**，
 * ⛔ 不是單調上升 —— 這正是票上驗收①「連 3 回合 __ggdLifecycle() 計數線平」的
 * NullEngine 可判形式。
 *
 * ⚠️ 動畫軌那一欄是重點：`instantiateModelsToScene` 會把 AnimationGroup 一起
 * clone 進 `scene.animationGroups`，而 `root.dispose(false, true)` **一條都收不到**
 * （軌不是節點）—— 少了 `disposeClipGroups` 那幾行，這一欄就單調上升。
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { ModelFxRig, type ModelFxModelDoc } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";

/** 一份「像 glb 載進來」的容器：1 mesh + 1 material + 1 條 `stand` 動畫軌。 */
function makeContainer(scene: Scene, key: string): AssetContainer {
  const c = new AssetContainer(scene);
  const m = MeshBuilder.CreateBox(`${key}-body`, { size: 1 }, scene);
  const mat = new StandardMaterial(`${key}-mat`, scene);
  m.material = mat;
  const anim = new Animation(`${key}-a`, "scalingDeterminant", 30, Animation.ANIMATIONTYPE_FLOAT);
  anim.setKeys([
    { frame: 0, value: 1 },
    { frame: 30, value: 2 },
  ]);
  const g = new AnimationGroup(`stand`, scene);
  g.addTargetedAnimation(anim, m);
  c.meshes.push(m);
  c.rootNodes.push(m);
  c.materials.push(mat);
  c.animationGroups.push(g);
  if (m.geometry) c.geometries.push(m.geometry);
  // 真的載入器把資產放在容器裡、⛔ 不在場景裡 —— 場上只有 instantiate 的 clone。
  c.removeAllFromScene();
  return c;
}

function ev(modelKey: string): ModelFxSpawnEvent {
  return {
    caster: 1,
    modelKey,
    path: "radial",
    speed: 10,
    x: 0,
    z: 0,
    zone: 0,
    clip: "stand",
    instances: [
      { x: 0, z: 0, dx: 1, dz: 0, dist: 5, durationSec: 0.4 },
      { x: 0, z: 0, dx: -1, dz: 0, dist: 5, durationSec: 0.4 },
    ],
  } as unknown as ModelFxSpawnEvent;
}

interface Census {
  meshes: number;
  materials: number;
  textures: number;
  nodes: number;
  groups: number;
  geometries: number;
}

function census(scene: Scene): Census {
  return {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    nodes: scene.transformNodes.length,
    groups: scene.animationGroups.length,
    geometries: scene.geometries.length,
  };
}

describe("GH#782 modelFxRig 回合邊界不留殘（含動畫軌）", () => {
  it("逐回合換 modelKey 連打之後，回合邊界清完的場景計數線平；dispose 歸零", async () => {
    const scene = new Scene(new NullEngine());
    const containers = new Map<string, AssetContainer>();
    const rig = new ModelFxRig(scene, {
      resolveModel: (k): ModelFxModelDoc => ({ glbPath: `${k}.glb`, fxTint: [1, 0, 0] }),
      loadContainer: (p) => {
        const key = p.replace(/\.glb$/, "");
        let c = containers.get(key);
        if (!c) {
          c = makeContainer(scene, key);
          containers.set(key, c);
        }
        return Promise.resolve(c);
      },
    });

    const baseline = census(scene);
    const perRound: Census[] = [];
    const ROUNDS = 6;
    for (let r = 1; r <= ROUNDS; r++) {
      // 每回合 3 個**新的** modelKey，各施放兩次（重用路徑也要走到）
      for (let k = 0; k < 3; k++) {
        const key = `fx.r${r}.k${k}`;
        rig.spawn(ev(key));
        await Promise.resolve(); // 容器落地 → 回填
        await Promise.resolve();
        rig.tick(600); // 到期 → 回收進池
        rig.spawn(ev(key)); // 重用
        rig.tick(600);
      }
      // 回合邊界 —— 與 VfxSystem.resetForRound 同一套動作、同一個出貨 cap（24）
      rig.resetForRound();
      rig.trimPoolTo(24);
      perRound.push(census(scene));
    }

    // eslint-disable-next-line no-console
    console.log("[probe] baseline", baseline);
    perRound.forEach((c, i) => {
      // eslint-disable-next-line no-console
      console.log(`[probe] R${i + 1}`, c);
    });

    // ⭐ 核心斷言：池子饱和之後（cap 24），後半段每一欄都不再成長。
    const mid = perRound[Math.floor(ROUNDS / 2)]!;
    const last = perRound[ROUNDS - 1]!;
    for (const k of Object.keys(mid) as (keyof Census)[]) {
      expect(last[k], `場景 ${k} 在回合邊界清完之後仍在成長（${mid[k]} → ${last[k]}）`).toBeLessThanOrEqual(
        mid[k],
      );
    }

    // 離場：rig 造的每一個東西都要回家（容器是測試自己造的，另計）
    rig.dispose();
    for (const c of containers.values()) c.dispose();
    const after = census(scene);
    expect(after.groups, "dispose 之後場上還有動畫軌").toBe(0);
    scene.dispose();
  });
});
