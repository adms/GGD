/**
 * Combat juice (SIM / authoritative half) — the deterministic, tick-based
 * feedback layer: the enriched `damage` event, `hitImpact`/`knockdown`/`whiff`/
 * `guardBreak` events, HITSTOP, KNOCKBACK, KNOCKDOWN, and the whiff lunge.
 *
 * Everything here is a pure function of (seed, inputs): no rng is consumed by
 * the juice, so the client's prediction shadow world replays it identically,
 * and no damage number or cooldown is altered (balance is untouched).
 *
 * NB: entities sit at z=14 — a band clear of the skeleton arena's three pillars
 * (at zone-center and ±(9,8)) so pushes/positions aren't perturbed by pillar
 * separation. The no-clip test deliberately uses the boundary instead.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { zeroStats } from "./stats/statTypes";
import type { ModifierSource } from "./stats/modifiers";
import type { DamageType } from "./effects/effect";
import {
  asSeatId,
  asTeamId,
  type EntityId,
  type SeatId,
  type ChampionId,
} from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center; // (-40, 0)
const Y = 14; // pillar-free band

function makeWorld(seed = 42): SimWorld {
  return new SimWorld(SKELETON_ARENA, seed);
}

/** A minimal combat dummy: transform + health + team + nav + status (no stats,
 *  so physical/magic mitigation is 0 → resolved damage == the amount pushed). */
function spawnDummy(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  opts: {
    hp?: number;
    facing?: V.Vec2;
    shields?: { amount: number; expiresAtTick: number; sourceId: string }[];
    sources?: ModifierSource[];
  } = {},
): EntityId {
  const id = world.spawn();
  const hp = opts.hp ?? 600;
  world.transform.set(id, {
    pos: { x: pos.x, z: pos.z },
    vel: V.v2(),
    facing: opts.facing ? { ...opts.facing } : { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: hp, mana: 0, maxMana: 0, alive: true, shields: opts.shields ?? [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  if (opts.sources) {
    world.stats.set(id, { championId: "dummy" as ChampionId, final: zeroStats(), dirty: false, sources: opts.sources });
  }
  return id;
}

function pushHit(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  type: DamageType,
  crit = false,
  origin = "test",
): void {
  world.damageQueue.push({ source, target, amount, type, crit, origin });
}

/** Find the first event of `type` emitted in the last step(). */
function firstEvent(world: SimWorld, type: string): Record<string, unknown> | undefined {
  return world.events.find((e) => e.type === type)?.data;
}

const empty = (): Map<SeatId, IntentFrame> => new Map();

// --------------------------------------------------------- RICH DAMAGE EVENT --
describe("rich damage event (the sim<->client seam)", () => {
  it("carries x/z, source/target, amount, dmgType, blocked, crit, killingBlow + a hitImpact pulse", () => {
    cover("cj-rich-payload");
    cover("cj-hitimpact");
    cover("cj-crit-flag");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 50, "magic", /*crit*/ true);
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.source).toBe(a);
    expect(dmg.target).toBe(b);
    expect(dmg.x).toBeCloseTo(ZC.x + 3, 6);
    expect(dmg.z).toBeCloseTo(Y, 6);
    expect(dmg.amount).toBeCloseTo(50, 6); // no stats → magic unmitigated
    expect(dmg.dmgType).toBe("magic");
    expect(dmg.type).toBe("magic"); // legacy alias kept for existing consumers
    expect(dmg.blocked).toBe(false);
    expect(dmg.crit).toBe(true);
    expect(dmg.killingBlow).toBe(false);
    expect(dmg.origin).toBe("test");

    // hitImpact fires on the same landed hit (client shake/particle timing)
    const hi = firstEvent(world, "hitImpact")!;
    expect(hi.target).toBe(b);
    expect(hi.dmgType).toBe("magic");
    expect(hi.crit).toBe(true);

    // a non-crit hit reads crit=false
    pushHit(world, a, b, 20, "physical", /*crit*/ false);
    world.step(empty());
    expect(firstEvent(world, "damage")!.crit).toBe(false);
  });

  it("flags killingBlow when the hit drops the target to 0 hp", () => {
    cover("cj-killing-blow");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { hp: 30 });

    pushHit(world, a, b, 100, "true");
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.killingBlow).toBe(true);
    expect(world.health.get(b)!.alive).toBe(false); // DeathSystem confirmed it
  });

  it("derives blocked from a shield absorb, and guardBreak when the shield breaks this hit", () => {
    cover("cj-blocked-shield");
    cover("cj-guard-break");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      shields: [{ amount: 25, expiresAtTick: world.tick + 100, sourceId: "t" }],
    });

    pushHit(world, a, b, 40, "true"); // 25 eaten by shield, 15 to hp
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.blocked).toBe(true);
    expect(dmg.amount).toBeCloseTo(15, 6);
    const gb = firstEvent(world, "guardBreak")!;
    expect(gb.target).toBe(b); // the shield pool went 25 -> 0 this hit
    expect(world.health.get(b)!.shields.length).toBe(0);
  });

  it("derives blocked from an active damage-reduction buff (no shield needed)", () => {
    cover("cj-blocked-drbuff");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      sources: [{ id: "buff:guard", kind: "buff", damageReduction: true }],
    });

    pushHit(world, a, b, 50, "true");
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.blocked).toBe(true);
    expect(firstEvent(world, "guardBreak")).toBeUndefined(); // no shield to break
    expect(dmg.amount).toBeCloseTo(50, 6); // the tag does NOT change the number
  });
});

