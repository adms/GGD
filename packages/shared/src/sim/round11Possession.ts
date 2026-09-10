/**
 * ⭐⭐ 第十一回合的**換邊操作殭屍王**（GH#922 / #1151 E）—— 純函式，⛔ 不改任何狀態。
 *
 * > owner 2026-09-01（逐字）：
 * > 「敵方陣營**三個英雄都死了 無人可以幫忙復活** 則三支都突變成殭屍王⋯
 * >  死去的玩家 雖然變成殭屍王 但還是能操作 只是**分數不會再計算增加**
 * >  再死一次就真的徹底離開戰場 但還是要等最後結算畫面⋯
 * >  三支王的出生位置 **原地生成** 但是**倒數10秒可以逃跑** 有個腐爛生成的動畫圈圈提示⋯
 * >  結算多一行獨立統計「殭屍王擊倒 N 人」⛔ 不進生存分數 => ok,
 * >  並且**每擊倒一次，獎勵生命回滿**」
 *
 * ── ⛔⛔ 票自己點名了一個**會讓比賽永遠不結束**的陷阱 ──────────────
 * 「全滅判定的分母是**存活的英雄**，⛔ 不是實體數 —— **屍體都變成王了**」
 * ⇒ ⭐ 所以這裡每一個判定吃的都是 `championAlive`，⛔ 沒有一個吃實體數。
 *
 * ── ⛔ 票逐字點名的四種**濫用**，⭐ 全部撞同一道門 ────────────────
 * ⛔ 操作他人的王 · ⛔ 重生第二具 · ⛔ 預警期間提前攻擊 · ⛔ 回刷人類分數
 * ⇒ ⭐ 四個各寫一次檢查 ＝ 四個會各自漏掉的地方；
 *   ⭐ 一個**授權判定**，四種濫用都撞同一道門。
 */

/** ⭐ 一個座位在第十一回合的狀態。 */
export interface Round11Seat {
  readonly seatId: number;
  readonly team: number;
  /**
   * ⭐⭐ 這個座位的**英雄**還活著嗎。
   * ⛔⛔ 這一格**不是**「還有實體」—— 屍體變成王之後實體仍然在場上，
   * ⭐ 而用實體數當分母的全滅判定會**永遠不成立**（票文逐字點名）。
   */
  readonly championAlive: boolean;
  /** ⭐ 已經換邊在開王了嗎。 */
  readonly possessing: boolean;
}

/** ⭐ 一個座位的換邊細節。 */
export interface Round11Possession {
  /** ⭐ 轉成王的那一刻（秒）；`null` ＝ 還沒轉。 */
  readonly convertedAtSec: number | null;
  /** ⭐ 分配給這個座位的王的實體 id；`null` ＝ 還沒分配。 */
  readonly bossEntityId: number | null;
  /** ⭐ 那一具王已經死了 ⇒ 徹底離場（⛔ 不可以再拿第二具）。 */
  readonly bossDead: boolean;
}

/** 拒絕的理由 —— ⭐ 每一個都對應票上的一種濫用。 */
export type Round11DenyReason =
  | "disabled" // ⛔ 機制關著（⭐ 一鍵 rollback 的那一半）
  | "notConverted" // ⛔ 還沒轉王 —— 不能同時操作英雄與王
  | "notAssigned" // ⛔ 沒有分配到王
  | "notYourBoss" // ⛔⛔ 操作他人的王
  | "bossDead" // ⛔⛔ 重生第二具
  | "escapeWindow"; // ⛔⛔ 預警期間提前攻擊（⭐ 那 10 秒是給活人跑的）

/**
 * ⭐⭐ 這一隊該整隊轉成殭屍王了嗎？
 *
 * ⭐ 票驗收①②：「同隊**零存活英雄**才算。⛔ 不是『目前場上沒有復活圈』——
 * 只要還有隊友活著能讀條就不算」。
 *
 * ⚠️ ⭐ 空隊回 `false` 是刻意的：⛔ 一支沒有人的隊伍不叫全滅，
 * 而回 `true` 會讓比賽在**開場的那一 tick**就轉王。
 */
export function round11TeamShouldConvert(
  enabled: boolean,
  seats: readonly Round11Seat[],
  team: number,
): boolean {
  let seen = 0;
  for (const s of seats) {
    if (s.team !== team) continue;
    seen++;
    if (s.championAlive) return false; // ⭐ 還有一個隊友活著 ⇒ ⛔ 不觸發
  }
  return enabled && seen > 0;
}

