/**
 * roundVfxLifecycle —「這一幀是不是回合的邊界？如果是，把場上的特效收乾淨」
 * (task #16 / #259)。
 *
 * owner 的問題是：「戰鬥開始前/結束 特效、物件單位是否都有清理乾淨的機制？」
 * 查證結果是**沒有** —— `VfxSystem.dispose()` 只在整個 GameApp 銷毀時被呼叫，
 * 回合切換一次也沒清過。伺服器端的 `resetRoundTallies()` 只重置數字，不碰畫面。
 *
 * 為什麼要獨立成一個小 class 而不是在 GameApp 裡寫兩行 if：
 * GameApp 沒辦法在測試裡被建構起來（Babylon engine / canvas / socket），
 * 所以任何寫在 `frame()` 裡的東西都只能靠掃原始碼來「證明」，而掃原始碼分不出
 * 程式碼跟談論程式碼的註解。把邊界判斷搬到這裡之後，測試可以拿**真的**
 * VfxSystem + 真的 Scene 餵一串真的 phase 序列，然後去數 `scene.particleSystems`
 * 有沒有回到基線 —— 那才是可觀測量。
 *
 * ── 邊界定義 ──────────────────────────────────────────────────────
 * 伺服器的 phase 是 champSelect / intermission / combat / resolution / matchEnd。
 * 「戰鬥」就只有 `combat` 這一格，所以邊界是：
 *   · 進 combat（前一格不是 combat）→ 開打前先清乾淨；
 *   · 出 combat（前一格是 combat）  → 這一場的殘留不准帶進商店。
 *
 * 兩邊都清、而不是只清一邊，是刻意的：只清「出」的話，champSelect →
 * 第一場 combat 這一段（登入特效、選角預覽留下的東西）永遠沒人清；只清
 * 「進」的話，殘留會整個活在商店場景上面，那正是 #216 的病。
 *
 * 連線斷掉 / 沒有 state 的那幾幀 phase 是空字串。空字串**不是**邊界：
 * 它是「暫時不知道」，把它當成離開戰鬥會在掉封包時無謂地清一次場。
 */

/** 什麼樣的 phase 算「正在打」。 */
export const COMBAT_PHASE = "combat";

/**
 * 這一次清場站在戰鬥的哪一側（GH#337）。
 *
 * ⚠️ 兩邊分開**不是潔癖**，是必要條件：回合勝利煙火正是在 combat → resolution
 * 的那一幀發射的。如果 `leave` 也把煙火清掉，#235 那個功能會整個消失，而畫面上
 * 它跟「煙火壞了」長得一模一樣（沒有任何錯誤、沒有任何 log）。所以每一個
 * 註冊進來的特效自己說它要在哪幾個邊界被清。
 */
export type RoundEdge = "enter" | "leave";

export interface RoundVfxTarget {
  /**
   * 把這一回合的一次性特效與只增不減的池子全部收回。
   *
   * `edge` 是這一幀站在戰鬥的哪一側。⚠️ 參數是**可選的**（實作可以整個不宣告
   * 它）—— `VfxSystem.resetForRound()` 兩邊做的事完全一樣，逼它接一個用不到的
   * 參數只會多一個會腐爛的名字。
   */
  resetForRound(edge: RoundEdge): void;
}

export class RoundVfxLifecycle {
  /** 上一幀看到的 phase；`null` = 還沒看過任何一幀。 */
  private prev: string | null = null;
  private resets = 0;

  constructor(private readonly target: RoundVfxTarget) {}

  /** 這個 lifecycle 到目前為止清過幾次（測試/診斷用）。 */
  get resetCount(): number {
    return this.resets;
  }

  /**
   * 餵這一幀的 phase。回傳 true 代表「這一幀是邊界，已經清過了」。
   *
   * @param phase 伺服器 snapshot 的 `state.phase`；沒有 state 時傳空字串。
   */
  sync(phase: string): boolean {
    // 空字串 = 這一幀沒有 state（連線中／掉封包）。不更新 prev：否則
    // 一次短暫的斷線會被讀成「離開戰鬥又回到戰鬥」，白清兩次場。
    if (!phase) return false;
    const prev = this.prev;
    this.prev = phase;
    if (prev === phase) return false;
    // 第一幀（prev === null）就在 combat：這是重連進行中的比賽，場上是
    // 空的、什麼都還沒畫，清一次沒有代價，而且保證起點乾淨。
    const enteringCombat = phase === COMBAT_PHASE;
    const leavingCombat = prev === COMBAT_PHASE;
    if (!enteringCombat && !leavingCombat) return false;
    // GH#337 —— 把「哪一側」一起交出去。⛔ 不可以兩邊都當成同一件事：
    // 見上面 `RoundEdge` 的註解（`leave` 清煙火 = 刪掉 #235）。
    this.target.resetForRound(enteringCombat ? "enter" : "leave");
    this.resets++;
    return true;
  }
}
