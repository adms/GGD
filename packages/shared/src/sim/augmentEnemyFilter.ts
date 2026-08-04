/**
 * 「殭屍算不算敵人」—— 稜彩增益卡的敵方過濾器全域覆寫（批 1 決策點 1-1）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 它在解什麼問題
 * ════════════════════════════════════════════════════════════════════════════
 * owner 的 17 張稜彩卡裡有 13 個 hook 位置寫的是「敵方**英雄**」。照字面實作，
 * 那些卡在**殭屍波**（第 3 場之後場上最多的東西）裡完全不動 —— 11 張卡在半個
 * 遊戲裡是死的。
 *
 * 修法**不是**給殭屍 `StatsComp`（owner 已裁決不做，理由是效能與順暢度），
 * 而是把「敵」這個字的解釋權交出去，而且交在兩個不同的層級：
 *
 *   · **per-card**：`HookDef.victim` 的 union 多一個 `"enemy"` 成員（任何敵方，
 *     含殭屍）。作者在**那一張卡的文件裡**選，`content/` 是 live bind-mount，
 *     改一次不用重建映像。
 *   · **全域**：這一份文件的 {@link AugmentEnemyFilter.mobsCountAsEnemy} ——
 *     打開之後，寫成 `"enemyChampion"` 的每一條 hook 也把殭屍算成敵人。
 *     給 owner 打完一場現場翻，不用逐張卡改文件。
 *
 * ⛔ **它刻意不是一顆「殭屍算不算敵人」的單一全域布林。** 那樣做的話：
 * symphony-of-war 的 12 層與 master-of-duality 的 20 層在殭屍潮裡會**瞬間滿層**，
 * 而 cerberus 的 3 充能會**常駐刷新** —— 那是三種不同的平衡答案，不可能由一個
 * 開關同時答對。per-card 那一層才是主要的表達方式；這一格是覆寫，不是替代。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 出貨值 false —— 這份文件出現本身不改變任何一場比賽
 * ════════════════════════════════════════════════════════════════════════════
 * owner 的預設裁決是「per-card 維持 `enemyChampion`（字面），全域覆寫預設
 * false」。`false` 等於這個欄位存在之前的語意（英雄就是英雄），所以掛上這顆
 * 旋鈕不動任何既有內容 —— 出貨內容今天一條 `enemyChampion` 都還沒有。
 *
 * **缺文件 = 出貨預設**，不是空表：同 `blockRules.ts` / `shieldRules.ts` 的規矩。
 * 一個 `undefined` 的布林在 TypeScript 底下是 falsy，剛好等於預設值 —— 但那是
 * 巧合不是設計，而下一格欄位（predicate 反過來的那種）就不會這麼幸運。
 *
 * PURITY: 純資料 + 純函式，沒有 `Math.random` / `Date.now` / 三角函式 / `**`，
 * 也沒有 Map/Set 迭代（`sim/purity.test.ts` 在守）。
 */

/** 敵方過濾器的全域覆寫。目前只有一格。 */
export interface AugmentEnemyFilter {
  /**
   * 打開之後，`HookDef.victim: "enemyChampion"` 也把**敵對陣營的小怪（殭屍）**
   * 算成合格目標；`"allyChampion"` 不受影響（殭屍永遠不是隊友）。
   *
   * 關著（出貨值）＝ 字面語意：只有帶 `ChampionComp` 而且不同隊的身體算數。
   *
   * ⚠️ 它**不會**讓殭屍長出 `StatsComp` —— 掛在殭屍身上的效果（`applyBuff`、
   * `applyStatus`）照樣是靜默 no-op。這一格救得到的是**效果掛在自己身上**的
   * 那一族卡（疊層、充能、回血），也就是 17 張裡的 9 張。
   */
  mobsCountAsEnemy: boolean;
}

/**
 * 出貨預設 —— owner 明說的那一個（2026-08-04 決策點 1-1）。
 *
 * `false` ＝ 這顆旋鈕出現之前的語意，所以掛上它不改變任何一場比賽。
 */
export const DEFAULT_AUGMENT_ENEMY_FILTER: AugmentEnemyFilter = Object.freeze({
  mobsCountAsEnemy: false,
});

/** 文件的 schema 字串 —— 讀寫兩端（sim / 後台 overlay）共用這一個常數。 */
export const AUGMENT_ENEMY_FILTER_SCHEMA = "config.augment-filter@1";
/** 文件 id（`config` collection 裡的 `augment-filter`）。 */
export const AUGMENT_ENEMY_FILTER_DOC_ID = "augment-filter";

/**
 * 正規化操作者/文件給的值。認不得的型別 → 出貨預設，**不是** throw：
 * sim 不能在解碼設定時炸掉（同 `blockRules.ts`）。
 */
export function normalizeAugmentEnemyFilter(raw: unknown): AugmentEnemyFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    mobsCountAsEnemy:
      typeof r.mobsCountAsEnemy === "boolean"
        ? r.mobsCountAsEnemy
        : DEFAULT_AUGMENT_ENEMY_FILTER.mobsCountAsEnemy,
  });
}

/**
 * 讀一份 `config.augment-filter@1` 文件（sim 與後台共用的那個 `Configs`
 * registry）。沒有文件 / schema 不對 → 出貨預設。
 */
export function augmentEnemyFilterFromDoc(doc: unknown): AugmentEnemyFilter {
  if (!doc || typeof doc !== "object") return DEFAULT_AUGMENT_ENEMY_FILTER;
  const d = doc as { schema?: unknown };
  if (d.schema !== AUGMENT_ENEMY_FILTER_SCHEMA) return DEFAULT_AUGMENT_ENEMY_FILTER;
  return normalizeAugmentEnemyFilter(d);
}
