/**
 * MatchRecorder — the tick-path half of the replay feature.
 *
 * THE COST CONSTRAINT IS THE DESIGN. This runs inside a live match with real
 * family members on it, so the tick path may do NO synchronous disk I/O and no
 * per-event syscall. What `record*` does is push a string onto an array. A
 * detached 500 ms interval joins the array and hands it to a Node WriteStream,
 * which is itself non-blocking; the actual write happens on the event loop
 * between ticks. If the stream ever errors the recorder disables itself and the
 * match carries on — a broken recording must never break a game.
 *
 * WHAT IS RECORDED, AND WHY IT IS EVERY SEAT AND NOT JUST THE HUMANS.
 * Bot decisions are provably a pure function of sim state (AIDriver has no rng,
 * no clock, no I/O, and its replan gate is `tick % N === seatId % N` on the sim
 * tick), so in principle they replay for free and only human input needs
 * storing. We store every seat's frame anyway, and the reason is the owner's
 * actual use case: he watches a replay AFTER changing something. Recomputing bot
 * frames would make every AI tweak silently rewrite the recorded past, and the
 * divergence alarm would fire on matches that were recorded perfectly. Storing
 * the frames removes the AI brain, the input mailbox and the driver stack from
 * the replay's trusted base entirely. Measured cost: ~40 KB gzipped for a
 * 4.3-minute 12-bot match — the most worthwhile 40 KB in the project.
 *
 * Empty frames are skipped, which drops the ~72% of ticks that carry only the
 * synthetic `stop` order `freezeCombatIntent` stamps on every seat during every
 * non-combat tick — that order is DERIVED (a pure function of the frame and
 * `world.combatActive`), so re-recording it would only make the file bigger.
 */
