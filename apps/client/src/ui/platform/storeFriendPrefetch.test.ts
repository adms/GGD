/**
 * @vitest-environment jsdom
 *
 * ⭐ GH#537 ② —— 「**沒有提前在商店完成讀取**」（owner 2026-08-22）。
 *
 * ⛔ 不是一條「`refreshFriends()` 會發 GET」的測試 —— 那種測試對一個**根本沒把它
 * 接進商店**的版本是全綠的（失敗形態③），而那個版本在畫面上逐像素相同。
 * ⇒ 掛的是**出貨的 `StoreScreen`**，只換掉 3D 預覽（Babylon 在 jsdom 起不來，
 *   而它與這條規則無關），斷言讀的是真的被呼叫的那個 store action。
 *
 * ⛔ 不驗任何數字（輪詢週期住 `FriendsPanel`，排序住 `friendOrder`）。
 *
 * 突變（2026-08-22）：`StoreScreen` 那段 `void refreshFriends()` 換成 `void 0` → 紅。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("./StorePreviewCanvas", () => ({ StorePreviewCanvas: () => null }));

const { StoreScreen } = await import("./StoreScreen");
const { appStore } = await import("./store");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let calls: number;
let realRefresh: () => Promise<void>;

beforeEach(() => {
  calls = 0;
  realRefresh = appStore.getState().refreshFriends;
  appStore.setState({ refreshFriends: async () => void (calls += 1) });
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  appStore.setState({ refreshFriends: realRefresh });
  vi.restoreAllMocks();
});

describe("商店 · 好友清單預取（GH#537②）", () => {
  it("⭐ 一進商店就抓,⛔ 不是等回大廳把面板掛起來才抓", async () => {
    await act(async () => root.render(createElement(StoreScreen)));
    expect(calls).toBe(1);
  });
});
