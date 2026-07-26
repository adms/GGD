/**
 * audio/beatSynth — 「四拍令咒」 played as an ANALOG SYNTH BASS, generated here,
 * from a note list, at play time. No audio file is fetched, decoded, cached or
 * stored: the two bars the owner wrote
 *
 *     | C#2 C#2 B1 C#2 | E2 F#2 F#2 C#2 |     (C# minor, evenly-spaced bass riff)
 *
 * exist in this file as eight MIDI numbers, and everything you hear is an
 * oscillator stack shaped by an envelope. That is what the owner asked for
 * (「音效由本地端生成電子樂」) and it is also the only version of this feature
 * that is unambiguously his own content.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN AudioSystem
 * ---------------------------------------------------------------------------
 * AudioSystem is a SAMPLE player: fetch → decode → AudioBufferSourceNode, with
 * a per-event gate that exists to stop a burst of `damage` events machine-gunning
 * the mixer. None of that applies to a synthesised note — there is no buffer to
 * fetch, and the whole point here is that every landed hit fires exactly one
 * note. So this is its own small graph. It still obeys every mixer rule:
 *
 *   • test-mode silence (#62) — the gate is IMPORTED from AudioSystem, not
 *     re-implemented, so there is one definition of "background agents make no
 *     sound". Silenced ⇒ no AudioContext is ever constructed.
 *   • the global toggle + sliders (#14/#54) — the output gain is a live
 *     subscription to `audioSettings`, applying master × SFX exactly the way
 *     AudioSystem.applyVolumes does, including both mutes.
 *   • no context before a gesture — `gate()` (wired to `audioSystem.isUnlocked`
 *     by the caller) must be true before anything is built.
 *
 * WHICH BUS. The SFX one, deliberately. This is a per-hit combat readout, not a
 * bed: it is triggered by a landed attack, it must duck when the player pulls
 * the combat mix down mid-fight, and muting the MUSIC must not delete a
 * mechanic's feedback the way it deletes a background track. Structurally it is
 * also SFX — the BGM bus is exclusive and crossfaded (one bed at a time), and
 * an eight-note stab sequence is not a bed.
 *
 * If the audio owner ever exposes the live bus node, pass it as `destination`
 * and the second AudioContext disappears; that is the only reason the option
 * exists. See the honest caveat in the task report.
 */
import { shouldSilenceAudio } from "./AudioSystem";
import { audioSettings, type AudioSettingsStore } from "./audioSettings";
import { clampVolume } from "./audioSelect";

// ---------------------------------------------------------------------------
// the phrase
// ---------------------------------------------------------------------------

/** MIDI note numbers for the four pitches the owner's figure uses. */
export const NOTE = {
  B1: 35,
  CS2: 37,
  E2: 40,
  FS2: 42,
} as const;

/**
 * The owner's figure, in order. Bar 1 is the QUESTION (the four stacking autos),
 * bar 2 is the ANSWER (the empowered hit). Both bars end on C#2, which is why
 * the phrase can stop after bar 1 without sounding severed: note 4 is already a
 * half-close on the tonic.
 */
export const PHRASE_MIDI: readonly number[] = [
  NOTE.CS2,
  NOTE.CS2,
  NOTE.B1,
  NOTE.CS2, // | C#2 C#2 B1 C#2 |
  NOTE.E2,
  NOTE.FS2,
  NOTE.FS2,
  NOTE.CS2, // | E2  F#2 F#2 C#2 |
];

/** Notes per bar. The figure is 4/4 and every note is one beat. */
export const BEATS_PER_BAR = 4;

/** Bar 1 = the four stacking autos. */
export const BAR_ONE_MIDI: readonly number[] = PHRASE_MIDI.slice(0, BEATS_PER_BAR);
/** Bar 2 = the empowered hit's answering run. */
export const BAR_TWO_MIDI: readonly number[] = PHRASE_MIDI.slice(BEATS_PER_BAR);

