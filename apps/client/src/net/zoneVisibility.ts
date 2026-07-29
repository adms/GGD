/**
 * ZONE VISIBILITY — 客戶端依 duel zone 剔除 (L3).
 *
 * ── 問題 ────────────────────────────────────────────────────────────────────
 * `apps/game-server/src/net/snapshot.ts` 的 entity 迴圈是
 * `for (const [id, t] of world.transform)` —— **全世界每一個實體、送給每一個
 * 客戶端、每一次快照**。而一場 12 人的比賽被切成兩個 3v3 duel zone
 * (`content/arenas/*.json` 每張圖 2 個 zone，royale 那張 1 個)，#67 已經確立
 * 「小地圖只顯示玩家自己那一區」—— 也就是**玩家只跟自己那半場互動，卻在為
 * 另外半場付全額的客戶端算力**：插值緩衝、Catmull-Rom 取樣、view 同步、
 * 血條投影、狀態光環、空間音訊，一項都沒少。
 *
 * ── 為什麼只做客戶端這一半 ──────────────────────────────────────────────────
 * 伺服器端剔除成本高一級且有結構代價：Colyseus 目前是**一份共用 state 廣播**，
 * 改成 per-client 視圖會讓編碼從 O(1) 變 O(玩家數)，很可能反而加重伺服器。
 * 這一支不動伺服器、不動協定、零 UX 風險 —— 純粹是「收到了但不算」。
 *
 * ── 觀戰是可見集合的一部分，不是例外 ───────────────────────────────────────
 * ⚠️ 這是最容易做壞的一條。#269 讓玩家可以按鈕「前往觀戰」別的競技場
 * (`GameApp.spectateGoTo`)，`snapshot.ts:71-76` 明確為此保留 `pairings`。
 * 所以可見集合必須**跟隨當前觀看的 zone**，不能寫死本地 zone —— 否則按下
 * 「前往觀戰」之後畫面是一座空競技場。
 *
 * 而且**自己那一區永遠留著**，跟觀戰的那一區並存(而不是被取代)，因為：
 *   · `ui/hud/Minimap.tsx` 的 `localZoneIndex` 在**沒有**觀戰目標時要回頭讀
 *     `frameBus.champions.get(localEntityId)` 才知道自己在哪一區 —— 觀戰被
 *     自動撤回 (`updateSpectateFollow` 的 retraction) 的那一瞬間就會需要它；
 *   · `ui/components/ReviveBanner.tsx` 讀的是自己那一區的復活圈；
 *   · 結算凍結 (`outcomeDecided`) 要把鏡頭拉回自己的英雄做正面特寫。
 * 兩區都留只發生在「正在觀戰」這個少數狀態，常態(沒觀戰)仍然剔掉另外半場。
 *
 * ── 失效方向是安全的 ────────────────────────────────────────────────────────
 * 算不出任何 zone(還沒選角、純觀眾、快照還沒到)時 `end()` 把集合封成
 * **everything**，也就是「全都看得見」= 今天的行為。剔除只在「確定知道自己
 * 該看哪一區」時才發生，所以最壞情況是白算，不是東西不見。
 * 同理 `zone < 0` 的實體(理論上不存在 —— sim 每一個 spawn 點都給了真 zone)
 * 一律視為可見。
 */
import type { InterpolationBuffer } from "./InterpolationBuffer";

/**
 * 這一幀/這一份快照要渲染的 duel zone 集合。**重複使用**，`begin()/add()/end()`
 * 就地重算，不配置記憶體 —— 它每一次快照 (SNAPSHOT_HZ) 加每一幀都會被重算。
 *
 * 用陣列而不是 `Set`：內容永遠是 1–4 個小整數(玩家數 × {自己的區, 觀戰的區})，
 * 線性掃描比 hash 快，而且 `has()` 在熱路徑上每個實體都會被呼叫一次。
 */