// ------------------------------------------------------------------ HITSTOP --
describe("hitstop", () => {
  it("freezes BOTH fighters for exactly N ticks — but only the ATTACKER's feet", () => {
    cover("cj-hitstop-ticks");
    cover("cj-hitstop-both");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    // impact 50 (<70) → hitstop but NO knockback, so movement isolation is clean.
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    world.nav.get(a)!.moveTarget = { x: ZC.x - 18, z: Y }; // attacker walking −x
    world.nav.get(b)!.moveTarget = { x: ZC.x + 18, z: Y }; // victim walking +x

    pushHit(world, a, b, 50, "true");
    world.step(empty()); // hit LANDS this tick (both freeze starting next tick)

    // the FREEZE ITSELF is unchanged: both fighters carry N = 2 ticks of it.
    expect(world.hitstop.get(a)).toBe(2);
    expect(world.hitstop.get(b)).toBe(2);

    // ⭐ 2026-08-23 —— 只有**出手的那一方**的腳被按住(`combat/hitstopHold.ts`)。
    // owner:「被普攻的時候好像會被角色黏住走不了」⇒ 挨打的那一方照走。
    const heldX = world.transform.get(a)!.pos.x;
    const victimX = world.transform.get(b)!.pos.x;
    world.step(empty()); // frozen tick 1
    expect(world.transform.get(a)!.pos.x).toBe(heldX); // 出手方:定住
    expect(world.transform.get(b)!.pos.x).toBeGreaterThan(victimX); // 挨打方:照走
    world.step(empty()); // frozen tick 2
    expect(world.transform.get(a)!.pos.x).toBe(heldX);
    world.step(empty()); // freeze over → the attacker moves again too
    expect(world.transform.get(a)!.pos.x).toBeLessThan(heldX);
    expect(world.hitstop.get(a)).toBeUndefined();
    expect(world.hitstop.get(b)).toBeUndefined();
  });

  it("scales with damage and caps at 6 ticks; chip damage never freezes", () => {
    cover("cj-hitstop-scale");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const light = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    const heavy = spawnDummy(world, 2, 1, { x: ZC.x + 3, z: Y + 3 });
    const chip = spawnDummy(world, 3, 1, { x: ZC.x + 3, z: Y - 3 });

    pushHit(world, a, light, 20, "true"); // → 2 ticks
    pushHit(world, a, heavy, 400, "true"); // → capped 6 ticks
    pushHit(world, a, chip, 5, "true"); //   → below the min impact, no freeze
    world.step(empty());

    expect(world.hitstop.get(light)).toBe(2);
    expect(world.hitstop.get(heavy)).toBe(6);
    expect(world.hitstop.get(heavy)!).toBeGreaterThan(world.hitstop.get(light)!);
    expect(world.hitstop.get(chip)).toBeUndefined();
  });

  it("is replay-deterministic: two seeded fights produce an identical digest (and hitstop fires)", () => {
    cover("cj-hitstop-determinism");
    const fight = (): { digest: number; sawHitstop: boolean } => {
      const world = makeWorld(999);
      const c = ZC;
      const sela = spawnChampion(world, {
        championId: "sela" as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(0),
        pos: { x: c.x - 1, z: c.z + 8 },
        zone: 0,
      });
      const thorne = spawnChampion(world, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(1),
        teamId: asTeamId(1),
        pos: { x: c.x + 1, z: c.z + 8 },
        zone: 0,
      });
      let sawHitstop = false;
      for (let k = 0; k < 150; k++) {
        const intents =
          k === 0
            ? new Map<SeatId, IntentFrame>([
                [asSeatId(0), { order: { kind: "attackTarget", entity: thorne }, commands: [] }],
                [asSeatId(1), { order: { kind: "attackTarget", entity: sela }, commands: [] }],
              ])
            : empty();
        world.step(intents);
        if ((world.hitstop.get(sela) ?? 0) > 0 || (world.hitstop.get(thorne) ?? 0) > 0) sawHitstop = true;
      }
      return { digest: world.digest(), sawHitstop };
    };
    const r1 = fight();
    const r2 = fight();
    expect(r1.digest).toBe(r2.digest);
    expect(r1.sawHitstop).toBe(true); // the juice actually engaged
  });
});

