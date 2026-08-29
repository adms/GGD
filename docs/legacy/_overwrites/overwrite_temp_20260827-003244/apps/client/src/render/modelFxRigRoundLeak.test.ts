/**
 * 🧹 GH#782 —— 場地特效清不乾淨（owner 2026-08-27）：modelFxRig 回收路徑的洩漏守衛。
 *
 * @visual-proof 靜態可判的可見性不變量（NullEngine 畫不出像素，但這兩條不用渲染
 * 就判得出來）：② 斷言 retire 之後**共用來源材質仍掛在場上、共用貼圖的
 * internal texture 非 null** —— 在此之前 `dispose(false, true)` 把它們陪葬,
 * 同 key 之後每一發都是全黑/隱形（畫面上跟「本來就沒特效」一模一樣）。
 * 真瀏覽器的 3 回合 `__ggdLifecycle()` 平線由主 session 補拍（見票上驗收①③）。
 *
 * 量的是**回合邊界清完之後場景每一類物件的數量**（含 ⭐ animationGroups ——
 * 軌不是節點，`root.dispose()` 收不到），⛔ 不是「有沒有呼叫到 dispose」。
 * 這是票上驗收①「連 3 回合 `__ggdLifecycle()` 計數線平」的 NullEngine 可判形式。
 *
 * 兩條承重線：
 *  ① 固定內容連打 6 回合（釋放量刻意超過池上界 ⇒ release 溢位與 trimPoolTo
 *     兩條 retire 路徑**每回合都真的跑**），回合邊界的計數線**平**；
 *  ② retire ⛔ 不殺共用快取：容器的來源材質/貼圖要活過 retire（在此之前
 *     `root.dispose(false, true)` 把共用材質與貼圖一起陪葬 —— 同 key 之後
 *     每一發都會變黑），而 rig 自己的 `-fxtint` clone 要真的離場。
 *
 * 突變（實跑）：`trimPoolTo` 拿掉 `disposeClipGroups(nodes.axis)` ⇒ ①紅
 * （anim 軌逐回合單調上升）。改回來 ⇒ 綠。
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { ModelFxRig, type ModelFxModelDoc } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";

/** 一份「像 glb 載進來」的容器：1 mesh + 1 帶貼圖的材質 + 1 條 `stand` 軌。 */
function makeContainer(scene: Scene, key: string): AssetContainer {
  const c = new AssetContainer(scene);
  const m = MeshBuilder.CreateBox(`${key}-body`, { size: 1 }, scene);
  const mat = new StandardMaterial(`${key}-mat`, scene);
  mat.emissiveTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 0, 0, 255]), 1, 1, scene);
  mat.emissiveTexture.name = `${key}-tex`;
  m.material = mat;
  const anim = new Animation(`${key}-a`, "scalingDeterminant", 30, Animation.ANIMATIONTYPE_FLOAT);
  anim.setKeys([{ frame: 0, value: 1 }, { frame: 30, value: 2 }]);
  const g = new AnimationGroup("stand", scene);
  g.addTargetedAnimation(anim, m);
  c.meshes.push(m);
  c.rootNodes.push(m);
  c.materials.push(mat);
  c.textures.push(mat.emissiveTexture);
  c.animationGroups.push(g);
  if (m.geometry) c.geometries.push(m.geometry);
  c.removeAllFromScene(); // 真的載入器把資產放容器裡，⛔ 不在場景裡
  return c;
}

function ev(modelKey: string): ModelFxSpawnEvent {
  return {
    caster: 1, modelKey, path: "radial", speed: 10, x: 0, z: 0, zone: 0, clip: "stand",
    instances: [
      { x: 0, z: 0, dx: 1, dz: 0, dist: 5, durationSec: 0.4 },
      { x: 0, z: 0, dx: -1, dz: 0, dist: 5, durationSec: 0.4 },
    ],
  } as unknown as ModelFxSpawnEvent;
}

function census(scene: Scene): Record<string, number> {
  return {
    meshes: scene.meshes.length, materials: scene.materials.length,
    textures: scene.textures.length, nodes: scene.transformNodes.length,
    groups: scene.animationGroups.length, geometries: scene.geometries.length,
  };
}

function makeRig(scene: Scene, containers: Map<string, AssetContainer>, tint: boolean): ModelFxRig {
  return new ModelFxRig(scene, {
    resolveModel: (k): ModelFxModelDoc =>
      tint ? { glbPath: `${k}.glb`, fxTint: [1, 0, 0] } : { glbPath: `${k}.glb` },
    loadContainer: (p) => {
      const key = p.replace(/\.glb$/, "");
      let c = containers.get(key);
      if (!c) containers.set(key, (c = makeContainer(scene, key)));
      return Promise.resolve(c);
    },
  });
}

describe("🧹 GH#782 modelFxRig 回合邊界不留殘", () => {
  it("① 連打 6 回合（兩條 retire 路徑每回合都跑），回合邊界清完的計數線**平**", async () => {
    const scene = new Scene(new NullEngine());
    const containers = new Map<string, AssetContainer>();
    const rig = makeRig(scene, containers, true);
    const rounds: Record<string, number>[] = [];
    for (let r = 1; r <= 6; r++) {
      for (const key of ["fx.a", "fx.b", "fx.c"]) {
        // 7 發 ×2 具＝14 個釋放 > per-key 池上界 12 ⇒ release 溢位的 retire 也走到
        for (let s = 0; s < 7; s++) {
          rig.spawn(ev(key));
          await Promise.resolve(); // 容器落地 → 回填
          await Promise.resolve();
        }
        rig.tick(600); // 全部到期 → 回收
      }
      rig.resetForRound();
      rig.trimPoolTo(24); // ＝ VfxSystem.resetForRound 的出貨 cap（maxPooledRings）
      rounds.push(census(scene));
    }
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i], `R${i + 1} 的場景計數與 R1 不同 —— 有東西在漏`).toEqual(rounds[0]);
    }
    rig.dispose(); // 連容器一起收
    expect(census(scene).groups, "dispose 之後場上還有動畫軌").toBe(0);
    scene.dispose();
  });

  it("② retire ⛔ 不殺共用快取：來源材質/貼圖活著、`-fxtint` clone 離場", async () => {
    for (const tint of [false, true]) {
      const scene = new Scene(new NullEngine());
      const containers = new Map<string, AssetContainer>();
      const rig = makeRig(scene, containers, tint);
      rig.spawn(ev("fx.share"));
      await Promise.resolve();
      await Promise.resolve();
      rig.tick(600);
      rig.trimPoolTo(0); // 全部走 retire —— 在此之前這一步殺掉共用材質與貼圖
      const src = containers.get("fx.share")!;
      const mat = src.materials[0]!;
      const tex = src.textures[0]!;
      expect(scene.materials.includes(mat), `tint=${tint}: retire 把共用來源材質陪葬了`).toBe(true);
      expect(tex.getInternalTexture(), `tint=${tint}: retire 把共用貼圖陪葬了`).not.toBeNull();
      expect(
        scene.materials.filter((m) => m.name.endsWith("-fxtint")).length,
        "rig 自己的 -fxtint clone 沒離場",
      ).toBe(0);
      rig.dispose();
      scene.dispose();
    }
  });
});
