/**
 * Replay a captured SpatialHash op-trace against
 *   (a) the SHIPPED TS SpatialHash            — baseline
 *   (b) an ALLOCATION-FREE TS rewrite         — same output, different data layout
 * and verify (b) is byte-identical to the recorded (a) results.
 *
 * ⛔ Nothing here is imported by the sim. This file lives outside the repo.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import { SpatialHash } from "../../../../packages/shared/src/sim/collision/spatialHash";

type Op =
  | { k: 0 } // clear
  | { k: 1; id: number; x: number; z: number; r: number } // insertCircle
  | { k: 2; id: number; x0: number; z0: number; x1: number; z1: number } // insert aabb
  | { k: 3; x0: number; z0: number; x1: number; z1: number; want: number[] }; // queryAABB

function load(file: string): { ops: Op[]; ticks: number } {
  const ops: Op[] = [];
  let ticks = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const a = JSON.parse(line) as unknown[];
    switch (a[0]) {
      case "c":
        ops.push({ k: 0 });
        ticks++;
        break;
      case "i":
        ops.push({ k: 1, id: a[1] as number, x: a[2] as number, z: a[3] as number, r: a[4] as number });
        break;
      case "b":
        ops.push({ k: 2, id: a[1] as number, x0: a[2] as number, z0: a[3] as number, x1: a[4] as number, z1: a[5] as number });
        break;
      case "q":
        ops.push({ k: 3, x0: a[1] as number, z0: a[2] as number, x1: a[3] as number, z1: a[4] as number, want: a[5] as number[] });
        break;
    }
  }
  return { ops, ticks };
}

// ───────────────────────── optimized variant ─────────────────────────
// Same algorithm (uniform grid, cellSize 4, exact AABB filter, ascending
// unique ids). Different DATA LAYOUT:
//   · bounds in one flat Float64Array indexed by entity id (⛔ no AABB objects)
//   · dedup by a generation stamp array (⛔ no Set, no spread)
//   · scratch output buffer + insertion sort (⛔ no comparator closure)
//   · scalar query entry point (⛔ no {x,z} argument objects)
class FastHash {
  private cells = new Map<number, number[]>();
  private used: number[] = [];
  private bounds = new Float64Array(4096 * 4);
  private present = new Int32Array(4096);
  private stamp = new Int32Array(4096);
  private gen = 0;
  private out: number[] = [];
  private epoch = 1;

  constructor(private readonly cellSize: number) {}

  private grow(id: number): void {
    if (id < this.present.length) return;
    let n = this.present.length;
    while (n <= id) n *= 2;
    const b = new Float64Array(n * 4);
    b.set(this.bounds);
    this.bounds = b;
    const p = new Int32Array(n);
    p.set(this.present);
    this.present = p;
    const s = new Int32Array(n);
    s.set(this.stamp);
    this.stamp = s;
  }

  clear(): void {
    for (const k of this.used) {
      const arr = this.cells.get(k);
      if (arr) arr.length = 0;
    }
    this.used.length = 0;
    this.epoch++;
  }

  insertBounds(id: number, minx: number, minz: number, maxx: number, maxz: number): void {
    this.grow(id);
    const o = id * 4;
    this.bounds[o] = minx;
    this.bounds[o + 1] = minz;
    this.bounds[o + 2] = maxx;
    this.bounds[o + 3] = maxz;
    this.present[id] = this.epoch;
    const cs = this.cellSize;
    const x0 = Math.floor(minx / cs);
    const x1 = Math.floor(maxx / cs);
    const z0 = Math.floor(minz / cs);
    const z1 = Math.floor(maxz / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = ((cx & 0xffff) << 16) | (cz & 0xffff);
        let arr = this.cells.get(k);
        if (arr === undefined) {
          arr = [];
          this.cells.set(k, arr);
          this.used.push(k);
        } else if (arr.length === 0) {
          this.used.push(k);
        }
        arr.push(id);
      }
    }
  }

  insertCircle(id: number, x: number, z: number, r: number): void {
    this.insertBounds(id, x - r, z - r, x + r, z + r);
  }

  /** ascending, unique — byte-identical to SpatialHash.queryAABB */
  query(minx: number, minz: number, maxx: number, maxz: number): number[] {
    const cs = this.cellSize;
    const x0 = Math.floor(minx / cs);
    const x1 = Math.floor(maxx / cs);
    const z0 = Math.floor(minz / cs);
    const z1 = Math.floor(maxz / cs);
    const g = ++this.gen;
    const out = this.out;
    out.length = 0;
    const b = this.bounds;
    const st = this.stamp;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(((cx & 0xffff) << 16) | (cz & 0xffff));
        if (arr === undefined) continue;
        for (let i = 0; i < arr.length; i++) {
          const id = arr[i];
          if (st[id] === g) continue;
          const o = id * 4;
          if (b[o] <= maxx && b[o + 2] >= minx && b[o + 1] <= maxz && b[o + 3] >= minz) {
            st[id] = g;
            // insertion sort on the way in: k is tiny (measured avg 24)
            let j = out.length++;
            while (j > 0 && out[j - 1] > id) {
              out[j] = out[j - 1];
              j--;
            }
            out[j] = id;
          }
        }
      }
    }
    return out;
  }
}

