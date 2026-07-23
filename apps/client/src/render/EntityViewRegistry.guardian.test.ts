/**
 * Neutral duel-zone GUARDIAN (task #89/#105): EntityState.kind 4 dispatches to a
 * pooled GuardianView — never a ChampionView (the old kind-0 fall-through that
 * rendered a grey untinted humanoid). The procedural monolith renders instantly
 * as a distinct objective, it is NEVER team-tinted, hides on death, and pools
 * across despawn/respawn. Runs on Babylon's NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

const guardian = (id: number, x: number, z: number, alive = true, key = "prop.guardian.beast"): EntityViewState => ({
  id,
  kind: 4,
  seatId: -1, // neutral: no seat
  key,
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

describe("EntityViewRegistry guardian dispatch (guardian-view-dispatch)", () => {
  it("kind 4 creates a GuardianView, not a champion/projectile/flower view", () => {
    cover("guardian-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({
      entities: [guardian(7, -40, 0)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false, // headless: never attempt the .glb fetch
    });
    expect(registry.guardianCount).toBe(1);
    expect(registry.championCount).toBe(0);
    expect(registry.flowerCount).toBe(0);
    expect(registry.getChampionView(7)).toBeUndefined();
    expect(registry.posOf(7)).toEqual({ x: -40, z: 0 });
    registry.dispose();
  });

  it("renders the procedural monolith immediately (a distinct objective, not a humanoid)", () => {
    cover("guardian-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const before = scene.meshes.length;
    registry.sync({ entities: [guardian(8, 0, 0)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    // base drum + column + crown cap + ground ring
    expect(scene.meshes.length - before).toBeGreaterThanOrEqual(4);
    registry.dispose();
  });

  it("never asks for a champion tint (neutrality: no team colour is ever applied)", () => {
    cover("guardian-view-dispatch");
    const championTintFor = vi.fn(() => null);
    const registry = new EntityViewRegistry(scene, new AssetManager(scene), { championTintFor });
    registry.sync({ entities: [guardian(30, 2, 2)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    expect(championTintFor).not.toHaveBeenCalled();
    registry.dispose();
  });

  it("a dead guardian hides; a live one shows", () => {
    cover("guardian-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({ entities: [guardian(9, 1, 1)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    const enabledMeshes = (): number => scene.meshes.filter((m) => m.isEnabled()).length;
    const live = enabledMeshes();
    registry.sync({ entities: [guardian(9, 1, 1, false)], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(enabledMeshes()).toBeLessThan(live);
    registry.sync({ entities: [guardian(9, 1, 1, true)], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(enabledMeshes()).toBe(live);
    registry.dispose();
  });

  it("pools guardian views across despawn/respawn (round-to-round = no new meshes)", () => {
    cover("guardian-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({ entities: [guardian(20, 5, 5)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    const meshCount = scene.meshes.length;
    registry.sync({ entities: [], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(registry.guardianCount).toBe(0);
    expect(registry.posOf(20)).toBeNull();
    registry.sync({ entities: [guardian(21, -5, 5)], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(registry.guardianCount).toBe(1);
    expect(scene.meshes.length).toBe(meshCount); // pooled: no new geometry
    registry.dispose();
  });
});
