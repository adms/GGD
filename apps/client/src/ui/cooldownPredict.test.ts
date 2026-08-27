/**
 * ⭐ GH#725（舊 #119）—— **冷卻圈不再等一趟 RTT。**
 *
 * ⛔ 這個檔最重要的不是「預測會轉」，是**它不可以延長冷卻**（票文逐字：那是作弊面）。
 * 所以下面有兩條方向相反的斷言，而且第二條驗的是**結構**：權威說過一次話之後，
 * 那一次按鍵的預測就不存在了 —— ⛔ 不是「我用 Math.min 夾住了」。
 *
 * ⛔ 不斷言任何出貨數字（graceMs / 冷卻秒數都是三個住處的東西）。
 */
import { describe, expect, it, beforeEach } from "vitest";
import { TICK_HZ } from "@ggd/shared/constants";
import {
  COOLDOWN_PREDICT_SHIPPED,
  clearCooldownPrediction,
  cooldownPredictTuning,
  noteCooldownPrediction,
  pendingCooldownPredictions,
  predictedCooldownTicks,
  resetCooldownPredictions,
  setCooldownPredictTuning,
} from "./cooldownPredict";
import { cooldownView } from "./cooldownView";

const KEY = { seatId: 1, slot: "Q" } as const;
const OTHER = { seatId: 2, slot: "Q" } as const;
const MAX_SEC = 10;

beforeEach(() => {
  resetCooldownPredictions();
  setCooldownPredictTuning(null);
});

describe("GH#725 冷卻圈的本地預測", () => {
  it("⭐ 按下的當幀就在轉（權威還是 0）", () => {
    expect(predictedCooldownTicks(KEY, 0, MAX_SEC, 1000)).toBe(0); // 沒按之前
    noteCooldownPrediction(KEY, 1000);
    expect(predictedCooldownTicks(KEY, 0, MAX_SEC, 1000)).toBeGreaterThan(0);
    // 而且它會走 —— 晚一點剩得比較少
    const early = predictedCooldownTicks(KEY, 0, MAX_SEC, 1050);
    const later = predictedCooldownTicks(KEY, 0, MAX_SEC, 1200);
    expect(later).toBeLessThan(early);
  });

  it("⛔⛔ 權威一到就以權威為準，而且那一次按鍵的預測**永久**退休（＝不可能延長）", () => {
    noteCooldownPrediction(KEY, 1000);
    // 權威說話 ⇒ 回的**逐位元**是權威
    const auth = 4 * TICK_HZ;
    expect(predictedCooldownTicks(KEY, auth, MAX_SEC, 1100)).toBe(auth);
    expect(pendingCooldownPredictions(), "權威說過話之後預測還留著 = 它有機會延長").toBe(0);
    // 之後權威歸零（技能好了）⇒ ⛔ 預測**不可以**再冒出來把圈重新畫上
    expect(predictedCooldownTicks(KEY, 0, MAX_SEC, 1200)).toBe(0);
  });

  it("⭐ 權威說「這一次不算」（castRejected）⇒ 立刻收，⛔ 不是等 grace 到期", () => {
    noteCooldownPrediction(KEY, 1000);
    clearCooldownPrediction(KEY);
    expect(predictedCooldownTicks(KEY, 0, MAX_SEC, 1010)).toBe(0);
  });

  it("⭐ 伺服器整段沉默 ⇒ 兜底過期（⛔ 不會一直轉下去）", () => {
    noteCooldownPrediction(KEY, 1000);
    const after = 1000 + cooldownPredictTuning().graceMs + 1;
    expect(predictedCooldownTicks(KEY, 0, MAX_SEC, after)).toBe(0);
    expect(pendingCooldownPredictions()).toBe(0);
  });

  it("⭐ 預測綁在**那一個座位的那一格**上，⛔ 不會畫到別人的技能列", () => {
    noteCooldownPrediction(KEY, 1000);
    expect(predictedCooldownTicks(OTHER, 0, MAX_SEC, 1010)).toBe(0);
    expect(predictedCooldownTicks({ seatId: 1, slot: "W" }, 0, MAX_SEC, 1010)).toBe(0);
  });

  it("⭐ 一鍵 rollback：關掉之後**逐位元**回到 2026-08-27 之前", () => {
    setCooldownPredictTuning({ enabled: false });
    noteCooldownPrediction(KEY, 1000);
    expect(predictedCooldownTicks(KEY, 0, MAX_SEC, 1010)).toBe(0);
    expect(pendingCooldownPredictions()).toBe(0);
    // 認不得的一格 = 出貨值，⛔ 不是關掉
    setCooldownPredictTuning({ graceMs: Number.NaN });
    expect(cooldownPredictTuning().graceMs).toBe(COOLDOWN_PREDICT_SHIPPED.graceMs);
  });

  it("⭐ 出貨的那條路：`cooldownView` 給了 key 才預測，省略就逐位元不變", () => {
    noteCooldownPrediction(KEY, Date.now());
    expect(cooldownView(0, MAX_SEC).onCd, "沒給 key 的呼叫端不該被動到").toBe(false);
    const predicted = cooldownView(0, MAX_SEC, KEY);
    expect(predicted.onCd, "給了 key 卻沒有起轉 —— 消費端沒接上").toBe(true);
    expect(predicted.frac).toBeGreaterThan(0);
    expect(predicted.label).not.toBe("");
  });
});
