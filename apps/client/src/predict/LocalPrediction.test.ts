/**
 * client-01 (client-predict-shared): local prediction reuses the shared
 * movement step — predicted positions equal direct sim stepping exactly.
 * client-02 (client-reconcile): reconciliation snaps to the authority and
 * replays unacked inputs.
 * roster-09 (client-tick-interp): the rendered pose is blended across the last
 * 30 Hz tick by a render alpha, so a 60 Hz display gets evenly-spaced motion
 * instead of a tick-step staircase.
 * roster-10 (client-teleport-snap): spawn / teleport collapse the blend segment
 * so a relocation never smears the hero across the arena.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { orderSystem } from "@ggd/shared/sim/systems/OrderSystem";
import { movementSystem } from "@ggd/shared/sim/systems/MovementSystem";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { LocalPrediction, seqLE } from "./LocalPrediction";

const SEAT = 3;
const SPAWN: Vec2 = { x: -56, z: 0 }; // zone 0 spawn
const MOVE_SPEED = 6.6;

/** Reference world: the same components, stepped with the same shared systems. */
function makeRefWorld(): { world: SimWorld; step: (order?: Order) => void } {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: SPAWN.x, z: SPAWN.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.team.set(id, { teamId: asTeamId(0), seatId: asSeatId(SEAT) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  world.health.set(id, { hp: 1, maxHp: 1, mana: 0, maxMana: 0, alive: true, shields: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = MOVE_SPEED;
  world.stats.set(id, { championId: "" as ChampionId, final, dirty: false, sources: [] });

  const step = (order?: Order): void => {
    const intents = new Map<SeatId, IntentFrame>();
    intents.set(asSeatId(SEAT), { order, commands: [] });
    world.rebuildGrid();
    orderSystem(world, intents);
    movementSystem(world);
    world.tick++;
  };
  return { world, step };
}

function refPos(world: SimWorld): Vec2 {
  const t = [...world.transform.values()][0]!;
  return { x: t.pos.x, z: t.pos.z };
}

function makePrediction(): LocalPrediction {
  const p = new LocalPrediction(SKELETON_ARENA);
  p.spawn({ seatId: SEAT, pos: SPAWN, zone: 0, moveSpeed: MOVE_SPEED });
  return p;
}

/** Long obstacle-free straight line inside zone 0 — constant-speed walking. */
const LONG_WALK: Order = { kind: "move", point: { x: -52, z: -18 } };

const TICK_MS = 1000 / 30;

/**
 * Emulate GameApp.frame's fixed-step loop + render alpha: accumulate real time,
 * drain whole ticks, then blend by the leftover. Returns the pose actually
 * DRAWN each frame plus how many sim ticks that frame ran.
 */
function runRenderLoop(
  pred: LocalPrediction,
  frames: number,
  frameMs: number,
): { x: number; z: number; ticks: number }[] {
  let acc = 0;
  const out: { x: number; z: number; ticks: number }[] = [];
  for (let f = 0; f < frames; f++) {
    acc += frameMs;
    let ticks = 0;
    while (acc >= TICK_MS) {
      pred.stepTick();
      acc -= TICK_MS;
      ticks++;
    }
    const pose = pred.renderPose(frameMs, acc / TICK_MS)!;
    out.push({ x: pose.x, z: pose.z, ticks });
  }
  return out;
}

const mean = (a: readonly number[]): number => a.reduce((p, c) => p + c, 0) / a.length;

describe("LocalPrediction — shared movement parity (client-01)", () => {
  it("predicted pos after N inputs equals direct sim stepping", () => {
    cover("client-predict-shared");
    const pred = makePrediction();
    const ref = makeRefWorld();

    const order: Order = { kind: "move", point: { x: -46, z: 6 } };
    pred.recordInput(1, order);
    ref.step(order);
    pred.stepTick();
    for (let i = 0; i < 19; i++) {
      ref.step();
      pred.stepTick();
    }

    const got = pred.predictedPos!;
    const want = refPos(ref.world);
    expect(got.x).toBeCloseTo(want.x, 12);
    expect(got.z).toBeCloseTo(want.z, 12);
    // it actually moved
    expect(Math.hypot(got.x - SPAWN.x, got.z - SPAWN.z)).toBeGreaterThan(1);
  });

  it("matches shared wall/boundary collision (order into the pillar)", () => {
    cover("client-predict-shared");
    const pred = makePrediction();
    const ref = makeRefWorld();

    // straight through the central pillar of zone 0 (circle at -40,0 r=2.5)
    const order: Order = { kind: "move", point: { x: -24, z: 0 } };
    pred.recordInput(1, order);
    ref.step(order);
    pred.stepTick();
    for (let i = 0; i < 90; i++) {
      ref.step();
      pred.stepTick();
    }
    const got = pred.predictedPos!;
    const want = refPos(ref.world);
    expect(got.x).toBeCloseTo(want.x, 12);
    expect(got.z).toBeCloseTo(want.z, 12);
  });
});

describe("LocalPrediction — reconciliation (client-02)", () => {
  it("replays unacked inputs on top of the authoritative position", () => {
    cover("client-reconcile");
    const pred = makePrediction();

    const orderA: Order = { kind: "move", point: { x: -50, z: 4 } };
    const orderB: Order = { kind: "move", point: { x: -52, z: -6 } };

    // client: input 1 (A) for 3 ticks, then input 2 (B) for 2 ticks
    pred.recordInput(1, orderA);
    pred.stepTick();
    pred.stepTick();
    pred.stepTick();
    pred.recordInput(2, orderB);
    pred.stepTick();
    pred.stepTick();

    // server: has processed input 1 (3 ticks of A) and acks seq=1
    const server = makeRefWorld();
    server.step(orderA);
    server.step();
    server.step();
    const authPos = refPos(server.world);

    pred.reconcile(authPos, 1);

    // expected: authoritative base + replay of input 2 (2 ticks of B)
    server.step(orderB);
    server.step();
    const want = refPos(server.world);

    const got = pred.predictedPos!;
    expect(got.x).toBeCloseTo(want.x, 12);
    expect(got.z).toBeCloseTo(want.z, 12);
  });

  it("fully-acked reconcile keeps steering with the acked order", () => {
    cover("client-reconcile");
    const pred = makePrediction();
    const order: Order = { kind: "move", point: { x: -48, z: 0 } };
    pred.recordInput(1, order);
    pred.stepTick();
    pred.stepTick();

    const server = makeRefWorld();
    server.step(order);
    server.step();
    const authPos = refPos(server.world);

    pred.reconcile(authPos, 1); // everything acked — snap to authority
    const got = pred.predictedPos!;
    expect(got.x).toBeCloseTo(authPos.x, 12);
    expect(got.z).toBeCloseTo(authPos.z, 12);

    // further prediction ticks keep moving toward the acked order's target
    pred.stepTick();
    server.step();
    const got2 = pred.predictedPos!;
    const want2 = refPos(server.world);
    expect(got2.x).toBeCloseTo(want2.x, 12);
    expect(got2.z).toBeCloseTo(want2.z, 12);
  });

  it("error-smooths the rendered pose toward the corrected position", () => {
    cover("client-reconcile");
    const pred = makePrediction();
    const order: Order = { kind: "move", point: { x: -50, z: 0 } };
    pred.recordInput(1, order);
    for (let i = 0; i < 5; i++) pred.stepTick();
    const shownBefore = pred.renderPose(0)!;

    // authority disagrees by ~1 unit sideways
    const authPos = { x: shownBefore.x, z: shownBefore.z + 1 };
    pred.reconcile(authPos, 1);

    // immediately after: rendered pose is still ~where it was (no pop)
    const shownAfter = pred.renderPose(0)!;
    expect(Math.abs(shownAfter.z - shownBefore.z)).toBeLessThan(0.2);

    // ~half-life later the offset has halved; after ~1s it's gone
    pred.renderPose(100);
    const settled = pred.renderPose(1000)!;
    expect(settled.z).toBeCloseTo(pred.predictedPos!.z, 2);
  });

  it("reconcile re-anchors the render blend without popping or stalling", () => {
    cover("client-reconcile");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);
    for (let i = 0; i < 5; i++) pred.stepTick();

    const alpha = 0.5;
    const shownBefore = pred.renderPose(0, alpha)!;
    const raw = pred.predictedPos!;
    // authority disagrees by half a unit sideways, and acks everything
    pred.reconcile({ x: raw.x, z: raw.z + 0.5 }, 1);
    const shownAfter = pred.renderPose(0, alpha)!;

    // NO POP: what we draw at the same blend phase is unchanged by the correction
    expect(shownAfter.x).toBeCloseTo(shownBefore.x, 9);
    expect(shownAfter.z).toBeCloseTo(shownBefore.z, 9);
    // NO STALL: the prev→cur segment survives the correction (it is translated,
    // not collapsed), so the hero keeps moving at the same rendered speed.
    const seg = Math.hypot(
      pred.predictedPos!.x - pred.prevTickPos!.x,
      pred.predictedPos!.z - pred.prevTickPos!.z,
    );
    expect(seg).toBeGreaterThan(0.1);
  });

  it("seqLE is wrap-aware in uint16 space", () => {
    cover("client-reconcile");
    expect(seqLE(1, 2)).toBe(true);
    expect(seqLE(2, 2)).toBe(true);
    expect(seqLE(3, 2)).toBe(false);
    expect(seqLE(65535, 1)).toBe(true); // wrapped
    expect(seqLE(1, 65535)).toBe(false);
  });
});

describe("LocalPrediction — render interpolation (roster-09)", () => {
  it("draws evenly-spaced motion at 60 fps instead of a 30 Hz staircase", () => {
    cover("client-tick-interp");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);

    // 62.5 fps (16 ms) on purpose: NOT an integer multiple of the 33.3 ms tick,
    // so ticks land on an irregular 2-or-3-frame cadence like the real loop.
    const frames = runRenderLoop(pred, 150, 16).slice(5); // drop pre-first-tick

    const deltas: number[] = [];
    const onTickFrame: boolean[] = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      deltas.push(Math.hypot(b.x - a.x, b.z - a.z));
      onTickFrame.push(b.ticks > 0);
    }
    // the harness must actually exercise both kinds of frame
    expect(onTickFrame.filter(Boolean).length).toBeGreaterThan(20);
    expect(onTickFrame.filter((t) => !t).length).toBeGreaterThan(20);

    const onTick = mean(deltas.filter((_, i) => onTickFrame[i]!));
    const offTick = mean(deltas.filter((_, i) => !onTickFrame[i]!));
    expect(onTick).toBeGreaterThan(0);
    expect(offTick).toBeGreaterThan(0); // raw-tick rendering makes this exactly 0
    // THE REGRESSION GUARD. Rendering the raw tick position made frames that ran
    // a tick move ~20x farther than frames that did not (measured 0.179 u vs
    // 0.0088 u). With the blend the two are the same frame-step.
    expect(Math.max(onTick, offTick) / Math.min(onTick, offTick)).toBeLessThan(1.5);

    // …and the whole per-frame distribution is tight (old code: CV ≈ 0.97)
    const m = mean(deltas);
    const sd = Math.sqrt(mean(deltas.map((d) => (d - m) * (d - m))));
    expect(sd / m).toBeLessThan(0.35);

    // distance travelled is UNCHANGED — only the temporal distribution moved
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    const travelled = Math.hypot(last.x - first.x, last.z - first.z);
    expect(travelled).toBeCloseTo(m * (frames.length - 1), 6);
  });

  it("samples one tick monotonically and evenly across alpha 0..1", () => {
    cover("client-tick-interp");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);
    pred.stepTick(); // stage the order + integrate
    pred.stepTick(); // now prev→cur is a full constant-speed tick step

    const from = pred.prevTickPos!;
    const to = pred.predictedPos!;
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeGreaterThan(0.1);

    const alphas = [0, 0.25, 0.5, 0.75, 1];
    const pts = alphas.map((a) => pred.renderPose(0, a)!);
    // the ends are exact — no drift at the segment boundaries
    expect(pts[0]!.x).toBeCloseTo(from.x, 12);
    expect(pts[0]!.z).toBeCloseTo(from.z, 12);
    expect(pts[4]!.x).toBeCloseTo(to.x, 12);
    expect(pts[4]!.z).toBeCloseTo(to.z, 12);

    const steps: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      steps.push(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z));
    }
    expect(Math.min(...steps)).toBeGreaterThan(0);
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.5);
  });

  it("clamps alpha to [0,1] — never extrapolates past the current tick", () => {
    cover("client-tick-interp");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);
    pred.stepTick();
    pred.stepTick();
    const from = pred.prevTickPos!;
    const to = pred.predictedPos!;

    const under = pred.renderPose(0, -5)!;
    expect(under.x).toBeCloseTo(from.x, 12);
    expect(under.z).toBeCloseTo(from.z, 12);
    const over = pred.renderPose(0, 42)!;
    expect(over.x).toBeCloseTo(to.x, 12);
    expect(over.z).toBeCloseTo(to.z, 12);
  });

  it("a stopped hero settles EXACTLY on its position for every alpha", () => {
    cover("client-tick-interp");
    const pred = makePrediction();
    pred.recordInput(1, { kind: "move", point: { x: -54, z: 0 } }); // 2 u away
    for (let i = 0; i < 40; i++) pred.stepTick(); // long past arrival

    const at = pred.predictedPos!;
    for (const a of [0, 0.33, 0.5, 1]) {
      const p = pred.renderPose(16, a)!;
      expect(p.x).toBe(at.x); // exact — no creep, no overshoot
      expect(p.z).toBe(at.z);
    }
  });

  it("facing comes from the CURRENT tick (aim is not rendered in the past)", () => {
    cover("client-tick-interp");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);
    pred.stepTick();
    pred.stepTick();
    const f = pred.facing!;
    const pose = pred.renderPose(0, 0)!; // fully "behind" in position
    expect(pose.fx).toBe(f.x);
    expect(pose.fz).toBe(f.z);
  });

  it("RENDER-ONLY: sampling any alpha never mutates sim state", () => {
    cover("client-tick-interp");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);
    pred.stepTick();
    pred.stepTick();

    // The blend must exist purely in the returned RenderPose. If it ever leaked
    // back into the transform, the shared sim would diverge from the server and
    // same-seed replay determinism would break — so snapshot the whole
    // authoritative surface and require it byte-identical after sampling.
    const t = [...pred.world.transform.values()][0]!; // the lone shadow entity
    const before = JSON.stringify({
      pos: t.pos,
      vel: t.vel,
      facing: t.facing,
      zone: t.zone,
      tick: pred.world.tick,
      raw: pred.predictedPos,
      prev: pred.prevTickPos,
    });

    for (const a of [0, 0.1, 0.5, 0.9, 1, -3, 7]) pred.renderPose(16, a);

    const after = JSON.stringify({
      pos: t.pos,
      vel: t.vel,
      facing: t.facing,
      zone: t.zone,
      tick: pred.world.tick,
      raw: pred.predictedPos,
      prev: pred.prevTickPos,
    });
    expect(after).toBe(before);
  });
});

