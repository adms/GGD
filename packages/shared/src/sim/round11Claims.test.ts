/**
 * ⭐⭐ 一次性獎勵去重的守衛（GH#1151 C）——
 * 每一條對著票逐字點名的**一個危險**。
 */
import { describe, it, expect } from "vitest";
import { Round11Claims } from "./round11Claims";

describe("一次性獎勵帳本（GH#1151 C）", () => {
  it("⭐ 第一次回 `true`，⛔ 之後永遠 `false`", () => {
    const c = new Round11Claims();
    expect(c.claim("drop", "boss-7")).toBe(true);
    expect(c.claim("drop", "boss-7")).toBe(false);
    expect(c.claim("drop", "boss-7")).toBe(false);
  });

  it("⭐⭐ **不同的掉落各自算** —— ⛔ 一個共用旗標會吞掉第二個", () => {
    // ⚠️ 這是「帳本 vs 布林旗標」的分水嶺:一場比賽有 N 個掉落。
    const c = new Round11Claims();
    expect(c.claim("drop", "boss-7")).toBe(true);
    expect(c.claim("drop", "boss-8")).toBe(true);
    expect(c.claim("drop", "boss-9")).toBe(true);
    expect(c.size).toBe(3);
  });

  it("⭐ 種類之間**互不影響** —— 同一個 id 的掉落與復活是兩件事", () => {
    const c = new Round11Claims();
    expect(c.claim("drop", "x")).toBe(true);
    expect(c.claim("revive", "x")).toBe(true);
    expect(c.claim("reroll", "x")).toBe(true);
    expect(c.claim("legendaryBreak", "x")).toBe(true);
  });

  it("⛔⛔ **斷線重連**：同一個請求重放 100 次 ⇒ ⭐ 只發一次", () => {
    const c = new Round11Claims();
    let granted = 0;
    for (let i = 0; i < 100; i++) if (c.claim("revive", "circle-3:seat-5")) granted++;
    expect(granted).toBe(1);
  });

  it("⛔⛔ **重複請求**：同一 tick 兩個來源同時要 ⇒ ⭐ 只有一個拿到", () => {
    const c = new Round11Claims();
    const a = c.claim("reroll", "offer-1");
    const b = c.claim("reroll", "offer-1");
    expect([a, b]).toEqual([true, false]);
  });

  it("⭐ `claimed()` 是**只讀**的 —— ⛔ 查詢不可以把名額用掉", () => {
    const c = new Round11Claims();
    expect(c.claimed("drop", "y")).toBe(false);
    expect(c.claimed("drop", "y")).toBe(false);
    expect(c.claim("drop", "y"), "⭐ 查過之後仍然領得到").toBe(true);
  });

  it("⭐ 回合結束清空 —— ⛔ 帳本不可以跨回合（下一場會領不到）", () => {
    const c = new Round11Claims();
    c.claim("drop", "boss-7");
    c.clear();
    expect(c.size).toBe(0);
    expect(c.claim("drop", "boss-7"), "⭐ 新的一回合可以重新領").toBe(true);
  });

  it("⭐ 不同種類的同名 key ⛔ 不會互相碰撞（前綴是種類）", () => {
    const c = new Round11Claims();
    c.claim("drop", "1:2");
    expect(c.claimed("revive", "1:2")).toBe(false);
  });
});
