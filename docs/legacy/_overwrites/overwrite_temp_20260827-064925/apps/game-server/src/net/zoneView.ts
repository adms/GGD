/**
 * zoneView — L4：**伺服器端**依 duel zone 剔除快照（GH#760 步驟 2）。
 *
 * ── 這一支解決的是什麼 ─────────────────────────────────────────────────────
 * `net/snapshot.ts:415` 的實體迴圈把**全世界每一個實體**寫進一份**共用**的
 * `MatchState.entities`，Colyseus 再把同一份 patch 廣播給房裡每一個客戶端。
 * 而 `apps/client/src/net/zoneVisibility.ts`（L3，已出貨）在**收到之後**才把
 * 別區的實體整批丟掉 —— 也就是說那些位元組**每一次快照、對每一個客戶端**
 * 都真的上了線，只是沒有人用。
 *
 * [量到] 2026-08-27（#760 步驟 1，出貨的 `projectSnapshot` + `Encoder`）：
 * 一場 12 bot 的比賽裡「不在自己那一區」的實體佔 **46.2%**；每多一隻實體
 * 全量快照多 **≈94.4 B**（線性，800 隻時 81,512 B）。
 *
 * ── 為什麼這件事**可以**做，而且不需要客戶端改任何一行 ────────────────────
 * ⭐ 客戶端**能不能**渲染某一區，是一個伺服器算得出來的函式，⛔ 不是玩家的偏好：
 *   · `GameApp.refreshVisibleZones` 的可見集合 = 自己的 zone ∪ 觀戰中的 zone；
 *   · 而觀戰的 zone 只能來自 `spectateGoTo`，它第一行是 `mayGoTo(zone, offer)`；
 *   · 而 offer 來自 `render/spectateFocus.pickSpectateZone`，它的**第一行**是
 *     `if (!ownDuelDecided(ownZone, duels)) return null;`。
 * ⇒ **自己的決鬥還沒分出勝負之前，客戶端結構上不可能渲染別區。**
 *   決出勝負之後它可以去看「還活著的」任何一區 —— 所以那時候我們就把**全部
 *   still-live 的 zone** 一起送出去（一個超集合，⛔ 不是猜他會挑哪一區）。
 *
 * ⇒ 這裡送出去的集合**永遠是客戶端可見集合的超集合**。剔除掉的東西，
 *   出貨的客戶端**本來就會丟掉**（L3 那一行），所以畫面上零差異。
 *
 * ── 失效方向是安全的（與 L3 同一個約定）───────────────────────────────────
 * 算不出這個客戶端的 zone（還沒坐下、還沒生出英雄、純觀眾、replay 觀眾）⇒
 * `null` ＝「全都看得見」＝ 今天的行為。`zone < 0` 的實體同理一律送。
 * ⭐ 剔除只在「確定知道他該看哪幾區」時才發生。
 *
 * ── ⚠️ 為什麼**每一個** client 都一定要有 view ────────────────────────────
 * `@colyseus/schema` 把 view-tagged 欄位的異動放進**另一個** changeset
 * (`ChangeTree.filteredChanges`)，而 `SchemaSerializer.applyPatches` 對
 * `client.view == null` 的客戶端送的是**共用的** `encoder.encode(it)` ——
 * 它只走 `root.changes`。⇒ ⛔ **沒有 view 的客戶端一個實體都收不到**（⛔ 不是
 * 收到全部）。所以「關掉剔除」的實作是**給他一份包含全部的 view**，
 * ⛔ 不是「不給 view」。這一段是本檔最容易做壞的地方，`zoneView.test.ts`
 * 用**真的 `Decoder`** 把它釘住。
 *
 * ── 旋鈕 ───────────────────────────────────────────────────────────────────
 * `GGD_SNAPSHOT_ZONE_CULL=0` ⇒ 每個客戶端都拿 everything view ⇒ 線路內容
 * 逐位元回到今天。與同目錄的 `GGD_SNAPSHOT_BUFFER_KB` 同一族：**純傳輸**旋鈕，
 * ⛔ 不碰 sim 算什麼，所以決定性表面是零 —— 回頭的成本是一個環境變數 + 重啟。
 * ⚠️ 它的 Zod / 後台住處在本 lane 的檔案柵欄外，登記在 **GH#801**。
 */