// ── variant C: same as FastHash but every hot buffer is a typed array ──
// (`out.length++` on a plain array is the pattern most likely to hold V8 back;
//  this variant removes it, so the TS side is not handicapped by my own code.)
class TypedHash {
  private cells = new Map<number, Int32Array>();
  private counts = new Map<number, number>();
  private used: number[] = [];
  private bounds = new Float64Array(4096 * 4);
  private stamp = new Int32Array(4096);
  private gen = 0;
  private out = new Int32Array(4096);
  outLen = 0;

  constructor(private readonly cellSize: number) {}

  clear(): void {
    for (const k of this.used) this.counts.set(k, 0);
    this.used.length = 0;
  }

  insertBounds(id: number, minx: number, minz: number, maxx: number, maxz: number): void {
    const o = id * 4;
    this.bounds[o] = minx;
    this.bounds[o + 1] = minz;
    this.bounds[o + 2] = maxx;
    this.bounds[o + 3] = maxz;
    const cs = this.cellSize;
    const x0 = Math.floor(minx / cs);
    const x1 = Math.floor(maxx / cs);
    const z0 = Math.floor(minz / cs);
    const z1 = Math.floor(maxz / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = ((cx & 0xffff) << 16) | (cz & 0xffff);
        let arr = this.cells.get(k);
        let n = this.counts.get(k) ?? 0;
        if (arr === undefined) {
          arr = new Int32Array(16);
          this.cells.set(k, arr);
          n = 0;
          this.used.push(k);
        } else if (n === 0) {
          this.used.push(k);
        }
        if (n === arr.length) {
          const bigger = new Int32Array(arr.length * 2);
          bigger.set(arr);
          arr = bigger;
          this.cells.set(k, arr);
        }
        arr[n] = id;
        this.counts.set(k, n + 1);
      }
    }
  }

  insertCircle(id: number, x: number, z: number, r: number): void {
    this.insertBounds(id, x - r, z - r, x + r, z + r);
  }

  /** fills `this.out[0..outLen)` ascending & unique */
  query(minx: number, minz: number, maxx: number, maxz: number): Int32Array {
    const cs = this.cellSize;
    const x0 = Math.floor(minx / cs);
    const x1 = Math.floor(maxx / cs);
    const z0 = Math.floor(minz / cs);
    const z1 = Math.floor(maxz / cs);
    const g = ++this.gen;
    const b = this.bounds;
    const st = this.stamp;
    const out = this.out;
    let n = 0;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = ((cx & 0xffff) << 16) | (cz & 0xffff);
        const arr = this.cells.get(k);
        if (arr === undefined) continue;
        const cnt = this.counts.get(k)!;
        for (let i = 0; i < cnt; i++) {
          const id = arr[i];
          if (st[id] === g) continue;
          const o = id * 4;
          if (b[o] <= maxx && b[o + 2] >= minx && b[o + 1] <= maxz && b[o + 3] >= minz) {
            st[id] = g;
            let j = n++;
            while (j > 0 && out[j - 1] > id) {
              out[j] = out[j - 1];
              j--;
            }
            out[j] = id;
          }
        }
      }
    }
    this.outLen = n;
    return out;
  }
}

