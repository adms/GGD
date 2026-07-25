/**
 * Batch-1 visible-correctness wiring (1A-7 + 1B-3). These assert the CALLERS
 * the plan found were missing actually fire now — not the already-green
 * internal behaviour of the layers they drive:
 *
 *   · 1A-7  the `guardianHeirPulse` event (fanned out from the server, but
 *           previously hitting `default: break`) now draws a medium aura pop at
 *           the buff-bearer, so the 鎮守之力 enemies-only volley is no longer
 *           an invisible burst of damage;
 *   · 1B-3  the ability-cast ground telegraph now scales its radius by the live
 *           combat-env `abilityRange` factor (#136), so the ring lands where the
 *           sim resolves the AoE instead of over-drawing the raw authored value.
 *
 * Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId } from "@ggd/shared/ids";
import { impactComposerFor } from "./HitSpark";
import { VfxSystem } from "./VfxSystem";
import { setDisplayEnvJson } from "../ui/displayFinal";

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

afterEach(() => {
  setDisplayEnvJson(""); // reset the ambient env singleton to neutral defaults
});

const CTX = { entityPos: (): { x: number; z: number } => ({ x: 0, z: 0 }) };
const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

describe("1A-7 guardianHeirPulse draws an aura (heir-pulse-visible)", () => {
  it("fires a medium layered pop at the buff-bearer's position", () => {
    cover("guardian-heir-pulse-vfx");
    const vfx = new VfxSystem(scene, CTX);
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("guardianHeirPulse", { id: 5, x: 7, z: 9 }), 12_000);
    // BEFORE this fix the event hit `default: break` and drew nothing at all.
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]![0]).toBe("light"); // recurring aura grade, not a kill pop
    expect(fire.mock.calls[0]!.slice(1, 3)).toEqual([7, 9]); // at the bearer
    fire.mockRestore();
    vfx.dispose();
  });

  it("draws nothing for a non-finite / missing bearer position (#131 guard)", () => {
    cover("guardian-heir-pulse-vfx");
    const vfx = new VfxSystem(scene, CTX);
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("guardianHeirPulse", { id: 5 }), 12_000); // no x/z
    vfx.handleEvent(ev("guardianHeirPulse", { id: 5, x: NaN, z: 9 }), 12_050);
    expect(fire).not.toHaveBeenCalled();
    fire.mockRestore();
    vfx.dispose();
  });
});

describe("1B-3 ability-cast telegraph scales by abilityRange (telegraph-envscale)", () => {
  const RADIUS = 9.72;

  function registerAoe(id: string): void {
    const def: AbilityDef = {
      id: id as AbilityId,
      name: id,
      slot: "W",
      castType: "ground",
      maxRank: 1,
      cooldown: [1],
      manaCost: [0],
      range: 10,
      radius: RADIUS,
      castTimeSec: 1.0, // fillMs = 1000 → deterministic mid-fill scaling
      effects: [],
    };
    Abilities.register(id as AbilityId, def);
  }

  /** The live telegraph disc's WORLD diameter at the current fill fraction. */
  function fillDiameterAt(vfx: VfxSystem, id: string, ageMs: number): number {
    const before = scene.meshes.length;
    vfx.handleEvent(ev("abilityCast", { caster: 1, slot: "W", abilityId: id, point: { x: 4, z: 4 } }), 0);
    expect(scene.meshes.length).toBeGreaterThanOrEqual(before); // a telegraph spawned
    vfx.update(ageMs);
    const fill = scene.meshes.find((m) => m.name === "telegraph-fill") as Mesh | undefined;
    expect(fill).toBeTruthy();
    return fill!.scaling.x;
  }

  it("draws the POST-multiplier radius under a 0.6 abilityRange, not the raw value", () => {
    cover("telegraph-envscale");
    setDisplayEnvJson('{"abilityRange":0.6}');
    registerAoe("test.batch1.aoe-scaled");
    const vfx = new VfxSystem(scene, CTX);
    // mid-fill (t=0.5 of a 1000ms cast): diameter = radius*2*0.5 = radius.
    const d = fillDiameterAt(vfx, "test.batch1.aoe-scaled", 500);
    // scaled: 9.72 * 0.6 = 5.832 (NOT the unscaled 9.72 the ring used to draw)
    expect(d).toBeCloseTo(RADIUS * 0.6, 3);
    expect(d).toBeLessThan(RADIUS - 0.5); // definitively not the raw radius
    vfx.dispose();
  });

  it("is identity (unscaled) under a neutral 1.0 abilityRange", () => {
    cover("telegraph-envscale");
    setDisplayEnvJson(""); // neutral defaults — every factor 1.0
    registerAoe("test.batch1.aoe-neutral");
    const vfx = new VfxSystem(scene, CTX);
    const d = fillDiameterAt(vfx, "test.batch1.aoe-neutral", 500);
    expect(d).toBeCloseTo(RADIUS, 3);
    vfx.dispose();
  });
});
