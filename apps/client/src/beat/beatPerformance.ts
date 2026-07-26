/**
 * beat/beatPerformance — the conductor for 喪標麥可's 「四拍令咒」 performance.
 *
 * It owns exactly one thing: the phrase cursor. The synth (audio/beatSynth) and
 * the shuffle (render/beatDance) are both dumb — they are handed a note or a
 * pose. This file decides WHICH note and HOW MUCH pose, from a stream of two
 * events, and nothing else in the client needs to know the feature exists.
 *
 * ---------------------------------------------------------------------------
 * THE INTERFACE THE #252 KIT MUST CALL
 * ---------------------------------------------------------------------------
 * The 節拍 mechanic does not exist on `main` — it is part of the unmerged #252
 * zombiex kit, where the passive applies a `stackKey: "beat"` buff (duration 4 s,
 * maxStacks 4) to the TARGET on every basic attack, and the empowered fifth hit
 * consumes it. So this module is built against an explicit contract rather than
 * against that branch's internals. Two calls, both client-side, both cosmetic:
 *
 *   beatPerformance.beatStack({ attacker, target, stacks })
 *       ONE landed basic attack that put a 節拍 on `target`. `stacks` is the
 *       resulting count AFTER the hit, 1..4 — i.e. exactly the number the sim's
 *       buff already holds. Pass it, do not derive it here: the sim is the
 *       authority on the count and the music must not be able to disagree with
 *       the status bar.
 *
 *   beatPerformance.empowered({ attacker, target })
 *       The empowered hit RESOLVED (poison was on the target, four stacks were
 *       consumed). Fires the answering bar.
 *
 *   beatPerformance.phraseBroken({ attacker })          [optional]
 *       Target died, attacker died, round ended, stacks expired. Optional
 *       because this module also runs its own 4 s watchdog — the same 4 s the
 *       buff lives — so a kit that never calls it still behaves correctly. It
 *       just behaves correctly a little later.
 *
 * Every field is a plain number so nothing here imports from the sim, and
 * nothing here is ever read back by the sim. `atMs` defaults to the caller's
 * clock so tests can drive the whole thing without a browser.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISM
 * ---------------------------------------------------------------------------
 * No rng anywhere: the pose is a pure function of elapsed time, and which note
 * plays is a pure function of the sim's own stack count. Two clients watching
 * the same replay see and hear the same performance, and the sim cannot tell
 * the difference between a client that runs this and one that does not.
 */
import {
  BEATS_PER_BAR,
  BEAT_STACK_TTL_SEC,
  BAR_TWO_RATE,
  BeatSynth,
  TempoTracker,
  planBarOneNote,
  planBarTwo,
  type BeatSynthOptions,
} from "../audio/beatSynth";
import { applyDancePose, clearPose, dancePose, type PoseTarget } from "../render/beatDance";

/** The 節拍 watchdog, in ms. Same 4 s the buff lives — see the header. */
export const PHRASE_TIMEOUT_MS = BEAT_STACK_TTL_SEC * 1000;

/**
 * How long the body takes to stop dancing once the phrase is over. Not a
 * flourish: without it the pose would snap to zero on a frame boundary and the
 * champion would visibly teleport up to half a metre.
 */
export const DANCE_RELEASE_MS = 500;

/** Dance energy per stack held: a twitch on 1, the full shuffle on 4. */
export const ENERGY_BY_STACK: readonly number[] = [0, 0.4, 0.6, 0.8, 1];

export interface BeatStackEvent {
  /** entity id of 喪標麥可 */
  attacker: number;
  /** entity id the 節拍 landed on */
  target: number;
  /** stack count on the target AFTER this hit, 1..4 */
  stacks: number;
  /** client clock; defaults to the conductor's own `now()` */
  atMs?: number;
}

export interface BeatEmpoweredEvent {
  attacker: number;
  target: number;
  atMs?: number;
}

export interface PhraseBrokenEvent {
  attacker?: number;
  atMs?: number;
}