// ----------------------------------------------------------------- KNOCKBACK --
// GH#193 — 擊退是 pct-of-maxHp 驅動並且**減掉攻守雙方目前距離**的。這一組守衛
// 打在**出貨路徑**上(damageQueue → combatResolveSystem → nav.override →
// movementSystem 真的把人挪走),不是打在 `knockbackDistance` 那支純函式上 ——
// 純函式的單元測試在 combatFeel.test.ts,兩層都要有,因為「算對了但沒送到
// nav.override」和「算錯了」在畫面上長得一模一樣。
describe("knockback (pct-of-maxHp, GH#193)", () => {
  /** 貼身:1.2 GGD units,約等於近戰射程中位數 1.6 的內側。 */
  const MELEE_GAP = 1.2;

  it("shoves the victim away from the source, distance from the % of max HP taken", () => {
    cover("cj-knockback-dir");
    cover("cj-knockback-mag");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y }); // +x of a, same z

    // 200 / 600 = 33.3% → raw 3.333 身位, 減掉 1.2 的距離 → 2.133 GGD units
    pushHit(world, a, b, 200, "physical");
    world.step(empty());

    // frozen first (hitstop), only THEN does the slide begin
    const heldX = world.transform.get(b)!.pos.x;
    world.step(empty());
    expect(world.transform.get(b)!.pos.x).toBe(heldX); // still in the hitstop hold

    for (let k = 0; k < 20; k++) world.step(empty());
    const disp = world.transform.get(b)!.pos.x - (ZC.x + MELEE_GAP);
    expect(disp).toBeGreaterThan(0); // pushed AWAY from the source (+x)
    expect(disp).toBeCloseTo(10 * (200 / 600) - MELEE_GAP, 2);
    expect(world.transform.get(b)!.pos.z).toBeCloseTo(Y, 3); // straight back, no drift
  });

  it("a hit below minPct of the victim's MAX hp never shoves, however close", () => {
    cover("cj-knockback-chip");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y });

    // 20 / 600 = 3.3% < minPct 5% → 完全不推(而 20 也還在 hitstop 門檻之上)
    pushHit(world, a, b, 20, "physical");
    for (let k = 0; k < 12; k++) world.step(empty());
    expect(world.nav.get(b)!.override).toBeNull();
    expect(world.transform.get(b)!.pos.x).toBeCloseTo(ZC.x + MELEE_GAP, 6);
  });

  it("THE DISTANCE SUBTRACTION: same hit, same victim — melee shoves, ranged does not", () => {
    cover("cj-knockback-range");
    const world = makeWorld();
    // 兩位受害者一模一樣(600 血),差別**只有**攻擊者離他多遠。
    const melee = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const nearVictim = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y });
    const ranged = spawnDummy(world, 2, 0, { x: ZC.x, z: Y + 4 });
    const farVictim = spawnDummy(world, 3, 1, { x: ZC.x + 8.2, z: Y + 4 }); // 遠程射程中位數

    // 200 / 600 = 33.3% → raw 3.33 身位。近戰 3.33 − 1.2 > 0;遠程 3.33 − 8.2 < 0。
    pushHit(world, melee, nearVictim, 200, "physical");
    pushHit(world, ranged, farVictim, 200, "physical");
    for (let k = 0; k < 20; k++) world.step(empty());

    expect(world.transform.get(nearVictim)!.pos.x).toBeGreaterThan(ZC.x + MELEE_GAP + 1);
    // 遠程打出的**同一發**完全推不動人 —— 這就是「遠程不能靠推人永久風箏」。
    expect(world.transform.get(farVictim)!.pos.x).toBeCloseTo(ZC.x + 8.2, 6);
  });

  it("the denominator is MAX hp, not current hp — a nearly-dead victim is not launched", () => {
    cover("cj-knockback-maxhp");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const healthy = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y });
    // 第二位攻擊者只是為了讓「被推的方向」也是 +x —— 否則兩條位移不能直接比。
    const a2 = spawnDummy(world, 2, 0, { x: ZC.x, z: Y + 8 });
    const dying = spawnDummy(world, 3, 1, { x: ZC.x + MELEE_GAP, z: Y + 8 });
    // 250/600 殘血。若分母改成**當前**生命,200 傷害就是 80% → 8 身位;
    // 用最大生命則兩人都是 33.3% → 3.33 身位。兩者差 5 個身位,量得出來。
    world.health.get(dying)!.hp = 250;

    pushHit(world, a, healthy, 200, "physical");
    pushHit(world, a2, dying, 200, "physical");
    for (let k = 0; k < 20; k++) world.step(empty());

    const healthyDisp = world.transform.get(healthy)!.pos.x - (ZC.x + MELEE_GAP);
    const dyingDisp = world.transform.get(dying)!.pos.x - (ZC.x + MELEE_GAP);
    expect(healthyDisp).toBeGreaterThan(1);
    expect(dyingDisp).toBeCloseTo(healthyDisp, 4); // 殘血不會被推更遠
  });

  it("殭屍王 (6000 hp) shrugs off the same blow that shoves a 600 hp champion", () => {
    cover("cj-knockback-boss");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const squishy = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y });
    const king = spawnDummy(world, 2, 1, { x: ZC.x + MELEE_GAP, z: Y + 8 }, { hp: 6000 });

    // 200 傷害:對 600 血是 33%(推),對 6000 血是 3.3% < 5%(完全不推)。
    pushHit(world, a, squishy, 200, "physical");
    pushHit(world, a, king, 200, "physical");
    for (let k = 0; k < 20; k++) world.step(empty());

    expect(world.transform.get(squishy)!.pos.x).toBeGreaterThan(ZC.x + MELEE_GAP + 1);
    expect(world.transform.get(king)!.pos.x).toBeCloseTo(ZC.x + MELEE_GAP, 6);
    expect(world.nav.get(king)!.override).toBeNull();
  });

  it("the three numbers are operator-tunable: raising minPct switches the same shove off", () => {
    cover("cj-knockback-config");
    const world = makeWorld();
    // 33.3% 的一擊,但操作者把門檻拉到 50% → 這一下不再擊退。
    world.combatFeel = {
      // 只改門檻；仲裁那兩格（authoredWins / longerDamageWins）跟著出貨表，
      // 因為這一條測的是「門檻真的是參數」，不是「誰贏」。
      knockback: { ...world.combatFeel.knockback, minPct: 0.5 },
      standstill: world.combatFeel.standstill,
    };
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y });

    pushHit(world, a, b, 200, "physical");
    for (let k = 0; k < 20; k++) world.step(empty());
    expect(world.nav.get(b)!.override).toBeNull();
    expect(world.transform.get(b)!.pos.x).toBeCloseTo(ZC.x + MELEE_GAP, 6);
  });

  it("maxBodies is the ceiling: a 100%-hp one-shot at point blank pushes 10 bodies, not more", () => {
    cover("cj-knockback-cap");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + MELEE_GAP, z: Y });

    // 6000 傷害打在 600 血身上 = 1000%。pct 先夾到 1 → raw 10 身位,再減掉當下的
    // 距離。**沒有夾**的話這裡會是 100 − 1.2 ≈ 98.8,也就是把人扔出整座競技場。
    // 目標這一擊就死了、不會滑完全程,所以量的是 sim 這一 tick 真的算出並寫進
    // nav.override 的距離,而不是最終位置。
    pushHit(world, a, b, 6000, "physical");
    world.step(empty());
    const p = firstEvent(world, "hitImpact")!.profile as Record<string, unknown>;
    expect(p.knockbackMag as number).toBeGreaterThan(8); // 10 − 大約 1.2 的距離
    expect(p.knockbackMag as number).toBeLessThanOrEqual(10);
    const ov = world.nav.get(b)!.override!;
    expect(ov.kind).toBe("knockback"); // profile 上那個數字就是 sim 套用的那個
    expect(ov.kind === "knockback" ? ov.remaining : -1).toBeCloseTo(p.knockbackMag as number, 6);
  });

  it("respects the zone boundary — a big shove never clips outside the arena", () => {
    cover("cj-knockback-noclip");
    const world = makeWorld();
    // b sits near the boundary; a is inward, so b is shoved OUTWARD toward the wall
    const a = spawnDummy(world, 0, 0, { x: ZC.x + 21, z: 0 });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 22, z: 0 }); // dist 22 of 24
    const startDist = V.dist(world.transform.get(b)!.pos, ZC);

    // 400 / 600 = 66.7% → raw 6.67 − 1 = 5.67u shove, would reach dist ~27.7
    pushHit(world, a, b, 400, "true");
    for (let k = 0; k < 30; k++) world.step(empty());

    const endDist = V.dist(world.transform.get(b)!.pos, ZC);
    expect(endDist).toBeGreaterThan(startDist); // it WAS pushed toward the wall
    expect(endDist).toBeLessThanOrEqual(Z0.boundaryRadius - 0.6 + 1e-6); // but clamped inside
  });
});