function main(): void {
  const file = process.argv[2];
  const reps = Number(process.env.REPS ?? 50);
  const { ops, ticks } = load(file);

  // ---- (a) shipped ----
  let sink = 0;
  const runShipped = (): void => {
    const h = new SpatialHash(4);
    for (const op of ops) {
      if (op.k === 0) h.clear();
      else if (op.k === 1) h.insertCircle(op.id as never, { x: op.x, z: op.z }, op.r);
      else if (op.k === 2)
        h.insert(op.id as never, {
          kind: "aabb",
          min: { x: op.x0, z: op.z0 },
          max: { x: op.x1, z: op.z1 },
        });
      else sink += h.queryAABB({ x: op.x0, z: op.z0 }, { x: op.x1, z: op.z1 }).length;
    }
  };
  const runFast = (): void => {
    const h = new FastHash(4);
    for (const op of ops) {
      if (op.k === 0) h.clear();
      else if (op.k === 1) h.insertCircle(op.id, op.x, op.z, op.r);
      else if (op.k === 2) h.insertBounds(op.id, op.x0, op.z0, op.x1, op.z1);
      else sink += h.query(op.x0, op.z0, op.x1, op.z1).length;
    }
  };

  const runTyped = (): void => {
    const h = new TypedHash(4);
    for (const op of ops) {
      if (op.k === 0) h.clear();
      else if (op.k === 1) h.insertCircle(op.id, op.x, op.z, op.r);
      else if (op.k === 2) h.insertBounds(op.id, op.x0, op.z0, op.x1, op.z1);
      else {
        h.query(op.x0, op.z0, op.x1, op.z1);
        sink += h.outLen;
      }
    }
  };

  // ---- correctness: typed must reproduce the RECORDED results exactly ----
  {
    const h = new TypedHash(4);
    let checked = 0;
    for (const op of ops) {
      if (op.k === 0) h.clear();
      else if (op.k === 1) h.insertCircle(op.id, op.x, op.z, op.r);
      else if (op.k === 2) h.insertBounds(op.id, op.x0, op.z0, op.x1, op.z1);
      else {
        const got = h.query(op.x0, op.z0, op.x1, op.z1);
        if (h.outLen !== op.want.length) throw new Error(`typed len ${h.outLen} != ${op.want.length}`);
        for (let i = 0; i < op.want.length; i++)
          if (got[i] !== op.want[i]) throw new Error(`typed mismatch @${i}`);
        checked++;
      }
    }
    console.log(`ok: typed reproduces ${checked} recorded query results exactly`);
  }

  // ---- correctness: fast must reproduce the RECORDED results exactly ----
  {
    const h = new FastHash(4);
    let checked = 0;
    for (const op of ops) {
      if (op.k === 0) h.clear();
      else if (op.k === 1) h.insertCircle(op.id, op.x, op.z, op.r);
      else if (op.k === 2) h.insertBounds(op.id, op.x0, op.z0, op.x1, op.z1);
      else {
        const got = h.query(op.x0, op.z0, op.x1, op.z1);
        const want = op.want;
        if (got.length !== want.length) throw new Error(`len ${got.length} != ${want.length}`);
        for (let i = 0; i < want.length; i++)
          if (got[i] !== want[i]) throw new Error(`mismatch @${i}: ${got[i]} != ${want[i]}`);
        checked++;
      }
    }
    console.log(`ok: fast reproduces ${checked} recorded query results exactly`);
  }

  for (let i = 0; i < 5; i++) {
    runShipped();
    runFast();
    runTyped();
  }
  const time = (f: () => void): number => {
    const t = performance.now();
    for (let i = 0; i < reps; i++) f();
    return (performance.now() - t) / reps / ticks;
  };
  // interleave the three so a thermal drift hits all of them equally
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  for (let round = 0; round < 3; round++) {
    a.push(time(runShipped));
    b.push(time(runFast));
    c.push(time(runTyped));
  }
  const best = (xs: number[]): number => Math.min(...xs);

  console.log(
    JSON.stringify({
      file: file.split("/").pop(),
      ops: ops.length,
      ticks,
      ts_shipped_ms_per_tick: +best(a).toFixed(4),
      ts_fast_ms_per_tick: +best(b).toFixed(4),
      ts_typed_ms_per_tick: +best(c).toFixed(4),
      fast_speedup: +(best(a) / best(b)).toFixed(2),
      typed_speedup: +(best(a) / best(c)).toFixed(2),
      sink,
    }),
  );
}

main();
