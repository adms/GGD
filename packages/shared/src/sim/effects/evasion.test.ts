/**
 * EVASION (閃避) — the EFFECT primitive and the DECISION-5 ability channel.
 *
 * `combat/evasion.test.ts` already guards the defender-side basic-attack roll
 * (zero guarantee, determinism, "a dodged auto is a total miss"). This file
 * guards the two things that lane P5 added on top and NOTHING it already
 * covers:
 *
 *   A. the `evasion` EffectDef kind actually grants a dodge that a real
 *      `SimWorld.step()` consumes — proved by reading `world.health`, never by
 *      asserting "a ModifierSource got attached" (failure shape ②/⑦);
 *   B. `dodgesAbilities` / `dodgesTrueDamage` are real switches with the right
 *      DEFAULTS, and with the flags absent the ability channel is bit-inert.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE STATISTICAL TEST USES p = 0.25 AND NOT p = 0.5
 *
 * The mandated mutation for this lane is "read the probability as 1-p → must go
 * red". At p = 0.5, `1 - p === p`, so a band test would be GREEN on the mutated
 * code — a textbook failure shape ④ (the assertion's direction has nothing to
 * do with the defect). Every band below is therefore run at an ASYMMETRIC p,
 * and the band is derived from the binomial σ rather than eyeballed:
 *
 *     N = 2000, p = 0.25  →  μ = 500,  σ = √(N·p·(1−p)) = √375 ≈ 19.36
 *     4σ ≈ 77            →  accept [423, 577]
 *     mutated (1−p = 0.75) → μ = 1500, i.e. ~52σ outside. Cannot pass by luck.
 *
 * The band is wide enough that no seed choice can make it flaky (4σ two-sided ≈
 * 1 in 16,000) and tight enough that the mutation is impossible to survive.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { Stat, STAT_CLAMPS } from "../stats/statTypes";
import { applyEffect } from "./effectRunner";
import { abilityEvasionOf, evasionOf, rollEvade } from "../combat/evasion";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;

interface Duel {
  world: SimWorld;
  attacker: EntityId;
  defender: EntityId;
}

/** thorne (melee) adjacent to thorne — the swing lands immediately. */
function duel(seed: number): Duel {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const c = Z0.center;
  const attacker = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 0.6, z: c.z },
    zone: 0,
  });
  const defender = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + 0.6, z: c.z },
    zone: 0,
  });
  return { world, attacker, defender };
}

function ctxOf(world: SimWorld, caster: EntityId, targets: EntityId[], origin: string): EffectContext {
  return { world, caster, rank: 1, targets, origin, rng: world.rng };
}

/**
 * Cast the effect THROUGH THE SHIPPING DISPATCH (`applyEffect` → the registry),
 * not by importing `evasionEffect.apply` — otherwise a kind that is registered
 * wrongly, or not at all, would still show green here (failure shape ⑤).
 */
function castEvasion(
  world: SimWorld,
  caster: EntityId,
  targets: EntityId[],
  e: Omit<Extract<EffectDef, { kind: "evasion" }>, "kind">,
  origin = "ability:test.q",
): void {
  applyEffect({ kind: "evasion", ...e }, ctxOf(world, caster, targets, origin));
  for (const t of [caster, ...targets]) recomputeStats(world, t);
}

/** Queue an ABILITY damage packet exactly as every ability handler does. */
function queueAbilityHit(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  type: "physical" | "magic" | "true" = "magic",
): void {
  world.damageQueue.push({ source, target, amount, type, crit: false, origin: "ability:test.q" });
}

/** Step N ticks with the attacker held on the defender; returns hp lost. */
function hpLostOverFight(d: Duel, ticks: number): number {
  const hp = d.world.health.get(d.defender)!;
  const start = hp.maxHp;
  hp.hp = start;
  let lost = 0;
  for (let k = 0; k < ticks; k++) {
    const nav = d.world.nav.get(d.attacker);
    if (nav) {
      nav.attackTarget = d.defender;
      nav.moveTarget = null;
    }
    const before = hp.hp;
    d.world.step(new Map());
    lost += Math.max(0, before - hp.hp);
    hp.hp = start; // keep the punching bag alive for the whole window
  }
  return lost;
}

// ══════════════════════════════════════ A. THE EFFECT REACHES THE REAL ROLL