// ----------------------------------------------------------------- KNOCKDOWN --
describe("knockdown", () => {
  it("a heavy unblocked hit emits knockdown and counts down to getup in exactly N ticks", () => {
    cover("cj-knockdown");
    cover("cj-knockdown-getup");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 200, "physical"); // impact 200 ≥ 170 → knockdown
    world.step(empty());

    const kd = firstEvent(world, "knockdown")!;
    expect(kd.target).toBe(b);
    expect(world.knockdown.get(b)).toBe(14); // KNOCKDOWN_TICKS

    for (let k = 0; k < 13; k++) world.step(empty());
    expect(world.knockdown.get(b)).toBe(1); // still prone
    world.step(empty()); // 14th tick → getup
    expect(world.knockdown.get(b)).toBeUndefined();
  });

  it("roots the victim while prone (cannot walk), then it can move again on getup", () => {
    cover("cj-knockdown-root");
    const world = makeWorld();
    const c = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    world.knockdown.set(c, 4); // prone (regardless of how it got there)
    world.nav.get(c)!.moveTarget = { x: ZC.x, z: Y + 10 };
    const z0 = world.transform.get(c)!.pos.z;

    world.step(empty()); // knockdown 4 → rooted, no walk
    expect(world.transform.get(c)!.pos.z).toBe(z0);
    for (let k = 0; k < 4; k++) world.step(empty()); // ride out the prone window
    expect(world.knockdown.get(c)).toBeUndefined();
    for (let k = 0; k < 6; k++) world.step(empty()); // on its feet → walks the +z order
    expect(world.transform.get(c)!.pos.z).toBeGreaterThan(z0 + 0.3);
  });

  it("a blocked heavy hit knocks back but does NOT knock down", () => {
    cover("cj-knockdown-blocked-none");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      shields: [{ amount: 1000, expiresAtTick: world.tick + 100, sourceId: "t" }],
    });
    pushHit(world, a, b, 300, "physical"); // heavy, but fully shielded → blocked
    world.step(empty());
    expect(firstEvent(world, "knockdown")).toBeUndefined();
    expect(world.knockdown.get(b)).toBeUndefined();
    expect(world.nav.get(b)!.override).not.toBeNull(); // still shoved (reduced)
  });
});

