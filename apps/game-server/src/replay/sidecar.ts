/**
 * The replay-list INDEX (task C).
 *
 * WHAT WAS WRONG. `listReplays()` opens EVERY recording, gunzips it
 * SYNCHRONOUSLY and `JSON.parse`s every line of it, just to read the first and
 * last line. Measured on this box, 2026-07-30:
 *
 *   91 real recordings (132 MB, mostly plain)  -> 1.05-1.28 s, max block 82 ms
 *   200 recordings (the RETAIN_MAX_FILES ceiling), all .jsonl.gz, 27 MB
 *                                              -> 2.53-2.81 s, max block 90 ms,
 *                                                 19-21 separate blocks > 33.3 ms
 *
 * Those blocks are not "an admin page is slow". `handleInternalReplays` is
 * served by the SAME `http.createServer` the Colyseus transport is mounted on
 * (index.ts), so every one of them is time the 30 Hz tick loop of every live
 * match on the shard could not turn. A single block never reached the 183 ms
 * `planTicks` shed threshold (5 × 33.33 ms of catch-up + one more tick), so no
 * tick is DROPPED — but the match spends that window running in catch-up bursts,
 * which is exactly the 不順暢 the owner is measuring by minimum FPS, not mean.
 *
 * THE DESIGN, AND WHY IT IS A CACHE AND NOT AN AUTHORITY. store.ts's header
 * makes a promise worth keeping: "there is no database and no index file to fall
 * out of sync with the directory: the directory IS the index." This file does
 * not break that promise, because the index is never trusted on its own. Every
 * list call still does `readdir` + `stat` (measured 1.5-2.4 ms for 200 files)
 * and keeps a cached row ONLY when that file's `size` AND `mtimeMs` still match
 * what was cached. Anything new, changed, or vanished is re-derived from the
 * file itself. So:
 *
 *   - a recording deleted behind our back disappears from the list (its id is
 *     not in the directory any more);
 *   - a recording that appeared behind our back is summarised and listed;
 *   - a recording that GREW behind our back (a live match flushing every 500 ms)
 *     is re-summarised, because its size and mtime moved;
 *   - a corrupt or missing index costs one slow list, not a wrong list.
 *
 * The index lives at `<replayDir>/.index.json`. The leading dot keeps it outside
 * the `.jsonl` / `.jsonl.gz` filter every reader AND `pruneReplays` uses, so it
 * can never be mistaken for a recording nor pruned as one — the same trick
 * `probeReplayDirWritable` already uses for its `.probe` file.
 *
 * VISIBILITY. This changes performance only. The replay list is, and stays,
 * `/_internal/replays` — HMAC-signed, admin-proxied, never a public route — so
 * the owner's 「先不開放給玩家」 is already the shipped behaviour and nothing here
 * relaxes it.
 */
