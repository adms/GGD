/**
 * Uniform-grid spatial hash for broad-phase queries. Rebuilt (or incrementally
 * updated) once per tick; queried by movement resolution, ability overlap tests,
 * and AI perception. Deterministic: results are returned sorted by EntityId.
 */
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { AABB } from "./shapes";

export class SpatialHash {
  /**
   * ⭐⭐ GH#629 第三槓桿 —— **counting sort → 一條扁平陣列**（CSR 形狀）。
   *
   * ── ⛔ 在此之前 ────────────────────────────────────────────────────────
   * `cells: Map<number, EntityId[]>` ＋ `entityBounds: Map<EntityId, AABB>`。
   * N=1000 的一場**每 tick**：1000 次 `entityBounds.set` ·
   * 1000–4000 次 `cells.get`／`set` · ⭐ **每個被碰到的格子一次陣列配置**
   * （`clear()` 把上一 tick 的全丟了）⇒ ⛔ 熱路徑上全是雜湊 ＋ GC 壓力。
   *
   * ── ⭐ 現在 ───────────────────────────────────────────────────────────
   * `insert()` **只把 (id, bounds) 追加進扁平陣列** —— ⛔ 一格 Map、一次配置都不做。
   * 第一次 `query*()` 時才 `build()`：數 → 前綴和 → 散射進**一條** `Int32Array`。
   *
   * ⭐ 而**公開介面一個字都沒改** —— counting sort 天生要兩遍掃描，而
   * `rebuildGrid()` 是一個一個插進來的；⭐ **延遲建表**把「要兩遍」藏在介面後面。
   *
   * ⚠️ ⭐ `items` 存的是**插入序號**（⛔ 不是 entity id）⇒ 邊界查詢變成一次
   * 陣列索引 ⇒ ⭐ `entityBounds` 那個 Map **整個消失**。
   */
  /** 待建的插入（扁平）。`clear()` 只把 `pendN` 歸零 —— ⛔ 不丟 buffer。 */
  private pendId = new Int32Array(0);
  private pendMinX = new Float64Array(0);
  private pendMaxX = new Float64Array(0);
  private pendMinZ = new Float64Array(0);
  private pendMaxZ = new Float64Array(0);
  private pendN = 0;
  /**
   * ⚠️ ⭐ **跨 tick 不變式**：`insert()` 之後**一定**要標髒。
   * ⛔ 少了它會查到**上一 tick** 的內容 —— 而畫面上完全看不出來
   * （那是最難查的一種缺陷）。守衛 `spatialHashFlat.test.ts` 第 ③ 條。
   */
  private dirty = true;
  /**
   * 格子 key → **稠密序號**。⭐ 它是**持久的**（⛔ `clear()` 不清）——
   * 場地形狀不變 ⇒ 幾 tick 之後它就完全不再寫了。
   */
  private cellIndex = new Map<number, number>();
  private cellCount = 0;
  /** CSR：`cellStart[d] … cellStart[d+1]` 是第 d 格在 `items` 裡的區間。 */
  private cellStart = new Int32Array(1);
  private counts = new Int32Array(0);
  private cursor = new Int32Array(0);
  private items = new Int32Array(0);

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

  /**
   * ⚠️ ⭐ **2026-09-01 試過「重用陣列」並撤回** —— 量到的結果推翻了假設。
   *
   * 想法：`cells.clear()` 把每一個格子的陣列一起丟掉 ⇒ 下一 tick 逐格 `arr = []`
   * 重新配置 ⇒ 保留 Map 的鍵、只把 `length = 0` 應該更快。
   *
   * ⛔ **實測反而慢 4%**（2000 tick 的重建＋查詢：0.102ms → 0.106ms/tick）。
   * ⭐ 合理的解釋：V8 對「短命的小陣列」極度優化（分代 GC 的年輕代幾乎免費），
   * ⛔ 而留著上百個空陣列讓每一次 `cells.values()` 迭代都變長。
   *
   * ⇒ ⭐ **量到再說**：這一格看起來像穩賺的優化，⛔ 而它不是。
   * （同族前科：GH#629 票文自己量過「用 Go 重寫在出貨規模上反而慢 40%」。）
   */
  clear(): void {
    // ⭐ 只把長度歸零 —— ⛔ 不丟 buffer。
    // ⚠️ 這與 2026-08-31 量到「陣列重用**反而慢 4%**」⛔ 不衝突：那一次重用的是
    //   `Map<number, EntityId[]>` 裡的**每一個小陣列**（Map 開銷還在），
    //   ⭐ 這一次是**一條**大 `Int32Array`（Map 從熱路徑整個消失）。
    this.pendN = 0;
    this.dirty = true;
  }