describe("the `evasion` EffectDef grants a dodge the sim actually consumes", () => {
  it("moves Stat.Evasion through the shipping registry dispatch", () => {
    const d = duel(1);
    expect(evasionOf(d.world, d.defender)).toBe(0);
    castEvasion(d.world, d.defender, [], { chance: 0.3, durationSec: 5 });
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.3, 9);
  });

  it("END-TO-END: the granted dodge measurably reduces hp lost in a stepped fight", () => {
    // The load-bearing assertion of this whole lane. Reads `world.health` after
    // real `SimWorld.step()`s — a handler that attached the source but was
    // never consumed by the damage path would FAIL here while passing every
    // "the modifier is present" style check.
    const plain = duel(2024);
    const lostPlain = hpLostOverFight(plain, 600);

    const dodgy = duel(2024);
    castEvasion(dodgy.world, dodgy.defender, [], {
      chance: STAT_CLAMPS[Stat.Evasion]![1], // 0.8, the ceiling
      durationSec: 60,
    });
    const lostDodgy = hpLostOverFight(dodgy, 600);

    expect(lostPlain).toBeGreaterThan(0);
    // 0.8 dodge must cut damage taken by a lot. Deliberately a loose factor:
    // the point is "the mechanism reaches damage", not a balance number.
    expect(lostDodgy).toBeLessThan(lostPlain * 0.5);
  });

  it("`applyTo: target` buffs the resolved targets, not the caster (and default is self)", () => {
    const d = duel(3);
    castEvasion(d.world, d.attacker, [d.defender], {
      chance: 0.25,
      durationSec: 5,
      applyTo: "target",
    });
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.25, 9);
    expect(evasionOf(d.world, d.attacker)).toBe(0);

    const s = duel(4);
    castEvasion(s.world, s.attacker, [s.defender], { chance: 0.25, durationSec: 5 });
    expect(evasionOf(s.world, s.attacker)).toBeCloseTo(0.25, 9);
    expect(evasionOf(s.world, s.defender)).toBe(0);
  });

  it("EXPIRES: the dodge is gone after durationSec (absolute tick, not a countdown)", () => {
    const d = duel(5);
    castEvasion(d.world, d.defender, [], { chance: 0.4, durationSec: 1 });
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.4, 9);
    for (let k = 0; k < 40; k++) d.world.step(new Map()); // 1s = 30 ticks @30Hz
    recomputeStats(d.world, d.defender);
    expect(evasionOf(d.world, d.defender)).toBe(0);
  });

  it("REFRESHES rather than stacks: re-casting the same origin does not double the chance", () => {
    const d = duel(6);
    castEvasion(d.world, d.defender, [], { chance: 0.3, durationSec: 5 });
    castEvasion(d.world, d.defender, [], { chance: 0.3, durationSec: 5 });
    castEvasion(d.world, d.defender, [], { chance: 0.3, durationSec: 5 });
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.3, 9);
  });

  it("the Stat.Evasion CEILING still binds — this primitive cannot mint invulnerability", () => {
    const d = duel(7);
    castEvasion(d.world, d.defender, [], { chance: 1, durationSec: 5 });
    // 100% dodge would BE invulnerability (that is P3's job, not this one).
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(STAT_CLAMPS[Stat.Evasion]![1], 9);
    expect(evasionOf(d.world, d.defender)).toBeLessThan(1);
  });
});

// ═════════════════════════════ A2. THE CEILING — ON *BOTH* CHANNELS (2026-07-30)
//
// ⚠️ WHY THIS BLOCK EXISTS, AND WHY THE TEST ABOVE IS NOT IT.
//
// The test above was named 「this primitive cannot mint invulnerability」 and the
// same claim was written into `effects/evasion.ts`'s header and into the lane's
// report. It was never run against the ABILITY channel, and it was FALSE there:
//
//   `evasionOf`        reads `sc.final` → `finalizeStat` clamps it → 0.8 ✅
//   `abilityEvasionOf` read the source's RAW authored `chance`     → 1.0 ❌
//
// Measured on the pre-fix code: `{ chance: 1, dodgesAbilities: true }` →
// `abilityEvasionOf === 1`, and 2,000 × 50 magic packets cost the defender
// 0 hp. Flat immunity, from the primitive whose own header said it could not.
// The old test survived that bug untouched — it only ever read `evasionOf`,
// i.e. failure shape ⑦ (掃屬性代替掃行為) pointed at the wrong property entirely.
//
// So the guards below assert HP LOST after real `SimWorld.step()`s, on the
// channel that was broken, and they pin the ceiling to the EDITABLE cap table
// rather than to a literal.

