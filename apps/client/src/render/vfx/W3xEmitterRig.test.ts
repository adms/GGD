/**
 * W3xEmitterRig on a headless Babylon NullEngine: multi-emitter WC3 effects,
 * attachment to a champion joint, the KP2 track driver, pooling — and, above
 * all, DISPOSAL.
 *
 * The disposal assertions are the point. Task #131 ("persistent bright-white
 * burst stuck in the corner of the arena") was ONE orphaned continuous emitter
 * whose anchor joint was disposed during a model swap: Babylon reparented it
 * into world space at (0,0,0) and it emitted there for the rest of the match.
 * So every path out of an effect — stop, cancel, duration timeout, orphaned
 * anchor, rig dispose — is asserted to leave zero live systems.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VfxDoc } from "@ggd/shared/content";
import { W3xEmitterRig, atPosition, type W3xEffectSpec } from "./W3xEmitterRig";
import type { W3xEmitterRuntimeFlags } from "./w3xEmitter";
import { W3X_MODEL_UNIT, W3X_NODE_FLAG, w3xEmitterToVfxDoc, type W3xParticleEmitter } from "./w3xEmitter";

let engine: NullEngine;
let scene: Scene;
let rig: W3xEmitterRig;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  rig = new W3xEmitterRig(scene, { createTexture: () => null });
});
afterEach(() => {
  rig.dispose();
  scene.dispose();
  engine.dispose();
});

function doc(over: Partial<VfxDoc> & { id: string }): VfxDoc {
  return {
    schema: "vfx@1",
    emitter: { shape: "cone", radius: 0.11, angleDeg: 30 },
    mode: "continuous",
    rate: 40,
    lifetimeSec: { min: 0.5, max: 0.5 },
    size: { start: 0.5, end: 0.5 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
    ...over,
  } as VfxDoc;
}

function effect(over: Partial<W3xEffectSpec> = {}): W3xEffectSpec {
  return { id: "fx", emitters: [{ doc: doc({ id: "e0" }) }], ...over };
}

/** A champion glb's joint list, as Babylon instantiates it (prefixed names). */
function champion(prefix = "7-"): TransformNode {
  const root = new TransformNode(`${prefix}root`, scene);
  for (const n of ["Bone_Hand_R", "Hand Right Ref", "Chest Ref", "Origin Ref"]) {
    const node = new TransformNode(prefix + n, scene);
    node.parent = root;
  }
  return root;
}

describe("multi-emitter WC3 effects (w3x-emitter-runtime)", () => {
  it("plays every emitter of one effect as ONE thing", () => {
    cover("w3x-emitter-runtime");
    // `vfxKey` is a single string, so nothing in the client could play
    // DivineRing's 20 emitters together until now.
    const spec = effect({
      emitters: Array.from({ length: 5 }, (_, i) => ({
        doc: doc({ id: `e${i}`, rate: 10 + i * 7, sizeStops: [[0, 0.3 + i * 0.1], [1, 0.1]] as VfxDoc["sizeStops"] }),
      })),
    });
    const h = rig.play(spec, atPosition(1, 2, 3));
    expect(h.alive).toBe(true);
    expect(rig.effectCount).toBe(1);
    expect(rig.systemCount).toBe(5);
    expect(h.plan.systemsBeforeMerge).toBe(5);
  });

  it("folds emitters that differ ONLY in rate into one system (lossless)", () => {
    cover("w3x-emitter-runtime");
    // WC3 artists stack copies of one emitter to thicken an effect; two streams
    // of identical particles are one stream at the summed rate.
    const spec = effect({ emitters: Array.from({ length: 5 }, (_, i) => ({ doc: doc({ id: `e${i}`, rate: 10 + i * 7 }) })) });
    rig.play(spec, atPosition(1, 2, 3));
    expect(rig.systemCount).toBe(1);
    expect(scene.particleSystems[0]!.emitRate).toBe(10 + 17 + 24 + 31 + 38);
  });

  it("refuses a non-finite spawn point (the other half of the #131 guard)", () => {
    cover("w3x-emitter-runtime");
    const h = rig.play(effect(), atPosition(Number.NaN, 0, 0));
    expect(h.alive).toBe(false);
    expect(rig.systemCount).toBe(0);
    expect(rig.totalSystems).toBe(0);
  });
});

