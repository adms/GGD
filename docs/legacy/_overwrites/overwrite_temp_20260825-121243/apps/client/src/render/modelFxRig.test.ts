/**
 * 三個新特效通道的**一條**薄守衛（體驗層 ⇒ ⛔ 不開對抗輪，第零守則⑦）。
 *
 * 驗的是三條**承重線**，⛔ 不是三組數字：
 *   ① `ModelFxRig` 壽命到之後真的**回收**進 free-list，重放時**重用**（池子不長大）
 *      —— 拿掉 `release()` 的入池，或拿掉 `acquire()` 的 `free.pop()`，這一條就紅。
 *      這是 #131（孤兒發射器卡在場中央）在模型通道上的同一個形狀。
 *   ② `prefers-reduced-motion` 下震動**不會**送到相機（無障礙硬要求）。
 *   ③ 克勞德一次七刀 ⇒ 七個字同時進得去、事後**整池回收**（⛔ 不是每次 new）。
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
// GH#697 —— 分流守衛用**真的** PBRMaterial（glTF 載入器產出的就是這一種）。
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
// GH#689 —— 剪輯守衛用**真的** Babylon 動畫物件（⛔ 不 mock）。
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelFxRig } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "./modelFxPath";
import { ScreenFxLayer } from "../vfx/ScreenFxLayer";
import { FloatingTextFx } from "../vfx/FloatingTextFx";

/**
 * ⭐ **線路形狀**（GH#606）—— `radial count:3`，三個方向由 sim 解算完送來。
 * ⛔ 舊版這裡是 `ModelFxMotionSpec` ＋ `facingRad`，而出貨路徑從來不產生它。
 */
const WIRE: ModelFxSpawnEvent = {
  caster: 1 as never,
  modelKey: "fx.test.orb",
  path: "radial",
  speed: 10,
  x: 0,
  z: 0,
  zone: 0,
  spinDegPerSec: 720,
  instances: [
    { x: 0, z: 0, dx: 1, dz: 0, dist: 5, durationSec: 0.5 },
    { x: 0, z: 0, dx: -0.5, dz: 0.866, dist: 5, durationSec: 0.5 },
    { x: 0, z: 0, dx: -0.5, dz: -0.866, dist: 5, durationSec: 0.5 },
  ],
};
const VIEWER = { isCaster: true, isVictim: true };

describe("moving-model FX rig", () => {
  it("壽命到就回收，重放時重用同一批節點（⛔ 池子不長大）", () => {
    const scene = new Scene(new NullEngine());
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1 }),
      loadContainer: () => Promise.resolve(null),
    });

    expect(rig.spawn(WIRE)).toBe(3);
    expect(rig.liveCount).toBe(3);
    expect(rig.pooledCount).toBe(0);

    // 走完全程 → 到期
    rig.tick(2000);
    expect(rig.liveCount).toBe(0);
    expect(rig.pooledCount).toBe(3); // ← 回收發生了

    rig.spawn(WIRE);
    expect(rig.liveCount).toBe(3);
    expect(rig.pooledCount).toBe(0); // ← 重用發生了（⛔ 沒有新造）

    rig.resetForRound();
    expect(rig.liveCount).toBe(0);
    rig.dispose();
  });
});

