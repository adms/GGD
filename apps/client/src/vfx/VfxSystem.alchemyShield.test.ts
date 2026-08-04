/**
 * 鍊金術之盾 (godie-i06q) —— THE CLIENT END OF THE WIRE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 *
 * `taunt` and `goldGrant` shipped as `world.emit` calls with no fan-out entry
 * and no consumer ANYWHERE: `grep -rn goldGrant apps` found the emit site and
 * nothing else. Adding them to `FANNED_OUT_EVENT_TYPES` alone would have moved
 * the defect one layer out rather than fixing it — a classified event that
 * nobody renders is still 失敗形態 ②. This file is the proof that something
 * actually draws when they arrive.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT IT ASSERTS, AND WHY IN THIS SHAPE
 *
 * Not 「the switch has a case」 (that is a source scan, 失敗形態 ⑥) and not
 * 「a particle system exists」 (that is a property, ⑦). It runs the REAL
 * `VfxSystem.handleEvent` against a real Babylon NullEngine scene and reads the
 * EMITTER POSITION back off the pooled `ParticleSystem` — i.e. WHERE ON THE
 * GROUND the beat was drawn — because the whole bug class here is a beat that
 * is computed and then lands nowhere a player is looking.
 *
 * ⭐ THE ANCHOR IS THE POINT. Both events are anchored on an ENTITY, not on x/z
 * (unlike the coin pair, whose entity is already destroyed). So `entityPos`
 * below answers with a DIFFERENT position per id and `null` for anyone else:
 * that is what makes 「it drew on the taunter」 distinguishable from 「it drew on
 * something」. Reading `ev.data.count` as an id, or `source` where `target` was
 * meant, resolves to `null` and draws nothing — the tests go red rather than
 * passing on a burst at the wrong body.
 *
 * PAIRED WITH `apps/game-server/src/net/alchemyShieldWire.test.ts`, which runs
 * the REAL sim effects and pins the field names this file reads. A rename at the
 * emit site turns that file red; a deleted case turns this one red.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time (Node
// exposes a non-functional localStorage global) — stub the live params
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { VfxDoc } from "@ggd/shared/content";
import { impactComposerFor } from "./HitSpark";
import { VfxSystem, TAUNT_VFX, GOLD_GRANT_VFX } from "./VfxSystem";

const TAG = "taunt-forced-targeting";

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

const doc = (id: string): VfxDoc => ({
  id,
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 8,
  lifetimeSec: { min: 0.2, max: 0.5 },
  size: { start: 0.4, end: 0.1 },
  color: { start: [1, 0.6, 0.2, 0.9], end: [0.4, 0.2, 0.05, 0] },
  blendMode: "additive",
});

/** THE TAUNTER / THE PAYEE, and nobody else has a position. */
const SHIELD_HOLDER = 41;
const SOMEONE_ELSE = 77;
const positions = new Map<number, { x: number; z: number }>([
  [SHIELD_HOLDER, { x: -6, z: 14 }],
  [SOMEONE_ELSE, { x: 30, z: -30 }],
]);

function makeSystem(): { vfx: VfxSystem; requested: string[] } {
  const requested: string[] = [];
  const vfx = new VfxSystem(scene, {
    entityPos: (id) => positions.get(id) ?? null,
    vfxDoc: (key) => {
      requested.push(key);
      return doc(key);
    },
  });
  return { vfx, requested };
}

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });

/** The newest pooled system for `key`, or undefined when nothing played. */
function played(key: string): Vector3 | undefined {
  const ps = [...scene.particleSystems].reverse().find((p) => p.name === `vfx-${key}`);
  return ps ? (ps.emitter as Vector3) : undefined;
}

