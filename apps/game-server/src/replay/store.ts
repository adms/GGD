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
 * RETENTION: two INDEPENDENT rules — a file-count ceiling and an age cutoff —
 * whichever prunes first, both configurable (`config.replay@1`) and both
 * shipping as **0 = unlimited / never delete** (GH#498, owner 2026-08-21
 * 「超過幾天的錄影一律刪掉 預設不刪除」). Pruning runs at boot and again after
 * each match finalises, never on the tick path.
 *
 * ⚠️ THE SHIPPED DEFAULT IS THEREFORE UNBOUNDED GROWTH. At the measured ~60 KB
 * gzipped per 4-minute 12-player match that is ~4 MB per hundred matches, which
 * is why it is safe to ship — but "safe" is a rate, not a bound, and the
 * production docker data-root lives on the SAME disk as `data/replays`. So the
 * brake is `replayStorage()` below, surfaced on the admin 對戰回放 page: the
 * owner can see the number climb before it matters. ⛔ Do not tighten the
 * default back without removing that display's reason to exist.
 *
 * PRIVACY. Recordings carry player display names, so nothing here is reachable
 * from a public route: the HTTP surface is `/_internal/replays…` (HMAC-signed,
 * the same private channel the platform uses to create matches) and the admin
 * console reaches it through the platform's admin-authenticated proxy.
 */
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip, gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { readFile } from "node:fs/promises";
import { decodeLines, type ReplayFooter, type ReplayHeader, type ReplayLine } from "./format";
import { DEFAULT_REPLAY_POLICY, retainIsUnlimited } from "@ggd/shared/content";
import { replayPolicy } from "./policy";

/**
 * 出貨的保留量。**這兩個常數已經不是權威** —— 權威是
 * `config.replay@1` 的 `retainMaxFiles` / `retainMaxAgeDays`，而
 * `DEFAULT_REPLAY_POLICY` 是缺文件時的退路。留在這裡只為了讓既有的 import
 * （測試、sidecar 的註解）還讀得到同一個數字，`replayPolicyShipped.test.ts`
 * 釘住兩邊相等，所以它們不可能各自漂走。
 *
 * ⚠️ GH#498 之後這兩個出貨值都是 **0（＝不限）**，所以任何把它們當成「上限」
 * 拿去比大小的程式碼都是錯的 —— 要問「是不是不限」請用 `retainIsUnlimited()`。
 */
export const RETAIN_MAX_FILES = DEFAULT_REPLAY_POLICY.retainMaxFiles;
/** 同上：出貨的天數，權威在 `config.replay@1`。 */
export const RETAIN_MAX_AGE_DAYS = DEFAULT_REPLAY_POLICY.retainMaxAgeDays;

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
  // 後台可調 (config.replay@1)。讀在這裡而不是模組載入時，所以 owner 改了保留量
  // 之後**下一次**保留掃描就照新的跑，不必等到重新 import 這個模組。
  const { retainMaxFiles, retainMaxAgeDays } = replayPolicy();
  // GH#498 — **0 = 不限／不刪**（出貨值，owner 2026-08-21「預設不刪除」）。
  // ⚠️ 兩條規則各自獨立地判斷 0：只讓天數認得 0，第 201 場照樣會刪掉第 1 場。
  // ⛔ 不要寫成 `idx >= (retainMaxFiles || Infinity)` —— 那個寫法把「0」和
  // 「NaN／undefined」混成同一件事，而壞掉的設定應該退回出貨值（clampInt 的事），
  // 不是意外地變成「不限」。
  const tooMany = retainIsUnlimited(retainMaxFiles)
    ? () => false
    : (idx: number) => idx >= retainMaxFiles;
  const tooOld = retainIsUnlimited(retainMaxAgeDays)
    ? () => false
    : (mtime: number) => mtime < Date.now() - retainMaxAgeDays * 86_400_000;
  const doomed = files.filter((f, idx) => tooMany(idx) || tooOld(f.mtime));
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