describe("screen FX", () => {
  it("reduced-motion 下震動不送到相機，一般情況下會送", () => {
    const sent: number[] = [];
    const opts = { host: null, addShake: (a: number) => sent.push(a) };
    const spec = { amplitude: 0.2, durationSec: 0.3 };
    expect(new ScreenFxLayer({ ...opts, reducedMotion: true }).shake(spec, VIEWER)).toBe(false);
    expect(new ScreenFxLayer({ ...opts, reducedMotion: false }).shake(spec, VIEWER)).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

describe("floating text", () => {
  it("同一點七發全部進得去且分道，到期整池回收", () => {
    const fx = new FloatingTextFx();
    const poolSize = fx.entries.length; // ⛔ 不抄字面值（第二守則:驗機制不驗數字）
    for (let i = 1; i <= 7; i++) expect(fx.spawn({ text: `${i}Hit`, x: 0, y: 2, z: 0 })).toBe(true);
    expect(fx.liveCount).toBe(7);
    expect(new Set(fx.entries.filter((e) => e.active).map((e) => e.lane)).size).toBe(7);
    for (let i = 0; i < 40; i++) fx.tick(100);
    expect(fx.liveCount).toBe(0);
    expect(fx.entries).toHaveLength(poolSize); // 池是固定的，⛔ 沒有長大
  });
});

/**
 * ⭐【顏色】`model@1.fxTint` —— owner 2026-08-23 逐字：「作為**翻轉角度的蝗蟲群單位**
 * **通常大小跟顏色都有再做調整**，務必檢查，**避免出現很小顏色又不對的氣功砲**」。
 *
 * 兩條，⛔ 都不驗「顏色等於某個 RGB」（第二守則：驗機制不驗數字）：
 *  ① **著色真的到得了畫面** —— 讀**最終**素材物件（clone 之後指回去的那一份），
 *     ⛔ 不讀我們餵進去的那一份（`views/mobTint.test.ts` 檔頭記的那個陷阱）。
 *  ② **每一個出貨的 `fxTint` 都引用得到來源** —— 逐份比對原作普查
 *     `UNIT_TINTS.json`（w3u → 基底 → `UnitUI.slk` 解出來的頂點色）。
 *     ⛔ 沒有這一條，任何人都可以挑一個好看的 RGB 塞進出貨文件。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · ⭐ 承重線 —— `modelFxRig.ts::acquire()` 拿掉 `if (doc.fxTint) applyFxTint(...)`
 *      → 紅：「fxTint 沒有到達畫面」。⇒ 沒有它，38-002「黑」龍波就不是黑的，
 *      而 `content:build` 與每一條既有守衛**全綠**（第一·五守則的形狀）。
 */
describe("model fx tint", () => {
  it("① 著色乘進最終素材（⛔ 不是我們餵進去的那一份）", async () => {
    const scene = new Scene(new NullEngine());
    const src = new StandardMaterial("src", scene);
    src.diffuseColor = new Color3(1, 1, 1);
    const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
    mesh.material = src;
    const container = new AssetContainer(scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);

    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1, fxTint: [0, 0, 0] }),
      loadContainer: () => Promise.resolve(container),
    });
    // ⚠️ 第一發把載入踢起來 —— `ensureContainer` 走 promise，await 之後容器 resolve，
    //    GH#673-① 的回填會把這一具補上幾何（含 fxTint —— 回填走同一份 `fillGeometry`）。
    //    第二發仍刻意超過池子造新的，讓「造新＋容器已載」那條路也被著色驗到。
    rig.spawn({ ...WIRE, instances: [WIRE.instances[0]!] });
    await new Promise((r) => setTimeout(r, 0));
    rig.tick(2000);
    expect(rig.spawn(WIRE)).toBe(3);

    // ⭐ 從**出貨的場景樹**上撈，⛔ 不是靠一個只有測試會呼叫的存取器（失敗形態⑤）。
    const painted = scene.meshes.filter((m) => m !== mesh && m.material);
    expect(painted.length, "一具著色過的網格都沒有進場景樹").toBeGreaterThan(0);
    for (const m of painted) {
      const c = (m.material as StandardMaterial).diffuseColor;
      expect([c.r, c.g, c.b], "fxTint 沒有到達畫面").toEqual([0, 0, 0]);
    }
    // ⛔ 原始素材不可以被就地改掉（它是整個容器共用的）。
    expect([src.diffuseColor.r, src.diffuseColor.g, src.diffuseColor.b]).toEqual([1, 1, 1]);
    rig.dispose();
  });

  it("③ fxAlpha 乘進最終素材的 alpha 並解鎖混合（⛔ 不是 visibility 開關）", async () => {
    // GH#688 Phase 4 機制②：alpha 是缺口表裡唯一「兩側都空白」的欄 —— 原作只存在
    // runtime（57 個 SetUnitVertexColorBJ 呼叫點），這一格是模型級恆定半透明那一半。
    const scene = new Scene(new NullEngine());
    const src = new StandardMaterial("src", scene);
    const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
    mesh.material = src;
    const container = new AssetContainer(scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1, fxAlpha: 0.5 }),
      loadContainer: () => Promise.resolve(container),
    });
    rig.spawn({ ...WIRE, instances: [WIRE.instances[0]!] });
    await new Promise((r) => setTimeout(r, 0));
    const painted = scene.meshes.filter((m) => m !== mesh && m.material);
    expect(painted.length, "一具套過 fxAlpha 的網格都沒有進場景樹").toBeGreaterThan(0);
    for (const m of painted) {
      const mat = m.material as StandardMaterial & { transparencyMode?: number };
      expect(mat.alpha, "fxAlpha 沒有到達畫面 —— 半透明的 dummy 以全不透明出場").toBeCloseTo(0.5, 5);
      // 素材沒被鎖成 OPAQUE（StandardMaterial 無 transparencyMode 欄則略過）。
      if (mat.transparencyMode !== undefined && mat.transparencyMode !== null)
        expect(mat.transparencyMode).toBe(2);
    }
    expect(src.alpha, "⛔ 原始素材被就地改掉了（容器共用）").toBe(1);
    rig.dispose();
  });

  it("② 每一個出貨 fxTint 都引用得到原作普查的一列", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const census: Record<string, { tint: number[]; model: string }> = JSON.parse(
      readFileSync(join(root, "tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json"), "utf8"),
    ).units;
    const known = new Set(Object.values(census).map((u) => JSON.stringify(u.tint.map(Number))));
    const dir = join(root, "content/models");
    let checked = 0;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { fxTint?: number[] };
      if (!doc.fxTint) continue;
      checked++;
      expect(known, `${f} 的 fxTint 不在原作普查裡 —— ⛔ 出貨顏色不可以自己挑`).toContain(
        JSON.stringify(doc.fxTint.map(Number)),
      );
    }
    expect(checked, "沒有任何一份文件宣告 fxTint —— 這一格是死的").toBeGreaterThan(0);
  });
});

