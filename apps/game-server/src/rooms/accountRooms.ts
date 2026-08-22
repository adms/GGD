/**
 * 一個帳號，同一時間只能佔一間房（GH#588）。
 *
 * owner 2026-08-23（逐字，⭐ 這是裁決）：
 * > 「限制一名玩家同時最多只能在一個房間，如果有玩家馬上 kill AI」
 *
 * ── 為什麼需要這一份登記表 ────────────────────────────────────────────────
 * `MatchRoom.seatByAccount` 是**一間房裡面**的 Map。平台建房走
 * `index.ts matchMaker.createRoom("match")`、dev 走 `client.create("match")`
 * —— 兩條都是**開新房**，⛔ 沒有任何一處回頭關掉這個帳號的上一間房。於是同一個
 * 帳號可以同時掛在 N 間房裡，每一間都以 30Hz 在跑，而舊房的事件仍然往那條還沒
 * 斷乾淨的 socket 上送。owner 逐字描述的症狀就是這個：
 * > 「離開房間，進到練習模式，還是會有隱形的英雄在攻擊我、喊出語音、特效、給我傷害」
 *
 * ── ⚠️ 這一份**刻意**是製程內的（⛔ 不是 presence / redis）───────────────
 * 跨製程的驅逐要走 `matchMaker.remoteRoomCall`，而那條路只在 redis presence
 * 真的接起來時才有意義。單 shard（出貨現況）時它是**同一個 Map**，多 shard 時
 * 這一份只擋得住同製程的那一半 —— ⭐ 那仍然嚴格優於今天的「完全沒有意見」，
 * 而且它讓「一人一房」這件事**有一個會紅的守衛**。跨製程那一半記在 GH#588。
 *
 * ⛔ 這裡**不做決策**：要不要驅逐不是一格後台開關（owner 的裁決是「限制」，
 * 不是「可以選擇限制」）。唯一有「要不要」成分的是選角結束時的收房，那一格住在
 * `emptyRoomPolicy.ts`。
 */

/** 一個能被請出去的房間。`MatchRoom` 實作它；測試可以塞一個假的。 */
export interface AccountRoomHolder {
  /** 只用來記 log —— ⛔ 認同一律走物件同一性，不走 id。 */
  readonly roomId?: string;
  /**
   * 把這個帳號從這間房請出去：收掉座位、關掉還開著的重連窗口，
   * 沒有真人剩下就收房。
   */
  evictAccount(accountId: string): void;
}

export class AccountRoomRegistry {
  private readonly byAccount = new Map<string, AccountRoomHolder>();

  /**
   * 認領一個帳號給 `holder`，回傳**被頂掉的舊房**（沒有就 null）。
   *
   * ⚠️ 認領在驅逐**之前**完成是刻意的：舊房被請出去時會走它自己的 `onLeave`，
   * 而那條路會呼叫 `release(accountId, 舊房)` —— 這時現任持有者已經是新房，
   * 所以那次 release 是 no-op。反過來（先驅逐再認領）會讓舊房的 release 把新房
   * 的認領洗掉，而畫面上完全正常。
   */
  claim(accountId: string, holder: AccountRoomHolder): AccountRoomHolder | null {
    if (!accountId) return null;
    const previous = this.byAccount.get(accountId) ?? null;
    this.byAccount.set(accountId, holder);
    return previous !== null && previous !== holder ? previous : null;
  }

  /** 放掉認領 —— ⛔ 只有**現任**持有者放得掉。 */
  release(accountId: string, holder: AccountRoomHolder): void {
    if (this.byAccount.get(accountId) === holder) this.byAccount.delete(accountId);
  }

  /** 一間房收掉時：把它還持有的每一格都放掉。 */
  releaseAll(holder: AccountRoomHolder): void {
    for (const [accountId, held] of [...this.byAccount]) {
      if (held === holder) this.byAccount.delete(accountId);
    }
  }

  /** 這個帳號現在在哪一間房（沒有就 undefined）。 */
  holderFor(accountId: string): AccountRoomHolder | undefined {
    return this.byAccount.get(accountId);
  }

  /** 目前被認領的帳號數（/healthz 與測試用）。 */
  get size(): number {
    return this.byAccount.size;
  }

  /** ⚠️ 測試專用 —— 出貨路徑上沒有人呼叫它。 */
  reset(): void {
    this.byAccount.clear();
  }
}

/** 製程內共用的那一份。 */
export const accountRooms = new AccountRoomRegistry();

/**
 * 被「同一個帳號在別的房間坐下」請出去時，送給客戶端的 WS close code。
 * 和洪水踢人的 4290 分開，客戶端才分得出「你被限流了」與「你已經在另一間房」。
 */
export const EVICTED_CLOSE_CODE = 4291;
