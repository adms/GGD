/**
 * vfx-blood-spray / vfx-feedback-gaps (task #39) at the EVENT layer: what the
 * VfxSystem actually does with the MSG.EVENT fanout.
 *
 *   · a landed hit fires the 濺血 spray ON TOP OF task #33's impact kit —
 *     layered on the same frame, never replacing it;
 *   · the spray is aimed by the attacker→victim vector taken from the two
 *     RENDERED positions;
 *   · a BLOCKED hit gets the steel clink instead, and never bleeds;
 *   · the gore style (global + per-champion via the optional ctx hook)
 *     decides whether anything sprays at all;
 *   · `projectileSpawn` flashes the cast origin down the owner's last aim, and
 *     `knockdown` / `death` kick floor dust — three moments that previously
 *     had no visual whatsoever.
 * Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { applyGoreDoc, resetGoreConfig, setGoreOverride } from "./goreConfig";
import { burstDirection } from "./vfxPresets";

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

beforeEach(() => {
  resetGoreConfig();
});

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

/** attacker id 1 at the origin, victim id 2 five units along +x. */
const POSITIONS: Record<number, { x: number; z: number }> = {
  1: { x: 0, z: 0 },
  2: { x: 5, z: 0 },
};

function ctx(over: Partial<VfxContext> = {}): VfxContext {
  return {
    entityPos: (id) => POSITIONS[id] ?? null,
    ...over,
  };
}

/** Live droplet systems of the blood layer (pooled, so identity is stable). */
function dropletSystem(vfx: VfxSystem, key = "blood/light/physical/droplets"): number {
  return vfx.bloodFx.countFor(key);
}

describe("landed hit sprays along the damage vector (vfx-blood-spray)", () => {
  it("LAYERS the spray on top of the impact kit, never instead of it", () => {
    cover("vfx-blood-spray");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical" }), 100);
    // task #33's kit still fired (a HitSpark handle is live)…
    const before = scene.particleSystems.length;
    expect(before).toBeGreaterThan(0);
    // …AND the blood layer allocated its own pooled droplet system
    expect(dropletSystem(vfx)).toBe(1);
    vfx.dispose();
  });

  it("aims the cone from attacker → victim in rendered space", () => {
    cover("vfx-blood-spray");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical" }), 100);
    const ps = scene.particleSystems.find((p) => p.name.includes("blood/light/physical/droplets"));
    expect(ps).toBeDefined();
    const aim = burstDirection(ps as never)!;
    // victim is at +x of the attacker → the spray continues along +x
    expect((aim.d1[0] + aim.d2[0]) / 2).toBeCloseTo(1, 6);
    expect((aim.d1[2] + aim.d2[2]) / 2).toBeCloseTo(0, 6);
    vfx.dispose();
  });

  it("crits spray the crit-grade recipe", () => {
    cover("vfx-blood-spray");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(
      ev("hitImpact", { source: 1, target: 2, amount: 20, dmgType: "physical", crit: true }),
      100,
    );
    expect(vfx.bloodFx.countFor("blood/crit/physical/droplets")).toBe(1);
    expect(vfx.bloodFx.countFor("blood/light/physical/droplets")).toBe(0);
    vfx.dispose();
  });

  it("leaves a ground pool for a blood-style hit", () => {
    cover("vfx-blood-decal");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 80, dmgType: "physical" }), 100);
    expect(vfx.bloodFx.decalCount).toBe(1);
    // …and it is gone again well after its life
    vfx.update(100 + 5000);
    expect(vfx.bloodFx.decalCount).toBe(0);
    vfx.dispose();
  });
});

describe("gore style gates the spray (vfx-gore-style)", () => {
  it("`off` emits NOTHING while the impact kit still reads", () => {
    cover("vfx-gore-style");
    setGoreOverride({ style: "off" });
    const vfx = new VfxSystem(scene, ctx());
    const before = scene.particleSystems.length;
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical" }), 100);
    expect(dropletSystem(vfx)).toBe(0);
    expect(vfx.bloodFx.decalCount).toBe(0);
    // the hit still produced feedback (task #33's pooled kit)
    expect(scene.particleSystems.length).toBeGreaterThan(before);
    vfx.dispose();
  });

  it("`stylized` sprays energy and leaves no pool", () => {
    cover("vfx-gore-style");
    setGoreOverride({ style: "stylized" });
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "magic" }), 100);
    expect(vfx.bloodFx.countFor("stylized/light/magic/droplets")).toBe(1);
    expect(vfx.bloodFx.decalCount).toBe(0);
    vfx.dispose();
  });

  it("a per-champion override narrows the VICTIM's spray", () => {
    cover("vfx-gore-style");
    applyGoreDoc({
      id: "gore",
      schema: "config.gore@1",
      style: "blood",
      intensity: 0.85,
      championStyles: { "godie-hlgr": "stylized" }, // 鋼彈 is a machine
    });
    const vfx = new VfxSystem(scene, ctx({ championIdOf: (id) => (id === 2 ? "godie-hlgr" : null) }));
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical" }), 100);
    expect(vfx.bloodFx.countFor("stylized/light/physical/droplets")).toBe(1);
    expect(vfx.bloodFx.countFor("blood/light/physical/droplets")).toBe(0);
    expect(vfx.bloodFx.decalCount).toBe(0); // machines do not pool blood
    vfx.dispose();
  });

  it("without the optional championIdOf hook every champion uses the global style", () => {
    cover("vfx-gore-style");
    const vfx = new VfxSystem(scene, ctx()); // no championIdOf
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical" }), 100);
    expect(dropletSystem(vfx)).toBe(1);
    vfx.dispose();
  });
});

