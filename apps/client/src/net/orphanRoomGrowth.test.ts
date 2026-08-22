/**
 * ⭐【離開落在 join 的窗口裡】GH#570 —— owner 2026-08-23 的
 * 「離開房間，進到練習模式，還是會有**隱形的英雄在攻擊我、喊出語音、特效、給我傷害**」。
 *
 * ── 根因（端到端量到的，⛔ 不是推論）────────────────────────────────────────
 * `RoomConnection.leave()` 做的是 `void this.room?.leave(true)`，而 `this.room`
 * 要等 `await client.create(...)` 回來、`bind()` 跑完才有值 ⇒ **離開落在 join 的
 * 窗口裡時，`leave()` 靜靜什麼都沒做**，接著 `bind()` 把 4 個 onMessage ＋ socket
 * 接上一條**已經死掉的連線**。而 `main.tsx` 的 `const join = app.connect();`
 * **從來不 await** ⇒ `stopMatch()` 可以落在那個 await 的任何一刻。
 *
 * 那間幽靈房不會消失（伺服器的 autoDispose 只在 `clients.length === 0` 觸發，
 * 而幽靈 client 永遠不離開），320 秒後它的 champSelect 到期 → `autoPickAndSpawn()`
 * → **我的座位被 AI 接管** → 那個「我」繼續打繼續挨打，而它的 HP 每 20 Hz
 * 覆寫**模組層全域** `hudStore` ⇒ 玩家在**練習模式畫面**上看到自己的血條被
 * 一個看不見的東西打到 0。
 *
 * ⭐ 而它與 LAG 是**正回饋**：主執行緒每幀被卡 0 / 60 / 250 / 800 ms 時，
 * join 的窗口是 **31 / 370 / 1,511 / 4,817 ms** —— 越 LAG 越容易再生一間幽靈房，
 * 每一間又是一條 20 Hz socket ＋ 伺服器 30 tick/s。
 *
 * ── ⚠️ 為什麼既有的 `teardown.test.ts` 結構上看不到它 ─────────────────────
 * 它用 `attach(conn, fakeRoom)` **直接把 room 塞進去**（＝預設 join 已經落地），
 * 而且它斷言的 `expect(conn.room).toBeNull()` 在洩漏發生時**也是真的**
 * （`leave()` 設 null，`bind()` 又設回來）。⇒ 這條守衛必須走**真的 connect 路徑**。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1（承重）`RoomConnection.bind()` 第一行的 `if (this.disposed) { … return; }`
 *    拿掉 ⇒ 🔴 第 2 輪紅：沒被 leave 的房 1 → 2 → 3 …（線性）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { RoomConnection } from "./RoomConnection";
import { perfBus } from "../perfBus";

interface FakeRoom {
  left: boolean;
  handlers: number;
  roomId: string;
  onMessage(): void;
  onLeave(): void;
  onStateChange(): void;
  leave(): Promise<number>;
  send(): void;
  state: unknown;
}

const born: FakeRoom[] = [];

function makeRoom(id: number): FakeRoom {
  const r: FakeRoom = {
    left: false,
    handlers: 0,
    roomId: `ghost-${id}`,
    onMessage: () => void r.handlers++,
    onLeave: () => void r.handlers++,
    onStateChange: () => void r.handlers++,
    leave: () => ((r.left = true), Promise.resolve(1)),
    send: () => {},
    state: {},
  };
  born.push(r);
  return r;
}

/**
 * 一輪 = **出貨的順序**：join 還在飛的時候就 `leave()`，然後 join 才落地。
 * ⛔ 沒有 sleep、⛔ 不會 flake —— deferred 由測試決定何時 resolve。
 */
async function round(n: number): Promise<void> {
  const conn = new RoomConnection(`acc-${n}`);
  const room = makeRoom(n);
  // 出貨的 `bind()` 是 private，但它就是「join 落地」那一刻真正跑的東西。
  const bind = (conn as unknown as { bind(r: unknown): void }).bind.bind(conn);
  conn.leave(); // ← 離開落在 await 裡
  bind(room); // ← join 這時候才回來
}

describe("離開落在 join 的窗口裡 (orphan-room-growth-570)", () => {
  it("★ 逐輪「join 途中離開」，殘留的幽靈房**等於**第 1 輪（⛔ 不是小於門檻）", async () => {
    cover("orphan-room-growth-570");
    born.length = 0;
    const residue = (): number =>
      born.filter((r) => !r.left).length + born.reduce((n, r) => n + r.handlers, 0);

    await round(1);
    const first = residue();
    for (let i = 2; i <= 6; i++) {
      await round(i);
      expect(
        residue(),
        `第 ${i} 輪的幽靈房殘留要等於第 1 輪 —— 線性成長 = 每離開一次就多一間` +
          `永不 autoDispose 的房（20 Hz socket + 伺服器 30 tick/s）`,
      ).toBe(first);
    }
    // ⭐ fail-loud：它被擋下來的時候要**出聲**，⛔ 不是靜靜 return。
    expect(perfBus.orphanRooms, "擋下來了卻沒有人知道 = 靜默,而靜默才是缺陷").toBeGreaterThan(0);
  });
});