import type { WriteStream } from "node:fs";
import type { SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import type { Cheat } from "@ggd/shared/protocol/messages";
import type { MatchController, MatchRecorderSink } from "../match/MatchController";
import { hostDigest } from "./digest";
import {
  DIGEST_CHUNK_TICKS,
  encodeLine,
  type ReplayFooter,
  type ReplayHeader,
  type ReplayLine,
} from "./format";
import { compressRecording, openRecordingStream, pruneReplays, safeRecordingId } from "./store";

/** How often the buffered lines are handed to the write stream. */
const FLUSH_MS = 500;

/**
 * Hard ceiling on buffered lines between flushes. Reaching it means the disk
 * stopped accepting writes; we drop the recording rather than grow without
 * bound inside a live match.
 */
const MAX_BUFFERED_LINES = 200_000;

/** Recording ids currently being written — pruning must not touch these. */
const liveRecordings = new Set<string>();

export class MatchRecorder implements MatchRecorderSink {
  readonly id: string;
  private buffer: string[] = [];
  private stream: WriteStream | null = null;
  private timer: NodeJS.Timeout | null = null;
  private disabled = false;
  private closed = false;
  /** Digests for the current chunk; flushed as one `g` line every 300 ticks. */
  private chunkFirstTick = 0;
  private worldChunk: number[] = [];
  private hostChunk: number[] = [];
  private lastTick = -1;
  private lastWorldDigest = 0;
  private lastHostDigest = 0;
  private lastPhase = "";
  private lastRound = -1;

  private constructor(matchId: string) {
    this.id = safeRecordingId(matchId);
  }

  /**
   * Open a recorder and write the header. Any failure (unwritable directory,
   * full disk) returns null — recording is best-effort, the match is not.
   */
  static async open(matchId: string, header: ReplayHeader): Promise<MatchRecorder | null> {
    const rec = new MatchRecorder(matchId);
    try {
      rec.stream = await openRecordingStream(rec.id);
    } catch (err) {
      console.error(`[replay] could not open a recording for ${matchId}; this match will not be recorded`, err);
      return null;
    }
    rec.stream.on("error", (err) => {
      if (rec.disabled) return;
      rec.disabled = true;
      console.error(`[replay] write failed for ${matchId}; recording stopped (the match is unaffected)`, err);
    });
    liveRecordings.add(rec.id);
    rec.push({ t: "header", ...header });
    rec.timer = setInterval(() => rec.flush(), FLUSH_MS);
    // Never hold the process open for a recorder.
    rec.timer.unref?.();
    return rec;
  }

  // ---------- tick path (must stay allocation-light and synchronous-free) ----

  onIntent(tick: number, seatId: SeatId, frame: IntentFrame): void {
    if (frame.order === undefined && frame.aim === undefined && frame.commands.length === 0) return;
    this.push({ t: "i", k: tick, s: seatId, f: frame });
  }

  onDriverSwap(tick: number, seatId: SeatId, kind: "human" | "ai"): void {
    this.push({ t: "d", k: tick, s: seatId, v: kind });
  }

  onTickEnd(ctl: MatchController): void {
    if (this.disabled || this.closed) return;
    // digest() reflects the tick that just ran; world.tick has already advanced
    // past it inside step(), so the checkpoint is labelled with the tick index
    // whose RESULT it describes.
    const tick = ctl.world.tick - 1;
    // A contained sim-step fault means `world.step()` never ran, so the tick did
    // NOT advance. Recording a second checkpoint for the same index would break
    // the chunk's tick contiguity (chunk arrays are positional), so skip it —
    // and if playback does not fault at the same place, its tick DOES advance
    // and the comparison mismatches, which is exactly the alarm we want.
    if (this.lastTick >= 0 && tick <= this.lastTick) return;
    if (this.worldChunk.length === 0) this.chunkFirstTick = tick;
    const wd = ctl.world.digest();
    const hd = hostDigest(ctl);
    this.worldChunk.push(wd);
    this.hostChunk.push(hd);
    this.lastTick = tick;
    this.lastWorldDigest = wd;
    this.lastHostDigest = hd;
    if (this.worldChunk.length >= DIGEST_CHUNK_TICKS) this.flushDigestChunk();

    // Phase/round boundary index. Derived state, and playback re-derives it
    // exactly — but recorded so 「跳到第三回合」 can build its index the moment a
    // recording is opened rather than having to simulate the match first.
    if (ctl.phase.phase !== this.lastPhase || ctl.phase.round !== this.lastRound) {
      this.lastPhase = ctl.phase.phase;
      this.lastRound = ctl.phase.round;
      this.push({ t: "r", k: tick, p: ctl.phase.phase, r: ctl.phase.round });
    }
  }

  // ---------- host events recorded from MatchRoom ----------------------------

  /**
   * A champion selection. Stamped with the tick it will take effect on:
   * `world.tick` is the tick ABOUT to run when a network message is handled
   * between room-loop frames, and playback applies the event just before that
   * same tick, so the two agree exactly.
   */
  recordChampionSelect(tick: number, seatId: SeatId, championId: string): void {
    this.push({ t: "c", k: tick, s: seatId, id: championId });
  }

  recordCheat(tick: number, seatId: SeatId, cheat: Cheat): void {
    this.push({ t: "x", k: tick, s: seatId, c: cheat });
  }

  // ---------- lifecycle ------------------------------------------------------

  /**
   * Write the footer, flush, compress and prune. Safe to call twice. Awaited by
   * MatchRoom's finish path, which already runs off the tick loop.
   */
  async finish(ctl: MatchController): Promise<void> {
    if (this.closed) return;
    const footer: ReplayFooter = {
      endedAt: new Date().toISOString(),
      finalTick: this.lastTick,
      rounds: ctl.phase.round,
      faultCount: ctl.faultCount,
      finalWorldDigest: this.lastWorldDigest,
      finalHostDigest: this.lastHostDigest,
      teams: [...ctl.lives.entries()].map(([teamId, lives]) => ({
        teamId,
        lives,
        placement: ctl.placements.get(teamId) ?? 0,
      })),
    };
    this.flushDigestChunk();
    this.push({ t: "footer", ...footer });
    await this.close();
    if (this.disabled) return;
    try {
      await compressRecording(this.id);
    } catch (err) {
      console.error(`[replay] could not compress ${this.id}; leaving the plain .jsonl in place`, err);
    }
    liveRecordings.delete(this.id);
    try {
      const deleted = await pruneReplays([...liveRecordings]);
      if (deleted.length > 0) console.log(`[replay] retention pruned ${deleted.length} old recording(s)`);
    } catch (err) {
      console.error("[replay] retention prune failed", err);
    }
  }

  /**
   * Abandon without a footer — the room was disposed before matchEnd. The
   * partial file stays on disk and is playable up to its last complete line.
   */
  async abandon(): Promise<void> {
    if (this.closed) return;
    this.flushDigestChunk();
    await this.close();
    liveRecordings.delete(this.id);
  }

  private async close(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
    const s = this.stream;
    this.stream = null;
    if (!s) return;
    await new Promise<void>((resolve) => s.end(resolve));
  }

  // ---------- internals ------------------------------------------------------

  private flushDigestChunk(): void {
    if (this.worldChunk.length === 0) return;
    this.push({ t: "g", k: this.chunkFirstTick, w: this.worldChunk, h: this.hostChunk });
    this.worldChunk = [];
    this.hostChunk = [];
  }

  /** The ONLY thing the tick path does: append a pre-encoded string. */
  private push(line: ReplayLine): void {
    if (this.disabled || this.closed) return;
    if (this.buffer.length >= MAX_BUFFERED_LINES) {
      this.disabled = true;
      this.buffer.length = 0;
      console.error(`[replay] ${this.id}: write backlog exceeded ${MAX_BUFFERED_LINES} lines; recording stopped`);
      return;
    }
    this.buffer.push(encodeLine(line));
  }

  private flush(): void {
    if (this.buffer.length === 0 || !this.stream || this.disabled) return;
    const chunk = this.buffer.join("");
    this.buffer.length = 0;
    this.stream.write(chunk);
  }
}

/** Ids of recordings currently being written (retention must skip them). */
export function liveRecordingIds(): string[] {
  return [...liveRecordings];
}
