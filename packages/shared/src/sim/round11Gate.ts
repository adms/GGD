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

/**
 * ⛔⛔ **這個常數原本是寫死的 `10`** —— ⭐ 而 10 有它自己的住處。
 *
 * `DEFAULT_FINAL_ROUND = 10`（`schema/config/arenaRules.ts`）是**賽制的最後一回合**，
 * ⭐ 而它是一格**後台可調**的設定（`rules.finalRound`）。
 * ⇒ ⛔ 在這裡再寫一個 10，就是第〇·四守則的「第二個住處」：
 *   owner 把賽制改成 12 回合的那一刻，第十一回合會**永遠開不了**，
 *   ⭐ 而不會有任何東西變紅。
 *
 * ⇒ ⭐ 判準改成「**剛打完的是不是最後一回合**」，⛔ 不是「是不是第 10 回合」。
 * ⚠️ 保留這個匯出只為了**出貨預設**的可讀性（＝ `DEFAULT_FINAL_ROUND`），
 *   ⛔ 判定本身不讀它。
 */
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
  /**
   * ⭐ 賽制的最後一回合（`rules.finalRound`，出貨 10）——
   * ⛔ 省略時退回出貨預設，⭐ 而呼叫端拿得到 rules 就一定要傳
   *   （與 `PairedDuels.isFinalRound` 同一條規矩）。
   */
  finalRound: number = ROUND11_PRECEDING_ROUND,
): boolean {
  if (!gate.enabled) return false;
  if (round !== finalRound) return false;
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

// ─────────────────────────────────────────────────────────────────────────
// ⭐ A 項的其餘：**進場之後的世界長什麼樣**，以及**什麼時候結束**
// ─────────────────────────────────────────────────────────────────────────

/**
 * ⭐ 第十一回合真正會用到的那幾格（#1151 A 的第 2 條逐字：
 * 「進場使用設定中的**最大場地、時限與橫幅**；全員滿血，繼承前十回合寶具，
 *  兩隊維持敵對，**無商店、無火圈**」）。
 *
 * ⚠️ ⭐ 這是一個**描述**，⛔ 不是一個會動手的東西 ——
 * 它讓「第十一回合的世界是什麼」變成**一個可以斷言的值**，
 * ⛔ 而不是散落在 `MatchController` 五千行裡的一串 if。
 */
export interface Round11Setup {
  readonly arenaId: string;
  readonly durationSec: number;
  readonly bannerText: string;
  /** ⭐ 無火圈 ＝ `fireRing` 給 null（出貨型別本來就允許）。 */
  readonly fireRing: null;
  /** ⭐ 無商店 ＝ 進場前後**不排 intermission**。 */
  readonly skipIntermission: true;
  /** ⭐ 全員滿血。 */
  readonly healAllToFull: true;
  /** ⭐ 繼承前十回合的寶具（⛔ 不清背包）。 */
  readonly keepLegendaries: true;
  /** ⭐ 兩隊維持敵對（⛔ 不合併成一隊打怪）。 */
  readonly keepTeamsHostile: true;
}

/** 這支需要的設定形狀 —— ⛔ 一樣不吃整份 config。 */
export interface Round11SetupSource {
  readonly arenaId: string;
  readonly durationSec: number;
  readonly bannerText: string;
}

/**
 * ⭐ 設定 → 這一回合的世界描述。
 *
 * ⚠️ ⭐ 後面四格是**常數 true**，而它們**刻意**寫在型別裡而不是註解裡：
 * ⛔ 一句「記得進場要滿血」是散文（本文件記錄過五次判準失效），
 * ⭐ 而一個 `healAllToFull: true` 的欄位，消費端漏掉它時 `tsc` 會說話。
 */
export function round11SetupFrom(src: Round11SetupSource): Round11Setup {
  return {
    arenaId: src.arenaId,
    durationSec: src.durationSec,
    bannerText: src.bannerText,
    fireRing: null,
    skipIntermission: true,
    healAllToFull: true,
    keepLegendaries: true,
    keepTeamsHostile: true,
  };
}

/** 第十一回合的結束理由 —— `null` ＝ 還在打。 */
export type Round11EndReason = "time" | "humansWiped";

/**
 * ⭐ 這一回合該結束了嗎？（#1151 A 的第 3 條：「時限、**無存活人類**⋯
 * 有明確終止與清理策略」）
 *
 * @param elapsedSec   進場後經過的秒數（⭐ 由呼叫端給 —— `sim/**` ⛔ 不可以讀時鐘）
 * @param aliveHumans  還活著的**人類**玩家數（⛔ 不含被控的王）
 *
 * ⚠️⚠️ ⭐ 順序是刻意的：**時限先判**。
 * ⛔ 反過來的話，「最後一個人在時限那一刻倒下」會被記成 `humansWiped`，
 *   ⭐ 而那兩種結局的計分不一樣（G 項）⇒ 一個平手會被判成全滅。
 */
export function round11EndReason(
  elapsedSec: number,
  aliveHumans: number,
  durationSec: number,
): Round11EndReason | null {
  if (elapsedSec >= durationSec) return "time";
  if (aliveHumans <= 0) return "humansWiped";
  return null;
}
