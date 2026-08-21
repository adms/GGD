/**
 * 這一批手把可及性缺陷的**一條**守衛（GH#518 · #510 · #513），一票一個 `it`。
 * #523「結算起始焦點」開工前已經以 #528 落地（ecd3e81f），守衛在
 * `ui/panels/settlementStartFocus.test.ts`，⛔ 這裡不重寫第二條。
 *
 * ⭐ 承重的是第一條：沙發手把循環的清單**從後台白名單推導**。⛔ 不從
 * `Champions.ids()` 那份整份登錄表 —— 那裡面有下架的、變身態的第二具身體、
 * 沒被營運勾選的，按到那些的人送出去會被伺服器拒絕而畫面上什麼都不動（形態②）。
 * ⚠️ 夾具的變身態 id 從 `CHAMPION_FORM_PAIRS` **推導**，⛔ 不抄字面值。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHAMPION_FORM_PAIRS } from "@ggd/shared/content/championForms";
import { whitelistFromDoc } from "../ui/panels/champSelectFilter";
import {
  couchPickableIds,
  cycleCouchChampion,
  __resetCouchCursorsForTest,
} from "./couchChampSelect";
import { appStore } from "../ui/platform/store";
import { ErrorToast } from "../ui/platform/LobbyScreen";
import { __pollPadsForTest, __setLastUserInputAtForTest, lastUserInputAt } from "../ui/platform/userIdle";

const PAIR = CHAMPION_FORM_PAIRS[0]!;
const RETIRED = "godie-retired-fixture";

beforeEach(() => __resetCouchCursorsForTest());

describe("couch pad champ-select (GH#518)", () => {
  it("A/B 循環的清單是白名單推導的：下架/變身態/沒勾的都不在，B 是反方向", () => {
    // 營運勾了三個：本體、一個沒上架的、外加一個「只勾了變身態」的（要解析回本體）
    const wl = whitelistFromDoc({ champions: [PAIR.baseId, RETIRED, PAIR.alternateId] });
    const list = couchPickableIds(
      [PAIR.baseId, PAIR.alternateId, RETIRED, "godie-not-ticked"],
      wl,
      new Set([RETIRED]),
      new Set(),
    );
    // 變身態塌回本體 ⇒ 只剩一個 id，而下架與沒勾的都不見了
    expect(list).toEqual([PAIR.baseId]);
    expect(list).not.toContain(PAIR.alternateId);

    const two = [PAIR.baseId, "godie-second"];
    expect(cycleCouchChampion(2, 1, two)).toBe(two[0]); // 沒選過 → 第一隻
    expect(cycleCouchChampion(2, 1, two)).toBe(two[1]);
    expect(cycleCouchChampion(2, -1, two)).toBe(two[0]); // B 回得去（在此之前沒有回頭路）
    expect(cycleCouchChampion(3, 1, two)).toBe(two[0]); // 每支手把自己的游標
    expect(cycleCouchChampion(9, 1, [])).toBeNull(); // 空清單 ⇒ 不送，⛔ 不送空字串
  });
});

describe("純手把玩家不算掛機 (GH#510)", () => {
  it("動手把會蓋掉『最後一次使用者輸入』的時間戳", () => {
    const pads = [{ buttons: [{ pressed: false }], axes: [0, 0.1] }];
    vi.stubGlobal("navigator", { getGamepads: () => pads });
    try {
      __setLastUserInputAtForTest(1);
      __pollPadsForTest();
      expect(lastUserInputAt()).toBe(1); // 靜止的手把 ⛔ 不算「人在」（死區）
      pads[0]!.buttons[0]!.pressed = true;
      __pollPadsForTest();
      expect(lastUserInputAt()).toBeGreaterThan(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("錯誤提示關得掉 (GH#513)", () => {
  it("關閉是一顆真的 <button> 而且帶 data-pad-back", () => {
    appStore.setState({ lastError: "測試用錯誤" });
    const html = renderToStaticMarkup(createElement(ErrorToast));
    appStore.getState().clearError();
    expect(html).toContain("測試用錯誤");
    const btn = html.slice(html.indexOf("<button"));
    expect(btn.startsWith("<button")).toBe(true);
    expect(btn).toContain("data-pad-back");
  });
});
