/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**（見同資料夾其他成員）。
 */

/**
 * ⭐【特效文字】`floatingText`（#549）。owner 2026-08-22 點名「**別忘了還有特效文字**」。
 *
 * 原作是 `CreateTextTagUnitBJ` —— 例：克勞德每一刀在頭上冒 `"1Hit"`…`"7Hit"`
 *（`war3map.j:33856`）。
 *
 * ⛔ 它**不是**傷害數字：那一族由 `damage` 事件在客戶端自己算（`audio`/`vfx` 那條路），
 * ⛔ 也不是 UI 字串。它是一段**掛在世界座標上、會往上飄、會淡出**的字。
 *
 * ── ⭐ `{{i}}`：一個節點，⛔ 不是七個 ────────────────────────────────────
 * `text` 支援佔位符 `{{i}}` = **這一次執行是序列裡的第幾段**（1 起算），
 * 所以「1Hit…7Hit」是 `comboStrikes.perStrike` 裡的**一個** `floatingText`
 * 節點寫 `"{{i}}Hit"`，⛔ 不是七個各寫死一個數字的節點（第〇·四守則：
 * 值在載入／執行時解析，⛔ 不烘進每一份文件）。
 * 段號來自 `EffectContext.sequenceIndex`（由 `delayedSystem` 填）；
 * 不在序列裡時解析成 **1** —— 一發單獨的效果就是它自己的第一段。
 */
export interface FloatingTextVariant {
  kind: "floatingText";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
  /** 要冒的字。支援 `{{i}}`（第幾段）。 */
  text: string;
  colorRgb?: [number, number, number];
  sizeScale?: number;
  /** 每秒往上飄幾格（GGD 單位/秒）。 */
  riseSpeed?: number;
  durationSec?: number;
  /** 字冒在誰頭上。`self`（預設）或 `victim`。⛔ 沒有 `all` —— 字要有一個身體當錨。 */
  applyTo?: "self" | "victim";
}
