/**
 * death-focus (task #85) — the BABYLON half, headless on the NullEngine. The
 * pure gate is covered by render/deathFocus.test.ts; what matters here is the
 * one thing that can strand a player behind a grey screen: the pass must be
 * attached to the camera exactly while the gate is lit and be OFF the camera
 * on every revert path, on teardown, and for a viewport that never died.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { KIND_CHAMPION, KIND_REVIVE_CIRCLE } from "../render/overheadAnchors";
import { COMBAT_PHASE, FOCUS_FADE_IN_MS, FOCUS_FADE_OUT_MS, type FocusEntity } from "../render/deathFocus";
import { Effect } from "@babylonjs/core/Materials/effect";
import { DeathFocusFx, type DeathFocusFrame } from "./DeathFocusFx";

const P0 = 11;
const P1 = 12;

let engine: NullEngine;
let scene: Scene;
let cameras: (Camera | null)[];
let fx: DeathFocusFx;

function makeCamera(name: string): Camera {
  const c = new TargetCamera(name, new Vector3(0, 10, -10), scene);
  c.setTarget(Vector3.Zero());
  return c;
}

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  cameras = [makeCamera("rig0"), makeCamera("rig1")];
  fx = new DeathFocusFx(
    scene,
    { cameraFor: (p) => cameras[p] ?? null, posOf: () => null },
    2,
  );
});

afterEach(() => {
  fx.dispose();
  scene.dispose();
  engine.dispose();
});

function champ(id: number, teamId: number, alive: boolean, x = 0): FocusEntity {
  return { id, kind: KIND_CHAMPION, seatId: id, teamId, alive, x, z: 0 };
}

/** P0 dead, P1 alive, one living teammate for P0, one enemy. */
function mkFrame(over: Partial<DeathFocusFrame> = {}, p0Alive = false): DeathFocusFrame {
  return {
    phase: COMBAT_PHASE,
    outcomeDecided: false,
    localEntities: [P0, P1],
    entities: [
      champ(P0, 1, p0Alive),
      champ(P1, 1, true, 4),
      champ(30, 1, true, 6),
      champ(40, 2, true, 20),
    ],
    ...over,
  };
}

/** Advance `ms` of 50 ms frames. */
function run(ms: number, frame: DeathFocusFrame | null): void {
  for (let t = 0; t < ms; t += 50) fx.update(50, frame);
}

/** Post-processes Babylon actually has bolted to that camera. */
function onCameraOf(camera: Camera): number {
  const c = camera as unknown as { _postProcesses: (unknown | null)[] };
  return c._postProcesses.filter((p) => p !== null && p !== undefined).length;
}

function onCamera(player: number): number {
  const c = cameras[player];
  return c ? onCameraOf(c) : 0;
}

function expectOff(player: number): void {
  expect(fx.isAttached(player)).toBe(false);
  expect(fx.strengthOf(player)).toBe(0);
  expect(onCamera(player)).toBe(0);
}

describe("death-focus pass lifetime", () => {
  it("stays off a living viewport", () => {
    cover("death-focus-attach");
    run(2000, mkFrame({}, true));
    expectOff(0);
    expectOff(1);
  });

  it("stays off when a champion is dead but never DIED (bye team / parked seat)", () => {
    cover("death-focus-attach");
    run(2000, mkFrame()); // P0 alive=false the whole time, no death event
    expectOff(0);
  });

  it("attaches after this viewport's own combat death, and only to that viewport", () => {
    cover("death-focus-attach");
    fx.noteDeath(P0);
    run(FOCUS_FADE_IN_MS + 200, mkFrame());
    expect(fx.isAttached(0)).toBe(true);
    expect(fx.strengthOf(0)).toBe(1);
    expect(onCamera(0)).toBe(1);
    expectOff(1); // P1 is alive and fighting — its quadrant stays in colour
  });

  it("ignores a death event for somebody else's champion", () => {
    cover("death-focus-attach");
    fx.noteDeath(40); // an enemy died
    fx.noteDeath(999); // and someone not in the snapshot at all
    run(2000, mkFrame());
    expectOff(0);
    expectOff(1);
  });

  it("does not re-arm from a stale death event on a later frame", () => {
    cover("death-focus-attach");
    fx.noteDeath(P0);
    fx.update(50, mkFrame({ phase: "intermission" })); // queued id consumed + dropped
    run(2000, mkFrame());
    expectOff(0);
  });
});

