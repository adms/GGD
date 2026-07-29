/**
 * 變身「看得出來」真的到得了畫面 (task #249 / GH#288) — 真的 `EntityViewRegistry`
 * + 真的 `ChampionView`,跑在 Babylon 的 NullEngine 上。
 *
 * ---------------------------------------------------------------------------
 * 這個檔在守的驗收條件
 * ---------------------------------------------------------------------------
 * **基本型悟空不可以長出超三的頭。** `godie-ogrh` 與 `godie-o00x` 共用
 * `imported.goku`,而 `Gokuhead.mdx` 已經在 #267 被烘進那個 glb;再把
 * `Goku3head.mdx` 烘進去,基本型就會多一顆頭。所以掛件走執行期,而這裡直接數
 * **場景圖裡的網格**:基本型 0 顆掛件網格,變身態 1 顆,變回去又 0 顆。
 *
 * ---------------------------------------------------------------------------
 * 為什麼每一條都讀最終物件
 * ---------------------------------------------------------------------------
 * `views/mobTint.test.ts` 的檔頭記了那個陷阱:`applyModelTint` 會 **clone** 材質
 * 再指回 `mesh.material`,所以任何對「呼叫前抓到的材質物件」寫的斷言,不管有沒有
 * 生效都會過。同構的陷阱在這裡是:斷言 hook 被呼叫過、斷言某個布林旗標、或斷言
 * 「解析出了一個 spec」(失敗形態 ⑦ 掃屬性代替掃行為)。
 *
 * 所以下面每一條讀的都是:
 *   · `view.root.getChildMeshes()` 的**名字**(掛件網格真的在渲染樹裡),
 *   · `mesh.material.diffuseColor` **在 paint 之後**重新取一次,
 *   · `view.declaredScale`(ChampionView 真的寫下去的縮放)。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { ModelDoc } from "@ggd/shared/content";
import { resolveFormVisual } from "@ggd/shared/content";
import { ENTITY_FLAG, formIndexFromFlags } from "@ggd/shared/protocol/schema";
import { cover } from "@ggd/shared/testkit/cover";
import {
  EntityViewRegistry,
  relativeScaleOf,
  type EntityViewState,
  type ViewContentHooks,
} from "./EntityViewRegistry";
import type { AssetManager } from "./AssetManager";
import { TARGET_HEIGHT } from "./views/ChampionView";
import {
  composeFormTint,
  formAttachmentSpecFor,
  formScaleMultiplier,
} from "./views/formVisual";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigFormVisualsDoc } from "@ggd/shared/content/schema/config";

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

const ID = 8801;
/** 悟空兩態共用的 modelKey —— 這就是「key 不會變」的那個事實。 */
const GOKU_KEY = "imported.goku";
const BODY_GLB = "assets/models/imported/goku.glb";
const HEAD_GLB = "assets/models/imported/goku3head.glb";

/**
 * 出貨的那一份設定 —— 不是為了測試捏的(失敗形態 ⑤)。
 * 這條測試因此會在 owner 把掛件關掉時一起紅,那是正確的:功能真的沒了。
 */
const SHIPPED = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/form-visuals.json"), "utf8"),
) as ConfigFormVisualsDoc;

const bodyDoc: ModelDoc = {
  id: GOKU_KEY,
  schema: "model@1",
  glbPath: BODY_GLB,
  scale: 1,
  collisionRadius: 0.55,
  clipMap: { idle: "Stand", run: "Walk", attack: "Attack", cast: "Spell", hurt: "Stand", death: "Death" },
};
const headDoc: ModelDoc = { ...bodyDoc, id: "imported.goku3head", glbPath: HEAD_GLB };

/**
 * 每個 glb 一個容器,網格名字就是它來自哪個檔。`instantiateModelsToScene` 會把
 * 名字前綴成 `<entityId>-…`,所以場景裡的網格名字是「畫面上真的有什麼」的直讀。
 * 本體用 1×1×1 的方塊(原生高度 1),於是 `declaredScale` 讀回來就是
 * TARGET_HEIGHT × relativeScale,沒有量測噪音。
 */
function makeContainer(meshName: string): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox(meshName, { size: 1 }, scene);
  const mat = new StandardMaterial(`${meshName}-mat`, scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mesh.material = mat;
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  container.removeAllFromScene();
  return container;
}

function makeAssets(): AssetManager {
  return {
    load: (path: string): Promise<AssetContainer> =>
      Promise.resolve(makeContainer(path === HEAD_GLB ? "ssj3head" : "gokubody")),
  } as unknown as AssetManager;
}

const champ = (flags: number): EntityViewState => ({
  id: ID,
  kind: 0,
  seatId: 0,
  key: GOKU_KEY,
  teamId: 1,
  x: 0,
  z: 0,
  fx: 0,
  fz: 1,
  alive: true,
  flags,
});

/**
 * 合成根(GameApp)那一段的等價物,**用的是同一批出貨函式**:
 * seat 的 championId + FORM bits → alternate id → `resolveFormVisual` → 三個 hook。
 * 這裡不重寫決策,只把它接起來,所以測到的是出貨路徑而不是一份平行實作。
 */
