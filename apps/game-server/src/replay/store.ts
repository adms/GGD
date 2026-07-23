/**
 * Replay storage: where recordings live, how they are listed, and when they are
 * deleted.
 *
 * DURABILITY. Recordings are plain files under `<replayDir>/<matchId>.jsonl`
 * while a match runs and `<matchId>.jsonl.gz` once it finishes. They therefore
 * survive a server restart, and — because the format is append-only JSONL — a
 * server killed MID-MATCH leaves a file that is still playable up to the last
 * complete line. There is no database and no index file to fall out of sync
 * with the directory: the directory IS the index.
 *
 * RETENTION (the named rule): keep the 200 most recent recordings, and delete
 * any recording older than 30 days — whichever prunes first. At the measured
 * ~60 KB gzipped per 4-minute 12-player match that ceiling is about 12 MB, so a
 * whole season of family playtests cannot fill a disk. Pruning runs at boot and
 * again after each match finalises, never on the tick path.
 *
 * PRIVACY. Recordings carry player display names, so nothing here is reachable
 * from a public route: the HTTP surface is `/_internal/replays…` (HMAC-signed,
 * the same private channel the platform uses to create matches) and the admin
 * console reaches it through the platform's admin-authenticated proxy.
 */
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip, gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { readFile } from "node:fs/promises";
import { decodeLines, type ReplayFooter, type ReplayHeader, type ReplayLine } from "./format";

/** Keep at most this many recordings (newest wins). */
export const RETAIN_MAX_FILES = 200;
/** Delete recordings older than this regardless of count. */
export const RETAIN_MAX_AGE_DAYS = 30;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** `GGD_REPLAY_DIR`, else `<repo>/data/replays`. */
export function replayDir(): string {
  return process.env.GGD_REPLAY_DIR ?? join(REPO_ROOT, "data", "replays");
}

/**
 * Filesystem-safe recording id. Match ids come from the platform (ULIDs) or the
 * dev path (`dev-xxxxxxxx`), but this is a path component built from a value
 * that once crossed the network, so it is sanitised rather than trusted.
 */
export function safeRecordingId(matchId: string): string {
  const cleaned = matchId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96);
  return cleaned.length > 0 ? cleaned : "unnamed";
}

export function livePath(dir: string, id: string): string {
  return join(dir, `${id}.jsonl`);
}
export function finalPath(dir: string, id: string): string {
  return join(dir, `${id}.jsonl.gz`);
}

/** One row of the admin 對戰回放 list. */
export interface ReplaySummary {
  id: string;
  matchId: string;
  startedAt: string;
  endedAt: string | null;
  /** false while the match is still running (or the server died mid-match). */
  complete: boolean;
  bytes: number;
  seed: number;
  contentVersion: string;
  buildStamp: string;
  arenaId: string;
  rounds: number;
  /** Sim ticks recorded; /30 gives seconds of match time. */
  ticks: number;
  durationSec: number;
  players: { seatId: number; teamId: number; displayName: string; isBot: boolean; championId: string }[];
  /** Winning team id, or null when the recording never reached a result. */
  winnerTeamId: number | null;
  faultCount: number;
}

export interface LoadedReplay {
  header: ReplayHeader;
  footer: ReplayFooter | null;
  lines: ReplayLine[];
  truncated: boolean;
  bytes: number;
}

async function readBody(path: string): Promise<string> {
  const buf = await readFile(path);
  return path.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
}

