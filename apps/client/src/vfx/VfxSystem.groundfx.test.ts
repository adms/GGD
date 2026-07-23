/**
 * vfx-shadow / vfx-walk-dust / vfx-cast-decal (task #147): the ground-follow
 * combat-juice the playtest flagged as missing, at the EVENT/frame layer of
 * VfxSystem — driven from the live bodies `frameBus.champions` exposes, reading
 * FRESH rendered positions via `ctx.entityPos`, without touching ChampionView.
 *
 *   · a blob shadow tracks every live body and drops when it dies/despawns;
 *   · walking dust fires only when a champion actually MOVES (stride-gated),
 *     never while standing still;
 *   · an ability cast stamps a fading ground scorch where it lands.
 * Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { frameBus, type ChampionAnchor } from "../frameBus";

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

/** frameBus is a module singleton — start every test with an empty field. */
beforeEach(() => frameBus.champions.clear());
afterEach(() => frameBus.champions.clear());

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

/** live rendered positions the ctx reads back (mutated between frames). */
const positions = new Map<number, { x: number; z: number }>();

function ctx(): VfxContext {
  return { entityPos: (id) => positions.get(id) ?? null };
}

function anchor(id: number, over: Partial<ChampionAnchor> = {}): ChampionAnchor {
  return {
    entityId: id,
    name: `#${id}`,
    teamId: 0,
    championId: "",
    isLocal: false,
    alive: true,
    hpPct: 1,
    shieldPct: 0,
    manaPct: 1,
    worldX: 0,
    worldZ: 0,
    pose: { sx: 0, sy: 0, visible: true },
    cast: null,
    ...over,
  };
}

/** Put a live body on the field at a position the ctx will report. */
function place(id: number, x: number, z: number, over: Partial<ChampionAnchor> = {}): void {
  frameBus.champions.set(id, anchor(id, over));
  positions.set(id, { x, z });
}

describe("blob shadows follow every live body (vfx-shadow)", () => {
  it("draws one shadow per live body and drops it on death/despawn", () => {
    cover("vfx-shadow");
    const vfx = new VfxSystem(scene, ctx());
    place(1, 3, -2);
    place(2, -4, 5, { teamId: -1 }); // a flower (neutral)
    vfx.update(1000);
    expect(vfx.shadowLayer.activeCount).toBe(2);
    expect(vfx.shadowLayer.positionOf(1)).toEqual({ x: 3, z: -2 });

    // body 1 dies — its shadow drops, the flower keeps its
    frameBus.champions.get(1)!.alive = false;
    vfx.update(1016);
    expect(vfx.shadowLayer.activeCount).toBe(1);
    expect(vfx.shadowLayer.positionOf(1)).toBeNull();

    // body 1 despawns entirely — nothing changes for the flower
    frameBus.champions.delete(1);
    positions.delete(1);
    vfx.update(1032);
    expect(vfx.shadowLayer.activeCount).toBe(1);
    vfx.dispose();
  });
});

describe("walking dust is velocity-gated (vfx-walk-dust)", () => {
  it("stays silent while standing still, fires once the body strides", () => {
    cover("vfx-walk-dust");
    const vfx = new VfxSystem(scene, ctx());
    place(1, 0, 0);
    // frame 1: baseline only, no puff
    vfx.update(0);
    expect(vfx.feedbackFx.countFor("walkdust")).toBe(0);
    // frame 2: hasn't moved → still silent
    vfx.update(200);
    expect(vfx.feedbackFx.countFor("walkdust")).toBe(0);

    // now it strides > WALK_STRIDE and enough time has passed → one puff
    positions.set(1, { x: 0.7, z: 0 });
    vfx.update(400);
    expect(vfx.feedbackFx.countFor("walkdust")).toBe(1);
    vfx.dispose();
  });

  it("does NOT kick dust on a teleport/respawn jump", () => {
    cover("vfx-walk-dust");
    const vfx = new VfxSystem(scene, ctx());
    place(1, 0, 0);
    vfx.update(0);
    // a big instantaneous jump (respawn) must re-baseline, not emit
    positions.set(1, { x: 20, z: 20 });
    vfx.update(200);
    expect(vfx.feedbackFx.countFor("walkdust")).toBe(0);
    vfx.dispose();
  });
});

describe("ability casts scar the ground (vfx-cast-decal)", () => {
  it("stamps a fading scorch decal at the cast/land point", () => {
    cover("vfx-cast-decal");
    const vfx = new VfxSystem(scene, ctx());
    place(1, 2, 2);
    expect(vfx.castDecalCount).toBe(0);
    vfx.handleEvent(ev("abilityCast", { caster: 1, abilityId: "unknown", point: { x: 6, z: -1 } }), 500);
    expect(vfx.castDecalCount).toBe(1);
    vfx.dispose();
  });

  it("falls back to the caster position when the ability targets no ground point", () => {
    cover("vfx-cast-decal");
    const vfx = new VfxSystem(scene, ctx());
    place(1, 2, 2);
    vfx.handleEvent(ev("abilityCast", { caster: 1, abilityId: "unknown" }), 500);
    expect(vfx.castDecalCount).toBe(1);
    vfx.dispose();
  });
});