/**
 * ⭐ GH#673-① —— 首發空殼回填的守衛。BA lane 的像素證據
 * （`docs/_reports/beam_visual-proof_20260824-2240`）：glb 未載時 acquire 回空 root，
 * 而「幾何晚幾幀補進來」那句註解**沒有任何人兌現**；空殼 release 進池子後被
 * pop 直接重用 ⇒ **首發與第二發都整發看不見**（modelKey 首次出現的那一回合 =
 * owner 開遊戲驗證按的那一發）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · `modelFxRig.ts::ensureContainer()` 拿掉容器 resolve 後的回填迴圈（①c）
 *    → a 紅：「首發那具在 glb 載完後仍是 0 頂點」。
 */
describe("GH#673-① 首發空殼回填（⛔ 不是永遠空殼循環）", () => {
  const oneShot: ModelFxSpawnEvent = { ...WIRE, instances: [WIRE.instances[0]!] };
  /** 從**出貨的場景樹**數每一個 beam 根節點的頂點（0 = 空殼），⛔ 不靠測試用存取器。 */
  const beamVerts = (scene: Scene): number[] =>
    scene.transformNodes
      .filter((n) => n.name.startsWith(`modelfx-${WIRE.modelKey}-`))
      .map((n) => n.getChildMeshes(false).reduce((s, m) => s + m.getTotalVertices(), 0));
  const mkRig = (scene: Scene) => {
    let resolveLoad!: (c: AssetContainer | null) => void;
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("geo", { size: 1 }, scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1 }),
      loadContainer: () => new Promise((r) => (resolveLoad = r)),
    });
    return { rig, finishLoad: async () => { resolveLoad(container); await new Promise((r) => setTimeout(r, 0)); } };
  };

  it("a. 容器載完的當下，還活著的首發空殼被回填幾何", async () => {
    const scene = new Scene(new NullEngine());
    const { rig, finishLoad } = mkRig(scene);
    rig.spawn(oneShot); // glb 還在串流 ⇒ 空殼準時上場（刻意的，⛔ 不是等載完再生）
    expect(beamVerts(scene), "前提不成立：此刻應該還是空殼").toEqual([0]);
    await finishLoad();
    expect(
      beamVerts(scene)[0],
      "首發那具在 glb 載完後仍是 0 頂點 —— 玩家第一次施放永遠看不到光束",
    ).toBeGreaterThan(0);
    rig.dispose();
  });

  it("b. 池子裡的空殼在重用時補幾何 —— 第二發不再看不見", async () => {
    const scene = new Scene(new NullEngine());
    const { rig, finishLoad } = mkRig(scene);
    rig.spawn(oneShot);
    rig.tick(2000); // 容器還沒到就到期 ⇒ 空殼進 free-list
    expect(rig.pooledCount).toBe(1);
    await finishLoad(); // 容器到了，但殼在池子裡（⛔ 不在 live）⇒ 回填輪不到它
    rig.spawn(oneShot); // 重用那個殼 —— acquire 要在這裡補
    expect(
      beamVerts(scene).some((v) => v > 0),
      "重用的池中空殼沒有補幾何 —— 第二發（glb 已載好幾秒）照樣整發看不見",
    ).toBe(true);
    rig.dispose();
  });
});

