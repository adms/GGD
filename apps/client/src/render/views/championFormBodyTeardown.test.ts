/**
 * #223 —— 變身後「舊身體真的走了嗎」。五對真的會換模型的英雄，各一條。
 *
 * ---------------------------------------------------------------------------
 * 這個 BUG 的成因值得寫在檔頭：v0.9.13 的守衛只測了「有沒有加」
 * ---------------------------------------------------------------------------
 * `render/championFormSwap.test.ts`（#249 G2）證明的是**新模型出現了**：
 * `glbMeshNames()` 等於 `[<id>-alt-mesh]`、`hasGlb` 為 true、`requested` 依序
 * 載了兩個 glb。那些斷言全部問同一個問題 ——「變身之後畫面上有沒有新的東西」。
 * 沒有一條問「**舊的東西有沒有離開**」，除了 `first.root.isDisposed()`，而那個
 * 只讀一個根節點的旗標。
 *
 * 這是 CLAUDE.md 第③號故障形態（「可以從渲染樹刪掉但測試還是全綠」）**照鏡子**
 * 的版本：不是「做了但沒接上」，而是「接上了但沒收乾淨」。owner 2026-07-30
 * 看到的「多了額外兩個 model 骨頭一起動作」正是這一類。
 *
 * ---------------------------------------------------------------------------
 * 所以這裡的斷言只讀「場景上現在真的還在的東西」
 * ---------------------------------------------------------------------------
 * 三個計數，全部直接數 Babylon 的清單，不看任何簿記旗標（第⑦號故障：掃屬性
 * 代替掃行為）：
 *
 *   1. `scene.meshes` 裡**還有骨架的網格**  —— 「畫面上有幾具身體」
 *   2. `scene.skeletons`                    —— 「有幾副骨頭還在被驅動」
 *   3. `scene.animationGroups`              —— 「有幾段動作還在播」
 *
 * 第 2 條就是 #223 抓到的那一條，而且**只有它**在修好之前是紅的：
 * `instantiateModelsToScene` 每 instantiate 一次就把一副 clone 的 Skeleton 註冊
 * 進 `scene.skeletons`，而 `TransformNode.dispose()` 只走節點。#249 之前一個
 * entity 只建一次 view，所以那是一場一具的慢漏；#249 之後**每一次變身都重建整個
 * view**，於是拳四郎每 8 秒的 R 就留下一副。實測（本檔 REGRESSION 那一條）：
 * 來回三趟 = 8 次建身體，`scene.skeletons` 1 → 8，`registry.dispose()` 之後
 * 仍然是 8。
 *
 * ⚠️ 為什麼 fixture 一定要有骨架：`championFormSwap.test.ts` 的假容器是一顆
 * 沒有 skeleton 的 `CreateBox`，所以那邊 `scene.skeletons` 永遠是 0 —— 這個缺陷
 * 對它是**不可見的**。要抓到它，假容器就得長得像真的 .glb：`__root__` →
 * 皮膚網格 + 關節節點 + Skeleton + 多段 AnimationGroup。
 *
 * ⚠️ 不要用 `expect(a).not.toBe(b)` 去比兩個 view/mesh 物件：失敗時 vitest 會
 * 嘗試 diff，而一個 Babylon 節點通到整個場景圖，runner 會在印出任何東西之前
 * 先 OOM（`championFormSwap.test.ts` 已經踩過，那邊改用 `uniqueId`）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import type { AssetManager } from "../AssetManager";

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

const ID = 8223;

/**
 * THE FIVE PAIRS WHOSE TWO HALVES DECLARE DIFFERENT `modelKey`s — derived from
 * `content/champions/*.json` (`transform.counterpartId` + `modelKey`), which is
 * the only place that fact lives. The other 21 shipped 變身 pairs share ONE
 * modelKey between their halves, so a leaked body would sit inside the new one
 * and be invisible on screen; these five are where 「兩個模型的骨骼一起動」
 * would actually be seen, which is why the owner saw it on 拳四郎 first.
 */
const MODEL_CHANGING_PAIRS = [
  { hero: "#18 妖狐藏馬", base: "imported.fox", alt: "imported.fox2" },
  { hero: "#25 拳四郎", base: "champ.skin.barbarian", alt: "imported.heropikachu" },
  { hero: "#58 皮卡丘", base: "imported.picacugy", alt: "imported.heropikachu" },
  { hero: "#61 克勞薩", base: "champ.skin.barbarian", alt: "champ.thorne" },
  { hero: "#06 傑富力士", base: "imported.herobiggon", alt: "champ.thorne" },
] as const;