import { readdir, readFile, rename, stat, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { decodeLines } from "./format";
import { gunzipSync } from "node:zlib";
import { listReplays, replayDir, summarise, type ReplaySummary } from "./store";

/** Bumped when the cached row shape changes; an older index is discarded whole. */
export const SIDECAR_VERSION = 2;

export const SIDECAR_NAME = ".index.json";

export function sidecarPath(dir: string = replayDir()): string {
  return join(dir, SIDECAR_NAME);
}

/**
 * One cached row plus the two facts that decide whether it may be reused.
 * `bytes` alone is not enough: an append that happens to land on the same length
 * is unlikely but a REWRITE at the same length is not, and mtime costs nothing
 * extra because the `stat` is already being made for `bytes`.
 */
export interface SidecarEntry {
  id: string;
  /** Directory entry the row was derived from (`x.jsonl` or `x.jsonl.gz`). */
  name: string;
  bytes: number;
  mtimeMs: number;
  row: ReplaySummary;
}

export interface Sidecar {
  version: number;
  entries: SidecarEntry[];
}

/**
 * The directory entries a listing is allowed to consider, with the SAME filter
 * and the same "prefer the .gz of a momentarily-duplicated pair" rule
 * `listReplays` applies. Duplicating that rule would be a bug farm, so this is
 * the one place it lives for the indexed path and `listReplaysIndexed` is the
 * only caller.
 */
function listableNames(names: readonly string[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl") && !name.endsWith(".jsonl.gz")) continue;
    if (name.endsWith(".jsonl") && names.includes(`${name}.gz`)) continue;
    out.push({ id: name.replace(/\.jsonl(\.gz)?$/, ""), name });
  }
  return out;
}

/** Read the index. A missing, unreadable, corrupt or stale-version file reads as empty. */
export async function readSidecar(dir: string = replayDir()): Promise<Sidecar> {
  try {
    const parsed = JSON.parse(await readFile(sidecarPath(dir), "utf8")) as Sidecar;
    if (!parsed || parsed.version !== SIDECAR_VERSION || !Array.isArray(parsed.entries)) {
      return { version: SIDECAR_VERSION, entries: [] };
    }
    return parsed;
  } catch {
    return { version: SIDECAR_VERSION, entries: [] };
  }
}

/**
 * Replace the index atomically. Write-then-rename, because a torn index read by
 * a concurrent list would otherwise cost a full rescan on every subsequent call
 * until something rewrote it. Never throws: the index is an optimisation, and a
 * read-only replay mount must degrade to "slow list", not "no list" (the GH#170
 * posture, verbatim).
 */
export async function writeSidecar(sc: Sidecar, dir: string = replayDir()): Promise<void> {
  const dst = sidecarPath(dir);
  const tmp = `${dst}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(sc));
    await rename(tmp, dst);
  } catch {
    await rm(tmp, { force: true }).catch(() => {});
  }
}

/** Summarise ONE recording the slow way — the fallback for a cache miss. */
async function summariseFile(dir: string, id: string, name: string, bytes: number): Promise<ReplaySummary> {
  const buf = await readFile(join(dir, name));
  const body = name.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  const { lines } = decodeLines(body);
  return summarise(id, bytes, lines);
}

export interface IndexedListResult {
  replays: ReplaySummary[];
  /** How many rows came from the index (0 on a cold or drifted index). */
  cached: number;
  /** How many recordings had to be opened and parsed. */
  parsed: number;
}

/**
 * The list `handleInternalReplays` should call. Identical OUTPUT to
 * `listReplays()` — same rows, same order — at a fraction of the event-loop cost
 * whenever the directory has not changed.
 */
export async function listReplaysIndexed(dir: string = replayDir()): Promise<IndexedListResult> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { replays: [], cached: 0, parsed: 0 };
  }
  const listable = listableNames(names);
  const sc = await readSidecar(dir);
  const cache = new Map(sc.entries.map((e) => [e.id, e]));

  const entries: SidecarEntry[] = [];
  let cached = 0;
  let parsed = 0;
  let dirty = sc.entries.length !== listable.length;

  // `stat` for every listable file. This is the reconciliation, and it is the
  // reason a row can never outlive the file it describes: an id absent from
  // `listable` is simply never visited, so it cannot reach the output.
  const stats = await Promise.all(
    listable.map(async (f) => {
      try {
        return { ...f, st: await stat(join(dir, f.name)) };
      } catch {
        return null; // vanished between readdir and stat
      }
    }),
  );

  for (const f of stats) {
    if (!f) {
      dirty = true;
      continue;
    }
    const hit = cache.get(f.id);
    if (hit && hit.name === f.name && hit.bytes === f.st.size && hit.mtimeMs === f.st.mtimeMs) {
      entries.push(hit);
      cached++;
      continue;
    }
    dirty = true;
    try {
      const row = await summariseFile(dir, f.id, f.name, f.st.size);
      entries.push({ id: f.id, name: f.name, bytes: f.st.size, mtimeMs: f.st.mtimeMs, row });
      parsed++;
    } catch {
      // half-written or corrupt: must not break the whole listing (listReplays
      // swallows the same case, and this path must not be MORE forgiving than
      // the authority it is caching, or the two would disagree).
    }
  }

  if (dirty) await writeSidecar({ version: SIDECAR_VERSION, entries }, dir);

  const replays = entries.map((e) => e.row);
  replays.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return { replays, cached, parsed };
}

/**
 * Fold ONE finished recording into the index without reading it back.
 *
 * This is the 「寫入時更新」 half. `MatchRecorder.finish()` already holds the
 * header and the footer it just wrote, so the row can be built from memory: no
 * readFile, no gunzipSync, no JSON.parse of a match that this process just
 * spent four minutes producing. Only `stat` touches the disk.
 *
 * Best-effort by construction — a failure here costs the NEXT list one parse of
 * one file, which is precisely what would have happened without an index at all.
 */
export async function upsertSidecarRow(
  id: string,
  name: string,
  row: ReplaySummary,
  dir: string = replayDir(),
): Promise<void> {
  try {
    const st = await stat(join(dir, name));
    const sc = await readSidecar(dir);
    const entries = sc.entries.filter((e) => e.id !== id);
    entries.push({ id, name, bytes: st.size, mtimeMs: st.mtimeMs, row: { ...row, bytes: st.size } });
    await writeSidecar({ version: SIDECAR_VERSION, entries }, dir);
  } catch {
    /* the index is an optimisation; a match must never fail because of it */
  }
}

/** Drop ids the retention rule deleted. Cheap, and keeps the index from growing. */
export async function forgetSidecarRows(ids: readonly string[], dir: string = replayDir()): Promise<void> {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  const sc = await readSidecar(dir);
  if (!sc.entries.some((e) => drop.has(e.id))) return;
  await writeSidecar({ version: SIDECAR_VERSION, entries: sc.entries.filter((e) => !drop.has(e.id)) }, dir);
}

/** Rebuild from scratch, ignoring whatever is on disk. Used by tests and by boot repair. */
export async function rebuildSidecar(dir: string = replayDir()): Promise<number> {
  const rows = await listReplays();
  const entries: SidecarEntry[] = [];
  for (const row of rows) {
    for (const name of [`${row.id}.jsonl.gz`, `${row.id}.jsonl`]) {
      try {
        const st = await stat(join(dir, name));
        entries.push({ id: row.id, name, bytes: st.size, mtimeMs: st.mtimeMs, row });
        break;
      } catch {
        /* try the other form */
      }
    }
  }
  await writeSidecar({ version: SIDECAR_VERSION, entries }, dir);
  return entries.length;
}
