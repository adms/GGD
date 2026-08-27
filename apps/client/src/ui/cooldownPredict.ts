/**
 * cooldownPredict —— ⭐ 冷卻圈**當幀起轉**（GH#725 / 舊 #119）。
 *
 * ## 缺口的形狀
 *
 * `ui/castAnnounce` 早就在**按下的那一幀**跑完一次完整的本地預測
 * （`predictCastReject`：等級 / 冷卻 / 魔力 / 生死 / 被動），而它的用途只有
 * 「該不該罵人」—— 預測**通過**的時候它 `return null`,⛔ 一個字都不寫下來。
 * 於是五個 `cooldownView()` 呼叫點全部直讀權威 seat 欄位 ⇒ ⭐ **按下技能之後,
 * 冷卻圈要等一趟 RTT（本機 ~30ms,跨海 ~200ms）才開始轉。**
 *
 * ⇒ 這一支就是「那一次已經算完的預測」的住處。⛔ 它**不重算**任何規則
 * （第〇·四守則：判斷只有一個住處,而那個住處是 `predictCastReject`）。
 *
 * ## ⛔⛔ 不可以「延長」冷卻 —— 這條是硬的
 *
 * 票文逐字：「本地預測必須**只提前起轉**,權威快照一到就以權威為準；
 * ⛔ 不可以讓預測**延長**冷卻（那是作弊面）」。
 *
 * ⭐ 這裡用**結構**保證,⛔ 不是靠 `Math.max` 的算術：
 *
 * | 條件 | 回什麼 |
 * |---|---|
 * | 權威 `> 0` | **權威**,而且**當場把這一格的預測永久丟掉** |
 * | 權威 `=== 0` 且有未過期的預測 | 預測 |
 * | 其餘 | 權威（＝ 0） |
 *
 * ⇒ 預測與權威**永遠不會相加、也永遠不會取最大值** —— 一旦伺服器說過一次話,
 * 這一次按鍵的預測就不存在了。⭐ 所以「預測讓冷卻變長」在結構上做不到,
 * ⛔ 不是「我檢查過了」。
 *
 * ## 「轉了又跳回去」怎麼辦（票文點名的風險）
 *
 * 客戶端預測不到的拒絕（超出射程 / 目標不合法 / 被暈 / 後搖）只有伺服器知道。
 * 兩條路一起收：
 *   ① `castRejected` 事件 → {@link clearCooldownPrediction}（權威說不行 ⇒ 立刻收）
 *   ② {@link COOLDOWN_PREDICT_SHIPPED}`.graceMs` 的兜底：伺服器**什麼都沒說**
 *      超過這麼久 ⇒ 預測自己過期。
 * ⚠️ ②的長度是一個取捨,所以它是**一格欄位**,⛔ 不是一個常數：太短 = 高延遲的
 * 玩家看到跳一下；太長 = 被拒絕的按鍵多轉一會兒。
 */
import { TICK_HZ } from "@ggd/shared/constants";

/** 會有冷卻圈的六格。⛔ 與 `ChampionAbilitySlot` 同一組字面值,⛔ 不另發明。 */
export type CooldownPredictSlot = "Q" | "W" | "E" | "R" | "EX" | "PASSIVE";

/** 一格冷卻圈的身分 —— ⭐ 帶 `seatId` 是因為 HUD 也畫**別人**的技能列。 */
export interface CooldownPredictKey {
  seatId: number;
  slot: CooldownPredictSlot;
}

export interface CooldownPredictTuning {
  /** 總開關。false ⇒ 逐位元回到 2026-08-27 之前（冷卻圈等權威）。 */
  enabled: boolean;
  /**
   * 伺服器**完全沒有回應**時,預測最多自己撐多久（ms）。
   * ⭐ 判準是「一趟 RTT ＋ 一個 snapshot 間隔」,⛔ 不是「冷卻有多長」。
   */
  graceMs: number;
}

/**
 * ⭐ 出貨值（我挑的 —— owner 常設令「沒做完以前別問我了自己判斷 但是留後台開關」）。
 *
 * `graceMs: 700` ＝ 一趟跨海 RTT（~250ms）＋ 兩個 30Hz 快照間隔（~67ms）再留三倍
 * 餘裕。⚠️ 它**不需要**涵蓋整段冷卻：權威只要說過一次話,預測就退休了。
 */
