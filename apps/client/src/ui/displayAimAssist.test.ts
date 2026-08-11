/**
 * GH#315 接線守衛 —— 手把自動瞄準的小怪讓路幅度真的**從後台讀**。
 *
 * ⚠️ 為什麼需要這一條：`mobTargeting.test.ts`（行為守衛）對「有沒有讀 config」
 * 完全免疫 —— 把 `aimAssistMobPenalty()` 換成 `return DEFAULT_AIM_ASSIST.mobPenalty`
 * （＝整個後台旋鈕消失、退回寫死常數）之後它 **3/3 全綠**。那是失敗形態③：
 * 可以從系統裡刪掉但測試不知道。所以旋鈕本身要有自己的一條線。
 *
 * 這是**接線類**（第零守則⑦）：刪掉那一行整個功能就消失 → 突變一次，一條薄守衛。
 *
 * 突變紀錄：
 *   · `displayAimAssist.ts` 改成 `return DEFAULT_AIM_ASSIST.mobPenalty` → 紅
 *     （後台填 1 卻拿到 6）
 */
import { describe, it, expect, afterEach } from "vitest";
import { Configs } from "@ggd/shared/content";
import { COMBAT_FEEL_DOC_ID, COMBAT_FEEL_SCHEMA, DEFAULT_AIM_ASSIST } from "@ggd/shared/sim/combatFeel";
import { aimAssistMobPenalty } from "./displayAimAssist";

const shipped = () => Configs.tryGet(COMBAT_FEEL_DOC_ID);
const restore = shipped();

afterEach(() => {
  // ⚠️ 沒有 restore 時**不能什麼都不做** —— 上一個 it 註冊的 mobPenalty:1 會留著，
  //    讓下一條「回出貨預設」測到 1 而綠得毫無意義。空文件 = 全部走預設。
  Configs.register(
    restore ?? ({ id: COMBAT_FEEL_DOC_ID, schema: COMBAT_FEEL_SCHEMA } as never),
  );
});

describe("小怪讓路幅度是後台欄位（GH#315）", () => {
  it("⭐ 後台填什麼就用什麼 —— ⛔ 不是客戶端常數", () => {
    Configs.register({
      id: COMBAT_FEEL_DOC_ID,
      schema: COMBAT_FEEL_SCHEMA,
      aimAssist: { mobPenalty: 1 },
    } as never);
    expect(aimAssistMobPenalty()).toBe(1);
    // 夾具前提：1 不等於出貨預設，否則上面那條斷言對寫死實作也會過。
    expect(DEFAULT_AIM_ASSIST.mobPenalty).not.toBe(1);
  });

  it("讀不到文件時回出貨預設，⛔ 不是 0（0 = 小怪不讓路，靜默的規則消失）", () => {
    expect(aimAssistMobPenalty()).toBe(DEFAULT_AIM_ASSIST.mobPenalty);
  });
});
