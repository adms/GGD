/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**（見同資料夾其他成員）。
 */
import type { EffectDef } from "../effect";

/**
 * ⭐【移動中的模型特效】`spawnModelFx`（#551）。
 *
 * owner 2026-08-22：
 *   「**w3x jass + 球體 + 蝗蟲群單位 3d model 特效**
 *    (ex. Saber 約束勝利之劍的翻滾光束就是)」
 *
 * ── 它與 `spawnVfx` / `spawnProjectile` 的差別，就是它存在的理由 ────────────
 *
 * | | `spawnVfx` | `spawnProjectile` | `spawnModelFx`（這一支）|
 * |---|---|---|---|
 * | 是什麼 | **一個定點**的粒子演出 | 一顆會被碰撞／地形影響的**實體** | 一具**沿路徑硬推**的模型 |
 * | 會不會動 | ⛔ 不會 | 會，而且會被擋下來 | 會，⛔ 但不會被擋下來 |
 * | 打到人 | ⛔ 不打 | `onHit`（命中即消失）| `onTouch`（**穿過去**，一人一次）|
 * | 原作對應 | dummy + `AddSpecialEffect` | missile art | **locust dummy 單位** |
 *
 * ⚠️ 原作那一族是「生一隻帶模型的 locust 單位，每 tick `SetUnitPosition` 往前
 * 推一段」——⛔ **不是粒子發射器**。所以它的視覺是一具**有骨架、會自轉、有縮放**
 * 的模型（`spinDegPerSec` 就是「翻滾」那個字），而它的碰撞是**穿透式**的。
 *
 * ── ⛔ 零個新的排程器（第零守則⑨）────────────────────────────────────────
 * `onTouch` 的逐段取樣與 `onArrive` 的落點，班表推進**同一個** `SimWorld.delayed`，
 * 由**同一支** `delayedSystem` 付款 —— 走的正是 `delayed.advance`（GH#393
 * 沿向量分段推進）與 `finalEffects` 這兩格既有的機制。
 * ⇒ 決鬥結束停手 / 施法者死亡停手 / 目標死亡跳過 / `incoming` 定基，一行都不用重寫。
 */
export interface SpawnModelFxVariant {
  kind: "spawnModelFx";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`single` = 沿用上游解好的目標。 */
  shape: "single" | "circle";
  /** `shape:"circle"` 的作用半徑 —— 決定 `path:"toTarget"` 瞄誰。 */
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
  /** `content/models` 的 id（例：`fx.w3x.locust.*` 那一族）。 */
  modelKey: string;
  /**
   * 路徑。**A DECISION POINT**，所以是一格下拉（第一守則）。
   *
   *   · `forward`  —— 沿施法者面向直線推進（月牙天衝、龍破斬）
   *   · `toTarget` —— 朝目標直線推進（約束勝利之劍的翻滾光束）
   *   · `radial`   —— `count` 個實例**等分向外**發散（爆散型）
   *   · `orbit`    —— `count` 個實例在半徑 `distance` 的環上繞（護盾球體型）
   */
  path: "forward" | "toTarget" | "orbit" | "radial";
  /** 世界單位/秒。 */
  speed: number;
  /**
   * 走多遠（`forward` / `radial` 必填；`toTarget` 省略 = 走到目標身上）。
   * ⚠️ `path:"orbit"` 時它是**環半徑**（模型繞著施法者跑的那個圈多大），
   * ⛔ 不是「走多遠」—— 繞圈沒有終點，`orbit` 的終點是 `lifeSec`。
   */
  distance?: number;
  /** `radial` / `orbit` 幾個實例等分。⛔ 只有這兩種路徑讀得到。 */
  count?: number;
  /** ⭐「翻滾」：模型繞自己的軸轉，度/秒。純視覺，⛔ sim 不讀它。 */
  spinDegPerSec?: number;
  /** 模型縮放。純視覺，⛔ sim 不讀它。 */
  scale?: number;
  /**
   * 活多久。`orbit` 必填（那是它唯一的終止條件）；直線路徑省略 = 走完 `distance`。
   * 兩者都給時取**先到的那一個**。
   */
  lifeSec?: number;
  /**
   * ⭐ 抵達 / 壽命到 → 在**落點**跑這一串（莉娜龍破斬的落點爆炸就是這個）。
   * ⚠️ 它是 `delayed.finalEffects`：一次施放**每個實例各落一次**。
   */
  onArrive?: EffectDef[];
  /**
   * 路徑上碰到人。⚠️ 它把這一次施放變成**逐 tick 取樣**的班表
   * （上界 `MODEL_FX_MAX_TOUCH_SAMPLES`），⛔ 省略時整串只有抵達那一發。
   */
  onTouch?: EffectDef[];
  /** `onTouch` 的碰觸半徑。省略 = 一個很窄的貼身值（見 handler 的 `TOUCH_RADIUS_DEFAULT`）。 */
  touchRadius?: number;
  /** `onTouch` 打誰。省略 = `enemies`。⛔ 只有帶 `onTouch` 才讀得到。 */
  touchSide?: "enemies" | "allies";
  /**
   * 同一個人只被同一個實例碰一次。**省略 = true** —— 一具穿過你身體的模型
   * 應該打你一次，⛔ 不是每 tick 各一次（`delayed.hitOncePerTarget` 的檔頭⑤
   * 記著同一個缺陷：卡片寫一次的數字，場上打了 12 次）。
   */
  touchOncePerTarget?: boolean;
}