describe("attaching to a champion joint (w3x-emitter-runtime)", () => {
  it("binds `right,hand` to the authored attachment point, not the bone", () => {
    cover("w3x-emitter-runtime");
    const root = champion();
    const h = rig.play(effect({ attach: "right,hand" }), { kind: "node", root });
    expect(h.attach?.exact).toBe(true);
    expect(h.attach?.node).toBe("7-Hand Right Ref");
    expect(h.alive).toBe(true);
  });

  it("falls back the WC3 way, and still plays", () => {
    cover("w3x-emitter-runtime");
    const root = champion();
    // `cheat` is the map's real typo for `chest` (A05B/A05C/A0EZ)
    const h = rig.play(effect({ attach: "cheat" }), { kind: "node", root });
    expect(h.attach?.exact).toBe(false);
    expect(h.attach?.node).toBe("7-Origin Ref");
    expect(h.alive).toBe(true);
  });

  it("refuses to attach to an already-disposed model", () => {
    cover("w3x-emitter-runtime");
    const root = champion();
    root.dispose();
    expect(rig.play(effect({ attach: "chest" }), { kind: "node", root }).alive).toBe(false);
    expect(rig.totalSystems).toBe(0);
  });
});

describe("the WC3 flags a vfx@1 doc cannot carry (w3x-emitter-runtime)", () => {
  it("maps modelSpace → isLocal and xYQuad → isBillboardBased=false", () => {
    cover("w3x-emitter-runtime");
    const runtime: W3xEmitterRuntimeFlags = {
      modelSpace: true,
      xYQuad: true,
      lineEmitter: false,
      wantsHeadAndTail: false,
      priorityPlane: 0,
      trackFrameSec: 1 / 1000,
    };
    rig.play(effect({ emitters: [{ doc: doc({ id: "e0" }), runtime }] }), atPosition(0, 1, 0));
    const ps = scene.particleSystems[0]!;
    expect(ps.isLocal).toBe(true);
    expect(ps.isBillboardBased).toBe(false);
  });

  it("does NOT leak a previous use's flags through the pool", () => {
    cover("w3x-emitter-runtime");
    const runtime: W3xEmitterRuntimeFlags = {
      modelSpace: true,
      xYQuad: true,
      lineEmitter: false,
      wantsHeadAndTail: false,
      priorityPlane: 0,
      trackFrameSec: 1 / 1000,
    };
    const a = rig.play(effect({ emitters: [{ doc: doc({ id: "e0" }), runtime }] }), atPosition(0, 1, 0));
    a.cancel();
    rig.play(effect({ emitters: [{ doc: doc({ id: "e0" }) }] }), atPosition(0, 1, 0));
    const ps = scene.particleSystems[0]!;
    expect(ps.isLocal).toBe(false);
    expect(ps.isBillboardBased).toBe(true);
  });

  it("places each emitter at its PIVOT — the ring is the layout, not the params", () => {
    cover("w3x-emitter-runtime");
    const at = (x: number, z: number): W3xEmitterRuntimeFlags => ({
      modelSpace: false,
      xYQuad: false,
      lineEmitter: false,
      wantsHeadAndTail: false,
      priorityPlane: 0,
      trackFrameSec: 1 / 1000,
      pivotOffset: { x, y: 0, z },
    });
    // three emitters that are IDENTICAL as docs and differ only in pivot: they
    // must survive the merge as three systems, at three positions
    const ring = [
      { doc: doc({ id: "r0" }), runtime: at(1, 0) },
      { doc: doc({ id: "r1" }), runtime: at(-1, 0) },
      { doc: doc({ id: "r2" }), runtime: at(0, 1) },
    ];
    const h = rig.play({ id: "ring", emitters: ring }, atPosition(0, 1, 0));
    expect(h.plan.systemsAfterMerge).toBe(3);
    expect(rig.systemCount).toBe(3);
    const xs = scene.meshes.filter((m) => m.name.startsWith("w3xfx-")).map((m) => Math.round(m.position.x * 100) / 100);
    expect(new Set(xs)).toEqual(new Set([1, -1, 0]));

    // and WITHOUT pivots the same three docs are one system (lossless merge)
    h.cancel();
    const flat = rig.play({ id: "flat", emitters: ring.map((e) => ({ doc: e.doc })) }, atPosition(0, 1, 0));
    expect(flat.plan.systemsAfterMerge).toBe(1);
  });

  it("replays a KP2E emission track onto emitRate over time", () => {
    cover("w3x-emitter-runtime");
    // Babylon has no animated-emitter concept; this is the documented
    // compromise, and `DeathWave`-class assets depend on it entirely.
    const runtime: W3xEmitterRuntimeFlags = {
      modelSpace: false,
      xYQuad: false,
      lineEmitter: false,
      wantsHeadAndTail: false,
      priorityPlane: 0,
      trackFrameSec: 1 / 1000,
      emissionTrack: { keys: [[0, 0], [500, 100], [1000, 0]], interp: 1 },
    };
    rig.play(effect({ emitters: [{ doc: doc({ id: "e0", rate: 100 }), runtime }] }), atPosition(0, 1, 0));
    const ps = scene.particleSystems[0]!;
    expect(ps.emitRate).toBe(0); // frame 0 must not dump a puff the original never had
    rig.tick(500);
    expect(ps.emitRate).toBe(100); // the track's peak
    rig.tick(250);
    expect(ps.emitRate).toBe(50); // linear resample on the way down
  });

  it("gates emission off entirely while KP2V says invisible", () => {
    cover("w3x-emitter-runtime");
    const runtime: W3xEmitterRuntimeFlags = {
      modelSpace: false,
      xYQuad: false,
      lineEmitter: false,
      wantsHeadAndTail: false,
      priorityPlane: 0,
      trackFrameSec: 1 / 1000,
      visibilityTrack: { keys: [[0, 0], [400, 0], [401, 1]], interp: 0 },
    };
    rig.play(effect({ emitters: [{ doc: doc({ id: "e0", rate: 60 }), runtime }] }), atPosition(0, 1, 0));
    const ps = scene.particleSystems[0]!;
    rig.tick(100);
    expect(ps.emitRate).toBe(0);
    rig.tick(400);
    expect(ps.emitRate).toBe(60);
  });
});

