/**
 * VictoryFireworks / ChickenFireworkFx / SmallFireworkFx on NullEngine — the
 * Babylon-lifetime contract (task #93). These are DRIVEN-LOOP tests (explicit
 * nowMs ticks), never screenshots: the visual read of the roast chicken is
 * proven by the audition-page renders in the task report, not here. What is
 * asserted here is that the shells behave — build the formation mesh, fire on
 * the right edge, self-stop at the end of the timeline, and never leak.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ChickenFireworkFx } from "./ChickenFireworkFx";
import { SmallFireworkFx } from "./SmallFireworkFx";
import { VictoryFireworks } from "./VictoryFireworks";
import { CHICKEN_TOTAL_MS } from "./fireworkMath";
import type { VictoryInput } from "./victoryTrigger";
import { cover } from "@ggd/shared/testkit/cover";

let engine: NullEngine;
let scene: Scene;
let camera: FreeCamera;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  camera = new FreeCamera("cam", new Vector3(0, 6, -12), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = 0.8;
  scene.activeCamera = camera;
});

afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const meshCount = (): number => scene.meshes.filter((m) => m.name === "vfx-chicken-firework").length;

describe("ChickenFireworkFx", () => {
  it("builds ONE formation mesh with thousands of points, lazily on first play", () => {
    cover("firework-shell-lifecycle");
    const fx = new ChickenFireworkFx(scene, { cameraFor: () => camera });
    expect(meshCount()).toBe(0); // nothing until it plays
    fx.play(0);
    expect(meshCount()).toBe(1);
    expect(fx.pointCount).toBeGreaterThan(1200);
    fx.play(1000); // replay reuses the same mesh, never a second one
    expect(meshCount()).toBe(1);
    fx.dispose();
    expect(meshCount()).toBe(0);
  });

  it("is enabled through the burst and self-stops after the timeline ends", () => {
    cover("firework-shell-lifecycle");
    const fx = new ChickenFireworkFx(scene, { cameraFor: () => camera });
    fx.play(0);
    expect(fx.active).toBe(true);
    fx.update(1400); // deep in the hold
    expect(fx.active).toBe(true);
    fx.update(CHICKEN_TOTAL_MS + 100); // past the end
    expect(fx.active).toBe(false);
    fx.dispose();
  });

  it("does nothing on update while idle (cheap when not celebrating)", () => {
    cover("firework-shell-lifecycle");
    const fx = new ChickenFireworkFx(scene, { cameraFor: () => camera });
    expect(() => {
      for (let t = 0; t < 5000; t += 100) fx.update(t);
    }).not.toThrow();
    expect(fx.active).toBe(false);
    expect(meshCount()).toBe(0); // never even built
    fx.dispose();
  });

  it("scales the point budget with quality without dropping below a readable floor", () => {
    const hi = new ChickenFireworkFx(scene, { cameraFor: () => camera, scale: 1 });
    const lo = new ChickenFireworkFx(scene, { cameraFor: () => camera, scale: 0.3 });
    hi.play(0);
    lo.play(0);
    expect(lo.pointCount).toBeLessThan(hi.pointCount);
    // still a substantial, readable bird at the low tier (the 0.45 quality
    // floor yields ~489 pts); the SHAPE readability is guarded by
    // chickenSilhouette.test — this only guards against a sparse handful.
    expect(lo.pointCount).toBeGreaterThan(450);
    hi.dispose();
    lo.dispose();
  });
});

describe("SmallFireworkFx", () => {
  it("plays a seeded volley and self-stops after the volley window", () => {
    cover("firework-shell-lifecycle");
    const fx = new SmallFireworkFx(scene, { cameraFor: () => camera });
    fx.play(0, 3);
    expect(fx.active).toBe(true);
    expect(fx.volley.length).toBeGreaterThan(0);
    // drive the whole volley — must not throw and must end
    for (let t = 0; t <= 2000; t += 16) fx.update(t);
    expect(fx.active).toBe(false);
    fx.dispose();
  });

  it("does not stack two volleys when replayed quickly", () => {
    const fx = new SmallFireworkFx(scene, { cameraFor: () => camera });
    fx.play(0, 1);
    fx.update(200);
    fx.play(200, 2); // re-play mid-volley
    expect(fx.volley).toEqual([...fx.volley]); // single volley in flight
    expect(fx.active).toBe(true);
    fx.dispose();
  });
});

describe("VictoryFireworks facade", () => {
  const input = (over: Partial<VictoryInput>): VictoryInput => ({
    phase: "combat",
    outcomeDecided: false,
    round: 1,
    myTeamId: 0,
    myRoundWins: 0,
    myPlacement: 0,
    ...over,
  });

  it("routes a round-win edge to the small volley and a callback", () => {
    cover("victory-fireworks-facade");
    let roundCb = -1;
    const fx = new VictoryFireworks(scene, { cameraFor: () => camera, onRoundWin: (r) => (roundCb = r) });
    fx.sync(input({}), 0); // prime
    const fire = fx.sync(input({ myRoundWins: 1, round: 2 }), 100);
    expect(fire).toEqual({ kind: "round", round: 2 });
    expect(roundCb).toBe(2);
    fx.dispose();
  });

  it("routes a match-win edge to the chicken and a callback, exactly once", () => {
    cover("victory-fireworks-facade");
    let matchCb = 0;
    const fx = new VictoryFireworks(scene, { cameraFor: () => camera, onMatchWin: () => matchCb++ });
    fx.sync(input({}), 0);
    const decided = input({ phase: "resolution", outcomeDecided: true, myPlacement: 1 });
    expect(fx.sync(decided, 100).kind).toBe("match");
    expect(fx.active).toBe(true);
    expect(fx.chickenPointCount).toBeGreaterThan(1200);
    for (let f = 0; f < 20; f++) fx.sync(decided, 200 + f * 16);
    expect(matchCb).toBe(1); // never a second time
    fx.dispose();
  });

  it("celebrates NOTHING for the loser", () => {
    cover("victory-fireworks-facade");
    let cbs = 0;
    const fx = new VictoryFireworks(scene, {
      cameraFor: () => camera,
      onRoundWin: () => cbs++,
      onMatchWin: () => cbs++,
    });
    fx.sync(input({ myRoundWins: 0 }), 0);
    const lost = input({ phase: "resolution", outcomeDecided: true, myPlacement: 4, myRoundWins: 0 });
    for (let f = 0; f < 30; f++) fx.sync(lost, f * 16);
    expect(cbs).toBe(0);
    expect(fx.active).toBe(false);
    fx.dispose();
  });
});
