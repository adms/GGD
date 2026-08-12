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
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { PILLAR_ARENA } from "../../testkit/arenas";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type ProjectileId,
} from "../ids";
import { TICK_HZ } from "../constants";
import {
  leapHeightMilli,
  leapPosAt,
  leapTicks,
  startLeap,
  leapHeightAt,
  resolveLandingPoint,
} from "./movement/leap";
import { GGD_PER_WC3, GGD_APEX_PER_WC3, round2, toApex } from "../content/templates/expand";
import * as V from "./math/vec2";
// --- section 4 (reach) only: the real content + the real cast path ---
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility, resolveAbilityRange } from "./abilities/abilitySystem";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "content");

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
 *
 * TEN sites, NINE abilities: A0JZ appears twice (j:30802 Trig_AKT_1 and j:30990
 * Trig_AKT_4_Effect, both gated on `GetSpellAbilityId() == 'A0JZ'`) with two
 * different arcs. Rows are (k, m, A) triples, so the row count is ten.
 */
const JASS_PARABOLAS: { rawcode: string; line: number; k: number; m: number; A: number }[] = [
  { rawcode: "A0J2", line: 25841, k: 1.5, m: 21, A: 600 }, // 龍虎亂舞
  { rawcode: "A0JZ", line: 30802, k: 1.5, m: 21, A: 600 }, // AKT戰隊
  { rawcode: "A0JZ(2)", line: 30990, k: 1.0, m: 21, A: 400 }, // AKT戰隊, 2nd arc
  { rawcode: "A0UX", line: 33716, k: 1.5, m: 21, A: 600 }, // 01-02 隕石擊
  { rawcode: "A0G3", line: 34285, k: 1.5, m: 21, A: 600 }, // 07-03 列、在、前
  { rawcode: "A0IS", line: 36347, k: 1.5, m: 21, A: 600 }, // 76-01 橡膠戰斧
  { rawcode: "A0RZ", line: 36757, k: 10.0, m: 11, A: 1000 }, // 76-04 巨人迴旋彈
  { rawcode: "A0LZ", line: 39208, k: 1.0, m: 21, A: 400 }, // 40-04 地獄搖滾
  { rawcode: "A0JD", line: 49322, k: 2.5, m: 11, A: 250 }, // 77-00 浮雲-旋一閃
  { rawcode: "A0U1", line: 51828, k: 3.0, m: 11, A: 300 }, // 52-02 蹂躪編年史
];

