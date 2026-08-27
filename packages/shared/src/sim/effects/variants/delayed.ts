/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

/**
 * ── Lane 3（2026-08-10）兩個新 kind ──────────────────────────────────────
 */
export interface DelayedVariant {
  /**
   * ⭐ G12【延遲序列】—— 一段**排在未來 tick** 的效果，而且
   * **目標在施放那一刻就凍住**（20-002「連續七次斬擊…最後再給予…」/
   * 52-002「對目標連續 100 下的斬擊」）。
   *
   * ⭐ 它與 {@link randomArea} 的差別只有一句話，而那句話就是它存在的理由：
   *   · `randomArea` 到期時用**圓心重解**（實測：目標走開就打空）；
   *   · `delayed`   到期時用**施放時凍住的那一份名單**。
   * 今天寫「連續七次斬擊」只能寫成同一 tick 七發 damage —— 畫面上那不是連擊。
   *
   * ⚠️ 它與 `dash.onEnd` **方向相反**：這裡凍住的是**名單**（位置無關），
   * 那裡要的是**結束那一刻的位置**（名單無關）。兩個長得像，混用會安靜地做錯。
   *
   * ⭐ 決定性：這個 kind **完全不碰 rng**（沒有落點要抽），所以它連
   * `randomArea` 的 draw 預算問題都沒有。到期一律用**絕對 tick**。
   */
  kind: "delayed";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`"circle"` = 施放那一刻把圓內的人凍成名單。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 第一發等多久（秒）。上界 `DELAYED_MAX_DELAY_SEC`。 */
  delaySec: number;
  /** 總共幾發。省略 = 1（＝退化成純延遲）。上界 `DELAYED_MAX_COUNT`。 */
  count?: number;
  /** 兩發之間隔幾秒（`count > 1` 才有意義）。執行期夾成**至少 1 tick**。 */
  intervalSec?: number;
  /** 每一發跑的東西。 */
  effects: EffectDef[];
  /**
   * **最後一發**額外跑的東西（20-002 的「最後再給予…1800 傷害」/
   * 「最後一擊附加擊退＋恐懼」）。
   * 省略 = 最後一發與其餘完全相同（⛔ **不是**「最後一發不跑」）。
   */
  finalEffects?: EffectDef[];
  /**
   * 目標怎麼決定。省略 = `"frozen"`（施放時凍住 —— 這個機制存在的全部理由）。
   * `"reresolve"` = 到期才重解，也就是 `randomArea` 的語意 —— 對「原地爆的
   * 連擊」那是**正確**的，所以留成一格下拉而不是刪掉。
   */
  targetMode?: "frozen" | "reresolve";
  /**
   * ⭐【沿向量分段推進】(GH#393) —— 這一串**不在原地落下，它往前走**：
   * 第 i 發的落點是 `錨點 + 方向 × (startDist + i × stepDist)`。
   *
   * owner 2026-08-19（34-04 蒼龍破）：「JASS 應該有安排**位置移動**播放的
   * **多次特效搭配傷害**」。配 `targetMode: "reresolve"` + `shape: "circle"`
   * 就是「逐段移動、每段結算一次」，⛔ 不需要為任何一支技能寫一行程式。
   *
   * 缺席 = 原地連擊 = 這一格出現以前的每一份文件（嚴格 no-op）。
   * 方向與起點在**施放那一刻凍住**（原作只讀一次 `GetUnitFacing`）。
   */
  advance?: {
    /** 每一發往前推幾格（GGD 單位）。上界 `DELAYED_MAX_STEP_DIST`。 */
    stepDist: number;
    /** 第一發離施法者多遠。省略 = 0（第一發就在腳下）。 */
    startDist?: number;
    /** 線往哪指：`"target"`（預設，穿過觸發者）或 `"facing"`（身體面向）。 */
    dir?: "facing" | "target";
  };
  /**
   * ⭐【週期領域】圓心釘住還是跟著施法者走。省略 = `"point"` = 釘住 =
   * 這一格出現以前每一份文件的行為（嚴格 no-op）。
   *
   * ⚠️ 與 `targetMode` 是兩件事：`reresolve` 決定「重新算誰在圈裡」，
   * 這一格決定「**那個圈在哪裡**」。⇒「每秒對**附近**的敵人造成傷害」
   *（90-01 飛葉快刀 · 92-04 馬勒戈壁 · 99-04）要的是 `"caster"`。
   */
  anchor?: "point" | "caster";
  /**
   * 同一個人整串只吃一次。省略 = `false` = 這一格出現以前的行為。
   * ⭐ 原作三支自己帶著它（11-04 `ThworldGroup` / 27-01 `safe-group` /
   * 60-01 `SafeTargets`）—— 一條掃過去的線，卡片寫的是**一次**的傷害。
   */
  hitOncePerTarget?: boolean;
  /** 凍住的目標死了就跳過他。省略 = `true`（不繼續鞭屍）。 */
  dropDeadTargets?: boolean;
  /**
   * 施法者陣亡就整波停掉。省略 = `false`，逐字沿用 `randomArea` 的同名欄位。
   * ⚠️ 分區決鬥結束一律停，那不是欄位。
   */
  stopOnCasterDeath?: boolean;
  /**
   * ⭐【逐段瞬移】GH#838 M1 —— 同 `comboStrikes.strikeReposition`（同一格詞彙、
   * 同一行套用）。⚠️ 角度是等分格，⛔ 不是度數。缺席 ⇒ 誰都不動（嚴格 no-op）。
   */
  strikeReposition?: {
    who: "caster" | "victim";
    distU: number;
    ringN: number;
    stepPerStrike: number;
  };
}
