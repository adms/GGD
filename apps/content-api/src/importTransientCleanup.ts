import { lstatSync, opendirSync, rmdirSync, unlinkSync, type Dir } from "node:fs";
import { join } from "node:path";

const DAY = 24 * 60 * 60 * 1000;
export const IMPORT_TRANSIENT_RETENTION = { iconCacheMs: 30 * DAY, pendingMs: DAY } as const;
const HASH = /^[a-f0-9]{64}$/;
const PENDING = /^[a-f0-9]{64}\.pending-[a-f0-9-]{36}$/;
const CACHE = /^[a-f0-9]{64}(?:\.webp|\.json)?(?:\.tmp-[a-f0-9-]{36})?$/;
type Entry = { path: string; kind: "scan" | "cache" | "pending-file" | "pending-dir" };
export interface TransientCleanupResult { scanned: number; removed: number; bytes: number; errors: number; cycleComplete: boolean }

function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
function directory(path: string): boolean {
  try { return lstatSync(path).isDirectory(); } catch (error) { if (missing(error)) return false; throw error; }
}
function* entries(path: string): Generator<{ path: string; name: string }> {
  if (!directory(path)) return; // lstat deliberately refuses directory symlinks.
  let dir: Dir;
  try { dir = opendirSync(path); } catch (error) { if (missing(error)) return; throw error; }
  try {
    for (let entry = dir.readSync(); entry; entry = dir.readSync()) yield { path: join(path, entry.name), name: entry.name };
  } finally { dir.closeSync(); }
}

/** Only reconstructible icon caches and uncommitted work trees are eligible.
 * Drafts carry their own image bytes; immutable versions contain complete assets.
 * Never walk committed versions, official staging, candidates, operations or history.
 * A cursor survives ticks so a large directory cannot starve entries at its end.
 */
export class ImportTransientCleanup {
  private cursor: Generator<Entry> | undefined;
  constructor(private readonly root: string, private readonly now: () => number = Date.now) {}

  private *pending(path: string, depth = 0): Generator<Entry> {
    // A corrupt/deep tree is retained for inspection, not recursively erased.
    if (depth > 16) return;
    for (const entry of entries(path)) {
      yield { path: entry.path, kind: "scan" };
      if (directory(entry.path)) yield* this.pending(entry.path, depth + 1);
      else yield { path: entry.path, kind: "pending-file" };
    }
    yield { path, kind: "pending-dir" };
  }

  private *walk(): Generator<Entry> {
    const objects = join(this.root, "objects");
    if (directory(objects)) for (const group of ["icon-sources", "icons", "icon-receipts"]) {
      for (const entry of entries(join(objects, group))) yield { path: entry.path, kind: CACHE.test(entry.name) ? "cache" : "scan" };
    }
    for (const work of entries(join(this.root, "works"))) {
      yield { path: work.path, kind: "scan" };
      if (!HASH.test(work.name) || !directory(work.path)) continue;
      for (const version of entries(join(work.path, "versions"))) {
        yield { path: version.path, kind: "scan" };
        if (!PENDING.test(version.name) || !directory(version.path)) continue;
        if (this.now() - lstatSync(version.path).mtimeMs >= IMPORT_TRANSIENT_RETENTION.pendingMs) yield* this.pending(version.path);
      }
    }
  }

  /** At most 256 directory entries, 16 removals, and 10 ms of scheduling work.
   * Each removal is one file or an empty directory; there is no recursive rm.
   * Filesystem syscalls themselves cannot be preempted by a JS deadline.
   */
  step(): TransientCleanupResult {
    const result: TransientCleanupResult = { scanned: 0, removed: 0, bytes: 0, errors: 0, cycleComplete: false };
    const deadline = performance.now() + 10;
    this.cursor ??= this.walk();
    while (result.scanned < 256 && result.removed < 16 && performance.now() < deadline) {
      try {
        const next = this.cursor.next();
        if (next.done) { this.cursor = undefined; result.cycleComplete = true; break; }
        result.scanned++;
        const { path, kind } = next.value;
        if (kind === "scan") continue;
        const stat = lstatSync(path);
        if (kind === "pending-dir") {
          if (!stat.isDirectory()) continue;
          try { rmdirSync(path); result.removed++; } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
        } else {
          if (!stat.isFile()) continue; // No symlink traversal/deletion.
          const age = kind === "cache" ? IMPORT_TRANSIENT_RETENTION.iconCacheMs : IMPORT_TRANSIENT_RETENTION.pendingMs;
          if (this.now() - stat.mtimeMs < age) continue;
          unlinkSync(path); result.removed++; result.bytes += stat.size;
        }
      } catch (error) {
        if (!missing(error)) result.errors++;
        // A failed directory read may have closed the generator. Start a fresh
        // cycle on the next tick, never retry indefinitely in this tick.
        this.close(); break;
      }
    }
    return result;
  }

  close(): void { this.cursor?.return(undefined); this.cursor = undefined; }
}