/**
 * ⭐【glb 動畫剪輯播放 · 含凍播】GH#689 —— **@visual-proof**
 *
 * 這條通道在 2026-08-25 之前**全檔 0 個 Animation**：轉出來的 glb 明明帶著剪輯
 * （`flamestrike1`: birth/stand/death），而唯一會動的東西是 `spinDegPerSec`。
 * ⇒ 原作 14 個 `SetUnitAnimation` 呼叫點／12 具可見 dummy 的視覺**整層不存在**
 * ——火柱不播 `stand` 就沒有火焰翻騰，h008 FragDriller 不播 `death` × **15%**
 * 就沒有那顆慢動作展開的爆殼。⚠️ 而畫面上它看起來只是「特效有點呆」（失敗形態②）。
 *
 * ── 為什麼這一條讀的是**頂點的世界座標**，⛔ 不是「有沒有呼叫 play」───────────
 * 「play 被呼叫過」是屬性不是行為（失敗形態⑦），而 `speedRatio` 沒傳到的那個
 * 缺陷**恰好**會讓 play 照樣被呼叫。⇒ 這裡渲染真的幀，然後用
 * `getVerticesData` 把**同一顆網格的第一個頂點**變換到世界空間量它走了多遠：
 * 凍播那一具在同樣的幀數裡只能走原速的 15%。
 * ⚠️ 量尺先自證（第二守則 d.「量尺自己會說謊」）：原速那一具**必須**真的動，
 * 否則兩邊都是 0 而「比值 0.15」永遠成立。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · `modelFxRig.ts::startClip()` 拿掉 `g.speedRatio = item.clipTimeScale ?? 1;`
 *    → 紅：「clipTimeScale 沒有到達 Babylon 的 AnimationGroup」＋ 比值變成 1.0。
 *    ⇒ 沒有它，h008 那一族的爆殼會以**原速**閃過去（＝看不見）。
 */
