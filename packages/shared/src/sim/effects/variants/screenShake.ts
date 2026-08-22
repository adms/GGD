/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**（見同資料夾其他成員）。
 */

/**
 * ⭐【螢幕震動】`screenShake`（#543）。與 {@link import("./screenFlash").ScreenFlashVariant}
 * 是**同一個決策的兩半**（owner：「畫面閃爍及震動」），所以兩者的 `applyTo`
 * 是同一格語意、同一支解析器（`sim/effects/clientCues.ts::cueRecipients`）——
 * ⛔ 不是兩套。
 */
export interface ScreenShakeVariant {
  kind: "screenShake";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
  /**
   * ⭐ **0..1 的正規化強度，⛔ 不是像素**。真正的位移量 = 這個數字 ×
   * `config.screen-cues@1` 的上限（後台一格）—— 所以 owner 把上限調小的那一天，
   * 每一支既有技能自動跟著變溫柔，⛔ 不必回頭改任何一份 JSON（第〇·四守則）。
   */
  amplitude: number;
  durationSec: number;
  /** 誰的畫面會震。語意與 `screenFlash.applyTo` 逐字相同。 */
  applyTo?: "self" | "victim" | "all";
}
