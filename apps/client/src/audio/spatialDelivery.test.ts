/**
 * spatialDelivery — does the geometry actually REACH the audio graph, and what
 * does it cost? The two questions an adversarial review raised about this
 * feature that a pure-math test cannot answer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A PURE TEST WAS NOT ENOUGH
 * ═══════════════════════════════════════════════════════════════════════════
 * `spatial.test.ts` proves the geometry: a source 6 u to your left yields
 * pan −0.476. That stays green whether or not a single StereoPannerNode is ever
 * built. The claim this file makes is narrower and harder: run the real
 * `AudioSystem` over a fake-but-complete AudioContext, push a positioned sound
 * through the real `SpatialSfxQueue`, and show the panner exists, is wired
 * BETWEEN the voice gain and the SFX bus, and carries that exact number.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND WHAT IT COSTS, MEASURED
 * ═══════════════════════════════════════════════════════════════════════════
 * A pre-spatial voice was ONE node (a GainNode). A positioned one can be three
 * (gain + panner + low-pass), so "the mix got 3× more expensive" is a real risk
 * and was raised as one. The `FakeCtx` counts every node it hands out, so the
 * second half of this file plays the SAME combat mix twice — once centred (the
 * old behaviour) and once positioned — and bounds the ratio.
 *
 * Two mitigations do the work, and both are asserted here rather than asserted
 * in prose: `spatial.PAN_SKIP` omits an inaudible pan so a centred cue still
 * costs exactly one node, and `DEPTH_FILTER_SKIP_HZ` omits the filter for
 * anything less than ~1.8 u up-screen. Between them, the sounds nearest the
 * listener — the frequent ones — stay at the old cost, and the extra nodes are
 * spent only on the distant sources that need placing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { AudioSystem, SPATIAL_POOL_MAX } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import { SpatialSfxQueue } from "./SpatialSfxQueue";
import { panForOffset, type SpatialListener, type SpatialSource } from "./spatial";
import type { AudioMap } from "./types";

// --------------------------------------------------------------------------
// a fake AudioContext that COUNTS — the whole point of this file
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
  /** total nodes handed out for VOICES (the buses are built once, at unlock) */
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

/**
 * A map whose gates are WIDE OPEN. This file measures the graph, not the gate
 * (spatialStarvation.test.ts owns the gate against the real numbers) — a
 * cooldown here would silently drop voices and make the node counts meaningless.
 */
const MAP: AudioMap = {
  bgm: {},
  sfx: {
    hit: { files: ["assets/audio/sfx/fx/thud.mp3"], gain: 0.6, cooldownMs: 0, maxConcurrent: 999 },
    footstep: { files: ["assets/audio/sfx/fx/footstep.mp3"], gain: 0.22, cooldownMs: 0, maxConcurrent: 999 },
  },
};

function okFetch(url: string): Promise<Response> {
  if (url.endsWith("config/audio-map.json")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...MAP }),
    } as Response);
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as Response);
}

/** drain the fetch→arrayBuffer→decode→then chain (several microtask hops) */
async function settle(): Promise<void> {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

async function build(): Promise<{ sys: AudioSystem; ctx: FakeCtx }> {
  let ctx: FakeCtx | null = null;
  const sys = new AudioSystem({
    fetchFn: okFetch,
    now: () => 0,
    rng: () => 0,
    warn: () => {},
    silent: false,
    settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    ctxFactory: () => {
      ctx = new FakeCtx();
      return ctx as unknown as AudioContext;
    },
  });
  await sys.loadMap();
  sys.unlock();
  await settle();
  ctx!.reset(); // forget the bus/master nodes built at unlock
  return { sys, ctx: ctx! };
}

const LISTENER: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };

/**
 * A duel-zone mix shaped like a real fight: two thirds of the traffic is the
 * scrum you are standing in, the rest is the tail further out. Deterministic
 * (golden-angle spread, no rng) so the measured numbers are reproducible.
 */
const MIX_SOUNDS = 240;
function mixSourceAt(i: number): SpatialSource {
  const near = i % 3 !== 0;
  const r = near ? 0.4 + (i % 5) * 0.5 : 6 + (i % 7);
  const ang = (i * 2.39996) % (Math.PI * 2);
  return {
    x: r * Math.cos(ang),
    z: r * Math.sin(ang),
    cls: i % 2 === 0 ? "focus" : "texture",
    relation: near ? "self" : "enemy",
  };
}

/** Push one source through the real queue into the real mixer. */
async function emit(sys: AudioSystem, key: string, source: SpatialSource | null): Promise<void> {
  const q = new SpatialSfxQueue();
  q.push(key, source);
  q.flush(LISTENER, (k, opts) => sys.playSfx(k, opts));
  await settle();
}

