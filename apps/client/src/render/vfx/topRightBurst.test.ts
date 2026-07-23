/**
 * FIX #131 (ability-vfx wave) — the persistent bright-white particle burst
 * stuck in the top-right of the arena.
 *
 * ROOT CAUSE: `VfxSystem.handleEvent`'s `abilityCast` path guarded its caster
 * position with only `if (!pos) break` — but `entityPos` returns a truthy
 * `{x:NaN,z:NaN}` for a mid-spawn / un-interpolated champion. `play()` refuses
 * a non-finite emitter, but the EX-cast `layeredPop` (the brightest white-hot
 * additive composer core) did NOT, so an EX cast by a not-yet-posed champion
 * parked a persistent white burst at the GPU-clamped screen corner and re-fired
 * it every cast. The P1b guard hardened play()/posFromEvent/hitImpact but left
 * this cast-time composer path open.
 *
 * FIX: guard the single chokepoint (`layeredPop`) so no composer fire is ever
 * parked off-world, and tighten the abilityCast position check to isFinitePos.
 * Runs on NullEngine (headless).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

// QualityController's singleton touches localStorage at import — stub it (as
// the sibling vfx tests do) so the module graph loads under Node.
vi.mock("../QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId } from "@ggd/shared/ids";
import { VfxSystem } from "../../vfx/VfxSystem";
import { impactComposerFor } from "../../vfx/HitSpark";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
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
  });
  Abilities.register("burst131-ex" as AbilityId, mk("burst131-ex", "EX"));
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

describe("FIX #131 — no white-hot EX pop parked at a non-finite caster position (ability-vfx-131)", () => {
  it("an EX abilityCast whose caster position is NaN fires NO composer (nothing off-world)", () => {
    cover("ability-vfx-131");
    const vfx = new VfxSystem(scene, { entityPos: (): { x: number; z: number } => ({ x: NaN, z: 0 }) });
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("abilityCast", { abilityId: "burst131-ex", caster: 1 }), 1000);
    expect(fire).not.toHaveBeenCalled();
    fire.mockRestore();
    vfx.dispose();
  });

  it("an EX abilityCast at a FINITE caster position still fires the ex pop (the effect is not lost)", () => {
    cover("ability-vfx-131");
    const vfx = new VfxSystem(scene, { entityPos: (): { x: number; z: number } => ({ x: 2, z: 3 }) });
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("abilityCast", { abilityId: "burst131-ex", caster: 1 }), 2000);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]![0]).toBe("ex");
    fire.mockRestore();
    vfx.dispose();
  });

  it("Infinity is rejected the same way (belt-and-braces on the composer chokepoint)", () => {
    cover("ability-vfx-131");
    const vfx = new VfxSystem(scene, { entityPos: (): { x: number; z: number } => ({ x: 0, z: Infinity }) });
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("abilityCast", { abilityId: "burst131-ex", caster: 1 }), 3000);
    expect(fire).not.toHaveBeenCalled();
    fire.mockRestore();
    vfx.dispose();
  });
});
