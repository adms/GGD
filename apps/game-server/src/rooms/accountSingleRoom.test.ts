/**
 * GH#588 —— 一個帳號同時只能在一間房，離開時 ⛔ 不讓 AI 接管，選角結束時沒有
 * 真人就收房。
 *
 * owner 2026-08-23（逐字，⭐ 這是裁決）：
 * > 「限制一名玩家同時最多只能在一個房間，如果有玩家馬上 kill AI」
 *
 * ── 為什麼要真的把 Colyseus 的收房路徑接起來 ─────────────────────────────
 * 「活著的房間數」不是一個屬性，是一個**行為**：房要真的走到 `_dispose()` →
 * `onDispose()` → `roomRegistry.release()`。所以這一支給每一間房補上 matchMaker
 * 平常做的那兩件事（`listing` 與 `_internalState = CREATED`），其餘全部是出貨的
 * 那一份 —— 斷言讀的是出貨登記表 `roomRegistry.active`，⛔ 不是「presence 裡有
 * 那個 key」那種掃屬性（失敗形態⑦）。
 *
 * ⭐ 突變點：拿掉 `MatchRoom.onJoin` 裡的 `previousRoom.evictAccount(accountId)`
 * ⇒ 每換一間房就多一間活著的 ⇒ 房間數曲線變成 1,2,3,4,5,6,7。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TICK_MS } from "@ggd/shared/constants";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { roomRegistry } from "./roomRegistry";
import { accountRooms } from "./accountRooms";
import { Whitelist } from "../curation/whitelist";

interface FakeClient {
  sessionId: string;
  userData: Record<string, unknown>;
  leave: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}
const fakeClient = (sessionId: string): FakeClient => ({
  sessionId,
  userData: {},
  leave: vi.fn(),
  send: vi.fn(),
});

/** 這一支驅動到的 MatchRoom 成員，繞開 Colyseus 的多載簽章。 */
interface RoomHandle {
  onCreate(o: MatchRoomOptions): Promise<void>;
  onJoin(c: FakeClient, o: object): void;
  onLeave(c: FakeClient, consented: boolean): Promise<void>;
  loop(dtMs: number): void;
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: unknown) => void;
  seatBySession: Map<string, number>;
  humanDrivers: Map<number, unknown>;
  listing: unknown;
  _internalState: number;
  _events: { once(ev: string, fn: () => void): void };
  ctl: { seats: Map<number, { driverKind: string; applyPendingDriver(): boolean }> };
}

/** 出貨的 `MatchRoom`，補上 matchMaker 平常做的那兩件事。 */
async function openRoom(matchId: string, seats?: MatchRoomOptions["seats"]): Promise<RoomHandle> {
  const room = new MatchRoom() as unknown as RoomHandle;
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  room.listing = { remove: (): void => {}, save: async (): Promise<void> => {} };
  await room.onCreate({ matchId, seed: 1, whitelist: Whitelist.allowAll(), combatEnv: {}, seats });
  room._internalState = 1; // RoomInternalState.CREATED —— matchMaker 在 onCreate 之後設的
  return room;
}

/**
 * 等這間房自己走完收房。⚠️ **有上限**是刻意的：無上限的等待在壞掉那一側只會
 * 得到「Test timed out」，⛔ 那句話不指名任何東西。有上限的話，壞掉那一側會走到
 * 下面的房間數曲線斷言，訊息長成 `[1, 2, 3, …]` —— 一眼看得出多了幾間幽靈房。
 */
const closedWithin = (room: RoomHandle, ms = 250): Promise<void> =>
  new Promise<void>((resolve) => {
    const bail = setTimeout(resolve, ms);
    room._events.once("disconnect", () => {
      clearTimeout(bail);
      resolve();
    });
  });

beforeEach(() => accountRooms.reset());

describe("一個帳號只能在一間房 (GH#588)", () => {
  it("⭐ 換 6 次房之後，活著的房間數**永遠是 1**", async () => {
    const base = roomRegistry.active;
    const account = "acc-ghost";

    let current = await openRoom("room-0");
    current.onJoin(fakeClient("s-0"), { accountId: account });
    const curve: number[] = [roomRegistry.active - base];

    for (let i = 1; i <= 6; i++) {
      const next = await openRoom(`room-${i}`);
      const oldRoomClosed = closedWithin(current);
      next.onJoin(fakeClient(`s-${i}`), { accountId: account });
      await oldRoomClosed; // 舊房自己走完 disconnect → _dispose → onDispose
      curve.push(roomRegistry.active - base);
      current = next;
    }

    // ⛔ 不是「小於某個門檻」—— 逐輪都必須剛好 1
    expect(curve).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(accountRooms.size).toBe(1);
  });

  it("玩家離開時座位**不交給 AI** —— 沒有排任何 driver 交接", async () => {
    const room = await openRoom("room-idle");
    const client = fakeClient("s-idle");
    room.onJoin(client, { accountId: "acc-idle" });
    const seatId = [...room.seatBySession.values()][0]!;
    const seat = room.ctl.seats.get(seatId)!;
    seat.applyPendingDriver(); // ← tick 邊界：onJoin 排的那次「人類接手」生效
    expect(seat.driverKind).toBe("human");

    await room.onLeave(client, true); // 自願離開 → 不開重連窗口

    // `setDriver` 是**排程**（下一個 tick 邊界才換），所以離開之後馬上讀
    // `driverKind` 兩種實作都會是 "human"（失敗形態④）。要問的是
    // 「離開有沒有**排**一次交接」——舊行為排的是 `new AIDriver()`。
    expect(seat.applyPendingDriver()).toBe(false);
    expect(seat.driverKind).toBe("human");
    expect(room.humanDrivers.size).toBe(0); // 也沒有人在收他的輸入
  });

  it("選角結束時房裡沒有真人 → 收房（⛔ 不自動配 12 個英雄打完一整場）", async () => {
    const base = roomRegistry.active;
    const room = await openRoom("room-abandoned", [
      { seatId: 0, teamId: 0, accountId: "never-arrives-a", displayName: "A" },
      { seatId: 3, teamId: 1, accountId: "never-arrives-b", displayName: "B" },
    ]);
    const closed = closedWithin(room, 2000);
    for (let i = 0; i < 2400 && roomRegistry.active > base; i++) room.loop(TICK_MS);
    await closed;
    expect(roomRegistry.active).toBe(base);
  });
});
