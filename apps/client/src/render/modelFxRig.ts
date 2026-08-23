/**
 * modelFxRig —— `spawnModelFx` 的 BABYLON 那一半:**一隻 .glb 沿路徑移動**。
 *
 * ⚠️ 這是 GGD 第一個「模型即特效」的通道。既有的三條通道全部是粒子/幾何:
 *   · `vfx/particleFactory` + `render/vfx/W3xEmitterRig` —— PRE2 粒子
 *   · `vfx/RibbonTrail` —— 刀光
 *   · `vfx/Telegraph` / `castBeam` —— 程序生成的幾何
 * 沒有任何一個能演「一顆會滾的球體從 A 飛到 B」,因為那在原作裡是一隻**單位**。
 *
 * ── 這個檔案為什麼**不**自己造一套池子的規矩 ──────────────────────────────
 * #131(卡在角落的白色爆光)的根因是一個**沒有主人**的連續發射器:掛著它的骨頭被
 * 模型置換 dispose 掉,Babylon 把它重新掛回 WORLD 的 (0,0,0),於是它在場中央一直
 * 燒到整場結束。`W3xEmitterRig` 為此立了三條規矩,這裡逐條照抄(⛔ 不是重寫):
 *   ① **每一個活著的實例都有硬壽命上限**(`maxEffectSec`),忘了收也會自己死;
 *   ② **free-list 而不是 dispose/new**,所以重複施放不配置記憶體;
 *   ③ **`dispose()` 走一份登錄表**,⛔ 不是只收「我記得的那幾個」。
 *
 * ⭐ 而且 free-list 有**上界**(`maxPooledPerModel`)。一個沒有上界的池子在
 * 「一場 20 分鐘、十幾支技能各生 20 顆」之後就是一份永遠不還的記憶體 ——
 * 它不會像 #131 那樣被看見,所以更難查。
 *
 * ── ⛔ 這裡不算傷害,也不排落點特效 ────────────────────────────────────────
 * 約定介面上的 `onArrive` / `onTouch` 帶的是 `EffectDef[]`,那是**引擎**(L1)在
 * 權威側解算的。客戶端自己解算命中 = 失敗形態⑤,⛔ 永遠不做。
 *
 * ⭐ **落點爆炸也不在這裡**（2026-08-23 移除,GH#606）。舊版有一個 `onArriveFx`
 * 視覺回呼,而唯一的呼叫端讀的是 `ev.data.arriveVfxKey` —— **零個寫入端的幽靈
 * 欄位**,所以那條回呼從第一天起就沒有響過一次。⛔ 修法不是補上那個欄位:
 * 落點特效寫在技能 JSON 的 `onArrive: [{ kind: "spawnVfx", … }]` 就好,它走
 * sim 的延遲班表 ⇒ **特效與傷害在同一 tick 同一點**。客戶端再排一次是第二個
 * 住處,而且會跟傷害差幾幀（第〇·四／第〇·五守則）。
 */
import type { ModelDoc } from "@ggd/shared/content";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  modelFxAxisCorrection,
  modelFxPoseFromWire,
  modelFxWireLifeSec,
  type ModelFxLongAxis,
  type ModelFxSpawnEvent,
  type ModelFxSpawnInstance,
} from "./modelFxPath";

/** 一個 `model@1` 文件裡這個 rig 需要的三格。 */
export interface ModelFxModelDoc {
  glbPath: string;
  scale?: number;
  /**
   * ⭐ 這一份 .glb 的長軸烘在哪一軸（`model@1.fxLongAxis`）。缺席 ⇒ ⛔ 不修正。
   * ⚠️ 它是**模型**的性質不是技能的：同一份 `netherstrike.glb` 被兩支技能引用，
   * 兩邊必須拿到同一個答案（第〇·四守則）。
   */
  fxLongAxis?: ModelFxLongAxis;
  /** ⭐ 移動特效離地多高（`model@1.fxSpawnHeight`）。缺席 ⇒ 0 ＝ 今天的行為。 */
  fxSpawnHeight?: number;
  /**
   * ⭐ 這一份外觀的頂點著色（`model@1.fxTint`，線性 RGB 各 0…1）。缺席 ⇒ ⛔ 不著色。
   * ⚠️ 原作把它掛在 locust dummy 的**單位型別**上（w3u `Art - Vertex Colour`
   * ＋ `SetUnitVertexColor`），而 GGD 這一側在 2026-08-23 之前**整格不存在** ——
   * 於是 38-002 究極暴走黑龍波的兩具 dummy（原作 `[0,0,0]` 純黑）以素材原色出場。
   */
  fxTint?: readonly [number, number, number];
}

