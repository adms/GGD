/**
 * vfx-cast-pillar-wiring: the 0.6 s cast light pillar, driven through the REAL
 * VfxSystem by the REAL server event stream.
 *
 * This test exists because "the class works" has meant nothing five times in
 * this project (roundWins, the champion taunt, the #79 VFX re-point,
 * ENTITY_FLAG.CASTING, StatusAuraFx — every one of them had green unit tests
 * and did nothing in a match). So it drives the same `castBegin` /
 * `castEnd` / `castInterrupt` payloads `abilitySystem.ts` and
 * `CastResolveSystem.ts` emit, through `VfxSystem.handleEvent` — the exact call
 * GameApp makes for every drained event — and reads the pillar layer back out.
 *
 * It also registers abilities in the REAL `Abilities` registry, so the element
 * tint is resolved by the same lookup the running game uses.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { TICK_MS } from "@ggd/shared/constants";
import { Abilities, Projectiles } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ProjectileId } from "@ggd/shared/ids";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { elementStyle } from "../render/vfx/elements";
import { EXTINGUISH_MS, RELEASE_MS } from "./castPillar";
import { ENEMY_PALETTE, SELF_PALETTE } from "./telegraphChannel";
import { envFactor } from "../ui/displayFinal";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  // two real registry rows: an ICE ability bound by task #79 and an unbound
  // one still on the imported fire placeholder
  Abilities.register("test.ice.q" as AbilityId, {
    id: "test.ice.q" as AbilityId,
    name: "冰",
    slot: "Q",
    castType: "ground",
    maxRank: 4,
    cooldown: [10],
    manaCost: [10],
    range: 6,
    effects: [],
    vfxKey: "fx.prim.ice.nova",
    castTimeSec: 0.6,
  });
  Abilities.register("test.plain.w" as AbilityId, {
    id: "test.plain.w" as AbilityId,
    name: "無",
    slot: "W",
    castType: "ground",
    maxRank: 4,
    cooldown: [10],
    manaCost: [10],
    range: 6,
    effects: [],
    vfxKey: "fx.ember-bolt-cast",
    castTimeSec: 0.9,
  });
  // …and one row per remaining castType, because the #228 bug was precisely
  // that only `ground`/`targeted` ever reached the floor.
  Abilities.register("test.self.e" as AbilityId, {
    id: "test.self.e" as AbilityId,
    name: "自",
    slot: "E",
    castType: "self",
    maxRank: 4,
    cooldown: [10],
    manaCost: [10],
    range: 0,
    effects: [],
    castTimeSec: 0.5,
  });
  Projectiles.register("test.bolt" as ProjectileId, {
    id: "test.bolt" as ProjectileId,
    speed: 20,
    maxRange: 12,
    hitRadius: 0.5,
  });
  Abilities.register("test.shot.r" as AbilityId, {
    id: "test.shot.r" as AbilityId,
    name: "射",
    slot: "R",
    castType: "skillshot",
    maxRank: 4,
    cooldown: [10],
    manaCost: [10],
    range: 9,
    effects: [{ kind: "spawnProjectile", projectileId: "test.bolt" as ProjectileId, onHit: [] }],
    castTimeSec: 0.5,
  });
  Abilities.register("test.dash.ex" as AbilityId, {
    id: "test.dash.ex" as AbilityId,
    name: "衝",
    slot: "EX",
    castType: "dash",
    maxRank: 1,
    cooldown: [10],
    manaCost: [10],
    range: 5,
    effects: [{ kind: "dash", mode: "forward", speed: 20, maxDistance: 5 }],
    castTimeSec: 0.3,
  });
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const positions = new Map<number, { x: number; z: number }>();
afterEach(() => positions.clear());

function ctx(): VfxContext {
  return { entityPos: (id) => positions.get(id) ?? null };
}

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

/** exactly the payload packages/shared/src/sim/abilities/abilitySystem.ts emits */
function castBegin(caster: number, abilityId: string, castTimeSec: number): EventMessage {
  return ev("castBegin", {
    caster,
    slot: "Q",
    abilityId,
    ticks: Math.round(castTimeSec / (TICK_MS / 1000)),
    castTimeSec,
  });
}