describe("death-focus pass reverts", () => {
  function lightUp(): void {
    fx.noteDeath(P0);
    run(FOCUS_FADE_IN_MS + 200, mkFrame());
    expect(fx.isAttached(0)).toBe(true);
  }

  const reverts: [string, DeathFocusFrame | null][] = [
    ["revived", mkFrame({}, true)],
    ["round resolved", mkFrame({ phase: "resolution" })],
    ["intermission shop", mkFrame({ phase: "intermission" })],
    ["outcome decided", mkFrame({ outcomeDecided: true })],
    ["seat lost its champion", mkFrame({ localEntities: [-1, P1] })],
    ["entity gone from the snapshot", mkFrame({ entities: [champ(P1, 1, true)] })],
    ["no match state at all", null],
  ];

  for (const [name, frame] of reverts) {
    it(`detaches from the camera: ${name}`, () => {
      cover("death-focus-attach");
      lightUp();
      run(FOCUS_FADE_OUT_MS + 200, frame);
      expectOff(0);
      run(2000, frame); // and stays off
      expectOff(0);
    });
  }

  it("keeps painting while it fades out, then lets go", () => {
    cover("death-focus-attach");
    lightUp();
    fx.update(FOCUS_FADE_OUT_MS / 2, mkFrame({}, true));
    expect(fx.isAttached(0)).toBe(true);
    expect(fx.strengthOf(0)).toBeGreaterThan(0);
    fx.update(FOCUS_FADE_OUT_MS / 2, mkFrame({}, true));
    expectOff(0);
  });

  it("detaches when the viewport loses its camera", () => {
    cover("death-focus-attach");
    lightUp();
    const old = cameras[0]!;
    cameras[0] = null;
    fx.update(50, mkFrame());
    expect(fx.isAttached(0)).toBe(false);
    expect(onCameraOf(old)).toBe(0);
  });

  it("follows the viewport onto a REPLACED camera, leaving the old one clean", () => {
    cover("death-focus-attach");
    lightUp();
    const old = cameras[0]!;
    cameras[0] = makeCamera("rig0b");
    fx.update(50, mkFrame());
    expect(fx.isAttached(0)).toBe(true);
    expect(onCameraOf(old)).toBe(0);
    expect(onCamera(0)).toBe(1);
  });

  it("dispose() drops every viewport's pass, and is idempotent", () => {
    cover("death-focus-attach");
    lightUp();
    fx.dispose();
    expectOff(0);
    expectOff(1);
    fx.dispose();
    fx.update(50, mkFrame()); // post-teardown frames are inert
    expectOff(0);
  });
});

describe("death-focus frame cost", () => {
  it("does bounded work per frame — no O(entities x slots) position lookups", () => {
    cover("death-focus-attach");
    // 12 champions is the full two-duel arena (task #33's 60 fps bar case)
    const entities: FocusEntity[] = [champ(P0, 1, false), champ(P1, 1, true, 4)];
    for (let i = 0; i < 10; i++) entities.push(champ(50 + i, i % 2 ? 1 : 2, true, i * 3));
    let lookups = 0;
    const counted = new DeathFocusFx(
      scene,
      {
        cameraFor: (p) => cameras[p] ?? null,
        posOf: () => {
          lookups++;
          return null;
        },
      },
      2,
    );
    const f: DeathFocusFrame = { phase: COMBAT_PHASE, outcomeDecided: false, localEntities: [P0, P1], entities };
    counted.noteDeath(P0);
    for (let i = 0; i < 20; i++) counted.update(50, f);
    expect(counted.strengthOf(0)).toBe(1);
    // <= 1 origin + 1 revive circle + one per filled pool slot, per lit viewport
    expect(lookups / 20).toBeLessThanOrEqual(6);
    counted.dispose();
  });

  it("costs nothing at all while everyone is alive", () => {
    cover("death-focus-attach");
    let lookups = 0;
    const counted = new DeathFocusFx(
      scene,
      {
        cameraFor: (p) => cameras[p] ?? null,
        posOf: () => {
          lookups++;
          return null;
        },
      },
      2,
    );
    for (let i = 0; i < 50; i++) counted.update(16, mkFrame({}, true));
    expect(lookups).toBe(0);
    expect(counted.isAttached(0)).toBe(false);
    counted.dispose();
  });
});

describe("death-focus with a revive circle (task #84)", () => {
  it("runs with the owner's circle in the snapshot without disturbing the gate", () => {
    cover("death-focus-attach");
    const circle: FocusEntity = {
      id: 90,
      kind: KIND_REVIVE_CIRCLE,
      seatId: P0,
      teamId: 1,
      alive: true,
      x: 0,
      z: 0,
      revive: { radius: 2, channelling: true },
    };
    const f = mkFrame();
    const withCircle: DeathFocusFrame = { ...f, entities: [...f.entities, circle] };
    fx.noteDeath(P0);
    run(FOCUS_FADE_IN_MS + 200, withCircle);
    expect(fx.isAttached(0)).toBe(true);
    expect(fx.strengthOf(0)).toBe(1);
  });
});

/**
 * The falloff the requirement 「敵人去飽和」 is asserted against lives in TWO
 * places: this GLSL and its hand-maintained TS mirror `poolColourAt`. Six
 * requirement-level assertions in deathFocus.test.ts rest on the mirror being
 * faithful, and a one-line shader edit would invalidate all of them without
 * turning a single test red. This is the cheap mechanical guard: the shader is
 * a plain string in a global registry, so no GPU is involved.
 */
describe("the shader and its TS mirror cannot silently drift", () => {
  it("pins the GLSL pool falloff that render/deathFocus.poolColourAt mirrors", () => {
    cover("death-focus-attach");
    // force registration (the pass is built lazily on first attach)
    const f = mkFrame();
    fx.noteDeath(P0);
    run(FOCUS_FADE_IN_MS + 100, f);
    const src = Effect.ShadersStore["ggdDeathFocusFragmentShader"];
    expect(src).toBeTruthy();
    // MIRROR: render/deathFocus.ts `poolColourAt`
    expect(src).toContain("w * (1.0 - smoothstep(s.z, s.w, length(d)))");
    // …and the strength term the pools multiply into
    expect(src).toContain("mix(col, grey, s * (1.0 - m))");
  });
});
