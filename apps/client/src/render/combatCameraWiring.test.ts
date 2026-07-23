/**
 * juice-camera-directional / juice-camera-expunch — the COMPOSITION-ROOT wiring
 * for the two combat-feel camera seams. Both primitives were implemented and
 * unit-tested but had ZERO runtime callers: `CameraRig.addShake(opts)` took a
 * directional shake nobody ever asked for, `planImpactFeedback` computed a
 * `ShakeRequest` nobody ever consumed, and `CameraRig.exPunchIn` was never
 * called at all — the features were dead in the shipped game.
 *
 * So this file tests the WIRING, not the primitives:
 *   1. a DEAD-SEAM GATE that scans the real GameApp.ts source and fails if the
 *      call sites disappear again (comments stripped first, so the prose that
 *      documents the seam can never satisfy the gate on its own);
 *   2. an END-TO-END pass that drives the REAL CameraRig (Babylon NullEngine)
 *      with wire-shaped events through the SAME dispatcher GameApp uses, and
 *      asserts what the player actually sees: one hit → one shake, aimed along
 *      the hit vector; one EX cast → one push-in; reduced motion → nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TICK_MS } from "@ggd/shared/constants";
import { CameraRig, type ShakeOptions } from "./CameraRig";
import {
  batchCarriesImpactProfile,
  planCameraReaction,
  cameraShakeScaleFor,
  EX_PUNCH_DEPTH,
  EX_PUNCH_MS,
  EX_PUNCH_MIN_INTERVAL_MS,
  type CombatEventLike,
} from "./combatFeedback";

// ---------------------------------------------------------------------------
// 1) dead-seam gate — the call sites must EXIST in GameApp
// ---------------------------------------------------------------------------

const GAME_APP = join(__dirname, "../GameApp.ts");

/**
 * GameApp source with comments stripped, so a doc comment naming a seam can
 * never stand in for calling it. The block-comment opener must sit at the start
 * of its line (every real one does) — a naive `/\*` would otherwise re-open on
 * the `render/*` glob inside the prose and swallow the code after it; the line
 * stripper skips `//` preceded by `:` so a URL in a string survives.
 */
