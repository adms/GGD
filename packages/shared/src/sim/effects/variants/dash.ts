/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

export interface DashVariant {
  kind: "dash";
  mode: "forward" | "toPoint";
  speed: number;
  maxDistance: number;
  /**
   * ⭐ S7 —— **衝刺結束的那一刻**才跑的那一段（52-04「向前衝刺 400 距離後
   * 揮出」）。缺席 = 沒有回呼 = 今天的行為，一個 tick 都不差。
   *
   * ── 為什麼它必須存在（實測，三臂同 seed）─────────────────────────────
   *   · `dash` 單獨（對照組）                → 位移 +4.40u，受害者掉 43.47
   *   · `[dash, damageArea]` 同一個 effects[] → 位移 +4.40u，受害者掉 43.47
   *     ← **逐字相同：那一刀從起點揮出，完全落空**
   *   · 同一個 AoE 從衝刺**終點**放           → 受害者掉 199.83
   * 原因是順序：effect 在 slot 2b/3 跑完，位移在 slot 5 才發生，所以同一個
   * `effects[]` 裡的 AoE 必然用衝刺**前**的座標。
   *
   * ⭐ 為什麼是擴充 `dash` 而不是開一個新 kind `dash-on-end`：
   *   (a) 新 kind 依 E1 硬約束要帶一整組 `shape`/`radius`/`side`/`maxTargets`，
   *       而那對「自己位移」沒有語意 —— 會生出一組永遠是 `"single"` 的死欄位；
   *   (b) 會出現兩個「dash」概念（第零守則⑨的反面）；
   *   (c)「衝刺結束了」這個真相**只存在於** `MovementSystem` 的 override 迴圈
   *       裡，callback 只能掛在 override 上 —— 開新 kind 也還是要改同一行。
   * 這個選擇同時讓它**不需要新的 step slot**：`MovementSystem` 是 slot 5、
   * `combatResolveSystem` 是 slot 8，所以 `onEnd` 排出來的傷害仍然在**同一
   * tick** 被減傷、計分、結算。
   *
   * ⚠️ 它與 `delayed` **方向相反**（兩邊的檔頭都要寫）：`delayed` 凍住的是
   * **目標名單**（位置無關）；這一格凍不住任何東西，要的正是**結束那一刻的
   * 位置**（名單無關）。混用會安靜地做錯。
   */
  onEnd?: EffectDef[];
  /**
   * ⭐ S7 —— 被牆擋下來的衝刺**算不算「衝完」**。
   * 省略 = `"always"`（照樣揮出）；`"completed"` = 只有真的跑完距離才揮。
   * ⚠️ 這是一個真的岔路：`MovementSystem` 今天把「撞牆停下」與「跑完距離」
   * 合成**同一個**結束條件。預設選 `"always"`，因為卡面說「衝刺後揮出」，
   * 而一刀被場景取消是玩家看不見的失敗。
   */
  onEndOn?: "always" | "completed";
  /**
   * ⭐ S7 —— 衝刺途中死掉還要不要揮。省略 = `false`。
   * 形狀與精神逐字沿用 `randomArea.stopOnCasterDeath`。
   */
  onEndWhenDead?: boolean;
}
