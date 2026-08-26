/**
 * GH#588 ② —— 房間的存活上限。owner 2026-08-23（逐字，⭐ 這是裁決）：
 *
 * > 每間房間存活時間只要開始進入戰鬥後，存活時間最多30分鐘，避免幽靈房間
 *
 * ⭐ 斷言的是**行為**：房要真的走到 `_dispose()` → `onDispose()` →
 * `roomRegistry.release()`，讀的是出貨登記表 `roomRegistry.active`，
 * ⛔ 不是「有沒有排一個 timer」那種掃屬性（失敗形態⑦）。
 *
 * ⭐ 突變點：把 `MatchRoom.loop` 裡的 `roomOutlivedCombatCap(...)` 那一段拿掉
 * ⇒ 時鐘跳過上限之後房間照樣活著 ⇒ 第二條紅。
 *
 * ⛔ 測試裡沒有抄 1800 —— 上限從 `DEFAULT_ROOM_COMBAT_MAX_SEC` 推導（第零守則：
 * 出貨數值住進測試就是第四個沒有守衛的住處）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TICK_MS } from "@ggd/shared/constants";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { roomRegistry } from "./roomRegistry";
import { accountRooms } from "./accountRooms";
import { Whitelist } from "../curation/whitelist";
import {
  DEFAULT_ROOM_COMBAT_MAX_SEC,
  resolveRoomCombatLifetime,
  roomOutlivedCombatCap,
} from "./roomLifetime";

const fakeClient = (sessionId: string): Record<string, unknown> => ({
  sessionId,
  userData: {},
  leave: vi.fn(),
  send: vi.fn(),
});

interface RoomHandle {
  onCreate(o: MatchRoomOptions): Promise<void>;
  onJoin(c: unknown, o: object): void;
  loop(dtMs: number): void;
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: unknown) => void;
  listing: unknown;
  _internalState: number;
  _events: { once(ev: string, fn: () => void): void };
  ctl: { world: { combatActive: boolean } };
}

async function openRoom(matchId: string): Promise<RoomHandle> {
  const room = new MatchRoom() as unknown as RoomHandle;
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  room.listing = { remove: (): void => {}, save: async (): Promise<void> => {} };
  await room.onCreate({ matchId, seed: 1, whitelist: Whitelist.allowAll(), combatEnv: {} });
  room._internalState = 1;
  return room;
}

const closedWithin = (room: RoomHandle, ms = 500): Promise<void> =>
  new Promise<void>((resolve) => {
    const bail = setTimeout(resolve, ms);
    room._events.once("disconnect", () => {
      clearTimeout(bail);
      resolve();
    });
  });

beforeEach(() => accountRooms.reset());
afterEach(() => vi.restoreAllMocks());

describe("進入戰鬥後的房間存活上限 (GH#588 ②)", () => {
  it("邊界：還沒打起來（`combatSinceMs === null`）永遠不收房 —— 選角慢的房不會被這條殺掉", () => {
    const rules = resolveRoomCombatLifetime();
    expect(rules.enabled).toBe(true); // 出貨預設就是開著的（缺席 = 開）
    const huge = rules.maxSec * 1000 * 100;
    expect(roomOutlivedCombatCap(rules, null, huge)).toBe(false);
    // 上限**之前**不收、上限**當下**收 —— 兩邊一起釘，少一邊就分不出「永遠不收」
    expect(roomOutlivedCombatCap(rules, 0, rules.maxSec * 1000 - 1)).toBe(false);
    expect(roomOutlivedCombatCap(rules, 0, rules.maxSec * 1000)).toBe(true);
  });

  it("⭐ 承重：打起來之後把牆上時鐘推過上限 ⇒ 房間真的被收掉（練習房也走這條）", async () => {
    const base = roomRegistry.active;
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const room = await openRoom("room-lifetime");
    room.onJoin(fakeClient("s-life"), { accountId: "acc-life" });

    // 真的把房間開到戰鬥 —— ⛔ 不手寫 `combatActive = true`（失敗形態⑤：
    // 那會驗到一個虛構的通道，而武裝那一行讀的正是出貨的這個欄位）。
    for (let i = 0; i < 40_000 && !room.ctl.world.combatActive; i++) room.loop(TICK_MS);
    expect(room.ctl.world.combatActive).toBe(true);

    // ⛔ 對照：上限**之前**這間房是活著的。少了這一條，下面那一條對
    // 「房間因為別的理由收掉了」也會過（失敗形態④）。
    room.loop(TICK_MS);
    expect(roomRegistry.active).toBeGreaterThan(base);

    now += (DEFAULT_ROOM_COMBAT_MAX_SEC + 1) * 1000;
    const closed = closedWithin(room);
    room.loop(TICK_MS);
    await closed;

    expect(roomRegistry.active).toBe(base);
  });
});