describe("disposal — every exit leaves nothing running (w3x-emitter-runtime)", () => {
  it("drains after stop(), then returns the systems to the pool", () => {
    cover("w3x-emitter-runtime");
    const h = rig.play(effect({ emitters: [{ doc: doc({ id: "e0", lifetimeSec: { min: 0.5, max: 0.5 } }) }] }), atPosition(0, 1, 0));
    h.stop();
    expect(h.alive).toBe(true); // particles in flight still finish
    rig.tick(200);
    expect(h.alive).toBe(true);
    rig.tick(400); // past the 0.5 s lifetime
    expect(h.alive).toBe(false);
    expect(rig.systemCount).toBe(0);
    expect(rig.pooledCount).toBe(1); // reusable, not leaked
  });

  it("self-terminates on durationSec without anyone calling stop()", () => {
    cover("w3x-emitter-runtime");
    const h = rig.play(effect({ durationSec: 1 }), atPosition(0, 1, 0));
    rig.tick(1100);
    rig.tick(600); // drain
    expect(h.alive).toBe(false);
    expect(rig.systemCount).toBe(0);
  });

  it("hard-caps a caller that never stops (maxEffectSec backstop)", () => {
    cover("w3x-emitter-runtime");
    const capped = new W3xEmitterRig(scene, { createTexture: () => null, maxEffectSec: 2 });
    const h = capped.play({ id: "fx", emitters: [{ doc: doc({ id: "e0" }) }] }, atPosition(0, 1, 0));
    for (let i = 0; i < 40; i++) capped.tick(100); // 4 s
    expect(h.alive).toBe(false);
    expect(capped.systemCount).toBe(0);
    capped.dispose();
  });

  it("kills an effect the instant its anchor dies — the #131 root cause", () => {
    cover("w3x-emitter-runtime");
    const root = champion();
    const h = rig.play(effect({ attach: "right,hand" }), { kind: "node", root });
    expect(h.alive).toBe(true);
    // the model is swapped/torn down without anyone telling the rig
    root.dispose();
    rig.tick(16);
    expect(h.alive).toBe(false);
    expect(rig.systemCount).toBe(0);
    // and the orphaned system is DESTROYED, not pooled — a pooled corpse would
    // resurrect at world origin on the next play()
    expect(rig.pooledCount).toBe(0);
    expect(rig.totalSystems).toBe(0);
  });

  it("an ambient effect still dies with its champion", () => {
    cover("w3x-emitter-runtime");
    const root = champion();
    const h = rig.play(effect({ emitters: [{ doc: doc({ id: "orb", ambient: true }) }], attach: "chest" }), { kind: "node", root });
    for (let i = 0; i < 100; i++) rig.tick(100); // 10 s: an ambient orb keeps going
    expect(h.alive).toBe(true);
    root.dispose();
    rig.tick(16);
    expect(h.alive).toBe(false);
  });

  it("dispose() releases every system, live or pooled", () => {
    cover("w3x-emitter-runtime");
    const a = rig.play(effect({ emitters: [{ doc: doc({ id: "a" }) }, { doc: doc({ id: "b", blendMode: "alpha" }) }] }), atPosition(0, 1, 0));
    a.stop();
    rig.tick(600); // a → pool
    const b = rig.play(effect({ emitters: [{ doc: doc({ id: "c" }) }] }), atPosition(0, 1, 0));
    expect(rig.totalSystems).toBeGreaterThan(0);
    rig.dispose();
    expect(rig.totalSystems).toBe(0);
    expect(rig.systemCount).toBe(0);
    expect(rig.pooledCount).toBe(0);
    expect(scene.particleSystems.length).toBe(0);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(rig.play(effect(), atPosition(0, 1, 0)).alive).toBe(false); // inert after dispose
  });

  it("REGRESSION: a CONTINUOUS effect replayed from the pool still emits", () => {
    cover("w3x-emitter-runtime");
    // Babylon's animate() takes the manual-emission branch whenever
    // `manualEmitCount > -1`, and that branch resets the count to 0 — never to
    // -1. Returning a pooled system with the count at 0 therefore makes it
    // permanently deaf to emitRate: the system is started, ready, textured, at
    // full rate — and emits nothing, silently. Caught on the audition page.
    const first = rig.play(effect({ emitters: [{ doc: doc({ id: "e0", rate: 40 }) }] }), atPosition(0, 1, 0));
    first.cancel();
    rig.play(effect({ emitters: [{ doc: doc({ id: "e0", rate: 40 }) }] }), atPosition(0, 1, 0));
    const ps = scene.particleSystems[0]!;
    expect(rig.totalSystems).toBe(1); // proves it really came from the pool
    expect(ps.manualEmitCount).toBe(-1);
    expect(ps.emitRate).toBe(40);
  });

  it("re-applies the budget to a pooled system instead of keeping the old rate", () => {
    cover("w3x-emitter-runtime");
    const heavy = Array.from({ length: 4 }, (_, i) => ({
      doc: doc({ id: `e${i}`, rate: 300, lifetimeSec: { min: 2, max: 2 }, sizeStops: [[0, 1 + i], [1, 0.2]] as VfxDoc["sizeStops"] }),
    }));
    const quiet = rig.play({ id: "fx", emitters: heavy }, atPosition(0, 1, 0));
    const quietRate = scene.particleSystems[0]!.emitRate;
    quiet.cancel();
    // replay into a crowded arena: same doc ids, tighter budget
    const others = Array.from({ length: 11 }, () => rig.play({ id: "fx", emitters: heavy }, atPosition(0, 1, 0)));
    const crowded = rig.play({ id: "fx", emitters: heavy }, atPosition(0, 1, 0));
    expect(crowded.plan.emitters[0]!.rateScale).toBeLessThan(1);
    const rates = scene.particleSystems.map((p) => p.emitRate);
    expect(Math.min(...rates)).toBeLessThan(quietRate);
    for (const h of others) h.cancel();
  });

  it("reuses pooled systems instead of allocating — 200 replays, bounded systems", () => {
    cover("w3x-emitter-runtime");
    for (let i = 0; i < 200; i++) {
      const h = rig.play(effect({ emitters: [{ doc: doc({ id: "e0", mode: "burst", burstCount: 20, rate: undefined }) }] }), atPosition(0, 1, 0));
      h.stop();
      rig.tick(600);
    }
    expect(rig.effectCount).toBe(0);
    expect(rig.totalSystems).toBe(1); // one pooled instance served all 200
  });
});