import { StateView } from "@colyseus/schema";
import type { EntityState, MatchState } from "@ggd/shared/protocol/schema";

/** 出貨預設：剔除**開著**（#760 的結論：客戶端本來就把那些位元組丟掉）。 */
export const DEFAULT_SNAPSHOT_ZONE_CULL = true;

/**
 * 解析旋鈕。純函式（env 明著傳進來），與 `resolveSnapshotBufferBytes` 同一個形狀。
 * 缺席／看不懂 ⇒ 出貨預設。只有明確的 `0` / `false` / `off` 關得掉。
 */
export function resolveSnapshotZoneCull(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.GGD_SNAPSHOT_ZONE_CULL;
  if (raw === undefined || raw === "") return DEFAULT_SNAPSHOT_ZONE_CULL;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return DEFAULT_SNAPSHOT_ZONE_CULL;
}

/**
 * ⭐ **這個決定就是本檔的心臟**：一個座位在 `ownZones` 的客戶端，現在最多看得到
 * 哪幾個 duel zone？
 *
 * @param ownZones 這個連線driving 的座位們的英雄站的 zone（0..n；空 = 算不出來）
 * @param liveZones 還沒分出勝負的 duel zone（`pairings` 減去 `duelWinners`）
 * @returns 可見 zone 集合；**`null` = 全部可見**（算不出來時的安全預設）
 */
export function visibleZonesForConnection(
  ownZones: readonly number[],
  liveZones: readonly number[],
): number[] | null {
  if (ownZones.length === 0) return null; // 還沒坐下 / 還沒生出來 / 純觀眾 ⇒ 全送
  // ⭐ 自己的每一場都還在打 ⇒ `pickSpectateZone` 回 null ⇒ 客戶端渲染不到別區。
  //    這是剔除真正發生的那一格（一整場比賽的大部分時間都在這裡）。
  const anyOwnDecided = ownZones.some((z) => !liveZones.includes(z));
  if (!anyOwnDecided) return [...ownZones];
  // 自己那一場已經分出勝負 ⇒ 他可以按「前往觀戰」去**任何一個還活著的** zone。
  // ⛔ 不要猜他會挑哪一個 —— 送整個超集合。
  const out = [...ownZones];
  for (const z of liveZones) if (!out.includes(z)) out.push(z);
  return out;
}

/** `ZoneViewSync.sync` 回報的一次量測（給守衛與 `/healthz` 用，⛔ 不是門檻）。 */
export interface ZoneViewStats {
  /** 這一份快照裡的實體總數。 */
  total: number;
  /** Σ(每個客戶端 view 裡的實體數) —— 剔除前是 `total × clients`。 */
  delivered: number;
  /** 客戶端數（有算進 `delivered` 的那些）。 */
  clients: number;
  /** 剔除掉的比例 = 1 − delivered / (total × clients)；沒有客戶端時 0。 */
  culledFraction: number;
}

/** `syncClientViews` 需要的 client 形狀（`@colyseus/core` 的 `Client` 是它的超集）。 */
export interface ViewClient {
  readonly sessionId: string;
  view?: StateView;
}

/** `syncClientViews` 需要的 controller 形狀 —— 結構型別，測試不必造整個 MatchController。 */
export interface ZoneViewSource {
  /** sessionId → 他的英雄現在站的 zone（一個連線可以驅動多個座位：分割畫面）。 */
  ownZonesBySession(): Map<string, number[]>;
  /** 還沒分出勝負的 duel zone。 */
  liveZones(): number[];
}

/**
 * 每個連線一份 `StateView`，逐 tick 增量維護。
 *
 * ⚠️ **增量**是必要的，⛔ 不可以每 tick `view.clear()` 再重加：`clear()` 會對
 * view 裡每一個 ChangeTree 產生 DELETE，下一份 patch 又全部 ADD 回來 ——
 * 那會讓每一 tick 的 patch 變成一份完整快照，比不剔除還糟。
 */
