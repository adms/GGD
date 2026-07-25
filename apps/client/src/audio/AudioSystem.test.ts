/**
 * audio: AudioSystem integration over a FAKE WebAudio graph + fetch. Covers
 * the autoplay unlock (no context before a gesture), the single-bed crossfade
 * (scene swap vs. same-scene no-op), SFX cooldown/concurrency end-to-end
 * through the real gate, and graceful degradation when a file 404s / the map
 * is missing (never throws into the caller).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { AudioSystem, shouldSilenceAudio, type BedEndedEvent } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import type { AudioMap } from "./types";

// ---------------------------------------------------------------------------
// fake WebAudio
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
/**
 * Connect/disconnect are RECORDED, not swallowed. The old fakes had empty
 * bodies, so no test in this repo could prove any spatial node was ever torn
 * down — "the panner is disconnected" was a claim from reading the source. With
 * `connections` tracked, the teardown tests below can assert the connected-node
 * count returns to zero on BOTH the happy path and the throw path.
 */
class FakeNode {
  connections = 0;
  disconnects = 0;
  connect(): void {
    this.connections++;
  }
  disconnect(): void {
    this.disconnects++;
    this.connections = 0;
  }
  get connected(): boolean {
    return this.connections > 0;
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakePanner extends FakeNode {
  pan = new FakeParam();
}
class FakeFilter extends FakeNode {
  type = "";
  frequency = new FakeParam();
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  /** captured args of start(when, offset) — the task #109 phase-resume seam */
  startWhen = 0;
  startOffset = 0;
  constructor(private ctx: FakeCtx) {
    super();
  }
  start(when = 0, offset = 0): void {
    if (this.ctx.failNextStart) {
      this.ctx.failNextStart = false;
      throw new Error("start failed");
    }
    this.started = true;
    this.startWhen = when;
    this.startOffset = offset;
    this.ctx.started.push(this);
  }
  stop(): void {
    this.stopped = true;
  }
  /** test helper: simulate the clip finishing */
  end(): void {
    this.onended?.();
  }
}
class FakeCtx {
  currentTime = 0;
  destination = {};
  state: "suspended" | "running" | "closed" = "suspended";
  resumed = 0;
  closed = false;
  started: FakeSource[] = [];
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  filters: FakeFilter[] = [];
  /** set to make the NEXT src.start() throw (exercises the catch/teardown) */
  failNextStart = false;
  /** decoded-buffer duration (seconds) — parametrised for the loop-resume test */
  constructor(readonly bufferDuration = 1) {}
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createStereoPanner(): FakePanner {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this);
  }
  /** every spatial insert node currently wired into the graph */
  connectedSpatialNodes(): number {
    return [...this.panners, ...this.filters].filter((n) => n.connected).length;
  }
  decodeAudioData(_bytes: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({ duration: this.bufferDuration } as unknown as AudioBuffer);
  }
  resume(): Promise<void> {
    this.resumed++;
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    this.state = "closed";
    return Promise.resolve();
  }
}

const MAP: AudioMap = {
  bgm: {
    menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 1 },
    combat: { file: "assets/audio/bgm/combat.mp3", loop: true, gain: 0.8 },
    fireRing: { file: "assets/audio/bgm/fireRing.mp3", loop: true, gain: 0.9 },
    battleStart: { file: "assets/audio/bgm/battleStart.mp3", loop: false },
    victory: { file: "assets/audio/bgm/victory.mp3", loop: false },
  },
  sfx: {
    death: { files: ["assets/audio/sfx/die.mp3"], cooldownMs: 300, maxConcurrent: 2 },
    missing: { files: ["assets/audio/sfx/nope.mp3"], cooldownMs: 0, maxConcurrent: 4 },
  },
};

/** a fetch that serves the map + any assets/ path, and 404s "nope". */
function okFetch(map: AudioMap = MAP): (url: string) => Promise<Response> {
  return (url: string) => {
    if (url.endsWith("config/audio-map.json")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...map }),
      } as Response);
    }
    if (url.includes("nope.mp3")) {
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }
    if (url.includes("assets/")) {
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  };
}

/** drain the fetch→arrayBuffer→decode→then microtask chain (several hops) */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/**
 * task #63: a map whose SFX keys line up with the scene manifest, so a scene
 * change warms a known subset. `uiClick` is core; `champSelectConfirm` belongs
 * to champSelect; `hit`/`death` belong to combat.
 */
const SCENE_MAP: AudioMap = {
  bgm: {
    champSelect: { file: "assets/audio/bgm/champSelect.mp3", loop: true },
    combat: { file: "assets/audio/bgm/combat.mp3", loop: true },
  },
  sfx: {
    uiClick: { files: ["assets/audio/sfx/ui-click.mp3"] }, // always-on core
    champSelectConfirm: { files: ["assets/audio/sfx/pick.mp3"] }, // champSelect scene
    hit: { files: ["assets/audio/sfx/fx/thud.mp3"] }, // combat scene
    death: { files: ["assets/audio/sfx/die.mp3"], cooldownMs: 0, maxConcurrent: 4 }, // combat tally
  },
};