/** Equal temperament, A4 = 440 Hz = MIDI 69. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// TEMPO — derived from the cadence the sim can actually produce
// ---------------------------------------------------------------------------

/** The sim's fixed step. Every attack interval is a whole number of these. */
export const SIM_TICK_SEC = 1 / 30;

/**
 * The nominal AttackSpeed clamp on `main`
 * (`STAT_CLAMPS[Stat.AttackSpeed] = [0.2, 2.5]`).
 */
export const ATTACK_SPEED_MIN = 0.2;
export const ATTACK_SPEED_MAX_MAIN = 2.5;
/**
 * ...and the raised ceiling the unmerged #252 kit ships
 * (`[0.2, 6.0]`, knowingly raised so 喪標麥可's kit can reach ×8). The tempo
 * range below is quoted for BOTH, because which one is live depends on whether
 * #252 has merged — and a music feature that only sounds right on one of them
 * would be a silent bug.
 */
export const ATTACK_SPEED_MAX_252 = 6.0;

/** 喪標麥可's own attack data (champion doc; BAT falls back to 1.0 in the sim). */
export const ZOMBIEX_BASE_ATTACK_TIME = 1.0;
export const ZOMBIEX_DAMAGE_POINT_SEC = 0.15;
export const ZOMBIEX_BASE_ATTACK_SPEED = 0.7;

/** A 節拍 stack lives this long (the passive's `duration: 4.0`). */
export const BEAT_STACK_TTL_SEC = 4;

/**
 * THE ACHIEVABLE CADENCE, not the nominal one.
 *
 * `BasicAttackSystem` commits `round(baseAttackTime / attackSpeed / dt)` ticks of
 * cooldown at SWING START and runs a wind-up of `round(attackDamagePoint / dt)`
 * ticks inside it, and it refuses to start a second swing while a wind-up is
 * live ("one swing at a time"). So two consecutive LANDED hits can never be
 * closer than the larger of those two tick counts — the wind-up is a floor on
 * the cadence that no amount of attack speed can buy through.
 *
 * Returns seconds between landed hits.
 */
export function attackIntervalSec(
  attackSpeed: number,
  baseAttackTime = ZOMBIEX_BASE_ATTACK_TIME,
  damagePointSec = ZOMBIEX_DAMAGE_POINT_SEC,
  dt = SIM_TICK_SEC,
): number {
  const as = Math.max(0.01, attackSpeed);
  const cdTicks = Math.max(1, Math.round(baseAttackTime / as / dt));
  const dpTicks = Math.max(0, Math.round(damagePointSec / dt));
  return Math.max(cdTicks, dpTicks) * dt;
}

/** BPM ⇄ beat length. One note = one beat, so BPM is literally the hit rate × 60. */
export function bpmFromBeatSec(beatSec: number): number {
  return beatSec > 0 ? 60 / beatSec : 0;
}
export function beatSecFromBpm(bpm: number): number {
  return bpm > 0 ? 60 / bpm : 0;
}

/**
 * The window the DERIVED parameters (note length, filter decay, the bar-2
 * flourish spacing) are clamped into. It does NOT quantise or delay anything:
 * notes always fire on the hit, so the rhythm you hear is the player's real
 * cadence even outside this window. The clamp only stops the envelopes from
 * becoming absurd at the extremes.
 *
 *   ceiling 360 BPM — `attackIntervalSec(6.0)` = 5 ticks = 0.1667 s. That is the
 *     hard floor the sim can produce for this champion under #252's raised
 *     clamp (under `main`'s 2.5 it is 12 ticks = 0.4 s = 150 BPM), and it is set
 *     by the wind-up, not by the stat.
 *   floor 40 BPM — below this a bass note stops being a stab and becomes a
 *     drone. The mechanic gets there first anyway: a 節拍 stack expires after
 *     4 s, so any phrase that actually completes has its notes ≤4 s apart
 *     (15 BPM), and the shipped champion at base attack speed sits at
 *     `attackIntervalSec(0.7)` = 43 ticks = 1.433 s ≈ 42 BPM.
 */
