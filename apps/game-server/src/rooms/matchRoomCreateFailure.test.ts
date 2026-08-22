/**
 * GH#595 —— `onCreate` 在 `tryAcquire()` 之後丟例外時，房間名額**永遠不歸還**，
 * 而且 `__init()` 留下的 broadcast timer 永遠不會被 `clearInterval`。
 *
 * 根因逐字讀自 Colyseus 0.16.24 的 `MatchMaker.handleCreateRoom`：
 * `room._events.once("dispose", …)` 掛在 `await room.onCreate()` **成功之後**，
 * 所以一個丟出去的 onCreate ⇒ `_dispose()` / `onDispose()` 永遠不跑。
 *
 * ⭐ 突變點：把 `releaseRoomResources()` 裡的 `roomRegistry.release()` 拿掉
 * ⇒ active 1→2→…→6，紅；把 `patchRate = null` 那一行拿掉 ⇒ 第二條紅
 * （broadcast timer 還在跑）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { roomRegistry } from "./roomRegistry";
import { MatchStatsRecorder } from "../analytics/Recorder";
import { Whitelist } from "../curation/whitelist";

interface RoomHandle {
  onCreate(o: MatchRoomOptions): Promise<void>;
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: unknown) => void;
  broadcastPatch(): boolean;
  listing: unknown;
  clock: { stop(): void };
  _autoDisposeTimeout?: NodeJS.Timeout;
  __init(): void;
}

const OPTIONS = (): MatchRoomOptions => ({
  matchId: "create-fail",
  seed: 1,
  whitelist: Whitelist.allowAll(),
  combatEnv: {},
});

afterEach(() => vi.restoreAllMocks());

describe("建房丟例外時的收尾 (GH#595)", () => {
  it("6 次失敗的 create：名額每一次都回到起點，broadcast timer 也停了", async () => {
    const base = roomRegistry.active;
    // `tryAcquire()` 之後的一個真的 await 站點（`buildMatch` 無條件呼叫它）。
    vi.spyOn(MatchStatsRecorder, "open").mockRejectedValue(new Error("注入：開統計檔失敗"));

    const rooms: RoomHandle[] = [];
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const room = new MatchRoom() as unknown as RoomHandle;
      room.setSimulationInterval = (): void => {};
      room.onMessage = (): void => {};
      room.listing = { remove: (): void => {}, save: async (): Promise<void> => {} };
      room.__init(); // matchMaker 在 onCreate **之前**做的事 —— 它就是那顆 timer 的來源
      await expect(room.onCreate(OPTIONS())).rejects.toThrow();
      seen.push(roomRegistry.active - base);
      clearTimeout(room._autoDisposeTimeout); // 這一支不跑 Colyseus 的回收器
      rooms.push(room);
    }
    expect(seen).toEqual([0, 0, 0, 0, 0, 0]);

    // 那顆 timer 是**行為**：等幾個 patch 週期（onCreate 失敗前 patchRate 已經
    // 設成 1000/snapshotHz ≈ 33ms），沒被清掉的話這裡會被叫好幾次。
    const spies = rooms.map((r) => vi.spyOn(r, "broadcastPatch").mockReturnValue(false));
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const r of rooms) r.clock.stop();
  });
});