  /** 待建陣列長大到至少 `n`（⭐ 倍增，⛔ 不是每次 +1）。 */
  private growPending(n: number): void {
    if (n <= this.pendId.length) return;
    let cap = Math.max(64, this.pendId.length);
    while (cap < n) cap *= 2;
    const id = new Int32Array(cap); id.set(this.pendId); this.pendId = id;
    const a = new Float64Array(cap); a.set(this.pendMinX); this.pendMinX = a;
    const b = new Float64Array(cap); b.set(this.pendMaxX); this.pendMaxX = b;
    const c = new Float64Array(cap); c.set(this.pendMinZ); this.pendMinZ = c;
    const d = new Float64Array(cap); d.set(this.pendMaxZ); this.pendMaxZ = d;
  }

  insert(id: EntityId, bounds: AABB): void {
    // ⭐ 這裡**只追加** —— ⛔ 一格 Map、一次配置、一次雜湊都不做。
    //   格子那一層在第一次查詢時由 `build()` 一次算完（counting sort）。
    const i = this.pendN;
    this.growPending(i + 1);
    this.pendId[i] = id as number;
    this.pendMinX[i] = bounds.min.x;
    this.pendMaxX[i] = bounds.max.x;
    this.pendMinZ[i] = bounds.min.z;
    this.pendMaxZ[i] = bounds.max.z;
    this.pendN = i + 1;
    // ⚠️ ⭐ **承重的一行** —— ⛔ 少了它，`build()` 之後的插入不會被看到 ⇒
    //   查到的是**上一 tick** 的內容，而畫面上完全看不出來。
    this.dirty = true;
  }

  /** 三條與格數同尺寸的 buffer 一起長大（⭐ 倍增，⛔ 不是剛好夠）。 */
  private growCells(n: number): void {
    const cap = Math.max(64, n * 2);
    const c = new Int32Array(cap); c.set(this.counts); this.counts = c;
    this.cursor = new Int32Array(cap);
    const st = new Int32Array(cap + 1); st.set(this.cellStart); this.cellStart = st;
  }

  /** 格子 key → 稠密序號（⭐ 持久，⛔ `clear()` 不清）。 */
  private denseOf(k: number): number {
    let d = this.cellIndex.get(k);
    if (d === undefined) {
      d = this.cellCount++;
      this.cellIndex.set(k, d);
    }
    return d;
  }

