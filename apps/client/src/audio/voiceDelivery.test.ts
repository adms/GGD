/**
 * voiceDelivery — DO THE VOICE NUMBERS ACTUALLY REACH THE AUDIO GRAPH?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AND WHY "TESTS ARE GREEN" IS NOT EVIDENCE HERE
 * ═══════════════════════════════════════════════════════════════════════════
 * `voiceSpatial.test.ts` proves the geometry. It stays green whether or not one
 * StereoPannerNode is ever built, and this project has shipped that exact
 * failure five times: a feature that computed the right thing and never became
 * something a player could perceive (#93's fireworks under the floor, #247's
 * jump 77 % off-screen, the lobby announcement no client ever read — and this
 * task itself, a complete relation + distance model that never became a level).
 *
 * On top of that, task #62 means an agent literally CANNOT hear its own work:
 * `shouldSilenceAudio()` hands back a null AudioContext, so the graph is never
 * built and every `play*` short-circuits. There is exactly one honest form of
 * proof available: run the REAL `AudioSystem` and the REAL
 * `ContextualVoicePlayer` over a fake-but-complete AudioContext that COUNTS
 * nodes, and assert the numbers sitting on `panner.pan.value`,
 * `filter.frequency.value` and `gain.gain.value`.
 *
 * The other half of the evidence is `public/voice-spatial-audition.html`, which
 * the OWNER drives on his own machine, with sound.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { AudioSystem } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import { ContextualVoicePlayer } from "./contextualVoice";
import { voicePlayOptions, voiceSpatialMix } from "./voiceSpatial";
import { DEFAULT_AUDIO_MIX } from "@ggd/shared/content";
import { applyAudioMixDoc } from "./voiceMixPolicy";
import { panForOffset, RELATION_GAIN, type SpatialListener } from "./spatial";
import type { VoiceAudience } from "./voiceAudience";
import type { ChampionVoicePack } from "./selectVoiceLadder";

// --------------------------------------------------------------------------
// a fake AudioContext that COUNTS (same shape as spatialDelivery.test.ts)
// --------------------------------------------------------------------------

class FakeParam {
  value = 0;
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
  setValueCurveAtTime(): void {}
  cancelScheduledValues(): void {}
}
class FakeNode {
  readonly outs: FakeNode[] = [];
  connect(to: FakeNode): void {
    this.outs.push(to);
  }
  disconnect(): void {
    this.outs.length = 0;
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
  constructor(private readonly ctx: FakeCtx) {
    super();
  }
  start(): void {
    this.ctx.started.push(this);
  }
  stop(): void {}
}
class FakeCtx {
  currentTime = 0;
  destination = new FakeNode();
  state: "suspended" | "running" | "closed" = "suspended";
  started: FakeSource[] = [];
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  filters: FakeFilter[] = [];
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
  get nodeCount(): number {
    return this.gains.length + this.panners.length + this.filters.length;
  }
  reset(): void {
    this.gains.length = 0;
    this.panners.length = 0;
    this.filters.length = 0;
    this.started.length = 0;
  }
}

function clip(name: string) {
  return { clip: name, text: "", lang: "ja", durationSec: 1, speakerSim: null };
}

/**
 * Two champions with the SAME categories: a voice line is per-champion, so a
 * single-hero pack cannot exercise "your line and theirs in the same frame".
 */
const PACK: ChampionVoicePack = {
  champions: {
    mine: {
      engine: "cosyvoice3",
      variant: "cv3-0.5b",
      sharedFrom: null,
      lines: { hurt: [clip("v/mine/hurt.mp3")], defeat: [clip("v/mine/defeat.mp3")] },
    },
    theirs: {
      engine: "cosyvoice3",
      variant: "cv3-0.5b",
      sharedFrom: null,
      lines: { hurt: [clip("v/theirs/hurt.mp3")], defeat: [clip("v/theirs/defeat.mp3")] },
    },
  },
};

function okFetch(url: string): Promise<Response> {
  if (url.endsWith("config/audio-map.json")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", bgm: {}, sfx: {} }),
    } as Response);
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as Response);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

