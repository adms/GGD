/**
 * audio: the last-5-seconds countdown for the TIMED PREP PHASES (champ select
 * and, since task #38, the 60 s intermission prep window). The pure guard
 * (`stepCountdown`) must fire EXACTLY ONE cue per whole second with strictly
 * increasing volume, end on the distinct `countFinal`, survive React re-renders
 * and 20 Hz snapshot repeats / backwards timer jitter without double-firing, and
 * rearm when the phase restarts so the next prep phase counts down again — at
 * ANY configured phase length. The last block drives the real AudioSystem over a
 * fake WebAudio graph to prove the volumes reach the per-voice gain nodes and
 * that mute silences the whole sequence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cover } from "@ggd/shared/testkit/cover";
import {
  COUNTDOWN_FINAL_EVENT,
  COUNTDOWN_INITIAL,
  COUNTDOWN_LEAD_SEC,
  COUNTDOWN_PHASES,
  COUNTDOWN_TICK_EVENT,
  COUNTDOWN_VOLUMES,
  cueForSecond,
  isCountdownPhase,
  stepCountdown,
  type CountdownCue,
  type CountdownState,
} from "./countdownCue";
import { AudioSystem } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import type { AudioMap } from "./types";

/** Feed a whole sample stream through the guard, collecting the cues it fires. */
function run(samples: Array<{ phase: string; secondsLeft: number }>, from = COUNTDOWN_INITIAL): {
  cues: CountdownCue[];
  state: CountdownState;
} {
  let state = from;
  const cues: CountdownCue[] = [];
  for (const s of samples) {
    const { cue, next } = stepCountdown(state, s);
    state = next;
    if (cue) cues.push(cue);
  }
  return { cues, state };
}

const cs = (secondsLeft: number): { phase: string; secondsLeft: number } => ({
  phase: "champSelect",
  secondsLeft,
});

describe("champ-select countdown cue (audio-countdown-cue)", () => {
  it("fires 5→1 exactly once each, with STRICTLY INCREASING volume", () => {
    cover("audio-countdown-cue");
    const { cues } = run([cs(30), cs(10), cs(6), cs(5), cs(4), cs(3), cs(2), cs(1), cs(0)]);
    expect(cues).toHaveLength(COUNTDOWN_LEAD_SEC); // 5,4,3,2,1 — nothing above, nothing at 0
    const volumes = cues.map((c) => c.volume);
    expect(volumes).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i]!, `${volumes[i]} > ${volumes[i - 1]}`).toBeGreaterThan(volumes[i - 1]!);
    }
    expect(volumes[volumes.length - 1]).toBe(1.0); // final second is full scale
  });

  it("uses countFinal ONLY for the last second; 5..2 are countTick", () => {
    cover("audio-countdown-cue");
    const { cues } = run([cs(5), cs(4), cs(3), cs(2), cs(1)]);
    expect(cues.map((c) => c.event)).toEqual([
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_FINAL_EVENT,
    ]);
    expect(COUNTDOWN_FINAL_EVENT).not.toBe(COUNTDOWN_TICK_EVENT); // audibly distinct clips
  });

  it("cueForSecond is a pure window: silent above the lead and at 0", () => {
    cover("audio-countdown-cue");
    expect(cueForSecond(COUNTDOWN_LEAD_SEC + 1)).toBeNull();
    expect(cueForSecond(0)).toBeNull();
    expect(cueForSecond(-3)).toBeNull();
    expect(cueForSecond(Number.NaN)).toBeNull();
    expect(cueForSecond(5)).toEqual({ event: COUNTDOWN_TICK_EVENT, volume: COUNTDOWN_VOLUMES[5] });
    expect(cueForSecond(1)).toEqual({ event: COUNTDOWN_FINAL_EVENT, volume: 1.0 });
  });

  it("mounting MID-countdown picks up from wherever it is (never silent)", () => {
    cover("audio-countdown-cue");
    // screen appears with 3 s left (reconnect / late join): 3 → 2 → GO.
    const { cues } = run([cs(3), cs(2), cs(1), cs(0)]);
    expect(cues.map((c) => c.event)).toEqual([
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_FINAL_EVENT,
    ]);
    expect(cues.map((c) => c.volume)).toEqual([0.75, 0.9, 1.0]); // volume tracks the SECOND
  });
});

