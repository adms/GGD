/**
 * Uniform-grid spatial hash for broad-phase queries. Rebuilt (or incrementally
 * updated) once per tick; queried by movement resolution, ability overlap tests,
 * and AI perception. Deterministic: results are returned sorted by EntityId.
 */
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { AABB } from "./shapes";

export class SpatialHash {
  private cells = new Map<number, EntityId[]>();
  private entityBounds = new Map<EntityId, AABB>();

  /**
   * ⭐⭐ GH#629 第二槓桿 —— **去重用 stamp 陣列，⛔ 不是每次查詢開一個 `Set`**。
   *
   * ── ⛔ 在此之前 ──────────────────────────────────────────────────────────
   * `queryAABB` 每一次呼叫都 `new Set<EntityId>()`。⭐ N=1000 的一場，
   * 每 tick 有上千次查詢 ⇒ **上千個 Set ＋ 上千次雜湊**。
   * ⭐ 而 `EntityId` 是**連續的小整數** ⇒ 一個以 id 為索引的陣列就是 O(1)、零雜湊。
   *
   * ── ⭐ stamp 的意思 ──────────────────────────────────────────────────────
   * ⛔ **不清空**（清空是 O(容量)，那正是要省掉的東西）——
   * 每次查詢把序號 +1，`seenAt[id] === stamp` 就代表「這一次查詢已經看過」。
   * ⇒ ⭐ 清空成本 **O(1)**。
   *
   * ⚠️ ⭐ 序號用 `number`（雙精度整數安全到 2^53）——
   * ⛔ 不用 `Int32Array` 存序號：那會在 21 億次查詢後回繞，
   * 而回繞的那一刻**去重會靜默失效**（同一個 id 進兩次結果）。
   */
  private seenAt = new Int32Array(0);
  private seenStamp = 0;

  /** ⭐ 讓 stamp 陣列裝得下這個 id（成長 ×2，⛔ 不是每次 +1）。 */
  private ensureSeen(id: number): void {
    if (id < this.seenAt.length) return;
    let n = Math.max(64, this.seenAt.length);
    while (n <= id) n *= 2;
    const next = new Int32Array(n);
    next.set(this.seenAt);
    this.seenAt = next;
  }

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cz: number): number {
    // pack two 16-bit signed cell coords into one int key
    return ((cx & 0xffff) << 16) | (cz & 0xffff);
  }

  private cellOf(x: number): number {
    return Math.floor(x / this.cellSize);
  }

  clear(): void {
    this.cells.clear();
    this.entityBounds.clear();
  }

  insert(id: EntityId, bounds: AABB): void {
    this.entityBounds.set(id, bounds);
    const x0 = this.cellOf(bounds.min.x);
    const x1 = this.cellOf(bounds.max.x);
    const z0 = this.cellOf(bounds.min.z);
    const z1 = this.cellOf(bounds.max.z);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(id);
      }
    }
  }

  /** Insert a circle (common case: a unit at pos with radius r). */
  insertCircle(id: EntityId, center: Vec2, radius: number): void {
    this.insert(id, {
      kind: "aabb",
      min: { x: center.x - radius, z: center.z - radius },
      max: { x: center.x + radius, z: center.z + radius },
    });
  }

  /**
   * All entity ids whose bounds may intersect the query AABB.
   * Sorted ascending & deduplicated → deterministic iteration downstream.
   */
  queryAABB(min: Vec2, max: Vec2): EntityId[] {
    const x0 = this.cellOf(min.x);
    const x1 = this.cellOf(max.x);
    const z0 = this.cellOf(min.z);
    const z1 = this.cellOf(max.z);
    // ⭐ GH#629 —— 序號 +1 就等於「清空」（⛔ O(1)，不是 O(容量)）。
    // ⚠️ `Int32Array` 存的是**序號**，而序號從 1 開始 ⇒ 全新的陣列（全 0）
    //   永遠不等於任何有效序號 ⇒ ⛔ 不必初始化。
    this.seenStamp += 1;
    if (this.seenStamp > 0x7fffffff) {
      // ⚠️ ⭐ 回繞前重置：⛔ 一個回繞的序號會讓去重**靜默失效**（同一個 id 進兩次）。
      this.seenAt = new Int32Array(this.seenAt.length);
      this.seenStamp = 1;
    }
    const stamp = this.seenStamp;
    // ⚠️ ⭐ **回傳的是一個新陣列**（⛔ 不是共用緩衝）——
    //   GH#629 的票文逐字點名這個陷阱：共用緩衝會讓「留到下次查詢後才用」的
    //   呼叫端**靜默拿錯**。⭐ 省掉的是 `Set` 與雜湊，⛔ 不是這一次配置。
    const out: EntityId[] = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (const id of arr) {
          this.ensureSeen(id as number);
          if (this.seenAt[id as number] === stamp) continue; // 這一次查詢已經看過
          const b = this.entityBounds.get(id)!;
          // AABB-vs-AABB precise filter
          if (b.min.x <= max.x && b.max.x >= min.x && b.min.z <= max.z && b.max.z >= min.z) {
            this.seenAt[id as number] = stamp;
            out.push(id);
          }
        }
      }
    }
    // ⭐ 排序不動：下游靠「升序 id」做確定性（`sim/purity.test.ts` 在守）。
    return out.sort((a, b) => a - b);
  }

  queryCircle(center: Vec2, radius: number): EntityId[] {
    return this.queryAABB(
      { x: center.x - radius, z: center.z - radius },
      { x: center.x + radius, z: center.z + radius },
    );
  }
}