describe("model fx clip playback (@visual-proof)", () => {
  const CLIP_MAP = {
    idle: "stand",
    run: "stand",
    attack: "stand",
    cast: "stand",
    hurt: "stand",
    death: "death",
  } as const;
  const ONE: ModelFxSpawnEvent = { ...WIRE, instances: [WIRE.instances[0]!] };

  /** 一份帶兩條**真的** `AnimationGroup` 的容器 —— ⛔ 不是 stub（失敗形態⑤）。 */
  function containerWithClips(scene: Scene): AssetContainer {
    const bone = new TransformNode("bone", scene);
    const mesh = MeshBuilder.CreateBox("geo", { size: 1 }, scene);
    mesh.parent = bone;
    const container = new AssetContainer(scene);
    container.transformNodes.push(bone);
    container.meshes.push(mesh);
    container.rootNodes.push(bone);
    for (const name of ["stand", "death"]) {
      const track = new Animation(`${name}-track`, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT);
      track.setKeys([
        { frame: 0, value: 0 },
        { frame: 600, value: 600 },
      ]);
      const g = new AnimationGroup(name, scene);
      g.addTargetedAnimation(track, bone);
      g.normalize(0, 600);
      container.animationGroups.push(g);
    }
    return container;
  }

  /** 這一具**網格第一個頂點**現在的世界座標 Y（⛔ 不是節點上的欄位）。 */
  function vertexWorldY(g: { targetedAnimations: { target: unknown }[] }): number {
    const host = g.targetedAnimations[0]!.target as TransformNode;
    const mesh = host.getChildMeshes(false)[0]!;
    mesh.computeWorldMatrix(true);
    const p = mesh.getVerticesData("position")!;
    return Vector3.TransformCoordinates(
      new Vector3(p[0]!, p[1]!, p[2]!),
      mesh.getWorldMatrix(),
    ).y;
  }

  it("指名的剪輯真的在播,而且凍播那一具的頂點只走 15%", async () => {
    const scene = new Scene(new NullEngine());
    // ⚠️ 固定動畫步長 ⇒ 兩具走過**同樣的幀數**,比值才有意義（⛔ 不吃 wall-clock）。
    scene.useConstantAnimationDeltaTime = true;
    new FreeCamera("cam", new Vector3(0, 0, -10), scene);
    const container = containerWithClips(scene);
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1, clipMap: CLIP_MAP }),
      loadContainer: () => Promise.resolve(container),
    });

    rig.spawn({ ...ONE, clip: "death", clipTimeScale: 0.15 }); // 容器晚到 ⇒ 走回填那條路
    await new Promise((r) => setTimeout(r, 0));
    rig.spawn({ ...ONE, clip: "death" }); // 對照組:原速（clipTimeScale 缺席 = 1）

    const mine = scene.animationGroups.filter((g) => g.name.startsWith("modelfx-"));
    const playing = mine.filter((g) => g.isPlaying);
    expect(playing.length, "指名的剪輯沒有起播 —— 模型是一具定格的雕像").toBe(2);
    // ⛔ 沒被指名的那一條一格都不許動（`clip` 解錯名就會變成「播了別條」）。
    expect(mine.filter((g) => g.name.endsWith("stand") && g.isPlaying)).toHaveLength(0);
    const slow = playing.find((g) => g.speedRatio === 0.15);
    const fast = playing.find((g) => g.speedRatio === 1);
    expect(slow, "clipTimeScale 沒有到達 Babylon 的 AnimationGroup").toBeDefined();
    expect(fast, "缺席的 clipTimeScale 應該是原速 1").toBeDefined();

    const y0 = { slow: vertexWorldY(slow!), fast: vertexWorldY(fast!) };
    for (let i = 0; i < 20; i++) scene.render();
    const moved = {
      slow: vertexWorldY(slow!) - y0.slow,
      fast: vertexWorldY(fast!) - y0.fast,
    };
    // ⭐ 量尺自證:原速那一具**必須**真的走 —— 否則 0/0 讓下面那條永遠成立。
    expect(moved.fast, "量尺壞了:原速那一具的頂點一格都沒動").toBeGreaterThan(1);
    expect(
      moved.slow / moved.fast,
      "凍播沒有生效 —— 爆殼會以原速閃過去（＝玩家看不到）",
    ).toBeCloseTo(0.15, 2);
    rig.dispose();
    expect(scene.animationGroups.filter((g) => g.name.startsWith("modelfx-"))).toHaveLength(0);
  });
});