describe("the budget is enforced at play time (w3x-emitter-runtime)", () => {
  it("never exceeds the per-effect system cap, however many emitters a model had", () => {
    cover("w3x-emitter-runtime");
    // 20 DISTINCT emitters (nothing to merge) — the drop path, not the merge path
    const emitters = Array.from({ length: 20 }, (_, i) => ({
      doc: doc({ id: `e${i}`, rate: 30 + i, sizeStops: [[0, 0.2 + i * 0.05], [1, 0.1]] as VfxDoc["sizeStops"] }),
    }));
    const h = rig.play({ id: "divinering", emitters }, atPosition(0, 1, 0));
    expect(h.plan.systemsBeforeMerge).toBe(20);
    expect(rig.systemCount).toBeLessThanOrEqual(6);
    expect(h.plan.dropped.length).toBeGreaterThan(0);
    expect(h.plan.faithful).toBe(false);
  });

  it("degrades as the arena fills up, and always draws something", () => {
    cover("w3x-emitter-runtime");
    const emitters = Array.from({ length: 12 }, (_, i) => ({ doc: doc({ id: `e${i}`, rate: 120, sizeStops: [[0, 1 + i * 0.01], [1, 0.5]] as VfxDoc["sizeStops"] }) }));
    const handles = Array.from({ length: 12 }, () => rig.play({ id: "fx", emitters }, atPosition(0, 1, 0)));
    expect(rig.effectCount).toBe(12);
    for (const h of handles) expect(h.plan.emitters.length).toBeGreaterThanOrEqual(1);
    // the LAST effect played sees the fullest arena and is the most degraded
    expect(handles[11]!.plan.particles).toBeLessThanOrEqual(handles[0]!.plan.particles);
  });
});