function hooksFor(doc: ConfigFormVisualsDoc | null): ViewContentHooks {
  const SEAT_CHAMPION = "godie-ogrh"; // 玩家選的永遠是本體
  const ALTERNATE = "godie-o00x";
  const visualOf = (e: EntityViewState) =>
    resolveFormVisual(doc, formIndexFromFlags(e.flags ?? 0) === 1 ? ALTERNATE : SEAT_CHAMPION);
  return {
    modelDocFor: () => bodyDoc,
    championTintFor: (e) => composeFormTint(null, visualOf(e)),
    modelOverrideFor: (e) => {
      const m = formScaleMultiplier(visualOf(e));
      return m === 1 ? null : { relativeScale: relativeScaleOf(null) * m };
    },
    formAttachmentFor: (e) =>
      formAttachmentSpecFor(visualOf(e), (key) => (key === headDoc.id ? headDoc.glbPath : null)),
  };
}

const sync = (reg: EntityViewRegistry, e: EntityViewState, nowMs: number): void =>
  reg.sync({
    entities: [e],
    poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
    nowMs,
    dtMs: 16,
    loadModels: true,
  });

/** 三輪 microtask,讓本體與掛件兩次 `assets.load(...).then(...)` 都落地。 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** 目前這個 body 底下,名字含 `head` 的網格數 —— 直接數渲染樹。 */
const headMeshCount = (reg: EntityViewRegistry, id: number): number =>
  (reg.getChampionView(id)?.root.getChildMeshes(false) ?? []).filter((m) =>
    m.name.includes("ssj3head"),
  ).length;

const bodyMeshCount = (reg: EntityViewRegistry, id: number): number =>
  (reg.getChampionView(id)?.root.getChildMeshes(false) ?? []).filter((m) =>
    m.name.includes("gokubody"),
  ).length;

/** 整個 SCENE 裡的掛件網格數 —— 抓「view 換掉了但節點還留在場景」的漏。 */
const sceneHeadCount = (): number => scene.meshes.filter((m) => m.name.includes("ssj3head")).length;

const ALT = ENTITY_FLAG.FORM_A; // form index 1

describe("基本型悟空不會長出超三的頭 (form-visual-base-no-head)", () => {
  it("本體:身體有,超三的頭一顆都沒有", async () => {
    cover("form-visual-base-no-head");
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(reg, champ(0), 0);
    await settle();
    sync(reg, champ(0), 16);
    await settle();

    expect(bodyMeshCount(reg, ID), "本體的身體要載進來").toBe(1);
    expect(headMeshCount(reg, ID), "基本型悟空長出了超三的頭").toBe(0);
    expect(sceneHeadCount(), "場景裡也不可以有").toBe(0);
    reg.dispose();
  });

  it("變身態:同一個 modelKey、同一具身體,多出一顆超三的頭", async () => {
    cover("form-visual-base-no-head");
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(reg, champ(ALT), 0);
    await settle();
    sync(reg, champ(ALT), 16);
    await settle();

    // key 從頭到尾沒變過 —— 這就是 FORM bits 存在的理由
    expect(reg.getChampionView(ID)!.modelKey).toBe(GOKU_KEY);
    expect(bodyMeshCount(reg, ID)).toBe(1);
    expect(headMeshCount(reg, ID), "變身態沒有掛上超三的頭").toBe(1);
    reg.dispose();
  });

  it("變身 → 變回本體:頭要從場景裡真的消失,不是只被停用", async () => {
    cover("form-visual-base-no-head");
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(reg, champ(ALT), 0);
    await settle();
    sync(reg, champ(ALT), 16);
    await settle();
    expect(headMeshCount(reg, ID)).toBe(1);

    // 變回去(FORM bits 歸零)→ registry 丟掉整個 view 重建
    sync(reg, champ(0), 32);
    await settle();
    sync(reg, champ(0), 48);
    await settle();

    expect(headMeshCount(reg, ID), "變回本體之後頭還掛著").toBe(0);
    expect(sceneHeadCount(), "舊的頭留在場景裡沒被釋放").toBe(0);
    expect(bodyMeshCount(reg, ID), "身體應該還在").toBe(1);
    reg.dispose();
  });

  /**
   * 突變驗證抓到的洞:上面三條在「有人把 `godie-ogrh` 寫進設定檔」時**全部照樣綠**,
   * 因為出貨表裡本來就沒有那一格 —— 它們證明的是「資料剛好沒有」,不是「解析層擋住」。
   * 拿掉 `resolveFormVisual` 的 `isAlternateForm` 那一行,上面三條一條都不會紅。
   *
   * 這一條把設定檔改成最壞的樣子(基本型連頭一起填),再從**渲染樹**確認基本型
   * 還是沒有頭。這是驗收條件在客戶端的那一半。
   */
  it("就算設定檔把超三的頭寫給基本型,畫面上的基本型還是沒有頭", async () => {
    cover("form-visual-base-no-head");
    const sabotaged: ConfigFormVisualsDoc = {
      ...SHIPPED,
      forms: {
        ...SHIPPED.forms,
        "godie-ogrh": {
          attachModelKey: "imported.goku3head",
          attachBone: "origin",
          attachScale: 0.3221,
          tint: [1.45, 1.3, 0.55],
        },
      },
    };
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(sabotaged));
    sync(reg, champ(0), 0);
    await settle();
    sync(reg, champ(0), 16);
    await settle();

    expect(headMeshCount(reg, ID), "基本型吃到了寫給它的掛件").toBe(0);
    expect(sceneHeadCount()).toBe(0);
    // 顏色也不可以被套上去 —— 同一道關卡
    const body = reg
      .getChampionView(ID)!
      .root.getChildMeshes(false)
      .find((m) => m.name.includes("gokubody"))!;
    expect((body.material as StandardMaterial).diffuseColor.r).toBe(1);
    reg.dispose();
  });

  it("後台把掛件關掉 → 兩邊都沒有頭(顏色與大小仍在)", async () => {
    cover("form-visual-base-no-head");
    const off: ConfigFormVisualsDoc = { ...SHIPPED, attachmentsEnabled: false };
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(off));
    sync(reg, champ(ALT), 0);
    await settle();
    sync(reg, champ(ALT), 16);
    await settle();

    expect(headMeshCount(reg, ID)).toBe(0);
    // …但顏色還在,證明關掉的是掛件那一條通道而不是整個功能
    const body = reg
      .getChampionView(ID)!
      .root.getChildMeshes(false)
      .find((m) => m.name.includes("gokubody"))!;
    expect((body.material as StandardMaterial).diffuseColor.r).toBeGreaterThan(1);
    reg.dispose();
  });
});

