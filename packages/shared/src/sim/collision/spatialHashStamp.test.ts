/**
 * ⭐⭐ GH#629 第二槓桿（部分）—— `queryAABB` 的去重換成 **stamp 陣列**。
 *
 * ── ⭐ 實測：**1.10×**，⛔ 不是票文寫的 3.4× ────────────────────────────────
 * 20,000 次查詢 / 1000 個實體：**59.7ms → 54.1ms**（2.99µs → 2.70µs 每次）。
 * ⚠️ ⭐ 票文那個 3.4× 指的是**換掉 cell 儲存**（`Map<number, EntityId[]>` → flat array），
 * ⛔ 而這一手只拿掉了每次查詢的 `Set` ＋ 雜湊。⇒ **兩件事，⛔ 不是同一件。**
 *
 * ⭐ 而它仍然值得做：N=1000 時每 tick 上千次查詢 ⇒ 上千個 `Set` 的配置壓力
 * 在 benchmark 的穩態下被低估（GC 不在計時裡）。
 *
 * ── ⛔ 票文點名的陷阱：**沒有踩** ────────────────────────────────────────
 * > 「⚠️ **有陷阱**：共用緩衝會讓『留到下次查詢後才用』的呼叫端**靜默拿錯**」
 * ⇒ ⭐ 回傳的**仍然是一個新陣列**。省掉的是 `Set` 與雜湊，⛔ 不是那一次配置。
 *
 * MUTATION LOG：
 *   · 拿掉 `if (this.seenAt[id] === stamp) continue;` → ②紅（重複 id）
 *   · 把 `out` 改成共用緩衝 → ③紅（前一次的結果被下一次覆寫）
 */
import { describe, it, expect } from "vitest";
import { SpatialHash } from "./spatialHash";
import type { EntityId } from "../../ids";

const h = (): SpatialHash => new SpatialHash(4);

describe("GH#629 spatialHash 的 stamp 去重", () => {
  it("★ ⭐ 跨格子的實體**只出現一次**（⛔ 去重壞掉會讓傷害算兩次）", () => {
    const g = h();
    // 一個半徑 3 的圓在 cellSize 4 的格網上必定跨多格
    g.insertCircle(7 as EntityId, { x: 4, z: 4 }, 3);
    const got = g.queryCircle({ x: 4, z: 4 }, 5);
    expect(got.filter((x) => x === 7).length, "⛔ 同一個 id 出現多次").toBe(1);
  });

  it("★ ⭐ **每一次查詢都是獨立的**（⛔ stamp 沒 +1 會讓第二次查詢回空）", () => {
    const g = h();
    g.insertCircle(1 as EntityId, { x: 0, z: 0 }, 0.6);
    const a = g.queryCircle({ x: 0, z: 0 }, 2);
    const b = g.queryCircle({ x: 0, z: 0 }, 2);
    expect(a).toEqual([1]);
    expect(b, "⛔ 第二次查詢回了空 —— stamp 沒有前進").toEqual([1]);
  });

  it("★ ⭐ 回傳的是**新陣列**（⛔ 不是共用緩衝 —— 票文逐字點名的陷阱）", () => {
    const g = h();
    g.insertCircle(1 as EntityId, { x: 0, z: 0 }, 0.6);
    g.insertCircle(2 as EntityId, { x: 20, z: 20 }, 0.6);
    const first = g.queryCircle({ x: 0, z: 0 }, 2);
    g.queryCircle({ x: 20, z: 20 }, 2); // 第二次查詢
    expect(first, "⛔ 前一次的結果被下一次覆寫了 ⇒ 呼叫端靜默拿錯").toEqual([1]);
  });

  it("⭐ 仍然是**升序**（下游的確定性靠它）", () => {
    const g = h();
    for (const i of [9, 3, 7, 1]) g.insertCircle(i as EntityId, { x: 0, z: 0 }, 0.6);
    expect(g.queryCircle({ x: 0, z: 0 }, 2)).toEqual([1, 3, 7, 9]);
  });

  it("⭐ id 超出 stamp 陣列長度時會長大（⛔ 不是靜默漏掉）", () => {
    const g = h();
    g.insertCircle(5000 as EntityId, { x: 0, z: 0 }, 0.6);
    expect(g.queryCircle({ x: 0, z: 0 }, 2), "⛔ 大 id 被漏掉了").toEqual([5000]);
  });
});