describe("castBegin → a light pillar, for every champion on the field", () => {
  it("raises a column on the sim's own castBegin and clears it on castEnd", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(4, { x: 2, z: 2 });

    vfx.handleEvent(castBegin(4, "test.ice.q", 0.6), 1000);
    expect(vfx.castPillarFx.has(4)).toBe(true);
    expect(vfx.castPillarFx.phaseOf(4)).toBe("cast");

    vfx.update(1300);
    expect(vfx.castPillarFx.has(4)).toBe(true);

    vfx.handleEvent(ev("castEnd", { caster: 4, slot: "Q", abilityId: "test.ice.q" }), 1600);
    expect(vfx.castPillarFx.phaseOf(4)).toBe("release");
    vfx.update(1600 + RELEASE_MS + 1);
    expect(vfx.castPillarFx.has(4)).toBe(false);
    vfx.dispose();
  });

  it("fires for EVERY caster, not just one — three champions, three columns", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, ctx());
    for (const id of [11, 12, 13]) {
      positions.set(id, { x: id, z: 0 });
      vfx.handleEvent(castBegin(id, "test.ice.q", 0.6), 0);
    }
    expect(vfx.castPillarFx.activeCount).toBe(3);
    expect([11, 12, 13].every((id) => vfx.castPillarFx.has(id))).toBe(true);
    vfx.dispose();
  });

  it("castInterrupt extinguishes it — and so does dying mid-cast", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(4, { x: 0, z: 0 });
    positions.set(5, { x: 1, z: 0 });

    vfx.handleEvent(castBegin(4, "test.ice.q", 0.6), 0);
    vfx.handleEvent(ev("castInterrupt", { caster: 4, slot: "Q", abilityId: "test.ice.q" }), 200);
    expect(vfx.castPillarFx.phaseOf(4)).toBe("extinguish");
    vfx.update(200 + EXTINGUISH_MS + 1);
    expect(vfx.castPillarFx.has(4)).toBe(false);

    // a death with no castInterrupt behind it must not leave a burning column
    vfx.handleEvent(castBegin(5, "test.ice.q", 0.6), 300);
    vfx.handleEvent(ev("death", { id: 5 }), 400);
    expect(vfx.castPillarFx.phaseOf(5)).toBe("extinguish");
    vfx.dispose();
  });

  it("uses the tick count when castTimeSec is missing (the sim always sends both)", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(4, { x: 0, z: 0 });
    vfx.handleEvent(ev("castBegin", { caster: 4, slot: "Q", abilityId: "test.ice.q", ticks: 18 }), 0);
    expect(vfx.castPillarFx.has(4)).toBe(true);
    vfx.update(18 * TICK_MS - 20);
    expect(vfx.castPillarFx.has(4)).toBe(true); // ran the full 18 ticks
    vfx.dispose();
  });

  it("an INSTANT ability (no castBegin) raises no pillar — no window, no telegraph", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(4, { x: 0, z: 0 });
    // abilityCast fires for instants too; only castBegin means "there is a
    // window you can react in"
    vfx.handleEvent(ev("abilityCast", { caster: 4, slot: "Q", abilityId: "test.ice.q" }), 0);
    expect(vfx.castPillarFx.activeCount).toBe(0);
    // …and a castBegin with a zero window is refused rather than flickering
    vfx.handleEvent(ev("castBegin", { caster: 4, abilityId: "test.ice.q", ticks: 0, castTimeSec: 0 }), 0);
    expect(vfx.castPillarFx.activeCount).toBe(0);
    vfx.dispose();
  });
});