/** Resolve a recording id to whichever of the two file forms exists. */
export async function resolveRecordingPath(id: string): Promise<string | null> {
  const dir = replayDir();
  for (const p of [finalPath(dir, id), livePath(dir, id)]) {
    try {
      await stat(p);
      return p;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

/** Read + parse one recording in full. Throws when the id is unknown. */
export async function loadReplay(id: string): Promise<LoadedReplay> {
  const path = await resolveRecordingPath(safeRecordingId(id));
  if (!path) throw new Error(`no recording for "${id}"`);
  const [body, st] = await Promise.all([readBody(path), stat(path)]);
  const { lines, truncated } = decodeLines(body);
  const head = lines[0];
  if (!head || head.t !== "header") throw new Error(`recording "${id}" has no header line`);
  const foot = lines[lines.length - 1];
  return {
    header: head,
    footer: foot && foot.t === "footer" ? foot : null,
    lines,
    truncated,
    bytes: st.size,
  };
}

/**
 * Summarise a recording without materialising the whole input stream: only the
 * header (first line) and footer (last line) are needed, plus a count of digest
 * chunks for the tick total. Still reads the file once — recordings are tens of
 * KB, and the list is an admin page, not a hot path.
 */
export function summarise(id: string, bytes: number, lines: ReplayLine[]): ReplaySummary {
  const header = lines[0]!.t === "header" ? (lines[0] as { t: "header" } & ReplayHeader) : null;
  if (!header) throw new Error(`recording "${id}" has no header line`);
  const last = lines[lines.length - 1];
  const footer = last && last.t === "footer" ? last : null;
  let maxTick = 0;
  for (const l of lines) {
    if (l.t === "g") maxTick = Math.max(maxTick, l.k + l.w.length - 1);
    else if (l.t === "i" || l.t === "d" || l.t === "c" || l.t === "x") maxTick = Math.max(maxTick, l.k);
  }
  const ticks = footer ? footer.finalTick + 1 : maxTick + 1;
  const winner = footer?.teams.find((t) => t.placement === 1)?.teamId ?? null;
  return {
    id,
    matchId: header.matchId,
    startedAt: header.startedAt,
    endedAt: footer?.endedAt ?? null,
    complete: footer !== null,
    bytes,
    seed: header.seed,
    contentVersion: header.contentVersion,
    buildStamp: header.buildStamp,
    arenaId: header.arenaId,
    rounds: footer?.rounds ?? 0,
    ticks,
    durationSec: Math.round(ticks / 30),
    players: header.seats.map((s) => ({
      seatId: s.seatId,
      teamId: s.teamId,
      displayName: s.displayName,
      isBot: s.isBot,
      championId: s.championId,
    })),
    winnerTeamId: winner,
    faultCount: footer?.faultCount ?? 0,
  };
}

/** Every recording, newest first. A missing directory reads as empty. */
export async function listReplays(): Promise<ReplaySummary[]> {
  const dir = replayDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: ReplaySummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl") && !name.endsWith(".jsonl.gz")) continue;
    const id = name.replace(/\.jsonl(\.gz)?$/, "");
    // A finished match leaves BOTH forms only momentarily (gzip then unlink);
    // prefer the compressed one and skip the duplicate.
    if (name.endsWith(".jsonl") && names.includes(`${name}.gz`)) continue;
    try {
      const path = join(dir, name);
      const [body, st] = await Promise.all([readBody(path), stat(path)]);
      const { lines } = decodeLines(body);
      out.push(summarise(id, st.size, lines));
    } catch {
      // a half-written or corrupt file must not break the whole listing
    }
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return out;
}

/**
 * Apply the retention rule. Returns the ids deleted. Never touches a file that
 * is still being written (`skipIds` carries the live matches).
 */
export async function pruneReplays(skipIds: readonly string[] = []): Promise<string[]> {
  const dir = replayDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const skip = new Set(skipIds);
  const files: { id: string; name: string; mtime: number }[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl") && !name.endsWith(".jsonl.gz")) continue;
    const id = name.replace(/\.jsonl(\.gz)?$/, "");
    if (skip.has(id)) continue;
    try {
      const st = await stat(join(dir, name));
      files.push({ id, name, mtime: st.mtimeMs });
    } catch {
      /* vanished under us */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const cutoff = Date.now() - RETAIN_MAX_AGE_DAYS * 86_400_000;
  const doomed = files.filter((f, idx) => idx >= RETAIN_MAX_FILES || f.mtime < cutoff);
  const deleted: string[] = [];
  for (const f of doomed) {
    try {
      await rm(join(dir, f.name));
      deleted.push(f.id);
    } catch {
      /* already gone */
    }
  }
  return deleted;
}

/** Open the live append stream for a recording (creates the directory). */
export async function openRecordingStream(id: string): Promise<WriteStream> {
  const dir = replayDir();
  await mkdir(dir, { recursive: true });
  return createWriteStream(livePath(dir, id), { flags: "a" });
}

/** Compress a finished recording and drop the plain file. */
export async function compressRecording(id: string): Promise<void> {
  const dir = replayDir();
  const src = livePath(dir, id);
  const dst = finalPath(dir, id);
  await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(dst));
  await rm(src, { force: true });
}