describe("THE CEILING BINDS ON BOTH CHANNELS (chance: 1 is not invulnerability)", () => {
  /**
   * Fire N ability packets in ONE step and report hp actually lost.
   *
   * ⚠️ `PKT` is 0.2, not something chunky. thorne's maxHp is 1,242 and the whole
   * queue drains inside a single tick, so 2,000 × 1 already KILLS the defender —
   * and a dead punching bag saturates at exactly `maxHp` for the dodging AND the
   * non-dodging run alike, which would make the ratio assertion below pass on
   * the broken code too. 2,000 × 0.2 lands ~260 undodged: measurable, survivable.
   */
  const PKT = 0.2;
  const N_PKT = 2000;
  function abilityHpLost(d: Duel, type: "magic" | "true"): number {
    const hp = d.world.health.get(d.defender)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    for (let k = 0; k < N_PKT; k++) queueAbilityHit(d.world, d.attacker, d.defender, PKT, type);
    d.world.step(new Map());
    const lost = before - hp.hp;
    expect(lost).toBeLessThan(hp.maxHp * 0.9); // never saturate — see above
    return lost;
  }

  it("BEHAVIOUR: chance 1 + dodgesAbilities still takes real damage (0 hp lost = the bug)", () => {
    const d = duel(101);
    castEvasion(d.world, d.defender, [], {
      chance: 1,
      durationSec: 60,
      dodgesAbilities: true,
    });
    // 2000 packets at a 0.8 ceiling ⇒ ~400 land. At an UNCAPPED 1.0 ⇒ 0 land.
    // Reading hp (not the probability) is what makes this immune to the failure
    // shape that let the bug ship.
    const lost = abilityHpLost(d, "magic");
    expect(lost).toBeGreaterThan(0);

    // …and quantitatively near the 20% that 0.8 leaves through, not near 0 and
    // not near the undodged total. Compare against the same seed with no dodge.
    // σ of the landed count = √(2000·0.2·0.8) ≈ 17.9 ⇒ 20% ± 0.9pp, so the
    // [10%, 35%] band cannot flake and cannot swallow 0% or 100%.
    const ref = duel(101);
    const full = abilityHpLost(ref, "magic");
    expect(lost).toBeGreaterThan(full * 0.1);
    expect(lost).toBeLessThan(full * 0.35);
  });

  it("BEHAVIOUR: chance 1 + true damage — the fire ring (#270) still burns you", () => {
    // The worst reachable shape pre-fix: both flags + chance 1 = immune to
    // EVERYTHING, including the arena burn that is supposed to end stalemates.
    const d = duel(102);
    castEvasion(d.world, d.defender, [], {
      chance: 1,
      durationSec: 60,
      dodgesAbilities: true,
      dodgesTrueDamage: true,
    });
    const lost = abilityHpLost(d, "true");
    expect(lost).toBeGreaterThan(0);

    const ref = duel(102);
    const full = abilityHpLost(ref, "true");
    expect(lost).toBeGreaterThan(full * 0.1);
    expect(lost).toBeLessThan(full * 0.35);
  });

  it("the ability channel is capped at the SAME number the stat channel is", () => {
    const d = duel(103);
    castEvasion(d.world, d.defender, [], {
      chance: 1,
      durationSec: 60,
      dodgesAbilities: true,
      dodgesTrueDamage: true,
    });
    const ceiling = STAT_CLAMPS[Stat.Evasion]![1]; // 0.8, the shipping default
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(ceiling, 9);
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(ceiling, 9);
    expect(abilityEvasionOf(d.world, d.defender, true)).toBeCloseTo(ceiling, 9);
    // ONE ceiling, not two that can drift apart:
    expect(abilityEvasionOf(d.world, d.defender, false)).toBe(evasionOf(d.world, d.defender));
  });

  it("a below-ceiling value is NOT clamped — the cap is a ceiling, not an override", () => {
    // Counter-proof for the guards above: `return 0.8` or `return min(x, 0.8)`
    // are different functions, and only the second one passes this.
    const d = duel(104);
    castEvasion(d.world, d.defender, [], { chance: 0.3, durationSec: 60, dodgesAbilities: true });
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.3, 9);

    const over = duel(105);
    castEvasion(over.world, over.defender, [], {
      chance: 0.95,
      durationSec: 60,
      dodgesAbilities: true,
    });
    expect(abilityEvasionOf(over.world, over.defender, false)).toBeCloseTo(0.8, 9);
  });

  it("決策點: the ceiling is the EDITABLE cap table, not a constant in the sim", () => {
    // 第一守則 —— 「evasion may reach 100%」 is the owner's call, so raising it
    // must be a `config.stat-caps@1` edit, NOT a code change. If someone
    // hard-codes 0.8 into `abilityEvasionOf`, this test goes red while every
    // other guard in this block stays green.
    const raise = duel(106);
    raise.world.statCaps = { [Stat.Evasion]: { base: 1, unlocked: 1 } };
    castEvasion(raise.world, raise.defender, [], {
      chance: 1,
      durationSec: 60,
      dodgesAbilities: true,
    });
    expect(abilityEvasionOf(raise.world, raise.defender, false)).toBeCloseTo(1, 9);

    // …and it can be tightened from the same page, which also proves the number
    // is READ from the table rather than coincidentally equal to STAT_CLAMPS.
    const tighten = duel(107);
    tighten.world.statCaps = { [Stat.Evasion]: { base: 0.25, unlocked: 0.25 } };
    castEvasion(tighten.world, tighten.defender, [], {
      chance: 1,
      durationSec: 60,
      dodgesAbilities: true,
    });
    expect(abilityEvasionOf(tighten.world, tighten.defender, false)).toBeCloseTo(0.25, 9);
    expect(evasionOf(tighten.world, tighten.defender)).toBeCloseTo(0.25, 9);
  });

  it("a CapRaise unlock lifts BOTH channels together, never one behind the other", () => {
    // The unlock carrier is `ModOp.CapRaise` (GH#286). If the ability channel
    // ignored it, an unlocked evasion champion would dodge autos at 0.9 and
    // spells at 0.8 with nothing saying so.
    const d = duel(108);
    d.world.statCaps = { [Stat.Evasion]: { base: 0.8, unlocked: 0.9 } };
    castEvasion(d.world, d.defender, [], { chance: 1, durationSec: 60, dodgesAbilities: true });
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.8, 9);

    attachSource(d.world, d.defender, {
      id: "test:evasion-unlock",
      kind: "buff",
      modifiers: [{ stat: Stat.Evasion, op: ModOp.CapRaise, value: 0.9 }],
    });
    recomputeStats(d.world, d.defender);
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.9, 9);
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.9, 9);
  });
});