describe("champ-select countdown guard (audio-countdown-guard)", () => {
  it("re-renders / repeated 20 Hz snapshots of the same second fire ONCE", () => {
    cover("audio-countdown-guard");
    // the store republishes at snapshot rate; React re-renders on any field.
    const samples = [3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1].map(cs);
    const { cues } = run(samples);
    expect(cues).toHaveLength(3);
    expect(cues.map((c) => c.volume)).toEqual([0.75, 0.9, 1.0]);
  });

  it("backwards timer jitter (3→4→3) never double-fires nor goes quieter", () => {
    cover("audio-countdown-guard");
    const { cues } = run([cs(5), cs(4), cs(3), cs(4), cs(3), cs(2), cs(3), cs(1)]);
    // the bounces back up to 4 and 3 are swallowed; volumes stay monotonic
    expect(cues.map((c) => c.volume)).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
    const evs = cues.map((c) => c.event);
    expect(evs.filter((e) => e === COUNTDOWN_FINAL_EVENT)).toHaveLength(1);
  });

  it("a clock parked at 0 (or a dropped second) never re-fires the final cue", () => {
    cover("audio-countdown-guard");
    const { cues } = run([cs(2), cs(1), cs(0), cs(0), cs(0), cs(0)]);
    expect(cues).toHaveLength(2);
    // a dropped snapshot skips a second rather than replaying it
    const skipped = run([cs(5), cs(3), cs(1)]).cues;
    expect(skipped.map((c) => c.volume)).toEqual([0.45, 0.75, 1.0]);
  });

  it("REARMS between phases so the NEXT champ select counts down again", () => {
    cover("audio-countdown-guard");
    const first = run([cs(5), cs(4), cs(3), cs(2), cs(1)]);
    expect(first.cues).toHaveLength(5);
    // phase moves on, then a whole new champ select starts with a full clock
    const second = run(
      [
        { phase: "intermission", secondsLeft: 20 }, // prep window, still above the lead
        { phase: "combat", secondsLeft: 3 }, // combat's own 3 s must stay silent
        { phase: "matchEnd", secondsLeft: 1 },
        cs(30),
        cs(5),
        cs(4),
        cs(3),
        cs(2),
        cs(1),
      ],
      first.state,
    );
    expect(second.cues).toHaveLength(5);
    expect(second.cues.map((c) => c.volume)).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
    expect(second.cues[4]!.event).toBe(COUNTDOWN_FINAL_EVENT);
  });

  it("rearms in-place when the champ-select clock jumps back above the lead", () => {
    cover("audio-countdown-guard");
    // extended/restarted timer WITHOUT leaving champSelect
    const { cues } = run([cs(2), cs(1), cs(45), cs(5), cs(4), cs(3), cs(2), cs(1)]);
    expect(cues).toHaveLength(2 + 5);
    expect(cues.slice(2).map((c) => c.volume)).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
  });
});

// ---------------------------------------------------------------------------
// task #38: the intermission PREP WINDOW rings the same bells, and the cue is
// independent of how long the phase was configured to be.
// ---------------------------------------------------------------------------

const prep = (secondsLeft: number): { phase: string; secondsLeft: number } => ({
  phase: "intermission",
  secondsLeft,
});

