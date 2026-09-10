import { describe, expect, it } from "vitest";
import { makeWorld } from "../testkit/world";
import { applyItemPick, type ItemOffer } from "./draft";
import { grantItemFree } from "./shop";
import { Items } from "../content/registry";

/**
 * ⭐⭐ GH#1110 B —— 「背包滿的時候可以賣掉一件換上新的」。
 *
 * ⚠️ ⭐ 出貨 `legendaryShelf.swapWhenFull = false` 是**刻意**的：
 *   它改變的是一場比賽的取捨（「先想清楚再拿」vs「隨時可換」）——
 *   ⛔ 那是 owner 的設計決定，⛔ 不是我能引用得到原話的東西（第一守則）。
 *   ⇒ 開關先接好，⭐ 而**兩條路都要驗**（第〇·六守則：只測預設那一邊 ⇒
 *     這裡預設是 false，⛔ 所以「關著時不換」才是承重的那一條）。
 */

function fillInventory(world: ReturnType<typeof makeWorld>, id: number): number {
  const ids = [...Items.all().keys()];
  let n = 0;
  for (const item of ids) {
    if (grantItemFree(world, id as never, item as never) < 0) break;
    n++;
  }
  return n;
}

describe("背包滿時的三選一（GH#1110 B）", () => {
  it("⭐ 量尺先自證：真的把背包塞滿了", () => {
    const w = makeWorld();
    const champ = [...w.entities.keys()][0]!;
    const n = fillInventory(w, champ as never);
    expect(n, "⛔ 一件都放不進去 ⇒ 這把尺是瞎的").toBeGreaterThan(0);
    const more = [...Items.all().keys()].find((i) => grantItemFree(w, champ as never, i as never) >= 0);
    expect(more, "⛔ 還放得進去 ⇒ 背包沒滿").toBeUndefined();
  });

  it("① 開關**關著**（出貨值）⇒ ⛔ 不換，卡片留著（⭐ 承重的那一條）", () => {
    const w = makeWorld();
    const champ = [...w.entities.keys()][0]!;
    fillInventory(w, champ as never);
    const pick = [...Items.all().keys()][0]!;
    const offer = { entity: champ, choices: [pick], picked: null } as unknown as ItemOffer;
    expect(w.legendaryShelf.swapWhenFull, "⛔ 出貨值變了 —— 這條測的是預設那一邊").toBe(false);
    expect(applyItemPick(w, offer, pick as never, 0)).toBe("no-slot");
    expect(offer.picked, "⛔ 機會被吃掉了").toBeNull();
  });

  it("② 開關**打開** ⇒ ⭐ 賣掉指定那一格並換上（⛔ 證明①不是「永遠不換」）", () => {
    const w = makeWorld();
    const champ = [...w.entities.keys()][0]!;
    fillInventory(w, champ as never);
    w.legendaryShelf = { ...w.legendaryShelf, swapWhenFull: true };
    const pick = [...Items.all().keys()].at(-1)!;
    const offer = { entity: champ, choices: [pick], picked: null } as unknown as ItemOffer;
    expect(applyItemPick(w, offer, pick as never, 0)).toBe("ok");
    expect(offer.picked, "⛔ 換成功了而卡片沒記錄").toBe(pick);
  });
});