/**
 * 把 `fxTint` 乘進這一棵子樹上每一份素材的**漫反射/反照率**。
 *
 * ⚠️ ⭐ **一定要先 clone 素材。** `instantiateModelsToScene({doNotInstantiate:true})`
 * 複製的是節點，⛔ 不是素材 —— 同一個 `AssetContainer` 出來的每一具共用同一個
 * `Material` 物件。⛔ 就地改它 = 這個 modelKey 的**每一具**（含未來別的技能引用它時）
 * 一起變色，而且 `dispose()` 之後那份污染還留在容器裡。
 *
 * ⚠️ ⭐ **⛔ 不動自發光（emissive）與 alpha。** 原作的 `SetUnitVertexColor` 在
 * 純黑（`[0,0,0]`）時畫出來的是**黑色剪影**，⛔ 不是「消失」。把 0 乘進加法混合的
 * 自發光層會讓整具模型從畫面上不見 —— 那是失敗形態①（算出來了但畫在看不見的地方），
 * 而且它與「顏色正確」在測試上長得一模一樣。
 *
 * ⚠️ 斷言要讀**最終**物件：這裡把 clone 指回 `mesh.material`，所以任何對**原始**
 * 素材物件寫的斷言，不管有沒有生效都會過（見 `views/mobTint.test.ts` 的檔頭）。
 */
export function applyFxTint(root: TransformNode, tint: readonly [number, number, number]): number {
  let painted = 0;
  for (const mesh of root.getChildMeshes(false)) {
    const mat = (mesh as { material?: unknown }).material as
      | { clone?: (n: string) => unknown; name?: string }
      | null
      | undefined;
    if (!mat || typeof mat.clone !== "function") continue;
    const copy = mat.clone(`${mat.name ?? "mat"}-fxtint`) as
      | (Record<string, unknown> & { name?: string })
      | null;
    if (!copy) continue;
    // ⭐ 兩種素材各自的漫反射欄位名（StandardMaterial / PBRMaterial）。⛔ 不碰
    //    `emissiveColor` 與 `alpha` —— 見上面的註解。
    for (const key of ["diffuseColor", "albedoColor"] as const) {
      const c = copy[key] as { r: number; g: number; b: number } | undefined;
      if (!c) continue;
      c.r *= tint[0];
      c.g *= tint[1];
      c.b *= tint[2];
    }
    (mesh as { material?: unknown }).material = copy;
    painted++;
  }
  return painted;
}

/**
 * ⛔⛔ **出貨路徑上「`model@1` → 這個 rig」的唯一接縫**（GH#607）。
 *
 * ── 它為什麼是一個具名函式而不是一段 inline lambda ──────────────────────────
 * 2026-08-23 量到：`GameApp.ts` 的 `modelDocFor` 接縫**手挑欄位**
 * （`{ glbPath: doc.glbPath, scale: doc.scale }`）⇒ `fxLongAxis` /
 * `fxSpawnHeight` 在那一行被丟掉。於是 owner 逐字要的「**90 度橫放的 beam**」
 * 軸修正**從第一天起就沒有生效過**，而且每一具移動模型都貼在 y=0 拖行。
 *
 * ⚠️ **每一個零件都是對的**（第一·五守則的形狀）：`model@1` 兩格都存了
 * （`imported.netherstrike` 宣告 `fxLongAxis:"y"`、`imported.fireblast` 宣告
 * `"x"`）、`spawn()` 兩格都讀了、`modelFxAxis.test.ts` 兩格都驗了 ——
 * 缺的只有**中間那一段**，而它是一個沒有人測過的投影（失敗形態⑧）。
 *
 * ⭐ 所以修法⛔ 不是「把那兩格補進那個字面值」——下一格照樣會漏。
 * 修法是**不要投影**：整份文件走過去，「rig 讀得到哪幾格」由
 * {@link ModelFxModelDoc} 這個**子集型別**說了算，⛔ 不由呼叫端各自抄一份。
 * ⇒ 之後在 `model@1` 上加第三格 fx 欄位時，**零行接線**。
 */
