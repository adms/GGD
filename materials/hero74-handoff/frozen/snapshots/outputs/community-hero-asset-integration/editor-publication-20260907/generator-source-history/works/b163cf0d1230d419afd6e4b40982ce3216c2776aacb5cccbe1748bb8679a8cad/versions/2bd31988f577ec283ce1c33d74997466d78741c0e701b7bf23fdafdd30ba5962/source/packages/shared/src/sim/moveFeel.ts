/**
 * ⭐⭐ 「**走起來／貼上去是什麼感覺**」的七個數字 —— ⛔ 在此之前只有改程式碰得到。
 *
 * 同 `combat/impactFeel.ts` 的理由（大目標逐字：「所有功能都要可 JSON 操作設定」），
 * 這一支收的是**移動與接敵**那一族：轉身、加速、繞障礙、自動攻擊的貼身距離。
 *
 * ── ⛔ 這一支**刻意不收**的四個（每一個都有能被反駁的理由）─────────────────
 * | 常數 | 為什麼不在這裡 |
 * |---|---|
 * | `AIM_HOLD_TICKS` | ⭐ **客戶端預測共用它**，而客戶端沒有 config 通道 ⇒ 做成可調會讓預測與伺服器用不同的窗口，每一次 reconcile 都在打架（`aimHold.ts` 檔頭逐字）。⭐ 可反駁：等「client 收得到 config」做完 |
 * | `MOVE_ORDER_STREAM_GAP_TICKS` | ⭐ 它是「同一根搖桿」的**物理判定**（點擊 vs 拖曳），⛔ 不是 owner 會調的手感（`OrderSystem.ts` 檔頭逐字） |
 * | `LOOKAHEAD_HOPS` | ⭐ **量出來的效能預算**（8 跳 → 每次 113 µs，30 隻 × 30 Hz ＝ 10% 一顆核心）。⛔ 調大它是把 CPU 換成一點點平滑，而那不是設定，是回歸 |
 * | `TURN_FACTOR` · `TURN_SNAP_DOT` | ⭐ **客戶端預測共用 `turnToward()`**（`predict/LocalPrediction.ts:619`）—— 同 `AIM_HOLD_TICKS` 的理由：伺服器讀設定而客戶端讀常數 ⇒ 兩邊用不同的轉身速度，⛔ 而那是一個**不會報錯的 desync** |
 *
 * ⚠️ 讀的時候一律走 `moveFeelRules(world)`，⛔ 不要直接讀 `world.combatFeel.moveFeel!`
 * —— 半張表的既有測試會讓它是 undefined，而 `undefined` 一路傳下去變成 `NaN`
 * （`facing` 那一格的檔頭記過同一個前科）。
 */
import type { SimWorld } from "./SimWorld";

export interface MoveFeelRules {
  /** 從站定加速到全速要幾 tick（`ACCEL_TICKS`）—— 起步／煞車的頓挫。 */
  accelTicks: number;
  /** 繞過障礙物時多留的餘裕（世界單位，`collision/avoid.ts` 的 `AVOID_MARGIN`）。 */
  avoidMargin: number;
  /** 自動攻擊的射程緩衝（`BasicAttackSystem` 的 `AUTO_RANGE_BUFFER`）。 */
  autoRangeBuffer: number;
  /** 近戰揮空時往前踉蹌的距離（`WHIFF_LUNGE_DIST`）—— 純手感。 */
  whiffLungeDist: number;
  /** 追擊時停在射程的幾成（`OrderSystem` 的 `HOLD_FRACTION`）—— 留一點餘裕才不會一抖就重追。 */
  holdFraction: number;
  /** 花與障礙物／出生點的最小淨空（`flowers.ts` 的 `FLOWER_CLEARANCE`）。 */
  flowerClearance: number;
  /** 混亂狀態每幾 tick 重挑一次亂走目標（`chaos.ts` 的 `CHAOS_REROLL_TICKS`）。⭐ 短到看得出在亂走、長到走得出距離。 */
  chaosRerollTicks: number;
}

/** ⭐ 出貨值 —— **逐格等於**它搬過來之前的那個常數。 */
export const DEFAULT_MOVE_FEEL: MoveFeelRules = Object.freeze({
  accelTicks: 3,
  avoidMargin: 0.3,
  autoRangeBuffer: 4,
  whiffLungeDist: 0.8,
  holdFraction: 0.9,
  flowerClearance: 3,
  chaosRerollTicks: 15,
});

/** ⚠️ 與 Zod 那一份**逐字相同**（admin 的鏡射測試逐格比對）。 */
const BOUNDS: Readonly<Record<keyof MoveFeelRules, readonly [number, number]>> = Object.freeze({
  accelTicks: [0, 30],
  avoidMargin: [0, 3],
  autoRangeBuffer: [0, 20],
  whiffLungeDist: [0, 5],
  // ⛔ 上界 1：> 1 = 停在射程外 ⇒ 永遠打不到人。
  holdFraction: [0.1, 1],
  flowerClearance: [0, 20],
  // ⛔ 下界 1：0 會讓 `world.tick % n` 除以零。
  chaosRerollTicks: [1, 300],
});

export function normalizeMoveFeelRules(raw: unknown): MoveFeelRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_MOVE_FEEL } as Record<string, number>;
  for (const k of Object.keys(DEFAULT_MOVE_FEEL) as (keyof MoveFeelRules)[]) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = BOUNDS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
  }
  return Object.freeze(out) as unknown as MoveFeelRules;
}

/** ⭐ **唯一**的讀法。缺格 ⇒ 出貨值 ⇒ 行為逐位元不變。 */
export function moveFeelRules(world: SimWorld): MoveFeelRules {
  return world.combatFeel?.moveFeel ?? DEFAULT_MOVE_FEEL;
}