export const BPM_MAX = 360;
export const BPM_MIN = 40;
export const BEAT_SEC_MIN = beatSecFromBpm(BPM_MAX);
export const BEAT_SEC_MAX = beatSecFromBpm(BPM_MIN);

export function clampBeatSec(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return BEAT_SEC_MAX;
  return Math.min(BEAT_SEC_MAX, Math.max(BEAT_SEC_MIN, sec));
}

/**
 * Smoothing weight for the cadence readout once it HAS a measurement.
 *
 * The first gap is taken whole (see `TempoTracker.note`), not smoothed in: a
 * phrase is only four hits long, so an estimate that eases toward the truth
 * from a default would still be ~50% slow at the payoff — the flourish would
 * drag behind a player who is hitting fast, which is exactly the thing this
 * feature exists to show. After that first reading, 0.6 keeps an attack-speed
 * buff audible within a note or two while a single late packet cannot lurch the
 * groove.
 */
export const TEMPO_SMOOTHING = 0.6;

/**
 * Running estimate of the player's beat length, fed by the gaps between landed
 * hits. Deliberately tiny and pure — it is a readout, not a scheduler.
 */
export class TempoTracker {
  private beat: number;
  private lastMs: number | null = null;
  /** false until a real gap has been measured — see TEMPO_SMOOTHING */
  private primed = false;

  constructor(initialBeatSec = attackIntervalSec(ZOMBIEX_BASE_ATTACK_SPEED)) {
    this.beat = clampBeatSec(initialBeatSec);
  }

  /** Register a landed hit at `atMs`; returns the current beat length (sec). */
  note(atMs: number): number {
    const prev = this.lastMs;
    this.lastMs = atMs;
    if (prev !== null) {
      const gapSec = (atMs - prev) / 1000;
      // A gap longer than the stack lifetime is not a slow tempo, it is a
      // BROKEN phrase — the stacks are gone. Ignore it rather than dragging
      // the estimate down to a dirge the next phrase would inherit.
      if (gapSec > 0 && gapSec <= BEAT_STACK_TTL_SEC) {
        const measured = clampBeatSec(gapSec);
        this.beat = this.primed ? clampBeatSec(this.beat + (measured - this.beat) * TEMPO_SMOOTHING) : measured;
        this.primed = true;
      }
    }
    return this.beat;
  }

  get beatSec(): number {
    return this.beat;
  }

  get bpm(): number {
    return bpmFromBeatSec(this.beat);
  }

  /** Forget the last onset (phrase broke) but KEEP the tempo estimate. */
  breakPhrase(): void {
    this.lastMs = null;
  }

  reset(beatSec = attackIntervalSec(ZOMBIEX_BASE_ATTACK_SPEED)): void {
    this.beat = clampBeatSec(beatSec);
    this.lastMs = null;
    this.primed = false;
  }
}

// ---------------------------------------------------------------------------
// voice shape
// ---------------------------------------------------------------------------

/**
 * Bar 2 is played at DOUBLE TIME (four eighth notes, not four quarters). Two
 * reasons, and neither is decoration:
 *   1. it is the idiomatic turnaround for a bass riff — the answer lands harder
 *      than the question because it arrives faster;
 *   2. at the slow end of the achievable cadence (~42 BPM, 1.43 s per beat) a
 *      quarter-note bar 2 would take 5.7 s to play out, longer than the whole
 *      4 s stack window, so the payoff would still be sounding while the next
 *      phrase was already building.
 */
export const BAR_TWO_RATE = 2;

/** Per-note loudness. Bar 1 crescendos into the payoff; bar 2 is the payoff. */
export const NOTE_INTENSITY: readonly number[] = [0.62, 0.7, 0.78, 0.88, 1, 0.95, 0.95, 1];

