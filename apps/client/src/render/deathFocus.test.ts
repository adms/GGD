/**
 * death-focus (task #85) — the STATE half. A greyscale that never lifts is the
 * failure mode that ruins a match, so every arming and every revert path is
 * pinned here, plus the two things that make the pools land where the bodies
 * are: the colour-source selection and the resolution-independent projection.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { KIND_CHAMPION, KIND_FLOWER, KIND_REVIVE_CIRCLE } from "./overheadAnchors";
import {
  ALLY_RADIUS_FADE,
  ALLY_RADIUS_FULL,
  COMBAT_PHASE,
  DeathFocusGate,
  FOCUS_FADE_IN_MS,
  FOCUS_FADE_OUT_MS,
  FOCUS_MAX_SOURCES,
  FOCUS_PENDING_TIMEOUT_MS,
  REVIVE_WEIGHT,
  buildFocusSources,
  makeFocusSourcePool,
  projectFocusSource,
  rampToward,
  type FocusEntity,
  type FocusGateInput,
} from "./deathFocus";

const ME = 7;

/** A frame of authoritative state for the gate (combat, me, dead). */
function frame(over: Partial<FocusGateInput> = {}): FocusGateInput {
  return {
    phase: COMBAT_PHASE,
    outcomeDecided: false,
    entityId: ME,
    present: true,
    alive: false,
    dtMs: 50,
    ...over,
  };
}

/** Run `ms` of frames at 50 ms and return the final strength. */
function run(gate: DeathFocusGate, ms: number, over: Partial<FocusGateInput> = {}): number {
  let last = gate.strength;
  for (let t = 0; t < ms; t += 50) last = gate.update(frame(over));
  return last;
}

/** A gate already fully desaturated from a combat death. */
function litGate(): DeathFocusGate {
  const gate = new DeathFocusGate();
  gate.noteDeath(ME, COMBAT_PHASE);
  run(gate, FOCUS_FADE_IN_MS + 200);
  return gate;
}

describe("death-focus arming", () => {
  it("ramps to full only after a COMBAT death event is confirmed by the snapshot", () => {
    cover("death-focus-arm");
    const gate = new DeathFocusGate();
    // dead in combat but no death event yet → nothing (this is the bye-team /
    // parked-seat case: enterCombat kills every seat without a death event)
    expect(run(gate, 1000)).toBe(0);
    expect(gate.state).toBe("idle");

    gate.noteDeath(ME, COMBAT_PHASE);
    expect(gate.strength).toBe(0); // no ramp until a frame runs
    expect(run(gate, FOCUS_FADE_IN_MS + 100)).toBe(1);
    expect(gate.state).toBe("dead");
  });

  it("ignores a death event fired outside combat", () => {
    cover("death-focus-arm");
    for (const phase of ["champSelect", "intermission", "resolution", "matchEnd"]) {
      const gate = new DeathFocusGate();
      gate.noteDeath(ME, phase);
      expect(gate.state).toBe("idle");
      expect(run(gate, 1000, { phase })).toBe(0);
    }
  });

  it("survives the death event landing BEFORE the snapshot flips alive", () => {
    cover("death-focus-arm");
    // the event and the schema patch are different messages: seeing the event
    // while the snapshot still says alive must NOT disarm the gate
    const gate = new DeathFocusGate();
    gate.noteDeath(ME, COMBAT_PHASE);
    expect(run(gate, 300, { alive: true })).toBe(0);
    expect(gate.state).toBe("pending");
    expect(run(gate, FOCUS_FADE_IN_MS + 100, { alive: false })).toBe(1);
  });

  it("abandons an arm that the snapshot never confirms", () => {
    cover("death-focus-arm");
    const gate = new DeathFocusGate();
    gate.noteDeath(ME, COMBAT_PHASE);
    expect(run(gate, FOCUS_PENDING_TIMEOUT_MS + 100, { alive: true })).toBe(0);
    expect(gate.state).toBe("idle");
    // and it stays off even if the champion later dies without a fresh event
    expect(run(gate, 2000, { alive: false })).toBe(0);
  });

  it("re-arms on a later round's death", () => {
    cover("death-focus-arm");
    const gate = litGate();
    run(gate, FOCUS_FADE_OUT_MS + 100, { alive: true }); // revived
    expect(gate.strength).toBe(0);
    gate.noteDeath(ME, COMBAT_PHASE);
    expect(run(gate, FOCUS_FADE_IN_MS + 100)).toBe(1);
  });
});