/** A fetch that records which `assets/` files were requested (preload probe). */
function recordingFetch(map: AudioMap): {
  fetchFn: (url: string) => Promise<Response>;
  requested: (file: string) => boolean;
  reset: () => void;
} {
  const seen = new Set<string>();
  const base = okFetch(map);
  return {
    fetchFn: (url: string) => {
      if (url.includes("assets/")) seen.add(url);
      return base(url);
    },
    requested: (file: string) => [...seen].some((u) => u.includes(file)),
    reset: () => seen.clear(),
  };
}

function build(overrides: Partial<{
  fetchFn: (url: string) => Promise<Response>;
  now: () => number;
  rng: () => number;
  /** decoded-buffer duration (seconds) the FakeCtx reports — loop-resume math */
  bufferDuration: number;
  /** force test-mode silence (task #62); omitted = read from the environment */
  silent: boolean;
}> = {}): { sys: AudioSystem; ctxRef: () => FakeCtx | null } {
  let ctx: FakeCtx | null = null;
  const sys = new AudioSystem({
    fetchFn: overrides.fetchFn ?? okFetch(),
    now: overrides.now ?? (() => 0),
    rng: overrides.rng ?? (() => 0),
    crossfadeMs: 10,
    warn: () => {},
    silent: overrides.silent,
    settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    ctxFactory: () => {
      ctx = new FakeCtx(overrides.bufferDuration ?? 1);
      return ctx as unknown as AudioContext;
    },
  });
  return { sys, ctxRef: () => ctx };
}

describe("AudioSystem unlock (audio-unlock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("creates no AudioContext and plays nothing before the first gesture", async () => {
    cover("audio-unlock");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.playBgm("menu"); // records scene, but locked
    await flush();
    expect(ctxRef()).toBeNull(); // no context yet
    expect(sys.isUnlocked).toBe(false);
    expect(sys.scene).toBe("menu"); // remembered for unlock
    sys.dispose();
  });

  it("resumes the context and starts the current scene on unlock()", async () => {
    cover("audio-unlock");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.playBgm("menu");
    sys.unlock();
    await flush();
    const ctx = ctxRef();
    expect(ctx).not.toBeNull();
    expect(ctx!.resumed).toBeGreaterThan(0);
    expect(sys.isUnlocked).toBe(true);
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
    sys.dispose();
  });
});

describe("AudioSystem BGM swap (audio-bgm-swap)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("swaps the bed on a scene change and no-ops for the same scene", async () => {
    cover("audio-bgm-swap");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.unlock();
    sys.playBgm("menu");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
    const startedAfterMenu = ctxRef()!.started.length;

    // same scene again: no new source started, bed unchanged
    sys.playBgm("menu");
    await flush();
    expect(ctxRef()!.started.length).toBe(startedAfterMenu);
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");

    // different scene: new bed
    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3");
    expect(ctxRef()!.started.length).toBeGreaterThan(startedAfterMenu);
    sys.dispose();
  });

  it("a one-shot sting plays without disturbing the bed", async () => {
    cover("audio-bgm-swap");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.unlock();
    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3");
    const before = ctxRef()!.started.length;
    sys.playSting("battleStart");
    await flush();
    expect(ctxRef()!.started.length).toBe(before + 1); // sting started
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3"); // bed untouched
    sys.dispose();
  });

  // The login theme rotation (task #88) schedules its crossfade off the bed's
  // OWN start time so each segment is a whole loop of the file that is really
  // playing. That is not knowable from the scene value or from mount time: the
  // bed does not start until the autoplay unlock, which can be far later.
  it("reports when the CURRENT bed started, and only while one is playing", async () => {
    cover("audio-bgm-swap");
    let clock = 1000;
    const { sys } = build({ now: () => clock });
    await sys.loadMap();
    sys.unlock();
    expect(sys.bedStartedAtMs).toBeNull(); // nothing playing yet

    sys.playBgm("menu");
    await flush();
    expect(sys.bedStartedAtMs).toBe(1000);

    // time passing does NOT move the anchor — it is a start time, not "now"
    clock = 9000;
    expect(sys.bedStartedAtMs).toBe(1000);

    // a swap re-anchors, which is what lets the rotation re-arm on a new bed
    sys.playBgm("combat");
    await flush();
    expect(sys.bedStartedAtMs).toBe(9000);

    // authored silence stops the bed and clears the anchor
    clock = 12_000;
    sys.playBgm(null);
    await flush();
    expect(sys.bedStartedAtMs).toBeNull();
    sys.dispose();
  });
});

