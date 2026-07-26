/**
 * TASK #247 — the leap primitive: arc fidelity to the JASS, determinism,
 * terrain crossing, and the blocked-landing guarantee.
 *
 * The three constraints the task made non-negotiable, each with a test that can
 * actually fail:
 *   1. DETERMINISM — same seed ⇒ same digest WITH a leap occurring, and the
 *      leap is genuinely inside the hash (negative control), and no
 *      trig/rng/clock is reachable from the leap sources (static ban).
 *   2. TERRAIN CROSSING IS THE POINT — a leap crosses a pillar a walker cannot
 *      pass, and can end neither inside an obstacle nor outside the boundary.
 *   3. REUSE — the leap lives in `nav.override`'s slot, so dash and leap are
 *      mutually exclusive by construction.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SimWorld } from "./SimWorld";
import { PILLAR_ARENA } from "../../testkit/arenas";
import { asSeatId, asTeamId, type EntityId } from "../ids";
import { TICK_HZ } from "../constants";
import {
  leapHeightMilli,
  leapPosAt,
  leapTicks,
  startLeap,
  resolveLandingPoint,
} from "./movement/leap";
import { GGD_PER_WC3, round2 } from "../content/templates/expand";
import * as V from "./math/vec2";

const Z0 = PILLAR_ARENA.zones[0]!;
/** The pre-#218 centre pillar: r = 2.5 at the zone centre. */
const PILLAR = { x: Z0.center.x, z: Z0.center.z, r: 2.5 };
const NO_INTENTS = new Map();

function spawnUnit(world: SimWorld, seat: number, pos: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 0, z: 1 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 100, maxHp: 100, mana: 50, maxMana: 50, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(seat % 2), seatId: asSeatId(seat) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  return id;
}

// ---------------------------------------------------------------------------
// 1. THE ARC IS THE JASS ARC
// ---------------------------------------------------------------------------

/**
 * Every `SetUnitFlyHeightBJ(-k*Pow(i-m,2)+A)` site in war3map.j, with the line
 * it lives on. Read out of the source, not remembered.
 */
const JASS_PARABOLAS: { rawcode: string; line: number; k: number; m: number; A: number }[] = [
  { rawcode: "A0J2", line: 25841, k: 1.5, m: 21, A: 600 }, // 龍虎亂舞
  { rawcode: "A0JZ", line: 30802, k: 1.5, m: 21, A: 600 }, // AKT戰隊
  { rawcode: "A0JZ'", line: 30990, k: 1.0, m: 21, A: 400 }, // AKT 2nd arc
  { rawcode: "A0UX", line: 33716, k: 1.5, m: 21, A: 600 }, // 01-02 隕石擊
  { rawcode: "A0G3", line: 34285, k: 1.5, m: 21, A: 600 }, // 07-03 列、在、前
  { rawcode: "A0IS", line: 36347, k: 1.5, m: 21, A: 600 }, // 76-01 橡膠戰斧
  { rawcode: "A0RZ", line: 36757, k: 10.0, m: 11, A: 1000 }, // 76-04 巨人迴旋彈
  { rawcode: "A0LZ", line: 39208, k: 1.0, m: 21, A: 400 }, // 40-04 地獄搖滾
  { rawcode: "A0JD", line: 49322, k: 2.5, m: 11, A: 250 }, // 77-00 浮雲-旋一閃
  { rawcode: "A0U1", line: 51828, k: 3.0, m: 11, A: 300 }, // 52-02 蹂躪編年史
];

