/**
 * MoveTrailFx —— 【身體移動拖曳光束】：一具身體**在移動時**沿著走過的路徑
 * 拖出來的緞帶光束，速度越快越明顯，訊號一停**當場**拆掉（GH#661）。
 *
 * owner 2026-08-24（同一件事說了兩次）：
 * > 「暴走狀態**追加身體移動拖曳光束特效**」／「初號機的**暴走移動拖曳特效**」
 *
 * ── ⛔ 它與既有的兩條「拖尾」哪裡不一樣（三條都在同一個資料夾裡）─────────
 *
 * | | 誰驅動 | 量的是什麼速度 | 走路會不會有 |
 * |---|---|---|---|
 * | `AmbientVfx` 的 `ribbon@1`（刀光，task #37） | 模型的**武器骨** | 骨頭**相對實體根**（`attachTo(bone, …, root)`） | ⛔ **刻意沒有** |
 * | `VfxSystem.emitWalkDust`（#147） | 每一具身體 | 步幅距離 | 有，但那是**腳下的灰**，⛔ 不是拖曳 |
 * | **這一支** | 被點名的那幾具身體 | 身體的**絕對**世界速度 | ⭐ **正是它存在的理由** |
 *
 * ⚠️ ⭐ 所以這裡**⛔ 不傳 `reference`** 給 `RibbonTrail.attachTo()`。`RibbonTrail`
 * 的檔頭逐字寫著「world speed is useless — a champion walks at ~6 u/s」——
 * 那句話對**刀光**是對的，而對**移動拖曳**它剛好相反：`SWING_ON_SPEED`(3) →
 * `SWING_FULL_SPEED`(8) 這一段正好把「走 ~6 / 衝刺 ~9」映射成
 * 「淡 → 全亮」，也就是 owner 要的「**速度越快越明顯**」。
 * ⇒ ⭐ 零個新的緞帶引擎，⛔ 只是換一個參考系（第〇·五守則）。
 *
 * ── ⭐ 綁**狀態**而不綁技能，靠的是「心跳」，⛔ 不是一個新的協定欄位 ────────
 *
 * 「暴走中」住在 sim。客戶端沒有 `berserk` 這顆 `ENTITY_FLAG`（線上只剩 11 格，
 * `defineTypes` 又是 APPEND-ONLY ⇒ 加一格不可逆），⛔ 而客戶端也不可以重寫一份
 * 會跟 sim 漂開的條件求值器（`persistentVfx` 的檔頭記過同一課）。
 *
 * ⇒ 所以狀態用**既有的**通道講：那份增益自己帶一條 `onInterval` hook，
 * 每 `BEAT` 秒發一則 `spawnVfx{ at:"self" }` —— **hook 隨增益生、隨增益死**。
 * 這一支把每一則當成一次心跳（{@link mark}），並且在
 * `lastBeat + hold` 之後**當場 `detach()`**（⛔ 不是 alpha 0、⛔ 不是等它自己淡掉）。
 *
 * | 為什麼是心跳 | |
 * |---|---|
 * | 暴走**自然到期** | 增益沒了 ⇒ hook 沒了 ⇒ 下一拍不來 ⇒ `hold` 之內清乾淨 |
 * | 暴走**被提前拔掉／死亡** | 同上，⛔ 這正是 `delayed` 排班表做不到的那一半（班表排下去就一定跑完） |
 * | 回合邊界 | {@link clear} |
 *
 * ⚠️ `hold` 必須 **>** 心跳週期，否則兩拍之間會斷一格（拖曳變成閃爍）；
 * 它同時是「暴走結束到畫面乾淨」的上界，所以也必須 **<** #569 的 0.5 秒規定。
 * ⇒ 出貨是 0.25 秒一拍、`durationSec` 0.4 秒（技能 JSON 上那一格，後台可調）。
 *
 * ── 判準：這個 vfxId 是不是一條拖曳 ───────────────────────────────────────
 *
 * ⭐ **看它是不是一份 `ribbon@1`**，⛔ 不是一張 id 名單、⛔ 更不是
 * `if (championId === "初號機")`。在這一支之前，把 `spawnVfx.vfxId` 指到一份
 * `ribbon@1` 是**靜靜的 no-op**（`VfxDefs` 查不到 ⇒ 退回一顆 HitSpark）——
 * `apps/admin/src/vfxLayers.ts` 的警語逐字記著這件事。
 * ⇒ 任何一支技能想要拖曳，只要在內容編輯器裡指一份緞帶文件，⛔ 零行程式。
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { RibbonDefs, type RibbonDoc } from "@ggd/shared/content";
import { RibbonBudget, RibbonTrail, type RibbonTrailOptions } from "./RibbonTrail";

/**
 * 錨點高度（世界單位）—— 緞帶的寬度是**沿世界 Y** 展開的
 * （`ribbonMath.buildRibbonPaths`：`s.y ± width`），所以這一格決定那片光幕
 * 掛在身體的哪一段。0.95 ≈ 胸口，配出貨文件的 ±0.6 ⇒ 大約 0.35–1.55，
 * 也就是**整具身體**的高度，⛔ 不是腳下的一條地板痕。
 */
