/**
 * GH#743 —— 狀態語音的**最後一段**：上升緣真的被播出去。
 *
 * ⭐ 這條守衛量的是 `statusVoiceRunner`，⛔ 不是 `statusVoiceEdges`
 *（後者早就有守衛，而它自己的檔頭寫著「⭐ 那是這張票唯一還缺的東西」＝呼叫端）。
 *
 * MUTATION LOG：`tick()` 裡的 `play(...)` 拿掉 → ①②紅。
 */
import { describe, it, expect } from "vitest";
import { StatusVoiceRunner } from "./statusVoiceRunner";

const seats = (rows: { seatId: number; statusIds?: string[]; championId?: string }[]) => ({
  values: () => rows,
});

describe("GH#743 狀態語音呼叫端", () => {
  it("★ 中了【致盲】⇒ 播一句（⛔ 在此之前那一類永遠沒有觸發點）", () => {
    const r = new StatusVoiceRunner();
    const said: string[] = [];
    r.tickSeats(seats([{ seatId: 1, statusIds: [], championId: "c" }]), () => true);
    r.tickSeats(seats([{ seatId: 1, statusIds: ["blind"], championId: "c" }]), (_c, k) => {
      said.push(k);
      return true;
    });
    expect(said, "⛔ 狀態上來了而沒有人說話").toContain("blind");
  });

  it("★ 只在**上升緣**播 —— 持續中毒不會每一拍都喊", () => {
    const r = new StatusVoiceRunner();
    const f = seats([{ seatId: 1, statusIds: ["blind"], championId: "c" }]);
    let n = 0;
    const count = (): boolean => (n += 1) > 0;
    r.tickSeats(seats([{ seatId: 1, statusIds: [], championId: "c" }]), count);
    r.tickSeats(f, count);
    r.tickSeats(f, count);
    r.tickSeats(f, count);
    expect(n, "⛔ 每一拍都在喊 —— 那不是上升緣").toBe(1);
  });

  it("⭐ 沒有英雄的座位**仍然記帳** —— ⛔ 否則換人時新玩家繼承舊狀態就永遠不觸發", () => {
    const r = new StatusVoiceRunner();
    // 座位上還沒有人，但已經帶著狀態
    r.tickSeats(seats([{ seatId: 1, statusIds: ["blind"] }]), () => true);
    let n = 0;
    // 人坐進來了，狀態沒變 ⇒ ⛔ 不是上升緣
    r.tickSeats(seats([{ seatId: 1, statusIds: ["blind"], championId: "c" }]), () => (n += 1) > 0);
    expect(n).toBe(0);
  });

  it("⭐ 座位離場之後忘掉它（下一位是全新的上升緣）", () => {
    const r = new StatusVoiceRunner();
    r.tickSeats(seats([{ seatId: 1, statusIds: ["blind"], championId: "a" }]), () => true);
    r.forget(1);
    let n = 0;
    r.tickSeats(seats([{ seatId: 1, statusIds: ["blind"], championId: "b" }]), () => (n += 1) > 0);
    expect(n, "⛔ 新玩家繼承了上一位的狀態記憶").toBe(1);
  });
});
