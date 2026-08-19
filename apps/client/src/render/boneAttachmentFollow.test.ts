/**
 * GH#392 —— **球體附著 · 跟隨 · 播動畫**，跑在真的 NullEngine 場景上。
 *
 * ---------------------------------------------------------------------------
 * 它在守的那一條線，以及為什麼是「世界座標」
 * ---------------------------------------------------------------------------
 * owner 2026-08-19 那句話裡有三個**不同**的能力，而最容易只做一半的是前兩個：
 *
 *   (a) 附著到骨頭  → 掛件出現在手上
 *   (b) 跟隨        → 角色**走一步之後**它還在手上
 *
 * ⚠️ 只做 (a) 的畫面**第一幀完全正確**。所以任何讀 `position`（本地座標）的
 * 斷言對兩種實作都會過 —— 掛在關節底下時本地座標永遠是 (0,0,0)，
 * 而世界座標快照的本地座標**也**是那個常數。⇒ 這裡逐條讀
 * `getAbsolutePosition()`，而且是在**把角色搬走之後**再讀。
 *
 * (c) 播動畫 —— 出貨的三顆掛件各有一條叫 `Stand` 的軌，而 GH#392 之前
 * `formAttachGroups` 唯一的讀者是 `dispose()`。所以第三條斷言問的是
 * 「那條軌真的被 `play()` 過嗎」，⛔ 不是「有沒有解析出一個 spec」（失敗形態⑦）。
 *
 * 跑的是**出貨的那一條路**：真的 `EntityViewRegistry` → 真的 `ChampionView`
 * → 真的 `resolveAttachment`（⛔ 不是測試自己寫的一份平行實作，失敗形態⑤）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ModelDoc, AttachmentDoc } from "@ggd/shared/content";
import { wornFromAttachmentDoc } from "@ggd/shared/content";
import { cover } from "@ggd/shared/testkit/cover";
import { EntityViewRegistry, type EntityViewState, type ViewContentHooks } from "./EntityViewRegistry";
import type { AssetManager } from "./AssetManager";
import { wornAttachmentSpec } from "./views/formVisual";

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

const ID = 9201;
const BODY_KEY = "imported.testbody";
const BODY_GLB = "assets/models/imported/testbody.glb";
const ORB_GLB = "assets/models/imported/orb.glb";
/** 掛件在手骨的 local frame 裡偏移多少 —— 手骨自己在本體原點旁邊 3 單位。 */
const HAND_X = 3;
/** 播過的動畫軌名（`play()` 的唯一證據）。 */
const played: string[] = [];

const bodyDoc: ModelDoc = {
  id: BODY_KEY,
  schema: "model@1",
  glbPath: BODY_GLB,
  scale: 1,
  collisionRadius: 0.55,
  clipMap: { idle: "Stand", run: "Stand", attack: "Stand", cast: "Stand", hurt: "Stand", death: "Stand" },
};

/** 本體容器：一個方塊 + 一根**真的叫 WC3 名字**的右手關節。 */
function bodyContainer(): AssetContainer {
  const c = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("testbody", { size: 1 }, scene);
  const hand = new TransformNode("Hand Right Ref", scene);
  hand.parent = mesh;
  hand.position.x = HAND_X;
  c.meshes.push(mesh);
  c.rootNodes.push(mesh);
  c.transformNodes.push(hand);
  c.removeAllFromScene();
  return c;
}

/** 掛件容器：一個方塊 + 一條叫 `Stand` 的軌（stub，`play` 記名字）。 */
function orbContainer(): AssetContainer {
  const c = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("orb", { size: 1 }, scene);
  c.meshes.push(mesh);
  c.rootNodes.push(mesh);
  c.removeAllFromScene();
  // ⚠️ stub 必須有 `clone(name, remap)` —— `instantiateModelsToScene` 對每一條軌
  // 都呼叫它，而且**把名字前綴成 `<id>-form-<原名>`**。那個前綴正是出貨路徑
  // 要處理的事，所以這裡如實重現，⛔ 不是回傳同一個物件矇混過去。
  const track = (base: string): unknown => ({
    name: base,
    play: (): void => void played.push(base),
    dispose: (): void => {},
    clone: (name: string): unknown => ({
      name,
      play: (): void => void played.push(base),
      dispose: (): void => {},
    }),
  });
  (c as unknown as { animationGroups: unknown[] }).animationGroups = [track("Stand"), track("Death")];
  return c;
}

const assets = (): AssetManager =>
  ({
    load: (p: string): Promise<AssetContainer> =>
      Promise.resolve(p === ORB_GLB ? orbContainer() : bodyContainer()),
  }) as unknown as AssetManager;