/** Real AudioSystem + real ContextualVoicePlayer over the counting context. */
async function build(opts: { silent?: boolean } = {}): Promise<{
  sys: AudioSystem;
  ctx: FakeCtx | null;
  voice: ContextualVoicePlayer;
  clock: { t: number };
}> {
  let ctx: FakeCtx | null = null;
  const sys = new AudioSystem({
    fetchFn: okFetch,
    now: () => 0,
    rng: () => 0,
    warn: () => {},
    silent: opts.silent === true,
    settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    ctxFactory: () => {
      ctx = new FakeCtx();
      return ctx as unknown as AudioContext;
    },
  });
  await sys.loadMap();
  sys.unlock();
  await settle();
  // the cast defeats TS's flow narrowing (it cannot see the ctxFactory closure
  // assign, so `ctx` is still `null` to the checker here)
  (ctx as FakeCtx | null)?.reset(); // forget the bus/master nodes built at unlock
  const clock = { t: 1_000_000 };
  const voice = new ContextualVoicePlayer({
    audio: sys,
    now: () => clock.t,
    rng: () => 0, // every probability roll passes; this file measures the MIX
    packLoader: () => Promise.resolve(PACK),
  });
  await voice.warm();
  return { sys, ctx, voice, clock };
}

const AT_ORIGIN: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };

/** The real dispatch path: mix → play options → the real throttled player. */
async function speak(
  h: Awaited<ReturnType<typeof build>>,
  champId: string,
  audience: VoiceAudience,
  pos: { x: number; z: number } | null,
  category = "hurt",
): Promise<boolean> {
  const mix = voiceSpatialMix(AT_ORIGIN, { audience, pos });
  if (!mix) return false;
  const ok = h.voice.playContextual(champId, category, voicePlayOptions(mix));
  await settle();
  return ok;
}

describe("the voice mix reaches the audio graph (voice-delivery)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // ⚠️ GH#339 之後 `voiceSpatialMix` 還會乘上後台可調的「其他角色語音倍率」
    // （出貨 0.5）。這個檔問的是「幾何算出來的數字**有沒有到達 audio graph**」，
    // 所以把倍率釘成 1，斷言才留在 RELATION_GAIN 那一組手算的值上。
    // ⛔ 不要改成期望 `RELATION_GAIN.enemy * 0.5` —— 那是把出貨值抄進測試。
    // 倍率自己的守衛在 `voiceOtherGain.test.ts`。
    applyAudioMixDoc({ ...DEFAULT_AUDIO_MIX, voice: { othersGain: 1 } });
  });
  afterEach(() => vi.useRealTimers());

  it("an enemy 6 u to your RIGHT builds a panner carrying +0.476", async () => {
    cover("voice-delivery");
    const h = await build();
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(true);
    expect(h.ctx!.panners.length).toBe(1);
    expect(h.ctx!.panners[0]!.pan.value).toBeCloseTo(panForOffset(6), 6);
    expect(h.ctx!.panners[0]!.pan.value).toBeGreaterThan(0);
  });

  it("…and its mirror on the left is the exact negative", async () => {
    cover("voice-delivery");
    const h = await build();
    await speak(h, "theirs", "enemy", { x: -6, z: 0 });
    expect(h.ctx!.panners[0]!.pan.value).toBeCloseTo(-panForOffset(6), 6);
  });

  it("a speaker UP-SCREEN also gets the depth low-pass, on a real filter node", async () => {
    cover("voice-delivery");
    const h = await build();
    await speak(h, "theirs", "enemy", { x: 3, z: 10 });
    expect(h.ctx!.filters.length).toBe(1);
    expect(h.ctx!.filters[0]!.type).toBe("lowpass");
    expect(h.ctx!.filters[0]!.frequency.value).toBeLessThan(15000);
    expect(h.ctx!.filters[0]!.frequency.value).toBeGreaterThan(80);
  });

  it("the gain node carries the RELATION + DISTANCE product, not a flat 1", async () => {
    cover("voice-delivery");
    const near = await build();
    await speak(near, "theirs", "enemy", { x: 2, z: 0 });
    const far = await build();
    await speak(far, "theirs", "enemy", { x: 20, z: 0 });
    // the defect this feature exists to fix: BOTH of these used to be exactly 1
    expect(near.ctx!.gains[0]!.gain.value).toBeCloseTo(RELATION_GAIN.enemy, 6);
    expect(far.ctx!.gains[0]!.gain.value).toBeLessThan(near.ctx!.gains[0]!.gain.value);
    expect(far.ctx!.gains[0]!.gain.value).toBeGreaterThan(0.3); // still populated
  });

  it("the spatial chain sits BETWEEN the voice gain and the SFX bus", async () => {
    cover("voice-delivery");
    const h = await build();
    await speak(h, "theirs", "enemy", { x: 6, z: 10 });
    const gain = h.ctx!.gains[0]!;
    const panner = h.ctx!.panners[0]!;
    const filter = h.ctx!.filters[0]!;
    // gain → panner → filter → bus, so the #14/#54 SFX slider and both mutes
    // still apply upstream of everything this feature added.
    expect(gain.outs).toContain(panner);
    expect(panner.outs).toContain(filter);
    expect(filter.outs.length).toBe(1); // → the SFX bus, never the destination
    expect(panner.outs).not.toContain(gain);
  });
});

