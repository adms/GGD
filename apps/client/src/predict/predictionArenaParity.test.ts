/**
 * PREDICTION ↔ AUTHORITY ARENA PARITY
 *
 * owner, 2026-07-27: 「第十回合大混戰 畫面跟人物會亂抖動」/「點到別的場地會拉扯」
 *
 * ROOT CAUSE. `GameApp` builds its `LocalPrediction` shadow once, as a class
 * field, with `SKELETON_ARENA`; `applyArena` swapped the render geometry and the
 * minimap onto each round's map but never told the shadow. `MovementSystem`
 * runs `clampToBoundary` UNCONDITIONALLY on every transform every tick — even a
 * body standing perfectly still — so the shadow kept being pulled onto a circle
 * the server had stopped using.
 *
 * WHY ONLY ROUND 10. All five rotation arenas ship the identical pair of zones,
 * (-40,0) r24 and (40,0) r24 — the same geometry as SKELETON_ARENA. Rounds 1–9
 * therefore agreed BY COINCIDENCE. `arena.royale` is a single (0,0) r42 zone, so
 * round 10 is the first round where the two circles differ at all.
 *
 * WHY IT READS AS 「拉扯」 AND 「點到別的場地」. The clamp centre the shadow was
 * still using is (-40,0) — literally the WEST DUEL ARENA of rounds 1–9. A body
 * standing at (30,0) was yanked to (-16.6,0) every tick, 46.6 u away, and every
 * snapshot hard-teleported it back. The owner's instinct was not a metaphor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ WHAT THIS FILE USED TO BE, AND WHY THAT WAS NOT A GUARD
 *
 * The first version was a REPRO: it asserted `expect(r10.maxErr).toBeGreaterThan(20)`
 * — the DEFECT. A test that demands the bug still exists goes red when you fix it
 * and green when you break it. It documents; it does not guard.
 *
 * ⚠️ AND THE SUBTLER PROBLEM: every case built its own `new LocalPrediction(...)`
 * by hand. `LocalPrediction.setArena` could therefore be perfectly correct and
 * NEVER CALLED BY ANYONE, and all of them would still pass. That is this repo's
 * failure shape ⑤ — the subject under test is not the thing that ships. The last
 * describe block closes it by running the REAL `GameApp.applyArena`.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
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

interface Run {
  maxErr: number;
  meanErr: number;
  maxRenderJump: number;
  teleports: number;
}

/**
 * Drive the real authority and the real shadow side by side for `ticks`.
 *
 * `shadowArena` is the whole experiment: pass the SERVER's arena to model the
 * shipped behaviour (GameApp now calls `prediction.setArena(def)` on every map
 * change), or pass SKELETON_ARENA to reproduce the pre-fix bug.
 */
function run(
  serverArena: ArenaDef,
  spawn: { x: number; z: number },
  zone: number,
  target: { x: number; z: number },
  shadowArena: ArenaDef,
  ticks = 90,
): Run {
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

  // Exactly what GameApp.ts:311 constructs …
  const pred = new LocalPrediction(SKELETON_ARENA);
  // … and exactly what GameApp.applyArena now does on every map change.
  pred.setArena(shadowArena);
  pred.spawn({ seatId: 0, pos: spawn, zone, moveSpeed, attackRange });

  const order: Order = { kind: "move", point: { x: target.x, z: target.z } };
  let errSum = 0;
  let maxErr = 0;
  let maxJump = 0;
  let teleports = 0;
  let prevRender = { ...pred.predictedPos! };

  for (let t = 0; t < ticks; t++) {
    if (t === 0) pred.recordInput(1, order);
    pred.stepTick();
    const sh = pred.predictedPos!;

    const intents = new Map<SeatId, IntentFrame>();
    intents.set(seat, t === 0 ? { order, commands: [] } : { commands: [] });
    sw.step(intents);
    const st = sw.transform.get(id)!.pos;

    const e = Math.hypot(st.x - sh.x, st.z - sh.z);
    // GameApp reconciles per snapshot; > TELEPORT_EPS takes the hard-snap branch
    if (e > TELEPORT_EPS) teleports++;
    errSum += e;
    maxErr = Math.max(maxErr, e);
    pred.reconcile({ x: st.x, z: st.z }, 1);

    const rp = pred.predictedPos!;
    maxJump = Math.max(maxJump, Math.hypot(rp.x - prevRender.x, rp.z - prevRender.z));
    prevRender = { ...rp };
  }

  return { maxErr, meanErr: errSum / ticks, maxRenderJump: maxJump, teleports };
}

/** Round 10: royale field, spawn on the east ring, walk to the west rim. */
const royale = (shadow: ArenaDef): Run => run(ROYALE_ARENA, { x: 30, z: 0 }, 0, { x: -30, z: 0 }, shadow);
/** Round 9 control: duel geometry, zone 1 @ (40,0) r24. */
const duel = (shadow: ArenaDef): Run => run(SKELETON_ARENA, { x: 56, z: 0 }, 1, { x: 24, z: 0 }, shadow);