const glbFor = (modelKey: string): string => `assets/models/${modelKey.replace(/\./g, "/")}.glb`;

const docFor = (modelKey: string): ModelDoc =>
  ({
    id: `model.${modelKey}`,
    schema: "model@1",
    glbPath: glbFor(modelKey),
    scale: 1,
    collisionRadius: 0.5,
    clipMap: {
      idle: "Stand",
      run: "Walk",
      attack: "Attack",
      cast: "Spell",
      hurt: "Stand",
      death: "Death",
    },
  }) as ModelDoc;

/**
 * A container shaped like a REAL rigged .glb, because the defect is invisible
 * on anything less: `__root__` → (skinned mesh + joint TransformNode), one
 * Skeleton whose bone is linked to the joint, and SEVEN AnimationGroups (the
 * real imported rigs carry 7–12, and only 5–6 of them are ever named by a
 * clipMap — so this also covers the unmapped ones ClipAnimator has to free).
 */
function makeRiggedContainer(tag: string): AssetContainer {
  const container = new AssetContainer(scene);
  const root = new TransformNode(`__root__${tag}`, scene);
  const mesh = MeshBuilder.CreateBox(`${tag}-mesh`, { size: 1 }, scene);
  mesh.parent = root;

  const skeleton = new Skeleton(`${tag}-skel`, `${tag}-skel`, scene);
  const joint = new TransformNode(`${tag}-joint`, scene);
  joint.parent = root;
  const bone = new Bone(`${tag}-bone`, skeleton, null, Matrix.Identity());
  bone.linkTransformNode(joint);
  mesh.skeleton = skeleton;

  const groups: AnimationGroup[] = [];
  for (const clip of ["Stand", "Walk", "Attack", "Spell", "Death", "Attack - 2", "Dissipate"]) {
    const anim = new Animation(
      `${tag}-${clip}`,
      "rotation.y",
      30,
      Animation.ANIMATIONTYPE_FLOAT,
    );
    anim.setKeys([
      { frame: 0, value: 0 },
      { frame: 30, value: 1 },
    ]);
    const g = new AnimationGroup(clip, scene);
    g.addTargetedAnimation(anim, joint);
    groups.push(g);
  }

  container.rootNodes.push(root);
  container.transformNodes.push(root, joint);
  container.meshes.push(mesh);
  container.skeletons.push(skeleton);
  container.animationGroups.push(...groups);
  // a real LoadAssetContainerAsync leaves nothing of its own in the scene
  container.removeAllFromScene();
  return container;
}

/** glb paths the registry actually asked the AssetManager for, in order. */
let requested: string[];

function makeAssets(): AssetManager {
  requested = [];
  return {
    load: (path: string): Promise<AssetContainer> => {
      requested.push(path);
      return Promise.resolve(makeRiggedContainer(path.replace(/[^a-z0-9]/gi, "-")));
    },
  } as unknown as AssetManager;
}

const champ = (key: string, over: Partial<EntityViewState> = {}): EntityViewState => ({
  id: ID,
  kind: 0,
  seatId: 0,
  key,
  teamId: 1,
  x: 0,
  z: 0,
  fx: 0,
  fz: 1,
  alive: true,
  flags: 0,
  ...over,
});

const sync = (reg: EntityViewRegistry, e: EntityViewState, nowMs: number): void =>
  reg.sync({
    entities: [e],
    poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
    nowMs,
    dtMs: 16,
    loadModels: true,
  });

/** let the `assets.load(...).then(...)` instantiation land. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** BODIES ON SCREEN: live meshes that are actually skinned (a rigged model). */
const liveSkinnedMeshes = (): string[] =>
  scene.meshes
    .filter((m) => !m.isDisposed() && (m as { skeleton?: unknown }).skeleton)
    .map((m) => m.name);

/** SKELETONS STILL BEING DRIVEN: Babylon's own per-scene list. */
const liveSkeletons = (): number => scene.skeletons.length;

/** CLIPS STILL IN THE PER-FRAME LIST. */
const liveGroups = (): number => scene.animationGroups.length;

/** Build a registry that answers a doc for whatever modelKey the entity carries. */
const registryFor = (): EntityViewRegistry =>
  new EntityViewRegistry(scene, makeAssets(), { modelDocFor: (key: string) => docFor(key) });

/** One full round trip: base → alternate → base. */
async function toggle(
  reg: EntityViewRegistry,
  e: EntityViewState,
  base: string,
  alt: string,
  t: number,
): Promise<void> {
  e.key = alt;
  e.flags = ENTITY_FLAG.FORM_A;
  sync(reg, e, t);
  await settle();
  e.key = base;
  e.flags = 0;
  sync(reg, e, t + 16);
  await settle();
}