describe("變身的顏色與大小真的落到最終物件上 (form-visual-paint)", () => {
  it("顏色寫在 sync 之後才取的 mesh.material 上 —— clone 陷阱擋不住這條", async () => {
    cover("form-visual-paint");
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(reg, champ(ALT), 0);
    await settle();
    sync(reg, champ(ALT), 16); // 材質在這一次 sync 被 clone + 上色
    await settle();

    // ⚠️ 這裡是**現在**才去拿 mesh.material,不是在上色前抓一份
    const body = reg
      .getChampionView(ID)!
      .root.getChildMeshes(false)
      .find((m) => m.name.includes("gokubody"))!;
    const c = (body.material as StandardMaterial).diffuseColor;
    // 出貨值 [1.45, 1.3, 0.55]:金色 = 紅綠亮、藍暗。StandardMaterial 沒有 gamma 步驟。
    expect(c.r).toBeCloseTo(1.45, 4);
    expect(c.g).toBeCloseTo(1.3, 4);
    expect(c.b).toBeCloseTo(0.55, 4);
    expect(c.r).toBeGreaterThan(c.b); // 「金色」這句話的最小可讀版本
    reg.dispose();
  });

  it("本體不上色 —— 同一條路徑上,基本型的材質是原色", async () => {
    cover("form-visual-paint");
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(reg, champ(0), 0);
    await settle();
    sync(reg, champ(0), 16);
    await settle();

    const body = reg
      .getChampionView(ID)!
      .root.getChildMeshes(false)
      .find((m) => m.name.includes("gokubody"))!;
    expect((body.material as StandardMaterial).diffuseColor.r).toBe(1);
    reg.dispose();
  });

  it("大小:變身態比本體高,而且高的倍數就是後台那個數字", async () => {
    cover("form-visual-paint");
    const regBase = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(regBase, champ(0), 0);
    await settle();
    const baseScale = regBase.getChampionView(ID)!.declaredScale!;

    const regAlt = new EntityViewRegistry(scene, makeAssets(), hooksFor(SHIPPED));
    sync(regAlt, champ(ALT), 0);
    await settle();
    const altScale = regAlt.getChampionView(ID)!.declaredScale!;

    // 原生高度 1 的方塊,所以 base = TARGET_HEIGHT
    expect(baseScale).toBeCloseTo(TARGET_HEIGHT, 5);
    expect(altScale).toBeGreaterThan(baseScale);
    expect(altScale / baseScale).toBeCloseTo(SHIPPED.forms["godie-o00x"]!.scaleMult!, 5);
    regBase.dispose();
    regAlt.dispose();
  });

  it("總開關關掉 → 顏色、大小、掛件三樣同時消失", async () => {
    cover("form-visual-paint");
    const off: ConfigFormVisualsDoc = { ...SHIPPED, enabled: false };
    const reg = new EntityViewRegistry(scene, makeAssets(), hooksFor(off));
    sync(reg, champ(ALT), 0);
    await settle();
    sync(reg, champ(ALT), 16);
    await settle();

    const view = reg.getChampionView(ID)!;
    const body = view.root.getChildMeshes(false).find((m) => m.name.includes("gokubody"))!;
    expect((body.material as StandardMaterial).diffuseColor.r).toBe(1);
    expect(view.declaredScale).toBeCloseTo(TARGET_HEIGHT, 5);
    expect(headMeshCount(reg, ID)).toBe(0);
    reg.dispose();
  });
});