describe("the geometry reaches the audio graph (spatial-delivery)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a source 6 u to your RIGHT builds a panner carrying +0.476", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    await emit(sys, "hit", { x: 6, z: 0, cls: "focus", relation: "enemy" });
    expect(ctx.panners.length).toBe(1);
    expect(ctx.panners[0]!.pan.value).toBeCloseTo(panForOffset(6), 6);
    expect(ctx.panners[0]!.pan.value).toBeGreaterThan(0); // +X is screen RIGHT
  });

  it("…and 6 u to your LEFT is the exact mirror", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    await emit(sys, "hit", { x: -6, z: 0, cls: "focus", relation: "enemy" });
    expect(ctx.panners[0]!.pan.value).toBeCloseTo(-panForOffset(6), 6);
  });

  it("the panner sits BETWEEN the voice gain and the bus, never around it", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    await emit(sys, "hit", { x: 6, z: 0, cls: "focus", relation: "enemy" });
    const gain = ctx.gains[0]!;
    const panner = ctx.panners[0]!;
    // gain → panner (so the SFX slider and both mutes still apply upstream)
    expect(gain.outs).toContain(panner);
    // and the panner is not fed back into the gain (no loop)
    expect(panner.outs).not.toContain(gain);
    expect(panner.outs.length).toBe(1); // → the SFX bus
  });

  it("a source UP-SCREEN also builds the depth low-pass, tuned below 20 kHz", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    await emit(sys, "hit", { x: 3, z: 10, cls: "focus", relation: "enemy" });
    expect(ctx.filters.length).toBe(1);
    expect(ctx.filters[0]!.type).toBe("lowpass");
    expect(ctx.filters[0]!.frequency.value).toBeLessThan(15000);
    expect(ctx.filters[0]!.frequency.value).toBeGreaterThan(80);
  });

  it("distance really attenuates: 12 u is quieter than 1 u, same event", async () => {
    cover("spatial-delivery");
    const near = await build();
    await emit(near.sys, "hit", { x: 1, z: 0, cls: "focus", relation: "enemy" });
    const far = await build();
    await emit(far.sys, "hit", { x: 12, z: 0, cls: "focus", relation: "enemy" });
    expect(far.ctx.gains[0]!.gain.value).toBeLessThan(near.ctx.gains[0]!.gain.value);
    expect(far.ctx.gains[0]!.gain.value).toBeGreaterThan(0);
  });

  it("out of range means NO VOICE AT ALL, not a quiet one", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    // 40 u > SPATIAL_FAR (30): the other duel zone. Must never enter the mixer,
    // or it steals the gate slot from the fight standing on top of you.
    await emit(sys, "hit", { x: 40, z: 0, cls: "focus", relation: "enemy" });
    expect(ctx.nodeCount).toBe(0);
    expect(ctx.started.length).toBe(0);
  });
});

