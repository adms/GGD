/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { DamageType, EffectDef, Scaling } from "../effect";

/**
 * chainLightning（GH#451）——「範圍內的**每一個**單位各觸發一次連鎖閃電」。
 *
 * ---------------------------------------------------------------------------
 * 為什麼是一個新的 kind，而不是用既有零件組
 * ---------------------------------------------------------------------------
 * 最接近的既有寫法是 `damageArea` + `onHitTargets{mode:"perTarget"}` 巢狀 K 層。
 * 它組不出這個機制，而且是**三個獨立的**理由：
 *
 *  ① **沒有「這一條鏈已經打過誰」**。`damageArea` 只把 `ctx.targets`（＝上一個
 *     受害者）排除在外，所以第 3 跳可以跳回第 1 跳的人 —— 兩個人之間乒乓，
 *     而畫面上看起來完全像一條鏈（失敗形態④：壞掉的跟正確的長得一樣）。
 *  ② **遞減要一層一層手寫**。16 跳 = 16 層巢狀 × 16 個手算的 `amount`，
 *     而 `EFFECT_CHAIN_MAX_STEPS` 只擋寬度不擋深度 —— 也就是說它「寫得出來」
 *     但那份 JSON 是一份沒有人維護得動的東西（第零守則⑨的反面）。
 *  ③ **總跳數沒有共用的預算**。巢狀是一棵樹，每一枝各自數自己的深度，
 *     沒有任何地方數得到「這一次施放總共跳了幾次」——而那正是 60 隻殭屍的
 *     場上唯一擋得住 O(N²) 的東西。
 *
 * ---------------------------------------------------------------------------
 * 它忠實對應的是哪一段 JASS
 * ---------------------------------------------------------------------------
 * `war3map.j:40489`（PIKACHU / 86-04 打雷絕招 `A0C0`）與 `war3map.j:47008`
 * （MoriyaBYEBYE / 65-04 天譴 `A04C`）是**同一個寫法**：
 * `ForGroupBJ(GetUnitsInRangeOfLocAll(R, 施法者位置), 對每一個 → 造一隻 dummy →
 *  IssueTargetOrder(dummy, "chainlightning", 那一個單位))`。
 * ⇒ 圈裡 N 個人 = **N 條各自獨立的連鎖**，這就是 owner 說的「越多單位越痛」。
 *
 * ---------------------------------------------------------------------------
 * 決定性（sim/purity.test.ts 在守）
 * ---------------------------------------------------------------------------
 * 起始集合與每一跳的候選都來自 `enemiesInCircle`（保證遞增 entity id），
 * 再用「(距離平方, id)」這個 TOTAL ORDER 排序才取第一個。`canCrit` 每一筆
 * 傷害各擲一次 rng，所以順序一浮動傷害就變 —— 這是必須排序的真正理由。
 * 終止性：`jumps` 夾住每一條、`maxTotalJumps` 夾住整次施放，兩個都嚴格遞增，
 * 所以 `revisit: true` 也停得下來。
 */
export interface ChainLightningVariant {
  kind: "chainLightning";
  /**
   * ⭐ E1 硬約束：新 kind 一律帶 `shape`，而它在這裡是**真的機制開關**：
   * · `"single"` —— 只有這次的目標起一條鏈（＝原作那顆單獨的鏈鎖閃電）
   * · `"circle"` —— `radius` 圈內每一個敵人各起一條鏈（＝上面那兩段 JASS）
   */
  shape: "single" | "circle";
  /** `shape:"circle"` 的起始圈半徑，GGD 單位。單體形狀讀不到（載入時擋）。 */
  radius?: number;
  /** 起始圈以誰為圓心。省略 = `"caster"` —— 兩段 JASS 都是施法者位置。 */
  centre?: "caster" | "point" | "target";
  /** 最多幾個人各起一條鏈（由近到遠）。省略 = `CHAIN_MAX_SOURCES`。 */
  maxSources?: number;
  /** 第一跳（鏈的起點）吃到的量。之後每跳乘一次 `decay`。 */
  amount: Scaling;
  damageType?: DamageType;
  /** 一條鏈總共打到幾個人（**含起點**）＝ 原作 `A04H` 的 DataB（16）。 */
  jumps: number;
  /** 每一跳能跳多遠（GGD 單位）。 */
  jumpRange: number;
  /** 每跳的**傷害倍率** 0..1。0.8 = 每跳剩八成；1 = 不遞減。 */
  decay: number;
  /**
   * ⭐ 兩發閃電之間的秒數（owner 2026-08-20：「每個閃電有**極小的時間間隔**
   * 播放閃電動畫與傷害才到下一個」）。省略 = `DEFAULT_CHAIN_JUMP_INTERVAL_SEC`
   * ⛔ **不是 0** —— 時間差是這支技能的身分，一個 0 的預設會讓忘了寫這一格
   * 靜默退回被推翻的那個行為。**0 仍是合法值**＝明寫「我要瞬發」。
   */
  jumpIntervalSec?: number;
  /** 同一個目標能不能在**同一條鏈**裡被跳到第二次。省略 = false。 */
  revisit?: boolean;
  /** 這一次施放的總跳數上限（保險絲）。省略 = `CHAIN_MAX_TOTAL_JUMPS`。 */
  maxTotalJumps?: number;
  canCrit?: boolean;
  /** ⭐ G1 ② —— 見 `damageArea.onHitTargets`。收到的是這次真的被電到的那群人。 */
  onHitTargets?: EffectDef[];
  /** ⭐ G1 ② —— 見 `damageArea.runOnEmptyHit`。省略 = false。 */
  runOnEmptyHit?: boolean;
  /** ⭐ G1 ② —— 見 `damageArea.onHitTargetsMode`。省略 = `"batch"`。 */
  onHitTargetsMode?: "batch" | "perTarget";
}