/**
 * ⭐【GH#697 —— tint 走得到「看得見的那一格」】**@visual-proof**
 *
 * V6 lane 2026-08-25 現場量到：出貨節點寫 `tint:[1,0,0]`，**畫面上的閃電是藍的**。
 * 而在這一族守衛出現之前，`model fx tint ①` 是**綠的** —— 它讀的是
 * `diffuseColor`，而 stock 特效模型的顏色**不住在那裡**（失敗形態⑧：消費端存在，
 * 但它讀的是一格不影響畫面的欄位）。
 *
 * ## 量到的分佈（404 份出貨 glb，`docs/_reports/C7_temp_20260825.md` §1）
 *
 * | 材質形狀 | 份數 | 顏色住哪 |
 * |---|---:|---|
 * | `emissiveTexture` + `emissiveFactor[1,1,1]` + BLEND（`gltf.py` 的 glow 分支） | **152** | `emissiveColor` |
 * | `emissiveFactor` 亮著、無貼圖（兩份都逐字叫 `Glow`） | 4 | `emissiveColor` |
 * | `emissiveColor` 全黑（不透明 body / MASK / 一般 BLEND） | 684 | `albedoColor` |
 *
 * ⭐ 三條斷言讀的都是**出貨那一份 .glb 自己宣告的材質**（從 glb 的 JSON chunk 解出來
 * 再建成真的 `PBRMaterial`），⛔ 不是我手寫的夾具（失敗形態⑤：2026-08-23 抓到三份
 * 夾具，其中一份的欄位全 repo 不存在）。
 * 真的像素證據（`readPixels` 前後 R/B 翻轉）在
 * `docs/_reports/fxtint_visual-proof_20260825/` ＋ `public/fxtint-audition.html`。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · `modelFxRig.ts::applyFxTint()` 拿掉自發光那一段分流（`if (letsLightThrough) …`）
 *    → ① 紅：「tint 沒有到達**看得見的那一格**：B 通道還是 1」。
 *    ⇒ 沒有它，locust 計畫「fxTint 回填 133 隻非白 dummy」整條線逐位元是空的。
 */