describe("blocked hits (vfx-feedback-gaps)", () => {
  it("clink instead of blood — a guard never bleeds", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(
      ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical", blocked: true }),
      100,
    );
    expect(dropletSystem(vfx)).toBe(0);
    expect(vfx.bloodFx.decalCount).toBe(0);
    expect(vfx.feedbackFx.countFor("block/0.75/sparks")).toBe(1);
    vfx.dispose();
  });

  it("fans the block sparks BACK at the attacker", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(
      ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical", blocked: true }),
      100,
    );
    const ps = scene.particleSystems.find((p) => p.name.includes("block/0.75/sparks"));
    const aim = burstDirection(ps as never)!;
    // the hit travelled +x, so the rebound fans -x
    expect((aim.d1[0] + aim.d2[0]) / 2).toBeCloseTo(-1, 6);
    vfx.dispose();
  });
});

describe("muzzle flash + floor dust (vfx-feedback-gaps)", () => {
  it("`projectileSpawn` flashes the cast origin down the owner's last aim", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    // the basic attack commits the aim (attacker 1 shooting victim 2 at +x)
    vfx.handleEvent(ev("basicAttack", { source: 1, target: 2, ranged: true }), 100);
    vfx.handleEvent(ev("projectileSpawn", { id: 9, owner: 1, projectileId: "proj.test" }), 101);
    const ps = scene.particleSystems.find((p) => p.name.includes("muzzle/physical"));
    expect(ps).toBeDefined();
    expect((ps!.emitter as Vector3).x).toBeCloseTo(0, 6); // at the OWNER, not the target
    const streaks = scene.particleSystems.find((p) => p.name.includes("muzzle/physical/1/streaks"));
    const aim = burstDirection(streaks as never)!;
    expect((aim.d1[0] + aim.d2[0]) / 2).toBeCloseTo(1, 6);
    vfx.dispose();
  });

  it("an ability's own direction also commits the aim", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("abilityCast", { caster: 1, abilityId: "x", direction: { x: 0, z: -3 } }), 100);
    vfx.handleEvent(ev("projectileSpawn", { id: 9, owner: 1, projectileId: "proj.test" }), 101);
    const streaks = scene.particleSystems.find((p) => p.name.includes("muzzle/physical/1/streaks"));
    const aim = burstDirection(streaks as never)!;
    expect((aim.d1[2] + aim.d2[2]) / 2).toBeCloseTo(-1, 6); // normalized
    vfx.dispose();
  });

  it("`knockdown` kicks floor dust at the impact point", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("knockdown", { target: 2, source: 1, x: 5, z: 0, ticks: 14 }), 100);
    expect(vfx.feedbackFx.countFor("dust/1/puff")).toBe(1);
    vfx.dispose();
  });

  it("`death` kicks dust under the corpse", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("death", { id: 2, killer: 1 }), 100);
    expect(vfx.feedbackFx.countFor("dust/0.75/puff")).toBe(1);
    vfx.dispose();
  });

  it("a dead entity's aim memory is dropped", () => {
    cover("vfx-feedback-gaps");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("basicAttack", { source: 1, target: 2, ranged: true }), 100);
    vfx.handleEvent(ev("death", { id: 1, killer: 2 }), 101);
    vfx.handleEvent(ev("projectileSpawn", { id: 9, owner: 1, projectileId: "proj.test" }), 102);
    const streaks = scene.particleSystems.find((p) => p.name.includes("muzzle/physical/1/streaks"));
    const aim = burstDirection(streaks as never)!;
    // back to the fixed fallback (+z), not the stale +x aim
    expect((aim.d1[2] + aim.d2[2]) / 2).toBeCloseTo(1, 6);
    vfx.dispose();
  });
});

describe("teardown (vfx-blood-spray)", () => {
  it("dispose() releases the blood + feedback layers", () => {
    cover("vfx-blood-spray");
    const vfx = new VfxSystem(scene, ctx());
    vfx.handleEvent(ev("hitImpact", { source: 1, target: 2, amount: 30, dmgType: "physical" }), 100);
    vfx.handleEvent(ev("knockdown", { target: 2, source: 1, x: 5, z: 0 }), 100);
    expect(dropletSystem(vfx)).toBe(1);
    vfx.dispose();
    expect(dropletSystem(vfx)).toBe(0);
    expect(vfx.feedbackFx.countFor("dust/1/puff")).toBe(0);
    expect(vfx.bloodFx.decalCount).toBe(0);
  });
});
