/**
 * @vitest-environment jsdom
 *
 * GH#491 — 建房之後那個「充滿一堆 id」的下拉不可以長回來。
 *
 * owner 2026-08-21:「創建房間後底下有個選單 充滿一堆 id 那是什麼不明的東西？
 * 沒用的話請拿掉」。那是 RoomView 的英雄預選 `<select>`：它把 `catalog.champions`
 * 整份倒出來，label 印**原始 id**（實測 71 筆 `godie-*`），而選了之後只會寫進
 * redis 給一道從這個 UI 永遠觸發不了的持有權閘 —— 從來沒有送到遊戲伺服器。
 * 完整的拆解寫在 RoomView.tsx 的檔頭。
 *
 * ⚠️ 這條刻意**掛真的元件**而不是掃原始碼字串（失敗形態⑥）：掃字串的版本在
 * 「有人用 `<datalist>` / 一排按鈕把同一份 id 再倒一次」時照樣是綠的。這裡問的
 * 是玩家眼睛看得到的那件事 —— 房間頁上有沒有出現任何一個英雄 id。
 */
import { describe, it, expect, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";

const ROOM = {
  room: {
    id: "r_491",
    name: "probe room",
    hostId: "acct_1",
    mapId: "arena.skeleton",
    mode: "PairedDuels",
    botDifficulty: "normal",
    status: "open",
    createdAt: 0,
  },
  members: [{ accountId: "acct_1", ready: false, isHost: true, localPlayers: 1 }],
};

/** 兩筆就夠：一筆免費（以前可選）、一筆上鎖（以前 disabled 但照樣印 id）。 */
const CATALOG = {
  champions: [
    { id: "godie-e002", price: 0, owned: true },
    { id: "godie-zombiex", price: 300, owned: false },
  ],
  skins: [],
};

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return {
    ...real,
    joinRoom: async () => ROOM,
    getRoom: async () => ROOM,
    chatHistory: async () => ({ messages: [] }),
    getCatalog: async () => CATALOG,
  };
});

const { appStore } = await import("./store");
const { RoomView } = await import("./RoomView");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom 沒有 Element.prototype.scrollTo（聊天視窗捲到底會用到）。這是 jsdom 的
// 缺口,不是產品缺陷 —— 補一顆空的,讓掛載走完真的那條 effect。
Element.prototype.scrollTo ??= (): void => {};

describe("GH#491 the room page prints no champion ids", () => {
  it("renders the room, and not one catalog id anywhere in it", async () => {
    await appStore.getState().refreshCatalog();
    await appStore.getState().joinRoom(ROOM.room.id);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(RoomView));
    });
    const text = container.textContent ?? "";

    // 反空轉：房間真的畫出來了,而且目錄真的有 id 可以被印錯 —— 否則下面那條
    // 在 RoomView 回 null 或目錄是空的時候會無意義地綠。
    expect(text).toContain(ROOM.room.name);
    expect(appStore.getState().catalog?.champions.length).toBeGreaterThan(0);

    for (const c of appStore.getState().catalog?.champions ?? []) {
      expect(text).not.toContain(c.id);
    }

    await act(async () => root.unmount());
    container.remove();
  });
});