// ══════════════════════════════════════════ B. THE STATISTICAL / SEED GUARDS

describe("the roll is a real seeded probability, at the authored rate", () => {
  const N = 2000;
  const P = 0.25; // ASYMMETRIC on purpose — see the file header.
  const MU = N * P; // 500
  const TOL = 77; // 4σ, σ = √(N·p·(1−p)) ≈ 19.36

  function countDodges(seed: number, p: number): number {
    const d = duel(seed);
    castEvasion(d.world, d.defender, [], { chance: p, durationSec: 60 });
    let hits = 0;
    for (let k = 0; k < N; k++) if (rollEvade(d.world, d.attacker, d.defender)) hits++;
    return hits;
  }

  it("lands inside the binomial 4σ band — and a 1−p misread is ~52σ outside it", () => {
    const got = countDodges(90210, P);
    expect(got).toBeGreaterThanOrEqual(MU - TOL);
    expect(got).toBeLessThanOrEqual(MU + TOL);
    // Name the mutant explicitly so the band's PURPOSE survives future edits:
    // if `rollEvade` read 1−p it would land near 1500, far outside [423, 577].
    expect(Math.abs(N * (1 - P) - MU)).toBeGreaterThan(TOL * 4);
  });

  it("the rate TRACKS the authored number (0.1 / 0.25 / 0.6 are separable)", () => {
    // Guards against "any constant probability passes": three different
    // authored values must produce three separated counts, each near its own μ.
    const low = countDodges(4242, 0.1);
    const mid = countDodges(4242, 0.25);
    const high = countDodges(4242, 0.6);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(Math.abs(low - N * 0.1)).toBeLessThan(80);
    expect(Math.abs(mid - N * 0.25)).toBeLessThan(80);
    expect(Math.abs(high - N * 0.6)).toBeLessThan(90);
  });

  it("DETERMINISM: the same seed replays the identical dodge sequence, twice", () => {
    const seq = (seed: number): string => {
      const d = duel(seed);
      castEvasion(d.world, d.defender, [], { chance: 0.35, durationSec: 60 });
      let s = "";
      for (let k = 0; k < 500; k++) s += rollEvade(d.world, d.attacker, d.defender) ? "1" : "0";
      return s;
    };
    const a = seq(777);
    const b = seq(777);
    expect(b).toBe(a);
    // COUNTER-PROOF: a different seed must actually differ, otherwise the
    // equality above would also hold for a constant-false roll.
    expect(seq(778)).not.toBe(a);
  });

  it("DETERMINISM: a full stepped match is digest-identical across two runs", () => {
    const run = (): string => {
      const d = duel(31337);
      castEvasion(d.world, d.defender, [], { chance: 0.5, durationSec: 60 });
      hpLostOverFight(d, 300);
      return `${d.world.digest()}|${d.world.rng.state}`;
    };
    expect(run()).toBe(run());
  });

  /**
   * ⚠️ The guard above only exercises the BASIC-ATTACK roll. The ability roll
   * lives in a different function (`rollEvadeAbility`), draws from the same
   * `world.rng` at a different point of the tick, and — since the ceiling fix —
   * additionally folds a `CapRaise` scan over `sc.sources`. All three are places
   * a non-deterministic read (`Math.random`, unsorted Map iteration, wall clock)
   * could be introduced without the basic-attack guard noticing, so the ability
   * channel gets its own seed-replay proof.
   */
  it("DETERMINISM: the ABILITY channel replays bit-identically from the same seed", () => {
    const run = (seed: number, dodge = true): string => {
      const d = duel(seed);
      if (dodge)
        castEvasion(d.world, d.defender, [], {
          chance: 1, // at the ceiling — exercises the clamped path, not a soft one
          durationSec: 60,
          dodgesAbilities: true,
          dodgesTrueDamage: true,
        });
      const hp = d.world.health.get(d.defender)!;
      const marks: string[] = [];
      for (let step = 0; step < 60; step++) {
        for (let k = 0; k < 20; k++) {
          queueAbilityHit(d.world, d.attacker, d.defender, 3, step % 2 === 0 ? "magic" : "true");
        }
        const before = hp.hp;
        d.world.step(new Map());
        // Per-tick hp deltas, not just the total: a reordered dodge sequence
        // that happens to net the same damage would still differ here.
        marks.push((before - hp.hp).toFixed(6));
        hp.hp = hp.maxHp;
      }
      return `${d.world.digest()}|${d.world.rng.state}|${marks.join(",")}`;
    };
    const a = run(5150);
    expect(run(5150)).toBe(a);
    // COUNTER-PROOF 1: a different seed must actually diverge, otherwise the
    // equality above would also hold for a channel that is simply not running.
    expect(run(5151)).not.toBe(a);
    // COUNTER-PROOF 2 (added after mutation testing — the one above is NOT
    // enough). A `rollEvadeAbility` that dodges NOTHING still replays
    // identically AND still differs by seed, because the rest of the stepped
    // world does. So the replay must additionally differ from the SAME seed with
    // no evasion at all: that is the only assertion here that says 「the thing
    // being replayed deterministically is the dodge」.
    expect(a).not.toBe(run(5150, false));
    expect(a).toMatch(/[1-9]/); // some damage did land — not an all-zero replay
  });
});

