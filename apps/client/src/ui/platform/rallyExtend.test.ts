/**
 * ⭐ GH#573 —— owner 2026-08-23（[優先]）：
 * 「**邀請朋友的部分 除了可以等 10 秒、不等了以外，還可以選多等 1 分鐘**」
 *
 * 兩條斷言，兩個不同的缺陷：
 *  ① **「多等」真的是再喊一次**（同一條 `POST /rooms/{id}/rally`，waitSec 不同）。
 *     ⛔ 不可以只在主揪這一台把 `expiresAt` 加 60 秒 —— 截止時間是伺服器蓋的，
 *     大廳裡每一台的視窗都從那個時間算，只改自己那台＝「多等一分鐘的空房」。
 *  ② ⭐ **上一輪的計時器不可以把比賽開起來。** 再喊一次會留下前一個 `setTimeout`，
 *     而它的 `roomId` 一模一樣 —— 少了 `expiresAt` 的比對，按下「多等 1 分鐘」
 *     之後房間仍然會在第 10 秒開打，而畫面上寫著還有 55 秒。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const rallyRoom = vi.fn(async (_roomId: string, waitSec: number) => ({
  invited: 2,
  inLobby: 3,
  truncated: false,
  expiresAt: Date.now() + waitSec * 1000,
  waitSec,
}));
const startRoom = vi.fn(async () => ({ ok: true }));

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return { ...real, rallyRoom, startRoom };
});

const { appStore } = await import("./store");
const { rallyExtendLabel, DEFAULT_UI_CUES } = await import("@ggd/shared/content");

const ROOM = {
  room: { id: "r_x", name: "房", hostId: "me", status: "open" },
  members: [{ accountId: "me", ready: false, isHost: true, localPlayers: 1 }],
};

beforeEach(() => {
  vi.useFakeTimers();
  rallyRoom.mockClear();
  startRoom.mockClear();
  appStore.setState({ room: ROOM, rally: null } as never);
});
afterEach(() => vi.useRealTimers());

describe("主揪的「多等 1 分鐘」 (GH#573)", () => {
  it("再喊一次，而且上一輪的計時器⛔ 不會把比賽開起來", async () => {
    await appStore.getState().beginRally("r_x");
    const firstWait = rallyRoom.mock.calls[0]![1];
    expect(appStore.getState().rally?.roomId).toBe("r_x");

    await appStore.getState().extendRally(60);
    // ① 真的又喊了一次，而且窗口是新的那一個
    expect(rallyRoom).toHaveBeenCalledTimes(2);
    expect(rallyRoom.mock.calls[1]![1]).toBe(60);
    expect(rallyRoom.mock.calls[1]![1]).not.toBe(firstWait);

    // ② 舊窗口到期的那一刻 —— ⛔ 一場都不可以開起來
    await vi.advanceTimersByTimeAsync(firstWait * 1000 + 500);
    expect(startRoom).not.toHaveBeenCalled();
    expect(appStore.getState().rally).not.toBeNull();

    // ⋯而新的窗口到期時它照樣開得起來（⛔ 不是把整條倒數關掉）
    await vi.advanceTimersByTimeAsync(60_000);
    expect(startRoom).toHaveBeenCalledTimes(1);
  });

  it("⭐「有幾個選項」是資料，按鈕上的字由秒數推導", () => {
    // 出貨表就是 owner 說的那一個；加一個 5 秒的選項＝在 JSON 加一列，⛔ 不是改程式
    expect(DEFAULT_UI_CUES.rallyExtendSeconds).toContain(60);
    expect(rallyExtendLabel(60)).toBe("多等 1 分鐘");
    expect(rallyExtendLabel(120)).toBe("多等 2 分鐘");
    expect(rallyExtendLabel(5)).toBe("多等 5 秒");
  });
});
