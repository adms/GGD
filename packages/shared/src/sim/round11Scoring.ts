/**
 * ⭐⭐ 第十一回合的**計分**（GH#1151 G）—— 純函式，⛔ 不碰結算流程。
 *
 * ── ⭐ 設定的三格 ─────────────────────────────────────────────
 *   `survivalWeight`                  存活時間佔多少（其餘給戰鬥貢獻）
 *   `minContributionForFullSurvival`  ⭐ **低貢獻折扣**的門檻
 *   `scoreMultiplier`                 ⭐ 這一回合的分數乘多少
 *
 * ── ⛔⛔ 票逐字點名的那個坑 ──────────────────────────────────────
 * 「⛔ 不能把**總分**與**本回合分數**混用而**重複乘算**」
 *
 * ⇒ ⭐ 所以這一支**只回「本回合的分數」**，⛔ 而且 `scoreMultiplier`
 *   在**這一支裡面**就乘完了 —— 呼叫端要做的只是「加進總分」。
 *   ⛔ 它**不接受**總分參數，⭐ 於是「把倍率套到總分上」在型別上就寫不出來。
 *   （第〇·四守則的形狀：⭐ 沒有那個入口，就造不出那個缺陷。）
 */

/** `round11.scoring` 真正會用到的那幾格。 */
export interface Round11Scoring {
  readonly survivalWeight: number;
  readonly scoreMultiplier: number;
  readonly minContributionForFullSurvival: number;
}

/** 一名玩家在第十一回合的表現（全部**正規化到 [0,1]**，由呼叫端算）。 */
export interface Round11Performance {
  /** 撐了多久 ÷ 這一回合的長度。 */
  readonly survivalFrac: number;
  /** 戰鬥貢獻 ÷ 全場最高（⭐ 零貢獻就是 0）。 */
  readonly contributionFrac: number;
}

/**
 * ⭐ 這一名玩家**在第十一回合**拿多少分（已經乘過 `scoreMultiplier`）。
 *
 * ⭐ 公式：
 *   `survival = survivalFrac × survivalWeight × 折扣`
 *   `combat   = contributionFrac × (1 − survivalWeight)`
 *   `分數     = (survival + combat) × scoreMultiplier`
 *
 * ⚠️⚠️ ⭐ **低貢獻折扣**（票逐字要的那一項）：
 * 貢獻低於 `minContributionForFullSurvival` 時，**存活那一半**按比例打折。
 * ⛔ 這不是懲罰躲起來的人「不給分」，⭐ 而是「躲整場拿不到滿額的存活分」——
 *   ⛔ 直接歸零會讓一個真的被追殺整場、打不到人的玩家拿 0，⭐ 而他確實活著。
 *
 * ⚠️ ⭐ 門檻 `<= 0` ⇒ **不折扣**（＝這個機制關著），⛔ 不是「所有人都折到 0」。
 */
export function round11Score(perf: Round11Performance, cfg: Round11Scoring): number {
  const w = clamp01(cfg.survivalWeight);
  const surv = clamp01(perf.survivalFrac);
  const contrib = clamp01(perf.contributionFrac);
  const gate = cfg.minContributionForFullSurvival;
  // ⭐ 折扣係數：貢獻達門檻 ⇒ 1；不到 ⇒ 按比例（⛔ 不是 0）。
  const discount = gate > 0 ? (contrib >= gate ? 1 : contrib / gate) : 1;
  const survivalPart = surv * w * discount;
  const combatPart = contrib * (1 - w);
  const mult = cfg.scoreMultiplier > 0 ? cfg.scoreMultiplier : 1;
  return (survivalPart + combatPart) * mult;
}

/**
 * ⭐ **換邊之後分數凍結**（票逐字：「人類死亡**凍結原分數**」）。
 *
 * ⇒ 回傳「該用哪一個 `survivalFrac`」：⭐ 死掉那一刻的，⛔ 不是回合結束時的。
 * ⚠️ ⭐ 這一支存在的理由是它**很容易寫錯**：一個「回合結束時還活著嗎」的
 *   判斷會讓**換邊後操作殭屍王的玩家**拿到滿額存活分 ——
 *   ⛔ 而他的人類角色早就倒了。
 */
export function round11FrozenSurvivalFrac(
  diedAtSec: number | null,
  roundEndedAtSec: number,
  durationSec: number,
): number {
  if (!(durationSec > 0)) return 0;
  const t = diedAtSec === null ? roundEndedAtSec : diedAtSec;
  return clamp01(t / durationSec);
}

function clamp01(v: number): number {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}