describe("model fx tint 分流：顏色住哪就乘哪 (@visual-proof)", () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  interface GltfMat {
    name?: string;
    emissiveFactor?: number[];
    pbrMetallicRoughness?: { baseColorFactor?: number[] };
  }
  /** 出貨那一份 .glb **自己宣告**的材質（glTF 的 JSON chunk）。 */
  function shippedMats(file: string): GltfMat[] {
    const buf = readFileSync(join(REPO, "content/assets/models/imported", file));
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let off = 12; off + 8 <= buf.byteLength; ) {
      const len = view.getUint32(off, true);
      if (view.getUint32(off + 4, true) === 0x4e4f534a)
        return (
          JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len)))
            .materials ?? []
        );
      off += 8 + len;
    }
    return [];
  }
  /** 把那份宣告建成**真的** PBRMaterial —— glTF 載入器就是這樣映射這兩格的。 */
  function containerFrom(scene: Scene, mats: GltfMat[]): AssetContainer {
    const container = new AssetContainer(scene);
    mats.forEach((m, i) => {
      const mat = new PBRMaterial(m.name ?? `mat${i}`, scene);
      const bc = m.pbrMetallicRoughness?.baseColorFactor;
      mat.albedoColor = new Color3(bc?.[0] ?? 1, bc?.[1] ?? 1, bc?.[2] ?? 1);
      const e = m.emissiveFactor ?? [0, 0, 0];
      mat.emissiveColor = new Color3(e[0] ?? 0, e[1] ?? 0, e[2] ?? 0);
      const mesh = MeshBuilder.CreateBox(`geo${i}`, { size: 1 }, scene);
      mesh.material = mat;
      container.meshes.push(mesh);
      container.rootNodes.push(mesh);
    });
    return container;
  }
  /** 跑**出貨那條路**（`ModelFxRig.spawn` → `fillGeometry` → `applyFxTint`），回最終素材。 */
  async function paint(file: string, tint: [number, number, number]): Promise<PBRMaterial[]> {
    const scene = new Scene(new NullEngine());
    const container = containerFrom(scene, shippedMats(file));
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: `assets/models/imported/${file}`, scale: 1, fxTint: tint }),
      loadContainer: () => Promise.resolve(container),
    });
    rig.spawn({ ...WIRE, instances: [WIRE.instances[0]!] });
    await new Promise((r) => setTimeout(r, 0));
    return scene.meshes
      .map((m) => m.material as PBRMaterial | null)
      .filter((m): m is PBRMaterial => !!m && m.name.endsWith("-fxtint"));
  }

  it("① luma-keyed stock 特效：tint [1,0,0] 把 B 通道消掉（藍→紅）", async () => {
    // 貼圖本身是藍的（量到的可見像素均值 R32 G91 B134，最亮的核心是白的），
    // 而 `finalEmissive = emissiveColor × emissiveTex` ⇒ B 通道歸零 = 螢幕上只剩紅。
    const src = shippedMats("monsoonbolttarget.glb");
    expect(
      src.every((m) => Math.max(...(m.emissiveFactor ?? [0, 0, 0])) > 0),
      "前提不成立：這份出貨 glb 的材質不是自發光主導的",
    ).toBe(true);
    const mats = await paint("monsoonbolttarget.glb", [1, 0, 0]);
    expect(mats.length, "一份著色過的素材都沒有進場景樹").toBe(src.length);
    for (const m of mats) {
      // ⭐ 量尺自證：albedo 那一半**本來就會動** —— 它沒動代表這一頁量錯了，
      //    下面「B 歸零」的結論一律作廢（第二守則 d：量尺自己會說謊）。
      expect(m.albedoColor.b, "量尺壞了：連舊的 albedo 那一半都沒有被乘到").toBe(0);
      expect(
        m.emissiveColor.b,
        "tint 沒有到達**看得見的那一格** —— 節點寫 [1,0,0] 而畫面上還是藍的",
      ).toBe(0);
      expect(m.emissiveColor.r, "紅通道被一起消掉了 ⇒ 整具會變黑").toBeGreaterThan(0);
    }
  });

  it("② sentinel —— 不透明 body（英雄 glb）的自發光逐位元不變", async () => {
    const file = "herosephiroth.glb"; // 3 份材質、全 OPAQUE、emissiveFactor 全缺席
    const before = shippedMats(file).map((m) => m.emissiveFactor ?? [0, 0, 0]);
    const mats = await paint(file, [1, 0, 0]);
    expect(mats.length).toBe(before.length);
    mats.forEach((m, i) => {
      const e = before[i]!;
      expect(
        [m.emissiveColor.r, m.emissiveColor.g, m.emissiveColor.b],
        "分流塗到了不該塗的 body 材質",
      ).toEqual([e[0] ?? 0, e[1] ?? 0, e[2] ?? 0]);
      expect(m.albedoColor.b, "body 的 albedo 才是它該走的那一格").toBe(0);
    });
  });

  it("③ 近黑退路 —— 全 glow 的 blackhole 染 [0,0,0] 不會整具消失", async () => {
    // ⛔ 出貨的 `imported.blackhole` 五份材質**全部**是 glow；乘 0 進加法層 = 消失。
    const mats = await paint("blackhole.glb", [0, 0, 0]);
    expect(mats.length).toBeGreaterThan(0);
    for (const m of mats) {
      expect(
        Math.max(m.emissiveColor.r, m.emissiveColor.g, m.emissiveColor.b),
        "近黑 tint 把加法層乘成 0 —— 38-002 黑龍波整具從畫面上不見",
      ).toBeGreaterThan(0);
      expect(m.albedoColor.r, "黑剪影那一半仍然要發生").toBe(0);
    }
  });
});
