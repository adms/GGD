/**
 * vfx-impact-first (task #33): VfxSystem one-shot playback is IMPACT-FIRST.
 *   · a `continuous` doc played as a one-shot becomes ONE front-loaded burst
 *     carrying the authored density (capped), with a wide lifetime spread as
 *     its ember tail — never the old flat 650ms trickle;
 *   · every one-shot's particle lifetime is clamped to the impact band, so
 *     imported 1–6s WC3 docs stop lingering as fog;
 *   · deaths / heal pickups / EX casts LAYER the pooled composer kit
 *     (flash + sparks + smoke [+ ground shockwave]) on the same frame as the
 *     doc, tinted per event (or from the doc's own color identity).
 * The flower lifecycle docs this layer fires (fx.barkskin heal burst /
 * fx.root-snare dirt kick) get a content contract here too — they are read
 * from content/vfx and parsed with the shipped schema. Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time (Node
// exposes a non-functional localStorage global) — stub the live params
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId } from "@ggd/shared/ids";
import { impactComposerFor } from "./HitSpark";
import { colorStopsFor, sizeStopsFor } from "./particleFactory";
import { stopsAscending } from "./vfxPresets";
import {
  VfxSystem,
  clampOneShotLife,
  frontLoadDoc,
  tintOfDoc,
  EX_BURST_BOOST,
  FLOWER_BURST_VFX,
  FLOWER_SPAWN_VFX,
  MAX_FRONT_LOAD_BURST,
  ONE_SHOT_MAX_LIFE_SEC,
  TAIL_SPREAD,
} from "./VfxSystem";

const VFX_DIR = fileURLToPath(new URL("../../../../content/vfx/", import.meta.url));

function loadDoc(id: string): VfxDoc {
  const raw: unknown = JSON.parse(readFileSync(VFX_DIR + id + ".json", "utf8"));
  return zVfxDoc.parse(raw); // throws on any schema/refinement violation
}

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

/** A typical WC3-imported one-shot: a continuous stream with a long life. */
const streamDoc = (over: Partial<VfxDoc> = {}): VfxDoc => ({
  id: `godie-test-${Math.random().toString(36).slice(2)}`,
  schema: "vfx@1",
  emitter: { shape: "sphere", radius: 0.4 },
  mode: "continuous",
  rate: 40,
  lifetimeSec: { min: 1, max: 1 },
  size: { start: 0.06, end: 0.14 },
  color: { start: [0.3, 0.6, 1, 1], end: [0.05, 0.1, 0.2, 0] },
  blendMode: "additive",
  ...over,
});

const CTX = { entityPos: (): { x: number; z: number } => ({ x: 3, z: 4 }) };
const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

describe("one-shot lifetime clamp (vfx-impact-first)", () => {
  it("leaves an already-punchy lifetime untouched (identity)", () => {
    cover("vfx-impact-first");
    const life = { min: 0.15, max: 0.45 };
    expect(clampOneShotLife(life)).toBe(life);
  });

  it("clamps imported 1–6s tails into the impact band", () => {
    cover("vfx-impact-first");
    for (const max of [1, 2, 6]) {
      const clamped = clampOneShotLife({ min: max * 0.5, max });
      expect(clamped.max).toBe(ONE_SHOT_MAX_LIFE_SEC);
      expect(clamped.min).toBeLessThanOrEqual(clamped.max);
      expect(clamped.min).toBeGreaterThan(0);
    }
  });
});