describe("death-focus reverts (never stuck grey)", () => {
  const reverts: [string, Partial<FocusGateInput>][] = [
    ["revived by a teammate (#84) or next round", { alive: true }],
    ["round over → resolution", { phase: "resolution" }],
    ["shop → intermission (last round's losers stay dead all 60 s)", { phase: "intermission" }],
    ["back to champ select", { phase: "champSelect" }],
    ["match ended", { phase: "matchEnd" }],
    ["outcome decided → settlement hero shot", { outcomeDecided: true }],
    ["seat lost its champion", { entityId: -1 }],
    ["re-seated onto a different body", { entityId: ME + 1 }],
    ["entity gone from the snapshot", { present: false }],
  ];

  for (const [name, over] of reverts) {
    it(`reaches EXACTLY zero: ${name}`, () => {
      cover("death-focus-revert");
      const gate = litGate();
      expect(gate.strength).toBe(1);
      const out = run(gate, FOCUS_FADE_OUT_MS + 100, over);
      expect(out).toBe(0); // not 1e-9 — a lingering pass never detaches
      expect(gate.state).toBe("idle");
      // and it stays down while the condition holds
      expect(run(gate, 2000, over)).toBe(0);
    });
  }

  it("reset() drops the strength immediately (teardown)", () => {
    cover("death-focus-revert");
    const gate = litGate();
    gate.reset();
    expect(gate.strength).toBe(0);
    expect(gate.state).toBe("idle");
  });

  it("fades out over FOCUS_FADE_OUT_MS and not longer", () => {
    cover("death-focus-revert");
    const gate = litGate();
    const half = gate.update(frame({ alive: true, dtMs: FOCUS_FADE_OUT_MS / 2 }));
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    expect(gate.update(frame({ alive: true, dtMs: FOCUS_FADE_OUT_MS / 2 }))).toBe(0);
  });

  it("a zero-length frame never advances the ramp", () => {
    cover("death-focus-revert");
    expect(rampToward(0.5, 1, 0, 100)).toBe(0.5);
    expect(rampToward(0.5, 0, -5, 100)).toBe(0.5);
    expect(rampToward(0.5, 0, 10, 0)).toBe(0); // degenerate duration snaps
  });
});

// ---------------------------------------------------------------------------

const noPos = (): null => null;

function champ(id: number, teamId: number, alive: boolean, x: number, z: number): FocusEntity {
  return { id, kind: KIND_CHAMPION, seatId: id, teamId, alive, x, z };
}

describe("death-focus colour sources", () => {
  it("keeps LIVING teammates in colour and nothing else", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const entities: FocusEntity[] = [
      champ(ME, 1, false, 0, 0), // me, dead
      champ(8, 1, true, 3, 0), // teammate
      champ(9, 1, false, 4, 0), // dead teammate
      champ(10, 2, true, 5, 0), // enemy
      { id: 11, kind: KIND_FLOWER, seatId: 0, teamId: -1, alive: true, x: 1, z: 1 },
    ];
    const n = buildFocusSources(ME, ME, 1, entities, noPos, out);
    expect(n).toBe(1);
    expect(out[0]!.id).toBe(8);
    expect(out[0]!.rFull).toBe(ALLY_RADIUS_FULL);
    expect(out[0]!.rFade).toBe(ALLY_RADIUS_FADE);
    // every unused slot is silenced, so a stale pool can't paint a ghost bubble
    for (let i = n; i < FOCUS_MAX_SOURCES; i++) expect(out[i]!.weight).toBe(0);
  });

  it("takes the NEAREST teammates when there are more than slots", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const entities: FocusEntity[] = [
      champ(ME, 1, false, 0, 0),
      champ(20, 1, true, 40, 0),
      champ(21, 1, true, 2, 0),
      champ(22, 1, true, 30, 0),
      champ(23, 1, true, 8, 0),
      champ(24, 1, true, 5, 0),
    ];
    const n = buildFocusSources(ME, ME, 1, entities, noPos, out);
    expect(n).toBe(FOCUS_MAX_SOURCES);
    expect(out.slice(0, n).map((s) => s.id)).toEqual([21, 24, 23, 22]);
  });

  it("colours the player's OWN revive circle first, never someone else's", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const mine: FocusEntity = {
      id: 90,
      kind: KIND_REVIVE_CIRCLE,
      seatId: ME,
      teamId: 1,
      alive: true,
      x: 0,
      z: 0,
      revive: { radius: 2.5, channelling: false },
    };
    const theirs: FocusEntity = { ...mine, id: 91, seatId: ME + 1, x: 20 };
    const entities = [theirs, mine, champ(ME, 1, false, 0, 0), champ(8, 1, true, 3, 0)];
    const n = buildFocusSources(ME, ME, 1, entities, noPos, out);
    expect(n).toBe(2);
    expect(out[0]!.id).toBe(90);
    expect(out[0]!.weight).toBe(REVIVE_WEIGHT);
    expect(out[0]!.rFull).toBeGreaterThan(2.5);
    expect(out[1]!.id).toBe(8);
  });

  it("widens the revive pool while a teammate is channelling it", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const base: FocusEntity = {
      id: 90,
      kind: KIND_REVIVE_CIRCLE,
      seatId: ME,
      teamId: 1,
      alive: true,
      x: 0,
      z: 0,
      revive: { radius: 2, channelling: false },
    };
    buildFocusSources(ME, ME, 1, [base], noPos, out);
    const idle = out[0]!.rFade;
    buildFocusSources(
      ME,
      ME,
      1,
      [{ ...base, revive: { radius: 2, channelling: true } }],
      noPos,
      out,
    );
    expect(out[0]!.rFade).toBeGreaterThan(idle);
  });

  it("every emitted pool has rFade > rFull (smoothstep is undefined otherwise)", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const entities: FocusEntity[] = [
      {
        id: 90,
        kind: KIND_REVIVE_CIRCLE,
        seatId: ME,
        teamId: 1,
        alive: true,
        x: 0,
        z: 0,
        revive: { radius: 0, channelling: false },
      },
      champ(ME, 1, false, 0, 0),
      champ(8, 1, true, 3, 0),
    ];
    const n = buildFocusSources(ME, ME, 1, entities, noPos, out);
    for (let i = 0; i < n; i++) expect(out[i]!.rFade).toBeGreaterThan(out[i]!.rFull);
  });

  it("prefers the RENDERED position over the authoritative one", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const entities = [champ(ME, 1, false, 0, 0), champ(8, 1, true, 3, 0)];
    buildFocusSources(ME, ME, 1, entities, (id) => (id === 8 ? { x: 99, z: -1 } : null), out);
    expect(out[0]!.x).toBe(99);
    expect(out[0]!.z).toBe(-1);
  });

  it("emits nothing when the whole team is down", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const entities = [champ(ME, 1, false, 0, 0), champ(8, 1, false, 3, 0), champ(9, 2, true, 5, 0)];
    expect(buildFocusSources(ME, ME, 1, entities, noPos, out)).toBe(0);
    for (const s of out) expect(s.weight).toBe(0);
  });
});

