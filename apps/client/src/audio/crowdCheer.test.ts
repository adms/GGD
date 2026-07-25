/**
 * audio/crowdCheer — 周圍觀眾歡呼 on a kill (task #234).
 *
 * Four properties are pinned here, matching the four the task asks for:
 *   1. THE RULE. One cheer per kill EVENT; a spree ESCALATES to the longer,
 *      louder roar instead of stacking copies; a non-escalating repeat inside
 *      the window is dropped; a suppressed cheer never advances the window.
 *   2. THROUGH THE MIXER. The decision's `volume` really reaches the per-voice
 *      gain node, and the audio map's own `maxConcurrent: 1` refuses a second
 *      simultaneous copy even if a caller ignored the rule above.
 *   3. THE GATES. The #14 master mute AND the SFX-bus mute silence it, and the
 *      #62 test-mode silence (`silent: true` → a null AudioContext) makes it a
 *      no-op — a background agent can never make this sound.
 *   4. THE WIRING. AudioDirector really calls the rule and plays what it
 *      returns, and both keys really exist in the shipped audio map pointing at
 *      files that are really on disk. Asserted by comment-stripped source scan +
 *      the shipped JSON, per repo convention: client vitest is node with no DOM,
 *      so the React shell is proved by reading it, not by rendering it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CHEER_BIG_STREAK,
  CHEER_MAX_VOLUME,
  CHEER_MIN_GAP_MS,
  CROWD_CHEER_BIG_EVENT,
  CROWD_CHEER_EVENT,
  cheerTierFor,
  cheerVolumeFor,
  decideCrowdCheer,
  type CheerTier,
} from "./crowdCheer";
import { MULTIKILL_WINDOW_MS } from "./sfxEdges";
import { AudioSystem } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import type { AudioMap } from "./types";

const REPO = resolve(__dirname, "../../../..");

/** Strip comments so a source scan asserts on CODE, never on a doc block. */
function codeOf(rel: string): string {
  const src = readFileSync(join(REPO, rel), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ───────────────────────────────────────────────────────────────────────────
// 1. THE RULE (pure)
// ───────────────────────────────────────────────────────────────────────────

describe("decideCrowdCheer — one cheer per kill, escalating not stacking", () => {
  const quiet = { lastCheerMs: null as number | null, lastCheerTier: 0 as CheerTier };

  it("stays silent when no kill landed on the transition", () => {
    cover("audio-crowd-cheer");
    // killVoice === null is the ONLY "no kill" signal — a lingering streak is not.
    expect(decideCrowdCheer({ killVoice: null, killStreak: 4, nowMs: 0, ...quiet })).toBeNull();
  });

  it("cheers on an ordinary single kill", () => {
    cover("audio-crowd-cheer");
    const d = decideCrowdCheer({ killVoice: "kill-1", killStreak: 1, nowMs: 0, ...quiet });
    expect(d).not.toBeNull();
    expect(d!.event).toBe(CROWD_CHEER_EVENT);
    expect(d!.tier).toBe(1);
  });

  it("roars for first blood, a triple kill and an unstoppable spree", () => {
    cover("audio-crowd-cheer");
    for (const [killVoice, streak] of [
      ["first-blood", 1],
      [`kill-${CHEER_BIG_STREAK}`, CHEER_BIG_STREAK],
      ["kill-5", 5],
      ["unstoppable", 7],
    ] as Array<[string, number]>) {
      const d = decideCrowdCheer({ killVoice, killStreak: streak, nowMs: 0, ...quiet });
      expect(d!.event, `${killVoice} should roar`).toBe(CROWD_CHEER_BIG_EVENT);
      expect(d!.tier).toBe(2);
    }
    // …but a double kill is still the ordinary cheer, so the roar stays special.
    expect(decideCrowdCheer({ killVoice: "kill-2", killStreak: 2, nowMs: 0, ...quiet })!.tier).toBe(1);
  });

  it("drops a repeat of the SAME tier inside the window (no wall of noise)", () => {
    cover("audio-crowd-cheer");
    const d = decideCrowdCheer({
      killVoice: "kill-2",
      killStreak: 2,
      nowMs: CHEER_MIN_GAP_MS - 1,
      lastCheerMs: 0,
      lastCheerTier: 1,
    });
    expect(d).toBeNull();
  });

  it("lets a spree ESCALATE through the window — the roar is never swallowed", () => {
    cover("audio-crowd-cheer");
    const d = decideCrowdCheer({
      killVoice: "kill-3",
      killStreak: 3,
      nowMs: 900, // deep inside the window
      lastCheerMs: 0,
      lastCheerTier: 1,
    });
    expect(d!.event).toBe(CROWD_CHEER_BIG_EVENT);
    // …but it may not escalate a SECOND time — tier 2 is the ceiling.
    expect(
      decideCrowdCheer({
        killVoice: "kill-4",
        killStreak: 4,
        nowMs: 1_400,
        lastCheerMs: 900,
        lastCheerTier: 2,
      }),
    ).toBeNull();
  });

  it("never de-escalates inside the window (a roar is not followed by a cheer)", () => {
    cover("audio-crowd-cheer");
    expect(
      decideCrowdCheer({
        killVoice: "kill-1",
        killStreak: 1,
        nowMs: 500,
        lastCheerMs: 0,
        lastCheerTier: 2,
      }),
    ).toBeNull();
  });

  it("re-arms once the window has passed", () => {
    cover("audio-crowd-cheer");
    const d = decideCrowdCheer({
      killVoice: "kill-1",
      killStreak: 1,
      nowMs: CHEER_MIN_GAP_MS,
      lastCheerMs: 0,
      lastCheerTier: 2,
    });
    expect(d!.event).toBe(CROWD_CHEER_EVENT);
  });

  it("a five-kill burst yields at most TWO cheers, not five", () => {
    cover("audio-crowd-cheer");
    // A realistic pentakill: five kills 700 ms apart (all inside the 8 s
    // multi-kill window, so diffTally escalates the streak every time).
    let lastCheerMs: number | null = null;
    let lastCheerTier: CheerTier = 0;
    const played: string[] = [];
    for (let i = 0; i < 5; i++) {
      const nowMs = i * 700;
      const streak = i + 1;
      const d = decideCrowdCheer({
        killVoice: `kill-${streak}`,
        killStreak: streak,
        nowMs,
        lastCheerMs,
        lastCheerTier,
      });
      if (d) {
        played.push(d.event);
        lastCheerMs = nowMs; // only a REAL play advances the window
        lastCheerTier = d.tier;
      }
    }
    // kill-1 → cheer, kill-2 dropped, kill-3 escalates → roar, kill-4/5 dropped.
    expect(played).toEqual([CROWD_CHEER_EVENT, CROWD_CHEER_BIG_EVENT]);
    expect(4 * 700).toBeLessThan(MULTIKILL_WINDOW_MS); // the burst really was one spree
  });

  it("gets LOUDER with the streak and never past the ceiling", () => {
    cover("audio-crowd-cheer");
    let prev = 0;
    for (let streak = 1; streak <= 5; streak++) {
      const v = cheerVolumeFor(1, streak);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    // a roar is louder than the cheer at the same streak (louder AND longer)
    expect(cheerVolumeFor(2, 3)).toBeGreaterThan(cheerVolumeFor(1, 3));
    // and the crowd can never drown the champion's own kill line
    expect(cheerVolumeFor(2, 50)).toBe(CHEER_MAX_VOLUME);
    expect(cheerVolumeFor(0, 3)).toBe(0);
  });

  it("cheerTierFor is silent without a kill category", () => {
    cover("audio-crowd-cheer");
    expect(cheerTierFor(null, 9)).toBe(0);
  });

  it("is deterministic — the same input always gives the same cheer (no rng)", () => {
    cover("audio-crowd-cheer");
    // The cue must never consume randomness: replays and every client's audio
    // decision are a pure function of the streak.
    const input = { killVoice: "kill-2", killStreak: 2, nowMs: 5_000, ...quiet };
    const a = decideCrowdCheer(input);
    for (let i = 0; i < 25; i++) expect(decideCrowdCheer(input)).toEqual(a);
    expect(codeOf("apps/client/src/audio/crowdCheer.ts")).not.toMatch(/Math\.random|rng|world\./);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 + 3. THROUGH THE MIXER, AND THE GATES
// ───────────────────────────────────────────────────────────────────────────

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
    return Promise.resolve({ duration: 2 } as unknown as AudioBuffer);
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

/** The two authored cheer entries, mirroring content/config/audio-map.json. */
const CHEER_MAP: AudioMap = {
  bgm: {},
  sfx: {
    [CROWD_CHEER_EVENT]: {
      files: ["assets/audio/sfx/fx/crowd-cheer.mp3"],
      gain: 0.45,
      cooldownMs: 2400,
      maxConcurrent: 1,
    },
    [CROWD_CHEER_BIG_EVENT]: {
      files: ["assets/audio/sfx/fx/crowd-cheer-big.mp3"],
      gain: 0.5,
      cooldownMs: 2400,
      maxConcurrent: 1,
    },
  },
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function buildSys(opts: { silent?: boolean } = {}): {
  sys: AudioSystem;
  ctxRef: () => FakeCtx | null;
  settings: AudioSettingsStore;
  advance: (ms: number) => void;
} {
  let ctx: FakeCtx | null = null;
  let now = 0;
  const settings = new AudioSettingsStore({ getItem: () => null, setItem: () => {} });
  const sys = new AudioSystem({
    silent: opts.silent ?? false,
    fetchFn: (url: string) =>
      Promise.resolve(
        url.endsWith("config/audio-map.json")
          ? ({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...CHEER_MAP }),
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

describe("crowd cheer through the mixer (audio-crowd-cheer)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lands the decision's volume on the voice gain, cheer then louder roar", async () => {
    cover("audio-crowd-cheer");
    const { sys, ctxRef, advance } = buildSys();
    await sys.loadMap();
    sys.unlock();
    await flush();

    const small = decideCrowdCheer({
      killVoice: "kill-1",
      killStreak: 1,
      nowMs: 0,
      lastCheerMs: null,
      lastCheerTier: 0,
    })!;
    let before = ctxRef()!.gains.length;
    expect(sys.playSfx(small.event, { volume: small.volume })).toBe(true);
    await flush();
    const smallGain = ctxRef()!.gains[before]!.gain.value;
    expect(smallGain).toBeCloseTo(0.45 * small.volume, 6);

    // the cheer plays out, then the spree escalates well past the map cooldown
    for (const s of ctxRef()!.started) s.end();
    advance(3_000);
    const big = decideCrowdCheer({
      killVoice: "kill-3",
      killStreak: 3,
      nowMs: 3_000,
      lastCheerMs: 0,
      lastCheerTier: small.tier,
    })!;
    before = ctxRef()!.gains.length;
    expect(sys.playSfx(big.event, { volume: big.volume })).toBe(true);
    await flush();
    const bigGain = ctxRef()!.gains[before]!.gain.value;
    // LOUDER than the single-kill cheer (and it is also the longer clip)
    expect(bigGain).toBeGreaterThan(smallGain);
    sys.dispose();
  });

  it("maxConcurrent:1 refuses a second simultaneous copy of the same cheer", async () => {
    cover("audio-crowd-cheer");
    const { sys, ctxRef, advance } = buildSys();
    await sys.loadMap();
    sys.unlock();
    await flush();
    // Belt-and-suspenders: even a caller that ignored `decideCrowdCheer` and
    // fired ten times cannot stack the crowd — the SfxGate takes one voice.
    let taken = 0;
    for (let i = 0; i < 10; i++) {
      if (sys.playSfx(CROWD_CHEER_EVENT)) taken++;
      advance(50);
    }
    expect(taken).toBe(1);
    await flush();
    expect(ctxRef()!.started).toHaveLength(1);
    sys.dispose();
  });

  it("the #14 audio toggle suppresses it — master mute AND the SFX bus", async () => {
    cover("audio-crowd-cheer");
    const { sys, ctxRef, settings } = buildSys();
    await sys.loadMap();
    sys.unlock();
    await flush();
    // ensureCtx builds master, bgmBus, sfxBus in that order
    const [master, , sfxBus] = ctxRef()!.gains;
    sys.setMuted(true);
    expect(master!.gain.value).toBe(0);
    sys.playSfx(CROWD_CHEER_EVENT);
    await flush();
    expect(master!.gain.value).toBe(0); // a cheer never re-opens the mixer
    sys.setMuted(false);
    settings.setBusMuted("sfx", true);
    sys.playSfx(CROWD_CHEER_BIG_EVENT);
    await flush();
    expect(sfxBus!.gain.value).toBe(0); // the SFX slider/mute owns it too
    sys.dispose();
  });

  it("the #62 test-mode silence makes it a no-op (no context, no sound)", async () => {
    cover("audio-crowd-cheer");
    const { sys, ctxRef } = buildSys({ silent: true });
    await sys.loadMap();
    sys.unlock();
    await flush();
    // A silenced mixer hands back a null AudioContext, so nothing is ever built.
    expect(ctxRef()).toBeNull();
    expect(sys.playSfx(CROWD_CHEER_EVENT)).toBe(false);
    expect(sys.playSfx(CROWD_CHEER_BIG_EVENT, { volume: 1.5 })).toBe(false);
    expect(ctxRef()).toBeNull();
    sys.dispose();
  });

  it("a locked (pre-gesture) mixer plays nothing", async () => {
    cover("audio-crowd-cheer");
    const { sys } = buildSys();
    await sys.loadMap();
    expect(sys.playSfx(CROWD_CHEER_EVENT)).toBe(false); // never unlocked
    sys.dispose();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. THE WIRING (shipped data + comment-stripped source scan)
// ───────────────────────────────────────────────────────────────────────────

describe("crowd cheer wiring (audio-crowd-cheer)", () => {
  function shippedSfx(): Record<string, { files: string[]; maxConcurrent?: number; cooldownMs?: number }> {
    const doc = JSON.parse(readFileSync(join(REPO, "content/config/audio-map.json"), "utf8")) as {
      sfx: Record<string, { files: string[]; maxConcurrent?: number; cooldownMs?: number }>;
    };
    return doc.sfx;
  }

  it("both cheer keys are in the shipped audio map, capped at one voice", () => {
    cover("audio-crowd-cheer");
    const sfx = shippedSfx();
    for (const key of [CROWD_CHEER_EVENT, CROWD_CHEER_BIG_EVENT]) {
      const entry = sfx[key];
      expect(entry, `audio-map has no "${key}" entry`).toBeDefined();
      // The structural half of "never N overlapping copies".
      expect(entry!.maxConcurrent, `${key} must cap at one voice`).toBe(1);
      expect(entry!.cooldownMs ?? 0).toBeGreaterThan(0);
    }
  });

  it("every cheer file the map names really exists on disk", () => {
    cover("audio-crowd-cheer");
    const sfx = shippedSfx();
    for (const key of [CROWD_CHEER_EVENT, CROWD_CHEER_BIG_EVENT]) {
      for (const f of sfx[key]!.files) {
        expect(existsSync(join(REPO, "content", f)), `${key} points at a missing file: ${f}`).toBe(true);
      }
    }
  });

  it("AudioDirector really consults the rule and plays what it returns", () => {
    cover("audio-crowd-cheer");
    const src = codeOf("apps/client/src/ui/AudioDirector.tsx");
    expect(src).toContain("decideCrowdCheer");
    // it feeds the rule the SAME kill signal the voice half uses…
    expect(src).toMatch(/killVoice:\s*res\.killVoice/);
    expect(src).toMatch(/killStreak:\s*res\.killStreak/);
    // …and plays the decision, with its volume.
    expect(src).toMatch(/playSfx\(\s*cheer\.event,\s*\{\s*volume:\s*cheer\.volume\s*\}\s*\)/);
    // the local champion's own kill line is dispatched on the same edge (#234a)
    expect(src).toMatch(/playContextualVoice\(localChampionId,\s*res\.killVoice\)/);
  });

  it("the cheer never borrows the announcer's kill / multiKill gate budget", () => {
    cover("audio-crowd-cheer");
    // SfxGate's cooldown is CROSS-FRAME and keyed on the string: pouring a new
    // population into an existing key starves the incumbent (measured — eleven
    // footstep feeders once cut local footsteps to 21%). The cheer must own its
    // keys, so no gateKey re-routing may appear on the cheer's play site.
    const src = codeOf("apps/client/src/ui/AudioDirector.tsx");
    expect(src).not.toMatch(/gateKey:\s*["'`](kill|multiKill)["'`]/);
    expect(CROWD_CHEER_EVENT).not.toBe("kill");
    expect(CROWD_CHEER_BIG_EVENT).not.toBe("multiKill");
  });

  it("stays client-only — the rule never reaches for the sim or its rng", () => {
    cover("audio-crowd-cheer");
    const src = codeOf("apps/client/src/audio/crowdCheer.ts");
    expect(src).not.toContain("@ggd/shared/sim");
    expect(src).not.toContain("world.rng");
    expect(src).not.toContain("import");
  });
});