describe("continuous → front-loaded burst + tail (vfx-impact-first)", () => {
  it("converts a trickle into a burst carrying the AUTHORED density", () => {
    cover("vfx-impact-first");
    // 40/s × 1s avg life = 40 concurrent particles authored → ALL at t=0
    const shaped = frontLoadDoc(streamDoc());
    expect(shaped.mode).toBe("burst");
    expect(shaped.burstCount).toBe(40);
    expect(shaped.rate).toBeUndefined(); // the stream rate can't come back
    expect(shaped.lifetimeSec.max).toBe(ONE_SHOT_MAX_LIFE_SEC);
    // the ember tail IS the spread: most particles die well before the last
    expect(shaped.lifetimeSec.min).toBeCloseTo(ONE_SHOT_MAX_LIFE_SEC * TAIL_SPREAD, 6);
  });

  it("keeps the burst inside the readable band", () => {
    cover("vfx-impact-first");
    const shaped = frontLoadDoc(streamDoc({ rate: 1000, lifetimeSec: { min: 4, max: 6 } }));
    expect(shaped.burstCount).toBe(MAX_FRONT_LOAD_BURST);
    // a whisper-thin authored stream still emits at least one particle
    expect(frontLoadDoc(streamDoc({ rate: 0.9 })).burstCount).toBeGreaterThanOrEqual(1);
  });

  it("leaves an authored burst doc's counts alone (clamps only its tail)", () => {
    cover("vfx-impact-first");
    const punchy = streamDoc({
      mode: "burst",
      burstCount: 24,
      rate: undefined,
      lifetimeSec: { min: 0.2, max: 0.5 },
    });
    expect(frontLoadDoc(punchy)).toBe(punchy); // nothing to retune
    const longTail = streamDoc({
      mode: "burst",
      burstCount: 24,
      rate: undefined,
      lifetimeSec: { min: 0.3, max: 3 },
    });
    const shaped = frontLoadDoc(longTail);
    expect(shaped.burstCount).toBe(24);
    expect(shaped.lifetimeSec.max).toBe(ONE_SHOT_MAX_LIFE_SEC);
  });
});

describe("play() fires the front-loaded burst (vfx-impact-first)", () => {
  it("emits the whole burst on the impact frame — nothing trickles", () => {
    cover("vfx-impact-first");
    const vfx = new VfxSystem(scene, CTX);
    const ps = vfx.play(streamDoc(), 1, 2, 1000)!;
    expect(ps).not.toBeNull();
    expect(ps.manualEmitCount).toBe(40); // ALL of it, this frame
    expect(ps.emitRate).toBe(0); // a burst system NEVER rate-emits
    expect(ps.maxLifeTime).toBe(ONE_SHOT_MAX_LIFE_SEC); // no lingering fog
    expect(ps.minLifeTime).toBeLessThan(ps.maxLifeTime); // spread = the tail
    vfx.dispose();
  });

  it("EX casts scale the same doc's burst up", () => {
    cover("vfx-impact-first");
    const vfx = new VfxSystem(scene, CTX);
    const doc = streamDoc();
    const ps = vfx.play(doc, 0, 0, 1000, 1, EX_BURST_BOOST)!;
    expect(ps.manualEmitCount).toBe(Math.round(40 * EX_BURST_BOOST));
    vfx.dispose();
  });

  it("a re-fired instance is restarted so its new burst can emit", () => {
    cover("vfx-impact-first");
    const vfx = new VfxSystem(scene, CTX);
    const doc = streamDoc();
    const ps = vfx.play(doc, 0, 0, 1000)!;
    ps.manualEmitCount = 0; // consumed by a rendered frame
    ps.stop(); // …and stopped by anything (a stopped system swallows bursts)
    const again = vfx.play(doc, 9, 9, 5000)!;
    expect(again).toBe(ps); // idle → reused, not grown
    expect(again.manualEmitCount).toBe(40);
    expect(again.isStarted()).toBe(true);
    vfx.dispose();
  });
});

describe("doc color identity drives the layered pop tint (vfx-impact-first)", () => {
  it("normalizes + quantizes the doc's own first color key", () => {
    cover("vfx-impact-first");
    // an icy doc stays icy (blue-dominant), never re-tinted to fire
    const icy = tintOfDoc(streamDoc({ color: { start: [0.15, 0.3, 0.5, 1], end: [0, 0, 0, 0] } }));
    expect(icy[2]).toBe(1);
    expect(icy[2]).toBeGreaterThan(icy[0]);
    // quantized onto a coarse grid → the composer's pooled keys stay bounded
    for (const c of icy) expect(Math.round(c * 4)).toBeCloseTo(c * 4, 6);
    // multi-stop docs take the FIRST stop (the birth color)
    const hot = tintOfDoc(
      streamDoc({
        colorStops: [
          [0, [1, 0.5, 0.1, 1]],
          [1, [0, 0, 0, 0]],
        ],
      }),
    );
    expect(hot[0]).toBe(1);
    // a near-black key has no usable hue → warm default, never a black flash
    const dead = tintOfDoc(streamDoc({ color: { start: [0, 0, 0, 1], end: [0, 0, 0, 0] } }));
    expect(Math.max(...dead)).toBe(1);
  });
});

