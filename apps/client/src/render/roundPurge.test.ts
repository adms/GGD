/**
 * 🧹 GH#819 —— 回合間完整清理的承重守衛（含 GH#558① 的兩個方向）。
 *
 * ① 出 combat 的邊界真的觸發 purge：場上的特效幾何**回落到基線**
 *    （⛔ 驗機制不驗常數 —— 斷言是「回到 spawn 之前的計數」，不是 394/176）。
 * ② GH#558① 兩個方向：rig 收自己生的實例（少），⛔ 不收借來的共用容器（在）。
 * ③ AssetManager 的 purge 只丟 fx-only 的條目 —— shared 與雙標籤一份都不碰，
 *    丟過的條目下一次 load 拿到**新的**Promise（真的重載，⛔ 不是舊屍體）。
 * ④ 就緒閘：盤點載入完成前 `gateActive("combat")`＝true（＋進度數字），
 *    全部落地後放行；保險絲到期也放行（一個卡死的閘是另一種 lag）。
 * ⑤ 接線：GameApp 每幀餵 phase、綁手動按鈕；PerfOverlay 的 🧹 走同一支。
 *    （GameApp headless 建構不起來 —— 手法同 modelFxWarm ③ / roundFxWiring。）
 *
 * 突變（實跑）：`purgeNow` 主體清空（直接 return null）⇒ ①④ 紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { ModelFxRig } from "./modelFxRig";
import { AssetManager } from "./AssetManager";
import { RoundPurgeCoordinator, GATE_FUSE_MS, sceneCounts, type RoundPurgeDeps } from "./roundPurge";

const tick = () => new Promise((r) => setTimeout(r, 0));

function fxWorld() {
  const scene = new Scene(new NullEngine());
  const container = new AssetContainer(scene);
  const src = MeshBuilder.CreateBox("fx-src", { size: 1 }, scene);
  scene.removeMesh(src); // 容器素材不住場上 —— 和 LoadAssetContainerAsync 的形狀一致
  container.meshes.push(src);
  container.rootNodes.push(src);
  let loads = 0;
  const rig = new ModelFxRig(scene, {
    resolveModel: () => ({ glbPath: "assets/models/fx.glb", scale: 1 }),
    loadContainer: () => ((loads += 1), Promise.resolve(container)),
  });
  const spawn = () =>
    rig.spawn({ modelKey: "k", travel: 0, lifeSec: 5, instances: [{ x: 0, z: 0, yawRad: 0 }] } as never);
  return { scene, container, src, rig, spawn, loads: () => loads };
}

function makeDeps(w: ReturnType<typeof fxWorld>, over: Partial<RoundPurgeDeps> = {}): RoundPurgeDeps {
  return {
    mode: () => "full",
    counts: () => sceneCounts(w.scene),
    softReset: () => w.rig.resetForRound(),
    hardResetModelFx: () => w.rig.hardReset(),
    purgeFxContainers: () => 0,
    inventory: () => [],
    loadAsset: () => Promise.resolve(null),
    warmAfterLoad: () => {},
    ...over,
  };
}

describe("GH#819 回合間完整清理", () => {
  it("① 出 combat 的邊界觸發 purge：特效幾何回落到基線 ＋ ② 共用容器活著", async () => {
    const w = fxWorld();
    const baseline = sceneCounts(w.scene);
    const c = new RoundPurgeCoordinator(makeDeps(w));
    c.sync("combat");
    for (let i = 0; i < 4; i++) w.spawn();
    await tick(); // 容器落地 → 回填幾何
    expect(sceneCounts(w.scene).mesh, "spawn 之後場上沒長東西 —— 夾具壞了").toBeGreaterThan(baseline.mesh);

    c.sync("resolution"); // ⭐ 出 combat 的那一幀 —— 出貨路徑的觸發點
    await tick();
    const after = sceneCounts(w.scene);
    expect(after.mesh, "purge 之後特效網格沒回落到基線").toBe(baseline.mesh);
    expect(after.node, "purge 之後特效節點沒回落到基線").toBe(baseline.node);
    // ② GH#558① 方向 b：借來的共用容器**不准**被 rig 陪葬
    expect(w.src.isDisposed(), "purge 把共用容器的來源素材一起殺了（GH#558① 復發）").toBe(false);
    expect(c.lastReport?.mode).toBe("full");

    // off ＝ 逐位元回到之前：再 spawn、再過邊界，一個都不清
    const off = new RoundPurgeCoordinator(makeDeps(w, { mode: () => "off" }));
    off.sync("combat");
    w.spawn();
    await tick();
    const grown = sceneCounts(w.scene).mesh;
    off.sync("resolution");
    await tick();
    expect(sceneCounts(w.scene).mesh, "off 檔位還是清了 —— rollback 不成立").toBe(grown);
    w.rig.dispose();
    expect(w.src.isDisposed(), "rig.dispose() 又去 dispose 借來的容器（GH#558① 本體）").toBe(false);
  });

  it("② hardReset 之後 in-flight 的舊容器不落地：下一發重新要一份", async () => {
    const scene = new Scene(new NullEngine());
    let resolveLoad: (c: AssetContainer | null) => void = () => {};
    let loads = 0;
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/fx.glb", scale: 1 }),
      loadContainer: () => ((loads += 1), new Promise((r) => (resolveLoad = r))),
    });
    rig.spawn({ modelKey: "k", travel: 0, lifeSec: 5, instances: [{ x: 0, z: 0, yawRad: 0 }] } as never);
    expect(loads).toBe(1);
    rig.hardReset(); // 世代 +1 —— 舊載入醒來時要放手
    resolveLoad(new AssetContainer(scene));
    await tick();
    rig.spawn({ modelKey: "k", travel: 0, lifeSec: 5, instances: [{ x: 0, z: 0, yawRad: 0 }] } as never);
    expect(loads, "hardReset 之後沒有重新要容器 —— 舊世代的引用被留下來了").toBe(2);
  });

  it("③ AssetManager 只丟 fx-only 的容器；丟過的下一次 load 是新的一份", async () => {
    const scene = new Scene(new NullEngine());
    const am = new AssetManager(scene);
    const fxOnly = am.load("assets/models/only-fx.glb", "fx");
    am.load("assets/models/champ.glb"); // shared（預設）
    am.load("assets/models/both.glb", "fx");
    am.load("assets/models/both.glb"); // 同路徑兩族 ⇒ 視同 shared 保留
    expect(am.containerCount).toBe(3);
    expect(am.purgeFxContainers(), "只該丟 fx-only 那一份").toBe(1);
    expect(am.containerCount, "shared 與雙標籤的條目被丟了").toBe(2);
    expect(am.load("assets/models/champ.glb")).toBe(am.load("assets/models/champ.glb"));
    expect(am.load("assets/models/only-fx.glb", "fx"), "purge 過的條目還是舊 Promise —— 沒真的重載").not.toBe(fxOnly);
    await tick(); // 讓 in-flight 的 dispose 鏈落地（不能擲）
  });

  it("④ 就緒閘：載完才放行；保險絲到期也放行", async () => {
    const w = fxWorld();
    let now = 0;
    const pend: Array<() => void> = [];
    const c = new RoundPurgeCoordinator(
      makeDeps(w, {
        inventory: () => ["a.glb", "b.glb"],
        loadAsset: () => new Promise<null>((r) => pend.push(() => r(null))),
        now: () => now,
      }),
    );
    const done = c.purgeNow("full");
    await tick();
    expect(c.ready, "盤點還沒載完就 ready 了").toBe(false);
    expect(c.gateActive("combat"), "沒 ready 進 combat 竟然不蓋遮罩").toBe(true);
    expect(c.gateActive("intermission"), "商店階段不該蓋遮罩").toBe(false);
    expect(c.progress).toEqual({ loaded: 0, total: 2 });
    pend[0]!();
    await tick();
    expect(c.progress.loaded).toBe(1);
    expect(c.gateActive("combat"), "載到一半就放行了").toBe(true);
    pend[1]!();
    await done;
    expect(c.ready, "全部落地了還不 ready").toBe(true);
    expect(c.gateActive("combat")).toBe(false);

    // 保險絲：永遠載不完的一份不可以把回合卡死
    const stuck = new RoundPurgeCoordinator(
      makeDeps(w, { inventory: () => ["never.glb"], loadAsset: () => new Promise(() => {}), now: () => now }),
    );
    void stuck.purgeNow("full");
    await tick();
    expect(stuck.gateActive("combat")).toBe(true);
    now += GATE_FUSE_MS + 1;
    expect(stuck.gateActive("combat"), "保險絲到期還不放行 —— 卡死的閘是另一種 lag").toBe(false);
  });

  it("⑤ 接線：GameApp 每幀餵 phase＋綁手動接點；PerfOverlay 的 🧹 走同一支", () => {
    const app = readFileSync(fileURLToPath(new URL("../GameApp.ts", import.meta.url)), "utf8");
    expect(app.includes("this.roundPurge.sync("), "GameApp 沒把 phase 餵給 roundPurge").toBe(true);
    expect(app.includes("bindRoundPurge(this.roundPurge)"), "手動按鈕的接點沒綁").toBe(true);
    expect(app.includes('this.assets.load(glbPath, "fx")'), "modelFx 容器沒帶 fx 標籤 —— purge 永遠 0 份").toBe(true);
    const pill = readFileSync(fileURLToPath(new URL("../ui/PerfOverlay.tsx", import.meta.url)), "utf8");
    expect(pill.includes("triggerManualPurge"), "PerfOverlay 的 🧹 按鈕不見了").toBe(true);
  });
});