/** Master trim for the whole instrument, before the mixer's own gains. */
export const BEAT_MUSIC_GAIN = 0.5;

export interface NoteShape {
  /** seconds from note-on to peak */
  attackSec: number;
  /** seconds from peak down to the sustain level */
  decaySec: number;
  /** 0..1 level held until release */
  sustain: number;
  /** how long the note is held before release starts */
  holdSec: number;
  /** seconds of release tail */
  releaseSec: number;
  /** total seconds the voice occupies */
  totalSec: number;
  /** lowpass resting cutoff (Hz) */
  cutoffHz: number;
  /** lowpass cutoff at note-on, before the envelope closes it (Hz) */
  cutoffPeakHz: number;
  /** seconds for the filter to fall from peak to resting */
  filterDecaySec: number;
  /** peak amplitude 0..1 */
  peak: number;
}

/**
 * The envelope for one note, scaled by the CURRENT tempo so the riff reads the
 * same at 42 BPM and at 360 BPM. Faster hitting ⇒ shorter, brighter, more
 * urgent notes; slower hitting ⇒ longer, rounder, heavier ones. That is the
 * other half of 「打越快音樂節奏就越快」: not only do the notes come faster,
 * the instrument itself tightens up.
 */
export function noteShape(beatSec: number, intensity: number, hz: number): NoteShape {
  const beat = clampBeatSec(beatSec);
  const amp = Math.min(1, Math.max(0.05, intensity));
  // 4 ms attack: a bass "pluck" with no click. Never scaled — a slow tempo does
  // not make an attack transient slower, it just leaves more room after it.
  const attackSec = 0.004;
  const decaySec = Math.min(0.18, beat * 0.22);
  const sustain = 0.55;
  // Hold at most ~45% of the beat so consecutive notes never merge into a drone,
  // and at least 60 ms so the fastest cadence still produces an audible pitch.
  const holdSec = Math.min(0.32, Math.max(0.06, beat * 0.45));
  const releaseSec = Math.min(0.22, Math.max(0.05, beat * 0.28));
  // Filter envelope: open to a multiple of the fundamental, close to a low
  // resting cutoff. The faster the cadence the brighter the peak — the riff
  // gains bite as the player speeds up.
  const brightness = 1 + (BEAT_SEC_MAX - beat) / (BEAT_SEC_MAX - BEAT_SEC_MIN); // 1..2
  const cutoffHz = Math.min(1200, hz * 3.2);
  const cutoffPeakHz = Math.min(6000, hz * 9 * brightness * (0.7 + 0.5 * amp));
  return {
    attackSec,
    decaySec,
    sustain,
    holdSec,
    releaseSec,
    totalSec: attackSec + holdSec + releaseSec,
    cutoffHz,
    cutoffPeakHz: Math.max(cutoffHz * 1.5, cutoffPeakHz),
    filterDecaySec: Math.max(0.05, Math.min(0.3, beat * 0.35)),
    peak: amp,
  };
}

export interface PlannedNote {
  /** index into PHRASE_MIDI, 0..7 */
  index: number;
  midi: number;
  hz: number;
  /** seconds after the triggering event */
  offsetSec: number;
  shape: NoteShape;
}

/**
 * The notes bar 2 fires when the empowered hit resolves: the remaining four, as
 * one double-time run scheduled ahead of time. Bar 1's notes are never planned
 * — each is fired by its own landed hit, so the rhythm cannot be a lie.
 */
export function planBarTwo(beatSec: number): PlannedNote[] {
  const beat = clampBeatSec(beatSec);
  const step = beat / BAR_TWO_RATE;
  return BAR_TWO_MIDI.map((midi, i) => {
    const index = BEATS_PER_BAR + i;
    const hz = midiToHz(midi);
    return {
      index,
      midi,
      hz,
      offsetSec: i * step,
      shape: noteShape(step, NOTE_INTENSITY[index] ?? 1, hz),
    };
  });
}

