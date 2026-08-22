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
 * ── ⛔ 這裡不算傷害 ─────────────────────────────────────────────────────────
 * 約定介面上的 `onArrive` / `onTouch` 帶的是 `EffectDef[]`,那是**引擎**(L1)在
 * 權威側解算的。這個 rig 只認得 `onArriveFx` —— 一個「飛到了,在這個座標放個爆炸」
 * 的視覺回呼。客戶端自己解算命中 = 失敗形態⑤,⛔ 永遠不做。
 */
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  modelFxAxisCorrection,
  modelFxInstanceCount,
  modelFxLifeSec,
  modelFxPose,
  type ModelFxLongAxis,
  type ModelFxMotionSpec,
  type ModelFxOrigin,
  type Vec3Like,
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
  spec: ModelFxMotionSpec;
  at: ModelFxOrigin;
  index: number;
  ageSec: number;
  lifeSec: number;
  /** 已經呼叫過 onArriveFx（一次就好，⛔ 不是每一幀） */
  fired: boolean;
  onArriveFx?: (at: Vec3Like) => void;
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
  spawn(
    spec: ModelFxMotionSpec,
    at: ModelFxOrigin,
    onArriveFx?: (at: Vec3Like) => void,
  ): number {
    if (this.disposed) return 0;
    const doc = this.opts.resolveModel(spec.modelKey);
    if (!doc) return 0;
    this.ensureContainer(spec.modelKey, doc.glbPath);

    const want = modelFxInstanceCount(spec);
    const room = Math.max(0, this.maxLive - this.live.length);
    const n = Math.min(want, room);
    const lifeSec = modelFxLifeSec(spec, this.maxEffectSec);

    // ⭐ 初始姿態:把這份網格烘出來的長軸擺到行進軸上(owner 的「90 度橫放的 beam」)。
    // ⚠️ 它掛在**內**層,所以 `spinDegPerSec` 的翻滾繞的是已經橫放好的那根長軸。
    const axisEuler = modelFxAxisCorrection(doc.fxLongAxis);

    let made = 0;
    for (let i = 0; i < n; i++) {
      const nodes = this.acquire(spec.modelKey);
      if (!nodes) break;
      const { root, axis } = nodes;
      root.scaling.setAll((doc.scale ?? 1) * (spec.scale ?? 1));
      axis.rotation.set(axisEuler.x, axisEuler.y, axisEuler.z);
      root.setEnabled(true);
      const item: LiveModelFx = {
        root,
        axis,
        modelKey: spec.modelKey,
        spec,
        at,
        index: i,
        ageSec: 0,
        lifeSec,
        fired: false,
        onArriveFx,
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
      const pose = this.applyPose(item);
      if (pose.arrived && !item.fired) {
        item.fired = true;
        item.onArriveFx?.({ x: pose.x, y: pose.y, z: pose.z });
      }
      if (item.ageSec >= item.lifeSec) {
        if (!item.fired) {
          item.fired = true;
          item.onArriveFx?.({ x: pose.x, y: pose.y, z: pose.z });
        }
        this.live.splice(k, 1);
        this.release(item);
      }
    }
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

  private applyPose(item: LiveModelFx): ReturnType<typeof modelFxPose> {
    const pose = modelFxPose(item.spec, item.at, item.index, item.ageSec);
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
  private acquire(modelKey: string): ModelFxNodes | null {
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
