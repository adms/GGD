/**
 * @vitest-environment jsdom
 *
 * ⭐ GH#537 ② —— 「**沒有提前在商店完成讀取**」（owner 2026-08-22）。
 *
 * ---- 為什麼這一條非掛出貨元件不可 -------------------------------------------
 * 這張票的行為是「玩家**什麼都沒按**，而好友清單在他還在逛商店的時候就到手了」。
 * 一條只驗 `refreshFriends()` 會發 GET 的測試，對一個**根本沒把它接進商店**的
 * 版本是全綠的（CLAUDE.md 失敗形態③：可以從渲染樹刪掉而測試全綠）——
 * 而那個版本在畫面上跟正確的版本**逐像素相同**：商店長得一模一樣，只有回大廳
 * 那一刻的那句「讀取朋友清單中…」不一樣。
 * ⇒ 這裡掛的是**出貨的 `StoreScreen`**，換掉的只有 3D 預覽（Babylon 在 jsdom 起不來，
 *   而它與這條規則無關），斷言讀的是**真的被呼叫的那個 store action**。
 *
 * ⛔ 不驗抓幾次以外的任何數字（輪詢週期住 `FriendsPanel`，清單排序住 `friendOrder`）。
 *
 * 突變（2026-08-22）：把 `StoreScreen` 裡那段 `useEffect(() => { void refreshFriends(); })`
 * 整段刪掉 → 本檔第一條紅（`expect(calls).toBe(1)` 收到 0）。
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
  appStore.setState({
    refreshFriends: async () => {
      calls += 1;
    },
  });
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

  it("⚠️ 逛商店期間的 re-render 不再抓第二次（即時上下線靠 WS 推播）", async () => {
    await act(async () => root.render(createElement(StoreScreen)));
    await act(async () => appStore.setState({ wallet: { crystal: 1, mcoin: 0, ownedChampions: [], ownedSkins: [], equippedSkins: {} } }));
    expect(calls).toBe(1);
  });
});
