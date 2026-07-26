/**
 * beat/beatPerformance — the phrase, driven entirely through the interface the
 * unmerged #252 kit will call. Every test here is written against
 * `beatStack` / `empowered` / `phraseBroken` and nothing else, because that is
 * the whole contract: if these pass, the kit only has to make those calls.
 *
 * The two that matter most are the negative ones. "The player stops mid-combo"
 * must produce NO extra notes (bar 2 is earned, never given), and the dance must
 * release rather than snap. Both are the kind of thing that sounds fine in a
 * single playtest and is wrong every time after.
 */
import { describe, it, expect } from "vitest";
import {
  BeatPerformance,
  DANCE_RELEASE_MS,
  ENERGY_BY_STACK,
  PHRASE_TIMEOUT_MS,
} from "./beatPerformance";
import {
  BAR_ONE_MIDI,
  BAR_TWO_MIDI,
  BAR_TWO_RATE,
  BEAT_STACK_TTL_SEC,
  BPM_MAX,
  BPM_MIN,
  type BeatSynth,
  type PlannedNote,
} from "../audio/beatSynth";
import { REST_POSE, type PoseTarget } from "../render/beatDance";

/** Records what the instrument was ASKED to play. */
class RecordingSynth {
  readonly played: PlannedNote[] = [];
  releases = 0;
  disposed = false;
  play(note: PlannedNote): boolean {
    this.played.push(note);
    return true;
  }
  release(): void {
    this.releases++;
  }
  dispose(): void {
    this.disposed = true;
  }
  get noteCount(): number {
    return this.played.length;
  }
  get midis(): number[] {
    return this.played.map((n) => n.midi);
  }
}

function rig(): { perf: BeatPerformance; synth: RecordingSynth } {
  const synth = new RecordingSynth();
  const perf = new BeatPerformance({ synth: synth as unknown as BeatSynth, now: () => 0 });
  return { perf, synth };
}

function node(x = 0, y = 0, z = 0, yaw = 0): PoseTarget {
  return { position: { x, y, z }, rotation: { x: 0, y: yaw, z: 0 } };
}

const ZOMBIEX = 7;
const VICTIM = 42;

/** Land `n` stacking autos `gapMs` apart, starting at `t0`. Returns the end time. */
function combo(perf: BeatPerformance, n: number, gapMs: number, t0 = 1000): number {
  let t = t0;
  for (let s = 1; s <= n; s++) {
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: s, atMs: t });
    if (s < n) t += gapMs;
  }
  return t;
}

// ---------------------------------------------------------------------------

describe("the phrase maps onto the mechanic", () => {
  it("the four stacking autos play bar 1, one note per landed hit", () => {
    const { perf, synth } = rig();
    combo(perf, 4, 500);
    expect(synth.midis).toEqual([...BAR_ONE_MIDI]);
    expect(synth.played.every((n) => n.offsetSec === 0)).toBe(true); // fired ON the hit
    expect(perf.noteCursor).toBe(4);
  });

  it("the empowered hit plays bar 2 — the payoff lands on the payoff", () => {
    const { perf, synth } = rig();
    const t = combo(perf, 4, 500);
    synth.played.length = 0;
    perf.empowered({ attacker: ZOMBIEX, target: VICTIM, atMs: t + 500 });
    expect(synth.midis).toEqual([...BAR_TWO_MIDI]);
  });

  it("bar 2 is a double-time run, queued ahead so its spacing is sample-accurate", () => {
    const { perf, synth } = rig();
    const t = combo(perf, 4, 600);
    synth.played.length = 0;
    perf.empowered({ attacker: ZOMBIEX, target: VICTIM, atMs: t + 600 });
    const offsets = synth.played.map((n) => n.offsetSec);
    const step = offsets[1]!;
    expect(offsets).toEqual([0, step, 2 * step, 3 * step]);
    // exactly half of the tempo the performance is reading off the player —
    // and with a steady 600 ms cadence that reading IS 600 ms, not an estimate
    // still easing toward it from a default.
    expect(step).toBeCloseTo(60 / perf.bpm / BAR_TWO_RATE, 9);
    expect(step).toBeCloseTo(0.6 / BAR_TWO_RATE, 3);
    // the whole flourish fits inside the 4 s stack window
    expect(offsets[3]!).toBeLessThan(BEAT_STACK_TTL_SEC);
  });

  it("the sim's stack count is the authority — the music cannot disagree with the status bar", () => {
    const { perf, synth } = rig();
    // stacks that jump (a packet lost, a re-stack after an empowered hit) restart
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 1, atMs: 0 });
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 3, atMs: 400 });
    expect(perf.noteCursor).toBe(3);
    expect(synth.midis).toEqual([BAR_ONE_MIDI[0], BAR_ONE_MIDI[2]]);
  });

  it("a stack count outside 1..4 is not a note in this figure", () => {
    const { perf, synth } = rig();
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 0, atMs: 0 });
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 9, atMs: 100 });
    expect(synth.noteCount).toBe(0);
  });

  it("switching victims restarts the figure rather than continuing it", () => {
    const { perf, synth } = rig();
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 1, atMs: 0 });
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 2, atMs: 400 });
    perf.beatStack({ attacker: ZOMBIEX, target: 99, stacks: 1, atMs: 800 });
    expect(perf.noteCursor).toBe(1);
    expect(synth.midis).toEqual([BAR_ONE_MIDI[0], BAR_ONE_MIDI[1], BAR_ONE_MIDI[0]]);
  });
});