// ---------------------------------------------------------- IMPACT PROFILE --
describe("unified ImpactProfile (one hit-weight on hitImpact)", () => {
  it("carries tier / hitstop / hitstun / knockback / flags computed once", () => {
    cover("cj-impact-profile");
    cover("cj-profile-knockback");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 1.2, z: Y }); // +x of a, 貼身
    world.nav.get(b)!.moveTarget = { x: ZC.x + 18, z: Y };

    // impact 100 → medium tier;100/600 = 16.7% ≥ 5% 且 raw 1.67 > 1.2 的距離 → +x shove
    pushHit(world, a, b, 100, "physical");
    world.step(empty());

    const p = firstEvent(world, "hitImpact")!.profile as Record<string, unknown>;
    expect(p.tier).toBe("medium"); // 100 in [60,120)
    expect(p.hitstopTicks).toBe(3); // 2 + floor(100/55)
    expect(p.hitstunTicks).toBeGreaterThan(p.hitstopTicks as number); // frame advantage
    expect((p.knockbackDir as V.Vec2).x).toBeCloseTo(1, 6);
    expect((p.knockbackDir as V.Vec2).z).toBeCloseTo(0, 6);
    expect(p.knockbackMag as number).toBeGreaterThan(0);
    expect(p.isEX).toBe(false);
    expect(p.isBlock).toBe(false);

    // the published profile IS the world state the sim applied
    expect(world.hitstop.get(a)).toBe(p.hitstopTicks); // both fighters freeze
    expect(world.hitstop.get(b)).toBe(p.hitstopTicks);
    expect(world.hitstun.get(b)).toBe(p.hitstunTicks); // ...only the victim is stunned
    expect(world.hitstun.get(a) ?? 0).toBe(0);
  });

  it("tiers light/medium/heavy by impact; crit is the top tier", () => {
    cover("cj-profile-tier");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const mk = (seat: number, dz: number): EntityId =>
      spawnDummy(world, seat, 1, { x: ZC.x + 3, z: Y + dz });
    const light = mk(1, 0);
    const medium = mk(2, 4);
    const heavy = mk(3, 8);
    const critT = mk(4, 12);

    pushHit(world, a, light, 30, "true"); // < 60 → light
    pushHit(world, a, medium, 90, "true"); // [60,120) → medium
    pushHit(world, a, heavy, 150, "true"); // >= 120 → heavy
    pushHit(world, a, critT, 30, "true", /*crit*/ true); // crit overrides tier
    world.step(empty());

    const tierOf = (id: EntityId): unknown =>
      (world.events.find((e) => e.type === "hitImpact" && e.data.target === id)!.data
        .profile as Record<string, unknown>).tier;
    expect(tierOf(light)).toBe("light");
    expect(tierOf(medium)).toBe("medium");
    expect(tierOf(heavy)).toBe("heavy");
    expect(tierOf(critT)).toBe("crit");
  });
});