describe("layered event hooks (vfx-impact-first)", () => {
  const named = (name: string): ParticleSystem | undefined =>
    scene.particleSystems.find((p) => p.name === name) as ParticleSystem | undefined;

  it("death fires the EX-grade pop AND the ash plume on the same frame", () => {
    cover("vfx-impact-first");
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    const vfx = new VfxSystem(scene, CTX);
    vfx.handleEvent(ev("death", { id: 7 }), 10_000);
    // layer 1–4: white-hot core + ember streaks + smoke body + shockwave ring
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]![0]).toBe("ex");
    expect(fire.mock.calls[0]!.slice(1, 3)).toEqual([3, 4]); // at the corpse
    // layer 5: the ash plume doc — punchy (≤0.55s), all at once, sparse tail
    const plume = named("vfx-fx.builtin-death-smoke")!;
    expect(plume).toBeDefined();
    expect(plume.maxLifeTime).toBeLessThanOrEqual(0.55);
    expect(plume.manualEmitCount).toBe(26);
    expect(plume.minLifeTime).toBeLessThan(plume.maxLifeTime * 0.5);
    fire.mockRestore();
    vfx.dispose();
  });

  it("heal pickup layers a green pop + ground shockwave under the mote burst", () => {
    cover("vfx-impact-first");
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    const heal = streamDoc({
      id: "fx.barkskin",
      mode: "burst",
      burstCount: 34,
      rate: undefined,
      lifetimeSec: { min: 0.14, max: 0.5 },
    });
    const vfx = new VfxSystem(scene, { entityPos: () => null, vfxDoc: () => heal });
    vfx.handleEvent(ev("flowerBurst", { id: 3, x: 5, z: 6 }), 20_000);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]![0]).toBe("heavy"); // heavy ⇒ ground shockwave
    const tint = fire.mock.calls[0]![4]!.tint as readonly [number, number, number];
    expect(tint[1]).toBeGreaterThan(tint[0]); // stays GREEN, not re-tinted
    expect(tint[1]).toBeGreaterThan(tint[2]);
    expect(named("vfx-fx.barkskin")!.manualEmitCount).toBe(34);
    fire.mockRestore();
    vfx.dispose();
  });

  it("EX ability casts layer the max pop; non-EX casts stay doc-only", () => {
    cover("vfx-impact-first");
    const doc = streamDoc({ id: "fx.test-ex-cast" });
    const mk = (id: string, slot: AbilityDef["slot"]): AbilityDef => ({
      id: id as AbilityId,
      name: id,
      slot,
      castType: "self",
      maxRank: 1,
      cooldown: [1],
      manaCost: [0],
      range: 0,
      effects: [],
      vfxKey: doc.id,
    });
    Abilities.register("test-ex" as AbilityId, mk("test-ex", "EX"));
    Abilities.register("test-q" as AbilityId, mk("test-q", "Q"));
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    const vfx = new VfxSystem(scene, { entityPos: () => ({ x: 0, z: 0 }), vfxDoc: () => doc });

    const beforeQ = scene.particleSystems.length;
    vfx.handleEvent(ev("abilityCast", { abilityId: "test-q", caster: 1 }), 30_000);
    expect(fire).not.toHaveBeenCalled(); // a Q is just its doc
    expect(scene.particleSystems.length).toBe(beforeQ + 1);
    const psQ = scene.particleSystems[scene.particleSystems.length - 1] as ParticleSystem;
    const qBurst = psQ.manualEmitCount;

    vfx.handleEvent(ev("abilityCast", { abilityId: "test-ex", caster: 1 }), 30_100);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]![0]).toBe("ex");
    // the doc's own burst scales up too (a second pooled instance: #1 is busy)
    const psEx = scene.particleSystems[scene.particleSystems.length - 1] as ParticleSystem;
    expect(psEx).not.toBe(psQ);
    expect(psEx.manualEmitCount).toBe(Math.round(qBurst * EX_BURST_BOOST));
    fire.mockRestore();
    vfx.dispose();
  });
});