describe("tempo follows the player", () => {
  it("hitting faster raises the BPM readout", () => {
    const slow = rig();
    combo(slow.perf, 4, 1400);
    const fast = rig();
    combo(fast.perf, 4, 260);
    expect(fast.perf.bpm).toBeGreaterThan(slow.perf.bpm * 1.5);
    expect(slow.perf.bpm).toBeGreaterThanOrEqual(BPM_MIN);
    expect(fast.perf.bpm).toBeLessThanOrEqual(BPM_MAX);
  });

  it("the flourish gets tighter as the cadence gets faster", () => {
    const slow = rig();
    combo(slow.perf, 4, 1400);
    slow.synth.played.length = 0;
    slow.perf.empowered({ attacker: ZOMBIEX, target: VICTIM, atMs: 9000 });

    const fast = rig();
    combo(fast.perf, 4, 260);
    fast.synth.played.length = 0;
    fast.perf.empowered({ attacker: ZOMBIEX, target: VICTIM, atMs: 9000 });

    const slowSpan = slow.synth.played[3]!.offsetSec;
    const fastSpan = fast.synth.played[3]!.offsetSec;
    expect(fastSpan).toBeLessThan(slowSpan / 2);
  });

  it("notes are never delayed or quantised — the rhythm IS the cadence", () => {
    const { perf, synth } = rig();
    combo(perf, 4, 137); // a deliberately unmusical gap
    expect(synth.played.every((n) => n.offsetSec === 0)).toBe(true);
  });
});

describe("stopping mid-combo is graceful and does NOT resolve", () => {
  it("plays nothing new when the phrase times out with the mechanic's own 4 s", () => {
    const { perf, synth } = rig();
    combo(perf, 2, 500, 1000);
    const before = synth.noteCount;
    expect(PHRASE_TIMEOUT_MS).toBe(BEAT_STACK_TTL_SEC * 1000);

    const look = () => node();
    perf.update(1500 + PHRASE_TIMEOUT_MS + 1, look);
    perf.update(1500 + PHRASE_TIMEOUT_MS + DANCE_RELEASE_MS + 1, look);
    expect(synth.noteCount).toBe(before); // no free bar 2, no consolation note
    expect(perf.isPerforming).toBe(false);
  });

  it("an explicit phraseBroken behaves the same as the watchdog", () => {
    const { perf, synth } = rig();
    combo(perf, 3, 400, 1000);
    const before = synth.noteCount;
    perf.phraseBroken({ attacker: ZOMBIEX, atMs: 2000 });
    perf.update(2000 + DANCE_RELEASE_MS + 1, () => node());
    expect(synth.noteCount).toBe(before);
    expect(perf.isPerforming).toBe(false);
  });

  it("phraseBroken for a DIFFERENT attacker does not stop this one's phrase", () => {
    const { perf } = rig();
    combo(perf, 2, 400, 1000);
    perf.phraseBroken({ attacker: 999, atMs: 1500 });
    expect(perf.noteCursor).toBe(2);
  });

  it("the body releases instead of snapping", () => {
    const { perf } = rig();
    combo(perf, 4, 400, 1000);
    perf.phraseBroken({ atMs: 2200 });

    const early = node();
    perf.update(2200 + DANCE_RELEASE_MS * 0.1, () => early);
    const late = node();
    perf.update(2200 + DANCE_RELEASE_MS * 0.9, () => late);

    const mag = (n: PoseTarget) => Math.hypot(n.position.x, n.position.z, n.rotation.z);
    expect(mag(early)).toBeGreaterThan(mag(late));
    expect(mag(late)).toBeGreaterThan(0);
  });
});

