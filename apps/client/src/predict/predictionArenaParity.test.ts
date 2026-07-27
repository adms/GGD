/**
 * PREDICTION↔AUTHORITY ARENA PARITY (owner report 2026-07-27: 「第十回合大混戰
 * 畫面跟人物會亂抖動」/「點到別的場地會拉扯」).
 *
 * GameApp builds its LocalPrediction shadow with SKELETON_ARENA once, as a class
 * field, and `applyArena` never hands the shadow the arena it just swapped the
 * render/minimap onto. Rounds 1-9 survive by COINCIDENCE — every rotation arena
 * ships the same two zones at (-40,0)/(40,0) r=24 as the skeleton — but round 10
 * swaps the server onto arena.royale (ONE zone at (0,0) r=42) and the shadow keeps
 * clamping to a 24-radius disc centred 40 u west of the finale field.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA, ROYALE_ARENA, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "@ggd/shared/ids";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";
import { LocalPrediction } from "./LocalPrediction";

beforeAll(() => registerSkeletonContent());

const TELEPORT_EPS = 6; // GameApp.ts:157
const TICK_MS = 1000 / 30;

interface Run {
  maxErr: number;
  meanErr: number;
  maxShadowStep: number; // biggest single-tick displacement of the shadow
  maxRenderJump: number; // biggest frame-to-frame jump of the RENDERED pose
  teleports: number;
  finalServer: { x: number; z: number };
  finalShadow: { x: number; z: number };
}

function run(serverArena: ArenaDef, spawn: { x: number; z: number }, zone: number, target: { x: number; z: number }, ticks = 90): Run {
  // ---- server authority
  const sw = new SimWorld(serverArena, 1);
  const seat = asSeatId(0);
  const id = spawnChampion(sw, {
    championId: "sela" as ChampionId,
    seatId: seat,
    teamId: asTeamId(0),
    pos: spawn,
    zone,
  });
  sw.step(new Map()); // let the stat pipeline settle
  const moveSpeed = sw.stats.get(id)!.final[Stat.MoveSpeed];
  const attackRange = sw.stats.get(id)!.final[Stat.AttackRange];

  // ---- client: EXACTLY what GameApp.ts:311 constructs
  const pred = new LocalPrediction(SKELETON_ARENA);
  pred.spawn({ seatId: 0, pos: spawn, zone, moveSpeed, attackRange });

  const order: Order = { kind: "move", point: { x: target.x, z: target.z } };
  let pending: { x: number; z: number; zone: number; ack: number } | null = null;
  let errSum = 0;
  let maxErr = 0;
  let maxStep = 0;
  let maxRenderJump = 0;
  let teleports = 0;
  let prevShadow = { ...spawn };
  let prevRender = { ...spawn };

  for (let t = 0; t < ticks; t++) {
    // GameApp step 3: apply the authoritative update FIRST
    if (pending) {
      const auth = { x: pending.x, z: pending.z };
      if (pending.zone !== pred.zone || pred.errorTo(auth) > TELEPORT_EPS) {
        pred.teleport(auth, pending.zone);
        teleports++;
      } else {
        pred.reconcile(auth, pending.ack);
      }
      pending = null;
    }
    if (t === 0) pred.recordInput(1, order);
    pred.stepTick();

    // server tick with the same order (issued once, latest-wins nav)
    const intents = new Map<SeatId, IntentFrame>();
    intents.set(seat, t === 0 ? { order, commands: [] } : { commands: [] });
    sw.step(intents);

    const st = sw.transform.get(id)!.pos;
    const sh = pred.predictedPos!;
    const e = Math.hypot(st.x - sh.x, st.z - sh.z);
    errSum += e;
    maxErr = Math.max(maxErr, e);
    maxStep = Math.max(maxStep, Math.hypot(sh.x - prevShadow.x, sh.z - prevShadow.z));
    prevShadow = { ...sh };

    const rp = pred.renderPose(TICK_MS, 1)!;
    maxRenderJump = Math.max(maxRenderJump, Math.hypot(rp.x - prevRender.x, rp.z - prevRender.z));
    prevRender = { x: rp.x, z: rp.z };

    pending = { x: st.x, z: st.z, zone: sw.transform.get(id)!.zone, ack: 1 };
  }

  return {
    maxErr,
    meanErr: errSum / ticks,
    maxShadowStep: maxStep,
    maxRenderJump,
    teleports,
    finalServer: { ...sw.transform.get(id)!.pos },
    finalShadow: { ...pred.predictedPos! },
  };
}

describe("REPRO: royale-round prediction tug-of-war", () => {
  it("round 9 control (duel arena, zone 1) vs round 10 (royale, zone 0)", () => {
    // ---- CONTROL: round 9. Server = SKELETON duel geometry, zone 1 @ (40,0) r24.
    // (every rotation arena ships the SAME two zones: (-40,0)/(40,0), r=24)
    const r9 = run(SKELETON_ARENA, { x: 56, z: 0 }, 1, { x: 24, z: 0 });

    // ---- ROYALE: round 10. Server = ROYALE_ARENA, one zone @ (0,0) r42.
    // Spawn = the EAST cluster's middle point (ROYALE_SPAWNS[1] = {30,0}).
    // Move order: straight across the finale field to the WEST rim.
    const r10 = run(ROYALE_ARENA, { x: 30, z: 0 }, 0, { x: -30, z: 0 });

    // eslint-disable-next-line no-console
    console.log("ROUND 9  (control):", JSON.stringify(r9, null, 1));
    // eslint-disable-next-line no-console
    console.log("ROUND 10 (royale) :", JSON.stringify(r10, null, 1));

    expect(r9.maxErr).toBeLessThan(0.5);
    expect(r10.maxErr).toBeGreaterThan(20);
  });

  it("MUTATION CHECK: giving the shadow the SERVER's arena kills the divergence", () => {
    // Same royale scenario, but the shadow world is built on ROYALE_ARENA — the
    // one-line fix. If this does NOT collapse to ~0, the diagnosis is wrong.
    const sw = new SimWorld(ROYALE_ARENA, 1);
    const seat = asSeatId(0);
    const id = spawnChampion(sw, {
      championId: "sela" as ChampionId,
      seatId: seat,
      teamId: asTeamId(0),
      pos: { x: 30, z: 0 },
      zone: 0,
    });
    sw.step(new Map());
    const pred = new LocalPrediction(ROYALE_ARENA); // <-- the only difference
    pred.spawn({
      seatId: 0,
      pos: { x: 30, z: 0 },
      zone: 0,
      moveSpeed: sw.stats.get(id)!.final[Stat.MoveSpeed],
      attackRange: sw.stats.get(id)!.final[Stat.AttackRange],
    });
    const order: Order = { kind: "move", point: { x: -30, z: 0 } };
    let maxErr = 0;
    for (let t = 0; t < 90; t++) {
      if (t === 0) pred.recordInput(1, order);
      pred.stepTick();
      const intents = new Map<SeatId, IntentFrame>();
      intents.set(seat, t === 0 ? { order, commands: [] } : { commands: [] });
      sw.step(intents);
      const st = sw.transform.get(id)!.pos;
      const sh = pred.predictedPos!;
      maxErr = Math.max(maxErr, Math.hypot(st.x - sh.x, st.z - sh.z));
      pred.reconcile({ x: st.x, z: st.z }, 1);
    }
    // eslint-disable-next-line no-console
    console.log("ROYALE with CORRECT shadow arena — maxErr:", maxErr);
    expect(maxErr).toBeLessThan(0.5);
  });

  it("the raw clamp: one tick in the wrong zone yanks the body 46 u", () => {
    const pred = new LocalPrediction(SKELETON_ARENA);
    pred.spawn({ seatId: 0, pos: { x: 30, z: 0 }, zone: 0, moveSpeed: 3.5, attackRange: 0 });
    pred.stepTick(); // NO order at all — the body is standing still
    const p = pred.predictedPos!;
    // eslint-disable-next-line no-console
    console.log("standing still, 1 tick:", JSON.stringify(p));
    expect(Math.hypot(p.x - 30, p.z - 0)).toBeGreaterThan(40);
  });
});

describe("REPRO: rounds 1-9 obstacle-only mismatch (same root cause, smaller)", () => {
  it("walking into a godie pillar the shadow does not know about", async () => {
    const fs = await import("node:fs");
    const { arenaDefFromDoc } = await import("@ggd/shared/sim/world/ArenaDef");
    const doc = JSON.parse(fs.readFileSync(new URL("../../../../content/arenas/arena.godie.json", import.meta.url), "utf8"));
    const def = arenaDefFromDoc(doc);
    const z0 = def.zones[0]!;
    const skelObs = SKELETON_ARENA.zones[0]!.obstacles;
    // pick a godie pillar the skeleton does NOT have
    const pillar = z0.obstacles.find(
      (o) =>
        o.kind === "circle" &&
        !skelObs.some((s) => s.kind === "circle" && Math.hypot(s.center.x - o.center.x, s.center.z - o.center.z) < 3),
    )! as { kind: "circle"; center: { x: number; z: number }; radius: number };
    // start 10 u east of it, walk straight through it
    const start = { x: pillar.center.x + 10, z: pillar.center.z };
    const target = { x: pillar.center.x - 10, z: pillar.center.z };
    const r = run(def, start, 0, target, 120);
    // eslint-disable-next-line no-console
    console.log("R1-9 pillar (", JSON.stringify(pillar.center), "r=", pillar.radius, "):", JSON.stringify(r));
    expect(r.maxErr).toBeGreaterThan(0);
  });
});
