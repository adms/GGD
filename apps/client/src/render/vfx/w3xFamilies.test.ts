/**
 * Tests for the 球體 / 蝗蟲群 / 粒子 family layer.
 *
 * FIXTURES ARE REAL. Every emitter block below is the byte-exact `PRE2` dump
 * from `tools/w3x-import/out/emitters/EMITTERS.json` for the named model,
 * copied verbatim including the odd values (`latitude 555`, `segmentAlpha
 * [0,255,0]`). Expectations are computed from the WC3 numbers by hand in the
 * comments, never read back out of the implementation.
 */
import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  SWARM_MIN_CONCURRENCY,
  buildW3xFamilies,
  classifyFamily,
  coneAngleDeg,
  crc32,
  distinctPivotCount,
  dominantAttach,
  emitterShape,
  isPersistentAttachmentRef,
  kenneySubstitute,
  wc3TextureStem,
  type DatasetEmitter,
  type DatasetModel,
  type DatasetRef,
} from "./w3xFamilies";
import {
  familyEffectToSpec,
  scaleVfxDoc,
  swarmCountForLevel,
  swarmRingPlacements,
  tintVfxDoc,
} from "./w3xFamilyRuntime";
import type { W3xParticleEmitter } from "./w3xEmitter";

// ---------------------------------------------------------------------------
// fixtures — verbatim from EMITTERS.json
// ---------------------------------------------------------------------------

function raw(over: Partial<DatasetEmitter["raw"]>): DatasetEmitter["raw"] {
  return {
    speed: 0,
    variation: 0,
    latitudeDeg: 0,
    gravity: 0,
    lifespanSec: 1,
    emissionRatePerSec: 20,
    length: 10,
    width: 10,
    filterMode: 1,
    rows: 1,
    cols: 1,
    headOrTail: 0,
    tailLength: 0,
    timeMiddle: 0.5,
    segmentColor: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    segmentAlpha: [255, 255, 0],
    segmentScaling: [10, 10, 10],
    squirt: 0,
    priorityPlane: 0,
    ...over,
  };
}

/** `DivineRing.mdx` emitter 0/20 — the golden sample from the fidelity doc. */
const DIVINERING_P0: DatasetEmitter = {
  index: 0,
  name: "BlizParticle02",
  anchorNode: "Point01",
  pivot: [-95.2466, 1.4491, 0.0],
  flags: { raw: 0x29000 },
  raw: raw({
    speed: 200,
    variation: 0.02,
    latitudeDeg: 0,
    lifespanSec: 0.5,
    emissionRatePerSec: 40,
    length: 4,
    width: 4,
    tailLength: 4,
    segmentColor: [
      [1, 0.902, 0.2471],
      [0.9882, 0.8667, 0.0431],
      [1, 1, 0.749],
    ],
    segmentScaling: [20, 20, 20],
  }),
  texture: { wc3Path: "Textures\\firering6.blp" },
};

/** `Boomnl.mdx` emitter 1/5 — 1,000 concurrent motes, the 蝗蟲群 archetype. */
const BOOMNL_P1: DatasetEmitter = {
  index: 1,
  name: "BlizParticle02",
  anchorNode: "Bone_Boom",
  pivot: [-0.4, 0, 53.1],
  flags: { raw: 0x1000 },
  raw: raw({
    speed: 200,
    latitudeDeg: 180,
    lifespanSec: 1,
    emissionRatePerSec: 1000,
    length: 66,
    width: 70.1,
    segmentColor: [
      [0.9451, 0.1608, 0],
      [0.9294, 0.6784, 0],
      [1, 0.8706, 0],
    ],
    segmentScaling: [20, 30, 50],
  }),
  texture: { wc3Path: "Textures\\Clouds8x8Fire.blp" },
};

/** `1hswd_01.mdx` emitter 2/3 — dense, tiny, but only a 50×3 sliver. */
const BLADE_SHIMMER: DatasetEmitter = {
  index: 2,
  name: "Particle_2",
  anchorNode: "Bone_Blade",
  pivot: [40.4, 0, -2.3],
  flags: { raw: 0x21000 },
  raw: raw({
    speed: 0,
    latitudeDeg: 45,
    lifespanSec: 2,
    emissionRatePerSec: 500,
    length: 50,
    width: 3,
    segmentScaling: [2.7778, 3.4722, 4.8611],
  }),
  texture: { wc3Path: "Units\\Undead\\SkeletonMage\\smoke_1.blp" },
};