describe("AudioSystem SFX gating (audio-cooldown-gate / audio-maxconcurrent-cap)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("throttles a same-frame burst by cooldown", async () => {
    cover("audio-cooldown-gate");
    let t = 1000;
    const { sys } = build({ now: () => t });
    await sys.loadMap();
    sys.unlock();
    await flush();
    expect(sys.playSfx("death")).toBe(true); // t=1000
    expect(sys.playSfx("death")).toBe(false); // still 1000, < 300ms
    t = 1300;
    expect(sys.playSfx("death")).toBe(true); // 300ms later
    sys.dispose();
  });

  it("caps concurrent voices and frees a slot when one ends", async () => {
    cover("audio-maxconcurrent-cap");
    const { sys } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    // "missing" has cooldown 0, cap 4 — but its clip 404s, so each acquired
    // voice is released again once the decode resolves null (never throws).
    expect(() => {
      for (let i = 0; i < 10; i++) sys.playSfx("missing");
    }).not.toThrow();
    await flush();
    expect(sys.activeVoices("missing")).toBe(0); // all released after 404
    sys.dispose();
  });
});

describe("AudioSystem positioned SFX (audio-sfx-volume-pan)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scales the voice gain by the per-call volume and inserts a StereoPanner", async () => {
    cover("audio-sfx-volume-pan");
    const { sys, ctxRef } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    const gainsBefore = ctx.gains.length; // master + bgm + sfx graph gains
    expect(sys.playSfx("death", { volume: 0.5, pan: -0.5 })).toBe(true);
    await flush();
    // one new voice gain, scaled by the volume (death has no authored gain → 1 × 0.5)
    expect(ctx.gains.length).toBe(gainsBefore + 1);
    expect(ctx.gains[ctx.gains.length - 1]!.gain.value).toBeCloseTo(0.5);
    // a StereoPanner was created and set to the (clamped) pan
    expect(ctx.panners.length).toBe(1);
    expect(ctx.panners[0]!.pan.value).toBeCloseTo(-0.5);
    sys.dispose();
  });

  it("clamps an out-of-range pan and floors a negative volume at 0", async () => {
    cover("audio-sfx-volume-pan");
    const { sys, ctxRef } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    expect(sys.playSfx("death", { volume: -3, pan: 5 })).toBe(true);
    await flush();
    expect(ctx.gains[ctx.gains.length - 1]!.gain.value).toBe(0); // never negative
    expect(ctx.panners[0]!.pan.value).toBeCloseTo(1); // clamped into [-1,1]
    sys.dispose();
  });

  it("omitting pan inserts no panner; omitting volume keeps the authored gain", async () => {
    cover("audio-sfx-volume-pan");
    const { sys, ctxRef } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    expect(sys.playSfx("death")).toBe(true); // no opts → back-compat path
    await flush();
    expect(ctx.panners.length).toBe(0); // centred → no StereoPanner node
    expect(ctx.filters.length).toBe(0); // ...and no depth filter either
    expect(ctx.gains[ctx.gains.length - 1]!.gain.value).toBeCloseTo(1); // authored gain (default 1)
    sys.dispose();
  });
});

/**
 * The 前後 (screen-depth) insert and — the thing this repo has never actually
 * proven — that the spatial nodes are TORN DOWN. The pre-existing fakes had
 * empty `disconnect()` bodies, so "the panner is disconnected" was a claim from
 * reading the source, not a tested fact. It matters more now: a positioned
 * one-shot can carry a panner AND a filter, and the throw path used to release
 * the gate while leaving both wired to the SFX bus.
 */
