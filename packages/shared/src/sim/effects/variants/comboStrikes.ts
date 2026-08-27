/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**（見同資料夾其他成員）。
 */
import type { EffectDef } from "../effect";

/**
 * ⭐【連段】`comboStrikes`（#541）—— 「**連斬七次**，每一次斬擊皆造成極大傷害」。
 *
 * ── 它與 `dot` 的差別，就是這張卡存在的理由 ────────────────────────────────
 * `dot` 是**一份持續傷害**：一個受害者、一條到期線、每 tick 扣一次血。它沒有
 * N 次獨立的命中判定、沒有 N 次演出、也沒有「最後一發不一樣」。
 * 01-04 超究武神霸斬今天的實作是 `applyStatus×2 + invulnerable + dot×2`，
 * 而卡面寫著「連斬七次」—— ⛔ 那是第一·五守則的原型（說了但不會發生）。
 * 20-002 更直接：`effects: []`，**整支是空的**。
 *
 * ── 它與 `delayed` 的關係：**同一個排程器，不同的作者介面** ────────────────
 * ⛔ 這裡沒有第二套佇列（第零守則⑨）。handler 把班表推進**同一個**
 * `SimWorld.delayed`，由**同一支** `delayedSystem` 付款。
 * 這一格新增的是 `delayed` 表達不了的三件事：
 *   ① **不等間隔** `steps[]` —— JASS 的連段多半是這種（`delayed` 只有等間隔）；
 *   ② **家族表** `family` —— 節奏住 `config.combo-strikes@1`（第〇·四守則）；
 *   ③ **收尾自己的延遲** `finisherDelaySec` —— `delayed.finalEffects` 只能跟
 *      最後一段同一個 tick 落地，寫不出「七刀之後停半拍，再劈最後一發」。
 */
export interface ComboStrikesVariant {
  kind: "comboStrikes";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`single` = 沿用上游解好的目標。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
  /**
   * ⭐ 節奏表的 key（`config.combo-strikes@1`）。**在載入時**被
   * `resolveComboFamilies` 翻成 `steps` / `strikes`（第〇·四守則）——
   * ⛔ 出貨文件裡不可以同時躺著 `family` 與一份算好的班表。
   */
  family?: string;
  /** 幾段（沒有 `family` 也沒有 `steps` 時用）。 */
  strikes?: number;
  /** 等間隔秒數（配 `strikes`）。與 `steps` **互斥**。 */
  intervalSec?: number;
  /**
   * ⭐ **不等間隔**：每一段離施法那一刻的秒數偏移。與 `intervalSec` 互斥。
   * ⚠️ 執行期夾成**至少 1 tick 的間隔**：0.001 秒與 0.033 秒在 30Hz 是同一件
   * 事，而算出 0 tick 間隔的班表會把整串塞進同一個 tick —— 那正是這個 kind
   * 要修的那個症狀。
   */
  steps?: number[];
  /**
   * 每一段各跑一次的東西。⭐ **各自結算** —— 每一段是自己的一次 `runEffects`，
   * 所以每一段各觸發一次 on-hit、各吃一次減傷、各記一次分。
   */
  perStrike: EffectDef[];
  /**
   * 收尾（20-002「…**最後**施展約束與勝利之劍」）。
   * ⭐ **可省 = 純連段** —— owner 點名的棗真夜／安云那一族沒有收尾。
   */
  finisher?: EffectDef[];
  /**
   * 收尾在最後一段之後**再等**幾秒。省略／0 = 與最後一段同一個 tick 落地
   * （＝ `delayed.finalEffects` 今天的語意，嚴格 no-op）。
   */
  finisherDelaySec?: number;
  /**
   * 目標怎麼決定。預設 `frozen`（施放那一刻鎖定，追著他打）——
   * 連段的語意就是「這七刀都劈同一個人」。`reresolve` 留成一格下拉是因為
   * 「原地轉圈掃七次」是一個設計偏好不是缺陷（第一守則）。
   */
  targetMode?: "frozen" | "reresolve";
  /** 鎖定的目標死了就跳過他。省略 = 跳過（不繼續鞭屍）。 */
  dropDeadTargets?: boolean;
  /** 施法者陣亡就整串停掉。省略 = 不停（與 `delayed` 逐字相同）。 */
  stopOnCasterDeath?: boolean;
  /**
   * ⭐【逐段瞬移】GH#838 M1 —— 每一刀把身體挪到目標周圍的環上一點。
   * ⚠️ 角度是**等分格**（`ringPoints` 的常數表），⛔ 不是度數：`sim/**` 禁三角
   * 函式，而原作的 +270°／刀 正好是 4 等分走 3 格 —— 表達得下且逐位元相同。
   * 缺席 ⇒ 誰都不動 ＝ 這一格出現以前的每一份文件（嚴格 no-op）。
   */
  strikeReposition?: {
    who: "caster" | "victim";
    distU: number;
    ringN: number;
    stepPerStrike: number;
  };
}
