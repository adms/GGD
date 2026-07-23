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
import { TARGET_HEIGHT } from "./views/ChampionView";
import {
  ALLY_ANCHOR_Y,
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
  poolColourAt,
  projectFocusSource,
  rampToward,
  smoothstep,
  type FocusEntity,
  type FocusGateInput,
} from "./deathFocus";

/** Champion body radius — packages/shared/src/sim/spawnChampion.ts (`radius: 0.6`). */
const BODY_RADIUS = 0.6;
/** Every shipped arena zone is `boundaryRadius: 24` (content/arenas/*.json). */
const ZONE_RADIUS = 24;

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

/**
 * The REQUIREMENT itself: 「死亡觀戰時整個畫面去飽和，只有自己的隊友保持有顏色」.
 * The look is a shader, so it cannot be screenshotted headlessly — but the pool
 * falloff is pure math, and `poolColourAt` mirrors the GLSL exactly. These pin
 * the two halves that a constant alone does not: a teammate is FULLY coloured,
 * and an enemy standing off them is NOT.
 */
describe("death-focus keeps teammates coloured and enemies grey", () => {
  /** Furthest point of a standing champion from the chest-anchored pool centre. */
  const bodyReach = Math.hypot(BODY_RADIUS, ALLY_ANCHOR_Y);

  it("covers a champion's whole body in the FULLY coloured core", () => {
    cover("death-focus-sources");
    // head, feet and both foot corners of a TARGET_HEIGHT body at ALLY_ANCHOR_Y
    const corners = [
      Math.abs(TARGET_HEIGHT - ALLY_ANCHOR_Y), // top of the head
      ALLY_ANCHOR_Y, // the feet
      BODY_RADIUS, // the flanks, at chest height
      bodyReach, // a foot corner — the worst case
    ];
    for (const d of corners) {
      expect(d).toBeLessThan(ALLY_RADIUS_FULL);
      expect(poolColourAt(d, ALLY_RADIUS_FULL, ALLY_RADIUS_FADE)).toBe(1);
    }
    // and with margin left over for the deliberately oversized champions (#150)
    expect(ALLY_RADIUS_FULL / bodyReach).toBeGreaterThan(1.15);
  });

  it("desaturates an enemy who is not in contact with your teammate", () => {
    cover("death-focus-sources");
    // two champions in melee CONTACT are 2*BODY_RADIUS apart — the one case a
    // circle provably cannot separate, and the documented residual limit
    const contact = BODY_RADIUS * 2;
    expect(poolColourAt(contact, ALLY_RADIUS_FULL, ALLY_RADIUS_FADE)).toBe(1);

    // one body-length back is already mostly grey ...
    expect(poolColourAt(2.5, ALLY_RADIUS_FULL, ALLY_RADIUS_FADE)).toBeLessThan(0.3);
    // ... and anything at or beyond the fade radius is FULLY desaturated
    for (const d of [ALLY_RADIUS_FADE, 4, 6, 11, ZONE_RADIUS]) {
      expect(poolColourAt(d, ALLY_RADIUS_FULL, ALLY_RADIUS_FADE)).toBe(0);
    }
  });

  it("leaves the overwhelming majority of the duel zone desaturated", () => {
    cover("death-focus-sources");
    // The whole scene must READ as drained. Measured on the REAL worst case
    // built through buildFocusSources — my own revive circle being channelled
    // PLUS two living teammates (FOCUS_MAX_SOURCES caps the pass at 4 pools) —
    // rather than on ally pools alone, because the revive circle is the largest
    // single pool and excluding it is how a bubble hides from this bar.
    const out = makeFocusSourcePool();
    const worst: FocusEntity[] = [
      {
        id: 90,
        kind: KIND_REVIVE_CIRCLE,
        seatId: ME,
        teamId: 1,
        alive: true,
        x: 0,
        z: 0,
        revive: { radius: 2, channelling: true },
      },
      { id: 1, kind: KIND_CHAMPION, seatId: 1, teamId: 1, alive: true, x: 2, z: 0 },
      { id: 2, kind: KIND_CHAMPION, seatId: 2, teamId: 1, alive: true, x: 0, z: 2 },
      { id: 3, kind: KIND_CHAMPION, seatId: 3, teamId: 1, alive: true, x: 3, z: 3 },
    ];
    const n = buildFocusSources(ME, ME, 1, worst, noPos, out);
    let coloured = 0;
    for (let i = 0; i < n; i++) coloured += Math.PI * out[i]!.rFade * out[i]!.rFade;
    const zoneArea = Math.PI * ZONE_RADIUS * ZONE_RADIUS;
    // the 4u/11u tuning put the ally pools ALONE at 63%; anything above a few
    // percent means the "desaturated" scene is mostly still in colour.
    // Ships at 7.8% = (4.25² + 3·3²)/24²  — the bar is deliberately just above.
    expect(coloured / zoneArea).toBeLessThan(0.08);
  });

  it("never exempts an enemy just for being in the same fight", () => {
    cover("death-focus-sources");
    // regression guard for the original 4u/11u tuning, which fully coloured
    // every enemy within 4u and left one at 6u ~80% coloured
    expect(ALLY_RADIUS_FULL).toBeLessThan(2);
    expect(ALLY_RADIUS_FADE).toBeLessThan(4);
    expect(poolColourAt(6, ALLY_RADIUS_FULL, ALLY_RADIUS_FADE)).toBe(0);
  });

  it("mirrors the GLSL smoothstep, clamping outside the edges", () => {
    cover("death-focus-sources");
    expect(smoothstep(1, 3, 0)).toBe(0);
    expect(smoothstep(1, 3, 1)).toBe(0);
    expect(smoothstep(1, 3, 2)).toBeCloseTo(0.5, 12);
    expect(smoothstep(1, 3, 3)).toBe(1);
    expect(smoothstep(1, 3, 99)).toBe(1);
    // an unused slot contributes nothing no matter where it sits
    expect(poolColourAt(0, 1, 3, 0)).toBe(0);
  });

  it("keeps the revive circle reading as a ring, not a bubble", () => {
    cover("death-focus-sources");
    const out = makeFocusSourcePool();
    const circle = (channelling: boolean): FocusEntity => ({
      id: 90,
      kind: KIND_REVIVE_CIRCLE,
      seatId: ME,
      teamId: 1,
      alive: true,
      x: 0,
      z: 0,
      revive: { radius: 2, channelling },
    });

    // NOTE: `out` is a reused pool, so snapshot the numbers — holding a
    // reference across a second buildFocusSources would compare a slot to itself
    buildFocusSources(ME, ME, 1, [circle(false)], noPos, out);
    const s = { ...out[0]! };
    // ABSOLUTE world distances, not a restatement of smoothstep: the revive
    // circle is where enemies CAMP, so the same enemy who is grey next to a
    // living teammate must be grey next to your corpse. The old 0.75/2.75
    // margins left this at 0.81 — this is the assertion that would have caught
    // it, and the reason it is written in the same shape as the ally test.
    expect(poolColourAt(3, s.rFull, s.rFade, s.weight)).toBeLessThan(0.3);
    expect(poolColourAt(ALLY_RADIUS_FADE + 1, s.rFull, s.rFade, s.weight)).toBe(0);
    // the whole pool is on the ally silhouette scale, not a bubble around it
    expect(s.rFade).toBeLessThanOrEqual(ALLY_RADIUS_FADE + 0.5);

    // …and a teammate CHANNELLING widens it visibly but not past that scale
    buildFocusSources(ME, ME, 1, [circle(true)], noPos, out);
    const ch = out[0]!;
    expect(ch.rFade).toBeGreaterThan(s.rFade);
    expect(poolColourAt(ALLY_RADIUS_FADE + 1.5, ch.rFull, ch.rFade, ch.weight)).toBe(0);
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