export const COOLDOWN_PREDICT_SHIPPED: CooldownPredictTuning = {
  enabled: true,
  graceMs: 700,
};

let tuning: CooldownPredictTuning = { ...COOLDOWN_PREDICT_SHIPPED };

/**
 * 由 `ContentDb.load()` 灌入（樣板逐字照 `vfxPresets.setImpactRingScale`）。
 * ⚠️ 認不得的一格 = 出貨值,⛔ 不是關掉（`applyDamageColorsDoc` 那條逐格降級規矩）。
 */
export function setCooldownPredictTuning(
  partial: Partial<CooldownPredictTuning> | null | undefined,
): void {
  const p = partial ?? {};
  tuning = {
    enabled: typeof p.enabled === "boolean" ? p.enabled : COOLDOWN_PREDICT_SHIPPED.enabled,
    graceMs:
      typeof p.graceMs === "number" && Number.isFinite(p.graceMs) && p.graceMs >= 0
        ? Math.min(p.graceMs, 5000)
        : COOLDOWN_PREDICT_SHIPPED.graceMs,
  };
}

/** 現在生效的那兩格（守衛用）。 */
export function cooldownPredictTuning(): CooldownPredictTuning {
  return tuning;
}

interface Pending {
  pressedMs: number;
}

/** ⭐ 一次只會有一個座位在按鍵（本機玩家）,但 key 帶 seatId 是為了不誤畫到別人身上。 */
const pending = new Map<string, Pending>();

function keyOf(k: CooldownPredictKey): string {
  return `${k.seatId}/${k.slot}`;
}

/** 測試 seam：⛔ 出貨路徑不傳。 */
let clock: () => number = () => Date.now();
export function setCooldownPredictClock(fn: () => number): void {
  clock = fn;
}

/**
 * 記下一次**本地預測通過**的按鍵。由 `ui/castAnnounce` 在
 * `predictCastReject` 回 null（＝客戶端沒有理由拒絕）的那一刻呼叫。
 *
 * ⛔ 這裡不判斷任何規則 —— 呼叫端已經判完了（見檔頭）。
 */
export function noteCooldownPrediction(k: CooldownPredictKey, nowMs = clock()): void {
  if (!tuning.enabled) return;
  pending.set(keyOf(k), { pressedMs: nowMs });
}

/** 權威說「這一次不算」（`castRejected`）⇒ 立刻收掉那一格。 */
export function clearCooldownPrediction(k: CooldownPredictKey): void {
  pending.delete(keyOf(k));
}

/** 回合／比賽邊界:整份丟掉（⛔ 不留一格轉到下一回合）。 */
export function resetCooldownPredictions(): void {
  pending.clear();
}

/** 現在有幾格在預測（守衛量這個 —— ⛔ 不是「有沒有呼叫過」）。 */
export function pendingCooldownPredictions(): number {
  return pending.size;
}

/**
 * ⭐ **這一格現在該畫幾 tick。** 見檔頭那張表 —— 三條路互斥,
 * ⛔ 預測與權威永遠不相加、不取最大值。
 *
 * @param authTicks 權威快照上的剩餘 tick
 * @param maxSecs   這一格的**env 已縮放**冷卻秒數（呼叫端已經算好的那一個）
 */
export function predictedCooldownTicks(
  k: CooldownPredictKey,
  authTicks: number,
  maxSecs: number,
  nowMs = clock(),
): number {
  // ⭐ 權威說話了 ⇒ 這一次按鍵的預測**永久**退休。這一行就是「⛔ 不可以延長」
  //    的結構保證（⛔ 不是一個 Math.min 的算術）。
  if (authTicks > 0) {
    pending.delete(keyOf(k));
    return authTicks;
  }
  if (!tuning.enabled) return authTicks;
  const p = pending.get(keyOf(k));
  if (!p) return authTicks;
  const elapsedMs = nowMs - p.pressedMs;
  // 伺服器整段沉默 ⇒ 兜底過期（見檔頭「轉了又跳回去」）。
  if (!(elapsedMs >= 0) || elapsedMs > tuning.graceMs) {
    pending.delete(keyOf(k));
    return authTicks;
  }
  if (!(maxSecs > 0) || !Number.isFinite(maxSecs)) return authTicks;
  const remainMs = maxSecs * 1000 - elapsedMs;
  if (!(remainMs > 0)) {
    pending.delete(keyOf(k));
    return authTicks;
  }
  return (remainMs / 1000) * TICK_HZ;
}
