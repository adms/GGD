/**
 * GH#368 — 商店 / 英靈殿 / 選擇英雄 / 補給站 站的是**跟競技場一樣大**的那一具。
 *
 * owner 2026-08-18:「多拉A夢在商店依然是巨大支，你是不是沒改到正常遊戲大小」
 * 「英靈殿許多英雄 3d model 並不是站直，下半身是傾斜」
 *
 * ⚠️ 這一份**不驗「函式存在」**。#150 的高度正規化本來就存在了 —— 它只是住在
 * 一條路徑（`ChampionView`）裡，而另外三條各自抄了自己的一份。所以斷言的是
 * 「三條路徑對同一具網格算出**同一個世界高度**」：任何一條退回 `doc.scale`，
 * 或任何一條漏掉 `hiddenPrimitives`，這裡就紅（失敗形態 ⑤：受測的不是出貨的
 * 那一個）。
 *
 * 夾具刻意做成**兩片圖元**：一具 0.5u 高的身體，加上一片墊在腳下 -0.4u 的
 * 血泥。那正是 16 隻 overlay 英雄的形狀，而它同時打壞兩件事 —— 高度正規化算的
 * 是 0.9u 而不是 0.5u（英雄變矮），落地又把血泥貼在地上（英雄浮起來）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetManager } from "../AssetManager";
import type { ModelDoc } from "@ggd/shared/content";
import { StorePreview } from "../StorePreview";
import { IntermissionScene } from "../intermission/IntermissionScene";
import { ChampionView } from "./ChampionView";
import { TARGET_HEIGHT } from "./modelSizing";

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** 0.5u body sitting on y=0, plus a `_primitive2` gore sheet hanging to -0.4u. */
function goreContainer(host: Scene): AssetContainer {
  const c = new AssetContainer(host);
  const root = new TransformNode("m", host);
  const body = MeshBuilder.CreateBox("m_primitive0", { width: 0.2, height: 0.5, depth: 0.2 }, host);
  body.position.y = 0.25;
  body.parent = root;
  const gore = MeshBuilder.CreateBox("m_primitive2", { width: 1, height: 0.02, depth: 1 }, host);
  gore.position.y = -0.4;
  gore.parent = root;
  c.meshes.push(body, gore);
  c.transformNodes.push(root);
  c.rootNodes.push(root);
  c.removeAllFromScene();
  return c;
}

const assetsFor = (host: Scene): AssetManager =>
  ({ load: () => Promise.resolve(goreContainer(host)) }) as unknown as AssetManager;

const DOC = {
  id: "champ.gore",
  schema: "model@1",
  // NOT the stand-in prefix: `bodyRelativeScale`/ChampionView would then read
  // the OTHER multiplier (#77) and the three paths would legitimately differ.
  glbPath: "assets/models/imported/gore.glb",
  scale: 7, // the wrong-by-construction number every preview scene used to obey
  collisionRadius: 0.5,
  hiddenPrimitives: [2],
  clipMap: { idle: "Idle" },
} as unknown as ModelDoc;

const REL = 0.65; // 小叮噹's authored exception

/**
 * The BODY's world box — never the whole hierarchy's.
 *
 * ⚠️ 這個區別是突變驗證抓出來的（失敗形態 ④：斷言方向跟缺陷無關）。第一版量的是
 * 整棵樹，而「身體+血泥」的**總高**在藏與不藏之下都是 1.17u —— 藏了就是
 * 1.8×0.65；沒藏就是 0.9u 的整體被正規化成同一個數字，只是裡面的身體縮成 65%。
 * 兩者的總高一模一樣，所以拿掉 `applyHiddenPrimitives` 測試照樣綠。
 * 玩家看到的是**身體**多大、腳踩在哪裡，所以量的必須是身體。
 */
function bodyBox(n: TransformNode): { height: number; feetY: number } {
  n.computeWorldMatrix(true);
  const body = n.getChildMeshes(false).find((m) => m.name.endsWith("_primitive0"))!;
  const world = body.getBoundingInfo().boundingBox;
  return {
    height: world.maximumWorld.y - world.minimumWorld.y,
    feetY: world.minimumWorld.y,
  };
}

describe("GH#368 · 四個場景的英雄一樣大，而且都不帶屍體", () => {
  it("競技場 / 商店預覽 / 補給站攤位 算出同一個世界高度", async () => {
    // ① 競技場 —— ChampionView.tryUpgradeToGlb（出貨路徑）
    const view = new ChampionView(scene, 1, "imported.gore", 0);
    view.tryUpgradeToGlb(assetsFor(scene), DOC, REL);
    await new Promise((r) => setTimeout(r, 0));
    const arena = view.declaredScale! * 0.5; // body is 0.5u native

    // ② 商店 / 英靈殿 / 選擇英雄 / 回合勝者卡 —— StorePreview.show
    const preview = new StorePreview(scene, assetsFor(scene));
    await preview.show(DOC, { relativeScale: REL });
    const store = bodyBox(preview.modelNode!);

    // ③ 補給站攤位 —— IntermissionScene.setChampion
    // `assets` is the scene's own ctor seam, and it must build its container on
    // the scene the ctor is about to create — hence the lazy ref (`load` is only
    // ever called from `setChampion`, i.e. after construction).
    let stallScene: Scene | null = null;
    const stall = new IntermissionScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      now: () => 0,
      assets: { load: () => Promise.resolve(goreContainer(stallScene!)) } as unknown as AssetManager,
    });
    stallScene = stall.scene;
    await stall.setChampion(DOC.glbPath, DOC.scale, 0, null, REL, DOC.hiddenPrimitives);
    const market = bodyBox((stall as unknown as { championRoot: TransformNode }).championRoot);

    // 正規化的是**身體**（0.5u），不是身體+血泥（0.9u）：漏掉 hiddenPrimitives
    // 的那一條會算出 1.8×0.65×(0.5/0.9)=0.65u，差 35%。
    expect(arena).toBeCloseTo(TARGET_HEIGHT * REL, 4);
    expect(store.height, "商店預覽的身體跟競技場不一樣大").toBeCloseTo(arena, 4);
    expect(market.height, "補給站攤位的身體跟競技場不一樣大").toBeCloseTo(arena, 4);

    // 而且**站在地上**：血泥被排除之後，腳底就是落地的那一點。
    expect(store.feetY, "商店預覽的英雄浮在台座上").toBeCloseTo(0, 4);
    expect(market.feetY, "補給站攤位的英雄浮在地上").toBeCloseTo(0, 4);

    preview.dispose();
    stall.dispose();
    view.dispose();
  });
});