describe("AudioSystem spatial insert + teardown (audio-spatial-graph)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("inserts a low-pass at the requested cutoff, between the voice gain and the bus", async () => {
    cover("audio-spatial-graph");
    const { sys, ctxRef } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    expect(sys.playSfx("death", { volume: 0.5, pan: -0.4, lowpassHz: 3008 })).toBe(true);
    await flush();
    expect(ctx.panners.length).toBe(1);
    expect(ctx.panners[0]!.pan.value).toBeCloseTo(-0.4);
    expect(ctx.filters.length).toBe(1);
    expect(ctx.filters[0]!.type).toBe("lowpass");
    expect(ctx.filters[0]!.frequency.value).toBeCloseTo(3008);
    // the voice gain still carries the per-call volume → the SFX bus slider and
    // mute, which sit downstream of the insert, are unaffected
    expect(ctx.gains[ctx.gains.length - 1]!.gain.value).toBeCloseTo(0.5);
    sys.dispose();
  });

  it("skips the filter node for an inaudible cutoff and for a non-finite one", async () => {
    cover("audio-spatial-graph");
    let t = 0;
    const { sys, ctxRef } = build({ now: () => t });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    expect(sys.playSfx("death", { pan: 0, lowpassHz: 20000 })).toBe(true); // at the ceiling
    await flush();
    expect(ctx.panners.length).toBe(1); // the pan insert still happened...
    expect(ctx.filters.length).toBe(0); // ...but no filter was worth allocating
    t += 1000; // past the death cooldown
    ctx.started[ctx.started.length - 1]!.end();
    expect(sys.playSfx("death", { pan: 0, lowpassHz: NaN })).toBe(true);
    await flush();
    expect(ctx.filters.length).toBe(0); // a NaN can never reach the AudioParam
    sys.dispose();
  });

  it("disconnects EVERY spatial node when the clip ends", async () => {
    cover("audio-spatial-graph");
    const { sys, ctxRef } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    expect(sys.playSfx("death", { pan: 0.6, lowpassHz: 2400 })).toBe(true);
    await flush();
    expect(ctx.connectedSpatialNodes()).toBe(2); // panner + filter, both wired in
    ctx.started[ctx.started.length - 1]!.end(); // clip finishes
    expect(ctx.connectedSpatialNodes()).toBe(0); // ...and both are released
    expect(ctx.panners[0]!.disconnects).toBeGreaterThan(0);
    expect(ctx.filters[0]!.disconnects).toBeGreaterThan(0);
    expect(sys.activeVoices("death")).toBe(0); // gate slot returned too
    sys.dispose();
  });

  it("ALSO disconnects them when src.start() throws (the path onended never runs on)", async () => {
    cover("audio-spatial-graph");
    const { sys, ctxRef } = build({ now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    ctx.failNextStart = true;
    expect(() => sys.playSfx("death", { pan: -0.7, lowpassHz: 1800 })).not.toThrow();
    await flush();
    expect(ctx.panners.length).toBe(1); // the nodes WERE built before the throw
    expect(ctx.filters.length).toBe(1);
    expect(ctx.connectedSpatialNodes()).toBe(0); // ...and none is left on the bus
    expect(sys.activeVoices("death")).toBe(0); // gate released, as before
    sys.dispose();
  });

  it("makes no AudioContext and no spatial node at all when silenced (task #62)", async () => {
    cover("audio-spatial-graph");
    let t = 0;
    const { sys, ctxRef } = build({ silent: true, now: () => t });
    await sys.loadMap();
    sys.unlock();
    await flush();
    // a whole batch of positioned one-shots, exactly as a busy frame would flush
    for (let i = 0; i < 20; i++) {
      t += 400;
      expect(sys.playSfx("death", { volume: 0.4, pan: -0.5, lowpassHz: 2000 })).toBe(false);
    }
    await flush();
    // the guard is STRUCTURAL: a silenced system's ctxFactory returns null, so
    // ensureCtx() fails and every play short-circuits before any node exists.
    expect(ctxRef()).toBeNull();
    expect(sys.isSilenced).toBe(true);
    sys.dispose();
  });
});

describe("AudioSystem graceful degradation (audio-missing-file)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a 404 clip releases its voice and never throws", async () => {
    cover("audio-missing-file");
    const { sys } = build();
    await sys.loadMap();
    sys.unlock();
    await flush();
    expect(() => sys.playSfx("missing")).not.toThrow();
    await flush();
    expect(sys.activeVoices("missing")).toBe(0);
    sys.dispose();
  });

  it("a missing/!ok audio map runs silent: every call no-ops, nothing throws", async () => {
    cover("audio-missing-file");
    const fetch404 = (): Promise<Response> => Promise.resolve({ ok: false, status: 404 } as Response);
    const { sys } = build({ fetchFn: fetch404 });
    const ok = await sys.loadMap();
    expect(ok).toBe(false);
    sys.unlock();
    expect(() => {
      sys.playBgm("menu");
      sys.playSfx("death");
      sys.playSting("battleStart");
    }).not.toThrow();
    await flush();
    expect(sys.bedFile).toBeNull(); // nothing to play
    sys.dispose();
  });

  it("an unmapped event/scene is a silent no-op", async () => {
    cover("audio-missing-file");
    const { sys } = build();
    await sys.loadMap();
    sys.unlock();
    await flush();
    expect(sys.playSfx("no-such-event")).toBe(false);
    expect(() => sys.playBgm("champSelect")).not.toThrow(); // not in this map
    await flush();
    sys.dispose();
  });

  it("degrades to silence when no AudioContext is available (SSR / old browser)", async () => {
    cover("audio-missing-file");
    const sys = new AudioSystem({
      fetchFn: okFetch(),
      ctxFactory: () => null, // no WebAudio
      warn: () => {},
      settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    });
    await sys.loadMap();
    expect(() => {
      sys.unlock();
      sys.playBgm("menu");
      sys.playSfx("death");
    }).not.toThrow();
    await flush();
    expect(sys.bedFile).toBeNull();
    sys.dispose();
  });
});

describe("AudioSystem volume application (audio-volume-math)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pushes master/bgm/sfx onto the graph, mute zeroes master", async () => {
    cover("audio-volume-math");
    const settings = new AudioSettingsStore({ getItem: () => null, setItem: () => {} });
    let ctx: FakeCtx | null = null;
    const sys = new AudioSystem({
      fetchFn: okFetch(),
      warn: () => {},
      settings,
      ctxFactory: () => {
        ctx = new FakeCtx();
        return ctx as unknown as AudioContext;
      },
    });
    await sys.loadMap();
    sys.unlock(); // builds the graph + applies defaults (.8/.5/.9)
    await flush();
    const nodes = ctx!;
    // graph nodes exist; set explicit volumes and re-read
    sys.setVolume("master", 0.4);
    sys.setVolume("bgm", 0.25);
    sys.setVolume("sfx", 0.6);
    expect(settings.get()).toMatchObject({ master: 0.4, bgm: 0.25, sfx: 0.6 });
    sys.setMuted(true);
    expect(settings.get().muted).toBe(true);
    expect(nodes).toBeTruthy();
    sys.dispose();
    expect(ctx!.closed).toBe(true); // dispose closes the context
  });
});