// ══════════════════════════ C. DECISION 5 — THE COVERAGE FIELDS AND DEFAULTS

describe("dodgesAbilities — default OFF, and provably inert while off", () => {
  it("by DEFAULT an ability packet is never dodged, however high the evasion", () => {
    const d = duel(11);
    castEvasion(d.world, d.defender, [], { chance: 0.8, durationSec: 60 });
    expect(abilityEvasionOf(d.world, d.defender, false)).toBe(0);

    const hp = d.world.health.get(d.defender)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    for (let k = 0; k < 200; k++) queueAbilityHit(d.world, d.attacker, d.defender, 1);
    d.world.step(new Map());
    // 200 magic packets of 1, none dodged. Armor/MR + combatEnv scale the
    // number, so assert "every packet landed" via the count, not the amount:
    // any dodge at all would leave strictly more hp than the no-dodge run.
    const lost = before - hp.hp;
    expect(lost).toBeGreaterThan(0);

    const ref = duel(11); // same seed, no evasion at all
    const rhp = ref.world.health.get(ref.defender)!;
    rhp.hp = rhp.maxHp;
    const rbefore = rhp.hp;
    for (let k = 0; k < 200; k++) queueAbilityHit(ref.world, ref.attacker, ref.defender, 1);
    ref.world.step(new Map());
    expect(lost).toBeCloseTo(rbefore - rhp.hp, 9);
  });

  it("ZERO GUARANTEE: an un-scoped evader burns no rng draw on ability damage", () => {
    const d = duel(12);
    castEvasion(d.world, d.defender, [], { chance: 0.8, durationSec: 60 });
    for (let k = 0; k < 50; k++) queueAbilityHit(d.world, d.attacker, d.defender, 1);
    const before = d.world.rng.state;
    d.world.step(new Map());
    // A stray draw here would shift every downstream crit/proc roll and desync
    // every existing replay — this is the property that lets the channel ship
    // dark. NOTE: `step` runs the whole world, so compare against a twin that
    // took the identical path minus the evasion source.
    const ref = duel(12);
    for (let k = 0; k < 50; k++) queueAbilityHit(ref.world, ref.attacker, ref.defender, 1);
    const refBefore = ref.world.rng.state;
    ref.world.step(new Map());
    expect(d.world.rng.state - before).toBe(ref.world.rng.state - refBefore);
    expect(d.world.digest()).toBe(ref.world.digest());
  });

  it("OPT-IN: with dodgesAbilities the very same packets DO get dodged", () => {
    const d = duel(13);
    castEvasion(d.world, d.defender, [], {
      chance: 0.8,
      durationSec: 60,
      dodgesAbilities: true,
    });
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.8, 9);

    const hp = d.world.health.get(d.defender)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    for (let k = 0; k < 400; k++) queueAbilityHit(d.world, d.attacker, d.defender, 1);
    d.world.step(new Map());
    const lostDodgy = before - hp.hp;

    const ref = duel(13);
    const rhp = ref.world.health.get(ref.defender)!;
    rhp.hp = rhp.maxHp;
    const rbefore = rhp.hp;
    for (let k = 0; k < 400; k++) queueAbilityHit(ref.world, ref.attacker, ref.defender, 1);
    ref.world.step(new Map());
    const lostPlain = rbefore - rhp.hp;

    expect(lostPlain).toBeGreaterThan(0);
    expect(lostDodgy).toBeLessThan(lostPlain * 0.5); // ~20% of packets survive
    expect(d.world.events.some((e) => e.type === "evade")).toBe(true);
  });

  it("a dodged ability packet is dropped WHOLE — it spends no shield", () => {
    const d = duel(14);
    castEvasion(d.world, d.defender, [], {
      chance: 0.8,
      durationSec: 60,
      dodgesAbilities: true,
    });
    const hp = d.world.health.get(d.defender)!;
    hp.shields = [
      {
        amount: 10_000,
        expiresAtTick: d.world.tick + 600,
        sourceId: "test:evasion-shield",
        absorbs: "all",
      },
    ];
    for (let k = 0; k < 400; k++) queueAbilityHit(d.world, d.attacker, d.defender, 10);
    d.world.step(new Map());
    const left = hp.shields[0]?.amount ?? 0;
    // If dodges were implemented as "amount = 0" the shield would still be
    // walked and (harmlessly) not drained; if they were implemented AFTER the
    // shield step the pool would be drained by the dodged packets too. ~20% of
    // 400×10 = ~800 should land, so a large majority of the pool must remain.
    expect(left).toBeGreaterThan(10_000 - 400 * 10 * 0.5);
  });

  it("does NOT double-dodge basic attacks (they already rolled at their own site)", () => {
    // Failure shape: rolling again in combatResolveSystem for origin "basic"
    // would make an auto get two independent chances to miss.
    const d = duel(15);
    castEvasion(d.world, d.defender, [], {
      chance: 0.5,
      durationSec: 60,
      dodgesAbilities: true,
    });
    const hp = d.world.health.get(d.defender)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    for (let k = 0; k < 400; k++) {
      d.world.damageQueue.push({
        source: d.attacker,
        target: d.defender,
        amount: 1,
        type: "physical",
        crit: false,
        origin: "basic",
      });
    }
    d.world.step(new Map());
    const lost = before - hp.hp;

    const ref = duel(15);
    const rhp = ref.world.health.get(ref.defender)!;
    rhp.hp = rhp.maxHp;
    const rbefore = rhp.hp;
    for (let k = 0; k < 400; k++) {
      ref.world.damageQueue.push({
        source: ref.attacker,
        target: ref.defender,
        amount: 1,
        type: "physical",
        crit: false,
        origin: "basic",
      });
    }
    ref.world.step(new Map());
    expect(lost).toBeCloseTo(rbefore - rhp.hp, 9);
  });
});