export class VisibleZones {
  private readonly list: number[] = [];
  /** 封裝後：true = 放行全部(算不出可見 zone 時的安全預設)。 */
  private everything = true;

  /** 開始重算。在 `end()` 之前 `has()` 的結果沒有意義。 */
  begin(): void {
    this.list.length = 0;
    this.everything = false;
  }

  /** 加一個要看的 zone。null/undefined/負數 = 「算不出來」，忽略。 */
  add(zone: number | null | undefined): void {
    if (zone === null || zone === undefined) return;
    if (!Number.isInteger(zone) || zone < 0) return;
    if (this.list.indexOf(zone) < 0) this.list.push(zone);
  }

  /**
   * 封裝。一個 zone 都沒加成功 → 退回「全部可見」，見檔頭「失效方向是安全的」。
   */
  end(): void {
    if (this.list.length === 0) this.everything = true;
  }

  /** 這個 zone 的實體要不要渲染？ */
  has(zone: number): boolean {
    if (this.everything) return true;
    if (!Number.isInteger(zone) || zone < 0) return true; // 歸不了戶的一律留著
    return this.list.indexOf(zone) >= 0;
  }

  /** 目前是不是「全部可見」(沒有任何剔除發生)。診斷/測試用。 */
  get isEverything(): boolean {
    return this.everything;
  }

  /** 目前可見的 zone 數量；`isEverything` 時語意是「未限制」。 */
  get size(): number {
    return this.list.length;
  }
}

/**
 * 一份快照裡的一個實體 —— `ingestZonedTransforms` 需要的全部欄位。
 *
 * 刻意**不** `extends InterpSample`：`tick` 是整份快照共用的
 * (`MatchState.tick`)，不在每個 `EntityState` 上，硬要繼承會讓出貨的
 * `state.entities` 型別對不上。
 */
export interface ZonedTransform {
  id: number;
  zone: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** #247 airborne height; 缺席 = 0 = 站在地上。 */
  h?: number;
}

/**
 * `state.entities`(Colyseus `MapSchema`)與陣列共同的最小介面。刻意只要
 * `forEach`：`MapSchema` 沒有 `Symbol.iterator` 的零配置保證，而 `forEach`
 * 兩邊都有，且不會為了走訪配置迭代器。
 */
export interface ForEachable<T> {
  forEach(cb: (value: T, ...rest: readonly unknown[]) => void): void;
}

/**
 * 把一份快照的 transform 餵進插值緩衝，**跳過不在 `zones` 裡的實體**，並用
 * 真的餵進去的 id 集合去 prune。
 *
 * 為什麼 `seen` 只收「有餵的」：`InterpolationBuffer.prune` 會刪掉不在 `seen`
 * 裡的緩衝，所以被剔除的實體會連同它的 ring buffer 一起被回收 —— 觀戰切回
 * 自己那一區時，別區留下來的 64 格樣本不會繼續佔記憶體。反過來，切**進**
 * 一個新的 zone 時那些實體是從空緩衝重新累積的，第一筆樣本沒有前一筆，
 * `isSnap` 回 false，所以不會被誤判成瞬移 —— 見 InterpolationBuffer 檔頭。
 *
 * 這是**出貨的那一段程式**(GameApp.onStatePatch 直接呼叫它)，不是測試用的副本
 * —— 失敗形態 ⑤ 就是「被測的不是出貨的那個」。
 */
export function ingestZonedTransforms(
  entities: ForEachable<ZonedTransform>,
  zones: VisibleZones,
  tick: number,
  buf: InterpolationBuffer,
  seen: Set<number>,
): void {
  seen.clear();
  entities.forEach((es) => {
    if (!zones.has(es.zone)) return;
    seen.add(es.id);
    // #247: fly height interpolates on the same seam as x/z.
    buf.push(es.id, { tick, x: es.x, z: es.z, fx: es.fx, fz: es.fz, h: es.h });
  });
  buf.prune(seen);
}