describe("LocalPrediction — relocation snaps (roster-10)", () => {
  it("teleport collapses the blend: no smear across the arena", () => {
    cover("client-teleport-snap");
    const pred = makePrediction();
    pred.recordInput(1, LONG_WALK);
    pred.stepTick();
    pred.stepTick();

    const dest = { x: 24, z: 4 }; // zone 1 — ~80 units away
    pred.teleport(dest, 1);
    expect(pred.zone).toBe(1);
    expect(pred.prevTickPos!.x).toBe(dest.x);
    expect(pred.prevTickPos!.z).toBe(dest.z);

    // every blend phase renders the destination — the hero never occupies a
    // point between the old and the new position
    for (const a of [0, 0.25, 0.5, 1]) {
      const p = pred.renderPose(16, a)!;
      expect(p.x).toBe(dest.x);
      expect(p.z).toBe(dest.z);
    }
  });

  it("spawn has no bogus blend source", () => {
    cover("client-teleport-snap");
    const pred = makePrediction();
    expect(pred.prevTickPos!.x).toBe(SPAWN.x);
    expect(pred.prevTickPos!.z).toBe(SPAWN.z);
    const p = pred.renderPose(16, 0)!;
    expect(p.x).toBe(SPAWN.x);
    expect(p.z).toBe(SPAWN.z);
  });

  it("a despawned shadow returns no pose instead of throwing", () => {
    cover("client-teleport-snap");
    const pred = makePrediction();
    pred.stepTick();
    pred.despawn();
    expect(pred.renderPose(16, 0.5)).toBeNull();
    expect(pred.prevTickPos).toBeNull();
    expect(() => pred.stepTick()).not.toThrow();
  });
});