describe("what the sound field COSTS in nodes (spatial-delivery)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a centred cue still costs exactly ONE node — the pre-spatial price", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    await emit(sys, "footstep", null);
    expect(ctx.nodeCount).toBe(1); // the voice gain, nothing else
    expect(ctx.panners.length).toBe(0);
    expect(ctx.filters.length).toBe(0);
  });

  it("a source AT the listener costs one node too (PAN_SKIP earns its keep)", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    // Your own body: |pan| ≈ 0 and Δz ≤ 0, so neither insert is built. This is
    // the highest-RATE sound in the game, so it is the one that matters most.
    await emit(sys, "footstep", { x: 0.05, z: -0.2, cls: "texture", relation: "self" });
    expect(ctx.nodeCount).toBe(1);
  });

  it("a placed source costs two, and only a DEEP one costs three", async () => {
    cover("spatial-delivery");
    const lateral = await build();
    await emit(lateral.sys, "hit", { x: 6, z: 0, cls: "focus", relation: "enemy" });
    expect(lateral.ctx.nodeCount).toBe(2); // gain + panner

    const deep = await build();
    await emit(deep.sys, "hit", { x: 6, z: 12, cls: "focus", relation: "enemy" });
    expect(deep.ctx.nodeCount).toBe(3); // gain + panner + low-pass
  });

  it("WORST CASE — 240 overlapping placed voices cost under 2.2× the centred mix", async () => {
    cover("spatial-delivery");
    // The same 240 sounds, twice, with NOTHING ever ending: every voice holds
    // its nodes for the whole run, so the pool can never recycle one. This is
    // the adversarial upper bound, not the shape of a real fight.
    const base = await build();
    for (let i = 0; i < MIX_SOUNDS; i++) await emit(base.sys, "hit", null);
    const centred = base.ctx.nodeCount;

    const spat = await build();
    let played = 0;
    for (let i = 0; i < MIX_SOUNDS; i++) {
      const before = spat.ctx.nodeCount;
      await emit(spat.sys, "hit", mixSourceAt(i));
      if (spat.ctx.nodeCount > before) played++;
    }

    // Sanity: the spatial run must not have gone quiet — an "everything is out
    // of range" bug would trivially satisfy any node-count ceiling.
    expect(played).toBeGreaterThan(MIX_SOUNDS * 0.6);
    expect(centred).toBe(MIX_SOUNDS); // 1 node per voice, the pre-spatial price
    // MEASURED 2.087 (501 nodes vs 240) at the time of writing. Stated as a
    // ceiling with headroom, so a tuning change to PAN_SKIP or
    // DEPTH_FILTER_SKIP_HZ shows up here rather than in a playtest.
    expect(spat.ctx.nodeCount / centred).toBeLessThan(2.2);
  });

  it("REAL CASE — voices end, so a settled fight CONSTRUCTS almost nothing", async () => {
    cover("spatial-delivery");
    // A clip ends and its insert nodes go back to the pool. The number that
    // costs the frame thread is nodes CONSTRUCTED, not nodes alive, and once
    // the pool is warm that number collapses — which is the whole reason the
    // pool exists rather than a per-voice allocation.
    const { sys, ctx } = await build();
    for (let i = 0; i < MIX_SOUNDS; i++) {
      await emit(sys, "hit", mixSourceAt(i));
      for (const s of ctx.started.splice(0)) s.onended?.(); // the clip finishes
      await settle();
    }
    const perVoice = ctx.nodeCount / MIX_SOUNDS;
    // The GainNode is still per-voice (it carries the authored gain and is
    // disposed with the source), so the floor is 1.0. Everything above that is
    // insert churn — MEASURED 1.008: over 240 voices the pool constructed ONE
    // panner and ONE filter in total. Without it this run allocates 501 nodes.
    expect(perVoice).toBeLessThan(1.15);
    expect(ctx.panners.length).toBeLessThanOrEqual(SPATIAL_POOL_MAX);
    expect(ctx.filters.length).toBeLessThanOrEqual(SPATIAL_POOL_MAX);
  });

  it("a pooled node is never handed to two live voices at once", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    // two placed voices in flight together must hold DIFFERENT panners
    await emit(sys, "hit", { x: 6, z: 0, cls: "focus", relation: "enemy" });
    await emit(sys, "hit", { x: -6, z: 0, cls: "focus", relation: "enemy" });
    expect(ctx.panners.length).toBe(2);
    expect(ctx.panners[0]!.pan.value).not.toBe(ctx.panners[1]!.pan.value);
    // end BOTH, then play one more: it must reuse, not construct
    for (const s of ctx.started.splice(0)) s.onended?.();
    await settle();
    await emit(sys, "hit", { x: 3, z: 0, cls: "focus", relation: "enemy" });
    expect(ctx.panners.length).toBe(2); // nothing new was constructed
  });

  it("a double dispose cannot return the same node to the pool twice", async () => {
    cover("spatial-delivery");
    const { sys, ctx } = await build();
    await emit(sys, "hit", { x: 6, z: 0, cls: "focus", relation: "enemy" });
    const src = ctx.started[0]!;
    src.onended?.();
    src.onended?.(); // the start-threw teardown path can reach dispose as well
    await settle();
    // two live voices must still get two DISTINCT panners
    await emit(sys, "hit", { x: 6, z: 0, cls: "focus", relation: "enemy" });
    await emit(sys, "hit", { x: -6, z: 0, cls: "focus", relation: "enemy" });
    const live = ctx.panners.filter((p) => p.outs.length > 0);
    expect(new Set(live).size).toBe(live.length);
    expect(live.length).toBe(2);
  });
});

describe("the queue is WIRED into the frame loop (spatial-delivery)", () => {
  it("GameApp queues combat SFX and flushes them once per frame", async () => {
    cover("spatial-delivery");
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "GameApp.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    // pushed at the event drain, with the SAME position resolver the VFX uses
    expect(src).toMatch(/this\.sfxQueue\.push\(sfxKey, resolveSpatial\(/);
    // and flushed into the REAL mixer, not a stub
    expect(src).toMatch(/this\.sfxQueue\.flush\(\s*this\.audioListener\(/);
    expect(src).toContain("audioSystem.playSfx(key, opts)");
    // the flush must come AFTER the camera update, or the listener is a frame
    // stale — asserted by position, since that ordering is the whole reason the
    // queue exists rather than an inline playSfx at the drain.
    expect(src.indexOf("this.sfxQueue.flush(")).toBeGreaterThan(src.indexOf("frameBus.cameraView ="));
    expect(src.indexOf("this.sfxQueue.flush(")).toBeGreaterThan(src.indexOf("this.sfxQueue.push(sfxKey"));
  });
});
