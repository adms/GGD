/**
 * ⭐⭐ 第十一回合的**生怪時序**（GH#1151 B）—— 純函式，⛔ 不持有狀態。
 *
 * ── ⭐ 這一支回答四個問題 ──────────────────────────────────────
 *   ① 這一刻該不該發下一個事件？        （`eventIntervalSec`）
 *   ② 發哪一種？                        （`waveTable.events` 的加權）
 *   ③ 這是第幾波、難度乘多少？          （`difficultyBase`）
 *   ④ 現在最多能有幾隻活著？            （`maxAliveZombies` ＋ `spawnRampSec`）
 *
 * ── ⛔ 兩個 `sim/**` 的硬約束，⭐ 而它們改變了寫法 ──────────────────
 * 1. ⛔ **禁 `Math.random`** ⇒ ⭐ 抽樣值由呼叫端給（`world.rng`），
 *    這一支只做「⭐ 給我一個 [0,1) 的數，我告訴你落在哪一格」。
 * 2. ⛔ **禁 `Math.pow` 與 `**`** —— `purity.test.ts` 逐字：
 *    「If a sim system ever genuinely needs a power, it needs a rational
 *     approximation, not Math.pow」。
 *    ⭐ 而這裡的指數是**整數**（第幾波）⇒ **連乘迴圈是精確的**，
 *    ⛔ 不必近似，⭐ 而且兩台機器逐位元相同（錄影可重播）。
 */

/** `waveTable.events` 的一列。 */
export interface Round11WaveEvent {
  readonly kind: string;
  readonly weight: number;
}

/** `round11.waveTable` 真正會用到的那幾格。 */
export interface Round11WaveTable {
  readonly eventIntervalSec: number;
  readonly difficultyBase: number;
  readonly events: readonly Round11WaveEvent[];
}

/**
 * ⭐ 到現在為止**應該**已經發過幾個事件？
 *
 * ⚠️ ⭐ 回傳「應該發過幾個」而不是「這一 tick 發不發」是刻意的：
 * ⛔ 後者在**長 tick**（伺服器卡一下、錄影快轉）時會**漏掉整個事件**，
 * ⭐ 而 #1151 B 逐字要求「測試密集生成、死亡補位和**長 tick 不超額**」。
 * ⇒ 呼叫端拿「應該」減「已經」，一次補齊差額。
 */
export function round11EventsDue(elapsedSec: number, intervalSec: number): number {
  if (intervalSec <= 0) return 0;
  if (elapsedSec < intervalSec) return 0;
  return Math.floor(elapsedSec / intervalSec);
}

/**
 * ⭐ 第 `eventIndex` 個事件（**0 起算**）的難度倍率 ＝ `base` 自乘 `eventIndex` 次。
 *
 * ⛔ 不用 `Math.pow` / `**`（見檔頭）——⭐ 整數指數用連乘，**精確且可重播**。
 * ⚠️ `base <= 0` 視為「⛔ 不成長」而回 1，⭐ 不是回 0：
 *   一個把難度乘成 0 的設定會讓整個第十一回合**一隻怪都不出**。
 */
export function round11Difficulty(base: number, eventIndex: number): number {
  if (!(base > 0) || eventIndex <= 0) return 1;
  let out = 1;
  for (let i = 0; i < eventIndex; i++) out = out * base;
  return out;
}

/**
 * ⭐ 加權挑一個事件 —— `roll` 是 **[0,1)** 的抽樣值（由 `world.rng` 給）。
 *
 * ⚠️ ⭐ 權重全 0 或空表 ⇒ 回 `null`（＝**這一波不發事件**），
 * ⛔ 不是「退回第一個」：#1151 B 逐字說「事件權重零／空表／子事件關閉
 *   **沿用契約語意**」，⭐ 而權重 0 的契約語意就是「不要選它」。
 *
 * ⭐ 迭代順序是**陣列順序**（⛔ 不排序、⛔ 不用 Map）—— 出貨表的順序就是判準，
 *   而 `sim/**` 的「Map 迭代要先排序」是為了避免插入順序影響結果；
 *   ⭐ 這裡讀的是一個**有序陣列**，本來就是決定性的。
 */