function gameAppCode(): string {
  return readFileSync(GAME_APP, "utf8")
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** The argument text of the first `needle(` call in `src`, for shallow asserts. */
function argsOf(src: string, needle: string): string {
  const at = src.indexOf(needle);
  expect(at, `${needle} is never called`).toBeGreaterThan(-1);
  return src.slice(at + needle.length, at + needle.length + 240);
}

describe("GameApp really drives the camera seams (juice-camera-directional)", () => {
  it("calls planCameraReaction and hands its kick to CameraRig.addShake WITH the direction", () => {
    cover("juice-camera-directional");
    const src = gameAppCode();
    expect(src).toMatch(/planCameraReaction\s*\(/); // the dispatcher runs per event
    expect(src).toMatch(/cameraRig\.addShake\s*\(/); // …and reaches the rig
    // the DIRECTIONAL options are what make this more than the old rattle
    const args = argsOf(src, "cameraRig.addShake(");
    expect(args).toContain("dir");
    expect(args).toContain("style");
    expect(args).toContain("kick");
  });

  it("guards the double-shake: the batch is scanned and the legacy scalar call is gone", () => {
    cover("juice-camera-directional");
    const src = gameAppCode();
    // damage arrives BEFORE its hitImpact twin, so the batch must be pre-scanned
    expect(src).toMatch(/batchCarriesImpactProfile\s*\(/);
    expect(src).toMatch(/batchProfiled\s*[:=]/);
    // and GameApp must no longer shake off impactShakeAmp itself — that legacy
    // path now lives INSIDE planCameraReaction, where the suppression applies.
    expect(src).not.toMatch(/impactShakeAmp\s*\(/);
    // exactly ONE addShake call site in the whole file
    expect(src.match(/\.addShake\s*\(/g) ?? []).toHaveLength(1);
  });

  it("calls CameraRig.exPunchIn, once, from the EX path (juice-camera-expunch)", () => {
    cover("juice-camera-expunch");
    const src = gameAppCode();
    expect(src).toMatch(/cameraRig\.exPunchIn\s*\(/);
    expect(src.match(/\.exPunchIn\s*\(/g) ?? []).toHaveLength(1);
    // the re-entry clock is stamped so one EX cannot restart the beat
    expect(src).toMatch(/lastExPunchMs\s*=/);
    expect(src).toMatch(/sinceExPunchMs/);
  });

  it("folds prefers-reduced-motion into the shake scale every camera reaction gates on", () => {
    cover("juice-quality-gate");
    const src = gameAppCode();
    expect(src).toMatch(/prefersReducedMotion\s*\(/);
    // both the initial read and the live quality-change subscription pass it
    const calls = src.match(/cameraShakeScaleFor\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toContain("reducedMotion");
  });
});

// ---------------------------------------------------------------------------
// 2) end-to-end — the same dispatch, driving the REAL rig
// ---------------------------------------------------------------------------

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

/** Recording view of a real CameraRig: every camera call, in order. */
class RecordingRig {
  readonly shakes: { amp: number; durationMs: number; opts?: ShakeOptions }[] = [];
  readonly punches: { depth?: number; durationMs?: number }[] = [];
  constructor(readonly rig: CameraRig) {}
  addShake(amp: number, durationMs: number, opts?: ShakeOptions): void {
    this.shakes.push({ amp, durationMs, opts });
    this.rig.addShake(amp, durationMs, opts);
  }
  exPunchIn(depth?: number, durationMs?: number): void {
    this.punches.push({ depth, durationMs });
    this.rig.exPunchIn(depth, durationMs);
  }
}

/**
 * GameApp.frame's camera wave, VERBATIM: pre-scan the drained batch, then run
 * every event through planCameraReaction and apply what comes back. The source
 * gate above pins the real GameApp to exactly this shape.
 */
function drainBatch(
  cam: RecordingRig,
  events: readonly CombatEventLike[],
  o: { localId: number | null; scale: number; nowMs: number; clock: { lastExPunchMs: number } },
): void {
  const batchProfiled = batchCarriesImpactProfile(events);
  let frameKicks = 0;
  for (const ev of events) {
    const reaction = planCameraReaction(ev, {
      localId: o.localId,
      scale: o.scale,
      crowdIndex: frameKicks,
      batchProfiled,
      sinceExPunchMs: o.nowMs - o.clock.lastExPunchMs,
      tickMs: TICK_MS,
    });
    if (reaction.kick) {
      const k = reaction.kick;
      frameKicks++;
      cam.addShake(k.amp, k.durationMs, { dir: k.dir, style: k.style, kick: k.kick });
    }
    if (reaction.exPunch) {
      o.clock.lastExPunchMs = o.nowMs;
      cam.exPunchIn(EX_PUNCH_DEPTH, EX_PUNCH_MS);
    }
  }
}

const LOCAL = 7;
const ENEMY = 9;

/** The sim's real pair of events for ONE landed hit: damage, then hitImpact. */
function landedHit(dir: { x: number; z: number }): CombatEventLike[] {
  const common = { source: ENEMY, target: LOCAL, amount: 90, dmgType: "physical" };
  return [
    { type: "damage", data: { ...common, crit: false, killingBlow: false } },
    {
      type: "hitImpact",
      data: {
        ...common,
        blocked: false,
        profile: {
          tier: "heavy",
          hitstopTicks: 4,
          hitstunTicks: 6,
          knockbackDir: dir,
          knockbackMag: 1.2,
          isEX: false,
          isBlock: false,
          shakeMag: 0.85,
          shakeStyle: "directional",
          sparkKind: "heavy",
          flashColor: [1, 0.25, 0.2],
          flashMs: 160,
          camKick: 0.5,
          exFreeze: 0,
        },
      },
    },
  ];
}

const exCast = (over: Record<string, unknown> = {}): CombatEventLike => ({
  type: "abilityCast",
  data: { caster: LOCAL, slot: "EX", abilityId: "ex.demo", ...over },
});

/** Flush the rig transform the way the render loop does. */
function step(rig: CameraRig): void {
  rig.update({
    dtMs: 16,
    localPos: null,
    cursor: null,
    panKeys: null,
    viewportWidth: 800,
    viewportHeight: 600,
  });
}

function freshRig(): RecordingRig {
  const rig = new CameraRig(scene, { x: 0, z: 0 });
  step(rig); // settle at rest
  return new RecordingRig(rig);
}

describe("one landed hit → ONE directional kick on the real rig (juice-camera-directional)", () => {
  it("shakes exactly once, along the knockback vector, and settles back to rest", () => {
    cover("juice-camera-directional");
    const cam = freshRig();
    const restZ = cam.rig.camera.position.z;
    const restX = cam.rig.camera.position.x;
    const clock = { lastExPunchMs: -Infinity };

    // hit taken from -Z → the sim's knockback pushes the victim +Z
    drainBatch(cam, landedHit({ x: 0, z: 1 }), { localId: LOCAL, scale: 1, nowMs: 0, clock });

    // ONE shake for one hit — damage + hitImpact must not both fire
    expect(cam.shakes).toHaveLength(1);
    expect(cam.shakes[0]!.opts?.style).toBe("directional");
    expect(cam.shakes[0]!.opts?.dir).toEqual({ x: 0, z: 1 });
    expect(cam.shakes[0]!.opts?.kick).toBeGreaterThan(0);

    // and the eye really lurches along +Z on the contact frame
    step(cam.rig);
    expect(cam.rig.camera.position.z - restZ).toBeGreaterThan(1e-2);

    // …then snaps back crisp (收尾精準)
    for (let i = 0; i < 30; i++) step(cam.rig);
    expect(cam.rig.camera.position.z).toBeCloseTo(restZ, 5);
    expect(cam.rig.camera.position.x).toBeCloseTo(restX, 5);
  });

  it("kicks the OPPOSITE way for a hit from the other side", () => {
    cover("juice-camera-directional");
    const plus = freshRig();
    const minus = freshRig();
    const clock = { lastExPunchMs: -Infinity };
    drainBatch(plus, landedHit({ x: 0, z: 1 }), { localId: LOCAL, scale: 1, nowMs: 0, clock });
    drainBatch(minus, landedHit({ x: 0, z: -1 }), { localId: LOCAL, scale: 1, nowMs: 0, clock });
    step(plus.rig);
    step(minus.rig);
    const restZ = new CameraRig(scene, { x: 0, z: 0 });
    step(restZ);
    const a = plus.rig.camera.position.z - restZ.camera.position.z;
    const b = minus.rig.camera.position.z - restZ.camera.position.z;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(0);
  });

  it("a whole teamfight frame cannot stack into a screen-quake", () => {
    cover("juice-camera-directional");
    const cam = freshRig();
    const clock = { lastExPunchMs: -Infinity };
    // six simultaneous landed hits in ONE drained batch
    const batch = [0, 1, 2, 3, 4, 5].flatMap(() => landedHit({ x: 1, z: 0 }));
    drainBatch(cam, batch, { localId: LOCAL, scale: 1, nowMs: 0, clock });
    expect(cam.shakes.length).toBeLessThanOrEqual(3); // crowding budget
    // the summed eye displacement stays in the "punchy", not "nauseating", band
    const rest = new CameraRig(scene, { x: 0, z: 0 });
    step(rest);
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      step(cam.rig);
      peak = Math.max(
        peak,
        Math.hypot(
          cam.rig.camera.position.x - rest.camera.position.x,
          cam.rig.camera.position.y - rest.camera.position.y,
          cam.rig.camera.position.z - rest.camera.position.z,
        ),
      );
    }
    expect(peak).toBeLessThan(2); // < 2 world units at a dolly of 10
    for (let i = 0; i < 30; i++) step(cam.rig);
    expect(cam.rig.camera.position.z).toBeCloseTo(rest.camera.position.z, 5);
  });
});

describe("one EX cast → ONE cinematic punch-in on the real rig (juice-camera-expunch)", () => {
  it("punches in once, eases back out, and a normal ability never punches", () => {
    cover("juice-camera-expunch");
    const cam = freshRig();
    const restY = cam.rig.camera.position.y;
    const clock = { lastExPunchMs: -Infinity };

    // Q/W/E/R and an ENEMY's EX: no punch-in at all
    drainBatch(
      cam,
      [exCast({ slot: "Q" }), exCast({ slot: "R" }), exCast({ caster: ENEMY })],
      { localId: LOCAL, scale: 1, nowMs: 1000, clock },
    );
    expect(cam.punches).toHaveLength(0);

    // the local player's EX: exactly one push-in
    drainBatch(cam, [exCast()], { localId: LOCAL, scale: 1, nowMs: 1000, clock });
    expect(cam.punches).toHaveLength(1);
    expect(cam.punches[0]).toEqual({ depth: EX_PUNCH_DEPTH, durationMs: EX_PUNCH_MS });

    // the eye really pushes toward the fight (dolly-in lowers it)
    step(cam.rig);
    expect(cam.rig.camera.position.y).toBeLessThan(restY - 1e-3);
    expect(cam.rig.camera.position.y).toBeGreaterThan(0); // never past the clamp

    // …and eases fully back out
    for (let i = 0; i < 30; i++) step(cam.rig);
    expect(cam.rig.camera.position.y).toBeCloseTo(restY, 4);
  });

  it("cannot stack: a repeat cast inside the guard window is ignored", () => {
    cover("juice-camera-expunch");
    const cam = freshRig();
    const clock = { lastExPunchMs: -Infinity };
    drainBatch(cam, [exCast()], { localId: LOCAL, scale: 1, nowMs: 1000, clock });
    drainBatch(cam, [exCast()], { localId: LOCAL, scale: 1, nowMs: 1050, clock });
    drainBatch(cam, [exCast()], { localId: LOCAL, scale: 1, nowMs: 1120, clock });
    expect(cam.punches).toHaveLength(1);
    // a genuinely later EX does punch again
    drainBatch(cam, [exCast()], {
      localId: LOCAL,
      scale: 1,
      nowMs: 1000 + EX_PUNCH_MIN_INTERVAL_MS,
      clock,
    });
    expect(cam.punches).toHaveLength(2);
  });

  it("EX damage TICKS shake but never re-punch", () => {
    cover("juice-camera-expunch");
    const cam = freshRig();
    const clock = { lastExPunchMs: -Infinity };
    drainBatch(cam, [exCast()], { localId: LOCAL, scale: 1, nowMs: 0, clock });
    // the EX then lands three damage ticks over the next second
    for (let t = 1; t <= 3; t++) {
      drainBatch(cam, landedHit({ x: 1, z: 0 }), {
        localId: LOCAL,
        scale: 1,
        nowMs: t * 600,
        clock,
      });
    }
    expect(cam.punches).toHaveLength(1); // one EX, one 特寫
    expect(cam.shakes).toHaveLength(3); // but every tick still hits
  });
});

describe("prefers-reduced-motion leaves the camera completely still (juice-quality-gate)", () => {
  it("no shake, no kick, no punch-in — and the eye never moves", () => {
    cover("juice-quality-gate");
    const cam = freshRig();
    const rest = {
      x: cam.rig.camera.position.x,
      y: cam.rig.camera.position.y,
      z: cam.rig.camera.position.z,
    };
    const scale = cameraShakeScaleFor("desktop", /* reducedMotion */ true);
    const clock = { lastExPunchMs: -Infinity };
    drainBatch(cam, [...landedHit({ x: 0, z: 1 }), exCast()], {
      localId: LOCAL,
      scale,
      nowMs: 0,
      clock,
    });
    expect(cam.shakes).toHaveLength(0);
    expect(cam.punches).toHaveLength(0);
    for (let i = 0; i < 10; i++) step(cam.rig);
    expect(cam.rig.camera.position.x).toBeCloseTo(rest.x, 6);
    expect(cam.rig.camera.position.y).toBeCloseTo(rest.y, 6);
    expect(cam.rig.camera.position.z).toBeCloseTo(rest.z, 6);
  });
});
