/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { AbilityId } from "../../../ids";
import type { CastableSlot } from "../../intents";

/**
 * ── Lane 1（2026-08-08）四個新 kind ────────────────────────────────────
 * 四個是**同一個形狀**的四個實例（`shape` + 決策欄位 + 一個 handler），
 * 界都住在 `sim/effects/kindLimits.ts`（一份，schema 與 handler 共用）。
 */
export interface ModifyCooldownVariant {
  /**
   * 【縮短特定技能冷卻】(#284)。行為與兩個決策點的完整理由見
   * `sim/effects/modifyCooldown.ts` 檔頭。
   * ⛔ 它**不是**全域 CDR —— 那條屬性早就存在，做成那個等於沒做。
   */
  kind: "modifyCooldown";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`who:"self"` 時它不參與解析。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 改誰的冷卻。省略 = `"self"`（owner 那三支技能全部是自己）。 */
  who?: "self" | "target";
  /** 只改這一格。與 `abilityId` 可以同時寫（= 兩個條件都要滿足）。 */
  slot?: CastableSlot;
  /**
   * 只改**這一支具名技能**所在的格子 —— 「[瞬步] 冷卻縮短 50%」講的是
   * 一支技能，它裝在哪一格是英雄的事。
   * ⛔ schema 擋掉 `slot` 與 `abilityId` **都不填**：那是「改全部六格」，
   * 而那正是這個 kind 存在要避免的東西。
   */
  abilityId?: AbilityId;
  /**
   * `reduce` = 按比例（配 `basis`）· `reduceFlat` = 按秒 · `reset` = 歸零。
   * 負的 `amount` 走同一條路，語意是**延長**。
   */
  mode: "reduce" | "reduceFlat" | "reset";
  /** `reduce` 是 0..1 的比例，`reduceFlat` 是秒。`reset` 忽略它。 */
  amount?: number;
  /**
   * `reduce` 的分母。省略 = `"remaining"`（剩餘量的百分比）。
   * `"base"` = 這一階**基礎冷卻**的百分比 —— 「這一招冷卻縮短 50%」
   * 在一次性效果裡唯一與「還剩多久」無關的寫法。
   */
  basis?: "remaining" | "base";
  /**
   * ⭐ S3 —— 這一發改的是**哪一種**冷卻。
   * · `"abilitySlot"`（省略 = 這個）—— `AbilityInstance.cooldownRemainingTicks`，
   *   也就是這個 kind 今天的全部行為（三份既有文件都走這條）。
   * · `"hookInternalCooldown"` —— 一條 hook 的**內部冷卻**
   *   （`ModifierSource.hookLastFired`）。
   *
   * ⭐ 它解鎖的是 60-002 絕光斬那一族：一支 **passive-only** 的技能永遠不會被
   * cast，所以它的 `cooldownRemainingTicks` **恆為 0**，`modifyCooldown` 今天
   * 在第一道 `if (inst.cooldownRemainingTicks <= 0) continue;` 就跳過它 ——
   * 「120 秒一次」與「反彈成功立即重置」於是二選一。
   *
   * ⛔ 為什麼不做 `MarkSpec.rechargeSec`：`sim/marks.ts` 檔頭⑤已經逐字拒絕過
   * 同型欄位（「那會是**第二個**冷卻概念，與 `HookDef.internalCooldown` 平行、
   * 語意重疊、兩個都填得下」），而且它只給得起「重置」，給不起「縮短 50%」。
   * ⛔ 為什麼不「自動偵測」（找不到技能冷卻就去改 hook）：那會讓一支寫錯
   * `abilityId` 的文件安靜地去重置某條 hook，而作者以為自己在縮短技能冷卻。
   */
  target?: "abilitySlot" | "hookInternalCooldown";
  /**
   * ⭐ S3 —— `target: "hookInternalCooldown"` 時指名**哪一條** hook
   *（比對 {@link HookDef.key}）。省略 = 那份來源上的**每一條** hook。
   * ⚠️ `target` 不是 `"hookInternalCooldown"` 卻填了它 = PARSE ERROR
   *（否則它是一格填得下、永遠不被讀的欄位）。
   */
  hookKey?: string;
  /**
   * ⭐ S3 —— 這一發碰得到**誰的** hook。
   *
   * 省略 = `"originSource"` = 只動這一發效果**自己所屬**的那一份
   * `ModifierSource`（由 `ctx.origin === "hook:" + src.id` 認出來）。
   * 60-002 要的正是它：兩條 hook 住在同一份被動來源上，「反彈成功」那一條去
   * 重置「120 秒一次」那一條。
   *
   * `"allSources"` = 這個身體上每一份叫得出同一個 `hookKey` 的來源
   *（`hookKey` 因此必填，載入時擋）。
   *
   * ⚠️ 預設選較窄的那一個：一份打錯 `hookKey` 的文件在 `originSource` 下什麼
   * 都不會發生，在 `allSources` 下會**安靜地**重置別件裝備的 proc。
   * ⚠️ `originSource` 而 `ctx.origin` 不是 hook origin（例如從主動技能直接放）
   * → 整條不做。那是誠實的：那一發沒有「自己那份來源」可言。
   */
  hookScope?: "originSource" | "allSources";
}
