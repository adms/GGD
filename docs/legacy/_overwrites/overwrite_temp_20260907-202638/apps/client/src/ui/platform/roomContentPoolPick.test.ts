/**
 * @vitest-environment jsdom
 *
 * ⭐⭐ GH#1025 Scope C 的最後一段 —— **開房的人選得到內容池**。
 *
 * ── ⛔ 在此之前斷在哪裡（兩個斷點，兩個都是失敗形態②）────────────────────────
 * `contentPool` 底下每一層都好了：schema 收得下 · Go 透明轉送 ·
 * `sanitizeRoomSettings` 認得 · `MatchRoom` 讀它並切白名單 · 出身住耐久覆蓋層。
 * ⛔ 而**沒有任何一條路可以送出那個值**：
 *   ① 客戶端開房表單照 `ROOM_SETTING_KEYS`（只有數字）產生 ⇒ 畫面上沒有那一格；
 *      就算硬塞進表單狀態，`store.presentRoomSettings` 也照同一張表把它濾掉。
 *   ② `apps/game-server/src/index.ts` 的 `/_internal/matches` **逐格列名**轉送
 *      四格數字 ⇒ Go 送到了，而它在那道門口消失。
 * ⇒ ⭐ 兩個斷點都是「一行接線」病，⛔ 而修法不是補那兩行（下一格列舉設定會再斷
 *   一次）—— 是讓兩處都照 `ROOM_SETTING_FIELDS` **推導**。
 *
 * ── ⭐ 為什麼這一支跑真的畫面、⛔ 不自己造 payload（失敗形態⑤）──────────────
 * 斷言讀的是**真的會被 fetch 出去的那個 body**（`./api` 的接縫），而那個 body
 * 接著被餵進**出貨路上下一站的兩支真函式**：
 *
 *   真的 `<select>` → 真的 store → 真的 wire body
 *      → `forwardRoomSettings()`   ← `index.ts` 的 `/_internal/matches` 用的同一支
 *      → `sanitizeRoomSettings()`  ← `MatchRoom.onCreate` 用的同一支
 *      → `settings.contentPool`    ← `MatchRoom.buildMatch` 餵給 `applyContentPool` 的那一格
 *
 * ⛔ 這一支**不**斷言白名單真的少了那隻英雄 —— 那一段（`applyContentPool` →
 * `ctl.whitelist`）由 `apps/game-server/src/curation/communityRoomPool.test.ts`
 * 走真的 `MatchRoom.onCreate` 釘住，⛔ 跨 package 再跑一次是同一件事做兩遍。
 * ⇒ 這一支負責的是**它前面那一整段**，也就是在此之前完全沒有守衛的那一段。
 *
 * ── ⭐ 兩個方向（⛔ 只驗一邊 ＝ 一把單邊的尺）────────────────────────────────
 * · 選了社群池 ⇒ `contentPool: "community"` 一路到得了 `MatchRoom` 讀的那一格
 * · 沒碰它     ⇒ 那個鍵**根本不在 body 裡**（缺席 ≠ 重設）⇒ 落回 `official`
 *
 * ── 🧬 突變（真的跑過，⛔ 不是打算做）────────────────────────────────────────
 *  ① `store.ts` 的 `presentRoomSettings` 迴圈改回 `ROOM_SETTING_KEYS`
 *     ⇒ 🔴「⛔ 房主選了社群池，而它沒有上路」
 *  ② `RoomListPanel` 的表單改回照 `ROOM_SETTING_KEYS` 產生
 *     ⇒ 🔴「⛔ 開房表單裡沒有 contentPool 這一格」
 *  ③ `index.ts` 的 `...forwardRoomSettings(body)` 改回逐格列名的四格數字
 *     ⇒ 🔴「⛔ contentPool 在 /_internal/matches 那道門口被丟掉」
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DEFAULT_CONTENT_POOL,
  forwardRoomSettings,
  minCombatMaxSecFor,
  sanitizeRoomSettings,
} from "@ggd/shared/roomSettings";

/** 唯一的接縫：平台。⛔ 沒有任何 fetch 真的發生。 */
const createRoomApi = vi.fn(async (_body: Record<string, unknown>) => ({
  room: { id: "r1", name: "R", hostId: "me", status: "open" },
  members: [{ accountId: "me", ready: false, isHost: true, localPlayers: 1 }],
}));
const rallyRoomApi = vi.fn(async () => ({
  invited: 0,
  inLobby: 1,
  truncated: false,
  expiresAt: Date.now() + 10_000,
  waitSec: 10,
}));

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return {
    ...real,
    createRoom: createRoomApi,
    rallyRoom: rallyRoomApi,
    listOpenRooms: async () => ({ rooms: [] }),
  };
});

