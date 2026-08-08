/**
 * 快照上的具名計數器真的畫得出來(GH#304)—— 體驗層,一條薄守衛,不開對抗輪。
 *
 * 承重的是①:**沒有任何事件**進過 store,只有快照 —— 那正是重連/中途加入的
 * 客戶端。舊的 `markBar.test.ts` 走事件路徑,它對「只發事件」的方案也是綠的,
 * 所以它一個人證明不了 owner 選欄位換到了什麼。
 *
 * ⚠️ 零出貨數值:層數用 5/0 這種任意數,不是十二道試煉的 12。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { hudStore, resetHudStore } from "../../net/RoomStore";
import { markRows, markViewsFromWire } from "./markModel";

const MARK = "godie-test.passive";
const NAME = "試煉";

beforeEach(() => {
  resetHudStore();
  Abilities.register(MARK as AbilityId, { id: MARK, name: NAME } as never);
});

describe("計數器 快照 → 螢幕", () => {
  it("★ ① 沒收過任何事件,光靠快照就畫得出層數,而且名字來自文件不是裸 id", () => {
    // store 的 marks 是空的 —— 這就是一個剛連上的客戶端。
    expect(hudStore.getState().marks).toEqual([]);
    const rows = markRows(markViewsFromWire([MARK], [5], hudStore.getState().marks), 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(5);
    expect(rows[0]!.label).toBe(NAME); // #202「商店顯示 raw item ID」的同型缺陷
  });

  it("★ ② 0 層畫得出來,而且標成「空了」——不是整列消失", () => {
    const rows = markRows(markViewsFromWire([MARK], [0], []), 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(0);
    expect(rows[0]!.empty).toBe(true);
  });

  it("★ ③ 免死閃動仍然來自事件,而層數仍然來自快照(兩條線各管各的)", () => {
    // 事件說 9 層 + 剛剛免死;快照說 4 層。數字要聽快照的(它才是權威),
    // 閃動要聽事件的(快照上沒有「剛剛」這個概念)。
    const flashes = [{ markId: MARK, count: 9, seq: 3, savedAtMs: 1000 }];
    const rows = markRows(markViewsFromWire([MARK], [4], flashes), 1100);
    expect(rows[0]!.count).toBe(4);
    expect(rows[0]!.saving).toBe(true);
  });

  it("★ ④ 兩條陣列對不齊的那一筆丟掉,不畫一個沒有數字的計數器", () => {
    // 投影缺陷,不是計數器。跟 selfStatusModel 對「有 tick 沒 id」的處理一致。
    expect(markViewsFromWire([MARK, "other"], [4], [])).toHaveLength(1);
    expect(markViewsFromWire(undefined, undefined, [])).toEqual([]);
  });
});