export function modelFxDocFor(doc: ModelDoc | null | undefined): ModelFxModelDoc | null {
  return doc ?? null;
}

export interface ModelFxRigOptions {
  /** modelKey → model@1 文件（GameApp 從 contentDb 餵）。null = 這個 key 沒有模型 */
  resolveModel(modelKey: string): ModelFxModelDoc | null;
  /** glb 載入（出貨是 `AssetManager.load`；測試注入 stub，headless 不解碼） */
  loadContainer(glbPath: string): Promise<AssetContainer | null>;
  /** 同時最多幾個實例（含所有技能）。超過就不生 —— ⛔ 不排隊，排隊會遲到 */
  maxLive?: number;
  /** 每個 modelKey 的 free-list 上界 */
  maxPooledPerModel?: number;
  /** ⭐ 所有 free-list 加起來的上界（⛔ 沒有它，per-key 上限乘上無界的 key 數 = 無界） */
  maxPooledTotal?: number;
  /** 任何實例的硬壽命上限（秒）。忘了收也會死 */
  maxEffectSec?: number;
}

/** 出貨預設 —— ⚠️ 這幾格是**預算**不是平衡值，所以住這裡是對的（第〇·四守則的豁免）。 */
const DEFAULT_MAX_LIVE = 48;
const DEFAULT_MAX_POOLED_PER_MODEL = 12;
/**
 * ⭐ free-list 的**全域**上界（GH#429）。
 *
 * ⚠️ `maxPooledPerModel` 看起來像一個上界，⛔ 但它不是 —— 那正是 GH#270 逐字
 * 記下來的教訓（`VfxSystem.resetForRound` 的註解）：
 * 「**per-key 上限只有在 key 的數量有上界時才構成上界**」。
 * 而 modelKey 的數量在一場比賽裡是**一直增加**的：英雄升級解鎖 R/EX、第 3 回合起
 * 殭屍加入、每回合換地圖（#145）。實測（`modelFxRoundGrowth.test.ts` 的前身探針，
 * 每回合 3 個新 modelKey、8 個回合）：場景裡的 `modelfx-*` TransformNode 是
 * **72 → 144 → 216 → … → 576**，逐回合 +72，而且回合邊界一個都沒還回去。
 */
const DEFAULT_MAX_POOLED_TOTAL = 48;
const DEFAULT_MAX_EFFECT_SEC = 8;

/**
 * 一個實例的**兩層**節點。
 *
 * ⭐ 兩層是必要的，⛔ 不是潔癖：`root` 演「它在哪、往哪走、滾多快」，
 * `axis` 演「這份網格當初朝哪一軸建」。掛成父子之後合成順序是
 * `Ry(yaw) ∘ Rz(roll) ∘ A` —— 翻滾繞的是**已經橫放好的長軸**。
 * ⛔ 併成一層（把修正加進 `rotation`）做不到這件事：Babylon 的 euler 是
 * yaw∘pitch∘roll 固定順序，修正只能擠在 roll **外面**，於是每滾一圈光束就
 * 甩離航線一次。
 */
interface ModelFxNodes {
  root: TransformNode;
  axis: TransformNode;
}

interface LiveModelFx {
  root: TransformNode;
  axis: TransformNode;
  modelKey: string;
  /** ⭐ sim 解算完的**這一具**（⛔ 不是整發的 spec —— 客戶端不再自己算路徑，GH#606） */
  inst: ModelFxSpawnInstance;
  y: number;
  spinDegPerSec?: number;
  ageSec: number;
  lifeSec: number;
}