describe("the shadow clamps to the SERVER's arena", () => {
  it("round 10 tracks the authority — no divergence, no teleports", () => {
    const r10 = royale(ROYALE_ARENA);
    // The whole bug, expressed as its absence. Pre-fix these were 46.53 and 89.
    expect(r10.maxErr, "shadow diverged from authority on the royale field").toBeLessThan(0.5);
    expect(r10.teleports, "the reconcile is hard-snapping instead of tracking").toBe(0);
    expect(r10.maxRenderJump, "the rendered pose jumps between frames — this IS the jitter").toBeLessThan(1);
  });

  it("round 9 is unchanged — the fix did not disturb the rounds that worked", () => {
    const r9 = duel(SKELETON_ARENA);
    expect(r9.maxErr).toBeLessThan(0.5);
    expect(r9.teleports).toBe(0);
  });

  it("REGRESSION PROOF: leaving the shadow on the old arena brings the bug back", () => {
    // ⚠️ The measurement's own sensitivity check. If someone "simplifies" `run`
    // until it can no longer see divergence, every assertion above turns vacuous
    // and stays green. This one demands the detector still fires.
    const broken = royale(SKELETON_ARENA);
    expect(broken.maxErr, "the detector can no longer see the defect it exists for").toBeGreaterThan(20);
    expect(broken.teleports).toBeGreaterThan(50);
  });

  it("the mechanism: ONE tick, standing perfectly still, yanks the body 46 u", () => {
    // No move order at all. This is `MovementSystem`'s unconditional
    // clampToBoundary, isolated — it is why even an idle champion shook.
    const pred = new LocalPrediction(SKELETON_ARENA);
    pred.spawn({ seatId: 0, pos: { x: 30, z: 0 }, zone: 0, moveSpeed: 3.5, attackRange: 0 });
    pred.stepTick();
    expect(Math.hypot(pred.predictedPos!.x - 30, pred.predictedPos!.z)).toBeGreaterThan(40);

    // …and the same tick with the arena corrected does not move the body at all.
    const fixed = new LocalPrediction(SKELETON_ARENA);
    fixed.setArena(ROYALE_ARENA);
    fixed.spawn({ seatId: 0, pos: { x: 30, z: 0 }, zone: 0, moveSpeed: 3.5, attackRange: 0 });
    fixed.stepTick();
    expect(Math.hypot(fixed.predictedPos!.x - 30, fixed.predictedPos!.z)).toBeLessThan(0.01);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE WIRING — does the thing that SHIPS actually call it?
 *
 * Everything above builds its own LocalPrediction and calls setArena by hand.
 * All of it passes with `GameApp.applyArena` never touching the shadow, which is
 * precisely the bug. This block runs the REAL `applyArena` off the prototype
 * (the technique killCombo.test.ts uses for the frame-loop drain) and asserts
 * the shadow received the SAME ArenaDef the minimap and renderer did.
 *
 * Not a source scan: `expect(src).toMatch(/setArena/)` would prove the line was
 * typed, not that it runs on the path a map change takes.
 * ═══════════════════════════════════════════════════════════════════════════ */

vi.mock("../render/ArenaScene", () => ({
  buildArena: () => ({}),
  disposeArena: () => {},
  dressArena: () => Promise.resolve(),
}));

describe("GameApp.applyArena hands the shadow the same arena it renders", () => {
  it("calls prediction.setArena with the def that reaches frameBus", async () => {
    const { GameApp } = await import("../GameApp");
    const { frameBus } = await import("../frameBus");
    const { arenaDefFromDoc } = await import("@ggd/shared/sim/world/ArenaDef");
    const fs = await import("node:fs");

    const doc = JSON.parse(
      fs.readFileSync(new URL("../../../../content/arenas/arena.royale.json", import.meta.url), "utf8"),
    );
    const expected = arenaDefFromDoc(doc);

    const seen: ArenaDef[] = [];
    const self = {
      disposed: false,
      appliedMapId: "arena.skeleton",
      applyingMapId: null as string | null,
      arenaHandles: {},
      assets: {},
      renderer: { scene: {} },
      lighting: { applyScenery: () => {}, animate: () => {} },
      // ⚠️ `applyArena` 會把 ContentDb 上的**每一個政策讀取器**都叫一次，而它們
      // 全都在同一個 `.then()` 裡 —— 少一個就是拋例外、整條 promise 靜默死掉、
      // 這張場地從頭到尾沒套上（`arenaId` 停在 null）。2026-08-18 GH#362 加
      // `arenaScenery()` 時就是這樣紅的，⛔ 而在此之前那個 `.catch` 連一行 log 都沒有。
      // ⇒ 這個假物件**必須**跟得上真的介面；它紅了代表真的呼叫端也可能少東西。
      contentDb: {
        loadArena: () => Promise.resolve(doc),
        arenaScenery: () => ({ enabled: false, maxPropsPerZone: 0, animateLights: false }),
        arenaFire: () => ({}),
        arenaBackdrop: () => ({}),
      },
      prediction: { setArena: (a: ArenaDef) => seen.push(a) },
    };

    // the real method, on the real prototype
    (GameApp.prototype as unknown as { applyArena: (m: string) => void }).applyArena.call(self, "arena.royale");
    await new Promise((r) => setTimeout(r, 0)); // let the loadArena promise settle

    expect(seen.length, "applyArena never told the prediction shadow about the new arena").toBe(1);
    expect(seen[0]!.id).toBe(expected.id);
    // the shadow's arena and the MINIMAP's arena must agree, not be two
    // independently-derived values that can drift apart
    expect(frameBus.arenaId).toBe(seen[0]!.id);
    // and it must be the royale geometry specifically, not a skeleton fallback
    expect(seen[0]!.zones).toHaveLength(1);
    expect(seen[0]!.zones[0]!.boundaryRadius).toBeGreaterThan(40);
  });
});
