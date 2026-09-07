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
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import {
  EntityViewRegistry,
  applyModelOverride,
  relativeScaleOf,
  type EntityViewState,
} from "./EntityViewRegistry";
import { ChampionView, TARGET_HEIGHT } from "./views/ChampionView";
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

describe("EntityViewRegistry attacker flash (juice-attacker-flash, task #69)", () => {
  const spawnTwo = (registry: EntityViewRegistry): void =>
    registry.sync({
      entities: [champ(20, 0, 0), champ(21, 2, 0)], // 20 = attacker, 21 = victim
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });

  it("a basicAttack flashes the ATTACKER (source) view, not only the victim", () => {
    cover("juice-attacker-flash");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    spawnTwo(registry);
    const source = registry.getChampionView(20)!;
    const spy = vi.spyOn(source, "flash");

    registry.handleEvent({ type: "basicAttack", data: { source: 20, target: 21 } } as never, 100);

    // the melee swing now pops the attacker (the fix); before #69 it flashed no one
    expect(spy).toHaveBeenCalledTimes(1);
    registry.dispose();
  });

  it("a landed hit (hitImpact) flashes BOTH the victim (red) and the attacker (source)", () => {
    cover("juice-attacker-flash");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    spawnTwo(registry);
    const source = registry.getChampionView(20)!;
    const target = registry.getChampionView(21)!;
    const sFlash = vi.spyOn(source, "flash");
    const tFlash = vi.spyOn(target, "flash");

    registry.handleEvent(
      {
        type: "hitImpact",
        data: {
          source: 20,
          target: 21,
          dmgType: "physical",
          profile: {
            tier: "medium",
            hitstopTicks: 3,
            hitstunTicks: 5,
            knockbackDir: { x: 1, z: 0 },
            knockbackMag: 0,
            isEX: false,
            isBlock: false,
          },
        },
      } as never,
      100,
    );

    expect(sFlash).toHaveBeenCalled(); // attacker: the "I connected" pop
    expect(tFlash).toHaveBeenCalled(); // victim: the red flash preserved
    registry.dispose();
  });
});

describe("EntityViewRegistry authoritative hitstop (juice-hitstop)", () => {
  const spawnTwo = (registry: EntityViewRegistry): void =>
    registry.sync({
      entities: [champ(20, 0, 0), champ(21, 2, 0)], // 20 = attacker, 21 = victim
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });

  const hitImpact = (over: Record<string, unknown>): never =>
    ({
      type: "hitImpact",
      data: {
        source: 20,
        target: 21,
        dmgType: "physical",
        profile: {
          tier: "medium",
          hitstopTicks: 3,
          hitstunTicks: 5,
          knockbackDir: { x: 1, z: 0 },
          knockbackMag: 0,
          isEX: false,
          isBlock: false,
          ...over,
        },
      },
    }) as never;

  it("freezes BOTH fighters off the sim's hitstopTicks (not the damage amount)", () => {
    cover("juice-hitstop");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    spawnTwo(registry);
    const sHit = vi.spyOn(registry.getChampionView(20)!, "setHitstop");
    const tHit = vi.spyOn(registry.getChampionView(21)!, "setHitstop");

    registry.handleEvent(hitImpact({ hitstopTicks: 4 }), 100);

    // both get the SAME freeze window, taken verbatim from the profile ticks
    expect(sHit).toHaveBeenCalledTimes(1);
    expect(tHit).toHaveBeenCalledTimes(1);
    expect(tHit.mock.calls[0]![0]).toBe(sHit.mock.calls[0]![0]);
    expect(tHit.mock.calls[0]![0]).toBeGreaterThan(0);
    registry.dispose();
  });

  it("a FULLY-BLOCKED hit still freezes both bodies (impact-driven, dmg-agnostic)", () => {
    cover("juice-hitstop");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    spawnTwo(registry);
    const tHit = vi.spyOn(registry.getChampionView(21)!, "setHitstop");

    // blocked heavy hit: dmg would be 0, but the sim froze (hitstopTicks > 0)
    registry.handleEvent(hitImpact({ isBlock: true, hitstopTicks: 5 }), 100);
    expect(tHit).toHaveBeenCalledTimes(1);
    expect(tHit.mock.calls[0]![0]).toBeGreaterThan(0); // still freezes despite dmg 0
    registry.dispose();
  });

  it("a chip hit the sim did NOT freeze (hitstopTicks 0) leaves the animation running", () => {
    cover("juice-hitstop");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    spawnTwo(registry);
    const tHit = vi.spyOn(registry.getChampionView(21)!, "setHitstop");

    registry.handleEvent(hitImpact({ tier: "light", hitstopTicks: 0 }), 100);
    // setHitstop is still called, but with 0 → ChampionView.setHitstop no-ops
    expect(tHit).toHaveBeenCalledWith(0, 100);
    registry.dispose();
  });

  it("ignores a malformed hitImpact with no profile (older replay) without throwing", () => {
    cover("juice-hitstop");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    spawnTwo(registry);
    const tHit = vi.spyOn(registry.getChampionView(21)!, "setHitstop");
    expect(() =>
      registry.handleEvent({ type: "hitImpact", data: { source: 20, target: 21 } } as never, 100),
    ).not.toThrow();
    expect(tHit).not.toHaveBeenCalled();
    registry.dispose();
  });
});