interface Phrase {
  attacker: number;
  target: number;
  /** highest stack count seen, 1..4 */
  stacks: number;
  /** ms of the first note of THIS phrase — the dance's beat-0 anchor */
  startedMs: number;
  /** ms of the most recent event, for the watchdog */
  lastMs: number;
  /** ms the empowered hit resolved, or null */
  empoweredMs: number | null;
  /** ms the phrase stopped being live (released), or null while live */
  endedMs: number | null;
}

export interface BeatPerformanceOptions {
  synth?: BeatSynth;
  synthOptions?: BeatSynthOptions;
  now?: () => number;
  /** injected in tests; a real caller passes the view lookup */
  tempo?: TempoTracker;
}

/** What `update` needs to find the dancer's transform. Returns null when culled. */
export type PoseLookup = (entityId: number) => PoseTarget | null | undefined;

export class BeatPerformance {
  private readonly synth: BeatSynth;
  private readonly tempo: TempoTracker;
  private readonly now: () => number;
  private phrase: Phrase | null = null;
  /** entities whose absolute tilts we set and therefore owe a reset to */
  private readonly posed = new Set<number>();
  private disposed = false;

  constructor(opts: BeatPerformanceOptions = {}) {
    this.synth = opts.synth ?? new BeatSynth(opts.synthOptions);
    this.tempo = opts.tempo ?? new TempoTracker();
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  /** The tempo the performance is currently reading off the player, in BPM. */
  get bpm(): number {
    return this.tempo.bpm;
  }

  /** 0..4 — how far into the figure the current phrase is; 0 when idle. */
  get noteCursor(): number {
    return this.phrase && this.phrase.endedMs === null ? this.phrase.stacks : 0;
  }

  get isPerforming(): boolean {
    return this.phrase !== null;
  }

  get synthNoteCount(): number {
    return this.synth.noteCount;
  }

  /**
   * ONE landed basic attack that stacked a 節拍. Plays note `stacks` of bar 1 —
   * the note fires on the hit, never on a scheduler, so the rhythm you hear IS
   * the player's cadence rather than a quantised approximation of it.
   */
  beatStack(ev: BeatStackEvent): void {
    if (this.disposed) return;
    const atMs = ev.atMs ?? this.now();
    const stacks = Math.round(ev.stacks);
    if (stacks < 1 || stacks > BEATS_PER_BAR) return; // not a note in this figure

    const p = this.phrase;
    const continues =
      p !== null &&
      p.endedMs === null &&
      p.attacker === ev.attacker &&
      p.target === ev.target &&
      stacks === p.stacks + 1 &&
      atMs - p.lastMs <= PHRASE_TIMEOUT_MS;

    if (continues) {
      this.tempo.note(atMs);
      p.stacks = stacks;
      p.lastMs = atMs;
    } else {
      // A NEW phrase: a different attacker/target, a stack count that jumped or
      // went backwards (the sim re-stacked after an empowered hit, or the buff
      // expired and rebuilt), or too long a silence. Restarting is the honest
      // reading — the figure follows the sim's counter, it does not invent one.
      this.tempo.breakPhrase();
      this.tempo.note(atMs);
      this.phrase = {
        attacker: ev.attacker,
        target: ev.target,
        stacks,
        startedMs: atMs,
        lastMs: atMs,
        empoweredMs: null,
        endedMs: null,
      };
    }
    const note = planBarOneNote(stacks, this.tempo.beatSec);
    if (note) this.synth.play(note);
  }

  /**
   * The empowered hit resolved. Fires bar 2 — the answering four notes as one
   * double-time run, queued into WebAudio at once so their spacing is
   * sample-accurate rather than at the mercy of the frame rate.
   */
  empowered(ev: BeatEmpoweredEvent): void {
    if (this.disposed) return;
    const atMs = ev.atMs ?? this.now();
    const p = this.phrase;
    // The payoff only pays off a phrase that was actually built. A stray
    // empowered event with no build-up (a reconnect mid-combo, a spectator
    // joining) gets the answering bar anyway — it IS the musical event — but it
    // does not fake four notes that were never earned.
    if (p && p.endedMs === null && p.attacker === ev.attacker) {
      p.empoweredMs = atMs;
      p.lastMs = atMs;
      p.target = ev.target;
    } else {
      this.phrase = {
        attacker: ev.attacker,
        target: ev.target,
        stacks: BEATS_PER_BAR,
        startedMs: atMs,
        lastMs: atMs,
        empoweredMs: atMs,
        endedMs: null,
      };
    }
    for (const note of planBarTwo(this.tempo.beatSec)) this.synth.play(note);
  }

  /**
   * The phrase is over without a payoff (target died, attacker died, round
   * ended, stacks expired).
   *
   * WHAT IT SOUNDS LIKE: nothing new. The note already sounding is allowed to
   * finish its own envelope — it is never chopped — and the cursor resets. It
   * does NOT auto-resolve into bar 2.
   *
   * WHY. Bar 2 is the reward for landing the empowered hit; playing it for free
   * would tell the player he completed a combo he did not complete, and the
   *音樂 is supposed to be a READOUT of the mechanic, not a flatterer. Silence
   * is also what the mechanic itself says: the 節拍 buff expires after 4 s, so
   * the phrase has genuinely ended, and the eight-note figure was written to end
   * bar 1 on the tonic (C#2) precisely so stopping there is a half-close rather
   * than a severed line.
   */
  phraseBroken(ev: PhraseBrokenEvent = {}): void {
    if (this.disposed) return;
    const p = this.phrase;
    if (!p) return;
    if (ev.attacker !== undefined && ev.attacker !== p.attacker) return;
    if (p.endedMs === null) p.endedMs = ev.atMs ?? this.now();
    this.tempo.breakPhrase();
  }

  /**
   * Per frame. MUST be called AFTER `EntityViewRegistry.sync` — see the ordering
   * contract in render/beatDance.applyDancePose.
   */
  update(nowMs: number, lookup: PoseLookup): void {
    if (this.disposed) return;
    const p = this.phrase;
    if (!p) return;

    // watchdog: the kit need not tell us the stacks expired
    if (p.endedMs === null && nowMs - p.lastMs > PHRASE_TIMEOUT_MS) {
      p.endedMs = p.lastMs + PHRASE_TIMEOUT_MS;
      this.tempo.breakPhrase();
    }

    const beatSec = this.tempo.beatSec;
    const beats = (nowMs - p.startedMs) / 1000 / beatSec;
    let energy = ENERGY_BY_STACK[Math.min(BEATS_PER_BAR, p.stacks)] ?? 1;
    if (p.empoweredMs !== null) energy = 1;

    let spin = 0;
    if (p.empoweredMs !== null) {
      // the payoff turn rides bar 2 exactly: four double-time notes
      const barTwoSec = (BEATS_PER_BAR * beatSec) / BAR_TWO_RATE;
      spin = Math.min(1, Math.max(0, (nowMs - p.empoweredMs) / 1000 / barTwoSec));
    }

    if (p.endedMs !== null) {
      const t = (nowMs - p.endedMs) / DANCE_RELEASE_MS;
      if (t >= 1) {
        this.stopPosing(lookup);
        this.phrase = null;
        return;
      }
      energy *= 1 - t;
    }

    const node = lookup(p.attacker);
    if (!node) {
      // Culled or despawned this frame: nothing to pose. Deliberately KEEP the
      // debt in `posed` — dropping it here would leave a champion who was culled
      // mid-shuffle frozen at a 15° lean when he comes back, because nothing
      // else in the client writes `rotation.x/z`.
      return;
    }
    applyDancePose(node, dancePose({ beats, energy, spin }));
    this.posed.add(p.attacker);
  }

  private stopPosing(lookup: PoseLookup): void {
    for (const id of this.posed) {
      const node = lookup(id);
      if (node) clearPose(node);
    }
    this.posed.clear();
  }

  /** Round ended / scene torn down: stop the dance and let the note decay out. */
  reset(lookup?: PoseLookup): void {
    if (lookup) this.stopPosing(lookup);
    else this.posed.clear();
    this.phrase = null;
    this.tempo.breakPhrase();
    this.synth.release();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.phrase = null;
    this.posed.clear();
    this.synth.dispose();
  }
}