describe("end to end: WC3 binary parameters → a running Babylon system (w3x-emitter-runtime)", () => {
  it("plays the decoded DivineRing emitter on a champion's hand", () => {
    cover("w3x-emitter-runtime");
    // the same golden decode asserted in w3xEmitter.test.ts, now driven all the
    // way onto a real (headless) ParticleSystem attached to a real joint
    const pre2: W3xParticleEmitter = {
      name: "BlizParticle02",
      anchorNode: "Point01",
      speed: 200,
      variation: 0.02,
      latitude: 0,
      gravity: 0,
      lifespan: 0.5,
      emissionRate: 40,
      length: 4,
      width: 4,
      filterMode: 1,
      rows: 1,
      cols: 1,
      headOrTail: 0,
      tailLength: 0,
      timeMiddle: 0.5,
      segmentColor: [
        [1, 0.902, 0.247],
        [0.988, 0.867, 0.043],
        [1, 1, 0.749],
      ],
      segmentAlpha: [255, 255, 0],
      segmentScaling: [20, 20, 20],
      flags: W3X_NODE_FLAG.particleEmitter | W3X_NODE_FLAG.unshaded,
    };
    const m = w3xEmitterToVfxDoc(pre2, { id: "godie-divinering-p0" });
    const root = champion();
    const h = rig.play({ id: "godie-divinering", emitters: [{ doc: m.doc, runtime: m.runtime }], attach: "right,hand" }, { kind: "node", root });

    expect(h.alive).toBe(true);
    const ps = scene.particleSystems[0]!;
    expect(ps.emitRate).toBe(40);
    expect(ps.minLifeTime).toBe(0.5);
    expect(ps.minEmitPower).toBeCloseTo(200 * 0.98 * W3X_MODEL_UNIT, 3);
    expect(h.attach?.node).toBe("7-Hand Right Ref");
    // and it tears down cleanly with the champion
    root.dispose();
    rig.tick(16);
    expect(rig.totalSystems).toBe(0);
  });
});

