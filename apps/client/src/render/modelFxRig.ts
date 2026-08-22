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
  modelFxInstanceCount,
  modelFxLifeSec,
  modelFxPose,
  type ModelFxMotionSpec,
  type ModelFxOrigin,
  type Vec3Like,
} from "./modelFxPath";

/** 一個 `model@1` 文件裡這個 rig 需要的兩格。 */
export interface ModelFxModelDoc {
  glbPath: string;
  scale?: number;
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
  /** 任何實例的硬壽命上限（秒）。忘了收也會死 */
  maxEffectSec?: number;
}

/** 出貨預設 —— ⚠️ 這幾格是**預算**不是平衡值，所以住這裡是對的（第〇·四守則的豁免）。 */
const DEFAULT_MAX_LIVE = 48;
const DEFAULT_MAX_POOLED_PER_MODEL = 12;
const DEFAULT_MAX_EFFECT_SEC = 8;

interface LiveModelFx {
  root: TransformNode;
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
  /** modelKey → 閒置的實例根節點 */
  private readonly pool = new Map<string, TransformNode[]>();
  /** 這個 rig 造過的**每一個**節點（dispose 走這一份，⛔ 不是走 live） */
  private readonly born: TransformNode[] = [];
  private readonly live: LiveModelFx[] = [];
  private readonly containers = new Map<string, AssetContainer | null>();
  private readonly loading = new Set<string>();
  private disposed = false;

  private readonly maxLive: number;
  private readonly maxPooledPerModel: number;
  private readonly maxEffectSec: number;

  constructor(
    private readonly scene: Scene,
    private readonly opts: ModelFxRigOptions,
  ) {
    this.maxLive = opts.maxLive ?? DEFAULT_MAX_LIVE;
    this.maxPooledPerModel = opts.maxPooledPerModel ?? DEFAULT_MAX_POOLED_PER_MODEL;
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

    let made = 0;
    for (let i = 0; i < n; i++) {
      const root = this.acquire(spec.modelKey);
      if (!root) break;
      root.scaling.setAll((doc.scale ?? 1) * (spec.scale ?? 1));
      root.setEnabled(true);
      const item: LiveModelFx = {
        root,
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
  private acquire(modelKey: string): TransformNode | null {
    const free = this.pool.get(modelKey);
    const reused = free?.pop();
    if (reused) return reused;

    const root = new TransformNode(`modelfx-${modelKey}-${this.born.length}`, this.scene);
    this.born.push(root);
    const container = this.containers.get(modelKey);
    if (container) {
      const inst = container.instantiateModelsToScene(
        (n) => `modelfx-${this.born.length}-${n}`,
        false,
        { doNotInstantiate: true },
      );
      for (const node of inst.rootNodes) node.parent = root;
    }
    return root;
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
    if (free.length < this.maxPooledPerModel) {
      free.push(item.root);
      return;
    }
    const at = this.born.indexOf(item.root);
    if (at >= 0) this.born.splice(at, 1);
    item.root.dispose(false, true);
  }
}
