/**
 * ⭐⭐ 第十一回合的**一次性獎勵去重**（GH#1151 C）—— 純資料結構，⛔ 無副作用。
 *
 * ── ⛔⛔ 票逐字點名的三個危險 ────────────────────────────────────
 * 「掉落／領取／重抽／復活皆有**服務端去重**；
 *  **斷線重連**、**重複請求**、背包或選擇尚未完成**不造成複製獎勵**」
 *
 * ⭐ 三個都是**同一個形狀**：一個「只能發生一次」的事被要求了兩次。
 * ⇒ ⛔ 不要為每一種各寫一次防護（那是三份會各自腐爛的程式），
 *   ⭐ 而是一個**共用的一次性帳本**（第〇·五守則：機制一份、用法 N 份）。
 *
 * ── ⭐ 為什麼是「帳本」而不是「布林旗標」 ─────────────────────────
 * 旗標回答「發生過嗎」，⛔ 而這裡要回答的是「**這一個**發生過嗎」——
 * ⭐ 一場比賽裡有 N 個掉落、N 個復活圈、N 次三選一，
 * ⛔ 而一個共用旗標會讓**第二個**掉落被當成重複請求吞掉。
 *
 * ── ⚠️ `sim/**` 的約束 ──────────────────────────────────────
 * ⛔ 無時鐘、⛔ 無隨機。⭐ 而 `Set` 只讀 `.has` / `.add` / `.size`，
 * ⛔ 不迭代 ⇒ 不受插入順序影響（sim 的「Map 迭代要排序」是為了那個）。
 */

/** 一次性事件的種類 —— ⭐ 加一種就在這裡加一個字面值。 */
export type Round11ClaimKind =
  | "drop"
  | "reroll"
  | "revive"
  | "legendaryBreak"
  /** ⭐ 換邊操作殭屍王(GH#922)——⛔ 一個座位只轉一次(「重生第二具」的入口之一)。 */
  | "possession";

/**
 * ⭐ 一次性帳本。⛔ 不持有時間、⛔ 不持有玩家 —— 它只記「哪些 key 用過了」。
 *
 * ⭐ key 的形狀由呼叫端決定（例：`drop:<bossEntityId>`、
 * `revive:<circleId>:<seatId>`），⚠️ ⭐ 而**那正是重點**：
 * ⛔ 一個只用 `seatId` 當 key 的呼叫端，會讓同一名玩家的**第二個**掉落領不到。
 */
export class Round11Claims {
  private readonly used = new Set<string>();

  /**
   * ⭐ 嘗試領取。**第一次回 `true`，之後永遠 `false`。**
   *
   * ⚠️ ⭐ 命名是刻意的：它**不是** `has()` ＋ `add()` 兩步 ——
   * ⛔ 兩步之間的任何 `await`（背包寫入、選擇 UI）就是那個「複製獎勵」的窗口。
   * ⭐ 一步、同步、⛔ 不可分割。
   */
  claim(kind: Round11ClaimKind, id: string): boolean {
    const key = `${kind}:${id}`;
    if (this.used.has(key)) return false;
    this.used.add(key);
    return true;
  }

  /** ⭐ 只讀 —— 給結算與測試看，⛔ 不改變任何狀態。 */
  claimed(kind: Round11ClaimKind, id: string): boolean {
    return this.used.has(`${kind}:${id}`);
  }

  /** ⭐ 這一回合總共發過幾次（給結算對帳用）。 */
  get size(): number {
    return this.used.size;
  }

  /** ⭐ 回合結束時清空 —— ⛔ 帳本不可以跨回合（那會讓下一場領不到）。 */
  clear(): void {
    this.used.clear();
  }
}