describe("嘲弄 — the pull is drawn on the taunter", () => {
  it("plays the aggro ring at the TAUNTER's live position", () => {
    cover(TAG);
    const { vfx, requested } = makeSystem();
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    // the payload the sim really emits: source / count / durationSec / origin.
    // `count` is 3 here and NO entity has that id, so a consumer that read the
    // wrong field would resolve to null and draw nothing.
    vfx.handleEvent(
      ev("taunt", { source: SHIELD_HOLDER, count: 3, durationSec: 0.5, origin: "hook:item:godie-i06q" }),
      1000,
    );
    expect(requested).toContain(TAUNT_VFX);
    const at = played(TAUNT_VFX);
    expect(at, "no ring was drawn for the taunt at all").toBeDefined();
    // ON THE TAUNTER — not at the origin, not at the other body.
    expect(at!.x).toBe(-6);
    expect(at!.z).toBe(14);
    // and the layered pop lands on the same body, at taunt weight (not `ex`:
    // a taunt must not out-shout a kill)
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]!.slice(0, 3)).toEqual(["heavy", -6, 14]);
    // the 挑釁 tint, not the gold one — the two beats must not read alike
    const opts = fire.mock.calls[0]![4] as { tint?: readonly number[] };
    expect(opts.tint![0]).toBeGreaterThan(0.9); // hot red
    expect(opts.tint![2]).toBeLessThan(0.35); // …with almost no blue
    fire.mockRestore();
    vfx.dispose();
  });

  it("draws nothing when the taunter has no rendered body (out of view / just died)", () => {
    cover(TAG);
    const { vfx, requested } = makeSystem();
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    vfx.handleEvent(ev("taunt", { source: 999, count: 2, durationSec: 0.5 }), 2000);
    // ⚠️ FIX #131's rule: never place a pooled system at a non-finite position.
    // A taunter the renderer has no anchor for must produce silence, not a
    // burst parked at the clamped screen corner.
    expect(requested).not.toContain(TAUNT_VFX);
    expect(fire).not.toHaveBeenCalled();
    fire.mockRestore();
    vfx.dispose();
  });
});

describe("煉金術 — the payout is drawn on the payee", () => {
  it("plays the gold burst on the entity named by `target`", () => {
    cover(TAG);
    const { vfx, requested } = makeSystem();
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    // ⚠️ `target` is the PAYEE (grantGold.ts loops over payees), NOT the enemy
    // that turned into gold — the victim's id is not on the payload at all.
    vfx.handleEvent(
      ev("goldGrant", { target: SHIELD_HOLDER, amount: 7, origin: "hook:item:godie-i06q" }),
      3000,
    );
    expect(requested).toContain(GOLD_GRANT_VFX);
    const at = played(GOLD_GRANT_VFX);
    expect(at, "no burst was drawn for the payout at all").toBeDefined();
    expect(at!.x).toBe(-6);
    expect(at!.z).toBe(14);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0]!.slice(0, 3)).toEqual(["heavy", -6, 14]);
    // gold, not the taunt's red: strong red AND green, which the 挑釁 tint is not
    const opts = fire.mock.calls[0]![4] as { tint?: readonly number[] };
    expect(opts.tint![1]).toBeGreaterThan(0.7);
    fire.mockRestore();
    vfx.dispose();
  });

  it("stays silent on a ZERO/absent payout — and a ZERO one is something the sim REALLY emits", () => {
    cover(TAG);
    const { vfx, requested } = makeSystem();
    const fire = vi.spyOn(impactComposerFor(scene), "fire");
    // ⚠️ CORRECTED TWICE — 第三守則 in both directions, so read the whole thing.
    //
    // v1 (原始) 「the 殭屍 case, which is a real emit」 —— 假的,那時殭屍的等級
    //           讀成 0,`amount <= 0` 早退,根本沒有事件。
    // v2 (2026-08-01) 「a malformed wire payload, NOT something the sim emits」
    //           —— 修對了 v1,但把結論寫得太滿,而**它現在也是假的**。
    // v3 (2026-08-04, 這一版) 金錢發放倍率上線之後,那道閘擋的是**請求值**:
    //           `if (amount <= 0) return;` 在乘倍率**之前**,而 emit 送的是
    //           乘完的 `paid`。所以「打殭屍發放倍率 = 0」的一場裡,一隻 3 級
    //           殭屍被轉化 → requested 3 過閘 → paid 0 → `goldGrant { amount: 0 }`
    //           **真的會發**。實測見
    //           packages/shared/src/sim/alchemyShieldShipped.test.ts 的
    //           「關掉那一格 → 一毛都沒有」(它斷言事件上的 amount 是 0)。
    //
    // 所以這一條同時守兩件事,而且兩件都是真的:
    //   · 壞掉/改名的封包不可以燒粒子預算;
    //   · **合法的 0 金發放也不可以**畫一個金幣爆點 —— 玩家一毛都沒拿到,
    //     畫面上卻噴金幣,那是 owner 2026-08-04「顯示不說謊」的反面。
    vfx.handleEvent(ev("goldGrant", { target: SHIELD_HOLDER, amount: 0 }), 4000);
    vfx.handleEvent(ev("goldGrant", { target: SHIELD_HOLDER }), 4001);
    expect(requested).not.toContain(GOLD_GRANT_VFX);
    expect(fire).not.toHaveBeenCalled();
    fire.mockRestore();
    vfx.dispose();
  });
});
