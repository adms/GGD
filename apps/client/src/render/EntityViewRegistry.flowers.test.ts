/**
 * Healing flowers (task #34, docs/todo/flowers.md): EntityState.kind 2
 * dispatches to a pooled FlowerView — never a ChampionView/ProjectileView —
 * with the instant green/pink voxel fallback, imperative transforms, hide-on-
 * dead, and pool reuse across respawns. Runs on Babylon's NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";

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

const flower = (id: number, x: number, z: number, alive = true): EntityViewState => ({
  id,
  kind: 2,
  seatId: -1, // neutral: no seat
  key: "prop.flower",
  teamId: -1,
  x,
  z,
  fx: 1,
  fz: 0,
  alive,
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

describe("EntityViewRegistry flower dispatch (flower-view-dispatch)", () => {
  it("kind 2 creates a FlowerView (not a champion/projectile view)", () => {
    cover("flower-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({
      entities: [flower(7, 12, -4)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false, // headless: never attempt the .glb fetch
    });

    expect(registry.flowerCount).toBe(1);
    expect(registry.championCount).toBe(0);
    expect(registry.projectileCount).toBe(0);
    expect(registry.getChampionView(7)).toBeUndefined();
    // transform written imperatively + posOf serves the vfx/anchor consumers
    expect(registry.posOf(7)).toEqual({ x: 12, z: -4 });
    registry.dispose();
  });

  it("renders the voxel fallback immediately (green base + pink bloom)", () => {
    cover("flower-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const before = scene.meshes.length;
    registry.sync({ entities: [flower(8, 0, 0)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    expect(scene.meshes.length - before).toBeGreaterThanOrEqual(2);
    registry.dispose();
  });

  it("a dead flower hides; a live one shows", () => {
    cover("flower-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({ entities: [flower(9, 1, 1)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    const enabledMeshes = (): number => scene.meshes.filter((m) => m.isEnabled()).length;
    const live = enabledMeshes();
    registry.sync({ entities: [flower(9, 1, 1, false)], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(enabledMeshes()).toBeLessThan(live);
    registry.sync({ entities: [flower(9, 1, 1, true)], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(enabledMeshes()).toBe(live);
    registry.dispose();
  });

  it("pools flower views across despawn/respawn (respawn cycle = no new meshes)", () => {
    cover("flower-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({ entities: [flower(20, 5, 5)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    const meshCount = scene.meshes.length;

    // death → despawn (returns to the pool); respawnSec later a NEW id spawns
    registry.sync({ entities: [], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(registry.flowerCount).toBe(0);
    expect(registry.posOf(20)).toBeNull();
    registry.sync({ entities: [flower(21, -5, 5)], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(registry.flowerCount).toBe(1);
    expect(scene.meshes.length).toBe(meshCount); // pooled: no new geometry
    expect(registry.posOf(21)).toEqual({ x: -5, z: 5 });
    registry.dispose();
  });

  it("flowers coexist with champions and projectiles in one sync", () => {
    cover("flower-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const champ: EntityViewState = { id: 1, kind: 0, seatId: 0, key: "champ.sela", teamId: 1, x: 0, z: 0, fx: 1, fz: 0, alive: true };
    const proj: EntityViewState = { id: 2, kind: 1, seatId: -1, key: "sela.q.bolt", teamId: 0, x: 1, z: 1, fx: 1, fz: 0, alive: true };
    registry.sync({ entities: [champ, proj, flower(3, 2, 2)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    expect(registry.championCount).toBe(1);
    expect(registry.projectileCount).toBe(1);
    expect(registry.flowerCount).toBe(1);
    registry.dispose();
  });
});