describe("the ground ring and the column agree about HOW LONG (task #228)", () => {
  /**
   * REGRESSION THIS LOCKS. The fill used to run on a wall clock inside
   * `Telegraph` (`age / fillMs`). That clock cannot see the sim: CastResolveSystem
   * PAUSES `ticksLeft` during hitstop and hitstun, so a locally-timed ring ran
   * ahead of the damage, and nothing ever cancelled it on `castInterrupt`. The
   * fill now comes from the same `CastTracker` fraction the overhead cast bar
   * draws, injected as `VfxContext.castProgress`.
   */
  it("fills off the CAST BAR's fraction, not a local clock — and pauses when it pauses", () => {
    cover("vfx-cast-pillar-wiring");
    let progress: number | null = 0;
    const vfx = new VfxSystem(scene, { ...ctx(), castProgress: () => progress });
    positions.set(4, { x: 0, z: 0 });
    vfx.handleEvent(
      ev("abilityCast", { caster: 4, slot: "Q", abilityId: "test.plain.w", point: { x: 5, z: 5 } }),
      0,
    );
    const tg = scene.meshes.find((m) => m.name === "telegraph-fill" && m.isEnabled())!;
    expect(tg).toBeTruthy();
    // `test.plain.w` is a `ground` cast with NO authored radius, so the honest
    // size is the SIM's own default (`def.radius ?? 1`) × abilityRange — never
    // the 1.2 the old VfxSystem invented, which matched nothing in the sim.
    const radius = 1 * envFactor("abilityRange");

    progress = 0.4;
    vfx.update(500);
    expect(tg.scaling.x).toBeCloseTo(2 * radius * 0.4, 3);

    // HITSTOP: the sim's wind-up does not advance, so neither may the ring —
    // even though 300 ms of wall clock went by.
    vfx.update(800);
    expect(tg.scaling.x).toBeCloseTo(2 * radius * 0.4, 3);

    progress = 0.95;
    vfx.update(900);
    expect(tg.scaling.x).toBeCloseTo(2 * radius * 0.95, 3);
    expect(vfx.telegraphs228.activeCount).toBe(1);
    vfx.dispose();
  });

  it("castInterrupt tears the ground shape down with NO resolve pop", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, { ...ctx(), castProgress: () => 0.8 });
    positions.set(4, { x: 0, z: 0 });
    const psBefore = scene.particleSystems.length;
    vfx.handleEvent(
      ev("abilityCast", { caster: 4, slot: "Q", abilityId: "test.plain.w", point: { x: 5, z: 5 } }),
      0,
    );
    vfx.update(400);
    expect(vfx.telegraphs228.activeCount).toBe(1);

    vfx.handleEvent(ev("castInterrupt", { caster: 4, slot: "Q" }), 500);
    expect(vfx.telegraphs228.activeCount).toBe(0);
    vfx.update(2000);
    // no ember/dust kick was ever fired: nothing landed, so nothing claimed to
    expect(scene.particleSystems.length).toBe(psBefore);
    expect(scene.meshes.filter((m) => m.name === "telegraph-fill" && m.isEnabled())).toHaveLength(0);
    vfx.dispose();
  });

  it("EVERY castType gets a shape — self, skillshot and dash used to get none", () => {
    cover("vfx-cast-pillar-wiring");
    const vfx = new VfxSystem(scene, { ...ctx(), castProgress: () => 0.5 });
    positions.set(21, { x: 0, z: 0 });
    positions.set(22, { x: 1, z: 0 });
    positions.set(23, { x: 2, z: 0 });

    vfx.handleEvent(ev("abilityCast", { caster: 21, slot: "Q", abilityId: "test.self.e" }), 0);
    vfx.handleEvent(
      ev("abilityCast", { caster: 22, slot: "Q", abilityId: "test.shot.r", direction: { x: 1, z: 0 } }),
      0,
    );
    vfx.handleEvent(
      ev("abilityCast", { caster: 23, slot: "Q", abilityId: "test.dash.ex", direction: { x: 0, z: 1 } }),
      0,
    );
    expect(vfx.telegraphs228.shapeOf(21)?.kind).toBe("self");
    expect(vfx.telegraphs228.shapeOf(22)?.kind).toBe("line");
    expect(vfx.telegraphs228.shapeOf(23)?.kind).toBe("line");
    vfx.dispose();
  });

  it("the incoming ENEMY channel is a different colour from your OWN cast", () => {
    cover("vfx-cast-pillar-wiring");
    let local: number | null = 4;
    const vfx = new VfxSystem(scene, {
      ...ctx(),
      localEntityId: () => local,
      teamOf: (id) => (id === 4 ? 0 : 1),
      castProgress: () => 0.5,
    });
    positions.set(4, { x: 0, z: 0 });
    positions.set(9, { x: 8, z: 0 });
    vfx.handleEvent(
      ev("abilityCast", { caster: 4, slot: "Q", abilityId: "test.plain.w", point: { x: 1, z: 1 } }),
      0,
    );
    vfx.handleEvent(
      ev("abilityCast", { caster: 9, slot: "Q", abilityId: "test.plain.w", point: { x: 7, z: 7 } }),
      0,
    );
    expect(vfx.telegraphs228.relationOf(4)).toBe("self");
    expect(vfx.telegraphs228.relationOf(9)).toBe("enemy");
    expect(SELF_PALETTE.ring).not.toEqual(ENEMY_PALETTE.ring);
    // …and the enemy channel does not share the #152 hold-preview's amber
    expect(ENEMY_PALETTE.ring).not.toEqual(SELF_PALETTE.ring);
    local = null;
    vfx.dispose();
  });
});