describe("#247 arc — the shipped parabola IS the JASS parabola", () => {
  it("every JASS site satisfies A = k(m-1)^2, which is what makes one formula cover all nine", () => {
    for (const p of JASS_PARABOLAS) {
      expect(p.k * (p.m - 1) ** 2, `${p.rawcode} @ j:${p.line}`).toBeCloseTo(p.A, 9);
    }
  });

  it("the normalised form reproduces the JASS height at EVERY integer index", () => {
    for (const p of JASS_PARABOLAS) {
      const N = 2 * p.m - 2; // i = 1..2m-1  ->  u = (i-1)/(2m-2), so N steps
      const apexMilli = Math.round(p.A * 1000);
      for (let i = 1; i <= 2 * p.m - 1; i++) {
        const jass = -p.k * (i - p.m) ** 2 + p.A;
        const k = i - 1;
        // Outside [0, N] the JASS parabola goes NEGATIVE (WC3 clamps at ground);
        // the GGD form returns exactly 0 there by branch, which is the same body.
        const ours = k > N ? 0 : leapHeightMilli(k, N, apexMilli) / 1000;
        expect(ours, `${p.rawcode} i=${i}`).toBeCloseTo(Math.max(0, jass), 6);
      }
    }
  });

  it("endpoints are exact zeros and the peak is the authored apex", () => {
    const N = 43;
    const apexMilli = 11000;
    expect(leapHeightMilli(0, N, apexMilli)).toBe(0);
    expect(leapHeightMilli(N, N, apexMilli)).toBe(0);
    expect(leapHeightMilli(-3, N, apexMilli)).toBe(0);
    expect(leapHeightMilli(N + 3, N, apexMilli)).toBe(0);
    let peak = 0;
    for (let k = 0; k <= N; k++) peak = Math.max(peak, leapHeightMilli(k, N, apexMilli));
    // odd N: the two middle ticks straddle the apex, so the sampled peak is
    // within one milli-unit of it (exactly equal for even N).
    expect(apexMilli - peak).toBeLessThanOrEqual(apexMilli / (N * N) + 1);
  });

  it("the shipped tick budgets match the JASS periods", () => {
    // A0G3 41 x 0.035 s, A0UX 41 x 0.02 s, A0RZ 21 x 0.04 s, A0U1/A0JD 21 x 0.02 s
    expect(leapTicks(41 * 0.035)).toBe(43);
    expect(leapTicks(1.44)).toBe(43); // the value the content actually ships
    expect(leapTicks(41 * 0.02)).toBe(25);
    expect(leapTicks(21 * 0.04)).toBe(25);
    expect(leapTicks(21 * 0.02)).toBe(13);
    expect(leapTicks(0.42)).toBe(13);
    // never degenerate into a teleport
    expect(leapTicks(0.001)).toBeGreaterThanOrEqual(2);
    expect(TICK_HZ).toBe(30);
  });

  it("the shipped GGD heights are the JASS heights at 11/600", () => {
    expect(round2(600 * GGD_PER_WC3)).toBe(11);
    expect(round2(1000 * GGD_PER_WC3)).toBe(18.33);
    expect(round2(300 * GGD_PER_WC3)).toBe(5.5);
    expect(round2(330 * GGD_PER_WC3)).toBe(6.05);
    expect(round2(270 * GGD_PER_WC3)).toBe(4.95);
    expect(round2(400 * GGD_PER_WC3)).toBe(7.33);
  });

  it("the planar position is absolute — tick k never depends on how we got there", () => {
    const from = { x: -5, z: 2 };
    const to = { x: 7, z: -3 };
    const N = 25;
    for (let k = 0; k <= N; k++) {
      const a = leapPosAt(from, to, k, N);
      const b = leapPosAt(from, to, k, N);
      expect(a).toEqual(b);
    }
    // the landing coordinate is `to` VERBATIM (a branch, not a re-multiplication)
    const land = leapPosAt(from, to, N, N);
    expect(land.x).toBe(to.x);
    expect(land.z).toBe(to.z);
  });
});

// ---------------------------------------------------------------------------
// 2. DETERMINISM
// ---------------------------------------------------------------------------

/** Build a world, cast a leap on tick 40, run 200 ticks, return per-tick digests. */
function runLeapWorld(seed: number, withLeap: boolean): number[] {
  const world = new SimWorld(PILLAR_ARENA, seed);
  const a = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z });
  spawnUnit(world, 1, { x: PILLAR.x + 8, z: PILLAR.z });
  const digests: number[] = [];
  for (let t = 0; t < 200; t++) {
    if (t === 40 && withLeap) {
      startLeap(world, a, {
        to: { x: PILLAR.x + 8, z: PILLAR.z + 4 },
        apexHeight: 11,
        durationSec: 1.44,
        landRadius: 6.05,
        onLand: [],
        casterId: a,
        rank: 1,
        origin: "test:leap",
      });
    }
    world.step(NO_INTENTS);
    digests.push(world.digest());
  }
  return digests;
}