export class ZoneViewSync {
  /** 「全都看得見」的共用 view —— 剔除關掉時、以及算不出 zone 的連線都用它。
   *  ⭐ 共用是刻意的：`SchemaSerializer` 用 view 物件當 cache key，所以 N 個
   *  拿 everything 的客戶端只編碼**一次**。 */
  private readonly everything = new StateView();
  private readonly everythingKeys = new Set<string>();
  private readonly perSession = new Map<string, { view: StateView; keys: Set<string> }>();
  private readonly cull: boolean;

  constructor(cull: boolean = resolveSnapshotZoneCull()) {
    this.cull = cull;
  }

  /** 剔除開著嗎？（診斷用） */
  get enabled(): boolean {
    return this.cull;
  }

  /**
   * 新連線進房的那一刻先給他 everything —— `getFullState(client)` 就在 onJoin
   * 之後，而那時候他的英雄還沒生出來，zone 算不出來。下一次 `sync` 才收窄。
   */
  onJoin(client: ViewClient): void {
    client.view = this.everything;
  }

  /** 連線離開：丟掉他那一份 view（⛔ 共用的 everything 永遠留著）。 */
  onLeave(sessionId: string): void {
    this.perSession.delete(sessionId);
  }

  /**
   * 逐 tick：把每個客戶端的 view 對齊「他現在看得到哪幾區」。
   * 在 `projectSnapshot` **之後**呼叫（它要讀已經寫好的 `state.entities`）。
   */
  sync(state: MatchState, clients: readonly ViewClient[], src: ZoneViewSource): ZoneViewStats {
    // 先把「全部」那一份補齊 —— 它同時是關掉剔除時的答案，也是算不出 zone 的答案。
    let total = 0;
    state.entities.forEach((es, key) => {
      total++;
      if (!this.everythingKeys.has(key)) {
        this.everything.add(es as unknown as EntityState);
        this.everythingKeys.add(key);
      }
    });
    this.prune(this.everythingKeys, state, total);

    if (!this.cull) {
      for (const c of clients) c.view = this.everything;
      const clientCount = clients.length;
      return { total, delivered: total * clientCount, clients: clientCount, culledFraction: 0 };
    }

    const ownBySession = src.ownZonesBySession();
    const live = src.liveZones();
    let delivered = 0;
    for (const client of clients) {
      const zones = visibleZonesForConnection(ownBySession.get(client.sessionId) ?? [], live);
      if (zones === null) {
        client.view = this.everything;
        this.perSession.delete(client.sessionId);
        delivered += total;
        continue;
      }
      let slot = this.perSession.get(client.sessionId);
      if (!slot) {
        slot = { view: new StateView(), keys: new Set<string>() };
        this.perSession.set(client.sessionId, slot);
      }
      client.view = slot.view;
      let inView = 0;
      state.entities.forEach((es, key) => {
        // `zone < 0` 歸不了戶 ⇒ 一律送（與 L3 的 `VisibleZones.has` 同一條規則）。
        const wanted = !Number.isInteger(es.zone) || es.zone < 0 || zones.includes(es.zone);
        const had = slot!.keys.has(key);
        if (wanted && !had) {
          slot!.view.add(es as unknown as EntityState);
          slot!.keys.add(key);
        } else if (!wanted && had) {
          slot!.view.remove(es as unknown as EntityState);
          slot!.keys.delete(key);
        }
        if (wanted) inView++;
      });
      this.prune(slot.keys, state, inView);
      delivered += inView;
    }
    const denom = total * clients.length;
    return {
      total,
      delivered,
      clients: clients.length,
      culledFraction: denom === 0 ? 0 : 1 - delivered / denom,
    };
  }

  /**
   * 已經從 `state.entities` 消失的 key 要從記帳裡拿掉（Colyseus 自己會送 DELETE）。
   * ⭐ `expected` 是這一輪真的走訪到、且**應該**在集合裡的數量 —— 相等就代表沒有
   * 任何一筆消失，可以整段跳過。⛔ 不要每 tick 無條件複製整個集合：那是 O(實體數
   * × 客戶端數) 的配置，會把剔除省下來的東西還回去。
   */
  private prune(keys: Set<string>, state: MatchState, expected: number): void {
    if (keys.size === expected) return;
    for (const key of [...keys]) if (!state.entities.has(key)) keys.delete(key);
  }
}