export const MOVE_TRAIL_BODY_Y = 0.95;

/** 一拍沒有指定 `durationSec` 時的保底 hold（毫秒）。 */
export const MOVE_TRAIL_DEFAULT_HOLD_MS = 400;

/**
 * hold 的硬上界。⭐ 它是「訊號停了之後最久多久會乾淨」的**唯一**保證，
 * 所以⛔ 不可以由內容無上限地拉長（#569：特效不可以留在場上）。
 */
export const MOVE_TRAIL_MAX_HOLD_MS = 1000;

/**
 * 身體連續這麼久沒有被 {@link syncBody} 報告過就當它離場了（死亡／despawn／
 * 分區剔除）。⚠️ 少了它，一具在暴走中倒下的身體會留著一條**凍結**的光束
 * 直到 hold 到期 —— 那是 #131「孤兒」的形狀，只是換一層。
 */
export const MOVE_TRAIL_STALE_MS = 200;

/** `durationSec` → hold（毫秒），夾在保底與硬上界之間。 */
export function moveTrailHoldMs(durationSec?: number): number {
  if (durationSec === undefined || !Number.isFinite(durationSec) || durationSec <= 0) {
    return MOVE_TRAIL_DEFAULT_HOLD_MS;
  }
  return Math.min(MOVE_TRAIL_MAX_HOLD_MS, Math.round(durationSec * 1000));
}

interface Tracked {
  /** 每幀被搬到身體位置的錨點（緞帶量的就是它的位移） */
  node: TransformNode;
  trail: RibbonTrail;
  docId: string;
  /** 心跳失效的絕對時刻 */
  untilMs: number;
  /** 上一次被 {@link syncBody} 報告的時刻 */
  seenMs: number;
}