describe("dodgesTrueDamage — default OFF even when abilities are ON", () => {
  it("true damage is NOT dodgeable with dodgesAbilities alone (the fire-ring guard)", () => {
    const d = duel(21);
    castEvasion(d.world, d.defender, [], {
      chance: 0.8,
      durationSec: 60,
      dodgesAbilities: true,
    });
    expect(abilityEvasionOf(d.world, d.defender, true)).toBe(0);

    const hp = d.world.health.get(d.defender)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    for (let k = 0; k < 200; k++) queueAbilityHit(d.world, d.attacker, d.defender, 1, "true");
    d.world.step(new Map());
    const lost = before - hp.hp;

    const ref = duel(21);
    const rhp = ref.world.health.get(ref.defender)!;
    rhp.hp = rhp.maxHp;
    const rbefore = rhp.hp;
    for (let k = 0; k < 200; k++) queueAbilityHit(ref.world, ref.attacker, ref.defender, 1, "true");
    ref.world.step(new Map());
    // Identical loss ⇒ not one true-damage packet was dodged.
    expect(lost).toBeCloseTo(rbefore - rhp.hp, 9);
  });

  it("OPT-IN: with dodgesTrueDamage as well, true damage becomes dodgeable", () => {
    const d = duel(22);
    castEvasion(d.world, d.defender, [], {
      chance: 0.8,
      durationSec: 60,
      dodgesAbilities: true,
      dodgesTrueDamage: true,
    });
    expect(abilityEvasionOf(d.world, d.defender, true)).toBeCloseTo(0.8, 9);

    const hp = d.world.health.get(d.defender)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    for (let k = 0; k < 400; k++) queueAbilityHit(d.world, d.attacker, d.defender, 1, "true");
    d.world.step(new Map());
    const lost = before - hp.hp;

    const ref = duel(22);
    const rhp = ref.world.health.get(ref.defender)!;
    rhp.hp = rhp.maxHp;
    const rbefore = rhp.hp;
    for (let k = 0; k < 400; k++) queueAbilityHit(ref.world, ref.attacker, ref.defender, 1, "true");
    ref.world.step(new Map());
    expect(lost).toBeLessThan((rbefore - rhp.hp) * 0.5);
  });

  it("dodgesTrueDamage WITHOUT dodgesAbilities stays off — it is not a second switch", () => {
    const d = duel(23);
    castEvasion(d.world, d.defender, [], {
      chance: 0.8,
      durationSec: 60,
      dodgesTrueDamage: true,
    });
    expect(abilityEvasionOf(d.world, d.defender, true)).toBe(0);
    expect(abilityEvasionOf(d.world, d.defender, false)).toBe(0);
  });
});

