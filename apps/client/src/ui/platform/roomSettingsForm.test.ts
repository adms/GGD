/**
 * 開房四格 (#288) 的客戶端守衛 —— **一條線**：房主留空的欄位不可以出現在送出
 * 的 payload 裡。
 *
 * 這是語意①（缺席 ≠ 重設）在客戶端唯一會壞的地方，而它壞掉的樣子是看不見的：
 * 一個空欄位送成 0，伺服器讀到的是「房主明確要 0 秒」，於是三個時間欄位被越界
 * 拒絕、`maxRounds` 被當成「不設限」—— 兩種都不是使用者的意思，而畫面上完全
 * 正常。所以斷言讀的是**真的會被 fetch 出去的那個 body**（store → apiFns 的
 * 接縫），不是表單狀態。
 *
 * ⛔ 這裡一個出貨值都不抄（20/320/25/180 有三個住處 + drift 測試在守）。驗的是
 * 「哪些 key 存在」，不是「值是多少」。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ROOM_SETTING_KEYS } from "@ggd/shared/roomSettings";

const createRoomApi = vi.fn(async (_body: Record<string, unknown>) => ({
  room: { id: "r1" },
  members: [],
}));

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return { ...real, createRoom: createRoomApi };
});

const { appStore } = await import("./store");
const { roomSettingsFromForm, EMPTY_ROOM_SETTINGS_FORM } = await import("./RoomListPanel");

/** 真的送出去的那個 body。 */
const sentBody = (): Record<string, unknown> => createRoomApi.mock.calls[0]![0];

describe("開房四格 (#288)：留空 = 缺席 = 用出貨值", () => {
  beforeEach(() => {
    createRoomApi.mockClear();
    appStore.setState({ room: null, lastError: null });
  });

  it("既有呼叫端不傳 settings → 四格一個 key 都不上路", async () => {
    await appStore.getState().createRoom("R", "normal", undefined, true);
    for (const key of ROOM_SETTING_KEYS) expect(sentBody()).not.toHaveProperty(key);
  });

  it("表單四格全留空 → 四格一個 key 都不上路（不是送 0）", async () => {
    await appStore
      .getState()
      .createRoom("R", "normal", undefined, true, roomSettingsFromForm(EMPTY_ROOM_SETTINGS_FORM));
    for (const key of ROOM_SETTING_KEYS) expect(sentBody()).not.toHaveProperty(key);
  });

  it("只填一格 → 只有那一格上路，其餘照樣缺席", async () => {
    const form = { ...EMPTY_ROOM_SETTINGS_FORM, combatMaxSec: "240" };
    await appStore.getState().createRoom("R", "normal", undefined, true, roomSettingsFromForm(form));
    expect(sentBody().combatMaxSec).toBe(240);
    for (const key of ROOM_SETTING_KEYS) {
      if (key !== "combatMaxSec") expect(sentBody()).not.toHaveProperty(key);
    }
  });

  it("非表單呼叫端給的 undefined 欄位也不上路（key 不可以存在）", async () => {
    await appStore
      .getState()
      .createRoom("R", "normal", undefined, true, { champSelectSec: undefined, maxRounds: 3 });
    expect(sentBody()).not.toHaveProperty("champSelectSec");
    expect(sentBody().maxRounds).toBe(3);
  });

  it("maxRounds 打 0 是「不設限」，和留空不是同一件事", async () => {
    const form = { ...EMPTY_ROOM_SETTINGS_FORM, maxRounds: "0" };
    await appStore.getState().createRoom("R", "normal", undefined, true, roomSettingsFromForm(form));
    expect(sentBody().maxRounds).toBe(0);
  });
});
