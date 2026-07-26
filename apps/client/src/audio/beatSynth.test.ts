/**
 * audio/beatSynth — the instrument and the tempo model.
 *
 * The interesting assertions here are the ones that could actually be WRONG in
 * a way nobody would notice by listening once: that the eight pitches are the
 * ones the owner wrote, that the BPM range is derived from what the sim can
 * really produce (not from the stat's nominal range), that #62's silence gate
 * builds no AudioContext at all, and that a queued flourish is genuinely
 * cancellable — a bug that would only show up as "the riff doubled itself"
 * three combos into a fight.
 */
import { describe, it, expect, vi } from "vitest";
import {
  ATTACK_SPEED_MAX_252,
  ATTACK_SPEED_MAX_MAIN,
  ATTACK_SPEED_MIN,
  BAR_TWO_MIDI,
  BAR_TWO_RATE,
  BEATS_PER_BAR,
  BEAT_SEC_MAX,
  BEAT_SEC_MIN,
  BEAT_STACK_TTL_SEC,
  BPM_MAX,
  BPM_MIN,
  BeatSynth,
  NOTE,
  PHRASE_MIDI,
  SIM_TICK_SEC,
  TempoTracker,
  ZOMBIEX_BASE_ATTACK_SPEED,
  attackIntervalSec,
  bpmFromBeatSec,
  clampBeatSec,
  driveCurve,
  midiToHz,
  noteShape,
  planBarOneNote,
  planBarTwo,
} from "./beatSynth";
import { AudioSettingsStore } from "./audioSettings";

// ---------------------------------------------------------------------------
// fake WebAudio (same shape as AudioSystem.test.ts's, minus the buffer path)
// ---------------------------------------------------------------------------