describe("#223 變身換模型:舊身體必須離開場景(五對各一條)", () => {
  for (const { hero, base, alt } of MODEL_CHANGING_PAIRS) {
    it(`${hero}: ${base} ⇄ ${alt} —— 來回三趟,場上永遠只有一具身體`, async () => {
      const reg = registryFor();
      const e = champ(base);

      sync(reg, e, 0);
      await settle();
      // premise: the base body really did land, and it is rigged
      expect(liveSkinnedMeshes()).toHaveLength(1);
      const baseMesh = liveSkinnedMeshes()[0];
      expect(liveSkeletons()).toBe(1);
      const groupsPerBody = liveGroups();
      expect(groupsPerBody).toBe(7);

      // ── 變身 ────────────────────────────────────────────────────────────
      e.key = alt;
      e.flags = ENTITY_FLAG.FORM_A;
      sync(reg, e, 16);
      await settle();

      // the alternate is on screen AND the base is not merely hidden behind it
      const after = liveSkinnedMeshes();
      expect(after).toHaveLength(1);
      expect(after[0]).not.toBe(baseMesh);
      expect(liveSkeletons()).toBe(1);
      expect(liveGroups()).toBe(groupsPerBody);

      // ── 來回三趟(到期 / 再變身)——— 數量不可以累積 ─────────────────────
      for (let i = 0; i < 3; i++) {
        await toggle(reg, e, base, alt, 100 + i * 64);
        expect(liveSkinnedMeshes()).toHaveLength(1);
        expect(liveSkeletons()).toBe(1);
        expect(liveGroups()).toBe(groupsPerBody);
      }
      // SEVEN bodies were built, not eight: the first half of the first
      // `toggle` re-asserts the alternate the block above already entered, and
      // an unchanged identity must NOT rebuild (that is the other half of the
      // contract — see the last test in this file).
      expect(requested).toHaveLength(7);
      expect(reg.championCount).toBe(1);

      // and the registry's own teardown leaves nothing behind either
      reg.dispose();
      expect(liveSkinnedMeshes()).toHaveLength(0);
      expect(liveSkeletons()).toBe(0);
      expect(liveGroups()).toBe(0);
    });
  }

  it("REGRESSION #223 —— 每一次變身都會多留一副 clone 的 Skeleton(修好前 1→8)", async () => {
    // THE ONE THAT WAS RED. `instantiateModelsToScene` registers a cloned
    // Skeleton in `scene.skeletons`; `TransformNode.dispose()` walks NODES only.
    // Before the fix this counted 1, 2, 3, … 8 across the eight body builds
    // below and stayed at 8 after `registry.dispose()`. Deliberately measured
    // as a SEQUENCE, not just an endpoint, so the failure mode reads as
    // 「每一次變身 +1」 rather than 「最後多了幾個」.
    const reg = registryFor();
    const e = champ("champ.skin.barbarian");
    sync(reg, e, 0);
    await settle();

    const seq: number[] = [liveSkeletons()];
    for (let i = 0; i < 3; i++) {
      await toggle(reg, e, "champ.skin.barbarian", "imported.heropikachu", 100 + i * 64);
      seq.push(liveSkeletons());
    }
    e.key = "imported.heropikachu";
    e.flags = ENTITY_FLAG.FORM_A;
    sync(reg, e, 400);
    await settle();
    seq.push(liveSkeletons());

    expect(requested).toHaveLength(8); // eight bodies were really built
    expect(seq).toEqual([1, 1, 1, 1, 1]); // pre-fix this was [1, 3, 5, 7, 8]
  });

  it("沒有變身的一幀不重建 —— 這條守衛不可以靠「每幀重建」變綠", async () => {
    // The mirror of the above: a rebuild that fired every frame would keep the
    // counts at 1 forever and pass all five tests, while tearing the body down
    // 60×/second. So pin the OTHER direction too — same entity, same flags,
    // five syncs, exactly one load.
    const reg = registryFor();
    const e = champ("imported.fox", { flags: ENTITY_FLAG.FORM_A | ENTITY_FLAG.BURNING });
    sync(reg, e, 0);
    await settle();
    const bodyId = reg.getChampionView(ID)!.root.uniqueId;

    for (let i = 1; i <= 5; i++) {
      sync(reg, e, i * 16);
      await settle();
      expect(reg.getChampionView(ID)!.root.uniqueId).toBe(bodyId);
    }
    expect(requested).toEqual([glbFor("imported.fox")]);
    expect(liveSkeletons()).toBe(1);
  });
});