describe("AudioSystem playClip voice seam (voice-playclip)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is unlock-gated: before the first gesture nothing plays, after it does", async () => {
    cover("voice-playclip");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    expect(sys.playClip("assets/audio/voice/sela-sel1.mp3")).toBe(false); // locked
    await flush();
    expect(ctxRef()?.started.length ?? 0).toBe(0);
    sys.unlock();
    await flush();
    const before = ctxRef()!.started.length;
    expect(sys.playClip("assets/audio/voice/sela-sel1.mp3")).toBe(true);
    await flush();
    expect(ctxRef()!.started.length).toBe(before + 1); // one voice started
    sys.dispose();
  });

  it("rides the SFX bus (bus mute zeroes it) and 404s degrade silently", async () => {
    cover("voice-playclip");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.unlock();
    await flush();
    const ctx = ctxRef()!;
    // gains[2] is the sfx bus (master, bgm, sfx created in ensureCtx order)
    sys.setBusMuted("sfx", true);
    expect(ctx.gains[2]!.gain.value).toBe(0); // playClip voices are silenced too
    sys.setBusMuted("sfx", false);
    const started = ctx.started.length;
    expect(() => sys.playClip("assets/audio/sfx/nope.mp3")).not.toThrow(); // 404 clip
    expect(sys.playClip("")).toBe(false); // empty path no-op
    await flush();
    expect(ctx.started.length).toBe(started); // nothing started for the 404
    sys.dispose();
  });
});

// task #63: SFX load PER SCENE, not all at boot. A small UI core is warmed on
// unlock; each scene warms its own subset on entry; anything unlisted still
// lazy-loads on first play (a preload manifest, never a gate).
describe("AudioSystem scene-scoped SFX preloading (audio-sfx-scene-preload)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("boot fetches NO sfx; unlock warms only the UI core, not the whole set", async () => {
    cover("audio-sfx-scene-preload");
    const rec = recordingFetch(SCENE_MAP);
    const { sys } = build({ fetchFn: rec.fetchFn });
    await sys.init(null); // loadMap only — the real boot path
    await flush();
    // boot pulled the map, but not a single SFX clip
    expect(rec.requested("ui-click.mp3")).toBe(false);
    expect(rec.requested("thud.mp3")).toBe(false);

    sys.unlock(); // first gesture: warm the core (no scene set yet)
    await flush();
    expect(rec.requested("ui-click.mp3")).toBe(true); // core is warm
    expect(rec.requested("pick.mp3")).toBe(false); // champSelect subset: not yet
    expect(rec.requested("thud.mp3")).toBe(false); // combat subset: not yet
    sys.dispose();
  });

  it("entering a scene warms only that scene's SFX subset", async () => {
    cover("audio-sfx-scene-preload");
    const rec = recordingFetch(SCENE_MAP);
    const { sys } = build({ fetchFn: rec.fetchFn });
    await sys.loadMap();
    sys.unlock();
    await flush();
    rec.reset(); // ignore the core warmed at unlock

    sys.playBgm("champSelect");
    await flush();
    expect(rec.requested("pick.mp3")).toBe(true); // champSelect's own cue
    expect(rec.requested("thud.mp3")).toBe(false); // combat is NOT dragged in

    sys.playBgm("combat");
    await flush();
    expect(rec.requested("thud.mp3")).toBe(true); // combat warms on entry
    sys.dispose();
  });

  it("a cue whose scene never preloaded it still plays via lazy fetch", async () => {
    cover("audio-sfx-scene-preload");
    const rec = recordingFetch(SCENE_MAP);
    const { sys } = build({ fetchFn: rec.fetchFn });
    await sys.loadMap();
    sys.unlock();
    sys.playBgm("champSelect"); // does NOT warm the combat `death` cue
    await flush();
    expect(rec.requested("die.mp3")).toBe(false); // never preloaded on this scene

    // firing it anyway still works — the map lookup + lazy fetch/decode path
    expect(sys.playSfx("death")).toBe(true);
    await flush();
    expect(rec.requested("die.mp3")).toBe(true); // fetched on demand
    sys.dispose();
  });

  it("preloading NEVER brings up the AudioContext before the unlock gesture", async () => {
    cover("audio-sfx-scene-preload");
    const rec = recordingFetch(SCENE_MAP);
    const { sys, ctxRef } = build({ fetchFn: rec.fetchFn });
    await sys.loadMap();
    // a scene change while still locked records the scene but must not fetch or
    // build the graph (the "no context before a gesture" contract holds)
    sys.playBgm("combat");
    await flush();
    expect(ctxRef()).toBeNull();
    expect(rec.requested("thud.mp3")).toBe(false);
    // …then the unlock warms exactly that current scene
    sys.unlock();
    await flush();
    expect(rec.requested("thud.mp3")).toBe(true);
    sys.dispose();
  });
});

