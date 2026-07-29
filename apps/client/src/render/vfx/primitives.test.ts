/**
 * VFX-primitive library (task #123): every primitive is a PURE function → a
 * schema-valid vfx@1 doc that the SHIPPED particleFactory renders on a real
 * (headless) Babylon ParticleSystem, and its params (colour / scale / count)
 * are honoured. Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { zVfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "../../vfx/particleFactory";
import { PRIMITIVES, PRIMITIVE_KINDS, nova, beam, type PrimitiveKind } from "./primitives";

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

const COLD = [0.4, 0.75, 1] as const;

describe("primitive library: schema-valid, renderable, parameterised (ability-vfx-primitives)", () => {
  it("exposes the named WC3 archetypes plus bolt/dash/summon/slash/pulse/column/fall", () => {
    cover("ability-vfx-primitives");
    // `column` + `fall` (GH#230 L2) are the two silhouettes the w3x reference
    // census proved were MISSING: 97 references sit on a vertical pillar
    // (FlameStrike / Resurrect / TomeOfRetraining / Levelup / DarkPortal) and 51
    // on something arriving from above (MonsoonBolt / Starfall). Neither reads
    // as any of the 11 above — BEAM is horizontal, TORNADO is a wind cone.
    expect(new Set(PRIMITIVE_KINDS)).toEqual(
      new Set([
        "nova",
        "explosion",
        "shockwave",
        "tornado",
        "beam",
        "bolt",
        "dash",
        "swarm",
        "summon",
        "slash",
        "pulse",
        "column",
        "fall",
      ]),
    );
  });

  it("column climbs and fall descends — the two new silhouettes are opposites", () => {
    cover("ability-vfx-primitives");
    const col = PRIMITIVES.column({ id: "fx.test.column", color: COLD });
    const dn = PRIMITIVES.fall({ id: "fx.test.fall", color: COLD });
    expect(col.gravityY!).toBeGreaterThan(0);
    expect(dn.gravityY!).toBeLessThan(0);
    // and neither collapses into an existing shape: both are stretched, and the
    // column is a narrow cone while fall spawns in a volume overhead
    expect(col.emitter.shape).toBe("cone");
    expect(dn.emitter.shape).toBe("sphere");
  });

  it("bolt and dash are directed, stretched, travelling shapes (task #123 archetype cells)", () => {
    cover("ability-vfx-primitives");
    for (const kind of ["bolt", "dash"] as const) {
      const doc = PRIMITIVES[kind]({ id: `fx.test.${kind}`, color: COLD });
      expect(doc.stretched).toBe(true);
      expect(doc.emitter.shape).toBe("cone");
      expect(doc.tailLength!).toBeGreaterThan(1);
    }
  });

  it.each(PRIMITIVE_KINDS)("%s builds a schema-valid doc and renders on Babylon", (kind: PrimitiveKind) => {
    cover("ability-vfx-primitives");
    const doc = PRIMITIVES[kind]({ id: `fx.test.${kind}`, color: COLD });
    // parses the SHIPPED schema incl. all refinements (sorted stops, life, etc.)
    expect(() => zVfxDoc.parse(doc)).not.toThrow();
    expect(doc.mode).toBe("burst");
    expect(doc.burstCount).toBeGreaterThan(0);
    expect(Number.isInteger(doc.burstCount)).toBe(true);
    // renders on a real (headless) system — capacity, blend and gradients set
    const ps = toParticleSystem(doc, scene, { name: `t-${kind}` });
    expect(ps.getCapacity()).toBeGreaterThan(0);
    expect(ps.getColorGradients()!.length).toBe(doc.colorStops!.length);
    ps.dispose();
  });

  it("preserves COLOUR IDENTITY: the tint stop carries the element hue", () => {
    cover("ability-vfx-primitives");
    const doc = nova({ id: "fx.test.ice-nova", color: COLD });
    const tint = doc.colorStops![1]![1]; // stop 1 = the element tint
    expect(tint[2]).toBeGreaterThan(tint[0]); // blue dominant → reads cold, not fire
    // the core stop (t=0) is whiter (brighter red channel) than the tint stop
    expect(doc.colorStops![0]![1]![0]).toBeGreaterThan(tint[0]);
  });

  it("scale multiplies size + emitter radius; count overrides the burst (task #50 surface)", () => {
    cover("ability-vfx-primitives");
    const base = nova({ id: "fx.test.n1", color: COLD });
    const big = nova({ id: "fx.test.n2", color: COLD, scale: 2, count: 12 });
    const rBase = base.emitter.shape === "sphere" ? base.emitter.radius : 0;
    const rBig = big.emitter.shape === "sphere" ? big.emitter.radius : 0;
    expect(rBig).toBeCloseTo(rBase * 2, 5);
    expect(big.sizeStops![1]![1]).toBeCloseTo(base.sizeStops![1]![1] * 2, 3);
    expect(big.burstCount).toBe(12);
    expect(base.size.start).toBeGreaterThan(0); // schema requires size.start > 0
  });

  it("directed primitives (beam) are stretched billboards with a tail", () => {
    cover("ability-vfx-primitives");
    const doc = beam({ id: "fx.test.beam", color: COLD });
    expect(doc.stretched).toBe(true);
    expect(doc.tailLength!).toBeGreaterThan(1);
    expect(doc.emitter.shape).toBe("cone");
  });
});
