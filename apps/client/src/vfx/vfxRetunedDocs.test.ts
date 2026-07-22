/**
 * vfx-retune-docs (task #33): the ability/projectile vfx docs are the CONTENT
 * half of the combat-vfx overhaul, so they get a content contract instead of
 * eyeballing. Every retuned doc must be an impact-first BURST (24–80), live
 * SHORT (≤0.9s), pop in large and shrink to nothing (sizeStops), ramp hot→cool
 * with a sharp-in / exponential-out alpha (4-stop colorStops) — and KEEP ITS
 * COLOR IDENTITY: the full-tint stop still matches the doc's legacy hue, so a
 * retune can never quietly repaint an ability. Real files from content/vfx are
 * parsed with the shipped zVfxDoc schema and pushed through the SAME factory
 * the game uses, so what the assertions check is what renders.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { toParticleSystem, capacityFor, colorStopsFor, sizeStopsFor } from "./particleFactory";
import { stopsAscending } from "./vfxPresets";

const VFX_DIR = fileURLToPath(new URL("../../../../content/vfx/", import.meta.url));

/** The ability-cast / projectile-hit / AoE docs retuned by task #33. */
const RETUNED = [
  "fx.ember-bolt-cast", // shared by dozens of ability casts (incl. EX)
  "fx.ember-bolt", // projectile hit
  "fx.thorn", // projectile hit
  "fx.thorn-lash",
  "fx.scorch-ring",
  "fx.firestorm", // R ultimate AoE
  "fx.cinder-ward",
  "fx.bramble-burst",
] as const;

function loadDoc(id: string): VfxDoc {
  const raw: unknown = JSON.parse(readFileSync(VFX_DIR + id + ".json", "utf8"));
  return zVfxDoc.parse(raw); // throws on any schema/refinement violation
}

/** Hue signature: rgb normalized by its brightest channel (alpha ignored). */
function hue(rgb: readonly [number, number, number, number]): [number, number, number] {
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
}