// task #109: the extended B-section of a looping bed only plays if re-entering
// its scene RESUMES the loop instead of restarting bar 0. Each scene accrues its
// own played time and the source restarts at (elapsed mod duration).
describe("AudioSystem loop resume (audio-bgm-loop-resume)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("re-entering a scene resumes in phase instead of restarting bar 0", async () => {
    cover("audio-bgm-loop-resume");
    let clock = 0;
    const { sys, ctxRef } = build({ now: () => clock, bufferDuration: 8 });
    await sys.loadMap();
    sys.unlock();

    clock = 1000;
    sys.playBgm("combat"); // first entry: from the top of the loop
    await flush();
    const ctx = ctxRef()!;
    expect(ctx.started[ctx.started.length - 1]!.startOffset).toBeCloseTo(0);

    // 3 s of combat, then the last-seconds tension bed takes over
    clock = 4000;
    sys.playBgm("fireRing");
    await flush();
    expect(ctx.started[ctx.started.length - 1]!.startOffset).toBeCloseTo(0); // fireRing's own first entry

    // combat resumes 3 s later — NOT at bar 0: 3 s played, 8 s loop → offset 3
    clock = 7000;
    sys.playBgm("combat");
    await flush();
    const resumed = ctx.started[ctx.started.length - 1]!;
    expect(resumed.startOffset).toBeGreaterThan(0);
    expect(resumed.startOffset).toBeCloseTo(3);
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3");
    sys.dispose();
  });

  it("wraps the resume offset by the loop duration (mod); one-shots always start at 0", async () => {
    cover("audio-bgm-loop-resume");
    let clock = 0;
    const { sys, ctxRef } = build({ now: () => clock, bufferDuration: 2 });
    await sys.loadMap();
    sys.unlock();

    sys.playBgm("combat"); // clock 0
    await flush();
    // play 5 s (> the 2 s loop), swap away and back
    clock = 5000;
    sys.playBgm("menu");
    await flush();
    clock = 6000;
    sys.playBgm("combat");
    await flush();
    const ctx = ctxRef()!;
    // 5 s played mod 2 s loop = 1 s in
    expect(ctx.started[ctx.started.length - 1]!.startOffset).toBeCloseTo(1);

    // a one-shot sting bed (victory, loop:false) ignores accrued time
    clock = 9000;
    sys.playBgm("victory");
    await flush();
    expect(ctx.started[ctx.started.length - 1]!.startOffset).toBe(0);
    sys.dispose();
  });

  it("authored silence (scene → null) still advances the scene clock", async () => {
    cover("audio-bgm-loop-resume");
    let clock = 0;
    const { sys, ctxRef } = build({ now: () => clock, bufferDuration: 10 });
    await sys.loadMap();
    sys.unlock();

    sys.playBgm("combat"); // clock 0
    await flush();
    clock = 4000;
    sys.playBgm(null); // fade to silence — but combat's clock keeps ticking
    await flush();
    clock = 9000;
    sys.playBgm("combat"); // returns after the gap
    await flush();
    const ctx = ctxRef()!;
    // combat had played 4 s before the stop; 10 s loop → resume at offset 4
    expect(ctx.started[ctx.started.length - 1]!.startOffset).toBeCloseTo(4);
    sys.dispose();
  });
});

/**
 * The NATURAL end of a non-looping bed (`onBedEnded`) — the seam that lets the
 * match-end screen hand the bed to 主題曲·寧靜女聲 when the victory sting is over
 * without anyone hardcoding how long that sting is.
 *
 * The subtle half is everything it must NOT report. `AudioBufferSourceNode`
 * fires `onended` for a stop() too, so a crossfade, a scene replacement, an
 * early stop and dispose() would all look identical to "the track finished" if
 * the identity guard were wrong — and the player would get the nocturne over a
 * bed they never heard end. Each of those paths is pinned below.
 */
