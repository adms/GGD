/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectCondition } from "../../content/condition";
import type { EffectDef } from "../effect";

export interface CarryVariant {
  /**
   * 【背負】（禰豆子的木箱，[EX∅ 根源]）—— 把一名隊友收進箱子：身體跟著
   * 載具走、期間不可被選取、到期放下。機制與四根「不可選取」軸的推導在
   * `sim/carry.ts`；每 tick 的座標重建在 `sim/systems/CarrySystem.ts`。
   */
  kind: "carry";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  radiusTier?: string;
  /** 誰躲得進箱子。省略 = `"allies"`。 */
  side?: "allies" | "enemies";
  /** 一次背幾個。省略 = 1。 */
  maxTargets?: number;
  /** 背多久（秒）。**必填** —— 沒有期限的背負是一名整回合消失的英雄。 */
  durationSec: number;
  /**
   * 「不可選取」的四根軸。省略整格 = `autoAcquire/mobAggro/manualTarget`
   * 為 true、`abilityAoe` 為 **false**（不可選取 ≠ 免疫）。
   */
  untargetable?: {
    autoAcquire?: boolean;
    mobAggro?: boolean;
    manualTarget?: boolean;
    abilityAoe?: boolean;
  };
  /** 圈內逐一過濾（「只有生命低於 15% 的隊友躲得進來」）。 */
  victimCondition?: EffectCondition;
  /** 交給**真的上車的那群人**的效果。⛔ 不是新機制。 */
  onHitTargets?: EffectDef[];
  /** 載具死了乘客放下還是跟著倒。省略 = `"release"`。 */
  onCarrierDeath?: "release" | "drop";
}