function hueDistance(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  const [ar, ag, ab] = hue(a);
  const [br, bg, bb] = hue(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
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

describe("retuned combat vfx docs (vfx-retune-docs)", () => {
  it.each(RETUNED)("%s is an impact-first burst with AAA ramps", (id) => {
    cover("vfx-retune-docs");
    const doc = loadDoc(id);
    expect(doc.id).toBe(id);

    // ---- impact-first: one BURST of 24–80, never a trickle ----
    expect(doc.mode).toBe("burst");
    expect(doc.burstCount).toBeGreaterThanOrEqual(24);
    expect(doc.burstCount).toBeLessThanOrEqual(80);
    // `rate` is inert on a burst system (Babylon latches manualEmitCount, see
    // particleFactory) — it must not creep back in as a fake "ember tail"
    expect(doc.rate).toBeUndefined();

    // ---- short lifetimes: impact 0.15–0.5s, nothing lingers as fog. The
    // ceiling mirrors VfxSystem.ONE_SHOT_MAX_LIFE_SEC, so playback never has
    // to clamp (and silently rewrite) what content authored. ----
    expect(doc.lifetimeSec.min).toBeGreaterThanOrEqual(0.1);
    expect(doc.lifetimeSec.min).toBeLessThanOrEqual(0.3);
    expect(doc.lifetimeSec.max).toBeLessThanOrEqual(0.6);

    // ---- size over life: pop in large, shrink to nothing ----
    const sizes = sizeStopsFor(doc);
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(stopsAscending(sizes)).toBe(true);
    const peak = sizes[1]!;
    expect(peak[0]).toBeLessThanOrEqual(0.2); // the pop lands in the first 20%
    expect(peak[1]).toBeGreaterThan(sizes[0]![1]); // …and overshoots the birth size
    expect(sizes[sizes.length - 1]![1]).toBe(0); // shrinks to nothing

    // ---- color over life: white-hot → tint → cooled → gone ----
    const colors = colorStopsFor(doc);
    expect(colors).toHaveLength(4);
    expect(stopsAscending(colors)).toBe(true);
    const [white, hot, cool, dead] = colors.map((c) => c[1]) as [
      [number, number, number, number],
      [number, number, number, number],
      [number, number, number, number],
      [number, number, number, number],
    ];
    // 1) hot core first: brighter AND less saturated than the tint — "white
    //    hot" for fire, "bright earth" for the dirt burst, never a repaint
    expect(Math.max(white[0], white[1], white[2])).toBeGreaterThanOrEqual(0.9);
    expect(white[0] + white[1] + white[2]).toBeGreaterThan(hot[0] + hot[1] + hot[2]);
    expect(Math.min(white[0], white[1], white[2])).toBeGreaterThan(
      Math.min(hot[0], hot[1], hot[2]),
    );
    // 2) COLOR IDENTITY: the full-tint stop keeps the doc's authored hue
    expect(hueDistance(hot, doc.color.start)).toBeLessThan(0.2);
    // 3) cools (darkens) into the tail, never brightens
    expect(cool[0] + cool[1] + cool[2]).toBeLessThan(hot[0] + hot[1] + hot[2]);
    // 4) alpha is sharp-in then falls monotonically to nothing
    expect(hot[3]).toBeGreaterThanOrEqual(0.85 * white[3]);
    expect(cool[3]).toBeLessThan(hot[3]);
    expect(dead[3]).toBe(0);
  });

  it("renders through the shipped factory: burst-only, gradients, gravity", () => {
    cover("vfx-retune-docs");
    for (const id of RETUNED) {
      const doc = loadDoc(id);
      const ps = toParticleSystem(doc, scene, { createTexture: () => null, name: id });
      // never a standing emitter, never an auto-stop that eats later bursts
      expect(ps.emitRate).toBe(0);
      expect(ps.targetStopDuration).toBeFalsy();
      expect(ps.getCapacity()).toBe(capacityFor(doc));
      expect(ps.getColorGradients()).toHaveLength(4);
      expect(ps.getSizeGradients()!.length).toBeGreaterThanOrEqual(3);
      expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_ONEONE); // all additive
      expect(ps.gravity.y).toBe(doc.gravityY ?? 0);
      expect(ps.minEmitPower).toBe(doc.speed!.min);
      expect(ps.maxEmitPower).toBe(doc.speed!.max);
      if (doc.stretched) {
        expect(ps.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
        expect(ps.minScaleY).toBe(doc.tailLength);
      }
      ps.dispose();
    }
  });

  it("differentiates AoE/EX casts from small projectile hits", () => {
    cover("vfx-retune-docs");
    const count = (id: string): number => loadDoc(id).burstCount!;
    // the R ultimate cone is the densest thing on screen…
    expect(count("fx.firestorm")).toBe(80);
    // …and carries the widest lifetime spread (min ≈ 0.3 × max, matching the
    // playback layer's TAIL_SPREAD): the long-lived minority IS the ember tail
    // a burst system cannot emit any other way
    const life = (id: string): { min: number; max: number } => loadDoc(id).lifetimeSec;
    const spread = (id: string): number => life(id).max / life(id).min;
    expect(spread("fx.firestorm")).toBeGreaterThan(spread("fx.ember-bolt-cast"));
    expect(life("fx.firestorm").min).toBeLessThanOrEqual(0.2); // still impact-first
    for (const id of RETUNED.filter((i) => i !== "fx.firestorm")) {
      expect(life("fx.firestorm").max).toBeGreaterThan(life(id).max); // longest embers
    }
    // …ability casts / ground AoEs sit above the projectile-hit pops
    expect(count("fx.ember-bolt-cast")).toBeGreaterThan(count("fx.thorn"));
    expect(count("fx.scorch-ring")).toBeGreaterThan(count("fx.thorn"));
    // the ultimate also owns the biggest particles (density per unit area)
    const peakSize = (id: string): number => sizeStopsFor(loadDoc(id))[1]![1];
    expect(peakSize("fx.firestorm")).toBeGreaterThan(peakSize("fx.ember-bolt-cast"));
    expect(peakSize("fx.ember-bolt")).toBeGreaterThan(peakSize("fx.thorn"));
  });
});