/** The note a bar-1 stack fires. `stacks` is the sim's post-hit count, 1..4. */
export function planBarOneNote(stacks: number, beatSec: number): PlannedNote | null {
  const index = Math.round(stacks) - 1;
  if (index < 0 || index >= BEATS_PER_BAR) return null;
  const midi = PHRASE_MIDI[index]!;
  const hz = midiToHz(midi);
  return {
    index,
    midi,
    hz,
    offsetSec: 0,
    shape: noteShape(beatSec, NOTE_INTENSITY[index] ?? 1, hz),
  };
}

// ---------------------------------------------------------------------------
// the instrument
// ---------------------------------------------------------------------------

/** Detune of the second sawtooth, in cents. The classic two-oscillator beating. */
export const DETUNE_CENTS = -9;
/** Sub-oscillator level, one octave down. Where the weight comes from. */
export const SUB_LEVEL = 0.55;
/** Lowpass resonance. High enough to sing, low enough not to self-oscillate. */
export const FILTER_Q = 9;
/** Fade applied to a stolen voice. Long enough to avoid a click, short enough to be a steal. */
export const VOICE_STEAL_SEC = 0.008;

export interface BeatSynthOptions {
  /** injected for tests; returns null when WebAudio is unavailable */
  ctxFactory?: () => AudioContext | null;
  /** an EXISTING node to play into (and its context) — see the file header */
  destination?: { ctx: AudioContext; node: AudioNode } | null;
  settings?: AudioSettingsStore;
  /** force the #62 silence gate; omitted ⇒ read from the environment */
  silent?: boolean;
  /** must be true before any context is built (wire to `audioSystem.isUnlocked`) */
  gate?: () => boolean;
  warn?: (msg: string, err?: unknown) => void;
}

interface LiveVoice {
  amp: GainNode;
  stops: { stop(when?: number): void }[];
  endsAt: number;
}

/**
 * A monophonic analog-style synth bass. MONOPHONIC on purpose: a real bass
 * synth is, and it also makes phrase overlap structurally impossible — a new
 * hit always steals the voice, so a bar-2 run that is still sounding when the
 * next phrase's first stack lands is simply taken over, mid-note, the way a
 * bass player's finger would.
 */
export class BeatSynth {
  private readonly ctxFactory: () => AudioContext | null;
  private readonly settings: AudioSettingsStore;
  private readonly silent: boolean;
  private readonly gate: () => boolean;
  private readonly warn: (msg: string, err?: unknown) => void;
  private readonly injected: { ctx: AudioContext; node: AudioNode } | null;

  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private ctxFailed = false;
  private disposed = false;
  /**
   * Every voice that has been SCHEDULED and has not finished. Bar 2 queues four
   * notes ahead of time (WebAudio schedules them sample-accurately, which no JS
   * timer can), so "the sounding voice" is not enough state: a new hit arriving
   * mid-flourish has to be able to cancel notes that have not started yet.
   */
  private voices: LiveVoice[] = [];
  private unsubSettings: (() => void) | null = null;
  /** notes actually started — the observable the tests assert on */
  private startedNotes = 0;

