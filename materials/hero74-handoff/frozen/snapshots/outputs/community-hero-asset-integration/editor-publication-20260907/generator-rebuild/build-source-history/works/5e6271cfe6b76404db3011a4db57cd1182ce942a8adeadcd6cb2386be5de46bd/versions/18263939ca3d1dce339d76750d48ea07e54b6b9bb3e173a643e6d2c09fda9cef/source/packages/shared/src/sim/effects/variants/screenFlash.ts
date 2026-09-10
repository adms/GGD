/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**（見同資料夾其他成員）。
 */

/**
 * ⭐【螢幕閃爍】`screenFlash`（#543）。owner 2026-08-22：
 *   「**畫面閃爍及震動 不然都不知道發生什麼事情**」
 *
 * ⛔ 它**不是** `spawnVfx`：後者是世界裡的一個定點演出（會被鏡頭轉開就看不到），
 * 這一支是**貼在鏡頭上**的一層顏色 —— 「我剛剛被打了 / 我剛剛放大絕了」這件事
 * 不可以取決於玩家把鏡頭轉去哪。
 *
 * ⚠️ sim 只決定**什麼時候發、發給誰**；⛔ 畫面那一半（含 `prefers-reduced-motion`
 * 與後台強度上限）在客戶端。理由與 `damageLine` / `chainLightning` 逐字相同：
 * 事件沒過線是失敗形態②，而且是最難看出來的那一種。
 */
export interface ScreenFlashVariant {
  kind: "screenFlash";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
  /** 閃什麼顏色，0..255 三格。 */
  colorRgb: [number, number, number];
  /** 最亮的那一刻有多不透明（0..1）。⭐ 出貨強度由 `config.screen-cues@1` 再乘一次。 */
  peakAlpha: number;
  durationSec: number;
  /**
   * 誰的畫面會閃。**A DECISION POINT**（第一守則）：
   *   · `self`（預設）—— 只有施法者
   *   · `victim`      —— 這一段解出來的目標
   *   · `all`         —— 全場（⚠️ 只給真正的全場事件，例如殭屍王登場）
   */
  /**
   * ⭐ `nearby` ＝ 圓心 `radius` 內的每一個人（敵我都算）—— JASS
   * `CameraSetEQNoiseForPlayer` 的主流形狀（40 次裡 38 次）。
   */
  applyTo?: "self" | "victim" | "all";
  /**
   * ⭐ 劇本指定的演出：豁免 `config.screen-fx@1` 的全域上限（owner 2026-08-23 裁決 (a)）。
   *
   * ⛔⛔ **這一格在 2026-08-23 之前只存在於 Zod schema 裡**（GH#608）——
   * 這個介面是 `zScreenFlash` 的**手寫鏡像**（第〇·四守則說的第二個住處），
   * 而它漏掉了它。⇒ `screenFlashEffect.apply()` 的 `e` **看不到這一格**，
   * 於是它不可能被轉發，於是那 1 秒全黑不可能發生 —— 而 `content:build` 是綠的
   * （schema 收得下）、卡面寫得出、客戶端讀得懂。**四個零件單看都是對的。**
   *
   * ⚠️ 它**不是「無上限」**：仍吃 `SCREEN_FLASH_MAX_*` 與無障礙那一格。
   */
  scripted?: boolean;
}