describe("stand-in model/scale override (client-standin-override, task #77)", () => {
  const BASE_DOC: ModelDoc = {
    id: "champ.sela",
    schema: "model@1",
    glbPath: "assets/models/champions/blocky-mage.glb",
    scale: 0.77, // the SHARED stand-in size — wrong for a small champion
    collisionRadius: 0.6,
    clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
  } as ModelDoc;

  it("applyModelOverride: null override is a pass-through; scale/glb/clipMap win", () => {
    cover("client-standin-override");
    expect(applyModelOverride(BASE_DOC, null)).toBe(BASE_DOC);
    expect(applyModelOverride(null, { scale: 0.6 })).toBeNull();
    const scaled = applyModelOverride(BASE_DOC, { scale: 0.6 })!;
    expect(scaled.scale).toBe(0.6); // a swapped model's own declared scale is preserved
    expect(scaled.glbPath).toBe(BASE_DOC.glbPath); // untouched fields kept
    expect(BASE_DOC.scale).toBe(0.77); // pure — the base doc is not mutated
    // a non-positive scale is ignored (never lets a bad override zero a champion)
    expect(applyModelOverride(BASE_DOC, { scale: 0 })!.scale).toBe(0.77);
  });

  it("relativeScaleOf: the #150 size multiplier, defaulting to 1.0", () => {
    cover("client-standin-override");
    cover("client-standin-relative-scale");
    expect(relativeScaleOf(null)).toBe(1);
    expect(relativeScaleOf(undefined)).toBe(1);
    expect(relativeScaleOf({})).toBe(1);
    expect(relativeScaleOf({ relativeScale: 0.65 })).toBe(0.65); // small creature
    expect(relativeScaleOf({ relativeScale: 1.55 })).toBe(1.55); // giant
    expect(relativeScaleOf({ relativeScale: 0 })).toBe(1); // non-positive ignored
    // a legacy override carrying only an absolute `scale` is treated as normal-
    // sized — an old absolute scale is never mistaken for a relative multiplier.
    expect(relativeScaleOf({ scale: 0.6 })).toBe(1);
  });

  it("the registry renders a champion at its OVERRIDE relativeScale, smaller than the normalized default", async () => {
    // stand-in mesh containers the AssetManager 'loads' — a fresh one per champion
    const makeContainer = (): AssetContainer => {
      const container = new AssetContainer(scene);
      const mesh = MeshBuilder.CreateBox("kaykit-body", { size: 1 }, scene);
      container.meshes.push(mesh);
      container.rootNodes.push(mesh);
      const g = new AnimationGroup("Idle", scene);
      const a = new Animation("Idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
      a.setKeys([{ frame: 0, value: 0 }, { frame: 1, value: 0 }]);
      g.addTargetedAnimation(a, mesh);
      container.animationGroups.push(g);
      container.removeAllFromScene();
      return container;
    };

    const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
    const registry = new EntityViewRegistry(scene, assets, {
      modelDocFor: () => BASE_DOC,
      // GameApp resolves championId→override from content/models/_standin-overrides.json;
      // here 小叮噹/哆啦A夢 (godie-n00b, entity 900) declares its intentional small
      // size 0.65; entity 901 is a normal champion (no override).
      modelOverrideFor: (e) => (e.id === 900 ? { relativeScale: 0.65 } : null),
    });

    registry.sync({
      entities: [champ(900, 0, 0), champ(901, 4, 0)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
    });
    await Promise.resolve();
    await Promise.resolve();
    // BASE_DOC's body is a unit box (native height 1) → normalization factor is
    // TARGET_HEIGHT; the normal champion renders at exactly that, the override one
    // at TARGET_HEIGHT × 0.65 — DELIBERATELY smaller, not the shared default size.
    const normal = registry.getChampionView(901)!.declaredScale!;
    const small = registry.getChampionView(900)!.declaredScale!;
    expect(normal).toBeCloseTo(TARGET_HEIGHT, 5);
    expect(small).toBeCloseTo(TARGET_HEIGHT * 0.65, 5);
    expect(small).toBeLessThan(normal * 0.75);
    registry.dispose();
  });
});

/**
 * revive-dissolve-wiring (playtest directive #220): the registry ARMS the corpse
 * dissolve off the sim's `death` EVENT and gates it on this frame's revive
 * circles, joined BY SEAT. The reported symptom — a body that lies on the ground
 * forever — is exactly "the registry never handled `death`".
 */
describe("EntityViewRegistry corpse dissolve wiring (#220)", () => {
  const deadAtSeat = (id: number, seatId: number): EntityViewState => ({
    ...champ(id, 0, 0, false),
    seatId,
  });
  const circleForSeat = (id: number, seatId: number): EntityViewState => ({
    id,
    kind: 3,
    seatId, // the wire carries the DEAD OWNER's seat here — the only join key
    key: "prop.revive-circle",
    teamId: 1,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    alive: true,
    revive: { progress: 0.2, radius: 2, channelling: true, contested: false },
  });
  const step = (
    registry: EntityViewRegistry,
    entities: EntityViewState[],
    nowMs: number,
    reviveSeats?: ReadonlySet<number>,
  ): void => {
    registry.sync({ entities, poseFor: passthrough, nowMs, dtMs: 33, loadModels: false, reviveSeats });
  };

  it("a `death` event arms the dissolve; the body is gone after 3 s + the rise", () => {
    cover("revive-dissolve-wiring");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    step(registry, [champ(31, 0, 0)], 0);
    registry.handleEvent({ type: "death", data: { id: 31, killer: 32 } } as never, 1000);
    const view = registry.getChampionView(31)!;
    expect(view.deathElapsedMs(1000)).toBe(0); // armed by the event

    step(registry, [deadAtSeat(31, 0)], 3500); // 2.5 s in — still lying
    expect(view.vanished).toBe(false);
    expect(view.root.position.y).toBe(0);
    step(registry, [deadAtSeat(31, 0)], 9000); // well past lie + rise
    expect(view.vanished).toBe(true);
    registry.dispose();
  });

  it("dead WITHOUT a death event never dissolves (bye/parked seat, intermission)", () => {
    cover("revive-dissolve-wiring");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    for (let t = 0; t <= 20000; t += 500) step(registry, [deadAtSeat(41, 1)], t);
    const view = registry.getChampionView(41)!;
    expect(view.deathElapsedMs(20000)).toBeNull();
    expect(view.vanished).toBe(false);
    registry.dispose();
  });

  it("a circle on the OWNER'S SEAT exempts that corpse — and only that one", () => {
    cover("revive-dissolve-wiring");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    // seat 2 died and got a circle; seat 3 died with the team charge already
    // spent, so it gets NO circle and must dissolve normally.
    step(registry, [champ(51, 0, 0), champ(52, 2, 0)], 0);
    registry.handleEvent({ type: "death", data: { id: 51 } } as never, 0);
    registry.handleEvent({ type: "death", data: { id: 52 } } as never, 0);
    const rescued = registry.getChampionView(51)!;
    const doomed = registry.getChampionView(52)!;

    const world = [deadAtSeat(51, 2), deadAtSeat(52, 3), circleForSeat(900, 2)];
    for (let t = 0; t <= 12000; t += 250) step(registry, world, t, new Set([2]));
    expect(rescued.vanished).toBe(false); // the channel anchor stayed put
    expect(rescued.root.position.y).toBe(0);
    expect(doomed.vanished).toBe(true); // no circle for seat 3 → normal dissolve

    // the rescue is spent → the circle leaves the snapshot → the corpse dissolves
    for (let t = 12250; t <= 20000; t += 250) {
      step(registry, [deadAtSeat(51, 2), deadAtSeat(52, 3)], t, new Set<number>());
    }
    expect(rescued.vanished).toBe(true);
    registry.dispose();
  });

  it("a non-champion kind's seatId -1 cannot match a corpse's exemption", () => {
    cover("revive-dissolve-wiring");
    // projectiles/coins encode seatId -1 on the wire; a -1 in the set (which the
    // collector guards against) must never exempt a real corpse.
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    step(registry, [champ(61, 0, 0)], 0);
    registry.handleEvent({ type: "death", data: { id: 61 } } as never, 0);
    const view = registry.getChampionView(61)!;
    const corpse: EntityViewState = { ...champ(61, 0, 0, false), seatId: -1 };
    for (let t = 0; t <= 9000; t += 250) step(registry, [corpse], t, new Set([-1]));
    expect(view.vanished).toBe(true);
    registry.dispose();
  });
});