function model(over: Partial<DatasetModel>): DatasetModel {
  return {
    file: "X.mdx",
    stem: "x",
    bytes: 1000,
    glbBytes: 288,
    meshScaleFactor: 0.02778,
    assetClass: "pure-emitter",
    geometry: { geosets: 0, triangles: 0 },
    emitters: [],
    ribbons: [],
    ...over,
  };
}

function ref(over: Partial<DatasetRef>): DatasetRef {
  return {
    objectId: "A000",
    baseId: "Asph",
    field: "ability.targetArt",
    form: "map-imported",
    value: "X.mdx",
    basename: "X.mdx",
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe("coneAngleDeg", () => {
  it("clamps the author's repeated-digit typos to a full sphere", () => {
    // SephBoom stores 900 and LasercannonfinalRED stores 666/555/333/111.
    // WC3 cannot spray wider than a sphere, so everything past 180 means 180.
    expect(coneAngleDeg(900)).toBe(180);
    expect(coneAngleDeg(555)).toBe(180);
    expect(coneAngleDeg(180)).toBe(180);
    expect(coneAngleDeg(45)).toBe(45);
    expect(coneAngleDeg(-1)).toBe(0);
  });
});

describe("emitterShape", () => {
  it("registers the shape coverage", () => cover("w3x-family-shape"));
  const toEm = (d: DatasetEmitter): W3xParticleEmitter => ({
    name: d.name,
    speed: d.raw.speed,
    variation: d.raw.variation,
    latitude: d.raw.latitudeDeg,
    gravity: d.raw.gravity,
    lifespan: d.raw.lifespanSec,
    emissionRate: d.raw.emissionRatePerSec,
    length: d.raw.length,
    width: d.raw.width,
    filterMode: 1,
    rows: 1,
    cols: 1,
    headOrTail: 0,
    tailLength: d.raw.tailLength,
    timeMiddle: d.raw.timeMiddle,
    segmentColor: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    segmentAlpha: [255, 255, 0],
    segmentScaling: [
      d.raw.segmentScaling[0]!,
      d.raw.segmentScaling[1]!,
      d.raw.segmentScaling[2]!,
    ],
  });

  it("measures Boomnl as a swarm: 1000/s × 1s = 1000 motes, size 50 in a 200-unit spread", () => {
    const s = emitterShape(toEm(BOOMNL_P1));
    expect(s.concurrency).toBe(1000);
    expect(s.extent).toBe(200); // speed 200 × 1 s beats the 70-unit box
    expect(s.granularity).toBeCloseTo(50 / 200, 5);
    expect(s.enveloping).toBe(true); // latitude 180
    expect(s.swarmLike).toBe(true);
  });

  it("rejects the blade shimmer: dense and tiny, but only 50 units across", () => {
    const s = emitterShape(toEm(BLADE_SHIMMER));
    expect(s.concurrency).toBe(1000); // 500/s × 2 s — denser than Boomnl
    expect(s.granularity).toBeLessThan(0.11); // motes are minute
    expect(s.enveloping).toBe(true); // speed 0, so the box decides
    // …and it is STILL not a swarm: a 50×3 sliver cannot surround a unit.
    expect(s.extent).toBe(50);
    expect(s.swarmLike).toBe(false);
  });

  it("rejects DivineRing: 20 concurrent particles is a ring, not a cloud", () => {
    const s = emitterShape(toEm(DIVINERING_P0));
    expect(s.concurrency).toBe(20);
    expect(s.concurrency).toBeLessThan(SWARM_MIN_CONCURRENCY);
    expect(s.swarmLike).toBe(false);
  });
});

describe("classifyFamily", () => {
  it("puts shape ahead of use, so a buff-attached mote storm is a 蝗蟲群", () => {
    expect(classifyFamily({ swarmLike: true, persistentAttachment: true })).toBe("locust");
    expect(classifyFamily({ swarmLike: false, persistentAttachment: true })).toBe("orb");
    expect(classifyFamily({ swarmLike: false, persistentAttachment: false })).toBe("particle");
  });
});

describe("isPersistentAttachmentRef", () => {
  it("counts Asph target art and ALL buff art, and nothing else", () => {
    expect(isPersistentAttachmentRef({ field: "ability.targetArt", baseId: "Asph" })).toBe(true);
    expect(isPersistentAttachmentRef({ field: "buff.targetArt", baseId: "Bspe" })).toBe(true);
    expect(isPersistentAttachmentRef({ field: "buff.specialArt", baseId: "BOac" })).toBe(true);
    // caster art plays for the cast and is destroyed — not an orb
    expect(isPersistentAttachmentRef({ field: "ability.casterArt", baseId: "ANrg" })).toBe(false);
    // targetArt on a NON-Sphere ability is a one-shot too
    expect(isPersistentAttachmentRef({ field: "ability.targetArt", baseId: "Aegr" })).toBe(false);
  });
});

describe("dominantAttach", () => {
  // DivineRing's real reference set: chest on the Asph orb, origin on all three
  // of A10W's one-shot slots.
  const refs = [
    ref({ objectId: "A0TP", baseId: "Asph", field: "ability.targetArt" }),
    ref({ objectId: "A10W", baseId: "Aegr", field: "ability.casterArt" }),
    ref({ objectId: "A10W", baseId: "Aegr", field: "ability.specialArt" }),
    ref({ objectId: "A10W", baseId: "Aegr", field: "ability.targetArt" }),
  ];
  const attachments = {
    A0TP: { points: [{ field: "ability.targetArt", attachPoint: "chest" }] },
    A10W: {
      points: [
        { field: "ability.casterArt", attachPoint: "origin" },
        { field: "ability.specialArt", attachPoint: "origin" },
        { field: "ability.targetArt", attachPoint: "origin" },
      ],
    },
  };

  it("a plain majority vote picks origin — 3 uses against 1", () => {
    expect(dominantAttach(refs, attachments)).toBe("origin");
  });

  it("…which is why the orb path filters to the PERSISTENT reference first", () => {
    expect(dominantAttach(refs, attachments, isPersistentAttachmentRef)).toBe("chest");
  });
});

describe("texture substitution", () => {
  it("matches the Python extractor's crc32-driven pick, so both agree", () => {
    // Values checked against CPython: zlib.crc32(b"firering6") == 1198099726
    // and zlib.crc32(b"clouds8x8fire") == 4114610799.
    expect(crc32("firering6")).toBe(1198099726);
    expect(crc32("clouds8x8fire")).toBe(4114610799);
    // 1198099726 % 8 == 6 → the flame rule's 7th candidate.
    expect(kenneySubstitute("firering6")).toBe("fire_01");
    // "Clouds8x8Fire" hits the FLAME rule before the cloud rule (rule order
    // matters, and the Python table has flame first): 4114610799 % 8 == 7.
    expect(kenneySubstitute("Clouds8x8Fire")).toBe("fire_02");
    // Both picks match what `godie-divinering-p0.json` / `godie-boomnl-p1.json`
    // already ship, which is the whole point of porting the rule byte-for-byte.
  });

  it("strips WC3 backslash paths to a bare stem", () => {
    expect(wc3TextureStem("Textures\\Clouds8x8Fire.blp")).toBe("Clouds8x8Fire");
    expect(wc3TextureStem("Units\\Undead\\SkeletonMage\\smoke_1.blp")).toBe("smoke_1");
    expect(wc3TextureStem("babyface.blp")).toBe("babyface");
  });
});

describe("buildW3xFamilies", () => {
  it("registers the build coverage", () => cover("w3x-family-build"));
  const built = buildW3xFamilies({
    models: [
      model({
        file: "DivineRing.mdx",
        stem: "divinering",
        bytes: 7268,
        glbBytes: 1020,
        // the real file has 20; two is enough to prove the pivot layout survives
        emitters: [DIVINERING_P0, { ...DIVINERING_P0, index: 1, pivot: [-42.9, 83.6, 0] }],
      }),
      model({ file: "Boomnl.mdx", stem: "boomnl", emitters: [BOOMNL_P1] }),
    ],
    refs: [
      ref({ objectId: "A0TP", value: "DivineRing.mdx", basename: "DivineRing.mdx" }),
      ref({
        objectId: "B04R",
        baseId: "BEme",
        field: "buff.targetArt",
        value: "Boomnl.mdx",
        basename: "Boomnl.mdx",
      }),
    ],
    attachments: {
      A0TP: { points: [{ field: "ability.targetArt", attachPoint: "chest" }] },
      B04R: { points: [{ field: "buff.targetArt", attachPoint: "chest" }] },
    },
  });

  it("routes the ring to 球體 and the mote storm to 蝗蟲群", () => {
    const ids = built.manifest.effects.map((e) => `${e.family}:${e.id}`);
    expect(ids).toContain("orb:fx.w3x.orb.divinering");
    expect(ids).toContain("locust:fx.w3x.locust.boomnl");
  });

  it("emits one schema-shaped vfx@1 doc per PRE2, id-matched to the layer", () => {
    expect(built.docs).toHaveLength(3);
    const ring = built.manifest.effects.find((e) => e.id === "fx.w3x.orb.divinering")!;
    expect(ring.layers.map((l) => l.docId)).toEqual([
      "fx.w3x.orb.divinering.p00",
      "fx.w3x.orb.divinering.p01",
    ]);
    for (const l of ring.layers) expect(built.docs.some((d) => d.id === l.docId)).toBe(true);
  });

  it("carries the PIVOT through, because the pivot layout IS the ring", () => {
    const ring = built.manifest.effects.find((e) => e.id === "fx.w3x.orb.divinering")!;
    // MDX is Z-up: (x, y, z) → s·(x, z, −y). Emitter 0 pivots at
    // (-95.2466, 1.4491, 0) × 0.02778 → x -2.646, y 0, z -0.0403.
    expect(ring.layers[0]!.pivotOffset.x).toBeCloseTo(-2.646, 3);
    expect(ring.layers[0]!.pivotOffset.y).toBeCloseTo(0, 3);
    expect(ring.layers[0]!.pivotOffset.z).toBeCloseTo(-0.0403, 3);
    expect(distinctPivotCount(ring)).toBe(2);
  });

  it("halves the WC3 emission box: WC3 spawns across ±width/2 about the node", () => {
    // width 4 → radius 2 WC3 units → 2 × 0.02778 = 0.0556 world units. The
    // shipped extractor uses `width * scale` (0.111) — 2× too wide, which is
    // the disagreement this lane reported rather than silently matching.
    const doc = built.docs.find((d) => d.id === "fx.w3x.orb.divinering.p00")!;
    expect(doc.emitter.shape).toBe("cone");
    if (doc.emitter.shape === "cone") expect(doc.emitter.radius).toBeCloseTo(0.056, 3);
  });

  it("marks the orb ambient and the empty glb as the #98 evidence", () => {
    const ring = built.manifest.effects.find((e) => e.id === "fx.w3x.orb.divinering")!;
    expect(ring.ambient).toBe(true);
    expect(ring.attach).toBe("chest");
    expect(built.docs.find((d) => d.id === "fx.w3x.orb.divinering.p00")!.ambient).toBe(true);
    expect(ring.notes.join(" ")).toMatch(/1020 B with 0 triangles/);
  });

  it("records the true WC3 texture even though the sprite is a stand-in", () => {
    const ring = built.manifest.effects.find((e) => e.id === "fx.w3x.orb.divinering")!;
    expect(ring.layers[0]!.wc3Texture).toBe("Textures\\firering6.blp");
    expect(ring.layers[0]!.textureSubstituted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// the swarm layout
// ---------------------------------------------------------------------------

const A0IB = {
  countPerLevel: [7, 12, 17, 22],
  spawnIntervalSec: 0.05,
  radiusWc3: 600,
  radiusWorld: 11,
  durationSec: 74,
  memberScale: 0.6,
  memberTint: [1, 0, 0] as const,
  memberModel: "units\\creeps\\NetherDragon\\NetherDragon.mdl",
  memberModelPresent: false,
};

describe("swarm layout (A0IB 七夜怪談, base AUls)", () => {
  it("uses the map's own per-level counts", () => {
    expect(swarmCountForLevel(A0IB, 1)).toBe(7);
    expect(swarmCountForLevel(A0IB, 4)).toBe(22);
    expect(swarmCountForLevel(A0IB, 9)).toBe(22); // clamps, never undefined
  });

  it("places members on a ground-plane ring at the real radius, staggered by DataB", () => {
    const p = swarmRingPlacements(A0IB, 4);
    expect(p).toHaveLength(4);
    expect(p[0]).toEqual({ x: 11, y: 0, z: 0, delaySec: 0 });
    expect(p[1]!.x).toBeCloseTo(0, 6);
    expect(p[1]!.z).toBeCloseTo(11, 6);
    expect(p[1]!.y).toBe(0); // WC3 XY is the GROUND plane, not a vertical wheel
    expect(p[3]!.delaySec).toBeCloseTo(0.15, 6); // 3 × 0.05
  });
});

describe("familyEffectToSpec", () => {
  it("registers the swarm coverage", () => cover("w3x-family-swarm"));
  const doc = {
    id: "fx.w3x.locust.boomnl.p01",
    schema: "vfx@1" as const,
    emitter: { shape: "sphere" as const, radius: 1 },
    mode: "continuous" as const,
    rate: 100,
    lifetimeSec: { min: 1, max: 1 },
    size: { start: 1, end: 1 },
    color: {
      start: [1, 1, 1, 1] as [number, number, number, number],
      end: [1, 1, 1, 0] as [number, number, number, number],
    },
    blendMode: "additive" as const,
  };
  const docs = new Map([[doc.id, doc]]);

  const layoutOnly = {
    id: "fx.w3x.locust.auls-a0ib",
    family: "locust" as const,
    label: "66-03 七夜怪談",
    source: { model: "(none)", mdxBytes: 0, glbBytes: null, assetClass: "unit-swarm", geosets: 0, triangles: 0 },
    attach: "origin",
    ambient: false,
    durationSec: 74,
    layers: [],
    ribbonDocIds: [],
    swarm: A0IB,
    usedBy: [],
    supersedes: [],
    notes: [],
  };

  it("REFUSES to invent a member sprite for a layout-only swarm", () => {
    const r = familyEffectToSpec(layoutOnly, docs, { level: 4 });
    expect(r.spec).toBeNull();
    expect(r.problems.join(" ")).toMatch(/NetherDragon/);
    expect(r.problems.join(" ")).toMatch(/will not pick one for you/);
  });

  it("expands the ring once a stand-in is named, one doc id per member", () => {
    const r = familyEffectToSpec(layoutOnly, docs, { level: 4, memberDocId: doc.id });
    expect(r.spec).not.toBeNull();
    expect(r.spec!.emitters).toHaveLength(22);
    // distinct ids: the rig indexes runtime flags BY doc id, so 22 members
    // sharing one id would all collapse onto the same pivot.
    expect(new Set(r.spec!.emitters.map((e) => e.doc.id)).size).toBe(22);
    // and every member sits somewhere different on the ring
    expect(new Set(r.spec!.emitters.map((e) => JSON.stringify(e.runtime!.pivotOffset))).size).toBe(22);
    expect(r.spec!.attach).toBe("origin");
    expect(r.spec!.durationSec).toBe(74);
    expect(r.problems.join(" ")).toMatch(/STAND-IN/);
  });

  it("applies the reskin the map actually shipped: usca 0.6 and a red tint", () => {
    const r = familyEffectToSpec(layoutOnly, docs, { level: 1, memberDocId: doc.id });
    const m = r.spec!.emitters[0]!.doc;
    expect(m.size.start).toBeCloseTo(0.6, 6);
    expect(m.color.start).toEqual([1, 0, 0, 1]); // uclg 0, uclb 0 → pure red
    expect(r.spec!.emitters).toHaveLength(7); // level 1
  });

  it("reports missing docs instead of rendering a half-effect silently", () => {
    const effect = {
      ...layoutOnly,
      id: "fx.w3x.orb.x",
      family: "orb" as const,
      layers: [
        { docId: "nope", emitterIndex: 0, nodeName: "n", pivotOffset: { x: 0, y: 0, z: 0 }, wc3Texture: "", textureSubstituted: true, shape: { concurrency: 1, granularity: 1, coneAngleDeg: 0, swarmLike: false }, runtime: { modelSpace: false, xYQuad: false, lineEmitter: false, wantsHeadAndTail: false, priorityPlane: 0, trackFrameSec: 0.001 }, notes: [] },
      ],
      swarm: undefined as never,
    };
    delete (effect as { swarm?: unknown }).swarm;
    const r = familyEffectToSpec(effect, docs);
    expect(r.spec).toBeNull();
    expect(r.missingDocIds).toEqual(["nope"]);
  });
});

describe("tint / scale helpers", () => {
  const doc = {
    id: "d",
    schema: "vfx@1" as const,
    emitter: { shape: "point" as const },
    mode: "burst" as const,
    burstCount: 4,
    lifetimeSec: { min: 1, max: 1 },
    size: { start: 2, end: 0 },
    color: {
      start: [1, 0.5, 0.25, 1] as [number, number, number, number],
      end: [1, 1, 1, 0] as [number, number, number, number],
    },
    colorStops: [[0, [1, 0.5, 0.25, 1]] as [number, [number, number, number, number]]],
    sizeStops: [[0, 2] as [number, number]],
    blendMode: "additive" as const,
  };

  it("multiplies rgb and leaves alpha alone", () => {
    const t = tintVfxDoc(doc, [1, 0, 0]);
    expect(t.color.start).toEqual([1, 0, 0, 1]);
    expect(t.colorStops![0]![1]).toEqual([1, 0, 0, 1]);
    expect(t.color.end[3]).toBe(0); // alpha untouched
  });

  it("scales both the legacy size and the stops, and never hits zero start", () => {
    const s = scaleVfxDoc(doc, 0.6);
    expect(s.size.start).toBeCloseTo(1.2, 6);
    expect(s.sizeStops![0]![1]).toBeCloseTo(1.2, 6);
    expect(scaleVfxDoc(doc, 0).size.start).toBeGreaterThan(0);
  });
});
