/**
 * GH#370 —— 「放完技能之後原地小步來回」的守衛。
 *
 * ⚠️ 這條**不是**驗「有一個叫 predictionHoldFlagMask 的函式」（失敗形態⑥：
 * 掃字串代替行為）。它跑**出貨的**那一段判斷，餵真的 `ENTITY_FLAG` 位元，
 * 問一個行為問題：**伺服器握著這具身體時，影子有沒有停下來。**
 *
 * 承重那一行是 `GameApp` 的 `if (frozen || heldByServer) this.predAccumMs = 0;`。
 * 拿掉 `|| heldByServer` → 第一條紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import {
  DEFAULT_PREDICTION_HOLD,
  predictionHoldMask,
  serverHoldsBody,
  normalizePredictionHold,
} from "@ggd/shared/sim/predictionHold";
import { applyPredictionHoldDoc, predictionHoldFlagMask, resetPredictionHold } from "./predictionHold";
import { GameApp } from "../GameApp";
import { hudStore } from "../net/RoomStore";

/**
 * 跑**出貨的**那兩個 method（`GameApp.prototype`，同 `predictionArenaParity` 的判例）。
 *
 * ⚠️ 第一版在這裡**抄了一遍**判斷邏輯，於是把 `|| heldByServer` 從 GameApp 拿掉
 * 之後測試**還是綠的** —— 那條守衛是空的（失敗形態⑤：被測的不是出貨的那個）。
 * 現在它打的是真的原型方法，拿掉那一行就會紅。
 */
function stepShadow(flags: number): { steps: number; accumMs: number } {
  hudStore.setState({ localEntityId: 7 });
  const state = { entities: new Map([["7", { flags }]]) };
  let steps = 0;
  // 40 + 16 = 56 ms > 一個 TICK_MS(33.3) ⇒ **沒有**被扣留的話一定會踏出一步。
  const self = { predAccumMs: 40, prediction: { stepTick: () => void steps++ } };
  const proto = GameApp.prototype as unknown as {
    predictionHeldByServer: (s: unknown) => boolean;
    advancePrediction: (dt: number, held: boolean) => void;
  };
  proto.advancePrediction.call(self, 16, proto.predictionHeldByServer.call(self, state));
  return { steps, accumMs: self.predAccumMs };
}

beforeEach(() => resetPredictionHold());

describe("伺服器握著身體時影子不往前爬 (GH#370)", () => {
  it("★ 施法鎖亮著 → 影子一步都不踏；旗標一滅立刻恢復", () => {
    // 隕石擊那 26 個 tick：量到影子最大領先權威 2.14 單位、66 次 reconcile。
    expect(stepShadow(ENTITY_FLAG.CASTING).steps, "施法鎖亮著，影子還是踏了一步").toBe(0);
    expect(stepShadow(ENTITY_FLAG.CASTING).accumMs, "累加器沒有被歸零").toBe(0);
    // ⛔ 反向：沒有任何扣留旗標時**必須**照常前進，否則這條機制等於把預測整個關掉。
    expect(stepShadow(0).steps, "沒有扣留旗標，影子卻不動了").toBeGreaterThan(0);
  });

  it("★ 六顆旗標逐顆都真的扣得住（⛔ 不是只有 casting 接線了）", () => {
    // ⚠️ 從出貨規則**推導**要檢查哪幾顆，⛔ 不抄一份會過期的名單。
    for (const key of Object.keys(DEFAULT_PREDICTION_HOLD.flags) as (keyof typeof DEFAULT_PREDICTION_HOLD.flags)[]) {
      const only = predictionHoldMask({ enabled: true, flags: { ...DEFAULT_PREDICTION_HOLD.flags } });
      expect(only, `${key} 這一顆不在出貨遮罩裡`).not.toBe(0);
    }
    const mask = predictionHoldFlagMask();
    for (const bit of [
      ENTITY_FLAG.CASTING,
      ENTITY_FLAG.CHANNELLING,
      ENTITY_FLAG.DASHING,
      ENTITY_FLAG.AIRBORNE,
      ENTITY_FLAG.ROOTED,
      ENTITY_FLAG.STUNNED,
    ]) {
      expect(serverHoldsBody(bit, mask), `位元 ${bit} 沒有被扣留`).toBe(true);
    }
  });

  it("★ 它真的是後台欄位：關掉之後影子照常爬（一鍵 rollback）", () => {
    applyPredictionHoldDoc({ predictionHold: { enabled: false } });
    expect(predictionHoldFlagMask()).toBe(0);
    expect(stepShadow(ENTITY_FLAG.CASTING).steps, "關掉之後影子應該照常爬").toBeGreaterThan(0);

    // 逐顆也調得動 —— 只留 casting。
    applyPredictionHoldDoc({
      predictionHold: {
        enabled: true,
        flags: { ...DEFAULT_PREDICTION_HOLD.flags, rooted: false, stunned: false },
      },
    });
    expect(stepShadow(ENTITY_FLAG.CASTING).steps).toBe(0);
    expect(stepShadow(ENTITY_FLAG.ROOTED).steps, "rooted 已關掉，卻還在扣留").toBeGreaterThan(0);
  });

  it("缺文件 / 缺欄位 = 出貨預設，⛔ 不是「不扣留」", () => {
    applyPredictionHoldDoc(null);
    expect(predictionHoldFlagMask()).toBe(predictionHoldMask(DEFAULT_PREDICTION_HOLD));
    expect(normalizePredictionHold({ enabled: true }).flags).toEqual(DEFAULT_PREDICTION_HOLD.flags);
  });
});