describe("flower lifecycle docs are impact-first + GREEN (vfx-impact-first)", () => {
  it.each([FLOWER_BURST_VFX, FLOWER_SPAWN_VFX])("%s pops and shrinks to nothing", (id) => {
    cover("vfx-impact-first");
    const doc = loadDoc(id);

    // one burst in the readable band — playback never has to convert these
    expect(doc.mode).toBe("burst");
    expect(doc.burstCount!).toBeGreaterThanOrEqual(24);
    expect(doc.burstCount!).toBeLessThanOrEqual(MAX_FRONT_LOAD_BURST);
    expect(doc.rate).toBeUndefined();

    // short, with the spread that carries the tail — never clamped at play time
    expect(doc.lifetimeSec.max).toBeLessThanOrEqual(ONE_SHOT_MAX_LIFE_SEC);
    expect(doc.lifetimeSec.min).toBeLessThanOrEqual(doc.lifetimeSec.max * 0.4);
    expect(frontLoadDoc(doc)).toBe(doc);

    // size: pop in large inside the first 20%, then shrink to NOTHING
    const sizes = sizeStopsFor(doc);
    expect(stopsAscending(sizes)).toBe(true);
    expect(sizes[1]![0]).toBeLessThanOrEqual(0.2);
    expect(sizes[1]![1]).toBeGreaterThan(sizes[0]![1] * 2);
    expect(sizes[sizes.length - 1]![1]).toBe(0);

    // color: bright core → full tint → cooled → gone, alpha sharp-in/out
    const colors = colorStopsFor(doc);
    expect(colors).toHaveLength(4);
    expect(stopsAscending(colors)).toBe(true);
    const [core, tint, cool, dead] = colors.map((c) => c[1]);
    expect(Math.max(...core!)).toBeGreaterThanOrEqual(0.9);
    expect(core![0] + core![1] + core![2]).toBeGreaterThan(tint![0] + tint![1] + tint![2]);
    expect(cool![0] + cool![1] + cool![2]).toBeLessThan(tint![0] + tint![1] + tint![2]);
    expect(tint![3]).toBeGreaterThanOrEqual(0.85 * core![3]);
    expect(cool![3]).toBeLessThan(tint![3]);
    expect(dead![3]).toBe(0);

    // COLOR IDENTITY: green stays dominant in every stop (heal / sprout read),
    // and the legacy 2-stop `color` still names the doc's own tint
    for (const [, rgba] of colors.slice(0, 3)) {
      expect(rgba[1]).toBeGreaterThanOrEqual(rgba[0]);
      expect(rgba[1]).toBeGreaterThan(rgba[2]);
    }
    expect(doc.color.start.slice(0, 3)).toEqual(tint!.slice(0, 3));
  });

  it("gives each flower cue its own motion: heal rises, sprout kicks dirt", () => {
    cover("vfx-impact-first");
    const heal = loadDoc(FLOWER_BURST_VFX);
    const sprout = loadDoc(FLOWER_SPAWN_VFX);
    expect(heal.gravityY!).toBeGreaterThan(0); // motes float UP off the pickup
    expect(heal.blendMode).toBe("additive"); // …and glow (bright green core)
    expect(sprout.gravityY!).toBeLessThan(0); // dirt is kicked up and falls
    expect(sprout.blendMode).toBe("alpha"); // …opaque clods, not glow
    for (const doc of [heal, sprout]) expect(doc.speed!.max).toBeGreaterThan(doc.speed!.min);
  });
});