const { appStore } = await import("./store");
const { RoomListPanel } = await import("./RoomListPanel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** 開到「Create room」對話框為止 —— 走真的按鈕，⛔ 不直接 render 對話框。 */
async function openCreateDialog(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(RoomListPanel));
  });
  const open = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes("Create room"),
  );
  expect(open, "⛔ 找不到「Create room」按鈕").toBeTruthy();
  await act(async () => {
    open!.click();
  });
}

/** 按下 Create，等 store 那一輪跑完。 */
async function pressCreate(): Promise<void> {
  const create = [...container.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === "Create",
  );
  expect(create, "⛔ 找不到 Create 按鈕").toBeTruthy();
  await act(async () => {
    create!.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** 真的被送上線的那個 body。 */
const sentBody = (): Record<string, unknown> => createRoomApi.mock.calls[0]![0];

/**
 * ⭐ 出貨路上的下一站，逐字：Go 只是透明轉送，所以 wire body 進 game-server 之後
 * 先過 `forwardRoomSettings`（`/_internal/matches`），再過 `sanitizeRoomSettings`
 * （`MatchRoom.onCreate`）。回傳的正是 `buildMatch` 餵給 `applyContentPool` 的那一格。
 */
function poolTheMatchWouldRunOn(body: Record<string, unknown>): string {
  const options = forwardRoomSettings(body);
  const clean = sanitizeRoomSettings(options, minCombatMaxSecFor(undefined));
  expect(clean.rejected, "⛔ 出貨表單送出去的東西被權威那一道拒絕了").toEqual([]);
  return clean.settings.contentPool ?? DEFAULT_CONTENT_POOL;
}

describe("GH#1025 Scope C —— 開房表單選得到內容池，而且那個選擇到得了對局", () => {
  beforeEach(() => {
    createRoomApi.mockClear();
    rallyRoomApi.mockClear();
    appStore.setState({ room: null, lastError: null });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("★★ ⭐ 表單長得出 `contentPool` 這一格 —— 而且它是**選單**不是數字框", async () => {
    await openCreateDialog();
    const el = container.querySelector('[data-ggd-room-setting="contentPool"]');
    expect(el, "⛔ 開房表單裡沒有 contentPool 這一格").toBeTruthy();
    expect(el!.tagName, "⛔ 列舉欄位被畫成數字輸入框了").toBe("SELECT");
    // 允許值來自契約，⛔ 不是這裡抄的；空值那一筆是「留空 = 缺席」。
    const values = [...(el as HTMLSelectElement).options].map((o) => o.value);
    expect(values).toContain("");
    expect(values).toContain("community");
    expect((el as HTMLSelectElement).value, "⛔ 表單不可以預先幫房主選一個值").toBe("");
  });

  it("★★ ⭐ 選了社群池 ⇒ 這一場真的跑在 `community` 上（走真的 body）", async () => {
    await openCreateDialog();
    const sel = container.querySelector<HTMLSelectElement>(
      '[data-ggd-room-setting="contentPool"]',
    )!;
    await act(async () => {
      sel.value = "community";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sel.value, "React 沒有收下這個選擇（controlled input）").toBe("community");

    await pressCreate();
    expect(createRoomApi, "⛔ 開房請求根本沒有送出去").toHaveBeenCalledTimes(1);
    expect(sentBody().contentPool, "⛔ 房主選了社群池，而它沒有上路").toBe("community");
    expect(poolTheMatchWouldRunOn(sentBody())).toBe("community");
  });

  it("★★ ⭐ 沒碰它 ⇒ 那個鍵**不在** body 裡（缺席 ≠ 重設）⇒ 落回官方池", async () => {
    await openCreateDialog();
    await pressCreate();
    expect(createRoomApi).toHaveBeenCalledTimes(1);
    expect(sentBody(), "⛔ 房主沒選，而客戶端替他明確送了一個值").not.toHaveProperty(
      "contentPool",
    );
    expect(poolTheMatchWouldRunOn(sentBody())).toBe("official");
  });
});