describe("prep-window countdown (audio-countdown-prep)", () => {
  it("champ select AND the intermission prep window count down; combat does not", () => {
    cover("audio-countdown-prep");
    expect(COUNTDOWN_PHASES).toContain("champSelect");
    expect(COUNTDOWN_PHASES).toContain("intermission");
    expect(isCountdownPhase("combat")).toBe(false);
    expect(isCountdownPhase("resolution")).toBe(false);
    expect(isCountdownPhase("matchEnd")).toBe(false);
  });

  it("the 60 s prep window rings the full 5→1 sequence, unchanged in shape", () => {
    cover("audio-countdown-prep");
    // a whole 60 s clock ticking down one second at a time
    const samples = Array.from({ length: 61 }, (_, i) => prep(60 - i));
    const { cues } = run(samples);
    expect(cues).toHaveLength(COUNTDOWN_LEAD_SEC);
    expect(cues.map((c) => c.volume)).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
    expect(cues[4]!.event).toBe(COUNTDOWN_FINAL_EVENT);
  });

  it("phase LENGTH is irrelevant: 25 s, 60 s and 90 s all ring the same 5 bells", () => {
    cover("audio-countdown-prep");
    for (const total of [25, 60, 90]) {
      const samples = Array.from({ length: total + 1 }, (_, i) => prep(total - i));
      const { cues } = run(samples);
      expect(cues.map((c) => c.volume), `prep window of ${total}s`).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
    }
  });

  it("every ROUND's prep window counts down again (rearm across the round loop)", () => {
    cover("audio-countdown-prep");
    const round1 = run([prep(5), prep(4), prep(3), prep(2), prep(1)]);
    expect(round1.cues).toHaveLength(5);
    const round2 = run(
      [
        { phase: "combat", secondsLeft: 4 }, // the duel — silent
        { phase: "resolution", secondsLeft: 2 }, // round over — silent
        prep(60),
        prep(5),
        prep(4),
        prep(3),
        prep(2),
        prep(1),
      ],
      round1.state,
    );
    expect(round2.cues).toHaveLength(5);
    expect(round2.cues[4]!.event).toBe(COUNTDOWN_FINAL_EVENT);
  });

  it("a champ-select bell never suppresses the prep window's (phase change rearms)", () => {
    cover("audio-countdown-prep");
    // champ select ends having fired its 1 s cue…
    const after = run([cs(2), cs(1)]);
    expect(after.state.lastFiredSec).toBe(1);
    // …and a prep window sampled INSIDE the window still fires from where it is,
    // even though its second is not strictly below the champ-select one.
    const { cues } = run([prep(3), prep(2), prep(1)], after.state);
    expect(cues.map((c) => c.volume)).toEqual([0.75, 0.9, 1.0]);
  });
});

// ---------------------------------------------------------------------------
// task #95: pressing Ready ANSWERS the prep window's question. The four nagging
// ticks stop; the single race-start "brace" cue on the last second survives.
// This is the "it keeps beeping after Ready" bug, in its pure form.
// ---------------------------------------------------------------------------

const readied = (secondsLeft: number): { phase: string; secondsLeft: number; committed: boolean } => ({
  phase: "intermission",
  secondsLeft,
  committed: true,
});

