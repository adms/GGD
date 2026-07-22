/**
 * client-06 (client-model-fallback): the EntityViewRegistry creates a
 * PROCEDURAL voxel view (boxes) immediately — with no .glb present anywhere —
 * writes transforms imperatively, and pools projectile views.
 * Runs on Babylon's NullEngine (headless).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { ChampionView } from "./views/ChampionView";
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

const champ = (id: number, x: number, z: number, alive = true): EntityViewState => ({
  id,
  kind: 0,
  seatId: 0,
  key: "champ.sela",
  teamId: 1,
  x,
  z,
  fx: 1,
  fz: 0,
  alive,
});

const proj = (id: number, x: number, z: number): EntityViewState => ({
  id,
  kind: 1,
  seatId: -1,
  key: "sela.q.bolt",
  teamId: 0,
  x,
  z,
  fx: 1,
  fz: 0,
  alive: true,
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

describe("EntityViewRegistry (client-06)", () => {
  it("creates a procedural voxel champion view without any .glb present", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({
      entities: [champ(1, -56, 0)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false, // headless: never even attempt a .glb fetch
    });

    expect(registry.championCount).toBe(1);
    const view = registry.getChampionView(1)!;
    // Minecraft-style figure: head + torso + 2 arms + 2 legs = 6 boxes
    const meshes = view.root.getChildMeshes(false);
    expect(meshes.length).toBeGreaterThanOrEqual(6);
    // transform was written imperatively
    expect(view.root.position.x).toBe(-56);
    expect(view.root.position.z).toBe(0);

    registry.dispose();
  });

  it("updates transforms in place and disposes removed entities", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({ entities: [champ(1, 0, 0)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    registry.sync({ entities: [champ(1, 3, -2)], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    const view = registry.getChampionView(1)!;
    expect(view.root.position.x).toBe(3);
    expect(view.root.position.z).toBe(-2);
    expect(registry.posOf(1)).toEqual({ x: 3, z: -2 });

    registry.sync({ entities: [], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(registry.championCount).toBe(0);
    expect(registry.getChampionView(1)).toBeUndefined();
    registry.dispose();
  });

  it("animation state flows from authoritative flags into the view", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    // moving between frames → run
    registry.sync({ entities: [champ(2, 0, 0)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    registry.sync({ entities: [champ(2, 0.5, 0)], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(registry.getChampionView(2)!.anim.state).toBe("run");
    // dead → death
    registry.sync({ entities: [champ(2, 0.5, 0, false)], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(registry.getChampionView(2)!.anim.state).toBe("death");
    registry.dispose();
  });

  it("combat-timing events drive pulse states with real durations", () => {
    cover("client-anim-clip-playback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const sync = (nowMs: number): void =>
      registry.sync({ entities: [champ(3, 0, 0)], poseFor: passthrough, nowMs, dtMs: 16, loadModels: false });
    sync(0);
    const view = registry.getChampionView(3)!;

    // castBegin holds the cast pose for its castTimeSec (2s), not just 450ms
    registry.handleEvent(
      { type: "castBegin", data: { caster: 3, castTimeSec: 2 } } as never,
      100,
    );
    sync(120);
    expect(view.anim.state).toBe("cast");
    sync(1900);
    expect(view.anim.state).toBe("cast"); // default window would have expired
    // castInterrupt ends it early
    registry.handleEvent({ type: "castInterrupt", data: { caster: 3 } } as never, 1950);
    sync(2000);
    expect(view.anim.state).toBe("idle");

    // attackWindup leads the swing: attack state spans ~2x the wind-up ticks
    registry.handleEvent({ type: "attackWindup", data: { source: 3, ticks: 10 } } as never, 3000);
    sync(3050);
    expect(view.anim.state).toBe("attack");
    registry.dispose();
  });

  it("a relocation is not read as locomotion (roster-10)", () => {
    cover("client-teleport-snap");
    // the run-clip rate is the 4th argument of ChampionView.update — spy on it
    const speeds: number[] = [];
    const spy = vi
      .spyOn(ChampionView.prototype, "update")
      .mockImplementation(function (this: ChampionView, _s, _n, _dt, speed) {
        speeds.push(speed ?? 0);
      });
    try {
      const registry = new EntityViewRegistry(scene, new AssetManager(scene));
      const sync = (e: EntityViewState, nowMs: number): void =>
        registry.sync({ entities: [e], poseFor: passthrough, nowMs, dtMs: 16, loadModels: false });

      sync(champ(4, 0, 0), 0);
      sync(champ(4, 0.2, 0), 16); // walking: 0.2 u / 16 ms = 12.5 u/s
      const walking = speeds[speeds.length - 1]!;
      expect(walking).toBeGreaterThan(0);

      // Respawn across the map. The pose seam SNAPS across it by design, so
      // this frame is a relocation, not a 5000 u/s sprint — feeding it to the
      // run-rate EMA would fire a phantom stride at ~100x normal speed.
      sync(champ(4, 80, 0), 32);
      expect(speeds[speeds.length - 1]!).toBeLessThan(walking * 2);
      expect(registry.posOf(4)).toEqual({ x: 80, z: 0 }); // position still snapped

      // normal movement resumes from the NEW position on the next frame
      sync(champ(4, 80.2, 0), 48);
      expect(speeds[speeds.length - 1]!).toBeGreaterThan(0);
      expect(speeds[speeds.length - 1]!).toBeLessThan(walking * 2);
      registry.dispose();
    } finally {
      spy.mockRestore();
    }
  });

  it("pools projectile views across spawn/despawn", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({ entities: [proj(100, 1, 1)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    expect(registry.projectileCount).toBe(1);
    const meshCount = scene.meshes.length;

    // despawn → returns to the pool; respawn under a NEW id reuses the mesh
    registry.sync({ entities: [], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(registry.projectileCount).toBe(0);
    registry.sync({ entities: [proj(101, 2, 2)], poseFor: passthrough, nowMs: 32, dtMs: 16, loadModels: false });
    expect(registry.projectileCount).toBe(1);
    expect(scene.meshes.length).toBe(meshCount); // no new sphere allocated
    registry.dispose();
  });
});
