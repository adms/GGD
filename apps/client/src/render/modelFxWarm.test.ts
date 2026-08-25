/**
 * @visual-proof 🔥 GH#703 —— 冷快取第一次施放 0 頂點的閘。
 * ① 預熱過的 key，**第一發**就有幾何（⛔ 不是等回填）。
 * ② 名單從已註冊技能推導（模板巢狀容器也走得到），⛔ 不是手寫清單。
 * ③ GameApp 真的接了線（headless 建構不起來 —— 手法同 roundFxWiring）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { ModelFxRig } from "./modelFxRig";
import { collectSpawnModelFxKeys, spawnModelFxKeysInUse } from "@ggd/shared/content/modelFxWarmKeys";
import { Abilities } from "@ggd/shared/sim/content/registry";

describe("GH#703 cold-cache warm", () => {
  afterEach(() => Abilities.clear());

  it("① warm 之後的第一發，幾何當下就在（⛔ 不是死在下載完成之前）", async () => {
    const scene = new Scene(new NullEngine());
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    let loads = 0;
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1 }),
      loadContainer: () => ((loads += 1), Promise.resolve(container)),
    });
    rig.warm(["k"]);
    expect(loads, "warm 沒有踢起任何下載").toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    rig.spawn({
      modelKey: "k",
      travel: 0,
      lifeSec: 0.1,
      instances: [{ x: 0, z: 0, yawRad: 0 }],
    } as never);
    // ⭐ 斷言出貨場景樹：第一發的實例**此刻**就有帶頂點、enabled 的網格
    //    （VER 量到的正是「冷快取 0 頂點」—— 這裡就量頂點）。
    const spawned = scene.meshes.filter((m) => m !== mesh);
    expect(spawned.length, "冷快取第一發仍是空殼 —— 預熱沒有生效").toBeGreaterThan(0);
    const verts = spawned.reduce(
      (n, m) => n + (m.getVerticesData("position")?.length ?? 0),
      0,
    );
    expect(verts, "第一發的網格 0 頂點").toBeGreaterThan(0);
    expect(spawned.some((m) => m.isEnabled()), "第一發的網格被 disable 了").toBe(true);
    rig.dispose();
  });

  it("② 名單從註冊表推導，巢狀（perStrike）也走得到", () => {
    Abilities.register("t.a" as never, {
      id: "t.a",
      effects: [{ kind: "comboStrikes", perStrike: [{ kind: "spawnModelFx", modelKey: "deep.key" }] }],
    } as never);
    expect(spawnModelFxKeysInUse()).toContain("deep.key");
    expect(collectSpawnModelFxKeys([])).toEqual([]);
  });

  it("③ GameApp 接了線", () => {
    const src = readFileSync(fileURLToPath(new URL("../GameApp.ts", import.meta.url)), "utf8");
    expect(src.includes("warmModelFx(spawnModelFxKeysInUse())"), "GameApp 的預熱呼叫不見了").toBe(true);
  });
});