describe("staggered members (蝗蟲群 spawn interval)", () => {
  it("holds a delayed CONTINUOUS emitter back on the RIG CLOCK, not the wall clock", () => {
    cover("w3x-swarm-stagger");
    // WC3's Locust Swarm spawns one member every DataB seconds (0.05 for
    // A0IB), so the ring FILLS IN. Popping all 22 on one frame is a flashbulb,
    // which is a different effect.
    rig.play(
      effect({
        emitters: [
          { doc: doc({ id: "now" }) },
          { doc: doc({ id: "later" }), delaySec: 0.5 },
        ],
      }),
      atPosition(0, 0, 0),
    );
    const byName = new Map(scene.particleSystems.map((ps) => [ps.name, ps]));
    // Two docs identical apart from their delay must NOT be merged away —
    // merging them would silently delete the stagger.
    expect(scene.particleSystems).toHaveLength(2);
    expect(byName.get("w3xfx-now")!.isStarted()).toBe(true);
    expect(byName.get("w3xfx-later")!.isStarted()).toBe(false);
    // Babylon's own `start(delayMs)` runs off setTimeout. Everything here
    // advances on tick(dt), so the stagger has to as well — otherwise a paused
    // match or a hand-stepped replay drifts out of step.
    rig.tick(400);
    expect(byName.get("w3xfx-later")!.isStarted()).toBe(false);
    rig.tick(200); // 0.6 s total, past the 0.5 s slot
    expect(byName.get("w3xfx-later")!.isStarted()).toBe(true);
  });

  it("defers a delayed BURST until the effect reaches its slot", () => {
    cover("w3x-swarm-stagger");
    // `burstNow` is immediate by design, so a staggered one-shot has to be
    // queued and fired from tick() instead.
    const burst = doc({ id: "b", mode: "burst", burstCount: 10, rate: undefined });
    rig.play(effect({ emitters: [{ doc: burst, delaySec: 0.2 }] }), atPosition(0, 0, 0));
    const ps = scene.particleSystems[0]! as unknown as { manualEmitCount: number };
    expect(ps.manualEmitCount).toBe(0); // built, armed, nothing owed yet
    rig.tick(100);
    expect(ps.manualEmitCount).toBe(0); // 0.1s — still early
    rig.tick(150); // 0.25s total, past the 0.2s slot
    expect(ps.manualEmitCount).toBe(10);
  });

  it("waits for the last staggered member before releasing the effect", () => {
    cover("w3x-swarm-stagger");
    // A 0.5s-lived particle born 1.0s late is still on screen at t=1.2s. If the
    // drain only waited for `lifetimeSec.max`, the tail of a 22-member swarm
    // would be cut off mid-flight.
    const h = rig.play(
      effect({ emitters: [{ doc: doc({ id: "tail" }), delaySec: 1 }], durationSec: 0.1 }),
      atPosition(0, 0, 0),
    );
    rig.tick(200); // duration elapsed → stop() → draining
    rig.tick(600); // 0.6s of drain: enough for lifetime alone, NOT for the delay
    expect(h.alive).toBe(true);
    rig.tick(1000);
    expect(h.alive).toBe(false);
    expect(rig.effectCount).toBe(0);
  });
});
