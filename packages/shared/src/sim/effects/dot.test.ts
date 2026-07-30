/**
 * GH#289 lane P1 — 持續傷害 (damage over time).
 *
 * Every guard here drives a REAL `SimWorld.step()` and reads the FINAL state
 * (`world.health.get(id).hp`, the `damage`/`death` events, `world.dot`). None of
 * them asserts what the `EffectDef` object looks like, and none of them greps
 * source — CLAUDE.md 失敗形態 ⑥/⑦ are exactly how a DoT could "pass" while never
 * removing a single hit point.
 *
 * The five things that have to be true, and the mutation that breaks each:
 *
 *   ① THE CURVE. HP falls on the payout ticks and on NO others, `duration /
 *      interval` times. Break: pay every tick → the "quiet ticks" assertions go
 *      red; pay once → the count goes red.
 *   ② DAMAGE TYPE IS REAL. The same burn on an armour dummy and an MR dummy
 *      diverges, and swaps when the type does. Break: force `type: "true"` in
 *      the packet → red. This is what proves the payout goes through the damage
 *      QUEUE (armour/MR/shields/kill-credit) instead of `hp.hp -=`.
 *   ③ THE STACKING FIELD IS REAL. All three modes produce three different HP
 *      curves from the same two casts. Break: ignore `e.stacking` → red.
 *   ④ ABSOLUTE TICKS. Jump the clock (replay seek / host resync) past the
 *      deadline and the burn pays NOTHING and retires. Break: swap
 *      `expiresAtTick`/`nextTick` for a `ticksLeft--` countdown → the burn
 *      happily pays out its full remaining schedule → red.
 *   ⑤ SOURCE ATTRIBUTION. A lethal burn credits its caster's kill even after the
 *      caster is dead, and `onCasterDeath: "stop"` really stops it.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { zEffectDefUnion } from "../../content/schema/effect";
import { Stat } from "../stats/statTypes";
import type { EntityId } from "../../ids";

const C = SKELETON_ARENA.zones[0]!.center;
const MAX_HP = 1000;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  target: EntityId;
}

/**
 * A caster and one target, hand-built (no content registry) so the guard is
 * independent of whatever the content lane is doing. `HealthRegen` /
 * `ManaRegen` are pinned to 0 because `regenSystem` runs every tick and would
 * otherwise heal the exact HP the burn is removing.
 */
function spawnBody(
  world: SimWorld,
  x: number,
  opts: { armor?: number; magicResist?: number; hp?: number; zone?: number } = {},
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x, z: C.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: opts.zone ?? 0,
  });
  world.health.set(id, {
    hp: opts.hp ?? MAX_HP,
    maxHp: MAX_HP,
    mana: 0,
    maxMana: 0,
    alive: true,
    shields: [],
  });
  world.status.set(id, { effects: [] });
  const final = {} as Record<Stat, number>;
  final[Stat.HealthRegen] = 0;
  final[Stat.ManaRegen] = 0;
  final[Stat.Armor] = opts.armor ?? 0;
  final[Stat.MagicResist] = opts.magicResist ?? 0;
  world.stats.set(id, {
    championId: "sela" as never,
    final,
    dirty: false, // hand-set numbers must survive statRecomputeSystem
    sources: [],
  });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  return id;
}

function rig(seed = 4242): Rig {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const caster = spawnBody(world, C.x);
  const target = spawnBody(world, C.x + 2);
  world.rebuildGrid();
  return { world, caster, target };
}

function ctxOf(r: Rig, over: Partial<EffectContext> = {}): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.target],
    origin: "ability:test.burn",
    rng: r.world.rng,
    ...over,
  };
}

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/** HP after each of `n` steps (index i == world state after step i+1). */
function hpTrace(w: SimWorld, id: EntityId, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    w.step(new Map());
    out.push(w.health.get(id)!.hp);
  }
  return out;
}

