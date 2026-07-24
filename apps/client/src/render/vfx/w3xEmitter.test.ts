/**
 * WC3 `PRE2` → `vfx@1` → Babylon parity (task #98, the emitter rebuild).
 *
 * The owner's acceptance bar for an approximation is that the ORIGINAL
 * PARAMETERS were genuinely read. So the two anchor cases here are the two
 * emitters the archaeology decoded by hand out of the binary
 * (`docs/_vfx-fidelity-w3x.md` §4.4) — `DivineRing.mdx` emitter 1/20 and
 * `flamessmoke.mdx` emitters 1/4 and 3/4. Every number below is transcribed
 * from that decode, and the expectations are computed from the WC3 values, not
 * from whatever the implementation happens to produce.
 *
 * Pure (no GPU) for the mapping; a final NullEngine pass proves the produced
 * docs really do build a Babylon ParticleSystem, so "it maps" and "it renders"
 * are not two different claims.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { zVfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "../../vfx/particleFactory";
import {
  W3X_FILTER_MODE,
  W3X_HEAD_OR_TAIL,
  W3X_MODEL_UNIT,
  W3X_NODE_FLAG,
  blendForFilterMode,
  expandHeadAndTail,
  isFaithful,
  sampleTrack,
  segmentStopTimes,
  w3xEmitterToVfxDoc,
  type W3xParticleEmitter,
} from "./w3xEmitter";

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const S = W3X_MODEL_UNIT; // 1/36

/** Everything a PRE2 record needs, so a fixture only states what it cares about. */
function emitter(over: Partial<W3xParticleEmitter> = {}): W3xParticleEmitter {
  return {
    name: "BlizParticle",
    speed: 100,
    variation: 0,
    latitude: 10,
    gravity: 0,
    lifespan: 1,
    emissionRate: 20,
    length: 10,
    width: 10,
    filterMode: W3X_FILTER_MODE.additive,
    rows: 1,
    cols: 1,
    headOrTail: W3X_HEAD_OR_TAIL.head,
    tailLength: 0,
    timeMiddle: 0.5,
    segmentColor: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    segmentAlpha: [255, 255, 0],
    segmentScaling: [10, 10, 10],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// GOLDEN 1 — DivineRing.mdx, emitter 1/20 ("BlizParticle02", flags 0x29000)
// ---------------------------------------------------------------------------
//   speed 200  variation 0.02  latitude 0  gravity 0  lifespan 0.5  rate 40
//   length/width 4/4  additive  head  timeMiddle 0.5
//   color [1,0.902,0.247] → [0.988,0.867,0.043] → [1,1,0.749]
//   alpha 255→255→0   scaling 20→20→20   texture Textures\firering6.blp
const DIVINE_RING_P0: W3xParticleEmitter = {
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
  filterMode: W3X_FILTER_MODE.additive,
  rows: 1,
  cols: 1,
  headOrTail: W3X_HEAD_OR_TAIL.head,
  tailLength: 0,
  timeMiddle: 0.5,
  segmentColor: [
    [1, 0.902, 0.247],
    [0.988, 0.867, 0.043],
    [1, 1, 0.749],
  ],
  segmentAlpha: [255, 255, 0],
  segmentScaling: [20, 20, 20],
  flags: 0x29000,
};

describe("PRE2 → vfx@1: the DivineRing golden sample (w3x-emitter-parity)", () => {
  const m = w3xEmitterToVfxDoc(DIVINE_RING_P0, { id: "godie-divinering-p0", texture: "assets/textures/particles/fire_01.png" });

  it("produces a schema-valid vfx@1 doc", () => {
    cover("w3x-emitter-parity");
    expect(zVfxDoc.safeParse(m.doc).success).toBe(true);
  });

  it("maps lifespan / emissionRate 1:1 — WC3 has ONE lifespan, not a range", () => {
    cover("w3x-emitter-parity");
    expect(m.doc.lifetimeSec).toEqual({ min: 0.5, max: 0.5 });
    expect(m.doc.mode).toBe("continuous");
    expect(m.doc.rate).toBe(40);
    expect(m.doc.burstCount).toBeUndefined();
  });

  it("folds speed ± variation into the emit-power range", () => {
    cover("w3x-emitter-parity");
    // 200 model units/s ± 2%, converted at 1/36
    expect(m.doc.speed!.min).toBeCloseTo(200 * 0.98 * S, 4);
    expect(m.doc.speed!.max).toBeCloseTo(200 * 1.02 * S, 4);
  });

  it("uses HALF the emission-rectangle extent as the emitter radius", () => {
    cover("w3x-emitter-parity");
    // WC3 spreads particles across ±width/2 about the node (same as
    // mdx-m3-viewer), so a 4-unit-wide plane is a 2-unit radius, not 4.
    expect(m.doc.emitter.shape).toBe("cone");
    expect(m.doc.emitter.shape === "cone" && m.doc.emitter.radius).toBeCloseTo((4 / 2) * S, 3);
  });

  it("carries the three colour/size segments at t = 0 / timeMiddle / 1, alpha 0..255 → 0..1", () => {
    cover("w3x-emitter-parity");
    expect(m.doc.colorStops).toEqual([
      [0, [1, 0.902, 0.247, 1]],
      [0.5, [0.988, 0.867, 0.043, 1]],
      [1, [1, 1, 0.749, 0]],
    ]);
    const s = 20 * S;
    expect(m.doc.sizeStops!.map(([t, v]) => [t, Math.round(v * 1000) / 1000])).toEqual([
      [0, Math.round(s * 1000) / 1000],
      [0.5, Math.round(s * 1000) / 1000],
      [1, Math.round(s * 1000) / 1000],
    ]);
  });

  it("keeps the emitter's parent bone and reports the ONE unavoidable approximation", () => {
    cover("w3x-emitter-parity");
    expect(m.doc.anchorBone).toBe("Point01");
    expect(m.doc.blendMode).toBe("additive");
    // latitude 0 is a perfectly straight line; vfx@1's minimum cone is 1°
    expect(isFaithful(m)).toBe(false);
    expect(m.notes.map((n) => n.field)).toContain("latitude");
    expect(m.doc.emitter.shape === "cone" && m.doc.emitter.angleDeg).toBe(1);
  });

  it("does NOT rescale the authored size to fit an intuition", () => {
    cover("w3x-emitter-parity");
    // segmentScaling 20 is 20 WC3 MODEL units = 0.556 world units. It is not
    // "20× too big" — [[ggd-faithful-import-over-rescale]].
    expect(m.doc.size.start).toBeCloseTo(20 * S, 3);
  });
});

// ---------------------------------------------------------------------------
// GOLDEN 2 — flamessmoke.mdx ("BlizParticle01" 1/4, and the ember emitter 3/4)
// ---------------------------------------------------------------------------
//   1/4: speed 160 var 0.5  lifespan 2.0  rate 75  L/W 125  additive
//        color [0,0.518,1] → [1,0.471,0] → [1,0.918,0]   scaling 10→50→20
//   3/4: speed 400  latitude 45  gravity 300  lifespan 4.0  rate 3
describe("PRE2 → vfx@1: the flamessmoke golden sample (w3x-emitter-parity)", () => {
  const smoke = w3xEmitterToVfxDoc(
    emitter({
      name: "BlizParticle01",
      speed: 160,
      variation: 0.5,
      lifespan: 2,
      emissionRate: 75,
      length: 125,
      width: 125,
      latitude: 0,
      segmentColor: [
        [0, 0.518, 1],
        [1, 0.471, 0],
        [1, 0.918, 0],
      ],
      segmentScaling: [10, 50, 20],
    }),
    { id: "godie-flamessmoke-p0" },
  );

  const ember = w3xEmitterToVfxDoc(
    emitter({ speed: 400, latitude: 45, gravity: 300, lifespan: 4, emissionRate: 3 }),
    { id: "godie-flamessmoke-p3" },
  );

  it("spreads ±50% speed variation over the emit-power range", () => {
    cover("w3x-emitter-parity");
    expect(smoke.doc.speed!.min).toBeCloseTo(160 * 0.5 * S, 4);
    expect(smoke.doc.speed!.max).toBeCloseTo(160 * 1.5 * S, 4);
  });

  it("keeps the grow-then-shrink size ramp (10 → 50 → 20)", () => {
    cover("w3x-emitter-parity");
    const sizes = smoke.doc.sizeStops!.map(([, v]) => v);
    expect(sizes[0]).toBeCloseTo(10 * S, 3);
    expect(sizes[1]).toBeCloseTo(50 * S, 3);
    expect(sizes[2]).toBeCloseTo(20 * S, 3);
    expect(sizes[1]!).toBeGreaterThan(sizes[0]!);
    expect(sizes[2]!).toBeLessThan(sizes[1]!);
  });

  it("INVERTS gravity: WC3 positive gravity means DOWN", () => {
    cover("w3x-emitter-parity");
    expect(ember.doc.gravityY).toBeCloseTo(-300 * S, 3);
    expect(ember.doc.gravityY!).toBeLessThan(0);
  });

  it("reads latitude as DEGREES (this map's v800 files), not radians", () => {
    cover("w3x-emitter-parity");
    // as radians 45 would be 2578°, clamped to 180 — i.e. every WC3 spray would
    // become a full sphere. The map stores degrees; the option exists anyway.
    expect(ember.doc.emitter.shape === "cone" && ember.doc.emitter.angleDeg).toBe(45);
    const asRad = w3xEmitterToVfxDoc(emitter({ latitude: Math.PI / 4 }), { id: "x", latitudeUnit: "rad" });
    expect(asRad.doc.emitter.shape === "cone" && asRad.doc.emitter.angleDeg).toBeCloseTo(45, 2);
  });
});

// ---------------------------------------------------------------------------
// The rest of the parameter surface
// ---------------------------------------------------------------------------

describe("PRE2 parameter surface (w3x-emitter-parity)", () => {
  it("maps every filterMode, and says so when modulate2x is lossy", () => {
    cover("w3x-emitter-parity");
    expect(blendForFilterMode(W3X_FILTER_MODE.blend)).toBe("alpha");
    expect(blendForFilterMode(W3X_FILTER_MODE.additive)).toBe("additive");
    expect(blendForFilterMode(W3X_FILTER_MODE.modulate)).toBe("modulate");
    expect(blendForFilterMode(W3X_FILTER_MODE.modulate2x)).toBe("modulate");
    expect(blendForFilterMode(W3X_FILTER_MODE.alphaKey)).toBe("alphaKey");
    const m = w3xEmitterToVfxDoc(emitter({ filterMode: W3X_FILTER_MODE.modulate2x }), { id: "x" });
    expect(m.notes.find((n) => n.field === "filterMode")?.kind).toBe("approximated");
  });

  it("turns squirt into a burst whose count is the emission rate", () => {
    cover("w3x-emitter-parity");
    const m = w3xEmitterToVfxDoc(emitter({ squirt: 1, emissionRate: 64 }), { id: "x" });
    expect(m.doc.mode).toBe("burst");
    expect(m.doc.burstCount).toBe(64);
    expect(m.doc.rate).toBeUndefined();
    expect(zVfxDoc.safeParse(m.doc).success).toBe(true);
  });

  it("emits a flipbook only when the bound texture really is the WC3 atlas", () => {
    cover("w3x-emitter-parity");
    const real = w3xEmitterToVfxDoc(emitter({ rows: 8, cols: 8 }), {
      id: "x",
      texture: "assets/textures/particles/wc3/clouds8x8.png",
      textureIsAtlas: true,
    });
    expect(real.doc.spriteSheet).toEqual({ rows: 8, cols: 8, cycleSec: 1, randomStartCell: true });

    // slicing a SUBSTITUTED single-frame CC0 sprite into 64 cells is confetti
    const sub = w3xEmitterToVfxDoc(emitter({ rows: 8, cols: 8 }), {
      id: "x",
      texture: "assets/textures/particles/smoke_03.png",
    });
    expect(sub.doc.spriteSheet).toBeUndefined();
    expect(sub.notes.find((n) => n.field === "rows/cols")?.kind).toBe("dropped");
  });

  it("maps tail particles to a stretched billboard, and splits `both` into two systems", () => {
    cover("w3x-emitter-parity");
    const tail = w3xEmitterToVfxDoc(emitter({ headOrTail: W3X_HEAD_OR_TAIL.tail, tailLength: 3.5 }), { id: "x" });
    expect(tail.doc.stretched).toBe(true);
    expect(tail.doc.tailLength).toBe(3.5);
    expect(expandHeadAndTail(tail)).toHaveLength(1);

    const both = w3xEmitterToVfxDoc(emitter({ headOrTail: W3X_HEAD_OR_TAIL.both, emissionRate: 40 }), { id: "x" });
    const pair = expandHeadAndTail(both);
    expect(pair).toHaveLength(2);
    expect(pair[0]!.stretched).toBe(true);
    expect(pair[1]!.stretched).toBeUndefined();
    // one WC3 particle, so the two systems SHARE the original emission
    expect(pair[0]!.rate! + pair[1]!.rate!).toBeCloseTo(40, 3);
    expect(pair.every((d) => zVfxDoc.safeParse(d).success)).toBe(true);
  });

  it("lifts the node flags out onto the runtime side (they have no vfx@1 field)", () => {
    cover("w3x-emitter-parity");
    const m = w3xEmitterToVfxDoc(
      emitter({ flags: W3X_NODE_FLAG.modelSpace | W3X_NODE_FLAG.xYQuad | W3X_NODE_FLAG.lineEmitter | W3X_NODE_FLAG.unshaded }),
      { id: "x" },
    );
    expect(m.runtime.modelSpace).toBe(true);
    expect(m.runtime.xYQuad).toBe(true);
    expect(m.runtime.lineEmitter).toBe(true);
    // unshaded is a genuine no-op — Babylon particles are unlit already
    expect(m.notes.find((n) => n.field === "flags.unshaded")?.kind).toBe("exact");
    expect(zVfxDoc.safeParse(m.doc).success).toBe(true);
  });

  it("survives the authoring quirks the map actually contains", () => {
    cover("w3x-emitter-parity");
    // negative emissionRate (gumdam), negative speed (inward shockwave),
    // zero start size (grow-in-from-nothing), timeMiddle pinned to an end
    const m = w3xEmitterToVfxDoc(
      emitter({ emissionRate: -30, speed: -120, segmentScaling: [0, 10, 0], timeMiddle: 0 }),
      { id: "x" },
    );
    expect(zVfxDoc.safeParse(m.doc).success).toBe(true);
    expect(m.doc.rate).toBeCloseTo(30, 3);
    expect(m.doc.speed!.max).toBeGreaterThan(0);
    expect(m.doc.size.start).toBeGreaterThan(0);
    expect(m.notes.map((n) => n.field)).toEqual(expect.arrayContaining(["emissionRate", "speed"]));
  });

  it("nudges a degenerate timeMiddle so the gradient stays strictly ascending", () => {
    cover("w3x-emitter-parity");
    expect(segmentStopTimes(0.5)).toEqual([0, 0.5, 1]);
    for (const mid of [0, 1, -3, 7, Number.NaN]) {
      const [a, b, c] = segmentStopTimes(mid);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
    }
  });

  it("falls back to the KP2E peak when the static emission rate is 0", () => {
    cover("w3x-emitter-parity");
    const m = w3xEmitterToVfxDoc(
      emitter({ emissionRate: 0, emissionTrack: { keys: [[0, 0], [500, 90], [1000, 0]], interp: 1 } }),
      { id: "x" },
    );
    expect(m.doc.rate).toBe(90);
    expect(m.runtime.emissionTrack).toBeDefined();
    expect(m.notes.map((n) => n.field)).toContain("KP2E/KP2V");
  });

  it("resamples KP2 tracks linearly, and holds on a step track", () => {
    cover("w3x-emitter-parity");
    const linear = { keys: [[0, 0] as const, [1000, 100] as const], interp: 1 };
    expect(sampleTrack(linear, 0)).toBe(0);
    expect(sampleTrack(linear, 0.5)).toBeCloseTo(50, 6);
    expect(sampleTrack(linear, 1)).toBe(100);
    expect(sampleTrack(linear, 99)).toBe(100); // clamps past the last key
    const step = { keys: [[0, 0] as const, [1000, 100] as const], interp: 0 };
    expect(sampleTrack(step, 0.5)).toBe(0);
  });

  it("carries the emitter PIVOT through, converted MDX Z-up → Babylon Y-up", () => {
    cover("w3x-emitter-parity");
    // A multi-emitter WC3 effect gets its SHAPE from where its emitters sit:
    // DivineRing's 20 near-identical emitters ARE a ring because of their
    // pivots. `tools/w3x-import/w3xlib/gltf.py` bakes (x, y, z) → s·(x, z, −y)
    // into every imported mesh, so an emitter must use the same conversion or
    // it lands somewhere the original model never put it.
    const m = w3xEmitterToVfxDoc(emitter({ pivot: [48, 12, 30] }), { id: "x" });
    expect(m.runtime.pivotOffset).toEqual({
      x: Math.round(48 * S * 10000) / 10000,
      y: Math.round(30 * S * 10000) / 10000,
      z: Math.round(-12 * S * 10000) / 10000,
    });
    // a zero pivot is the common case and costs nothing
    expect(w3xEmitterToVfxDoc(emitter({ pivot: [0, 0, 0] }), { id: "x" }).runtime.pivotOffset).toBeUndefined();
    expect(w3xEmitterToVfxDoc(emitter(), { id: "x" }).runtime.pivotOffset).toBeUndefined();
  });

  it("scales density explicitly, and never hides that it did", () => {
    cover("w3x-emitter-parity");
    const m = w3xEmitterToVfxDoc(emitter({ emissionRate: 100 }), { id: "x", densityScale: 0.5 });
    expect(m.doc.rate).toBe(50);
    expect(m.notes.find((n) => n.detail.includes("FAITHFUL rate is 100"))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// …and it really renders
// ---------------------------------------------------------------------------

describe("the rebuilt emitter builds a real Babylon ParticleSystem (w3x-emitter-parity)", () => {
  it("carries every mapped parameter onto the system", () => {
    cover("w3x-emitter-parity");
    const m = w3xEmitterToVfxDoc(DIVINE_RING_P0, { id: "godie-divinering-p0" });
    const ps = toParticleSystem(m.doc, scene, { createTexture: () => null });
    expect(ps.minLifeTime).toBe(0.5);
    expect(ps.maxLifeTime).toBe(0.5);
    expect(ps.emitRate).toBe(40);
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_ONEONE);
    expect(ps.minEmitPower).toBeCloseTo(200 * 0.98 * S, 3);
    expect(ps.maxEmitPower).toBeCloseTo(200 * 1.02 * S, 3);
    expect(ps.getColorGradients()).toHaveLength(3);
    expect(ps.getSizeGradients()).toHaveLength(3);
    ps.dispose();
  });

  it("renders the gravity-driven ember emitter with a downward gravity vector", () => {
    cover("w3x-emitter-parity");
    const m = w3xEmitterToVfxDoc(emitter({ gravity: 300 }), { id: "x" });
    const ps = toParticleSystem(m.doc, scene, { createTexture: () => null });
    expect(ps.gravity.y).toBeCloseTo(-300 * S, 3);
    expect(ps.gravity.x).toBe(0);
    ps.dispose();
  });
});
