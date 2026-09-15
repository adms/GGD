/**
 * ⭐⭐【上傳一顆**沒綁骨架**的模型要被擋下來】(GH#1230)
 *
 * owner 2026-09-11（逐字）：「模組與貼圖 都有經過 script 檢查面數 貼圖大小 **綁好骨架** 等 自動化 script ?」
 *
 * ⛔ 答案在 2026-09-11 之前是「**沒有**」：
 * `grep -n "skin\|joint\|WEIGHT\|bone"` 在 `model_intake.py` 與 `inspect.ts` 各是 **0 行**。
 *
 * ⚠️⚠️ ⭐ 而這一格最危險的地方是：**今天量起來是滿分**
 * （2026-09-11 逐顆掃過：115 顆在庫英雄模型 **115/115** skin 與 JOINTS_0 權重齊全）。
 * ⇒ ⛔ 那是**運氣不是保證** —— 沒有任何東西守著它，下一顆沒綁骨架的上傳會靜靜地過。
 * ⭐ 而且它會「**畫得出來**」：一具不會動的 T-pose，六段 clipMap 仍然「有」
 * （動的是節點，⛔ 不是網格）⇒ 這正是本 repo 反覆記錄的「壞掉跟正常長得一樣」。
 *
 * ⭐ 兩個方向都走（⛔ 一把只驗過單邊的尺不算自證過）：
 *   ① 已知**沒綁**的 ⇒ 一定擋　② 已知**綁好**的 ⇒ 一定**不擋**
 */
import { describe, expect, it } from "vitest";
import { heroModelBudgetIssues } from "./heroModel";
import type { InspectedModelUpload } from "./inspect";

/** ⭐ 一顆**通過**的英雄模型；每條測試只改它要測的那一格。 */
function rigged(over: Partial<InspectedModelUpload> = {}): InspectedModelUpload {
  return {
    triangles: 9_000, meshes: 2, skins: 1, skinnedPrimitives: 2,
    clips: [{ index: 0, name: "idle", duration: 1, channels: 40 }],
    textures: [{ width: 256, height: 256, bytes: 1024, sha256: "x" }],
    ...over,
  } as unknown as InspectedModelUpload;
}

describe("英雄模型的骨架綁定（GH#1230）", () => {
  it("② ⭐ 綁好骨架的**不可以**被擋（⛔ 否則這條閘會擋掉每一顆正常模型）", () => {
    // ⛔ 沒有這一條，一個「永遠回錯誤」的實作也會讓 ① 綠。
    expect(heroModelBudgetIssues(rigged()).errors).toEqual([]);
  });

  it("① ⛔ 完全沒有 skins ⇒ 擋下，訊息要說得出後果", () => {
    const { errors } = heroModelBudgetIssues(rigged({ skins: 0 } as never));
    expect(errors.length, "⛔ 沒綁骨架卻放行 ⇒ 玩家拿到一具不會動的 T-pose").toBe(1);
    expect(errors[0]).toContain("骨架");
    expect(errors[0], "⛔ 只說「不合格」而不說後果 ⇒ 收到的人不知道嚴不嚴重").toContain("T-pose");
  });

  it("① ⛔ 有 skins 但**有網格沒權重** ⇒ 也要擋（⭐ 半綁比沒綁更難看出來）", () => {
    const { errors } = heroModelBudgetIssues(rigged({ meshes: 3, skinnedPrimitives: 1 } as never));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("2/3");
  });

  it("④ ⛔ 貼圖整組 8×8 ＝ 佔位圖 ⇒ 擋下（BLP 住子目錄時會靜默退回它）", () => {
    const { errors } = heroModelBudgetIssues(
      rigged({ textures: [{ width: 8, height: 8, bytes: 64, sha256: "y" }] } as never),
    );
    expect(errors.some((e) => e.includes("佔位圖")), "⛔ 佔位貼圖靜默過關 ⇒ 英雄整身變灰塊").toBe(true);
  });

  it("④ ⭐ **沒有**貼圖的模型不可以被誤判成佔位圖（⛔ 兩者量起來一模一樣，要分開）", () => {
    expect(heroModelBudgetIssues(rigged({ textures: [] } as never)).errors).toEqual([]);
  });
});