export function pickRound11Event(
  events: readonly Round11WaveEvent[],
  roll: number,
): string | null {
  let total = 0;
  for (const e of events) if (e.weight > 0) total = total + e.weight;
  if (total <= 0) return null;
  // ⭐ 夾在 [0,1) —— ⛔ 一個 1.0 的 roll 會落在最後一格的**外面**。
  const r = (roll < 0 ? 0 : roll >= 1 ? 0.999999 : roll) * total;
  let acc = 0;
  for (const e of events) {
    if (e.weight <= 0) continue;
    acc = acc + e.weight;
    if (r < acc) return e.kind;
  }
  return null; // ⛔ 浮點邊界：理論上到不了，⭐ 而回 null 比回錯的 kind 安全
}

/**
 * ⭐ 這一刻的**同時存活上限** —— 從 0 線性長到 `maxAlive`，用 `rampSec` 秒。
 *
 * ⚠️ ⭐ #1151 B 逐字：「**漸進生成**、同時存活上限與難度成長實際生效」——
 * ⛔ 一開場就允許 500 隻，等於把「生存」變成「開場即團滅」。
 *
 * ⭐ 線性（乘、除、加）⛔ 不用曲線 —— 同 `fireRing` 的理由：
 *   一條「eased」曲線是唯一能通過其他每一道閘、⭐ 而讓兩台機器差一個 ulp 的東西。
 */
export function round11AliveCap(elapsedSec: number, rampSec: number, maxAlive: number): number {
  if (maxAlive <= 0) return 0;
  if (rampSec <= 0) return maxAlive;
  if (elapsedSec >= rampSec) return maxAlive;
  if (elapsedSec <= 0) return 0;
  return Math.floor((maxAlive * elapsedSec) / rampSec);
}

// ─────────────────────────────────────────────────────────────────────────
// ⭐ 接到**出貨的生怪管線** —— ⛔ 不寫第二個生怪器
// ─────────────────────────────────────────────────────────────────────────

/**
 * ⭐ `round11.waveTable` → 出貨的 `MobRules` 的那幾格。
 *
 * ⚠️⭐ 這是**翻譯**，⛔ 不是新機制（第〇·五守則：看到「為這一批寫一份自己的
 * 流程」就是越線）。出貨的 `MobSystem` 已經會照 `waveIntervalTicks` /
 * `maxAlivePerZone` / `autoWaves` 生怪 ⇒ ⭐ 第十一回合只要把設定**翻過去**。
 *
 * ⭐ `maxAlivePerZone` 直接吃 `maxAliveZombies` 是對的：第十一回合是 royale
 * （**一個區**），⇒ 「每區上限」與「全場上限」是同一個數。
 *
 * ⚠️⚠️ ⭐ **翻不過去的那一格要說出來**：`spawnRampSec`（漸進生成）在出貨的
 * `MobRules` 裡**沒有對應欄位** —— 它是一個**靜態**的 `maxAlivePerZone`。
 * ⇒ ⛔ 這一支**不假裝**翻得過去：它回傳「滿載」的上限，
 *   ⭐ 而漸進要靠呼叫端每 tick 用 `round11AliveCap()` 夾一次
 *   （＝ #1151 B 的「漸進生成⋯實際生效」還缺的那一個掛載點）。
 */
export interface Round11MobRulesPatch {
  readonly fromRound: number;
  readonly firstWaveTicks: number;
  readonly waveIntervalTicks: number;
  readonly maxAlivePerZone: number;
  readonly autoWaves: true;
}

export function round11MobRulesPatch(
  round: number,
  table: Round11WaveTable,
  maxAliveZombies: number,
  tickHz: number,
): Round11MobRulesPatch {
  // ⭐ 第一波就在第一個間隔 —— ⛔ 不是 0（開場那一刻同時進場又爆怪）。
  const interval = Math.max(1, Math.round(table.eventIntervalSec * tickHz));
  return {
    fromRound: round,
    firstWaveTicks: interval,
    waveIntervalTicks: interval,
    maxAlivePerZone: maxAliveZombies > 0 ? maxAliveZombies : 0,
    autoWaves: true,
  };
}