describe("the column takes its colour from the ability's own registry row", () => {
  it("an ICE ability erupts in ice, resolved through the real Abilities registry", () => {
    cover("vfx-cast-pillar-element");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(4, { x: 0, z: 0 });
    vfx.handleEvent(castBegin(4, "test.ice.q", 0.6), 0);
    const mat = scene.materials.find((m) => m.name === "cast-pillar-shell-mat");
    expect(mat).toBeTruthy();
    const ice = elementStyle("ice").color;
    const emissive = (mat as unknown as { emissiveColor: { r: number; g: number; b: number } })
      .emissiveColor;
    expect(emissive.r).toBeCloseTo(ice[0], 5);
    expect(emissive.g).toBeCloseTo(ice[1], 5);
    expect(emissive.b).toBeCloseTo(ice[2], 5);
    // blue-dominant: 依文潔琳's ice does NOT erupt in orange fire
    expect(emissive.b).toBeGreaterThan(emissive.r);
    vfx.dispose();
  });

  it("an ability with no doc still lights up — the FF7 gold fallback", () => {
    cover("vfx-cast-pillar-element");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(9, { x: 0, z: 0 });
    // no `vfxDoc` in this ctx, so the un-bound placeholder resolves no tint
    vfx.handleEvent(castBegin(9, "test.plain.w", 0.9), 0);
    const mat = scene.materials.find((m) => m.name === "cast-pillar-shell-mat");
    const emissive = (mat as unknown as { emissiveColor: { r: number; g: number; b: number } })
      .emissiveColor;
    expect(emissive.r).toBeGreaterThan(emissive.b); // warm gold
    expect(Math.max(emissive.r, emissive.g, emissive.b)).toBeGreaterThan(0.5);
    vfx.dispose();
  });

  it("an unknown abilityId is a lit pillar, never a crash or a black column", () => {
    cover("vfx-cast-pillar-element");
    const vfx = new VfxSystem(scene, ctx());
    positions.set(4, { x: 0, z: 0 });
    vfx.handleEvent(castBegin(4, "no.such.ability", 0.6), 0);
    expect(vfx.castPillarFx.has(4)).toBe(true);
    expect(vfx.castPillarFx.shellAlphaOf(4)).toBeGreaterThanOrEqual(0);
    vfx.dispose();
  });
});