/**
 * ⭐ 該轉的那幾個座位（⛔ 已經在開王的不重複轉 —— 那是「重生第二具」的另一個入口）。
 * ⚠️ 回傳依 `seatId` 排序：`sim/**` ⛔ 不可以有依賴插入順序的迭代。
 */
export function round11ConvertibleSeats(
  seats: readonly Round11Seat[],
  team: number,
): number[] {
  return seats
    .filter((s) => s.team === team && !s.possessing)
    .map((s) => s.seatId)
    .sort((a, b) => a - b);
}

/**
 * ⭐ 這個座位現在可以操作 `requestedBossId` 嗎？—— `null` ＝ 可以。
 *
 * @param elapsedSinceConvertSec 從轉王到現在幾秒（⭐ 由呼叫端算，`sim` ⛔ 無時鐘）
 * @param escapeWindowSec        原地生成後的逃跑窗（⛔ 這段期間王不得攻擊）
 *
 * ⚠️⭐ 檢查順序是刻意的：**先問「是不是你的」再問「時間到了沒」**。
 * ⛔ 反過來的話，一個要求操作**別人的王**的請求會在窗內收到 `escapeWindow`
 *   ⇒ ⭐ 它會以為「再等一下就可以」，⛔ 而它永遠不可以。
 */
export function round11DenyPossession(
  enabled: boolean,
  p: Round11Possession,
  requestedBossId: number,
  elapsedSinceConvertSec: number,
  escapeWindowSec: number,
): Round11DenyReason | null {
  if (!enabled) return "disabled";
  if (p.convertedAtSec === null) return "notConverted";
  if (p.bossEntityId === null) return "notAssigned";
  if (p.bossEntityId !== requestedBossId) return "notYourBoss";
  if (p.bossDead) return "bossDead";
  if (elapsedSinceConvertSec < escapeWindowSec) return "escapeWindow";
  return null;
}

/**
 * ⭐ 重連之後回到哪個狀態（票：「重連恢復**同一個王／旁觀狀態**」）。
 *
 * ⚠️⭐ 這一支**不分配新的王** —— 它只回「你原本是什麼」。
 * ⛔ 一個會在重連時分配的實作，正是票說的「**重生第二具**」。
 */
export function round11ReconnectState(
  p: Round11Possession,
): "champion" | "boss" | "spectator" {
  if (p.convertedAtSec === null) return "champion";
  if (p.bossEntityId !== null && !p.bossDead) return "boss";
  return "spectator"; // ⭐ 王死了 ⇒ 徹底離場,⛔ 但仍看得到最後結算畫面
}

/**
 * ⛔⛔ 這裡曾經有一支 `round11ScoreAccrual(possessing, delta)`。
 *
 * ⭐ 它表達的規則（開王期間 0 增量）**仍然成立** —— ⛔ 但它的住處不是這裡：
 * 出貨的做法是**在換邊那一刻抄一份 `MatchStats`**，之後
 * `MatchController.rankEntriesBySeat()`（⭐ **唯一**一份分數組裝）服務那一份。
 *
 * ⇒ ⭐ 留著它就是同一條規則的**第二個住處**（第〇·四守則），
 * ⚠️ 而它**沒有任何呼叫端** —— 一個被守衛守著、卻不影響任何一場比賽的函式，
 * ⭐ 正是「一格沒有人讀的參數」在程式碼上的樣子。
 */

/**
 * ⭐ 王擊倒一名英雄 ⇒ **生命回滿**（票驗收⑤）。
 *
 * ⚠️⚠️ ⭐ 吃的是**夾限之後**的 `maxHp` —— 票文逐字「⛔ 不可以被王的強度夾限夾掉」。
 * ⭐ 兩者是**不同的軸**：夾限管的是 `maxHp` 有多大（被動耐久），
 * 這一條把 `hp` 拉到那個 `maxHp`（**有因果的獎勵**）。
 * ⛔ 把它做成「回 `baseMaxHp`」就等於被夾掉了。
 */
export function round11KillRewardHp(
  enabled: boolean,
  currentHp: number,
  maxHpAfterScale: number,
): number {
  return enabled ? maxHpAfterScale : currentHp;
}

/**
 * ⭐ 「殭屍王擊倒 N 人」的**獨立統計**（票驗收⑦）。
 * ⛔⛔ 它**刻意不回傳分數** —— 進生存分數就是上面那條濫用。
 */
export function round11BumpBossKills(
  tally: Map<number, number>,
  seatId: number,
): number {
  const next = (tally.get(seatId) ?? 0) + 1;
  tally.set(seatId, next);
  return next;
}