  constructor(opts: BeatSynthOptions = {}) {
    this.silent = opts.silent ?? shouldSilenceAudio();
    this.injected = this.silent ? null : (opts.destination ?? null);
    this.ctxFactory = this.silent ? () => null : (opts.ctxFactory ?? defaultCtxFactory);
    this.settings = opts.settings ?? audioSettings;
    this.gate = opts.gate ?? (() => true);
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[beatSynth] ${msg}`, err ?? ""));
    this.unsubSettings = this.settings.subscribe(() => this.applyVolume());
  }

  /** True when the #62 gate is on: no context, no sound, ever. */
  get isSilenced(): boolean {
    return this.silent;
  }

  /** How many notes this instrument has actually started. */
  get noteCount(): number {
    return this.startedNotes;
  }

  /** The gain the mixer is currently applying, or null before the graph exists. */
  liveGain(): number | null {
    try {
      return this.out ? this.out.gain.value : null;
    } catch {
      return null;
    }
  }

  /**
   * Play one note, `note.offsetSec` from now. Never throws: a missing context, a
   * closed context or a browser without WebAudio all degrade to silence, because
   * this is called from the frame loop's event drain.
   */
  play(note: PlannedNote): boolean {
    if (this.disposed || this.silent) return false;
    const ctx = this.ensureCtx();
    const out = this.out;
    if (!ctx || !out) return false;
    try {
      const t0 = ctx.currentTime + Math.max(0, note.offsetSec);
      this.steal(ctx, t0);
      const s = note.shape;

      const amp = ctx.createGain();
      amp.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = FILTER_Q;
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve();
      const mix = ctx.createGain();
      mix.gain.value = 0.32; // headroom before the shaper, so drive is drive and not clipping

      mix.connect(shaper);
      shaper.connect(filter);
      filter.connect(amp);
      amp.connect(out);

      const stops: { stop(when?: number): void }[] = [];
      const osc1 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = note.hz;
      osc1.connect(mix);
      stops.push(osc1);

      const osc2 = ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = note.hz;
      try {
        osc2.detune.value = DETUNE_CENTS;
      } catch {
        /* a host without detune still gets the unison layer */
      }
      osc2.connect(mix);
      stops.push(osc2);

      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = note.hz / 2;
      const subGain = ctx.createGain();
      subGain.gain.value = SUB_LEVEL;
      sub.connect(subGain);
      subGain.connect(mix);
      stops.push(sub);

      // amp ADSR
      const decayEnd = t0 + s.attackSec + s.decaySec;
      const releaseStart = t0 + s.attackSec + s.holdSec;
      const end = releaseStart + s.releaseSec;
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(s.peak, t0 + s.attackSec);
      amp.gain.linearRampToValueAtTime(s.peak * s.sustain, decayEnd);
      amp.gain.setValueAtTime(s.peak * s.sustain, releaseStart);
      amp.gain.linearRampToValueAtTime(0.0001, end);

      // filter envelope — the pluck
      filter.frequency.setValueAtTime(s.cutoffPeakHz, t0);
      filter.frequency.linearRampToValueAtTime(s.cutoffHz, t0 + s.filterDecaySec);

      for (const o of [osc1, osc2, sub]) {
        o.start(t0);
        o.stop(end + 0.02);
      }
      this.voices.push({ amp, stops, endsAt: end });
      this.startedNotes++;
      return true;
    } catch (err) {
      this.warn("note failed", err);
      return false;
    }
  }

  /** Cut the sounding voice short without a click (phrase abandoned / teardown). */
  release(fadeSec = 0.12): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.steal(ctx, ctx.currentTime, fadeSec);
  }

  /**
   * MONOPHONY. Every voice still alive at `atSec` — sounding OR merely
   * scheduled — is faded out and stopped. That is what a bass synth does when
   * the next note arrives, and it is also why a phrase can never overlap
   * itself: the empowered flourish that is still queued when the next combo's
   * first stack lands is taken over rather than layered under.
   */
  private steal(ctx: AudioContext, atSec: number, fadeSec = VOICE_STEAL_SEC): void {
    // TWO different clocks, and conflating them is a bug worth naming. A voice
    // is FORGETTABLE only once it is over in real time (`ctx.currentTime`); it
    // is CANCELLABLE if it would still be alive at the steal point (`atSec`,
    // which for a queued flourish is in the future). Pruning against `atSec`
    // instead drops notes 1..n-1 of a scheduled run from the list, and they
    // then play on through the next phrase — the riff doubling itself.
    const nowSec = ctx.currentTime;
    const keep: LiveVoice[] = [];
    for (const v of this.voices) {
      if (v.endsAt <= nowSec) continue; // genuinely over
      if (v.endsAt > atSec) {
        try {
          v.amp.gain.cancelScheduledValues(atSec);
          v.amp.gain.setValueAtTime(Math.max(0.0001, v.amp.gain.value), atSec);
          v.amp.gain.linearRampToValueAtTime(0.0001, atSec + fadeSec);
          for (const s of v.stops) s.stop(atSec + fadeSec + 0.01);
        } catch {
          /* already stopped, or a host that rejects a re-stop */
        }
        v.endsAt = Math.min(v.endsAt, atSec + fadeSec + 0.01);
      }
      keep.push(v);
    }
    this.voices = keep;
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.ctxFailed || this.disposed || this.silent) return null;
    if (!this.gate()) return null; // no context before the autoplay unlock
    if (this.injected) {
      this.ctx = this.injected.ctx;
      try {
        const out = this.injected.ctx.createGain();
        out.connect(this.injected.node);
        this.out = out;
        this.applyVolume();
        return this.ctx;
      } catch (err) {
        this.warn("injected destination unusable; running silent", err);
        this.ctxFailed = true;
        this.ctx = null;
        return null;
      }
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = this.ctxFactory();
    } catch (err) {
      this.warn("AudioContext unavailable; running silent", err);
      ctx = null;
    }
    if (!ctx) {
      this.ctxFailed = true;
      return null;
    }
    try {
      const out = ctx.createGain();
      out.connect(ctx.destination);
      this.ctx = ctx;
      this.out = out;
      this.applyVolume();
      return ctx;
    } catch (err) {
      this.warn("graph failed; running silent", err);
      this.ctxFailed = true;
      this.ctx = null;
      return null;
    }
  }

  /**
   * master × SFX, both mutes honoured — the SAME arithmetic AudioSystem applies
   * to its own buses, so this instrument moves with every slider drag exactly
   * like the rest of the mix.
   */
  private applyVolume(): void {
    const out = this.out;
    if (!out) return;
    const v = this.settings.get();
    const target = v.muted || v.sfxMuted ? 0 : clampVolume(v.master) * clampVolume(v.sfx) * BEAT_MUSIC_GAIN;
    try {
      out.gain.value = target;
    } catch (err) {
      this.warn("volume apply failed", err);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubSettings?.();
    this.unsubSettings = null;
    const ctx = this.ctx;
    if (ctx) this.steal(ctx, ctx.currentTime, 0.02);
    this.voices = [];
    this.ctx = null;
    this.out = null;
    // An INJECTED context belongs to whoever handed it over; only close our own.
    if (ctx && !this.injected) {
      try {
        const p = ctx.close?.();
        if (p && typeof p.catch === "function") p.catch(() => undefined);
      } catch {
        /* already closed */
      }
    }
  }
}

/**
 * Soft saturation curve — a tanh-ish transfer that rounds the sawtooth stack's
 * corners and adds the even-order warmth that separates "an oscillator" from
 * "an analog synth bass". Built once and shared; it is a constant.
 */
let cachedCurve: Float32Array<ArrayBuffer> | null = null;
export function driveCurve(samples = 1024, drive = 2.4): Float32Array<ArrayBuffer> {
  if (cachedCurve && cachedCurve.length === samples) return cachedCurve;
  // `new ArrayBuffer` explicitly: WaveShaperNode.curve is typed
  // `Float32Array<ArrayBuffer>` and a bare `new Float32Array(n)` widens to
  // `ArrayBufferLike`, which would admit a SharedArrayBuffer.
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  cachedCurve = curve;
  return curve;
}

function defaultCtxFactory(): AudioContext | null {
  try {
    const g = globalThis as unknown as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}