  /**
   * ⭐ counting sort：數 → 前綴和 → 散射。⛔ 一次配置都沒有（buffer 全部重用）。
   */
  private build(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const n = this.pendN;
    // ── ① 數（順便把新格子登記進稠密表）─────────────────────────────────
    // ⚠️ 稠密表在這一圈裡可能長大 ⇒ counts 要在**數完之後**才定尺寸，
    //   ⛔ 不可以先開一個「這一 tick 的格數」——那在第一次遇到新格子時就不夠了。
    // ⭐ **一遍**就同時做「登記新格子」與「數」——
    // ⛔ 在此之前這是兩遍（先 denseOf 全部、再回頭數），而每一遍都要重算
    //   `cellOf` × 4 與逐格 `key()` + Map 查詢。⇒ 合併省掉整整一遍。
    // ⚠️ 做得到的理由：`denseOf` **本來就回傳**那個稠密序號 —— ⛔ 不必再查一次。
    this.counts.fill(0, 0, this.cellCount);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const x0 = this.cellOf(this.pendMinX[i]!);
      const x1 = this.cellOf(this.pendMaxX[i]!);
      const z0 = this.cellOf(this.pendMinZ[i]!);
      const z1 = this.cellOf(this.pendMaxZ[i]!);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const d = this.denseOf(this.key(cx, cz));
          // ⚠️ 稠密表在這一圈裡會長大 ⇒ counts 必須**跟著長**，
          //   ⛔ 不可以先用「這一 tick 的格數」開好 —— 第一次遇到新格子就不夠了。
          if (d >= this.counts.length) this.growCells(d + 1);
          this.counts[d]! += 1;
        }
      }
      total += (x1 - x0 + 1) * (z1 - z0 + 1);
    }
    const nc = this.cellCount;
    if (this.cellStart.length < nc + 1) this.growCells(nc + 1);
    // ── ② 前綴和 ────────────────────────────────────────────────────────
    let acc = 0;
    for (let d = 0; d < nc; d++) {
      this.cellStart[d] = acc;
      this.cursor[d] = acc;
      acc += this.counts[d]!;
    }
    this.cellStart[nc] = acc;
    // ── ③ 散射（⭐ 存的是**插入序號**，⛔ 不是 entity id）──────────────────
    if (this.items.length < total) this.items = new Int32Array(Math.max(256, total * 2));
    for (let i = 0; i < n; i++) {
      const x0 = this.cellOf(this.pendMinX[i]!);
      const x1 = this.cellOf(this.pendMaxX[i]!);
      const z0 = this.cellOf(this.pendMinZ[i]!);
      const z1 = this.cellOf(this.pendMaxZ[i]!);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const d = this.cellIndex.get(this.key(cx, cz))!;
          this.items[this.cursor[d]!] = i;
          this.cursor[d]! += 1;
        }
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
    // ⭐ 延遲建表 —— counting sort 天生要兩遍，而插入是一個一個來的。
    //   ⇒ 把「要兩遍」藏在介面後面，⛔ 公開契約一個字都不用改。
    this.build();
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
    // ⭐ GH#629 —— 邊 push 邊看它**是不是本來就升序**。
    // ⚠️ 量到的：query **0.274 ms/tick** vs rebuild **0.083 ms/tick**
    //   ⇒ ⭐ 瓶頸在查詢，⛔ 不在建表（我原本猜錯了，量了才知道）。
    // ⭐ 而查詢裡每一次都跑一個**帶比較函式的 `.sort()`** —— 1000 次查詢 = 1000 次。
    // ⇒ `rebuildGrid()` 走 `transform` 的插入序，而實體 id 是遞增配發的
    //   ⇒ ⭐ **多數查詢拿到的本來就是升序** ⇒ 那次排序是純浪費。
    // ⛔ 結果逐位元不變：不升序時照樣排（下游靠升序做確定性，`sim/purity.test.ts` 在守）。
    let ascending = true;
    let lastPushed = -1;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const d = this.cellIndex.get(this.key(cx, cz));
        if (d === undefined) continue;
        const end = this.cellStart[d + 1]!;
        for (let i = this.cellStart[d]!; i < end; i++) {
          // ⭐ `items` 存的是**插入序號** ⇒ 邊界是一次陣列索引，⛔ 不是一次 Map 查詢。
          const j = this.items[i]!;
          const id = this.pendId[j]!;
          this.ensureSeen(id);
          if (this.seenAt[id] === stamp) continue; // 這一次查詢已經看過
          // AABB-vs-AABB precise filter
          if (
            this.pendMinX[j]! <= max.x &&
            this.pendMaxX[j]! >= min.x &&
            this.pendMinZ[j]! <= max.z &&
            this.pendMaxZ[j]! >= min.z
          ) {
            this.seenAt[id] = stamp;
            if (id < lastPushed) ascending = false;
            lastPushed = id;
            out.push(id as EntityId);
          }
        }
      }
    }
    // ⭐ 排序**語意**不動：下游靠「升序 id」做確定性（`sim/purity.test.ts` 在守）。
    //   ⛔ 只是本來就升序時不必再跑一次帶比較函式的排序。
    return ascending ? out : out.sort((a, b) => a - b);
  }

  queryCircle(center: Vec2, radius: number): EntityId[] {
    return this.queryAABB(
      { x: center.x - radius, z: center.z - radius },
      { x: center.x + radius, z: center.z + radius },
    );
  }
}