describe("AudioSystem bed natural end (audio-bed-natural-end)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Start `scene` as the bed and hand back its source node + an event log. */
  async function playBedAndWatch(
    sys: AudioSystem,
    ctxRef: () => FakeCtx | null,
    scene: "victory" | "menu" | "combat",
  ): Promise<{ src: FakeSource; ends: BedEndedEvent[]; off: () => void }> {
    const ends: BedEndedEvent[] = [];
    const off = sys.onBedEnded((ev) => ends.push(ev));
    sys.playBgm(scene);
    await flush();
    const started = ctxRef()!.started;
    return { src: started[started.length - 1]!, ends, off };
  }

  it("reports a one-shot bed that played itself out, with the file and duration", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 18.34 });
    await sys.loadMap();
    sys.unlock();
    const { src, ends } = await playBedAndWatch(sys, ctxRef, "victory");
    expect(ends).toEqual([]); // still playing — nothing announced yet
    expect(sys.bedFile).toBe("assets/audio/bgm/victory.mp3");

    src.end(); // the clip reaches its end on its own
    expect(ends).toEqual([
      { scene: "victory", file: "assets/audio/bgm/victory.mp3", durationSec: 18.34 },
    ]);
    // the bed really is gone by the time listeners run, so a listener that asks
    // for another bed (the whole point) is not fighting a phantom.
    expect(sys.bedFile).toBeNull();
    expect(sys.bedStartedAtMs).toBeNull();

    // a stray second `onended` on the same dead node announces nothing
    src.end();
    expect(ends.length).toBe(1);
    sys.dispose();
  });

  it("does NOT report a bed that was CROSSFADED AWAY by another scene", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 18.34 });
    await sys.loadMap();
    sys.unlock();
    const { src, ends } = await playBedAndWatch(sys, ctxRef, "victory");

    sys.playBgm("menu"); // the sting is replaced part-way through
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
    // fadeOutAndStop stops the old node, which fires onended exactly as a
    // natural end would. It is NOT one: the player never heard the sting finish.
    src.end();
    vi.advanceTimersByTime(1000); // let the real fade-out stop() land too
    expect(ends).toEqual([]);
    sys.dispose();
  });

  it("does NOT report a bed that was STOPPED EARLY (authored silence)", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 18.34 });
    await sys.loadMap();
    sys.unlock();
    const { src, ends } = await playBedAndWatch(sys, ctxRef, "victory");

    sys.playBgm(null); // scene → silence: stopBed() clears the bed first
    await flush();
    src.end();
    vi.advanceTimersByTime(1000);
    expect(ends).toEqual([]);
    sys.dispose();
  });

  it("does NOT report a LOOPING bed — a loop has no natural end", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 42.6 });
    await sys.loadMap();
    sys.unlock();
    const { src, ends } = await playBedAndWatch(sys, ctxRef, "menu");
    expect(src.loop).toBe(true);

    src.end(); // no handler is even installed for a looping bed
    expect(ends).toEqual([]);
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3"); // and it keeps playing
    sys.dispose();
  });

  it("does NOT report a one-shot STING — that is not the bed", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.unlock();
    const { ends } = await playBedAndWatch(sys, ctxRef, "combat");
    const before = ctxRef()!.started.length;

    sys.playSting("battleStart"); // rides the BGM bus, but is not a bed
    await flush();
    const stingSrc = ctxRef()!.started[before]!;
    stingSrc.end();
    expect(ends).toEqual([]);
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3");
    sys.dispose();
  });

  it("does NOT report a bed torn down by dispose(), and drops its subscribers", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 18.34 });
    await sys.loadMap();
    sys.unlock();
    const { src, ends } = await playBedAndWatch(sys, ctxRef, "victory");

    sys.dispose();
    src.end();
    expect(ends).toEqual([]);
  });

  it("stops delivering after the unsubscriber runs", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 18.34 });
    await sys.loadMap();
    sys.unlock();
    const { src, ends, off } = await playBedAndWatch(sys, ctxRef, "victory");
    off();
    src.end();
    expect(ends).toEqual([]);
    sys.dispose();
  });

  it("one throwing listener never starves the others", async () => {
    cover("audio-bed-natural-end");
    const { sys, ctxRef } = build({ bufferDuration: 18.34 });
    await sys.loadMap();
    sys.unlock();
    const seen: string[] = [];
    sys.onBedEnded(() => {
      throw new Error("listener blew up");
    });
    sys.onBedEnded((ev) => seen.push(ev.scene));
    sys.playBgm("victory");
    await flush();
    const started = ctxRef()!.started;
    expect(() => started[started.length - 1]!.end()).not.toThrow();
    expect(seen).toEqual(["victory"]);
    sys.dispose();
  });
});

// task #62: a background agent, CI run or headless capture must make NO sound.
// A single force-silence gate (VITE_GGD_SILENT / window.__GGD_SILENT__ / ?silent)
// is read once at construction; when set the AudioContext is never created and
// every play() no-ops.
describe("AudioSystem test-mode silence (audio-test-silence)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("forced silent: no context is ever created and every play no-ops", async () => {
    cover("audio-test-silence");
    const { sys, ctxRef } = build({ silent: true });
    await sys.loadMap();
    sys.unlock(); // would normally build the graph — but the factory is forced to null
    sys.playBgm("menu");
    expect(sys.playSfx("death")).toBe(false);
    expect(sys.playClip("assets/audio/voice/x.mp3")).toBe(false);
    expect(() => sys.playSting("battleStart")).not.toThrow();
    await flush();
    expect(sys.isSilenced).toBe(true);
    expect(ctxRef()).toBeNull(); // the injected factory never even ran
    expect(sys.contextState).toBeNull();
    expect(sys.isUnlocked).toBe(false);
    expect(sys.bedFile).toBeNull();
    sys.dispose();
  });

  it("reads window.__GGD_SILENT__ at construction; clearing it restores audio", async () => {
    cover("audio-test-silence");
    const g = globalThis as unknown as { __GGD_SILENT__?: unknown };
    try {
      g.__GGD_SILENT__ = true;
      expect(shouldSilenceAudio()).toBe(true);
      const { sys, ctxRef } = build(); // silent option omitted → reads the global
      await sys.loadMap();
      sys.unlock();
      sys.playBgm("menu");
      await flush();
      expect(sys.isSilenced).toBe(true);
      expect(ctxRef()).toBeNull();
      expect(sys.bedFile).toBeNull();
      sys.dispose();
    } finally {
      delete g.__GGD_SILENT__;
    }

    // with the flag cleared a fresh system builds its graph and plays normally
    expect(shouldSilenceAudio()).toBe(false);
    const { sys, ctxRef } = build();
    await sys.loadMap();
    sys.unlock();
    sys.playBgm("menu");
    await flush();
    expect(sys.isSilenced).toBe(false);
    expect(ctxRef()).not.toBeNull();
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
    sys.dispose();
  });
});