// ---------------------------------------------------------------------------

interface ProjectedCamera {
  m: Float32Array | number[];
  fy: number;
  dispose(): void;
}

/** A MOBA-style rig looking at the origin, at `renderWidth` x `renderHeight`. */
function rigAt(eye: Vector3, renderWidth: number, renderHeight: number): ProjectedCamera {
  const engine = new NullEngine({
    renderWidth,
    renderHeight,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  const camera = new TargetCamera("t", eye, scene);
  camera.setTarget(Vector3.Zero());
  const view = camera.getViewMatrix();
  const proj = camera.getProjectionMatrix();
  const vp = new Matrix();
  view.multiplyToRef(proj, vp);
  return {
    m: Array.from(vp.m),
    fy: proj.m[5]!,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

function source(x: number, y: number, z: number, rFull = 4, rFade = 11) {
  return { id: 1, x, y, z, rFull, rFade, weight: 1 };
}

describe("death-focus projection", () => {
  it("puts the camera's target dead centre of the viewport", () => {
    cover("death-focus-projection");
    const rig = rigAt(new Vector3(0, 10, -10), 512, 256);
    const out = new Float32Array(4);
    const w = projectFocusSource(source(0, 0, 0), rig.m, rig.fy, out, 0);
    expect(w).toBe(1);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[3]!).toBeGreaterThan(out[2]!);
    rig.dispose();
  });

  it("is INDEPENDENT of the render-target size (task #43 rescales it live)", () => {
    cover("death-focus-projection");
    const small = rigAt(new Vector3(0, 10, -10), 512, 256);
    const big = rigAt(new Vector3(0, 10, -10), 2048, 1024);
    const a = new Float32Array(4);
    const b = new Float32Array(4);
    const s = source(3, 1.1, -2);
    projectFocusSource(s, small.m, small.fy, a, 0);
    projectFocusSource(s, big.m, big.fy, b, 0);
    for (let i = 0; i < 4; i++) expect(a[i]).toBeCloseTo(b[i]!, 6);
    small.dispose();
    big.dispose();
  });

  it("shrinks the pool with distance (twice the depth, half the radius)", () => {
    cover("death-focus-projection");
    const near = rigAt(new Vector3(0, 10, -10), 512, 256);
    const far = rigAt(new Vector3(0, 20, -20), 512, 256);
    const a = new Float32Array(4);
    const b = new Float32Array(4);
    projectFocusSource(source(0, 0, 0), near.m, near.fy, a, 0);
    projectFocusSource(source(0, 0, 0), far.m, far.fy, b, 0);
    expect(b[2]!).toBeCloseTo(a[2]! / 2, 4);
    expect(b[3]!).toBeCloseTo(a[3]! / 2, 4);
    near.dispose();
    far.dispose();
  });

  it("drops a source behind the eye instead of mirroring it into view", () => {
    cover("death-focus-projection");
    const rig = rigAt(new Vector3(0, 10, -10), 512, 256);
    const out = new Float32Array(4);
    // far behind the camera along its own backward axis
    const w = projectFocusSource(source(0, 40, -60), rig.m, rig.fy, out, 0);
    expect(w).toBe(0);
    expect(out[3]!).toBeGreaterThan(out[2]!); // still a legal smoothstep pair
    rig.dispose();
  });

  it("writes into the slot it is given, leaving neighbours untouched", () => {
    cover("death-focus-projection");
    const rig = rigAt(new Vector3(0, 10, -10), 512, 256);
    const out = new Float32Array(8).fill(-1);
    projectFocusSource(source(0, 0, 0), rig.m, rig.fy, out, 4);
    expect(Array.from(out.slice(0, 4))).toEqual([-1, -1, -1, -1]);
    expect(out[4]).toBeCloseTo(0.5, 5);
    rig.dispose();
  });
});
