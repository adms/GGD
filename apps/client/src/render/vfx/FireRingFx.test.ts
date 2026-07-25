/**
 * The fire ring's world band (task #195) — 「圈圈外會有激烈火焰」.
 *
 * The Babylon half needs a GPU-less null engine, so what is locked here is the
 * DECISION LAYER: how many emitters the budget buys, how the band's alpha
 * tracks the shrink, and the three structural promises that would otherwise
 * fail silently — no `W3xEmitterRig` (its 12 s cap would put a 20 s band out
 * two thirds of the way through), no glb-node anchoring (#131), and a budget
 * re-read every tick rather than snapshotted at construction.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FLAME_DOC_IDS,
  MAX_FLAME_EMITTERS,
  MIN_FLAME_EMITTERS,
  bandAlphaForProgress,
  flameEmitterCount,
} from "./FireRingFx";

const RAW = readFileSync(join(__dirname, "FireRingFx.ts"), "utf8");
/** comments stripped, so PROSE about a banned symbol does not count as using it */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("fire-ring band budget + look (firering-shrink)", () => {
  it("stands 8..12 emitters on the rim, scaling with the particle budget", () => {
    cover("firering-shrink");
    expect(flameEmitterCount(1)).toBe(MAX_FLAME_EMITTERS);
    expect(flameEmitterCount(0)).toBe(MIN_FLAME_EMITTERS);
    // the adaptive ladder's floor (0.3) still buys a readable wall of fire
    expect(flameEmitterCount(0.3)).toBeGreaterThanOrEqual(MIN_FLAME_EMITTERS);
    expect(flameEmitterCount(0.3)).toBeLessThan(MAX_FLAME_EMITTERS);
    // garbage in never produces a blank ring
    expect(flameEmitterCount(Number.NaN)).toBe(MAX_FLAME_EMITTERS);
    expect(flameEmitterCount(-5)).toBe(MIN_FLAME_EMITTERS);
    expect(flameEmitterCount(99)).toBe(MAX_FLAME_EMITTERS);
  });

  it("uses the four real WC3 flame/smoke layers", () => {
    cover("firering-shrink");
    expect(FLAME_DOC_IDS).toHaveLength(4);
    for (const id of FLAME_DOC_IDS) expect(id).toMatch(/^fx\.w3x\.particle\.flamessmoke\.p0\d$/);
  });

  it("the band gets angrier as the ring closes, and never fades out of sight", () => {
    cover("firering-shrink");
    const a = bandAlphaForProgress(0);
    const b = bandAlphaForProgress(0.5);
    const c = bandAlphaForProgress(1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // it is a navigational signal: always clearly visible
    expect(a).toBeGreaterThan(0.5);
    expect(c).toBeLessThanOrEqual(1);
    expect(bandAlphaForProgress(Number.NaN)).toBe(a);
    expect(bandAlphaForProgress(9)).toBe(c); // clamped
  });
});

describe("fire-ring band structural promises (firering-shrink)", () => {
  it("does NOT route through W3xEmitterRig (its 12 s cap would kill a 20 s band)", () => {
    cover("firering-shrink");
    expect(SRC).not.toMatch(/W3xEmitterRig/);
    expect(SRC).not.toMatch(/DEFAULT_MAX_EFFECT_SEC/);
  });

  it("anchors emitters to a WORLD position, never to a glb node (#131)", () => {
    cover("firering-shrink");
    // a Vector3 emitter, set from the zone's own numbers each frame
    expect(SRC).toMatch(/ps\.emitter = new Vector3\(0, 0, 0\)/);
    // a TransformNode emitter is exactly the #131 stranded-blob shape
    expect(SRC).not.toMatch(/emitter\s*=\s*rootNode/);
    expect(SRC).not.toMatch(/findBoneNode/);
  });

  it("re-reads the particle budget EVERY tick, not once at construction", () => {
    cover("firering-shrink");
    // `this.getScale()` must appear inside tick(), because the adaptive ladder
    // drops density to 0.3 exactly while the ring is burning.
    const tick = SRC.slice(SRC.indexOf("tick(nowMs"), SRC.indexOf("hide(): void"));
    expect(tick).toMatch(/this\.getScale\(\)/);
  });

  it("draws nothing for a zone the local player is not in (bye round / spectator)", () => {
    cover("firering-shrink");
    // `zone: null` is an explicit, documented state — not a fall-through to
    // zone 0, which would light a fire around somebody else's duel.
    expect(SRC).toMatch(/zone: \{ x: number; z: number; r: number \} \| null/);
    expect(SRC).toMatch(/frame\?\.zone \?\? null/);
  });
});