export class ModelFxRig {
  /** modelKey → 閒置的實例節點對 */
  private readonly pool = new Map<string, ModelFxNodes[]>();
  /** 這個 rig 造過的**每一個**節點（dispose 走這一份，⛔ 不是走 live） */
  private readonly born: TransformNode[] = [];
  private readonly live: LiveModelFx[] = [];
  private readonly containers = new Map<string, AssetContainer | null>();
  private readonly loading = new Set<string>();
  private disposed = false;

  private readonly maxLive: number;
  private readonly maxPooledPerModel: number;
  private readonly maxPooledTotal: number;
  private readonly maxEffectSec: number;
  /** ⚠️ 單調遞增的流水號。⛔ 不可以用 `born.length` —— 回收會把它縮回去，於是
   *  兩個同時活著的節點會拿到**同一個名字**，而守衛正是照名字在場景上數的。 */
  private serial = 0;

  constructor(
    private readonly scene: Scene,
    private readonly opts: ModelFxRigOptions,
  ) {
    this.maxLive = opts.maxLive ?? DEFAULT_MAX_LIVE;
    this.maxPooledPerModel = opts.maxPooledPerModel ?? DEFAULT_MAX_POOLED_PER_MODEL;
    this.maxPooledTotal = opts.maxPooledTotal ?? DEFAULT_MAX_POOLED_TOTAL;
    this.maxEffectSec = opts.maxEffectSec ?? DEFAULT_MAX_EFFECT_SEC;
  }

  /** 目前活著的實例數（守衛量這個 —— 池子不長大的證據）。 */
  get liveCount(): number {
    return this.live.length;
  }

  /** 所有 free-list 加起來（守衛量這個 —— 回收真的有發生的證據）。 */
  get pooledCount(): number {
    let n = 0;
    for (const list of this.pool.values()) n += list.length;
    return n;
  }

  /**
   * 放一支 `spawnModelFx`。回傳實際生出來的實例數（0 = 沒模型 / 撞預算）。
   *
   * ⚠️ 撞到 `maxLive` 時**直接不生**,⛔ 不排隊 —— 一個遲到的特效比沒有更糟
   * (它會在事情結束之後才出現)。這與 `emitterBudget` 的 fail-fast 同一個立場。
   */
  /**
   * ⭐ 吃 **`modelFxSpawn` 的線路酬載**（GH#606）。
   *
   * ⛔ 舊簽章是 `spawn(spec, at)` —— 而**出貨路徑從來沒有那樣呼叫過它**：
   * sim 送的是 `{ caster, modelKey, instances, … }`，客戶端讀的是 `ev.data.spec`，
   * 兩邊從第一天起就對不上。⚠️ 而 `modelFxRig.test.ts` 一直是綠的，因為
   * **它自己造了一個 spec 餵進來**（第二守則失敗形態⑤：被測的不是出貨的那個）。
   */
  spawn(ev: ModelFxSpawnEvent): number {
    if (this.disposed) return 0;
    const doc = this.opts.resolveModel(ev.modelKey);
    if (!doc) return 0;
    this.ensureContainer(ev.modelKey, doc.glbPath);

    const room = Math.max(0, this.maxLive - this.live.length);
    const n = Math.min(ev.instances.length, room);
    const lifeSec = modelFxWireLifeSec(ev.instances, this.maxEffectSec);

    // ⭐ 初始姿態:把這份網格烘出來的長軸擺到行進軸上(owner 的「90 度橫放的 beam」)。
    // ⚠️ 它掛在**內**層,所以 `spinDegPerSec` 的翻滾繞的是已經橫放好的那根長軸。
    const axisEuler = modelFxAxisCorrection(doc.fxLongAxis);

    let made = 0;
    for (let i = 0; i < n; i++) {
      const inst = ev.instances[i];
      if (!inst) break;
      const nodes = this.acquire(ev.modelKey, doc);
      if (!nodes) break;
      const { root, axis } = nodes;
      root.scaling.setAll((doc.scale ?? 1) * (ev.scale ?? 1));
      axis.rotation.set(axisEuler.x, axisEuler.y, axisEuler.z);
      root.setEnabled(true);
      const item: LiveModelFx = {
        root,
        axis,
        modelKey: ev.modelKey,
        inst,
        y: doc.fxSpawnHeight ?? 0,
        ...(ev.spinDegPerSec !== undefined ? { spinDegPerSec: ev.spinDegPerSec } : {}),
        ageSec: 0,
        lifeSec,
      };
      this.applyPose(item);
      this.live.push(item);
      made++;
    }
    return made;
  }