// ------------------------------------------------- HITSTOP CRIT/GB EMPHASIS --
describe("hitstop crit / guard-break emphasis", () => {
  it("a crit freezes distinctly longer (+2 ticks) than the same non-crit hit", () => {
    cover("cj-hitstop-crit");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const plain = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    const critT = spawnDummy(world, 2, 1, { x: ZC.x + 3, z: Y + 4 });

    pushHit(world, a, plain, 100, "true", /*crit*/ false); // base 3
    pushHit(world, a, critT, 100, "true", /*crit*/ true); // 3 + 2
    world.step(empty());

    expect(world.hitstop.get(plain)).toBe(3);
    expect(world.hitstop.get(critT)).toBe(5);
  });

  it("a guard shatter floors the freeze to the emphasis cap (~8), even on a light impact", () => {
    cover("cj-hitstop-guardbreak");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      shields: [{ amount: 25, expiresAtTick: world.tick + 100, sourceId: "t" }],
    });

    pushHit(world, a, b, 40, "true"); // 25 eaten → shatter; bare impact 40 would be 2 ticks
    world.step(empty());

    expect(firstEvent(world, "guardBreak")).toBeDefined();
    expect(world.hitstop.get(b)).toBe(8); // floored to the cap, not the impact-scaled 2
    const p = firstEvent(world, "hitImpact")!.profile as Record<string, unknown>;
    expect(p.tier).toBe("heavy");
    expect(p.isBlock).toBe(true);
    expect(p.hitstopTicks).toBe(8);
  });

  it("emphasis never exceeds the counter cap (crit on a max-impact hit stays 8)", () => {
    cover("cj-hitstop-cap");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 400, "true", /*crit*/ true); // base 6 + 2 = 8, capped 8
    world.step(empty());
    expect(world.hitstop.get(b)).toBe(8);
  });
});

