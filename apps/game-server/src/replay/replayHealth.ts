/**
 * replayHealth — the PROCESS-WIDE recording health counter (GH#170).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS (and what was measured before it did)
 * ---------------------------------------------------------------------------
 * GH#170 said 「正式機錄影可能仍在靜靜失敗」. It was measured, not guessed:
 * point `GGD_REPLAY_DIR` at a directory the process cannot create files in
 * (0555 — exactly what a docker bind mount created as root gives a container
 * running `USER node`) and run a match. The result:
 *
 *   MatchRecorder.open()  ->  a recorder (NOT null — the mkdir succeeds because
 *                             the directory already exists, and createWriteStream
 *                             fails ASYNCHRONOUSLY, after open() has returned)
 *   files on disk         ->  none, ever
 *   the only output       ->  ONE console.error, once, at match start
 *   GET /healthz          ->  { ok: true, … }   ← unchanged, forever
 *
 * So a shard whose recording is 100% broken was indistinguishable from a shard
 * nobody had played on yet. The admin 對戰回放 list showed an empty table, which
 * reads as 「還沒人打」, not 「every recording since the deploy was lost」.
 *
 * This is the same shape #207/#272 already paid for twice: 「唯一的輸出是一行
 * console.warn」 means nobody finds out. tickHealth.ts fixed it for sim ticks;
 * this file is deliberately the same shape (pure class + process singleton +
 * `snapshot()` rendered by /healthz + one grep-able fixed-format log line) so
 * this repo has ONE mechanism for 「something is failing quietly」, not three.
 *
 * ---------------------------------------------------------------------------
 * WHY A BOOT PROBE AND NOT JUST COUNTERS
 * ---------------------------------------------------------------------------
 * Counters only move when a match is played. A permissions problem introduced
 * by a deploy is present from second zero, and the owner deploys in the evening
 * and plays afterwards — so a counter-only design tells him at the START of the
 * family session that the session he is about to play will not be recorded, at
 * the earliest. `probeReplayDirWritable()` actually creates and unlinks a file
 * at boot, so the answer is in `/healthz` (and in the boot log) before anybody
 * connects. It is the only check that cannot be satisfied by a comment.
 *
 * ---------------------------------------------------------------------------
 * THE DECISION POINTS ARE KNOBS, NOT CONSTANTS (CLAUDE.md 第一守則)
 * ---------------------------------------------------------------------------
 * Three genuine 「A or B」 choices live here, so all three are env-settable and
 * reported back on /healthz (a knob whose value you cannot read is not a knob):
 *
 *   GGD_REPLAY_UNHEALTHY_AFTER   how many CONSECUTIVE matches may fail to record
 *                                before the shard reports degraded. Default 3 —
 *                                one failure can be a full disk during one
 *                                match; three in a row is a broken deploy.
 *   GGD_REPLAY_REQUIRED          whether recording is load-bearing on THIS
 *                                shard. Default 1 (it is: replay is the family
 *                                playtest's whole feedback channel, #175). Set 0
 *                                on a shard deliberately run without recording,
 *                                so it does not sit permanently yellow.
 *   GGD_REPLAY_HEALTHZ_STATUS    the HTTP STATUS /healthz answers with while
 *                                replay is degraded. Default 200 — see below.
 *
 * WHY 200 IS THE DEFAULT STATUS, deliberately. Recorder.ts's contract is 「a
 * broken recording must never break a game」. A liveness probe keyed on the
 * status code would invert exactly that: an unwritable replay mount would start
 * killing a game shard with twelve family members on it. So degradation is
 * reported in the BODY by default and the status code is opt-in for an operator
 * who has wired a *monitoring* probe (not a liveness probe) to it. The body
 * always tells the truth regardless of which one is chosen.
 */
import { replayDir } from "./store";

/**
 * The grep token, same role as TICK_SHED_LOG_TAG. One command, no guesswork:
 *
 *     docker logs ggd-game 2>&1 | grep ggd.replay
 */
export const REPLAY_LOG_TAG = "ggd.replay";

/** Log throttle, copied from tickHealth: first few in full, then every Nth. */
export const REPLAY_LOG_HEAD = 5;
export const REPLAY_LOG_EVERY = 50;