const doc = (over: Partial<AttachmentDoc>): AttachmentDoc => ({
  id: "attach.orb",
  schema: "attachment@1",
  modelKey: "imported.orb",
  points: ["right,hand"], // ⚠️ 一個掛點的兩個逗號 token
  ...over,
});

function hooksFor(d: AttachmentDoc): ViewContentHooks {
  return {
    modelDocFor: () => bodyDoc,
    formAttachmentFor: () =>
      wornFromAttachmentDoc(d)
        .map((w) => wornAttachmentSpec(w, (k) => (k === "imported.orb" ? ORB_GLB : null)))
        .filter((s): s is NonNullable<typeof s> => s !== null),
  };
}

const champ = (x: number): EntityViewState => ({
  id: ID, kind: 0, seatId: 0, key: BODY_KEY, teamId: 1,
  x, z: 0, fx: 0, fz: 1, alive: true, flags: 0,
});

const sync = (reg: EntityViewRegistry, e: EntityViewState, nowMs: number): void =>
  reg.sync({ entities: [e], poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }), nowMs, dtMs: 16, loadModels: true });

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/**
 * 掛件網格**現在**的世界座標 X。⛔ 不讀 `position`（見檔頭），也⛔ 不從
 * `view.root` 底下找 —— `follow: false` 的掛件 parent 是 null，那是它的**定義**。
 */
function orbWorldX(): number {
  const mesh = scene.meshes.find((m) => m.name.includes("orb"))!;
  mesh.computeWorldMatrix(true);
  return mesh.getAbsolutePosition().x;
}

/**
 * 掛件離身體原點多遠（世界單位）。
 *
 * ⚠️ 用**距離**而不是 X：body 有朝向，所以手骨的 local +X 在世界裡可能落在 ±Z 上
 * （實測 fz=1 時 X 分量是 1.2e-15）。「有沒有掛到手上」問的是**離不離開原點**，
 * ⛔ 不是某一個軸的數字。
 */
function orbOffsetFromBody(reg: EntityViewRegistry): number {
  const mesh = scene.meshes.find((m) => m.name.includes("orb"))!;
  const root = reg.getChampionView(ID)!.root;
  mesh.computeWorldMatrix(true);
  root.computeWorldMatrix(true);
  return mesh.getAbsolutePosition().subtract(root.getAbsolutePosition()).length();
}

/** 走一大步；`sync` 之後 view 的插值已經帶到新位置（nowMs 拉遠讓它收斂）。 */
async function walkTo(reg: EntityViewRegistry, x: number, t: number): Promise<void> {
  for (let i = 0; i < 12; i++) {
    sync(reg, champ(x), t + i * 200);
    await settle();
  }
}

describe("骨頭掛件：附著 · 跟隨 · 播動畫 (bone-attachment)", () => {
  it("角色走掉之後掛件仍然黏在那根骨頭上，而且它自己的動畫真的被播了", async () => {
    cover("bone-attachment");
    played.length = 0;
    const reg = new EntityViewRegistry(scene, assets(), hooksFor(doc({ anim: "Stand" })));
    sync(reg, champ(0), 1000);
    await settle();
    sync(reg, champ(0), 1100); // 本體 glb 落地之後才掛得上（同 #249 的順序）
    await settle();

    // (a) 附著 —— `"right,hand"` 真的解到了 `Hand Right Ref`：掛件**離開了原點**，
    //     停在手骨那一側（⛔ 解不出來的話它會退回模型根，差值就是 0）。
    const before = orbWorldX();
    expect(orbOffsetFromBody(reg)).toBeGreaterThan(0.5);

    // (b) 跟隨 —— 把角色搬到 x=10，掛件的**世界**座標必須跟著移動同樣的距離。
    //     ⚠️ 只做 (a) 的實作在這裡會停在原處，而上面那一條照樣是綠的。
    await walkTo(reg, 10, 2000);
    expect(orbWorldX() - before).toBeCloseTo(10, 1);

    // (c) 播動畫 —— 指名的那條軌被 play 了，沒指名的那條沒有
    expect(played).toEqual(["Stand"]);
    reg.dispose();
  });

  it("follow:false = 世界座標快照：角色走掉，掛件留在原地", async () => {
    cover("bone-attachment");
    played.length = 0;
    const reg = new EntityViewRegistry(scene, assets(), hooksFor(doc({ follow: false })));
    sync(reg, champ(0), 1000);
    await settle();
    sync(reg, champ(0), 1100);
    await settle();
    const parked = orbWorldX();
    await walkTo(reg, 10, 2000);
    expect(orbWorldX()).toBeCloseTo(parked, 3);
    // `anim` 省略 = 播**全部**的軌（WC3 對一個附著模型做的事）
    expect(played.sort()).toEqual(["Death", "Stand"]);
    reg.dispose();
  });
});
