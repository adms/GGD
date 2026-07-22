/**
 * UNDO STORE — because this repo has NO VERSION CONTROL (task #65 is still
 * open) and has already lost irreplaceable files once (the BGM render
 * overwrote the originals in place with nothing to restore from).
 *
 * An editor that can overwrite content is a data-loss risk with no undo, so
 * EVERY destructive content-api operation takes a timestamped snapshot of the
 * bytes it is about to destroy, BEFORE it destroys them:
 *
 *     <backupDir>/<collection>/<id>/<YYYY-MM-DDTHH-mm-ss-SSSZ>.json
 *
 * Properties that make this a real safety net rather than a gesture:
 *   • it snapshots the FILE BYTES already on disk, not the doc the client sent,
 *     so it captures whatever was really there — including hand-edits and
 *     content the editor cannot represent;
 *   • it runs before the write AND before a delete, so both are reversible;
 *   • restoring is itself a write, so it also snapshots — undo is undoable;
 *   • filenames sort lexicographically by time, so "newest" is a sort, not a
 *     stat() race;
 *   • the store lives OUTSIDE content/ (default: the git-ignored data/ runtime
 *     store), so backups never enter the deployable tree, never reach an image,
 *     and never confuse the index/manifest rebuild.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";

/** How many snapshots to keep per document before the oldest are dropped. */
export const MAX_SNAPSHOTS = 50;

/** Exactly the filenames this module produces — nothing else may be read. */
const SNAPSHOT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?\.json$/;

export interface Snapshot {
  /** bare filename, e.g. "2026-07-22T09-31-05-123Z.json" */
  readonly file: string;
  /** epoch ms parsed back out of the filename */
  readonly at: number;
  readonly bytes: number;
}

/** `Date` → the sortable, filesystem-safe stem used for snapshot filenames. */
export function snapshotStem(at: Date): string {
  return at.toISOString().replace(/:/g, "-").replace(/\./g, "-");
}

/** Parse a snapshot filename back to epoch ms; NaN when it is not one of ours. */
export function snapshotTime(file: string): number {
  if (!SNAPSHOT_RE.test(file)) return NaN;
  const stem = file.replace(/(-\d+)?\.json$/, "");
  const iso = stem.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1T$2:$3:$4.$5Z",
  );
  const t = Date.parse(iso);
  return Number.isNaN(t) ? NaN : t;
}

/** `<backupDir>/<collection>/<id>`, path-confined to the backup root. */
function docDir(backupDir: string, collection: string, id: string): string {
  const root = resolve(backupDir);
  const dir = resolve(root, collection, id);
  if (!dir.startsWith(root + sep)) throw new Error("path escapes backup root");
  return dir;
}

/**
 * Copy `sourceFile` into the undo store. No-op (returns null) when the file
 * does not exist yet — creating a document destroys nothing.
 *
 * NEVER throws into the caller's write path: losing a backup must not block a
 * legitimate edit, but it must be visible, so failures are reported through
 * `onError` instead of being swallowed.
 */
export function snapshotFile(
  backupDir: string,
  collection: string,
  id: string,
  sourceFile: string,
  opts: { now?: () => Date; onError?: (e: unknown) => void } = {},
): Snapshot | null {
  if (!existsSync(sourceFile)) return null;
  try {
    const dir = docDir(backupDir, collection, id);
    mkdirSync(dir, { recursive: true });
    const stem = snapshotStem((opts.now ?? (() => new Date()))());
    let file = `${stem}.json`;
    for (let n = 1; existsSync(join(dir, file)); n++) file = `${stem}-${n}.json`;
    // copy → rename so a reader never sees a half-written snapshot
    const tmp = join(dir, `.tmp-${process.pid}-${file}`);
    copyFileSync(sourceFile, tmp);
    renameSync(tmp, join(dir, file));
    prune(dir);
    return { file, at: snapshotTime(file), bytes: statSync(join(dir, file)).size };
  } catch (e) {
    opts.onError?.(e);
    return null;
  }
}

/** Snapshot arbitrary text (used for the "state before a restore" record). */
export function snapshotText(
  backupDir: string,
  collection: string,
  id: string,
  text: string,
  opts: { now?: () => Date; onError?: (e: unknown) => void } = {},
): Snapshot | null {
  try {
    const dir = docDir(backupDir, collection, id);
    mkdirSync(dir, { recursive: true });
    const stem = snapshotStem((opts.now ?? (() => new Date()))());
    let file = `${stem}.json`;
    for (let n = 1; existsSync(join(dir, file)); n++) file = `${stem}-${n}.json`;
    const tmp = join(dir, `.tmp-${process.pid}-${file}`);
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, join(dir, file));
    prune(dir);
    return { file, at: snapshotTime(file), bytes: Buffer.byteLength(text) };
  } catch (e) {
    opts.onError?.(e);
    return null;
  }
}

function prune(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => SNAPSHOT_RE.test(f))
    .sort();
  for (const stale of files.slice(0, Math.max(0, files.length - MAX_SNAPSHOTS))) {
    rmSync(join(dir, stale), { force: true });
  }
}

/** Snapshots for one document, NEWEST FIRST. Empty when there are none. */
export function listSnapshots(backupDir: string, collection: string, id: string): Snapshot[] {
  let dir: string;
  try {
    dir = docDir(backupDir, collection, id);
  } catch {
    return [];
  }
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => SNAPSHOT_RE.test(f))
    .sort()
    .reverse()
    .map((file) => ({ file, at: snapshotTime(file), bytes: statSync(join(dir, file)).size }));
}

/**
 * Read one snapshot's bytes. `file` must be a name this module produced — the
 * regex is the path-traversal defence (no separators, no dots, no `..`).
 */
export function readSnapshot(
  backupDir: string,
  collection: string,
  id: string,
  file: string,
): string | null {
  if (!SNAPSHOT_RE.test(file)) return null;
  let dir: string;
  try {
    dir = docDir(backupDir, collection, id);
  } catch {
    return null;
  }
  const p = join(dir, file);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}