/**
 * TASK #216 — 「回到商店時…還會有火圈聲音」.
 *
 * `fireRingLoop` is a ~60 s clip fired ONCE at ring ignition and `arenaAmbience`
 * a ~38 s clip fired once at round start. Before this, `playSfx` was strictly
 * fire-and-forget — `AudioSystem` had NO stop path for SFX at all (only
 * `stopBed()` for BGM) — so a round that settled inside that window carried
 * burning fire straight through 結算 and into the shop. These pin the stop path
 * itself: only ambience BEDS are tracked, they can be cut, and a bed that was
 * still DECODING when combat ended must never start afterwards.
 */
const BED_MAP: AudioMap = {
  bgm: { combat: { file: "assets/audio/bgm/combat.mp3", loop: true } },
  sfx: {
    // both are in sfxManifest.SFX_LOOPABLE — the client's record of loop intent
    fireRingLoop: { files: ["assets/audio/sfx/lab/fireRingLoop.mp3"], maxConcurrent: 1 },
    arenaAmbience: { files: ["assets/audio/sfx/lab/arenaAmbience.mp3"], maxConcurrent: 1 },
    // a transient, for contrast: it must NOT be tracked or stoppable
    hit: { files: ["assets/audio/sfx/fx/thud.mp3"], cooldownMs: 0, maxConcurrent: 8 },
  },
};

describe("AudioSystem sustained-SFX teardown (audio-sfx-stop, task #216)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("STOPS a playing fire-ring bed — the leak the owner heard over the shop", async () => {
    cover("audio-sfx-stop");
    const { sys, ctxRef } = build({ fetchFn: okFetch(BED_MAP), now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    expect(sys.playSfx("fireRingLoop")).toBe(true);
    await flush();
    const ctx = ctxRef()!;
    const bed = ctx.started[ctx.started.length - 1]!;
    expect(bed.started).toBe(true);
    expect(bed.stopped).toBe(false); // ~60 s of fire, playing on

    // the combat→shop edge
    expect(sys.stopSfx("fireRingLoop")).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(bed.stopped).toBe(true);
    sys.dispose();
  });

  it("stopSustainedSfx cuts EVERY fight bed at once and leaves transients alone", async () => {
    cover("audio-sfx-stop");
    const { sys, ctxRef } = build({ fetchFn: okFetch(BED_MAP), now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    sys.playSfx("fireRingLoop");
    sys.playSfx("arenaAmbience");
    sys.playSfx("hit");
    await flush();
    const ctx = ctxRef()!;
    expect(ctx.started.filter((s) => !s.stopped).length).toBe(3);

    // exactly the two BEDS are stopped; the transient is fire-and-forget
    expect(sys.stopSustainedSfx()).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(ctx.started.filter((s) => s.stopped).length).toBe(2);
    sys.dispose();
  });

  it("cancels a bed that was still DECODING when combat ended", async () => {
    cover("audio-sfx-stop");
    // The ring can ignite on the same phase edge that ends the round; if the
    // stop only reached PLAYING voices, the fire would start a beat later —
    // over the shop — and then be unstoppable again.
    const { sys, ctxRef } = build({ fetchFn: okFetch(BED_MAP), now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    const before = ctxRef()!.started.length;
    sys.playSfx("fireRingLoop"); // decode in flight
    sys.stopSustainedSfx(); // …and the round ends right now
    await flush();
    expect(ctxRef()!.started.length).toBe(before); // it never started
    // …and the voice slot was released, so the next round can play it again
    expect(sys.activeVoices("fireRingLoop")).toBe(0);
    sys.dispose();
  });

  it("is idempotent and safe with nothing playing", async () => {
    cover("audio-sfx-stop");
    const { sys } = build({ fetchFn: okFetch(BED_MAP), now: () => 0 });
    await sys.loadMap();
    sys.unlock();
    await flush();
    expect(sys.stopSustainedSfx()).toBe(0); // never entered combat
    sys.playSfx("fireRingLoop");
    await flush();
    expect(sys.stopSustainedSfx()).toBe(1);
    expect(sys.stopSustainedSfx()).toBe(0); // second edge: nothing left to cut
    vi.advanceTimersByTime(1000);
    sys.dispose();
  });
});