describe("Ready silences the nagging (audio-countdown-committed)", () => {
  it("a whole committed window makes exactly ONE sound — the final cue", () => {
    cover("audio-countdown-committed");
    const { cues } = run([readied(5), readied(4), readied(3), readied(2), readied(1), readied(0)]);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.event).toBe(COUNTDOWN_FINAL_EVENT);
    expect(cues[0]!.volume).toBe(1.0); // "combat starts NOW" is still full scale
  });

  it("pressing Ready MID-countdown stops the remaining ticks from that second on", () => {
    cover("audio-countdown-committed");
    // 5 s and 4 s ring normally, Ready lands, 3 s and 2 s go quiet, 1 s braces.
    const { cues } = run([prep(5), prep(4), readied(3), readied(2), readied(1)]);
    expect(cues.map((c) => c.event)).toEqual([
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_TICK_EVENT,
      COUNTDOWN_FINAL_EVENT,
    ]);
    expect(cues.map((c) => c.volume)).toEqual([0.45, 0.6, 1.0]);
  });

  it("a suppressed second is CONSUMED, never queued up to fire late", () => {
    cover("audio-countdown-committed");
    // the guard advances through the silent seconds…
    const quiet = run([readied(5), readied(4), readied(3)]);
    expect(quiet.cues).toHaveLength(0);
    expect(quiet.state.lastFiredSec).toBe(3);
    // …so even a (server-impossible) un-commit cannot replay 5/4/3.
    const after = run([prep(3), prep(2), prep(1)], quiet.state);
    expect(after.cues.map((c) => c.volume)).toEqual([0.9, 1.0]); // 3 s is already spent
  });

  it("NOT committed is bit-for-bit the old behaviour (default + explicit false)", () => {
    cover("audio-countdown-committed");
    const implicit = run([prep(5), prep(4), prep(3), prep(2), prep(1)]).cues;
    const explicit = run(
      [5, 4, 3, 2, 1].map((s) => ({ phase: "intermission", secondsLeft: s, committed: false })),
    ).cues;
    expect(implicit).toEqual(explicit);
    expect(implicit.map((c) => c.volume)).toEqual([0.45, 0.6, 0.75, 0.9, 1.0]);
    expect(cueForSecond(4)).toEqual(cueForSecond(4, false));
  });

  it("committed drops ticks only — cueForSecond keeps the final cue at every call", () => {
    cover("audio-countdown-committed");
    for (let sec = 2; sec <= COUNTDOWN_LEAD_SEC; sec++) {
      expect(cueForSecond(sec, true), `${sec}s must be silent once committed`).toBeNull();
    }
    expect(cueForSecond(1, true)).toEqual({ event: COUNTDOWN_FINAL_EVENT, volume: 1.0 });
  });

  it("the champ-select countdown is NOT commitable — its deadline costs you a champion", () => {
    cover("audio-countdown-committed");
    // The director scopes `committed` to the intermission (a stale seat flag must
    // never silence the one countdown that picks your champion for you).
    const src = readFileSync(new URL("../ui/AudioDirector.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/committed\s*=\s*phase === "intermission" && localReady/);
    // and champ select's own sequence is untouched
    expect(run([cs(5), cs(4), cs(3), cs(2), cs(1)]).cues).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// end-to-end over a fake WebAudio graph: the cue volumes reach the voice gains,
// and mute silences the sequence.
// ---------------------------------------------------------------------------

class FakeParam {
  value = 0;
  cancelScheduledValues(): void {}
  setValueCurveAtTime(curve: Float32Array): void {
    this.value = curve[curve.length - 1] ?? this.value;
  }
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
}
class FakeGain {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}
class FakeSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  constructor(private ctx: FakeCtx) {}
  connect(): void {}
  disconnect(): void {}
  start(): void {
    this.ctx.started.push(this);
  }
  stop(): void {}
  end(): void {
    this.onended?.();
  }
}
class FakeCtx {
  currentTime = 0;
  destination = {};
  state: "suspended" | "running" | "closed" = "suspended";
  started: FakeSource[] = [];
  gains: FakeGain[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this);
  }
  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({ duration: 1 } as unknown as AudioBuffer);
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
}

/** the two authored countdown entries (mirrors content/config/audio-map.json) */
const COUNT_MAP: AudioMap = {
  bgm: {},
  sfx: {
    countTick: { files: ["assets/audio/sfx/fx/count-tick.wav"], gain: 0.9, cooldownMs: 300, maxConcurrent: 2 },
    countFinal: { files: ["assets/audio/sfx/fx/count-final.wav"], gain: 0.9, cooldownMs: 300, maxConcurrent: 2 },
  },
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function buildSys(): {
  sys: AudioSystem;
  ctxRef: () => FakeCtx | null;
  settings: AudioSettingsStore;
  advance: (ms: number) => void;
} {
  let ctx: FakeCtx | null = null;
  let now = 0;
  const settings = new AudioSettingsStore({ getItem: () => null, setItem: () => {} });
  const sys = new AudioSystem({
    fetchFn: (url: string) =>
      Promise.resolve(
        url.endsWith("config/audio-map.json")
          ? ({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...COUNT_MAP }),
            } as Response)
          : ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response),
      ),
    now: () => now,
    rng: () => 0,
    warn: () => {},
    settings,
    ctxFactory: () => {
      ctx = new FakeCtx();
      return ctx as unknown as AudioContext;
    },
  });
  return { sys, ctxRef: () => ctx, settings, advance: (ms) => (now += ms) };
}

describe("champ-select countdown through the mixer (audio-countdown-guard)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** run the 5→1 countdown one real second apart; returns the voice gains. */
  async function playSequence(sys: AudioSystem, ctxOf: () => FakeCtx | null, advance: (ms: number) => void): Promise<number[]> {
    let state = COUNTDOWN_INITIAL;
    const voiceGains: number[] = [];
    let ended = 0;
    for (const sec of [5, 4, 3, 2, 1]) {
      const { cue, next } = stepCountdown(state, { phase: "champSelect", secondsLeft: sec });
      state = next;
      expect(cue).not.toBeNull();
      const before = ctxOf()?.gains.length ?? 0;
      sys.playSfx(cue!.event, { volume: cue!.volume });
      await flush();
      const ctx = ctxOf()!;
      // the voice gain node created for THIS play (buses were made at unlock)
      for (let i = before; i < ctx.gains.length; i++) voiceGains.push(ctx.gains[i]!.gain.value);
      // the clip finishes before the next second (150/420 ms clips, 1 s apart)
      for (; ended < ctx.started.length; ended++) ctx.started[ended]!.end();
      advance(1000);
    }
    return voiceGains;
  }

  it("lands strictly increasing voice gains, one voice per second", async () => {
    cover("audio-countdown-guard");
    const { sys, ctxRef, advance } = buildSys();
    await sys.loadMap();
    sys.unlock();
    await flush();
    const gains = await playSequence(sys, ctxRef, advance);
    expect(gains).toHaveLength(5); // exactly one voice per second — nothing gated
    for (let i = 1; i < gains.length; i++) expect(gains[i]!).toBeGreaterThan(gains[i - 1]!);
    // authored entry gain 0.9 × the cue volume
    expect(gains[0]!).toBeCloseTo(0.9 * 0.45, 6);
    expect(gains[4]!).toBeCloseTo(0.9 * 1.0, 6);
    sys.dispose();
  });

  it("mute suppresses the whole countdown (master and the SFX bus alike)", async () => {
    cover("audio-countdown-guard");
    const { sys, ctxRef, settings, advance } = buildSys();
    await sys.loadMap();
    sys.unlock();
    await flush();
    // ensureCtx builds master, bgmBus, sfxBus in that order
    const [master, , sfxBus] = ctxRef()!.gains;
    sys.setMuted(true);
    expect(master!.gain.value).toBe(0); // everything downstream is silent
    await playSequence(sys, ctxRef, advance);
    expect(master!.gain.value).toBe(0); // a countdown cue never re-opens the mixer
    sys.setMuted(false);
    sys.setBusMuted("sfx", true);
    expect(sfxBus!.gain.value).toBe(0); // SFX-only mute silences the ticks too
    expect(settings.get().sfxMuted).toBe(true);
    sys.dispose();
  });

  it("still no-ops before the autoplay unlock gate opens", async () => {
    cover("audio-countdown-guard");
    const { sys, ctxRef } = buildSys();
    await sys.loadMap();
    expect(sys.playSfx(COUNTDOWN_TICK_EVENT, { volume: 0.45 })).toBe(false);
    expect(sys.playSfx(COUNTDOWN_FINAL_EVENT, { volume: 1 })).toBe(false);
    await flush();
    expect(ctxRef()).toBeNull(); // no AudioContext before the first gesture
    sys.dispose();
  });
});