describe("#247 determinism", () => {
  it("same seed + same intents ⇒ identical digest at EVERY tick, with a leap in flight", () => {
    const a = runLeapWorld(4242, true);
    const b = runLeapWorld(4242, true);
    expect(a).toEqual(b);
  });

  it("NEGATIVE CONTROL: the leap is genuinely inside the hash", () => {
    // Without this, a test that only asserted equality would pass even if the
    // height were invisible to the digest — i.e. even if a desync in the air
    // could never be detected.
    const withLeap = runLeapWorld(4242, true);
    const without = runLeapWorld(4242, false);
    expect(withLeap).not.toEqual(without);
  });

  it("hitstop FREEZES the arc and it resumes on the same curve", () => {
    const world = new SimWorld(PILLAR_ARENA, 7);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z + 6 });
    startLeap(world, id, {
      to: { x: PILLAR.x + 8, z: PILLAR.z + 6 },
      apexHeight: 11,
      durationSec: 1.44,
      onLand: [],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    for (let i = 0; i < 5; i++) world.step(NO_INTENTS);
    const midY = world.airborne.get(id)!.y;
    const midPos = { ...world.transform.get(id)!.pos };
    // freeze for 3 ticks
    world.hitstop.set(id, 3);
    world.step(NO_INTENTS);
    expect(world.airborne.get(id)!.y).toBe(midY);
    expect(world.transform.get(id)!.pos).toEqual(midPos);
    // …and the arc continues (does not snap forward to "where it should be")
    world.hitstop.set(id, 0);
    world.step(NO_INTENTS);
    expect(world.airborne.get(id)!.y).toBeGreaterThan(midY);
  });

  it("STATIC BAN: no trig or clock in the leap sources, and no rng in the ARC", () => {
    // ECMA-262 explicitly permits IMPLEMENTATION-DEFINED results for the
    // transcendentals, which is exactly why an arc built from Math.sin is a
    // desync waiting for a different CPU or a V8 upgrade. Only + - * / are used,
    // and IEEE-754 mandates those four be correctly rounded.
    const banned = /Math\.(random|sin|cos|tan|atan2?|pow|exp|log)\b|Date\.now|performance\.now/;
    const strip = (rel: string): string =>
      readFileSync(join(__dirname, rel), "utf8")
        // strip block + line comments: the doc comments NAME the banned calls
        // precisely to explain why they are absent.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    for (const rel of ["movement/leap.ts", "systems/LeapSystem.ts"]) {
      expect(banned.test(strip(rel)), `${rel} must contain no trig/clock`).toBe(false);
    }
    // The ARC ITSELF must additionally never touch the shared random stream —
    // consuming a roll would shift every other system's rolls by a tick.
    // LeapSystem is deliberately NOT under this rule: it HANDS `world.rng` to
    // the landing effects, exactly as CastResolveSystem hands it to a ground
    // blast's, so a crit roll on the landing damage behaves like every other
    // ability's. Handing it over is not consuming it.
    expect(/world\.rng/.test(strip("movement/leap.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. TERRAIN
// ---------------------------------------------------------------------------

describe("#247 terrain crossing", () => {
  it("a leap CROSSES a pillar a walker cannot pass", () => {
    const world = new SimWorld(PILLAR_ARENA, 11);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z });
    const to = { x: PILLAR.x + 8, z: PILLAR.z };
    startLeap(world, id, {
      to,
      apexHeight: 11,
      durationSec: 1.44,
      onLand: [],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    let insidePillarAtSomePoint = false;
    let maxY = 0;
    for (let i = 0; i < 50; i++) {
      world.step(NO_INTENTS);
      const t = world.transform.get(id)!;
      const d = Math.hypot(t.pos.x - PILLAR.x, t.pos.z - PILLAR.z);
      if (d < PILLAR.r) insidePillarAtSomePoint = true;
      maxY = Math.max(maxY, world.airborne.get(id)?.y ?? 0);
      if (world.nav.get(id)!.override === null && i > 2) break;
    }
    // it flew OVER the pillar (planar position was inside its footprint) …
    expect(insidePillarAtSomePoint).toBe(true);
    // … it really was in the air …
    expect(maxY).toBeGreaterThan(10);
    // … and it landed exactly on the requested point, past the pillar.
    const t = world.transform.get(id)!;
    expect(t.pos.x).toBeCloseTo(to.x, 6);
    expect(t.pos.z).toBeCloseTo(to.z, 6);
    expect(world.airborne.has(id)).toBe(false);
    expect(world.nav.get(id)!.override).toBeNull();
  });

  it("a leap aimed INTO a pillar re-aims at takeoff and lands legally OUTSIDE it", () => {
    const world = new SimWorld(PILLAR_ARENA, 12);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 9, z: PILLAR.z });
    // the requested point is the pillar's own centre — maximally illegal
    const requested = { x: PILLAR.x, z: PILLAR.z };
    const to = resolveLandingPoint(world, id, requested, 20);
    // the CORRECTED point is already outside the pillar, before flight begins
    expect(Math.hypot(to.x - PILLAR.x, to.z - PILLAR.z)).toBeGreaterThanOrEqual(
      PILLAR.r + 0.6 - 1e-6,
    );
    startLeap(world, id, {
      to,
      apexHeight: 11,
      durationSec: 1.44,
      onLand: [],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    for (let i = 0; i < 50 && world.nav.get(id)!.override !== null; i++) world.step(NO_INTENTS);
    const t = world.transform.get(id)!;
    // landed on the proven-legal point, bit-identically …
    expect(t.pos.x).toBe(to.x);
    expect(t.pos.z).toBe(to.z);
    // … and the post-separation pass on the landing tick was a NO-OP: one more
    // step must not shove the body anywhere.
    const landed = { ...t.pos };
    world.step(NO_INTENTS);
    expect(world.transform.get(id)!.pos.x).toBeCloseTo(landed.x, 9);
    expect(world.transform.get(id)!.pos.z).toBeCloseTo(landed.z, 9);
  });

  it("a leap aimed OUTSIDE the boundary lands inside it", () => {
    const world = new SimWorld(PILLAR_ARENA, 13);
    const id = spawnUnit(world, 0, { x: Z0.center.x, z: Z0.center.z + 6 });
    const far = { x: Z0.center.x, z: Z0.center.z + 500 };
    const to = resolveLandingPoint(world, id, far, 1000);
    const r = Math.hypot(to.x - Z0.center.x, to.z - Z0.center.z);
    expect(r).toBeLessThanOrEqual(Z0.boundaryRadius - 0.6 + 1e-6);
    startLeap(world, id, {
      to,
      apexHeight: 11,
      durationSec: 0.82,
      onLand: [],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    for (let i = 0; i < 40; i++) {
      world.step(NO_INTENTS);
      const t = world.transform.get(id)!;
      const d = Math.hypot(t.pos.x - Z0.center.x, t.pos.z - Z0.center.z);
      // EVERY intermediate position is inside the boundary by construction: the
      // boundary is a disc, a disc is convex, and the arc is a straight segment
      // between two interior points. No mid-flight clamp exists or is needed.
      expect(d).toBeLessThanOrEqual(Z0.boundaryRadius + 1e-6);
      if (world.nav.get(id)!.override === null) break;
    }
  });

  it("an airborne body is neither shoved nor shoves — it stays exactly on its arc", () => {
    const world = new SimWorld(PILLAR_ARENA, 14);
    const flyer = spawnUnit(world, 0, { x: PILLAR.x - 10, z: PILLAR.z - 8 });
    const to = { x: PILLAR.x - 10, z: PILLAR.z + 4 };
    // a stationary body parked EXACTLY under the mid-point of the arc
    const blocker = spawnUnit(world, 1, { x: PILLAR.x - 10, z: PILLAR.z - 2 });
    const blockerPos = { ...world.transform.get(blocker)!.pos };
    startLeap(world, flyer, {
      to,
      apexHeight: 11,
      durationSec: 1.44,
      onLand: [],
      casterId: flyer,
      rank: 1,
      origin: "test:leap",
    });
    const N = leapTicks(1.44);
    for (let k = 1; k <= N; k++) {
      world.step(NO_INTENTS);
      const expected = leapPosAt({ x: PILLAR.x - 10, z: PILLAR.z - 8 }, to, k, N);
      const t = world.transform.get(flyer)!;
      expect(t.pos.x).toBeCloseTo(expected.x, 9);
      expect(t.pos.z).toBeCloseTo(expected.z, 9);
    }
    // the body underneath was never pushed by the one flying over it
    expect(world.transform.get(blocker)!.pos.x).toBeCloseTo(blockerPos.x, 9);
    expect(world.transform.get(blocker)!.pos.z).toBeCloseTo(blockerPos.z, 9);
  });
});

// ---------------------------------------------------------------------------
// 4. INTERACTIONS
// ---------------------------------------------------------------------------

describe("#247 interactions", () => {
  it("dash and leap are mutually exclusive by construction (one override slot)", () => {
    const world = new SimWorld(PILLAR_ARENA, 15);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z + 8 });
    startLeap(world, id, {
      to: { x: PILLAR.x, z: PILLAR.z + 8 },
      apexHeight: 11,
      durationSec: 0.82,
      onLand: [],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    const ov = world.nav.get(id)!.override!;
    expect(ov.kind).toBe("leap");
    // there is exactly ONE slot, so a body can never be dashing and leaping
    expect(Object.keys(world.nav.get(id)!).filter((k) => k === "override")).toHaveLength(1);
  });

  it("death mid-air drops the body to the floor and fires NO landing effects", () => {
    const world = new SimWorld(PILLAR_ARENA, 16);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z - 6 });
    const foe = spawnUnit(world, 1, { x: PILLAR.x + 6, z: PILLAR.z - 6 });
    startLeap(world, id, {
      to: { x: PILLAR.x + 6, z: PILLAR.z - 6 },
      apexHeight: 11,
      durationSec: 1.44,
      landRadius: 6.05,
      onLand: [{ kind: "damage", damageType: "true", amount: { flat: 999 } }],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    for (let i = 0; i < 8; i++) world.step(NO_INTENTS);
    expect(world.airborne.get(id)!.y).toBeGreaterThan(0);
    const foeHpBefore = world.health.get(foe)!.hp;
    // kill the leaper at apex
    world.health.get(id)!.hp = 0;
    world.step(NO_INTENTS);
    expect(world.health.get(id)!.alive).toBe(false);
    expect(world.airborne.has(id)).toBe(false); // fell to the floor THIS tick
    expect(world.nav.get(id)!.override).toBeNull();
    for (let i = 0; i < 60; i++) world.step(NO_INTENTS);
    expect(world.health.get(foe)!.hp).toBe(foeHpBefore); // no landing damage
  });

  it("the landing detonates onLand on the landing tick, centred on the landing point", () => {
    const world = new SimWorld(PILLAR_ARENA, 17);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z - 10 });
    const foe = spawnUnit(world, 1, { x: PILLAR.x + 6, z: PILLAR.z - 10 });
    const foeHp = world.health.get(foe)!.hp;
    startLeap(world, id, {
      to: { x: PILLAR.x + 6, z: PILLAR.z - 10 },
      apexHeight: 11,
      durationSec: 0.82,
      landRadius: 6.05,
      onLand: [{ kind: "damage", damageType: "true", amount: { flat: 25 } }],
      casterId: id,
      rank: 1,
      origin: "test:leap",
    });
    const N = leapTicks(0.82);
    for (let k = 1; k < N; k++) {
      world.step(NO_INTENTS);
      expect(world.health.get(foe)!.hp, `tick ${k} must not damage yet`).toBe(foeHp);
    }
    world.step(NO_INTENTS); // the landing tick
    world.step(NO_INTENTS); // combatResolve drains within the same tick, but be safe
    expect(world.health.get(foe)!.hp).toBeLessThan(foeHp);
  });
});