describe("scoped evasion does not leak into other sources", () => {
  it("a scoped buff does NOT promote an unscoped passive's dodge to the spell channel", () => {
    // The reason `abilityEvasionOf` takes max-of-scoped-sources instead of
    // reading the aggregated Stat.Evasion: otherwise a small "dodges spells"
    // buff would hand the whole (much larger) auto-dodge to abilities too.
    const d = duel(31);
    castEvasion(d.world, d.defender, [], { chance: 0.7, durationSec: 60 }, "passive:big");
    castEvasion(
      d.world,
      d.defender,
      [],
      { chance: 0.05, durationSec: 60, dodgesAbilities: true },
      "ability:small",
    );
    // autos see the sum, spells see only the scoped source's own 5%
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.75, 9);
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.05, 9);
  });

  it("two scoped sources take the MAX, not the sum (no stacking to immunity)", () => {
    const d = duel(32);
    castEvasion(d.world, d.defender, [], { chance: 0.4, durationSec: 60, dodgesAbilities: true }, "a");
    castEvasion(d.world, d.defender, [], { chance: 0.5, durationSec: 60, dodgesAbilities: true }, "b");
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.5, 9);
  });

  it("a PERCENT evasion modifier is not misread as an absolute dodge chance", () => {
    // ⚠️ Added because mutation testing found the `op === ModOp.Flat` filter in
    // `abilityEvasionOf` was unguarded: dropping it left all 44 tests green.
    //
    // `abilityEvasionOf` reads a source's RAW modifier value as a probability.
    // That is only meaningful for `ModOp.Flat` — a `PercentAdd` of 0.5 means
    // 「+50% of whatever evasion you already have」, not 「50% dodge」. Reading it
    // as a chance would turn a small percentage buff into a large flat dodge on
    // the spell channel. `evasion` effects only ever write Flat today, so this
    // guards the CONTRACT against the next authoring path (a plain `applyBuff`
    // that also carries a scope), not against today's shipping content.
    const d = duel(41);
    attachSource(d.world, d.defender, {
      id: "test:evasion-pct",
      kind: "buff",
      // ⚠️ PercentAdd FIRST, deliberately. The lookup is `Array.find`, so with
      // the op filter removed it returns whichever entry comes first — listing
      // Flat first made this test pass on the mutated code too (caught on the
      // first mutation run). The order IS the assertion here.
      modifiers: [
        { stat: Stat.Evasion, op: ModOp.PercentAdd, value: 0.75 },
        { stat: Stat.Evasion, op: ModOp.Flat, value: 0.1 },
      ],
      evasionScope: { abilities: true },
    });
    recomputeStats(d.world, d.defender);
    // The aggregate DID grow (0.1 × 1.75) — the percent op is not being ignored
    // by the pipeline, so this is not a vacuous test.
    expect(evasionOf(d.world, d.defender)).toBeCloseTo(0.175, 9);
    // …but the ability channel reads the FLAT term only, never the 0.75.
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.1, 9);
  });

  it("an EXPIRED scoped source stops covering abilities", () => {
    const d = duel(33);
    castEvasion(d.world, d.defender, [], { chance: 0.5, durationSec: 1, dodgesAbilities: true });
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.5, 9);
    for (let k = 0; k < 40; k++) d.world.step(new Map());
    expect(abilityEvasionOf(d.world, d.defender, false)).toBe(0);
  });

  it("a source whose expiry has PASSED but not yet been swept covers nothing", () => {
    // ⚠️ WHY THIS IS SEPARATE FROM THE TEST ABOVE. Mutation testing caught that
    // the test above does NOT guard the expiry branch in `abilityEvasionOf`:
    // `buffExpirySystem` is step 1b of `SimWorld.step` and `combatResolveSystem`
    // is step 8, so by the time the scan runs a lapsed source has already been
    // spliced out of `sc.sources` — deleting the `expiresAtTick` check stayed
    // GREEN. This test builds the un-swept state directly, which is the state
    // the check actually defends (a direct caller, or any future reordering of
    // the tick pipeline that puts damage resolution before the sweep).
    const d = duel(34);
    castEvasion(d.world, d.defender, [], { chance: 0.5, durationSec: 5, dodgesAbilities: true });
    expect(abilityEvasionOf(d.world, d.defender, false)).toBeCloseTo(0.5, 9);

    const sc = d.world.stats.get(d.defender)!;
    const src = sc.sources.find((s) => s.evasionScope !== undefined)!;
    src.expiresAtTick = d.world.tick; // lapsed as of NOW, sweep has not run
    expect(abilityEvasionOf(d.world, d.defender, false)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════ D. PURITY / SOURCES

describe("sim purity", () => {
  it("the effect handler reaches no banned API and uses absolute expiry ticks", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./evasion.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/);
    expect(src).not.toMatch(/Math\.(sin|cos|atan2|tan)\s*\(/);
    // absolute tick, never a decrementing counter (drifts across replay)
    expect(src).toMatch(/world\.tick\s*\+/);
  });
});
