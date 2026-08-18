/**
 * 預測影子的扣留遮罩 —— client 端的**現值** (GH#370)。
 *
 * 語意、量到的數字與出貨預設全部住在 `@ggd/shared/sim/predictionHold`，
 * 這個檔只做兩件事（逐字照抄 `localFacingMode.ts` 的形狀）：
 *
 *   1. 從一份 `config.combat-feel@1` 文件把 `predictionHold` 讀出來；
 *   2. 存成一個 client 端的現值，讓 `GameApp` 每一幀零成本讀到。
 *
 * ⚠️ 為什麼是模組級現值而不是 `GameApp` 的建構參數：內容是**非同步**載入的
 * （`ContentDb.load()` 在 `GameApp` 建好之後才 resolve），而一場比賽可能在內容
 * 抵達之前就開始。存成現值 = 內容一到就生效，不必重建 GameApp。
 *
 * ⚠️ 存的是**算好的遮罩**不是規則物件：`GameApp` 那一行在每一幀跑，
 * 而遮罩只在設定變動時才需要重算。
 */
import {
  DEFAULT_PREDICTION_HOLD,
  normalizePredictionHold,
  predictionHoldMask,
} from "@ggd/shared/sim/predictionHold";

let mask = predictionHoldMask(DEFAULT_PREDICTION_HOLD);

/** 這一場實際生效的扣留遮罩（0 = 不扣留）。 */
export function predictionHoldFlagMask(): number {
  return mask;
}

/**
 * 套用一份 `config.combat-feel@1` 文件。缺文件 / 缺欄位 = 出貨預設。
 *
 * ⚠️ 缺欄位刻意**不叫**（和 `facing.localMode` 認不得的字串不同）：這一格是
 * 整塊 optional 的，「後台沒存過」是絕大多數玩家的正常狀態，為它叫一聲等於
 * 每一場都印一行沒有人要讀的 warn。認不得的**型別**由 `normalizePredictionHold`
 * 逐格退回預設 —— 那一層的失敗是「操作者手改 overlay 打錯字」，而後台頁與 Zod
 * 兩層已經擋在前面。
 */
export function applyPredictionHoldDoc(doc: unknown): void {
  const raw = (doc as { predictionHold?: unknown } | null | undefined)?.predictionHold;
  mask = predictionHoldMask(
    raw === undefined || raw === null ? DEFAULT_PREDICTION_HOLD : normalizePredictionHold(raw),
  );
}

/** 測試用：把現值放回出貨預設。 */
export function resetPredictionHold(): void {
  mask = predictionHoldMask(DEFAULT_PREDICTION_HOLD);
}
