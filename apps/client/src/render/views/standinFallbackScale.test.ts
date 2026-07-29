/**
 * #77 —— 替身回退的 SCALE / TINT / 真模型指向,量在**最後真的被寫進去的節點上**。
 *
 * 為什麼不能只斷言 JSON 有那個數字(失敗形態 ②/⑦):這個 bug 過去的形狀就是
 * 「資料是對的、正規化是對的、而中間沒有人問過現在腳下這具網格是誰」。
 * `_standin-overrides.json` 一直帶著 relativeScale;`ChampionView` 一直乘;
 * 唯獨三條回退路徑上乘的是**為另一具網格算的**那個數字,或者根本沒有乘。
 * 所以這一支全部走真的 `tryUpgradeToGlb`,讀的是 `bodyRoot.scaling` /
 * `glbRoot.scaling`(透過 `declaredScale`),不是任何 doc 欄位。
 *
 * ⚠️ 材質斷言的老陷阱同樣適用:`applyModelTint` 會 **clone** 材質再指回
 * `mesh.material`,所以任何對**原始**材質物件寫的斷言都會過。下面 tint 那一段
 * 讀的是 `mesh.material`(最終物件),不是 container 裡那顆。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ModelDoc } from "@ggd/shared/content";
import {
  standinRelativeScaleOf,
  modelRelativeScaleOf,
  type StandinScaleFields,
} from "@ggd/shared/content/standinScale";
import { ChampionView, TARGET_HEIGHT } from "./ChampionView";
import { applyModelTint, resolveModelTint } from "./modelTint";
import type { AssetManager } from "../AssetManager";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import {
  generateAllVoxelSkins,
  voxelSkinInputOf,
  type ChampionLike,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";

const REPO = join(__dirname, "../../../../..");

/** 出貨的那一份表 —— ContentDb 執行期抓的是同一個檔案。 */
const OVERRIDES = (
  JSON.parse(readFileSync(join(REPO, "content/models/_standin-overrides.json"), "utf8")) as {
    overrides: Record<string, StandinScaleFields & { note?: string }>;
  }
).overrides;

/** 四具共用替身之一,回退時真正會被載進來的那條路徑。 */
const STANDIN_GLB = "assets/models/champions/blocky-mage.glb";
/** overlay 的路徑形狀(blizzardOverlay.overlayModelDoc 合成出來的)。 */
const BLIZZARD_GLB = "assets/blizzard-local/models/H02S.glb";

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

function makeContainer(nativeHeight: number, label: string): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox(`${label}-body`, { size: 1 }, scene);
  mesh.scaling.y = nativeHeight; // 單位方塊拉高 → 原生高度是精確的
  mesh.material = new StandardMaterial(`${label}-mat`, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  container.materials.push(mesh.material);
  container.removeAllFromScene();
  return container;
}

const docFor = (glbPath: string): ModelDoc =>
  ({
    id: "test.model",
    schema: "model@1",
    glbPath,
    scale: 1,
    collisionRadius: 0.6,
    clipMap: {
      idle: "Stand",
      run: "Walk",
      attack: "Attack",
      cast: "Spell",
      hurt: "Stand",
      death: "Death",
    },
  }) as ModelDoc;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/**
 * 真的 recipe —— 走出貨的生成器,不是手寫一個假物件(失敗形態 ⑤)。
 * 只把 `preferVoxelBody` 蓋成想測的那條路,其餘欄位一律是出貨值。
 */
function skinFor(championId: string, preferVoxelBody: boolean): VoxelSkinRecipe {
  const doc = JSON.parse(
    readFileSync(join(REPO, "content/champions", `${championId}.json`), "utf8"),
  ) as ChampionLike;
  const { recipes } = generateAllVoxelSkins([voxelSkinInputOf(doc)]);
  const r = recipes.get(championId);
  expect(r, `${championId} 沒有生成 recipe`).toBeDefined();
  return { ...r!, preferVoxelBody };
}

/** `bodyRoot`(程序生成的體素身體)上最後真的被寫進去的等比 scaling。 */
function bodyScale(view: ChampionView, entityId: number): number {
  const node = view.root
    .getChildTransformNodes(true)
    .find((n) => n.name === `champ-${entityId}-body`);
  expect(node, "bodyRoot").toBeDefined();
  return node!.scaling.x;
}