class FakeParam {
  value = 0;
  readonly events: string[] = [];
  cancelScheduledValues(): void {
    this.events.push("cancel");
  }
  setValueAtTime(v: number): void {
    this.value = v;
    this.events.push("set");
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
    this.events.push("ramp");
  }
}
class FakeNode {
  connections = 0;
  connect(): void {
    this.connections++;
  }
  disconnect(): void {
    this.connections = 0;
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeFilter extends FakeNode {
  type = "";
  Q = new FakeParam();
  frequency = new FakeParam();
}
class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
}
class FakeOsc extends FakeNode {
  type = "";
  frequency = new FakeParam();
  detune = new FakeParam();
  startedAt: number | null = null;
  stops: number[] = [];
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stops.push(when);
  }
}
class FakeCtx {
  currentTime = 0;
  state = "running";
  destination = new FakeNode();
  readonly oscs: FakeOsc[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper();
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

function makeSynth(over: Partial<{ settings: AudioSettingsStore }> = {}): {
  synth: BeatSynth;
  ctx: FakeCtx;
  settings: AudioSettingsStore;
} {
  const ctx = new FakeCtx();
  const settings = over.settings ?? new AudioSettingsStore(memStore());
  const synth = new BeatSynth({
    silent: false,
    settings,
    ctxFactory: () => ctx as unknown as AudioContext,
  });
  return { synth, ctx, settings };
}

function memStore(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

// ---------------------------------------------------------------------------

describe("the phrase is the one the owner wrote", () => {
  it("is | C#2 C#2 B1 C#2 | E2 F#2 F#2 C#2 |", () => {
    expect(PHRASE_MIDI).toEqual([
      NOTE.CS2,
      NOTE.CS2,
      NOTE.B1,
      NOTE.CS2,
      NOTE.E2,
      NOTE.FS2,
      NOTE.FS2,
      NOTE.CS2,
    ]);
    expect(PHRASE_MIDI).toHaveLength(2 * BEATS_PER_BAR);
  });

  it("is in C# minor and lives in bass register (61–93 Hz)", () => {
    const hz = PHRASE_MIDI.map(midiToHz);
    expect(Math.min(...hz)).toBeCloseTo(61.735, 2); // B1
    expect(Math.max(...hz)).toBeCloseTo(92.499, 2); // F#2
    expect(midiToHz(NOTE.CS2)).toBeCloseTo(69.296, 2);
    expect(midiToHz(NOTE.E2)).toBeCloseTo(82.407, 2);
    // every pitch is a degree of C# natural minor
    const degrees = new Set(PHRASE_MIDI.map((m) => (((m - NOTE.CS2) % 12) + 12) % 12));
    for (const d of degrees) expect([0, 2, 3, 5, 7, 8, 10]).toContain(d);
  });

  it("closes BOTH bars on the tonic, which is what lets a half-finished phrase stop cleanly", () => {
    expect(PHRASE_MIDI[BEATS_PER_BAR - 1]).toBe(NOTE.CS2);
    expect(PHRASE_MIDI[PHRASE_MIDI.length - 1]).toBe(NOTE.CS2);
  });
});

describe("tempo is derived from the ACHIEVABLE cadence, not the nominal stat", () => {
  it("the wind-up, not the stat, sets the ceiling", () => {
    // 喪標麥可's attackDamagePoint is 0.15 s = 5 ticks. Under #252's raised
    // clamp the cooldown is ALSO 5 ticks, so buying more attack speed past that
    // buys nothing: the swing cannot repeat faster than its own wind-up.
    const at252 = attackIntervalSec(ATTACK_SPEED_MAX_252);
    expect(at252).toBeCloseTo(5 * SIM_TICK_SEC, 6);
    expect(attackIntervalSec(ATTACK_SPEED_MAX_252 * 4)).toBeCloseTo(at252, 6);
  });

  it("reports the real BPM floor and ceiling", () => {
    const ceilingMain = bpmFromBeatSec(attackIntervalSec(ATTACK_SPEED_MAX_MAIN));
    const ceiling252 = bpmFromBeatSec(attackIntervalSec(ATTACK_SPEED_MAX_252));
    const atBase = bpmFromBeatSec(attackIntervalSec(ZOMBIEX_BASE_ATTACK_SPEED));
    const nominalFloor = bpmFromBeatSec(attackIntervalSec(ATTACK_SPEED_MIN));
    expect(ceilingMain).toBeCloseTo(150, 1); // main's [0.2, 2.5] clamp
    expect(ceiling252).toBeCloseTo(360, 1); // #252's [0.2, 6.0] clamp
    expect(atBase).toBeCloseTo(41.9, 1); // the champion as shipped
    expect(nominalFloor).toBeCloseTo(12, 1); // 5 s per swing
    // ...but a phrase that SURVIVES cannot be slower than the buff's lifetime.
    expect(bpmFromBeatSec(BEAT_STACK_TTL_SEC)).toBeCloseTo(15, 1);
  });

  it("clamps the derived window to [40, 360] BPM without ever moving a note", () => {
    expect(bpmFromBeatSec(BEAT_SEC_MIN)).toBeCloseTo(BPM_MAX, 6);
    expect(bpmFromBeatSec(BEAT_SEC_MAX)).toBeCloseTo(BPM_MIN, 6);
    expect(clampBeatSec(99)).toBe(BEAT_SEC_MAX);
    expect(clampBeatSec(0.001)).toBe(BEAT_SEC_MIN);
    expect(clampBeatSec(Number.NaN)).toBe(BEAT_SEC_MAX);
  });

  it("TempoTracker speeds up when the player speeds up", () => {
    const slow = new TempoTracker();
    let t = 0;
    for (let i = 0; i < 6; i++) slow.note((t += 1400));
    const fast = new TempoTracker();
    t = 0;
    for (let i = 0; i < 6; i++) fast.note((t += 300));
    expect(fast.bpm).toBeGreaterThan(slow.bpm);
    expect(slow.bpm).toBeGreaterThan(BPM_MIN - 1);
    expect(fast.bpm).toBeLessThan(BPM_MAX + 1);
  });

  it("a gap longer than the 4 s stack lifetime is a BROKEN phrase, not a slow tempo", () => {
    const tt = new TempoTracker();
    let t = 0;
    for (let i = 0; i < 6; i++) tt.note((t += 300));
    const before = tt.bpm;
    tt.note((t += 9000)); // player wandered off; the stacks are long gone
    expect(tt.bpm).toBeCloseTo(before, 6);
  });
});

describe("the note envelope reads the tempo", () => {
  it("faster cadence ⇒ shorter, brighter notes", () => {
    const hz = midiToHz(NOTE.CS2);
    const slow = noteShape(BEAT_SEC_MAX, 0.8, hz);
    const fast = noteShape(BEAT_SEC_MIN, 0.8, hz);
    expect(fast.holdSec).toBeLessThan(slow.holdSec);
    expect(fast.releaseSec).toBeLessThan(slow.releaseSec);
    expect(fast.cutoffPeakHz).toBeGreaterThan(slow.cutoffPeakHz);
  });

  it("a note never outlasts its own beat, so the riff can never drone", () => {
    for (const beat of [BEAT_SEC_MIN, 0.3, 0.8, BEAT_SEC_MAX]) {
      const s = noteShape(beat, 1, midiToHz(NOTE.B1));
      expect(s.attackSec + s.holdSec).toBeLessThanOrEqual(beat);
    }
  });

  it("the filter always opens above its resting cutoff (there is always a pluck)", () => {
    for (const midi of PHRASE_MIDI) {
      const s = noteShape(0.5, 0.6, midiToHz(midi));
      expect(s.cutoffPeakHz).toBeGreaterThan(s.cutoffHz);
    }
  });

  it("the drive curve is a monotone soft saturator, not a clipper", () => {
    const c = driveCurve();
    expect(c[0]).toBeCloseTo(-1, 3);
    expect(c[c.length - 1]).toBeCloseTo(1, 3);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
    // gain above unity near zero is what "analog warmth" means here
    const mid = Math.floor(c.length / 2);
    expect(Math.abs(c[mid + 40]! - c[mid]!)).toBeGreaterThan((80 / c.length) * 0.5);
  });
});

describe("the phrase plan", () => {
  it("bar 1 fires one note per landed stack, in order", () => {
    const midis = [1, 2, 3, 4].map((s) => planBarOneNote(s, 0.5)?.midi);
    expect(midis).toEqual([NOTE.CS2, NOTE.CS2, NOTE.B1, NOTE.CS2]);
    expect(planBarOneNote(0, 0.5)).toBeNull();
    expect(planBarOneNote(5, 0.5)).toBeNull();
  });

  it("bar 2 is the answering four, evenly spaced at double time", () => {
    const beat = 0.6;
    const plan = planBarTwo(beat);
    expect(plan.map((n) => n.midi)).toEqual([...BAR_TWO_MIDI]);
    const step = beat / BAR_TWO_RATE;
    expect(plan.map((n) => n.offsetSec)).toEqual([0, step, 2 * step, 3 * step]);
    // and the whole flourish fits inside one 4 s stack window at the SLOWEST
    // cadence, which is the reason it is double time in the first place.
    const slowest = planBarTwo(BEAT_SEC_MAX);
    expect(slowest[3]!.offsetSec).toBeLessThan(BEAT_STACK_TTL_SEC);
  });
});

describe("the instrument obeys the mixer", () => {
  it("#62: silenced ⇒ no AudioContext is ever constructed and nothing plays", () => {
    const ctxFactory = vi.fn(() => new FakeCtx() as unknown as AudioContext);
    const synth = new BeatSynth({ silent: true, ctxFactory, settings: new AudioSettingsStore(memStore()) });
    expect(synth.isSilenced).toBe(true);
    expect(synth.play(planBarOneNote(1, 0.5)!)).toBe(false);
    for (const n of planBarTwo(0.5)) expect(synth.play(n)).toBe(false);
    expect(ctxFactory).not.toHaveBeenCalled();
    expect(synth.noteCount).toBe(0);
    expect(synth.liveGain()).toBeNull();
    synth.dispose();
  });

  it("builds no context before the autoplay unlock", () => {
    const ctxFactory = vi.fn(() => new FakeCtx() as unknown as AudioContext);
    let unlocked = false;
    const synth = new BeatSynth({
      silent: false,
      ctxFactory,
      gate: () => unlocked,
      settings: new AudioSettingsStore(memStore()),
    });
    expect(synth.play(planBarOneNote(1, 0.5)!)).toBe(false);
    expect(ctxFactory).not.toHaveBeenCalled();
    unlocked = true;
    expect(synth.play(planBarOneNote(1, 0.5)!)).toBe(true);
    expect(ctxFactory).toHaveBeenCalledTimes(1);
    synth.dispose();
  });

  it("#14/#54: master × SFX and both mutes reach the running instrument", () => {
    const { synth, settings } = makeSynth();
    synth.play(planBarOneNote(1, 0.5)!);
    const full = synth.liveGain()!;
    expect(full).toBeGreaterThan(0);

    const { master: m0, sfx: s0 } = settings.get();
    settings.setVolume("sfx", 0.5);
    expect(synth.liveGain()).toBeCloseTo((full * 0.5) / s0, 6);
    settings.setVolume("master", 0.4);
    expect(synth.liveGain()).toBeCloseTo(((full * 0.5) / s0 / m0) * 0.4, 6);

    settings.setBusMuted("sfx", true);
    expect(synth.liveGain()).toBe(0);
    settings.setBusMuted("sfx", false);
    expect(synth.liveGain()).toBeGreaterThan(0);
    settings.setMuted(true);
    expect(synth.liveGain()).toBe(0);
    synth.dispose();
  });

  it("degrades to silence when WebAudio is unavailable, and never throws", () => {
    const synth = new BeatSynth({
      silent: false,
      ctxFactory: () => {
        throw new Error("no WebAudio here");
      },
      settings: new AudioSettingsStore(memStore()),
      warn: () => undefined,
    });
    expect(() => synth.play(planBarOneNote(2, 0.5)!)).not.toThrow();
    expect(synth.play(planBarOneNote(2, 0.5)!)).toBe(false);
    synth.dispose();
  });
});

describe("the instrument is monophonic", () => {
  it("plays three oscillators per note (two saws + a sub) through a resonant lowpass", () => {
    const { synth, ctx } = makeSynth();
    synth.play(planBarOneNote(3, 0.5)!);
    expect(ctx.oscs).toHaveLength(3);
    expect(ctx.oscs.map((o) => o.type)).toEqual(["sawtooth", "sawtooth", "sine"]);
    const hz = midiToHz(NOTE.B1);
    expect(ctx.oscs[0]!.frequency.value).toBeCloseTo(hz, 4);
    expect(ctx.oscs[1]!.detune.value).toBeLessThan(0); // detuned unison
    expect(ctx.oscs[2]!.frequency.value).toBeCloseTo(hz / 2, 4); // sub octave
    const filter = ctx.filters[0]!;
    expect(filter.type).toBe("lowpass");
    expect(filter.Q.value).toBeGreaterThan(1);
    synth.dispose();
  });

  it("a new hit CANCELS a flourish that is still queued (no phrase can overlap itself)", () => {
    const { synth, ctx } = makeSynth();
    for (const n of planBarTwo(1.2)) synth.play(n); // 4 notes, the last ~1.8 s out
    const queued = ctx.oscs.length;
    expect(queued).toBe(12);
    const stopsBefore = ctx.oscs.map((o) => o.stops.length);

    synth.play(planBarOneNote(1, 1.2)!); // the next combo's first stack lands NOW
    // every voice that had not finished gets a second, earlier stop scheduled
    const restopped = ctx.oscs
      .slice(0, queued)
      .filter((o, i) => o.stops.length > stopsBefore[i]!).length;
    expect(restopped).toBe(queued);
    // and the earlier stop really is earlier
    for (let i = 0; i < queued; i++) {
      const s = ctx.oscs[i]!.stops;
      expect(s[s.length - 1]!).toBeLessThan(s[0]!);
    }
    synth.dispose();
  });

  it("counts every note it starts", () => {
    const { synth } = makeSynth();
    for (let s = 1; s <= 4; s++) synth.play(planBarOneNote(s, 0.4)!);
    for (const n of planBarTwo(0.4)) synth.play(n);
    expect(synth.noteCount).toBe(8);
    synth.dispose();
  });
});
