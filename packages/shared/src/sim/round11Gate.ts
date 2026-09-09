/**
 * ⭐⭐ 第十一回合的**進場判定** —— GH#1151 / GH#1165。
 *
 * ── ⛔ 為什麼這支存在 ─────────────────────────────────────────
 * 2026-09-10 逐欄量過：`arena-rules.json` 的 `round11.*` **13 欄裡 10 欄零消費端**，
 * 而字串 `round11` 在 sim ／ game-server ／ client 三個執行環境裡都是 **0**。
 * ⇒ ⭐ 那整組設定是**裝飾**（第一守則的第四個住處：`ap-coefficient.enabled`
 *   活了四天而沒有一行 production 讀它，是同一個形狀）。
 *
 * ⭐ 這一支是那組設定的**第一個真消費端**，而它刻意只做**一件事**：
 * 回答「**現在該不該進第十一回合**」。
 *
 * ── ⭐ 為什麼先做這一件 ───────────────────────────────────────
 * #1151 的 A–H 七個子系統**全部掛在這個判定上**（沒有「我們在第十一回合」，
 * 生怪、轟炸、換邊、計分都無從開始）⇒ 第〇·五守則：
 * **按「擋住幾件」排序做機制**，⛔ 不是按票的順序做功能。
 *
 * ── ⭐ 它是純函式（`sim/**` 的硬性約束）─────────────────────────
 * ⛔ 沒有 `Math.random` / `Date.now` / 三角函式 / `**`；
 * ⭐ 輸入全部由呼叫端給，⇒ 同樣的輸入永遠得到同樣的答案（錄影可重播）。
 */

/** 這支判定真正會讀的那幾格 —— ⛔ 不吃整份 config，⭐ 免得多一個住處。 */
export interface Round11Gate {
  /** 出貨是 `false`。⛔ 關著時這支**永遠**回 false（一鍵 rollback 的那一半）。 */
  readonly enabled: boolean;
  /**
   * 前十回合**累計**擊殺幾隻殭屍王才開第十一回合。
   * ⚠️ ⭐ 是「累計」，⛔ 不是「這一回合殺了幾隻」——
   *   後者會讓一場零王的比賽永遠開不了，而那正是 CLAUDE.md 記過的
   *   `CAPSTONE_ROUND_GATE = 6` 那個形狀（兩個常數乘起來變成不可能）。
   */
  readonly triggerBossKills: number;
}

/** 第十一回合的**前一個**回合 —— ⭐ 正常流程打完十回合才輪得到它。 */
export const ROUND11_PRECEDING_ROUND = 10;

/**
 * ⭐ 現在該不該進第十一回合？
 *
 * @param gate               出貨設定的那兩格
 * @param round              **剛打完**的回合（`PhaseMachine.round`）
 * @param cumulativeBossKills 這一場**從第一回合累計**的殭屍王擊殺（⛔ 去重後）
 *
 * ⭐ 三個條件全部成立才進場，⛔ 任何一個不成立都維持既有的十回合結算：
 *   ① 開關開著 ② 剛打完第十回合 ③ 累計王擊殺達門檻
 *
 * ⚠️ ⭐ 門檻 `<= 0` 視為「**不設門檻**」而不是「一定成立」——
 *   ⛔ 一個把 0 讀成「零隻也算達標」的判定，會讓 owner 把門檻歸零當成
 *   「先關掉這個條件」時，反而**每一場都開**第十一回合。
 */
export function shouldEnterRound11(
  gate: Round11Gate,
  round: number,
  cumulativeBossKills: number,
): boolean {
  if (!gate.enabled) return false;
  if (round !== ROUND11_PRECEDING_ROUND) return false;
  if (gate.triggerBossKills <= 0) return false;
  return cumulativeBossKills >= gate.triggerBossKills;
}

/**
 * ⭐ **去重**的累計器 —— ⛔ 同一隻王只算一次。
 *
 * ⚠️ #1151 的 A 項逐字要求「**去重計數**」。而 `mobBossSlain` 這一族事件在
 * 重連／重播／同一 tick 多個來源致命時會**重覆抵達**（本文件記過的
 * 「掉落／領取／重抽／復活皆有服務端去重」是同一個理由）。
 * ⇒ ⭐ 用**王的實體 id** 去重，⛔ 不是把事件數加起來。
 *
 * ⭐ 回傳新的集合大小 ＝ 累計擊殺數。⛔ 這支不持有狀態，集合由呼叫端保管
 *   （`sim/**` 的 Map/Set 迭代要排序，⭐ 而這裡只讀 `.size`，⛔ 不迭代）。
 */
export function recordBossKill(slain: Set<number>, bossEntityId: number): number {
  slain.add(bossEntityId);
  return slain.size;
}