export class MoveTrailFx {
  private readonly live = new Map<number, Tracked>();
  /** 每份文件一條 free-list（緞帶的網格/材質/貼圖建一次用一輩子） */
  private readonly pool = new Map<string, RibbonTrail[]>();
  /** 同時在拉的拖曳上限，與刀光共用同一套 LRU 讓位規則 */
  private readonly budget = new RibbonBudget();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    /** 注入點：出貨走真的登錄表，守衛可以餵一份文件進來而不啟動整個 registry */
    private readonly lookup: (id: string) => RibbonDoc | null = (id) =>
      RibbonDefs.tryGet(id) ?? null,
    /** Embedded tools resolve the same authored texture through their middleware. */
    private readonly textureOpts: Pick<RibbonTrailOptions, "resolveTextureUrl" | "createTexture"> = {},
  ) {}

  /** 現在有幾具身體在拖（守衛讀這個）。 */
  get activeCount(): number {
    return this.live.size;
  }

  /** 這具身體現在拖的是哪一份文件，沒有就 null（守衛讀這個）。 */
  docIdFor(entityId: number): string | null {
    return this.live.get(entityId)?.docId ?? null;
  }

  /** 這具身體這一刻的緞帶有沒有真的畫在畫面上（⛔ 不是「有沒有物件」）。 */
  isDrawing(entityId: number): boolean {
    return this.live.get(entityId)?.trail.isVisible === true;
  }

  /**
   * 一次心跳。回 `true` = 這個 vfxId 是一份拖曳文件 ⇒ ⭐ 呼叫端**⛔ 不要**再走
   * 定點那條路（否則同一則事件會既拖曳又噴一顆火花）。
   */
  mark(
    vfxId: string | undefined,
    entityId: number | undefined,
    nowMs: number,
    durationSec?: number,
  ): boolean {
    if (this.disposed || !vfxId || entityId === undefined) return false;
    const doc = this.lookup(vfxId);
    if (!doc) return false;
    let t = this.live.get(entityId);
    // 換了一份文件（換技能／換形態）⇒ 舊的先真的拆掉，⛔ 不是疊第二條上去
    if (t && t.docId !== vfxId) {
      this.release(entityId);
      t = undefined;
    }
    if (!t) {
      const node = new TransformNode(`movetrail-${entityId}`, this.scene);
      const trail =
        this.pool.get(vfxId)?.pop() ?? new RibbonTrail(this.scene, doc, {
          budget: this.budget,
          ...this.textureOpts,
        });
      // ⭐ 承重的一行：**⛔ 不傳 reference** ⇒ 緞帶量的是**絕對**世界速度，
      //    也就是「這具身體移動得多快」。傳了 root 就會變回刀光（走路 = 沒有）。
      trail.attachTo(node, nowMs);
      t = { node, trail, docId: vfxId, untilMs: nowMs, seenMs: nowMs };
      this.live.set(entityId, t);
    }
    t.untilMs = nowMs + moveTrailHoldMs(durationSec);
    return true;
  }

  /**
   * 每一幀：把錨點搬到這具身體現在算繪出來的位置，然後推進緞帶。
   * 對沒有在拖的身體是一次 Map 查詢，⛔ 沒有其它成本。
   */
  syncBody(entityId: number, x: number, z: number, nowMs: number, dtMs: number): void {
    const t = this.live.get(entityId);
    if (!t) return;
    t.seenMs = nowMs;
    t.node.position.set(x, MOVE_TRAIL_BODY_Y, z);
    // ⚠️ 這顆節點不在任何算繪父階層底下，Babylon 不會替它更新世界矩陣，
    //    而 `RibbonTrail` 讀的正是 `getAbsolutePosition()` —— 少了這一行，
    //    每一個取樣點都會是**同一個座標**（速度恆為 0 ⇒ 閘永遠不開 ⇒ 全黑）。
    t.node.computeWorldMatrix(true);
    t.trail.tick(nowMs, dtMs);
  }

  /** 心跳停了（或身體離場）就**當場**拆掉。放在每一幀的 `syncBody` 之後。 */
  update(nowMs: number): void {
    if (this.disposed || this.live.size === 0) return;
    for (const [id, t] of [...this.live]) {
      if (nowMs > t.untilMs || nowMs - t.seenMs > MOVE_TRAIL_STALE_MS) this.release(id);
    }
  }

  /** 一具身體不再拖了：緞帶還回 free-list、錨點丟掉。 */
  release(entityId: number): void {
    const t = this.live.get(entityId);
    if (!t) return;
    this.live.delete(entityId);
    t.trail.detach();
    let list = this.pool.get(t.docId);
    if (!list) {
      list = [];
      this.pool.set(t.docId, list);
    }
    list.push(t.trail);
    t.node.dispose();
  }

  /**
   * 回合邊界：場上的拖曳全部收掉，free-list 也整個還給引擎。
   * ⛔ 上一回合最後一秒的暴走光束不可以跟著進商店（#216 / #259 的形狀）。
   */
  clear(): void {
    for (const id of [...this.live.keys()]) this.release(id);
    for (const list of this.pool.values()) for (const r of list) r.dispose();
    this.pool.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }
}
