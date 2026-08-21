/**
 * GH#511 — 商店購買對話框的 B 鍵是**契約**，不是文案的巧合。
 *
 * ⛔ NOT `grep "padBack"` over StoreScreen.tsx: `Btn` 有一份**明列的 props**
 * （⛔ 不像 `SfxButton` 會 `...rest`），所以一個沒被 `Btn` 接住的屬性會被**靜默
 * 丟掉**而 grep 照樣是綠的 —— 那正是 padModalScope.test.ts 檔頭記錄過的形狀。
 * 這裡真的把出貨的 `PurchaseDialog` 渲染出來，讀**最終 markup**。
 *
 * ⭐ 四個相位一起驗，因為缺陷正是「某一個相位上沒有」：買完之後只剩「太好了」，
 * 而它不含 `BACK_ALLOW_RE` 的任何一個字 ⇒ `findBackControl` 回 null ⇒ B 死鍵。
 * `busy` 刻意**沒有**退出控制項（`cancelPurchase` 在 busy 時拒絕），所以它的斷言
 * 是「⛔ 一個都沒有」—— 一條只驗「有」的守衛會放過「B 中斷了一筆在飛的交易」。
 *
 * 突變（2026-08-22，M1）：拿掉「太好了」那顆 `padBack` → 本檔紅並指名 done。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseDialog } from "./StoreScreen";
import { appStore } from "./store";
import { purchaseIdle, type PurchaseState } from "./purchase";

const ITEM = { kind: "champion", id: "x", name: "測試英雄", price: 1, currency: "crystal" } as const;
const WALLET = { crystal: 0, mcoin: 0, ownedChampions: [], ownedSkins: [], equippedSkins: {} };

function markup(purchase: PurchaseState): string {
  appStore.setState({ purchase });
  return renderToStaticMarkup(createElement(PurchaseDialog));
}

afterEach(() => appStore.setState({ purchase: purchaseIdle }));

describe("purchase dialog · B 鍵", () => {
  it("每一個可退出的相位都宣告了 data-pad-back，⛔ 而 busy 一個都沒有", () => {
    for (const p of [
      { phase: "confirm", item: ITEM },
      { phase: "done", item: ITEM, wallet: WALLET },
      { phase: "error", item: ITEM, code: "e", message: "壞了" },
    ] as PurchaseState[]) {
      expect(markup(p), p.phase).toContain("data-pad-back");
    }
    expect(markup({ phase: "busy", item: ITEM })).not.toContain("data-pad-back");
  });
});
