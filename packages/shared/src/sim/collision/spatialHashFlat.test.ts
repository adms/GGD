/**
 * ⭐⭐ GH#629 第三槓桿 —— **counting sort → 一條扁平陣列**（CSR）。
 *
 * ── ⭐ 量到的（2026-09-01，N=1000 × 200 tick，各跑三次取中位數）──────────
 * | | 舊（Map<格, 陣列> ＋ Map<id, AABB>） | 新（扁平 CSR） |
 * |---|---:|---:|
 * | rebuild | 0.095 ms/tick | **0.083** |
 * | query   | 0.347 ms/tick | **0.247** |
 * | 合計    | 0.442 ms/tick | **0.330 ＝ 1.34×** |
 *
 * ⛔ **票文寫的 3.4× 沒有達到** —— ⭐ 而量下去才知道原因：
 * 瓶頸**不在建表**（0.083 ms），在**查詢**（0.247 ms）。
 * ⇒ 換資料結構省掉的是建表那一半的 Map 與配置，⭐ 而查詢那一半的成本
 *   主要是「每個結果陣列都要 `.sort()`」—— 那一條靠**升序偵測**省掉。
 *
 * ⚠️ ⭐ 另外兩個我試過而**量不出差別**的（誠實記下，⛔ 免得下一輪再做一次）：
 *   · 把 `build()` 的三遍併成兩遍 ⇒ 0.648 → 0.647（**雜訊等級**）
 *   · 把 `ensureSeen` 從逐項呼叫移到建表時一次 ⇒ 量起來**一模一樣**
 *   ⇒ ⭐ 一次量測看起來有 1.28× 的那次是**雜訊** —— ⛔ 跑三次才看得出來。
 *
 * ── ⭐ 這條守衛驗什麼（⛔ 不是驗速度：那會是一條看機器心情紅的閘）────────
 * ① **等價** —— 答案與一個笨方法（逐個比對 AABB）**逐位元相同**（含順序）
 * ② **跨 tick 不變式** —— `build()` 之後再 `insert()` 必須看得到
 * ③ 空表、單格、跨多格的邊界
 *
 * MUTATION LOG（落地前跑過）：
 *   · `insert()` 裡的 `this.dirty = true` 拿掉 → ② 紅（查到上一 tick 的內容）
 */
import { describe, it, expect } from "vitest";
import { SpatialHash } from "./spatialHash";
import type { EntityId } from "../../ids";

type Box = { id: number; x: number; z: number; r: number };

/** ⭐ 笨方法：逐個比 AABB。⛔ 它慢，而它**明顯是對的** —— 那正是它的用途。 */
function brute(boxes: readonly Box[], min: { x: number; z: number }, max: { x: number; z: number }): number[] {
  return boxes
    .filter((b) => b.x - b.r <= max.x && b.x + b.r >= min.x && b.z - b.r <= max.z && b.z + b.r >= min.z)
    .map((b) => b.id)
    .sort((a, b) => a - b);
}

function seeded(n: number, span: number): Box[] {
  let s = 987654321;
  const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({ length: n }, (_, i) => ({
    id: i, x: rnd() * span - span / 2, z: rnd() * span - span / 2, r: 0.3 + rnd() * 1.4,
  }));
}

describe("GH#629 扁平化的空間雜湊", () => {
  it("★ ① 答案與笨方法**逐位元相同**（含順序）—— ⛔ 換資料結構不可以換答案", () => {
    const boxes = seeded(300, 80);
    const g = new SpatialHash(4);
    for (const b of boxes) g.insertCircle(b.id as EntityId, { x: b.x, z: b.z }, b.r);
    let checked = 0;
    for (const q of seeded(60, 80)) {
      const min = { x: q.x - 3, z: q.z - 3 };
      const max = { x: q.x + 3, z: q.z + 3 };
      expect(
        [...g.queryAABB(min, max)],
        `⛔ 查詢 (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) 的答案與笨方法不同`,
      ).toEqual(brute(boxes, min, max));
      checked += 1;
    }
    expect(checked, "⚠️ 前提自證：真的驗了 60 次查詢").toBe(60);
  });

  it("★ ② ⭐ **跨 tick 不變式**：`build()` 之後再 `insert()` 一定看得到", () => {
    const g = new SpatialHash(4);
    g.insertCircle(1 as EntityId, { x: 0, z: 0 }, 0.5);
    expect(g.queryCircle({ x: 0, z: 0 }, 1)).toEqual([1]); // ⭐ 這一次會 build
    g.insertCircle(2 as EntityId, { x: 0.2, z: 0.2 }, 0.5); // ⛔ build 之後才插
    expect(
      g.queryCircle({ x: 0, z: 0 }, 1),
      "⛔⛔ 查到的是**上一次建表**的內容 —— ⭐ 而畫面上完全看不出來\n" +
        "（新生的單位對每一個範圍技能、每一次自動索敵都是**隱形**的）。",
    ).toEqual([1, 2]);
  });

  it("⭐ ③ `clear()` 之後是空的，而且 buffer 重用不會漏出舊內容", () => {
    const g = new SpatialHash(4);
    g.insertCircle(7 as EntityId, { x: 5, z: 5 }, 1);
    expect(g.queryCircle({ x: 5, z: 5 }, 2)).toEqual([7]);
    g.clear();
    expect(g.queryCircle({ x: 5, z: 5 }, 2), "⛔ 清空之後還查得到 = buffer 漏了").toEqual([]);
    g.insertCircle(9 as EntityId, { x: 5, z: 5 }, 1);
    expect(g.queryCircle({ x: 5, z: 5 }, 2), "⛔ 重用之後混進了上一輪的 id").toEqual([9]);
  });

  it("⭐ ④ 一個實體跨多格時**只出現一次**（去重）", () => {
    const g = new SpatialHash(4);
    g.insertCircle(3 as EntityId, { x: 0, z: 0 }, 9); // 半徑 9 / 格寬 4 ⇒ 橫跨很多格
    expect(g.queryAABB({ x: -20, z: -20 }, { x: 20, z: 20 })).toEqual([3]);
  });
});