describe("your own voice costs exactly what it always did (voice-delivery-self)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("SELF builds ONE node — no panner, no filter — at full level", async () => {
    cover("voice-delivery-self");
    const h = await build();
    expect(await speak(h, "mine", "self", { x: 25, z: 25 })).toBe(true);
    expect(h.ctx!.gains.length).toBe(1);
    expect(h.ctx!.gains[0]!.gain.value).toBe(1);
    expect(h.ctx!.panners.length).toBe(0);
    expect(h.ctx!.filters.length).toBe(0);
    expect(h.ctx!.nodeCount).toBe(1); // 1.00 node/voice — the pre-#259 cost
  });

  it("…even when your body is at the far corner of the map", async () => {
    cover("voice-delivery-self");
    for (const p of [
      { x: 0, z: 0 },
      { x: 40, z: -40 },
      { x: 999, z: 999 },
    ]) {
      const h = await build();
      await speak(h, "mine", "self", p);
      expect(h.ctx!.gains[0]!.gain.value, `self at ${p.x},${p.z}`).toBe(1);
      expect(h.ctx!.panners.length).toBe(0);
    }
  });
});

describe("#62 silence outranks everything (voice-delivery-silent)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a silenced mixer builds NO AudioContext and plays nothing, mix or no mix", async () => {
    cover("voice-delivery-silent");
    const h = await build({ silent: true });
    expect(h.ctx).toBeNull(); // ctxFactory was never called
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(false);
    expect(await speak(h, "mine", "self", { x: 0, z: 0 })).toBe(false);
    expect(h.ctx).toBeNull();
  });

  it("the SFX mute still silences voices — the bus was not bypassed", async () => {
    cover("voice-delivery-silent");
    const h = await build();
    h.sys.setBusMuted("sfx", true);
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(false);
    expect(h.ctx!.nodeCount).toBe(0);
    // un-muting must restore it, and the refused call must NOT have burned the
    // 1.2 s gap on the way through (contextualVoice checks mute FIRST)
    h.sys.setBusMuted("sfx", false);
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(true);
  });
});

describe("spatialisation did not change WHO gets to speak (voice-delivery-throttle)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the 1.2 s global gap still admits exactly one line, mixed or not", async () => {
    cover("voice-delivery-throttle");
    const h = await build();
    expect(await speak(h, "mine", "self", { x: 0, z: 0 })).toBe(true);
    // a second line 100 ms later — a different champion, a different position:
    // the arena-wide gap must still refuse it, exactly as before #259
    h.clock.t += 100;
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(false);
    h.clock.t += 1_200;
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(true);
  });

  it("an out-of-range line is NOT dispatched, so it cannot spend the slot", async () => {
    cover("voice-delivery-throttle");
    const h = await build();
    // 32 u = the minimum cross-zone distance: the other duel, which #67 already
    // hides from the minimap and SPATIAL_FAR already silences for SFX.
    expect(await speak(h, "theirs", "enemy", { x: 32, z: 0 })).toBe(false);
    expect(h.ctx!.nodeCount).toBe(0);
    // …and because it never entered, YOUR line in the same beat still plays
    expect(await speak(h, "mine", "self", { x: 0, z: 0 })).toBe(true);
    expect(h.ctx!.gains[0]!.gain.value).toBe(1);
  });

  it("the in-flight de-dup still holds with a mix attached", async () => {
    cover("voice-delivery-throttle");
    const h = await build();
    expect(await speak(h, "theirs", "enemy", { x: 6, z: 0 })).toBe(true);
    h.clock.t += 5_000; // past every gap; the SAME clip is still sounding
    expect(await speak(h, "theirs", "enemy", { x: -6, z: 0 })).toBe(false);
  });
});