describe("the dance", () => {
  it("only poses the attacker, and only after a phrase has started", () => {
    const { perf } = rig();
    const target = node();
    perf.update(1000, () => target);
    expect(target.position.x).toBe(0);

    combo(perf, 4, 400, 1000);
    const seen: number[] = [];
    perf.update(1600, (id) => {
      seen.push(id);
      return id === ZOMBIEX ? target : null;
    });
    expect(seen).toEqual([ZOMBIEX]);
    expect(Math.hypot(target.position.x, target.position.z)).toBeGreaterThan(0);
  });

  it("escalates with the stack count", () => {
    const reach = (stacks: number): number => {
      const { perf } = rig();
      combo(perf, stacks, 400, 1000);
      let worst = 0;
      for (let ms = 1000; ms <= 3000; ms += 25) {
        const n = node();
        perf.update(ms, () => n);
        worst = Math.max(worst, Math.hypot(n.position.x, n.position.z));
      }
      return worst;
    };
    const r = [1, 2, 3, 4].map(reach);
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThan(r[i - 1]!);
    expect(ENERGY_BY_STACK[4]).toBe(1);
  });

  it("clears the two tilts it owns when the phrase finally ends", () => {
    const { perf } = rig();
    combo(perf, 4, 400, 1000);
    const n = node();
    perf.update(1600, () => n);
    expect(n.rotation.z).not.toBe(0);
    perf.phraseBroken({ atMs: 1700 });
    perf.update(1700 + DANCE_RELEASE_MS + 1, () => n);
    expect(n.rotation.x).toBe(REST_POSE.pitchRad);
    expect(n.rotation.z).toBe(REST_POSE.rollRad);
  });

  it("survives the dancer being culled mid-phrase — and still pays the tilts back", () => {
    const { perf } = rig();
    combo(perf, 4, 400, 1000);
    const n = node();
    perf.update(1600, () => n);
    expect(n.rotation.z).not.toBe(0);

    // culled for a while (draw distance, a spectator pan) …
    expect(() => perf.update(1700, () => null)).not.toThrow();
    expect(() => perf.update(1800, () => undefined)).not.toThrow();
    // … then the phrase ends. The lean must NOT be left frozen on the body:
    // nothing else in the client writes rotation.x/z.
    perf.phraseBroken({ atMs: 1900 });
    perf.update(1900 + DANCE_RELEASE_MS + 1, () => n);
    expect(n.rotation.x).toBe(0);
    expect(n.rotation.z).toBe(0);
  });

  it("keeps grooving between hits rather than freezing on the last one", () => {
    const { perf } = rig();
    combo(perf, 4, 400, 1000);
    const a = node();
    perf.update(1500, () => a);
    const b = node();
    perf.update(1650, () => b);
    expect(a.position.x).not.toBeCloseTo(b.position.x, 4);
  });
});

describe("the visual half never depends on the audio half", () => {
  it("a silenced instrument still dances (#62 must not delete a mechanic's readout)", () => {
    const perf = new BeatPerformance({ synthOptions: { silent: true }, now: () => 0 });
    combo(perf, 4, 400, 1000);
    expect(perf.synthNoteCount).toBe(0);
    const n = node();
    perf.update(1600, () => n);
    expect(Math.hypot(n.position.x, n.position.z)).toBeGreaterThan(0);
    perf.dispose();
  });

  it("reset stops everything and lets the sounding note decay out", () => {
    const { perf, synth } = rig();
    combo(perf, 4, 400, 1000);
    const n = node();
    perf.update(1600, () => n);
    perf.reset(() => n);
    expect(perf.isPerforming).toBe(false);
    expect(synth.releases).toBe(1);
    expect(n.rotation.z).toBe(0);
  });

  it("dispose is idempotent and stops accepting events", () => {
    const { perf, synth } = rig();
    perf.dispose();
    perf.dispose();
    expect(synth.disposed).toBe(true);
    perf.beatStack({ attacker: ZOMBIEX, target: VICTIM, stacks: 1, atMs: 0 });
    perf.empowered({ attacker: ZOMBIEX, target: VICTIM, atMs: 1 });
    expect(synth.noteCount).toBe(0);
  });
});