describe("#247 arc — the shipped parabola IS the JASS parabola", () => {
  it("every JASS site satisfies A = k(m-1)^2, which is what makes one formula cover all ten", () => {
    expect(JASS_PARABOLAS).toHaveLength(10);
    for (const p of JASS_PARABOLAS) {
      expect(p.k * (p.m - 1) ** 2, `${p.rawcode} @ j:${p.line}`).toBeCloseTo(p.A, 9);
    }
  });

  it("the normalised form reproduces the JASS height at EVERY integer index", () => {
    cover("leap-jass-arc");
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

  it("PLANAR lengths convert at 11/600 — radius, throw distance, reach", () => {
    expect(round2(330 * GGD_PER_WC3)).toBe(6.05); // A0G3 landRadius
    expect(round2(270 * GGD_PER_WC3)).toBe(4.95); // A0U1 landRadius
    expect(round2(400 * GGD_PER_WC3)).toBe(7.33); // A0U1 throwDistance
  });

  it("ALTITUDE converts at 1/250 — a different ruler, on purpose (#247b)", () => {
    cover("leap-apex-scale");
    // #247 ported the fly heights through the PLANAR scale, which put 蒼月潮's
    // apex at 11.00 u — behind the near plane of the game's own 68° camera at
    // the shipped dolly, i.e. invisible. The vertical axis is set by the camera,
    // not by the map's geometry; the reasoning lives on GGD_APEX_PER_WC3 and the
    // numbers are re-measured every run in
    // apps/client/src/render/leapFraming.test.ts.
    expect(GGD_APEX_PER_WC3).toBe(1 / 250);
    expect(toApex(600)).toBe(2.4); // A0J2/A0JZ/A0UX/A0G3/A0IS
    expect(toApex(400)).toBe(1.6); // A0JZ' / A0LZ
    expect(toApex(1000)).toBe(4); // A0RZ
    expect(toApex(300)).toBe(1.2); // A0U1
    expect(toApex(250)).toBe(1); // A0JD
    // ORDERING — the part of faithfulness that survives a rescale. One linear
    // factor, so the map's own hierarchy of arcs is intact.
    const jassA = [...new Set(JASS_PARABOLAS.map((p) => p.A))].sort((a, b) => a - b);
    const ggd = jassA.map(toApex);
    expect(ggd).toEqual([...ggd].sort((a, b) => a - b));
    expect(new Set(ggd).size).toBe(jassA.length); // no two arcs collapse together
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
    cover("leap-determinism");
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
    cover("leap-hitstop");
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
    cover("leap-no-trig");
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
    cover("leap-crosses-terrain");
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
    cover("leap-landing-legal");
    const world = new SimWorld(PILLAR_ARENA, 12);
    const id = spawnUnit(world, 0, { x: PILLAR.x - 9, z: PILLAR.z });
    // the requested point is the pillar's own centre — maximally illegal
    const requested = { x: PILLAR.x, z: PILLAR.z };
    const to = resolveLandingPoint(world, id, requested);
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
    const to = resolveLandingPoint(world, id, far);
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
    cover("leap-death-midair");
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
    cover("leap-detonate");
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

// ---------------------------------------------------------------------------
// 4. REACH — WHERE THE RANGE BOUND ACTUALLY LIVES (task #247 follow-up)
// ---------------------------------------------------------------------------

/**
 * `resolveLandingPoint` used to take a `maxRange` and clamp toward the flyer,
 * and effectRunner passed it `len(requested - flyer.pos)` — the distance to the
 * very point it was clamping — so the guard could never fire. The clamp is gone;
 * this suite is what makes deleting it safe, by proving the bound it CLAIMED to
 * provide is really enforced ONE LAYER UP, at cast resolution, where the
 * ability's own `range` is actually in scope.
 *
 * It runs the SHIPPED 蒼月潮 07-03 leap (godie-hpb1.e, A0G3, castType "ground",
 * range 14) through the REAL cast path with a click 60 u away.
 */
describe("#247 reach — a leap cannot out-range its ability", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(res.store);
  });

  it("a ground cast clicked far past its range lands at the RANGE, not at the click", () => {
    cover("leap-reach-upstream");
    const world = new SimWorld(SKELETON_ARENA, 909);
    // Pin the #136 reach factor to the shipped 0.6 so the bound under test is
    // the POST-multiplier one the HUD displays, not the raw authored range.
    world.combatEnv = { ...world.combatEnv, abilityRange: 0.6 };
    const zone = SKELETON_ARENA.zones[0]!;
    const id = spawnChampion(world, {
      championId: "godie-hpb1" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: zone.center.x, z: zone.center.z },
      zone: 0,
      level: 6,
    });
    const ab = world.abilities.get(id)!;
    ab.unspentPoints = 4;
    expect(rankUpAbility(world, id, "E")).toBe(true);
    world.health.get(id)!.mana = 9999;

    const def = Abilities.get("godie-hpb1.e" as AbilityId);
    expect(def.castType).toBe("ground");
    expect(def.effects.some((e) => e.kind === "leap")).toBe(true);
    // the #136 combat-env factor is part of the bound, exactly as displayed
    const reach = resolveAbilityRange(world, def.range);
    expect(reach).toBeLessThan(def.range); // the factor is really applied

    const from = { ...world.transform.get(id)!.pos };
    // 60 u away — more than four times the authored range, in a direction with
    // no obstacle between here and the boundary.
    const click = { x: from.x, z: from.z + 60 };
    expect(castAbility(world, id, "E", { type: "point", point: click })).toBe("ok");

    // ⚠️ 前搖從**定義**推導，⛔ 不寫死 tick 數 —— owner 2026-08-13 把吟唱下限
    //    從 0.3 改成 0.06 秒之後，這裡原本硬寫的「18 ticks」就對不上了，
    //    而症狀是「跳躍飛過頭」這種看起來跟吟唱無關的斷言失敗。
    const windupTicks = Math.round((def.castTimeSec ?? 0) / world.dt);
    for (let i = 0; i < windupTicks + leapTicks(1.44) + 4; i++) world.step(NO_INTENTS);
    expect(world.airborne.has(id)).toBe(false); // landed
    expect(world.nav.get(id)!.override).toBeNull();

    const land = world.transform.get(id)!.pos;
    const flown = Math.hypot(land.x - from.x, land.z - from.z);
    // THE ASSERTION: the leap stopped at the ability's reach …
    expect(flown).toBeLessThanOrEqual(reach + 1e-6);
    // … and it really did fly the whole way there (not a no-op hop), so the
    // bound is the RANGE and not some accidental early stop.
    expect(flown).toBeGreaterThan(reach - 0.01);
    // … and nowhere near the click.
    expect(flown).toBeLessThan(60 / 4);
  });
});

// ---------------------------------------------------------------------------
// 5. THE LANDING PAYLOAD MAY MUTATE THE ENTITY SET (task #247 follow-up)
// ---------------------------------------------------------------------------

/**
 * `leapSystem` walks `world.transform` with `for..of` while the landing runs
 * `runEffects`. A JS Map VISITS entries inserted during iteration, so an
 * `onLand` effect that spawns an entity used to be handed straight back to the
 * loop that created it. Nothing shipped in `onLand` does that today — which is
 * exactly why it needed a test: the safety was a property of the CONTENT, and
 * the editor's #247 form happily lets an author drop a `spawnProjectile` in.
 *
 * The system now defers every detonation until after the walk. This is what
 * would have caught the hazard.
 */
describe("#247 landing payload — effects that mutate the entity set are safe", () => {
  it("an onLand spawnProjectile lands, spawns, and does not corrupt the walk", () => {
    cover("leap-payload-mutates");
    Projectiles.register("test.bolt" as ProjectileId, {
      id: "test.bolt" as ProjectileId,
      speed: 20,
      maxRange: 12,
      hitRadius: 0.4,
    });
    const world = new SimWorld(PILLAR_ARENA, 4711);
    // The `applyTo: "target"` shape that 52-02 蹂躪編年史 actually ships: the
    // CASTER stands still and the VICTIM flies. Keeping them apart also keeps
    // the spawned missile's direction non-degenerate (`caster -> landing point`).
    const caster = spawnUnit(world, 0, { x: PILLAR.x - 12, z: PILLAR.z + 2 });
    const victim = spawnUnit(world, 1, { x: PILLAR.x - 8, z: PILLAR.z + 2 });
    // a SECOND leaper, LATER in id order, still in flight when `victim` lands
    const b = spawnUnit(world, 3, { x: PILLAR.x - 8, z: PILLAR.z - 2 });
    const before = world.transform.size;

    startLeap(world, victim, {
      to: { x: PILLAR.x + 4, z: PILLAR.z + 2 },
      apexHeight: 5.5,
      durationSec: 0.42, // 13 ticks — lands FIRST
      landRadius: 6.05,
      onLand: [
        { kind: "spawnProjectile", projectileId: "test.bolt" as ProjectileId, onHit: [] },
        { kind: "damage", damageType: "true", amount: { flat: 5 } },
      ],
      casterId: caster,
      rank: 1,
      origin: "test:leap",
    });
    startLeap(world, b, {
      to: { x: PILLAR.x + 4, z: PILLAR.z - 2 },
      apexHeight: 11,
      durationSec: 1.44, // 43 ticks — still airborne when the first one detonates
      onLand: [],
      casterId: b,
      rank: 1,
      origin: "test:leap",
    });

    const victimHp = world.health.get(victim)!.hp;
    const N = leapTicks(0.42);
    // step through the landing tick and a couple beyond — no throw, no
    // ConcurrentModification-flavoured surprise.
    for (let i = 0; i < N + 2; i++) world.step(NO_INTENTS);

    // the landing payload ran and it really did MUTATE the entity set …
    expect(world.transform.size).toBeGreaterThan(before);
    expect([...world.projectile.keys()]).toHaveLength(1);
    // … the landing damage was dealt (the victim is the caster's enemy) …
    expect(world.health.get(victim)!.hp).toBeLessThan(victimHp);
    // … the flyer is grounded …
    expect(world.airborne.has(victim)).toBe(false);
    expect(world.nav.get(victim)!.override).toBeNull();
    // … and `b`'s arc was NOT disturbed by any of it: still flying, on the
    // exact height its own absolute parabola prescribes for this tick.
    expect(world.airborne.has(b)).toBe(true);
    const kB = (world.nav.get(b)!.override as { elapsed: number }).elapsed;
    expect(world.airborne.get(b)!.y).toBeCloseTo(leapHeightAt(kB, leapTicks(1.44), 11000), 9);

    // and the sim keeps stepping cleanly to `b`'s own touchdown.
    for (let i = 0; i < 40; i++) world.step(NO_INTENTS);
    expect(world.airborne.has(b)).toBe(false);
  });
});

describe("#247 landing payload — detonation order is uniform, not id-dependent", () => {
  /**
   * The DISCRIMINATING half of the two-phase change. A landing payload that
   * re-leaps a body which is ITSELF still in flight used to behave differently
   * depending on the two entity ids: the interleaved walk detonated `a` and then
   * kept iterating, so a victim with a HIGHER id had its brand-new arc advanced
   * one tick in the very same step it was created (elapsed 1 on takeoff), while
   * a lower-id victim did not (elapsed 0). Same content, different result,
   * decided by spawn order.
   *
   * Detonating after the walk makes it uniformly 0 — which is also what a leap
   * started anywhere else in the tick gets.
   */
  it("a re-leap fired by a landing starts at elapsed 0 regardless of spawn order", () => {
    cover("leap-detonate-order");
    const world = new SimWorld(PILLAR_ARENA, 8123);
    const a = spawnUnit(world, 0, { x: PILLAR.x - 8, z: PILLAR.z + 6 }); // LOWER id
    const victim = spawnUnit(world, 1, { x: PILLAR.x + 3, z: PILLAR.z + 6 }); // HIGHER id
    expect(a).toBeLessThan(victim);

    // the victim is mid-flight of its OWN long arc …
    startLeap(world, victim, {
      to: { x: PILLAR.x + 3, z: PILLAR.z + 6 },
      apexHeight: 11,
      durationSec: 1.44,
      onLand: [],
      casterId: victim,
      rank: 1,
      origin: "test:leap:victim",
    });
    // … when `a` lands next to it and its payload throws the victim again.
    startLeap(world, a, {
      to: { x: PILLAR.x + 3, z: PILLAR.z + 6 },
      apexHeight: 5.5,
      durationSec: 0.42,
      landRadius: 6.05,
      onLand: [
        {
          kind: "leap",
          applyTo: "target",
          mode: "inPlace",
          apexHeight: 5.5,
          durationSec: 0.42,
        },
      ],
      casterId: a,
      rank: 1,
      origin: "test:leap:a",
    });

    for (let i = 0; i < leapTicks(0.42); i++) world.step(NO_INTENTS);
    const ov = world.nav.get(victim)!.override as { kind: string; elapsed: number; ticks: number };
    expect(ov.kind).toBe("leap");
    expect(ov.ticks).toBe(leapTicks(0.42)); // it IS the re-leap, not the old arc
    // THE ASSERTION: 0, not 1. Interleaved detonation gave 1 here purely because
    // `victim` sorts after `a`.
    expect(ov.elapsed).toBe(0);
  });
});
