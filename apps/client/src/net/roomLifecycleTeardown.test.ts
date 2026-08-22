/**
 * ⭐【離開一間房要真的離乾淨】GH#592 · GH#590 · GH#596
 *
 * > owner 2026-08-23：「你**寧願多次清理乾淨開始回合 也不要漏清到**」
 *
 * ── ⚠️ 為什麼既有的 `teardown.test.ts` 結構上看不到這三條 ────────────────────
 * ⭐ 它的 `attach()` **直接指派 `conn.room`，從不呼叫 `bind()`** —— 失敗形態⑤
 *（被測的不是出貨的那條路）。`bind()` 才是掛 handler 的地方，所以「handler 有沒有
 * 被拆掉」這個問題在那支檔裡**不可能問得出來**。
 * ⇒ 這一支用**真的** colyseus `Room` 驅動**出貨的** `bind()`／`leave()`。
 *
 * ── 突變紀錄（實跑，⭐ 這一批的承重那一條）──────────────────────────────────
 * M1（承重）`RoomConnection.leave()` 的
 *    `for (const off of this.disposers) off();` 兩行拿掉
 *    ⇒ 🔴 第 2 輪紅：殘留 handler 4 → 8 → 12（線性，逐輪 +4）。
 */
import { describe, it, expect } from "vitest";
import { Room } from "colyseus.js";
import { cover } from "@ggd/shared/testkit/cover";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { RoomConnection, drainEvadeSightings, clearEvadeSightings } from "./RoomConnection";
import { perfBus } from "../perfBus";

/** 真的 Room，但 socket 換成一根不會說話的樁（`leave(true)` 只是送一個位元組）。 */
function realRoom(): Room<MatchState> {
  const room = new Room<MatchState>("match");
  (room as unknown as { connection: unknown }).connection = { send() {}, close() {} };
  return room;
}

/** `bind()` 是 private，但它就是「join 落地」那一刻真正跑的東西。 */
function bindShipped(conn: RoomConnection, room: Room<MatchState>): void {
  (conn as unknown as { bind(r: Room<MatchState>): void }).bind(room);
}

function messageHandlers(room: Room<MatchState>): number {
  const events = (room as unknown as { onMessageHandlers: { events: Record<string, unknown[]> } })
    .onMessageHandlers.events;
  return Object.values(events).reduce((n, list) => n + (list?.length ?? 0), 0);
}

/** onLeave 的訂閱者數 —— 借一次註冊把 EventEmitter 本體拿出來再退掉。 */
function leaveHandlers(room: Room<MatchState>): number {
  const probe = (): void => {};
  const emitter = room.onLeave(probe) as unknown as { handlers: unknown[]; remove(cb: unknown): void };
  emitter.remove(probe);
  return emitter.handlers.length;
}

describe("離開一間房要真的離乾淨 (room-lifecycle-teardown-592)", () => {
  it("★ 逐輪 join→leave，殘留的 handler **等於**第 1 輪（⛔ 不是小於某個門檻）", () => {
    cover("room-lifecycle-teardown-592");
    // colyseus 自己也會掛 onLeave（建構子的 removeAllListeners + leave() 的
    // promise resolver）。基準線用一顆**沒有 bind 過**的房量出來，⛔ 不寫死數字。
    const control = realRoom();
    control.leave(true);
    const baseline = leaveHandlers(control);

    const born: Room<MatchState>[] = [];
    const residue = (): number =>
      born.reduce((n, r) => n + messageHandlers(r) + Math.max(0, leaveHandlers(r) - baseline), 0);

    let first = -1;
    for (let i = 1; i <= 5; i++) {
      const conn = new RoomConnection(`acc-${i}`);
      const room = realRoom();
      born.push(room);
      bindShipped(conn, room);
      conn.leave();
      if (i === 1) first = residue();
      expect(
        residue(),
        `第 ${i} 輪的殘留 handler 要等於第 1 輪 —— 線性成長 = 每離開一次就多 5 個` +
          `掛在一條我已經走掉的 socket 上的 handler（4 個 onMessage + 1 個 onLeave）`,
      ).toBe(first);
    }
    expect(first, "leave() 之後 bind() 掛的 onMessage 一個都不該留著").toBe(0);
  });

  it("GH#590 —— `leave()` 之後**在途**的那一顆封包寫不進 evade 緩衝", () => {
    cover("room-lifecycle-teardown-592");
    clearEvadeSightings();
    const conn = new RoomConnection("acc");
    bindShipped(conn, realRoom());
    conn.leave();
    // 一個**已經排進事件迴圈**的 socket callback：handler 拆掉擋不住它跑完。
    (conn as unknown as { acceptEvent(ev: unknown): void }).acceptEvent({
      type: "evade",
      tick: 1,
      data: { source: 1, target: 2, x: 0, z: 0 },
    });
    expect(drainEvadeSightings(), "沒有人 drain 的 sighting 會活著進到下一場").toEqual([]);
  });

  it("GH#596 —— 我沒叫的斷線要**出聲**；我自己叫的 leave() ⛔ 不算", () => {
    cover("room-lifecycle-teardown-592");
    const before = perfBus.unexpectedDisconnects;
    const quiet = new RoomConnection("acc-quiet");
    bindShipped(quiet, realRoom());
    quiet.leave();
    expect(perfBus.unexpectedDisconnects, "自己走的不是斷線").toBe(before);

    const conn = new RoomConnection("acc-drop");
    const room = realRoom();
    bindShipped(conn, room);
    let code = 0;
    conn.onDisconnect = (c) => (code = c);
    room.onLeave.invoke(4001); // 伺服器單方面關掉
    expect(code, "非預期斷線要有一條回大廳的出路").toBe(4001);
    expect(perfBus.unexpectedDisconnects).toBe(before + 1);
  });
});