/** Where a failure happened. Every one of these is a real, reachable site. */
export type ReplayFailurePhase =
  | "probe" // boot writability check
  | "open" // could not open the stream at all (mkdir EACCES/ENOSPC)
  | "collision" // a second writer for the same recording id was refused
  | "write" // the WriteStream errored mid-match (the measured EACCES case)
  | "backlog" // our own guard dropped the recording (stalled device)
  | "seal" // footer/close threw
  | "compress" // gzip of a finished recording failed
  | "prune"; // retention failed

const PHASES: readonly ReplayFailurePhase[] = [
  "probe",
  "open",
  "collision",
  "write",
  "backlog",
  "seal",
  "compress",
  "prune",
];

/** Consecutive failed matches before the shard calls itself degraded. */
export const DEFAULT_UNHEALTHY_AFTER = 3;

function envInt(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  // An UPPER bound as well as a lower one (CLAUDE.md: validateField only
  // checked `min` until 2026-07-29, so 50 typed as 500 sailed through).
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function envBool(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export interface ReplayFailureRecord {
  phase: ReplayFailurePhase;
  /** recording id, or "" for process-level phases (probe/prune). */
  id: string;
  message: string;
  atMs: number;
}

export interface ReplayHealthSnapshot {
  /** false when this shard's recording is not working (and is required). */
  ok: boolean;
  /** human-readable reason `ok` is false, or null. */
  reason: string | null;
  /** the resolved directory recordings are written to. */
  dir: string;
  /** boot probe result: true/false, or null when it has not run yet. */
  writable: boolean | null;
  /** the errno/message the probe failed with, or null. */
  probeError: string | null;
  /** knobs, echoed back — a setting you cannot read is not a setting. */
  required: boolean;
  unhealthyAfter: number;
  degradedHealthzStatus: number;
  /** recorders opened (one per match that started recording). */
  opened: number;
  /** recordings sealed with a footer AND compressed — a real, playable tape. */
  recorded: number;
  /** total failure events across every phase. */
  failures: number;
  byPhase: Record<ReplayFailurePhase, number>;
  /** consecutive matches that failed to produce a tape; reset by a success. */
  consecutiveFailures: number;
  lastFailure: ReplayFailureRecord | null;
  lastRecordedAtMs: number | null;
  /**
   * Bytes actually handed to the write stream. The one number that cannot be
   * faked by a comment: `opened: 12, bytesWritten: 0` is the exact signature of
   * GH#170 and reads as damning at a glance.
   */
  bytesWritten: number;
}

export class ReplayHealth {
  private opened = 0;
  private recorded = 0;
  private failures = 0;
  private consecutive = 0;
  private bytes = 0;
  private lastFailure: ReplayFailureRecord | null = null;
  private lastRecordedAtMs: number | null = null;
  private writable: boolean | null = null;
  private probeError: string | null = null;
  private logged = 0;
  private readonly counts = new Map<ReplayFailurePhase, number>();

  /** A recorder was opened for a match. */
  noteOpened(): void {
    this.opened++;
  }

  /** Bytes handed to the stream. Called from the 500 ms flush, never per tick. */
  noteBytes(n: number): void {
    if (Number.isFinite(n) && n > 0) this.bytes += n;
  }

  /**
   * A recording was sealed and compressed — a real playable tape landed. This
   * is the ONLY thing that clears the consecutive counter. A successful flush
   * deliberately does not: with an unwritable directory every match still opens
   * and still buffers, so anything weaker than 「a tape exists」 would clear the
   * counter on precisely the failure this module was written for.
   */
  noteRecorded(nowMs: number = Date.now()): void {
    this.recorded++;
    this.consecutive = 0;
    this.lastRecordedAtMs = nowMs;
  }

  /**
   * Record a failure. Returns whether THIS event should be logged — the
   * throttle lives next to the counter it protects (tickHealth's lesson: an
   * unthrottled warn is as useless as no warn), and the counters count every
   * event regardless of what got logged.
   */
  noteFailure(
    phase: ReplayFailurePhase,
    id: string,
    err: unknown,
    nowMs: number = Date.now(),
  ): boolean {
    this.failures++;
    this.counts.set(phase, (this.counts.get(phase) ?? 0) + 1);
    // Phases that mean "this match produced no tape". `prune` is retention, not
    // recording, and `compress` leaves a playable .jsonl behind — neither says
    // the shard cannot record, so neither advances the consecutive counter.
    if (phase === "open" || phase === "collision" || phase === "write" || phase === "backlog" || phase === "seal") {
      this.consecutive++;
    }
    this.lastFailure = { phase, id, message: describe(err), atMs: nowMs };
    if (this.logged < REPLAY_LOG_HEAD || this.failures % REPLAY_LOG_EVERY === 0) {
      this.logged++;
      return true;
    }
    return false;
  }

  /** Result of the boot writability probe. */
  noteProbe(writable: boolean, err?: unknown): void {
    this.writable = writable;
    this.probeError = writable ? null : describe(err);
    if (!writable) this.noteFailure("probe", "", err);
  }

  snapshot(): ReplayHealthSnapshot {
    const required = envBool("GGD_REPLAY_REQUIRED", true);
    const unhealthyAfter = envInt("GGD_REPLAY_UNHEALTHY_AFTER", DEFAULT_UNHEALTHY_AFTER, 1, 1000);
    const byPhase = {} as Record<ReplayFailurePhase, number>;
    for (const p of PHASES) byPhase[p] = this.counts.get(p) ?? 0;

    let reason: string | null = null;
    if (this.writable === false) {
      reason = `replay directory is not writable: ${this.probeError ?? "unknown error"}`;
    } else if (this.consecutive >= unhealthyAfter) {
      reason =
        `${this.consecutive} consecutive recordings failed (>= ${unhealthyAfter}); ` +
        `last: ${this.lastFailure?.phase}: ${this.lastFailure?.message}`;
    }
    // `required: false` still REPORTS the reason — it only stops it counting as
    // unhealthy. Hiding the sentence too would recreate the silence.
    const ok = reason === null || !required;

    return {
      ok,
      reason,
      dir: replayDir(),
      writable: this.writable,
      probeError: this.probeError,
      required,
      unhealthyAfter,
      degradedHealthzStatus: degradedHealthzStatus(),
      opened: this.opened,
      recorded: this.recorded,
      failures: this.failures,
      byPhase,
      consecutiveFailures: this.consecutive,
      lastFailure: this.lastFailure,
      lastRecordedAtMs: this.lastRecordedAtMs,
      bytesWritten: this.bytes,
    };
  }

  /** Test-only: drop every counter (the process singleton never calls this). */
  reset(): void {
    this.opened = 0;
    this.recorded = 0;
    this.failures = 0;
    this.consecutive = 0;
    this.bytes = 0;
    this.lastFailure = null;
    this.lastRecordedAtMs = null;
    this.writable = null;
    this.probeError = null;
    this.logged = 0;
    this.counts.clear();
  }
}

/**
 * The status code /healthz answers with while replay is degraded. 200 by
 * default — see the module header for why a liveness probe must not be able to
 * kill a game shard over a best-effort recording.
 */
export function degradedHealthzStatus(): number {
  return envInt("GGD_REPLAY_HEALTHZ_STATUS", 200, 200, 599);
}

function describe(err: unknown): string {
  if (err === undefined || err === null) return "";
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

/**
 * ONE fixed-format line, every field `key=value` after the fixed tag, so
 * `grep ggd.replay` gives an operator the event AND the running totals without
 * opening anything. Pure, so its shape is asserted by a test and not by eye.
 */
export function formatReplayFailureLog(
  phase: ReplayFailurePhase,
  id: string,
  err: unknown,
  s: ReplayHealthSnapshot,
): string {
  return (
    `[${REPLAY_LOG_TAG}] phase=${phase} id=${id || "-"} dir=${s.dir} ` +
    `consecutive=${s.consecutiveFailures} failures=${s.failures} opened=${s.opened} ` +
    `recorded=${s.recorded} bytesWritten=${s.bytesWritten} ok=${s.ok} ` +
    `err=${JSON.stringify(describe(err))} — recording failed; the match is unaffected`
  );
}

/** The process-wide counter the recorder feeds and /healthz reads. */
export const replayHealth = new ReplayHealth();
