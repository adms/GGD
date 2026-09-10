/**
 * ⭐⭐ 第十一回合的**大轟炸**（GH#1151 F）—— 純函式，⛔ 不持有狀態。
 *
 * ── ⭐ 票逐字要的三件，這一支各給一個答案 ─────────────────────────
 *   ①「**密集人群偏向**選點」          → `pickBombardmentTarget`
 *   ②「預警圈、倒數⋯**倒數前不傷害**」→ `bombardmentPhase`
 *   ③「**圈外不命中**」                → `bombardmentHits`
 *
 * ── ⛔⛔ 而票裡有一句是**設計約束**，⛔ 不是提醒 ────────────────────
 * 「⛔ **不能有一份視覺半徑與另一份判定半徑**」
 * ⇒ ⭐ 所以這一支**只有一個** `radius`，而預警圈與命中判定**讀同一格**
 *   （第〇·四守則：同一個值不可以有第二個住處）。
 *   ⛔ 這裡不提供「視覺半徑」參數 —— 沒有那個參數，就造不出那個缺陷。
 *
 * ── ⛔ `sim/**` 的約束 ────────────────────────────────────────
 * ⛔ 無 `Math.random`（選點的抽樣由呼叫端給）、⛔ 無三角函式、⛔ 無 `Math.hypot`
 * ⇒ ⭐ 距離一律比**平方**（⛔ 不開根號）—— 快，而且⭐ 兩台機器逐位元相同。
 */

/** 一個可以被選為落點的目標（通常是一名英雄）。 */
export interface BombardmentCandidate {
  readonly x: number;
  readonly z: number;
}

/** `round11.bombardment` 真正會用到的那幾格。 */
export interface BombardmentConfig {
  readonly enabled: boolean;
  readonly telegraphSec: number;
  readonly damagePctOfMaxHp: number;
  /** ⭐ **唯一**的半徑 —— 預警圈與命中判定共用（見檔頭）。 */
  readonly radius: number;
  /** 0 = 純隨機挑一個人；1 = 一定挑**人最密**的那一點。 */
  readonly crowdBias: number;
}

/** 轟炸的三個階段。 */
export type BombardmentPhase = "telegraph" | "impact" | "done";

/**
 * ⭐ 這一刻是預警、落地、還是已經結束？
 *
 * ⚠️⚠️ ⭐ 票逐字：「**倒數前不傷害**⋯事件**只結算一次**」。
 * ⇒ `impact` **只在跨過門檻的那一刻**回一次：
 *   `elapsed < telegraph` → `telegraph`（⛔ 不傷害）
 *   `elapsed` 跨過 `telegraph` → `impact`（⭐ 結算，⭐ 只有這一 tick）
 *   之後                    → `done`（⛔ 不再結算）
 *
 * ⭐ 用「上一 tick 的 elapsed」判跨越，⛔ 不是用一個 `hasFired` 旗標 ——
 * 旗標要有人記得清掉，⭐ 而「跨越」是從時間本身推導出來的。
 */
export function bombardmentPhase(
  prevElapsedSec: number,
  elapsedSec: number,
  telegraphSec: number,
): BombardmentPhase {
  if (elapsedSec < telegraphSec) return "telegraph";
  if (prevElapsedSec < telegraphSec) return "impact";
  return "done";
}

/**
 * ⭐ 圈內嗎？—— ⛔ 比**平方**，不開根號（`sim/**` 禁 `Math.hypot`；⭐ 也更快）。
 *
 * ⚠️ ⭐ `radius` 就是預警圈畫出來的那一個 —— ⛔ 這一支**沒有**第二個半徑參數。
 */
export function bombardmentHits(
  target: BombardmentCandidate,
  cx: number,
  cz: number,
  radius: number,
): boolean {
  if (!(radius > 0)) return false;
  const dx = target.x - cx;
  const dz = target.z - cz;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * ⭐ 選一個落點 —— 「**密集人群偏向**」。
 *
 * ⭐ 做法（⛔ 刻意很笨，因為它要可重播）：
 *   1. 每一個候選點，數**它半徑內有幾個人**（含自己）⇒ 那是它的「人潮分數」
 *   2. 權重 ＝ `1 + crowdBias × (score − 1)`
 *      ⇒ `crowdBias = 0` ⇒ 每個人等權（純隨機挑一個人）
 *      ⇒ `crowdBias = 1` ⇒ 權重就是人潮分數（⭐ 越擠越可能被炸）
 *   3. 用呼叫端給的 `roll ∈ [0,1)` 加權挑一個
 *
 * ⚠️ ⭐ 回傳的是**候選之一的座標**，⛔ 不是一個「重心」——
 * 重心會落在**沒有人**的地方（三個人圍成三角形時正中央是空的），
 * ⭐ 而票要的是「密集人群偏向**選點**」。
 *
 * ⛔ 沒有候選 ⇒ `null`（⭐ ＝ 這一次不炸），⛔ 不是炸原點。
 */
export function pickBombardmentTarget(
  candidates: readonly BombardmentCandidate[],
  radius: number,
  crowdBias: number,
  roll: number,
): BombardmentCandidate | null {
  if (candidates.length === 0) return null;
  const bias = crowdBias > 0 ? (crowdBias > 1 ? 1 : crowdBias) : 0;
  const weights: number[] = [];
  let total = 0;
  for (const c of candidates) {
    let score = 0;
    for (const o of candidates) if (bombardmentHits(o, c.x, c.z, radius)) score++;
    const w = 1 + bias * (score - 1);
    const ww = w > 0 ? w : 0;
    weights.push(ww);
    total = total + ww;
  }
  if (total <= 0) return candidates[0] ?? null;
  const r = (roll < 0 ? 0 : roll >= 1 ? 0.999999 : roll) * total;
  let acc = 0;
  for (let i = 0; i < candidates.length; i++) {
    acc = acc + weights[i]!;
    if (r < acc) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * ⭐ 這一發打掉多少血 —— `damagePctOfMaxHp × maxHp`。
 *
 * ⚠️ ⭐ 票要求「**沿用合法環境傷害入口**」⇒ 這一支**只算數字**，
 * ⛔ 不自己扣血、⛔ 不繞過傷害管線（那是呼叫端的事）。
 * ⭐ 而「防止不合理一擊必殺」是 D 項那一條 —— 這裡回的是**傷害量**，
 *   要不要有免死保護由傷害管線決定，⛔ 不在這裡偷偷夾。
 */
export function bombardmentDamage(maxHp: number, damagePctOfMaxHp: number): number {
  if (!(maxHp > 0) || !(damagePctOfMaxHp > 0)) return 0;
  return maxHp * damagePctOfMaxHp;
}