/** Ticks (1-based step index) on which `trace` fell relative to the step before. */
function dropSteps(trace: number[], start: number): number[] {
  const out: number[] = [];
  let prev = start;
  trace.forEach((hp, i) => {
    if (hp < prev - 1e-9) out.push(i + 1);
    prev = hp;
  });
  return out;
}

const burn = (over: Partial<Extract<EffectDef, { kind: "dot" }>> = {}): EffectDef => ({
  kind: "dot",
  damageType: "true",
  amountPerTick: { flat: 10 },
  intervalSec: 0.5, // 15 ticks @30Hz
  durationSec: 2, // 60 ticks
  ...over,
});

/* ═════════════════════════════════════════════════════════════════════════
 * ① THE HP CURVE — real ticks, real hit points.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: the per-tick HP curve (p1-dot-curve)", () => {
  it("pays on the interval boundaries and on NO other tick, duration/interval times", () => {
    cover("p1-dot-curve");
    const r = rig();
    runEffects([burn()], ctxOf(r)); // applied at world.tick === 0
    const per = 10 * r.world.combatEnv.damageDealt;

    // 70 steps covers the whole 60-tick burn plus 10 ticks of silence after it.
    const trace = hpTrace(r.world, r.target, 70);

    // The payout ticks are absolute: apply(0) + k × 15, for k = 1..4. The step
    // that runs with `world.tick === T` is the (T+1)-th step.
    expect(dropSteps(trace, MAX_HP)).toEqual([16, 31, 46, 61]);
    // …and each drop is EXACTLY one payout, not a per-tick trickle.
    expect(trace[15]).toBeCloseTo(MAX_HP - per, 6);
    expect(trace[60]).toBeCloseTo(MAX_HP - 4 * per, 6);
    // 2 s at one payout per 0.5 s = FOUR payouts. An exclusive deadline would
    // silently pay three and the ability would deal 75 % of its authored damage.
    expect(MAX_HP - trace[69]!).toBeCloseTo(4 * per, 6);
    // the instance retires on its own deadline — nothing parked in the store
    expect(r.world.dot.size).toBe(0);
  });

  it("tickOnApply pays on the CAST tick as well, without re-phasing the rest", () => {
    cover("p1-dot-curve");
    const r = rig();
    runEffects([burn({ tickOnApply: true })], ctxOf(r));
    const trace = hpTrace(r.world, r.target, 65);
    // step 1 runs with world.tick === 0, which IS `nextTick`.
    expect(dropSteps(trace, MAX_HP)).toEqual([1, 16, 31, 46, 61]);
  });

  it("the payload is frozen at APPLY, not re-read from the caster each payout", () => {
    cover("p1-dot-curve");
    const r = rig();
    r.world.stats.get(r.caster)!.final[Stat.AbilityPower] = 100;
    runEffects(
      [burn({ amountPerTick: { flat: 10, ratios: [{ stat: Stat.AbilityPower, coeff: 0.5 }] } })],
      ctxOf(r),
    );
    // 10 + 0.5 × 100 = 60 per payout, resolved once, at apply.
    r.world.stats.get(r.caster)!.final[Stat.AbilityPower] = 0;
    const trace = hpTrace(r.world, r.target, 20);
    expect(MAX_HP - trace[19]!).toBeCloseTo(60 * r.world.combatEnv.damageDealt, 6);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * ② DAMAGE TYPE — the payout really goes through the damage queue.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: damageType actually mitigates (p1-dot-damagetype)", () => {
  /** HP lost by a body with `armor`/`magicResist` to ONE payout of `type`. */
  function lossTo(
    type: "physical" | "magic" | "true",
    armor: number,
    magicResist: number,
  ): number {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const caster = spawnBody(world, C.x);
    const victim = spawnBody(world, C.x + 2, { armor, magicResist });
    world.rebuildGrid();
    runEffects([burn({ damageType: type })], {
      world,
      caster,
      rank: 1,
      targets: [victim],
      origin: "ability:test.burn",
      rng: world.rng,
    });
    step(world, 16); // through the first payout (absolute tick 15)
    return MAX_HP - world.health.get(victim)!.hp;
  }

  it("armour blunts a PHYSICAL burn and does nothing to a MAGIC one (and vice versa)", () => {
    cover("p1-dot-damagetype");
    const ARMOURED = { armor: 100, mr: 0 };
    const WARDED = { armor: 0, mr: 100 };

    const physOnArmoured = lossTo("physical", ARMOURED.armor, ARMOURED.mr);
    const physOnWarded = lossTo("physical", WARDED.armor, WARDED.mr);
    const magicOnArmoured = lossTo("magic", ARMOURED.armor, ARMOURED.mr);
    const magicOnWarded = lossTo("magic", WARDED.armor, WARDED.mr);

    // 100/(100+100) = half. The two resists are NOT interchangeable: a burn that
    // ignored `damageType` would make all four of these equal.
    expect(physOnArmoured).toBeCloseTo(physOnWarded / 2, 6);
    expect(magicOnWarded).toBeCloseTo(magicOnArmoured / 2, 6);
    expect(physOnWarded).toBeGreaterThan(physOnArmoured);
    expect(magicOnArmoured).toBeGreaterThan(magicOnWarded);
  });

  it("TRUE damage ignores both, so the same burn costs both dummies the same", () => {
    cover("p1-dot-damagetype");
    expect(lossTo("true", 100, 0)).toBeCloseTo(lossTo("true", 0, 100), 6);
    expect(lossTo("true", 100, 0)).toBeGreaterThan(lossTo("physical", 100, 0));
  });

  it("a shield eats the burn before hit points do", () => {
    cover("p1-dot-damagetype");
    // The other half of "it goes through the queue": `hp.hp -= dmg` would drain
    // health straight past a full shield pool.
    const r = rig();
    r.world.health.get(r.target)!.shields.push({
      amount: 500,
      expiresAtTick: 10_000,
      sourceId: "test",
    });
    runEffects([burn()], ctxOf(r));
    step(r.world, 16);
    expect(r.world.health.get(r.target)!.hp).toBe(MAX_HP);
    expect(r.world.health.get(r.target)!.shields[0]!.amount).toBeLessThan(500);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * ③ STACKING — the decision point is a FIELD, and changing it changes play.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: the stacking rule is really configurable (p1-dot-stacking)", () => {
  /** Total HP lost when the SAME burn is applied `casts` times, then run `ticks`. */
  function lossFor(
    over: Partial<Extract<EffectDef, { kind: "dot" }>>,
    casts: number,
    ticks: number,
  ): { loss: number; instances: number } {
    const r = rig();
    for (let i = 0; i < casts; i++) runEffects([burn(over)], ctxOf(r));
    const instances = (r.world.dot.get(r.target) ?? []).length;
    step(r.world, ticks);
    return { loss: MAX_HP - r.world.health.get(r.target)!.hp, instances };
  }

  it("refresh / independent / stack give THREE different answers to the same two casts", () => {
    cover("p1-dot-stacking");
    const single = lossFor({}, 1, 16); // one payout, one stack
    const refresh = lossFor({ stacking: "refresh" }, 2, 16);
    const independent = lossFor({ stacking: "independent" }, 2, 16);
    const stacked = lossFor({ stacking: "stack" }, 2, 16);

    // ABSENT === "refresh": one instance, one stack's worth per payout.
    expect(refresh.instances).toBe(1);
    expect(refresh.loss).toBeCloseTo(single.loss, 6);
    // independent: two instances, each paying in full.
    expect(independent.instances).toBe(2);
    expect(independent.loss).toBeCloseTo(2 * single.loss, 6);
    // stack: ONE instance paying double.
    expect(stacked.instances).toBe(1);
    expect(stacked.loss).toBeCloseTo(2 * single.loss, 6);
  });

  it("maxStacks is a real ceiling", () => {
    cover("p1-dot-stacking");
    const single = lossFor({}, 1, 16).loss;
    const capped = lossFor({ stacking: "stack", maxStacks: 2 }, 5, 16).loss;
    expect(capped).toBeCloseTo(2 * single, 6);
  });

  it("a REFRESH extends the deadline but never re-phases the cadence", () => {
    cover("p1-dot-stacking");
    // The classic 「refresh 的 DoT 永遠不跳傷害」 bug: re-applying faster than the
    // interval pushes `nextTick` forward forever and the ability's whole damage
    // budget silently becomes zero. Here the burn is re-applied every 10 ticks
    // while its interval is 15.
    const r = rig();
    const per = 10 * r.world.combatEnv.damageDealt;
    for (let i = 0; i < 90; i++) {
      if (i % 10 === 0) runEffects([burn()], ctxOf(r));
      step(r.world, 1);
    }
    const loss = MAX_HP - r.world.health.get(r.target)!.hp;
    // Ticks 0..89 ran, so the boundaries that came due are 15/30/45/60/75 —
    // FIVE payouts, the same cadence an un-refreshed burn would have kept.
    // ZERO is what a `nextTick = world.tick + interval` refresh would produce,
    // and it is the bug this guards.
    expect(loss / per).toBeCloseTo(5, 6);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * ④ ABSOLUTE TICKS — the determinism rule, guarded behaviourally.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: deadlines are ABSOLUTE ticks (p1-dot-absolute)", () => {
  it("a clock JUMP past the deadline pays nothing and retires the burn", () => {
    cover("p1-dot-absolute");
    // A replay seek / host resync moves `world.tick`, not the number of times
    // this system has run. A `ticksLeft--` countdown cannot tell the difference
    // and would pay out its whole remaining schedule minutes late; an absolute
    // deadline is simply already behind us.
    const r = rig();
    runEffects([burn()], ctxOf(r));
    expect(r.world.dot.get(r.target)).toHaveLength(1);

    r.world.tick += 1000; // well past expiresAtTick (0 + 60)
    step(r.world, 1);

    expect(r.world.health.get(r.target)!.hp).toBe(MAX_HP);
    expect(r.world.dot.size).toBe(0);
  });

  it("a clock jump INSIDE the window pays ONE payout, not the arrears", () => {
    cover("p1-dot-absolute");
    // The skipped boundaries belong to ticks nothing else in the sim ran either
    // — nobody moved, nobody swung — so replaying them would invent damage on
    // ticks that never happened and dump a whole burn into one frame. The
    // schedule is re-derived from the absolute clock instead.
    const r = rig();
    const per = 10 * r.world.combatEnv.damageDealt;
    runEffects([burn()], ctxOf(r)); // nextTick 15, expires 60, interval 15
    r.world.tick = 50; // 15/30/45 are now behind us
    step(r.world, 1);
    expect(MAX_HP - r.world.health.get(r.target)!.hp).toBeCloseTo(1 * per, 6);
    // …and the burn is still live, re-phased onto the next boundary AFTER 50,
    // which is 60 — its own deadline, i.e. its last payout.
    expect(r.world.dot.get(r.target)).toHaveLength(1);
    expect(r.world.dot.get(r.target)![0]!.nextTick).toBe(60);
    step(r.world, 20);
    expect(MAX_HP - r.world.health.get(r.target)!.hp).toBeCloseTo(2 * per, 6);
    expect(r.world.dot.size).toBe(0);
  });

  it("the same burn applied at a LATER absolute tick keeps the same cadence", () => {
    cover("p1-dot-absolute");
    const r = rig();
    r.world.tick = 977; // an arbitrary mid-match tick, not a multiple of 15
    runEffects([burn()], ctxOf(r));
    const trace = hpTrace(r.world, r.target, 70);
    // apply(977) + k × 15 → the (Δ+1)-th step, i.e. exactly the tick-0 pattern
    // shifted with the cast and not snapped to a global grid.
    expect(dropSteps(trace, MAX_HP)).toEqual([16, 31, 46, 61]);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * ⑤ SOURCE ATTRIBUTION + lifecycle.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: source attribution and lifecycle (p1-dot-source)", () => {
  it("a LETHAL burn credits the kill to its caster — even after the caster died", () => {
    cover("p1-dot-source");
    const r = rig();
    r.world.health.get(r.target)!.hp = 5; // one payout of 10 finishes him
    runEffects([burn()], ctxOf(r));
    // the caster dies FIRST; the default `onCasterDeath: "continue"` keeps the
    // poison working, which is WC3's reading (the buff lives on the victim).
    r.world.health.get(r.caster)!.hp = 0;

    // `world.events` is cleared at the top of every step, so the death beat has
    // to be collected as it happens rather than looked for at the end.
    let killer: unknown = "never died";
    for (let i = 0; i < 20; i++) {
      step(r.world, 1);
      const death = r.world.events.find((e) => e.type === "death" && e.data.id === r.target);
      if (death) killer = death.data.killer;
    }

    expect(r.world.health.get(r.target)!.alive).toBe(false);
    expect(r.world.health.get(r.caster)!.alive).toBe(false);
    // the kill credit is the whole point of carrying `sourceId` on the instance
    expect(killer).toBe(r.caster);
  });

  it("onCasterDeath: \"stop\" really stops it", () => {
    cover("p1-dot-source");
    const r = rig();
    runEffects([burn({ onCasterDeath: "stop" })], ctxOf(r));
    r.world.health.get(r.caster)!.hp = 0;
    step(r.world, 40);
    expect(r.world.health.get(r.target)!.hp).toBe(MAX_HP);
    expect(r.world.dot.size).toBe(0);
  });

  it("two different casters never merge, so neither steals the other's credit", () => {
    cover("p1-dot-source");
    const r = rig();
    const second = spawnBody(r.world, C.x - 2);
    runEffects([burn()], ctxOf(r));
    runEffects([burn()], ctxOf(r, { caster: second }));
    const list = r.world.dot.get(r.target)!;
    expect(list).toHaveLength(2);
    step(r.world, 16);
    const sources = r.world.events
      .filter((e) => e.type === "damage" && e.data.target === r.target)
      .map((e) => e.data.source);
    expect(new Set(sources)).toEqual(new Set([r.caster, second]));
  });

  it("a corpse stops burning, and a SETTLED zone stops burning (#216)", () => {
    cover("p1-dot-source");
    const dead = rig();
    runEffects([burn()], ctxOf(dead));
    dead.world.health.get(dead.target)!.alive = false;
    step(dead.world, 20);
    expect(dead.world.dot.size).toBe(0);

    // #216: a player knocked out this round is already looking at the shop; a
    // poison still draining bars behind the shop card is that exact bug.
    const settled = rig();
    runEffects([burn()], ctxOf(settled));
    settled.world.settledZones.add(0);
    step(settled.world, 40);
    expect(settled.world.health.get(settled.target)!.hp).toBe(MAX_HP);
    expect(settled.world.dot.size).toBe(0);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * DETERMINISM — payout ORDER, because a DoT that kills decides kill credit.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: payout order is a total order, not Map order (p1-dot-order)", () => {
  it("victims are paid in ascending entity id, whatever order they were burned in", () => {
    cover("p1-dot-order");
    // `world.dot` is a Map, and Map iteration is INSERTION order — which two
    // hosts can legitimately differ on (a projectile that hit A before B on one
    // replica and B before A on the other). The damage queue is drained in
    // order, so whoever is queued last can be the one whose packet crosses zero.
    const world = new SimWorld(SKELETON_ARENA, 11);
    const caster = spawnBody(world, C.x);
    const low = spawnBody(world, C.x + 2);
    const high = spawnBody(world, C.x + 4);
    world.rebuildGrid();
    expect(low).toBeLessThan(high);

    // burn the HIGHER id first, so insertion order is the reverse of id order
    const mk = (t: EntityId): EffectContext => ({
      world,
      caster,
      rank: 1,
      targets: [t],
      origin: "ability:test.burn",
      rng: world.rng,
    });
    runEffects([burn()], mk(high));
    runEffects([burn()], mk(low));
    expect([...world.dot.keys()]).toEqual([high, low]); // Map order really is reversed

    // step to the payout tick and read the QUEUE ORDER off the damage events
    let order: EntityId[] = [];
    for (let i = 0; i < 20; i++) {
      world.step(new Map());
      const hits = world.events
        .filter((e) => e.type === "damage")
        .map((e) => e.data.target as EntityId);
      if (hits.length > 0) order = hits;
    }
    expect(order).toEqual([low, high]);
  });

  it("two burns on ONE victim are paid in (origin, source) order", () => {
    cover("p1-dot-order");
    const r = rig();
    const other = spawnBody(r.world, C.x - 2);
    // authored in the order that is NOT the sorted one
    runEffects([burn()], ctxOf(r, { origin: "ability:zzz" }));
    runEffects([burn()], ctxOf(r, { origin: "ability:aaa", caster: other }));

    let origins: string[] = [];
    for (let i = 0; i < 20; i++) {
      r.world.step(new Map());
      const hits = r.world.events
        .filter((e) => e.type === "damage")
        .map((e) => e.data.origin as string);
      if (hits.length > 0) origins = hits;
    }
    expect(origins).toEqual(["ability:aaa", "ability:zzz"]);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * THE SEAM — it is no longer a stub, and the schema can author it.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("dot: the reserved slot is filled (p1-dot-seam)", () => {
  it("applying a dot writes world.dot and queues NOTHING that tick", () => {
    cover("p1-dot-seam");
    const r = rig();
    expect(() => runEffects([burn()], ctxOf(r))).not.toThrow();
    expect(r.world.dot.get(r.target)).toHaveLength(1);
    // a DoT is not an instant nuke: nothing is due until the first boundary.
    expect(r.world.damageQueue).toHaveLength(0);
    expect(r.world.health.get(r.target)!.hp).toBe(MAX_HP);
  });

  it("the burn is folded into digest(), so a desynced burn surfaces at once", () => {
    cover("p1-dot-seam");
    const a = rig();
    const b = rig();
    expect(a.world.digest()).toBe(b.world.digest());
    runEffects([burn()], ctxOf(a));
    expect(a.world.digest()).not.toBe(b.world.digest());
  });

  it("the schema accepts every authored field and bounds the numbers", () => {
    cover("p1-dot-seam");
    const base = { kind: "dot", damageType: "magic", amountPerTick: { flat: 5 } };
    expect(
      zEffectDefUnion.safeParse({
        ...base,
        intervalSec: 1,
        durationSec: 6,
        stacking: "stack",
        maxStacks: 5,
        tickOnApply: true,
        onCasterDeath: "stop",
      }).success,
    ).toBe(true);
    // ⚠️ upper bounds, not just lower ones (CLAUDE.md 「欄位要有上界」).
    for (const bad of [
      { ...base, intervalSec: 1, durationSec: 6, maxStacks: 0 },
      { ...base, intervalSec: 1, durationSec: 6, maxStacks: 100 },
      { ...base, intervalSec: 1, durationSec: 600 },
      { ...base, intervalSec: 0, durationSec: 6 },
      { ...base, intervalSec: 1, durationSec: 6, stacking: "stacks" },
    ]) {
      expect(zEffectDefUnion.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
