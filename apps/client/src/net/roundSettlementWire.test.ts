/**
 * ⭐⭐ GH#737 —— 伺服器每 tick 廣播回合分數，⛔ **而客戶端零個收端**。
 *
 * `MatchRoom.ts:889` 逐字：
 *   `for (const rs of this.ctl.takeRoundSettlements()) this.broadcast(MSG.EVENT, {…})`
 * ⇒ 事件在線上、fanout 放行、payload 型別齊全 —— ⭐ 而 `git grep roundSettlement`
 *   在 `apps/client/` 是**零命中** ⇒ 玩家戰鬥中看不到自己的分數與排名。
 *   （失敗形態②：算出來了但從沒送到畫面。）
 *
 * ⭐ AC 要的是「**HUD 數字 === 結算公式輸出**」⇒ 這條守衛驗的是
 * **客戶端一個數字都不算**：payload 給什麼，store 就是什麼。
 *
 * MUTATION LOG：`recordRoundSettlement` 裡的 `hudStore.setState` 拿掉 → ①②紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { hudStore, recordRoundSettlement } from "./RoomStore";
import type { EventMessage } from "@ggd/shared/protocol/messages";

const ev = (final: boolean, entries: Record<string, number>[]): EventMessage =>
  ({ type: "roundSettlement", tick: 1, data: { final, entries } }) as unknown as EventMessage;

describe("GH#737 回合分數上線路", () => {
  beforeEach(() => hudStore.setState({ roundScore: null }));

  it("★ ⭐ 伺服器給的分數**原封不動**進 HUD（⛔ 客戶端不重算）", () => {
    recordRoundSettlement(ev(true, [{ seatId: 3, score: 1234, survivalBonus: 400, rank: 2, prevRank: 5 }]), 3);
    expect(hudStore.getState().roundScore, "⛔ 收端沒接上").toEqual({
      score: 1234,
      survivalBonus: 400,
      rank: 2,
      prevRank: 5,
      final: true,
    });
  });

  it("★ ⭐ 只取**自己那一格**（payload 帶全場）", () => {
    recordRoundSettlement(
      ev(false, [
        { seatId: 1, score: 999, survivalBonus: 0, rank: 1 },
        { seatId: 7, score: 111, survivalBonus: 200, rank: 6 },
      ]),
      7,
    );
    expect(hudStore.getState().roundScore?.score, "⛔ 畫到別人的分數了").toBe(111);
  });

  it("⭐ 第一回合沒有 prevRank ⇒ `null`（⛔ 不是 0 —— 0 會被畫成「從第 0 名掉下來」）", () => {
    recordRoundSettlement(ev(true, [{ seatId: 1, score: 10, survivalBonus: 0, rank: 4 }]), 1);
    expect(hudStore.getState().roundScore?.prevRank).toBeNull();
  });

  it("⭐ 還沒入座（`localSeatId` null）⇒ 不寫任何東西", () => {
    recordRoundSettlement(ev(true, [{ seatId: 1, score: 10, survivalBonus: 0, rank: 1 }]), null);
    expect(hudStore.getState().roundScore).toBeNull();
  });
});
