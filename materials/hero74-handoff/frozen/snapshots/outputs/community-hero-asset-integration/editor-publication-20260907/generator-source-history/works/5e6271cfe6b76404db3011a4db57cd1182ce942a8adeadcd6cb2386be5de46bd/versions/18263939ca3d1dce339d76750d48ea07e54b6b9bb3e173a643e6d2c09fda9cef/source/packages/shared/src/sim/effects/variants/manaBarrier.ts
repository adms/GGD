/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { DamageType } from "../effect";

export interface ManaBarrierVariant {
  /**
   * 【魔力屏障】(44-00 機警「每點魔力可以抵免 3 點傷害」)。
   * ⛔ **不是**受傷後補護盾 —— 它在扣血之前把傷害換成扣魔，完整推導見
   * `sim/effects/manaBarrier.ts` 檔頭①②。
   */
  kind: "manaBarrier";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 給誰。省略 = `"self"`。 */
  who?: "self" | "target";
  /** 一點魔力抵幾點傷害。44-00 = 3。 */
  perMana: number;
  /**
   * 對哪些傷害型別生效。**必填、明列**（與 `BlockGrant.damageTypes` 同一個
   * 設計）：「可抵擋**全部**傷害」= 三種都寫進來，不是程式裡的一行 `if`。
   */
  damageTypes: DamageType[];
  /** 抵到剩多少魔力就停手。省略 = 0（抵到見底）。 */
  minManaReserve?: number;
  /**
   * 屏障持續幾秒。**省略 = 常駐**（沒有到期 tick）。
   * ⭐ 兩種情況的**強制停止都是魔力耗盡**（owner GH#307）——
   * 填了秒數也照樣看魔力，先到的那個停。推導見 `manaBarrier.ts` 檔頭⑤。
   */
  durationSec?: number;
}
