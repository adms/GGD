/**
 * 🔦 **@visual-proof** —— GH#673-①：首發的光束**真的長出幾何**（⛔ 不是空殼）。
 *
 * BA lane 的像素證據（docs/_reports/beam_visual-proof_20260824-2240）抓到：
 * `acquire` 在 glb 未載時回空 root，「幾何晚幾幀補進來」那句註解**沒有人兌現**
 * （第三守則），而空節點入池循環 ⇒ 第 2 發（glb 已載 6 秒）照樣整發看不見。
 *
 * 可見性斷言：回填之後 axis 底下的 mesh **getVerticesData 有頂點** 且 isEnabled ——
 * 這是 NullEngine 上可判的「畫面上有東西」的最強形式（真像素證據在 BA 的 audition 頁,
 * 這一支是它的迴歸鎖）。
 *
 * 突變（真跑過）：把容器載完的回填迴圈拿掉 ⇒ ①紅（首發永遠空殼）。
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ModelFxRig } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";

function makeContainer(scene: Scene): AssetContainer {
  const c = new AssetContainer(scene);
  const m = MeshBuilder.CreateBox("beam", { size: 1 }, scene);
  c.meshes.push(m);
  c.rootNodes.push(m);
  return c;
}

const EV: ModelFxSpawnEvent = {
  caster: 1, modelKey: "test.beam", path: "static", speed: 0, x: 0, z: 0, zone: 0,
  origin: "ability:test", instances: [{ x: 0, z: 0, dx: 1, dz: 0, dist: 0, durationSec: 2 }],
} as unknown as ModelFxSpawnEvent;

function meshVertexCount(root: { getChildMeshes?: () => AbstractMesh[] }): number {
  const meshes = root.getChildMeshes?.() ?? [];
  let n = 0;
  for (const m of meshes) {
    if (!m.isEnabled(false)) continue; // 只看自己這一格,⛔ 不看祖先鏈(root 可能還沒 setEnabled)
    n += m.getVerticesData?.(VertexBuffer.PositionKind)?.length ?? 0;
  }
  return n;
}

describe("@visual-proof modelFxRig 首發回填 (GH#673-①)", () => {
  it("glb 慢到：首發先空、容器到位那一刻**畫面上長出幾何**；空殼不入池循環", async () => {
    const scene = new Scene(new NullEngine());
    let resolveLoad: (c: AssetContainer) => void = () => undefined;
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "x.glb", fxLongAxis: "y" as const }),
      loadContainer: () => new Promise<AssetContainer>((r) => { resolveLoad = r; }),
    } as never);

    // 首發：容器還在路上 ⇒ 準時出現但（暫時）沒有幾何
    expect(rig.spawn(EV)).toBe(1);
    const axis = scene.transformNodes.find((n) => n.name.startsWith("modelfx-axis-"))!;
    expect(axis, "rig 沒生節點 ⇒ 量尺作廢").toBeDefined();
    expect(meshVertexCount(axis), "容器還沒到就有幾何 ⇒ 這條測試沒在測回填").toBe(0);

    // 容器到位 ⇒ ①c 回填**還活著的**首發
    resolveLoad(makeContainer(scene));
    await Promise.resolve(); await Promise.resolve();
    expect(
      meshVertexCount(axis),
      "容器載完了首發還是空殼 —— 「幾何晚幾幀補進來」又變回一句沒人兌現的註解",
    ).toBeGreaterThan(0);

    // 回收再施放（池子路徑）⇒ 撈回來的那具也要有幾何（①b:空殼不循環）
    rig.tick(EV as never, 10_000 as never);
    (rig as unknown as { releaseAll?: () => void }).releaseAll?.();
    rig.spawn(EV);
    const axes = scene.transformNodes.filter((n) => n.name.startsWith("modelfx-axis-"));
    const anyWithGeometry = axes.some((a) => meshVertexCount(a) > 0);
    expect(anyWithGeometry, "第 2 發（容器已載）仍然是空殼 —— 池子在循環空節點").toBe(true);
    rig.dispose();
  });
});