  /**
   * 推進每一個活著的實例。
   *
   * ⚠️ 走**倒序**,因為回收會就地移除 —— 正序 splice 會跳過下一個
   * (那正是 GH#270 孤兒發射器盤點時抓到的形狀)。
   */
  tick(dtMs: number): void {
    if (this.disposed) return;
    const dt = dtMs / 1000;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const item = this.live[k]!;
      item.ageSec += dt;
      this.applyPose(item);
      if (item.ageSec >= item.lifeSec) {
        this.live.splice(k, 1);
        this.release(item);
      }
    }
  }

  /**
   * 每一具活著的實例**現在**在哪（測試用）。
   *
   * ⭐ 它存在的理由是 GH#606：守衛必須問「模型有沒有真的出現在 sim 算的那條線上」，
   * 而那個答案只在 Babylon 節點上。⛔ 讀 `spec` 之類的輸入回答不了 ——
   * 那正是舊守衛全綠的方式（失敗形態⑤）。
   */
  livePositions(): { x: number; y: number; z: number }[] {
    return this.live.map((i) => ({ x: i.root.position.x, y: i.root.position.y, z: i.root.position.z }));
  }

  /** 回合邊界:全部收回 free-list（⛔ 不 dispose —— 下一回合還要用）。 */
  resetForRound(): void {
    for (const item of this.live) this.release(item);
    this.live.length = 0;
  }

  /**
   * 回合邊界:把**所有** free-list 加起來修剪到 `cap`（GH#429）。
   *
   * ⭐ 這是 `AmbientVfx.drainPools()` 與 `VfxSystem` 的 `pool.clear()` 同一件事:
   * 「只會長不會縮的池子在回合邊界整個還回去」。⛔ 少了它，上一回合那幾支技能的
   * modelKey 會**永遠**各留 `maxPooledPerModel` 個帶著 glb 幾何的隱藏節點在場上。
   *
   * `cap` 由呼叫端從 `vfxCleanupPolicy` 推導（`Infinity` = 完全不修剪，止血閥），
   * ⛔ 不在這裡讀 config —— 這一層不知道內容從哪來（同 `resolveModel` 的立場）。
   */
  trimPoolTo(cap: number): void {
    if (this.disposed || Number.isNaN(cap)) return;
    for (const [key, free] of [...this.pool]) {
      while (this.pooledCount > cap && free.length > 0) this.retire(free.pop()!.root);
      // ⛔ 空的 free-list 也要除名:`pool` 的 key 數本身就是那個無界的東西。
      if (free.length === 0) this.pool.delete(key);
    }
  }

  /** 收掉這個 rig 造過的**每一個**節點與容器。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.live.length = 0;
    this.pool.clear();
    for (const root of this.born) root.dispose(false, true);
    this.born.length = 0;
    for (const c of this.containers.values()) c?.dispose();
    this.containers.clear();
  }

  // ── 內部 ──────────────────────────────────────────────────────────────────

  private applyPose(item: LiveModelFx): ReturnType<typeof modelFxPoseFromWire> {
    const pose = modelFxPoseFromWire(
      item.inst,
      { y: item.y, ...(item.spinDegPerSec !== undefined ? { spinDegPerSec: item.spinDegPerSec } : {}) },
      item.ageSec,
    );
    item.root.position.set(pose.x, pose.y, pose.z);
    // yaw 繞世界 Y,roll 繞模型自己的前方軸(Babylon 的 Z)。
    // ⭐ 長軸修正住在**子**節點(`axis`)上,所以這裡的 roll 繞的是**已經橫放好的**
    //    那根長軸 —— 翻滾光束會沿著自己滾,⛔ 不是每滾一圈甩離航線一次。
    item.root.rotation.set(0, pose.yawRad, pose.rollRad);
    return pose;
  }

  private ensureContainer(modelKey: string, glbPath: string): void {
    if (this.containers.has(modelKey) || this.loading.has(modelKey)) return;
    this.loading.add(modelKey);
    void this.opts
      .loadContainer(glbPath)
      .then((c) => {
        this.loading.delete(modelKey);
        if (this.disposed) {
          c?.dispose();
          return;
        }
        this.containers.set(modelKey, c);
      })
      .catch(() => {
        this.loading.delete(modelKey);
        this.containers.set(modelKey, null);
      });
  }

  /**
   * 拿一個實例根節點:先掏 free-list,空了才造。
   *
   * ⚠️ glb 還在串流時**照樣**回一個空的 root —— 特效於是準時出現在正確的位置上,
   * 幾何晚幾幀補進來。⛔ 反過來(等載入完再生)會讓技能的第一次施放沒有特效,
   * 而那正是玩家最會注意的那一次。
   */
  private acquire(modelKey: string, doc: ModelFxModelDoc): ModelFxNodes | null {
    const free = this.pool.get(modelKey);
    const reused = free?.pop();
    if (reused) return reused;

    const serial = this.serial++;
    const root = new TransformNode(`modelfx-${modelKey}-${serial}`, this.scene);
    this.born.push(root);
    // ⭐ 內層 = 長軸修正。⚠️ 它是**節點**不是一次性的旋轉:實例會被回收重用,
    // 而下一次施放的模型可能是另一份 .glb(另一個 free-list),所以修正要跟著節點走。
    // 名字帶 `axis-` 是刻意的 —— 守衛從**出貨的場景樹**上把它撈出來量,
    // ⛔ 不是靠一個只有測試會呼叫的存取器(失敗形態⑤)。
    const axis = new TransformNode(`modelfx-axis-${modelKey}-${serial}`, this.scene);
    axis.parent = root;
    const container = this.containers.get(modelKey);
    if (container) {
      const inst = container.instantiateModelsToScene(
        (n) => `modelfx-${serial}-${n}`,
        false,
        { doNotInstantiate: true },
      );
      for (const node of inst.rootNodes) node.parent = axis;
      // ⭐ 頂點著色：原作把顏色掛在 dummy 的**單位型別**上，這裡是它的對應物。
      // ⚠️ 掛在 `acquire` 而⛔ 不是 `spawn`，因為素材 clone 是**每一具一次**的成本，
      //    而實例會被回收重用 —— 放進 `spawn` 就是每一次施放都重新 clone 一批素材。
      if (doc.fxTint) applyFxTint(axis, doc.fxTint);
    }
    return { root, axis };
  }

  private release(item: LiveModelFx): void {
    item.root.setEnabled(false);
    let free = this.pool.get(item.modelKey);
    if (!free) {
      free = [];
      this.pool.set(item.modelKey, free);
    }
    // ⭐ 上界:free-list 滿了就**真的收掉**這一個,並且從 `born` 裡除名。
    // ⛔ 不可以只是「不放回池子」—— 那個節點會變成沒有人指得到的孤兒,
    //    活到 dispose() 為止,而一場 20 分鐘的比賽會積出幾百個(#131 的慢動作版)。
    // ⭐ **兩**道閘。⚠️ 只有 per-model 那一道是不夠的（GH#429）——
    //    見 `DEFAULT_MAX_POOLED_TOTAL` 的註解與量到的 72/回合。
    if (free.length < this.maxPooledPerModel && this.pooledCount < this.maxPooledTotal) {
      free.push({ root: item.root, axis: item.axis });
      return;
    }
    this.retire(item.root);
  }

  /** 真的收掉一個實例節點並從 `born` 除名（⛔ 不可以只是「不放回池子」—— 那是孤兒）。 */
  private retire(root: TransformNode): void {
    const at = this.born.indexOf(root);
    if (at >= 0) this.born.splice(at, 1);
    root.dispose(false, true);
  }
}
