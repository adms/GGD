/**
 * roundSurvival — 「誰活到最後」的唯一推導處 (GH#257).
 *
 * owner 2026-08-02:
 * > 「回合勝利顯示的 3d model 只顯示最後活下來順序的三位
 * >   並且標上 黃金 白銀 黃銅 的皇冠 圖案」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼這是一個新檔,而不是在畫面裡排一排
 * ═══════════════════════════════════════════════════════════════════════════
 * 在這一支存在之前,「存活順序」這個資料**全 repo 都沒有**。實測 grep:
 * `deathOrder` / `survivalOrder` / `eliminationOrder` / `diedAtTick` 一個都不在。
 * 快照上只有 `alive`(布林)、`roundKills`、`roundDeaths`(次數),三個都答不出
 * 「誰是倒數第二個倒下的」—— 死兩次的人和死一次的人在 `roundDeaths` 上分得出來,
 * 但**先後**分不出來。所以先在伺服器記下每個座位這一回合最後一次陣亡的**絕對
 * tick**,再由這一支把它翻成名次。
 *
 * ⚠️ 這一支是 PURE 的:沒有 `Date.now`、沒有 `Math.random`、沒有三角函式,
 * 也不迭代任何 `Map`(輸入一律是陣列)。`sim/purity.test.ts` 在守。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 三個階層 —— 為什麼不是「照 deathTick 排一排」就好
 * ═══════════════════════════════════════════════════════════════════════════
 * 「沒有死亡 tick」有**兩種**完全相反的意思,而且在快照上長得一模一樣:
 *
 *   SURVIVED   活到回合結束 —— `alive === true`,從來沒被記過陣亡 tick。第一名。
 *   ELIMINATED 這一回合倒下過 —— `roundDeathTick > 0`。倒得**越晚**名次越前面。
 *   ABSENT     既不活著也沒有陣亡 tick —— 輪空被 `enterCombat` 停在場邊的座位、
 *              還沒生成實體的座位、或斷線。#173 的 bug 就是這一格被當成
 *              「被瞬間團滅」:輪空隊伍的每個座位都是 alive:false / roundKills:0 /
 *              roundDeaths:0,而且**從來沒有發過 death 事件**(停場邊是直接改 hp)。
 *              把它和「撐到 179 秒才倒下」排在一起,是拿名次重演那個 bug。
 *              一律墊底。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 平手規則 —— 明說,不要靠迭代順序
 * ═══════════════════════════════════════════════════════════════════════════
 * 同一個 tick 死掉的兩個人(AoE 收頭、火圈同時燒死)在 `roundDeathTick` 上完全
 * 相同,三個人全員存活時更是**整隊都平手**。這時候如果讓輸入順序決定名次,
 * 名次就變成一個不決定性的東西 —— 同一場比賽在兩個客戶端上會給出不同的金銀銅。
 * 所以平手時往下比兩層,兩層都是快照上已經有的、每個客戶端解碼出同一份的數字:
 *
 *   1. `roundKills` 高的在前(這一回合打得多的那個)
 *   2. `seatId` 小的在前(最終仲裁,永遠分得出來)
 *
 * `seatId` 這一層不是裝飾:沒有它,兩個同 tick 死亡又同殺數的座位還是要靠輸入
 * 順序,而那正是這段註解要消滅的東西。
 */

/** 一個座位在這一回合的存活事實。全部來自快照,沒有一個是推出來的。 */
export interface SurvivalSeat {
  seatId: number;
  teamId: number;
  championId: string;
  /** 回合結束時還站著嗎(`EntityState.alive`) */
  alive: boolean;
  /** 這一回合的擊殺數 —— 平手時的第一層仲裁 */
  roundKills: number;
  /**
   * 這一回合**最後一次**陣亡的絕對 sim tick;0 = 這一回合沒有被記過陣亡。
   *
   * 「最後一次」而不是第一次:#84 的復活圈會把人拉起來,而被拉起來又再倒下的人,
   * 真正離場的時間是**後面那一次**。第一次陣亡的 tick 會低估他撐了多久。
   */
  roundDeathTick: number;
}

/** 一個座位的存活名次。 */
export interface SurvivalRank {
  seat: SurvivalSeat;
  /** 1-based:1 = 活到最後 */
  place: number;
  /** 這個座位落在哪一個階層(見檔頭) */
  tier: number;
}

/**
 * 三個階層,數字越小名次越前面。`as const` 而不是 enum,因為它會被比大小。
 */
export const SURVIVAL_TIER = {
  SURVIVED: 0,
  ELIMINATED: 1,
  ABSENT: 2,
} as const;

/** 這個座位落在哪一個階層(見檔頭的三段說明)。 */
export function survivalTier(seat: SurvivalSeat): number {
  if (seat.alive) return SURVIVAL_TIER.SURVIVED;
  if (seat.roundDeathTick > 0) return SURVIVAL_TIER.ELIMINATED;
  return SURVIVAL_TIER.ABSENT;
}

/**
 * 全序比較子:回傳 < 0 表示 `a` 名次在 `b` 前面。
 *
 * 決定性由最後那一行 `seatId` 保證 —— 兩個不同的座位永遠比得出大小,所以這個
 * 排序不依賴輸入順序,也就不依賴任何 `Map` 的迭代順序。
 */
export function compareSurvival(a: SurvivalSeat, b: SurvivalSeat): number {
  const ta = survivalTier(a);
  const tb = survivalTier(b);
  if (ta !== tb) return ta - tb;
  // 「倒得越晚越前面」**只在 ELIMINATED 這一層成立**。
  //
  // ⚠️ 這裡原本沒有這個條件，理由寫成「SURVIVED / ABSENT 兩層的 deathTick 都是 0,
  // 所以這一行對它們是 no-op」—— **那句話是假的**，而且是 owner 2026-08-02 回報
  // 「回合勝利出現的 3d model 應該是勝利角色 但現在不是」的根因之一。
  //
  // #84 的復活圈會把倒下的人拉起來。被拉起來、回合結束時還站著的人是
  // `alive === true`（⇒ tier SURVIVED）**而且** `roundDeathTick > 0`（主機那一格
  // 只在 `resetRoundTallies` 歸零，`revive.ts` 不碰它）。於是他跟「全程沒被打倒」
  // 的人同層，而這一行把 deathTick 大的排前面 —— **復活過的人偷走金冠**，
  // 而嘲諷語音走的是另一條選擇器，當場跟皇冠分岔。
  //
  // `alive === true ∧ roundDeathTick > 0` 這個組合在全 repo 沒有任何 fixture，
  // 所以既有的測試對它是盲的（失敗形態 ④：斷言方向跟缺陷無關）。
  if (ta === SURVIVAL_TIER.ELIMINATED && a.roundDeathTick !== b.roundDeathTick) {
    return b.roundDeathTick - a.roundDeathTick;
  }
  if (a.roundKills !== b.roundKills) return b.roundKills - a.roundKills;
  return a.seatId - b.seatId;
}

/**
 * 存活名次,活最久的在前。輸入**不會**被就地改動(先 slice 再排),因為呼叫端
 * 拿到的常常是 store 裡的那一份陣列。
 */
export function rankSurvival(seats: readonly SurvivalSeat[]): SurvivalRank[] {
  return seats
    .slice()
    .sort(compareSurvival)
    .map((seat, i) => ({ seat, place: i + 1, tier: survivalTier(seat) }));
}