describe("#77 替身回退 — scale 走到 mesh 上", () => {
  it("preferVoxelBody 的英雄:體素身體真的被縮放了(修之前是 1.0,而且全綠)", async () => {
    cover("standin-fallback-render");
    // 30-002 變態紳士:地圖 usca 3.00,基本型 ORKN 在同一具模型上是 1.00。
    // `tryUpgradeToGlb` 在 preferVoxelBody 那一行提早 return,而在此之前那條
    // return 之後沒有任何人乘過倍率 —— 整個 3× 變身梗從來沒有到過畫面上。
    const o030 = OVERRIDES["godie-o030"]!;
    const want = standinRelativeScaleOf(o030);
    expect(want).toBe(3);

    const assets = { load: () => Promise.resolve(makeContainer(2, "never")) } as unknown as AssetManager;
    const view = new ChampionView(scene, 7701, "champ.sela", 1, { skin: skinFor("godie-o030", true) });
    view.tryUpgradeToGlb(assets, docFor(STANDIN_GLB), modelRelativeScaleOf(o030), want);
    await flush();

    expect(view.declaredScale, "preferVoxelBody 不該採用任何 glb").toBeNull();
    expect(bodyScale(view, 7701)).toBeCloseTo(3, 5);
    view.dispose();
  });

  it("小叮噹回退之後是小的:0.65,不是 1.0", async () => {
    cover("standin-fallback-render");
    const n00b = OVERRIDES["godie-n00b"]!;
    const want = standinRelativeScaleOf(n00b);
    const assets = { load: () => Promise.resolve(makeContainer(2, "ignored")) } as unknown as AssetManager;

    // (a) 體素身體那條路
    const voxel = new ChampionView(scene, 7702, "champ.sela", 1, { skin: skinFor("godie-n00b", true) });
    voxel.tryUpgradeToGlb(assets, docFor(STANDIN_GLB), modelRelativeScaleOf(n00b), want);
    await flush();
    expect(bodyScale(voxel, 7702)).toBeCloseTo(0.65, 5);
    expect(bodyScale(voxel, 7702)).toBeLessThan(0.7); // 「一隻小的藍色熊貓」
    voxel.dispose();

    // (b) 共用方塊人那條路(overlay 缺席)—— 量的是最終的渲染高度
    const NATIVE = 1.8;
    const mesh = new ChampionView(scene, 7703, "champ.sela", 1);
    mesh.tryUpgradeToGlb(
      { load: () => Promise.resolve(makeContainer(NATIVE, "blocky")) } as unknown as AssetManager,
      docFor(STANDIN_GLB),
      modelRelativeScaleOf(n00b),
      want,
    );
    await flush();
    expect(mesh.declaredScale).not.toBeNull();
    expect(mesh.declaredScale! * NATIVE).toBeCloseTo(TARGET_HEIGHT * 0.65, 5);
    expect(mesh.declaredScale! * NATIVE).toBeLessThan(TARGET_HEIGHT); // 比一般英雄矮
    mesh.dispose();
  });

  it("同一位英雄,兩具身體各拿各的倍率 —— 死亡騎士不會變成 12.2u 的方塊人", async () => {
    cover("standin-fallback-render");
    // godie-h02s:WC3 模型要 6.795(因為 H02S.glb 裡有一片殘留特效面片把包圍盒
    // 撐到 21.83u),地圖的 usca 卻只有 1.00。把 6.795 照抄到方塊人身上,
    // 1.8u × 6.795 = 12.2u。
    const h02s = OVERRIDES["godie-h02s"]!;
    const model = modelRelativeScaleOf(h02s);
    const standin = standinRelativeScaleOf(h02s);
    expect(model).toBeCloseTo(6.795, 3);
    expect(standin).toBe(1);

    const NATIVE = 3;
    const mk = (label: string) =>
      ({ load: () => Promise.resolve(makeContainer(NATIVE, label)) }) as unknown as AssetManager;

    const wc3 = new ChampionView(scene, 7704, "champ.thorne", 1);
    wc3.tryUpgradeToGlb(mk("wc3"), docFor(BLIZZARD_GLB), model, standin);
    const fallback = new ChampionView(scene, 7705, "champ.thorne", 1);
    fallback.tryUpgradeToGlb(mk("blocky"), docFor(STANDIN_GLB), model, standin);
    await flush();

    // 同一個 relativeScale 進去,兩具身體出來的**最終 mesh scale** 不一樣
    expect(wc3.declaredScale! * NATIVE).toBeCloseTo(TARGET_HEIGHT * 6.795, 4);
    expect(fallback.declaredScale! * NATIVE).toBeCloseTo(TARGET_HEIGHT, 4);
    expect(fallback.declaredScale! * NATIVE).toBeLessThan(2.0); // 不再是 12.2u
    wc3.dispose();
    fallback.dispose();
  });

  it("回退保留 TINT:w3x 頂點色照樣落在替身身體最後的材質上", () => {
    cover("standin-fallback-render");
    // 海克力斯的 #49 黑紅(uclr 80/80/80 → 0.3137)。這裡刻意**不載任何 glb**,
    // 走的就是最裸的回退:程序生成的體素身體。
    const champ = JSON.parse(
      readFileSync(join(REPO, "content/champions/godie-hapm.json"), "utf8"),
    ) as { tint?: [number, number, number] };
    expect(champ.tint, "godie-hapm 出貨帶著 #49 的 tint").toBeDefined();
    const tint = resolveModelTint(champ)!;

    const view = new ChampionView(scene, 7706, "champ.thorne", 1, { skin: skinFor("godie-hapm", true) });
    const painted = applyModelTint(view.root, tint);
    expect(painted, "替身身體上沒有任何材質被上色").toBeGreaterThan(0);

    // 讀最終物件:每個 mesh 現在掛的那顆材質(applyModelTint 會 clone 再指回去)
    const mats = view.root
      .getChildMeshes(false)
      .map((m) => m.material)
      .filter((m): m is StandardMaterial => m instanceof StandardMaterial);
    expect(mats.length).toBeGreaterThan(0);
    const dark = mats.filter((m) => m.diffuseColor.r <= champ.tint![0] + 1e-3);
    expect(dark.length, "沒有任何一顆最終材質變暗").toBeGreaterThan(0);
    view.dispose();
  });

  it("回退保留「真模型指向」:地圖的 umdl / usca 是機器讀得到的欄位", () => {
    cover("standin-fallback-render");
    // 在 #77 之前這兩件事只活在人類讀的 note 散文裡 —— 回退發生時,程式碼裡
    // 沒有任何地方知道「這一位在地圖上本來是一隻 0.6 倍的藍色熊貓」。
    const n00b = OVERRIDES["godie-n00b"]!;
    expect(n00b.mapModel).toBe(
      "Units\\Creeps\\StormPandarenBrewmaster\\StormPandarenBrewmaster.mdl",
    );
    expect(n00b.usca).toBe(0.6);
    // 而且不是只有他一位
    const withModel = Object.values(OVERRIDES).filter((o) => typeof o.mapModel === "string");
    expect(withModel.length).toBeGreaterThanOrEqual(30);
  });

  it("WIRING:registry 真的把第二個數字交出去(拿掉那個參數就紅)", async () => {
    cover("standin-fallback-render");
    // 失敗形態 ②的防線。上面幾條證明 ChampionView 會挑對數字,但如果
    // EntityViewRegistry 只餵一個進去,整個修法就等於沒做,而那幾條照樣全綠。
    // 這一條走真的 registry.sync,`modelOverrideFor` 回傳的是**出貨檔案裡那一筆
    // 物件本身**(不是手寫的假物件),模型 doc 回傳替身 —— 也就是 overlay 缺席
    // 的那條路。
    const NATIVE = 1;
    const assets = {
      load: () => Promise.resolve(makeContainer(NATIVE, "blocky")),
    } as unknown as AssetManager;
    const registry = new EntityViewRegistry(scene, assets, {
      modelDocFor: () => docFor(STANDIN_GLB),
      modelOverrideFor: (e) => (e.id === 7708 ? OVERRIDES["godie-h02s"]! : null),
    });
    const ent = (id: number): EntityViewState => ({
      id,
      kind: 0,
      seatId: 0,
      key: "champ.thorne",
      teamId: 1,
      x: 0,
      z: 0,
      fx: 1,
      fz: 0,
      alive: true,
    });
    registry.sync({ entities: [ent(7708), ent(7709)], poseFor: (e) => e, nowMs: 0, dtMs: 16 });
    await flush();

    const bad = registry.getChampionView(7708)!.declaredScale!;
    const plain = registry.getChampionView(7709)!.declaredScale!;
    expect(plain).toBeCloseTo(TARGET_HEIGHT, 5);
    // 出貨表裡 relativeScale 是 6.795 —— 如果 registry 把它當成替身的倍率,
    // 這一位就會是 12.2u。正確答案是地圖的 usca 1.00,也就是跟隔壁一樣高。
    expect(modelRelativeScaleOf(OVERRIDES["godie-h02s"]!)).toBeCloseTo(6.795, 3);
    expect(bad, "registry 把 WC3 的倍率餵給了方塊人").toBeCloseTo(TARGET_HEIGHT, 5);
    registry.dispose();
  });

  it("沒有 override 的英雄一切照舊 —— 1.0,兩具身體都一樣", async () => {
    cover("standin-fallback-render");
    const NATIVE = 2.5;
    const assets = { load: () => Promise.resolve(makeContainer(NATIVE, "plain")) } as unknown as AssetManager;
    const view = new ChampionView(scene, 7707, "champ.sela", 1);
    view.tryUpgradeToGlb(assets, docFor(STANDIN_GLB)); // 兩個倍率都省略
    await flush();
    expect(view.declaredScale! * NATIVE).toBeCloseTo(TARGET_HEIGHT, 5);
    expect(bodyScale(view, 7707)).toBeCloseTo(1, 5);
    view.dispose();
  });
});