// ------------------------------------------------------------------ HITSTUN --
describe("hitstun (victim-only action-lock, frame advantage)", () => {
  it("gates the victim's basic attack past the shared hitstop, then releases", () => {
    cover("cj-hitstun-gate-basic");
    cover("cj-hitstun-release");
    const world = makeWorld();
    const c = ZC;
    const v = spawnChampion(world, {
      championId: "thorne" as ChampionId, // melee
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x - 1, z: c.z + 8 },
      zone: 0,
    });
    const t = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: c.x + 1, z: c.z + 8 },
      zone: 0,
    });
    world.nav.get(v)!.attackTarget = t; // v wants to auto t

    const swingThisStep = (): boolean =>
      world.events.some(
        (e) => (e.type === "basicAttack" || e.type === "attackWindup") && e.data.source === v,
      );

    world.hitstun.set(v, 3); // action-locked (no hitstop → other systems free)
    world.step(empty());
    expect(swingThisStep()).toBe(false); // no swing while stunned

    // ride out the lock, then the swing is allowed again
    for (let k = 0; k < 2; k++) {
      world.step(empty());
      expect(swingThisStep()).toBe(false); // still locked (3 ticks total)
    }
    expect(world.hitstun.get(v)).toBeUndefined();
    let swung = false;
    for (let k = 0; k < 40 && !swung; k++) {
      world.step(empty());
      if (swingThisStep()) swung = true;
    }
    expect(swung).toBe(true);
  });

  it("pauses an in-progress cast without interrupting or refunding it", () => {
    cover("cj-hitstun-gate-cast");
    const world = makeWorld();
    const c = ZC;
    const v = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x, z: c.z + 8 },
      zone: 0,
    });
    const ab = world.abilities.get(v)!;
    ab.cast = {
      slot: "Q",
      abilityId: ab.slots.Q.abilityId,
      rank: 1,
      ticksLeft: 5,
      targets: [],
      rooted: true,
      hpAtStart: world.health.get(v)!.hp,
    };
    world.hitstun.set(v, 2);

    world.step(empty());
    expect(world.abilities.get(v)!.cast).not.toBeNull(); // not interrupted
    expect(world.abilities.get(v)!.cast!.ticksLeft).toBe(5); // paused (no decrement)
  });

  it("a real medium hit locks the victim LONGER than the attacker (frame advantage)", () => {
    cover("cj-hitstun-frameadv");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 100, "true"); // medium: hitstop 3, hitstun > 3
    world.step(empty());
    const stop = world.hitstop.get(b)!;
    const stun = world.hitstun.get(b)!;
    expect(stun).toBeGreaterThan(stop);
    expect(world.hitstun.get(a) ?? 0).toBe(0); // the attacker is NOT stunned
    // attacker's freeze ends first; the victim is still action-locked afterwards
    for (let k = 0; k < stop; k++) world.step(empty());
    expect(world.hitstop.get(a) ?? 0).toBe(0);
    expect(world.hitstun.get(b) ?? 0).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------- WHIFF --
describe("whiff", () => {
  it("a committed melee swing that connects with nothing emits whiff + a forward lunge", () => {
    cover("cj-whiff-lunge");
    const world = makeWorld();
    const c = ZC;
    const sela = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x - 1, z: c.z + 8 },
      zone: 0,
    });
    const thorne = spawnChampion(world, {
      championId: "thorne" as ChampionId, // melee
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: c.x + 1, z: c.z + 8 },
      zone: 0,
    });

    // thorne swings at sela
    world.step(
      new Map<SeatId, IntentFrame>([[asSeatId(1), { order: { kind: "attackTarget", entity: sela }, commands: [] }]]),
    );

    // advance to the final wind-up tick (the swing has committed)
    let committed = false;
    for (let k = 0; k < 40 && !committed; k++) {
      const w = world.abilities.get(thorne)!.windup;
      if (w && w.ticksLeft === 1) committed = true;
      else world.step(empty());
    }
    expect(committed).toBe(true);

    // yank sela out of reach at the instant of the strike → the swing whiffs
    const st = world.transform.get(sela)!;
    st.pos = { x: st.pos.x, z: st.pos.z + 40 };
    const before = { ...world.transform.get(thorne)!.pos };

    world.step(empty()); // the committing tick
    expect(world.events.some((e) => e.type === "whiff" && e.data.source === thorne)).toBe(true);
    expect(world.nav.get(thorne)!.override?.kind).toBe("dash"); // over-commit lunge

    for (let k = 0; k < 5; k++) world.step(empty());
    expect(V.dist(before, world.transform.get(thorne)!.pos)).toBeGreaterThan(0.3); // lunged forward
  });
});