/** 錄影目錄現在佔了多少磁碟，以及那顆碟還剩多少 (GH#498)。 */
export interface ReplayStorage {
  /** 錄影目錄的絕對路徑（`GGD_REPLAY_DIR` 或 `<repo>/data/replays`）。 */
  dir: string;
  /** 目錄裡的錄影檔數（`.jsonl` / `.jsonl.gz`，⛔ 不含 `.index.json` / `.probe`）。 */
  files: number;
  /** 那些檔案的位元組總和。 */
  bytes: number;
  /** 這顆檔案系統剩餘可用位元組；量不到時 null。 */
  freeBytes: number | null;
  /** 這顆檔案系統的總容量；量不到時 null。 */
  totalBytes: number | null;
  /** 現在生效的保留量（0 = 不限），讓後台不必自己再讀一次設定。 */
  retainMaxFiles: number;
  retainMaxAgeDays: number;
}

/**
 * GH#498 的**煞車**。
 *
 * owner 2026-08-21 要「預設不刪除」，而不刪 = 無限成長。這個函式存在的唯一理由
 * 是讓那個成長**在畫面上看得見** —— 沒有它，「預設不刪」會在某一天變成
 * 「磁碟爆掉、網站 502」，而中間沒有任何一刻有人知道。
 *
 * ⚠️ **`freeBytes` 量的是整顆檔案系統，不是錄影目錄。** 那是刻意的，而且是這裡
 * 唯一真正重要的決定：正式機的 docker data-root 和 `data/replays` 在**同一顆碟**
 * （`/data`，sdb），所以「錄影還能長多久」的答案取決於 **docker 也在吃的那個
 * 剩餘量**，不是錄影自己佔了多少。只報自己佔多少 = 又一個只驗「名詞」的儀表
 * （2026-08-02 那四項後置條件的形狀）。
 *
 * fail-soft：`statfs` 在某些容器/檔案系統上會丟，而一個算不出剩餘空間的儀表
 * ⛔ 不可以讓回放列表整頁失敗。量不到就回 null，後台那一格印「(量不到)」。
 */
export async function replayStorage(): Promise<ReplayStorage> {
  const dir = replayDir();
  const { retainMaxFiles, retainMaxAgeDays } = replayPolicy();
  let files = 0;
  let bytes = 0;
  try {
    const names = await readdir(dir);
    for (const name of names) {
      if (!name.endsWith(".jsonl") && !name.endsWith(".jsonl.gz")) continue;
      try {
        const st = await stat(join(dir, name));
        files++;
        bytes += st.size;
      } catch {
        /* vanished under us */
      }
    }
  } catch {
    /* directory not created yet — 0 files, 0 bytes is the honest answer */
  }
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  try {
    const fs = await statfs(dir);
    freeBytes = Number(fs.bavail) * Number(fs.bsize);
    totalBytes = Number(fs.blocks) * Number(fs.bsize);
  } catch {
    /* not every filesystem/container answers statfs; the display says so */
  }
  return { dir, files, bytes, freeBytes, totalBytes, retainMaxFiles, retainMaxAgeDays };
}

/**
 * Can this process actually create a file here? (GH#170)
 *
 * WHY A REAL WRITE AND NOT `access(dir, W_OK)`. `access` asks the kernel about
 * the permission BITS; it answers "yes" on a read-only mount, on a filesystem
 * that is full, and on the container/host uid mismatch that motivated this
 * whole ticket is the only case it does catch. The measured GH#170 failure is
 * EACCES on file CREATE inside a directory whose bits look fine to a different
 * uid — so the only check worth trusting is the one that performs the actual
 * syscall the recorder performs. It creates a uniquely-named probe file and
 * unlinks it, so it can never be mistaken for a recording (the `.probe`
 * extension is also outside the `.jsonl`/`.jsonl.gz` filter every reader uses).
 *
 * Returns the error rather than throwing: the caller's job is to COUNT this,
 * and a boot probe that can throw is a boot probe that can crash a shard over
 * a best-effort feature.
 */
export async function probeReplayDirWritable(): Promise<{ ok: true } | { ok: false; err: unknown }> {
  const dir = replayDir();
  const path = join(dir, `.write-probe-${process.pid}-${Date.now()}.probe`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, "ggd-replay-write-probe\n", { flag: "w" });
    return { ok: true };
  } catch (err) {
    return { ok: false, err };
  } finally {
    await rm(path, { force: true }).catch(() => {});
  }
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
