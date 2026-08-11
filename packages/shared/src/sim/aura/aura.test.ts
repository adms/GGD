/**
 * AURAS (靈氣) — the mechanism, proved on FIXTURES.
 *
 * This lane writes no content doc: the 29 empty `innateKind: "passive"` blocks
 * are a later lane's job, and a concurrent workflow is writing
 * `content/abilities/*.json` right now. So every test here builds its own
 * `ModifierSource` / `AbilityDef` fixture in the exact shape those docs will
 * use — the reference case throughout is `79-00 靈壓`:
 *
 *   { key: "reiatsu", radius: 9.17, affects: "enemy",
 *     modifiers: [{ stat: "as", op: "pctAdd", value: -0.25 }] }
 *
 * Four things must hold, in this order of importance:
 *   1. IT APPLIES AND IT REMOVES — the removal half is the whole risk. A leaked
 *      aura is a permanent invisible debuff, so every way membership can end
 *      (walk out, die, emitter dies, emitter destroyed, emitting source
 *      detached, zone change) is asserted separately.
 *   2. IT IS DETERMINISTIC — same seed ⇒ identical digest AND rng.state for 300
 *      ticks with an aura live; a different seed must actually diverge, so
 *      test 2 cannot pass vacuously.
 *   3. IT COSTS NOTHING WHEN NOBODY EMITS ONE — no rng draw, no digest change,
 *      no source churn. Today that is the entire catalogue.
 *   4. THE RADIUS OBEYS `abilityRange` (#136) — an aura is an ability AoE and
 *      must shrink with the operator's range budget like every other one.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource, detachSource, recomputeStats } from "../stats/statPipeline";
import { baseBonusFor } from "../baseBonus";
import { championStatBase } from "../stats/attributes";
import { ModOp, type ModifierSource } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { Abilities, Champions } from "../content/registry";
import { syncAbilityPassives } from "../abilities/abilityPassives";
import { normalizeCombatEnv } from "../combatEnv";
import { activeAuraSources, auraSourceId, resolveAuraRadius, type AuraDef } from "./aura";
import type { AbilityDef } from "../content/defs";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type SeatId,
} from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

/**
 * Every fixture stands on ONE clear line, `x = zoneCentre.x + 12`, and varies
 * only in z. Deliberate: the skeleton zone has a `radius: 2.5` pillar sitting on
 * its exact centre, so spawning "at the zone centre" puts a body INSIDE an
 * obstacle and MovementSystem shoves it out over the following ticks — which
 * silently changes the distance an aura test is measuring. This line clears all
 * three obstacles and stays inside `boundaryRadius: 24` for |dz| <= 20, and
 * neighbours are never closer than the 0.8 body-separation, so nobody drifts.
 */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

/** 79-00 靈壓's own numbers: 500 WC3 units → 9.17 sim units, −25 % attack speed. */
const REIATSU: AuraDef = {
  key: "reiatsu",
  radius: 9.17,
  affects: "enemy",
  modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: -0.25 }],
};

let seat = 0;
function spawn(world: SimWorld, team: 0 | 1, at: { x: number; z: number }, zone = 0): EntityId {
  return spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: at,
    zone,
  });
}

/** Emit an aura from `id`, the way a `passive.ranks[0].auras` block will. */
function emit(world: SimWorld, id: EntityId, ...auras: AuraDef[]): string {
  const sourceId = `passive:fixture-aura#${id}`;
  attachSource(world, id, { id: sourceId, kind: "passive", auras });
  return sourceId;
}

function place(world: SimWorld, id: EntityId, x: number, z: number): void {
  const t = world.transform.get(id)!;
  t.pos.x = x;
  t.pos.z = z;
}

/** Park everyone (no orders) and advance — isolates the aura from the AI. */
function idle(world: SimWorld, ticks = 1): void {
  for (let k = 0; k < ticks; k++) {
    for (const [, nav] of world.nav) {
      nav.attackTarget = null;
      nav.moveTarget = null;
      nav.order = null;
    }
    world.step(NO_INTENTS);
  }
}

const auraIds = (world: SimWorld, id: EntityId): string[] =>
  activeAuraSources(world, id).map((s) => s.id);

// ────────────────────────────────────────────────── 1. APPLY / TEAM FILTERING

describe("aura application", () => {
  it("79-00 靈壓: enemies inside the radius lose 25% attack speed, allies do not", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const ichigo = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    const mate = spawn(world, 0, P(-5));
    idle(world); // stats settle with no aura yet
    const baseAs = world.stats.get(foe)!.final[Stat.AttackSpeed];
    expect(world.stats.get(mate)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs, 9);

    emit(world, ichigo, REIATSU);
    idle(world);

    // The debuff is REAL in the final stat, not merely a source that exists.
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs * 0.75, 9);
    expect(world.stats.get(mate)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs, 9);
    expect(auraIds(world, foe)).toEqual([
      auraSourceId(ichigo, `passive:fixture-aura#${ichigo}`, "reiatsu"),
    ]);
    expect(auraIds(world, mate)).toEqual([]);
    // An "enemy" aura never reaches its own emitter.
    expect(auraIds(world, ichigo)).toEqual([]);
  });

  it("an ally aura includes the emitter BY DEFAULT (WC3 Endurance/Devotion behaviour)", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const leader = spawn(world, 0, P(0));
    const mate = spawn(world, 0, P(5));
    const foe = spawn(world, 1, P(-5));
    emit(world, leader, {
      key: "command",
      radius: 9.17,
      affects: "ally",
      modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 10 }],
    });
    idle(world);
    expect(auraIds(world, leader)).toHaveLength(1);
    expect(auraIds(world, mate)).toHaveLength(1);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("includeSelf:false is the explicit 「隊友但不含自己」 shape", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const leader = spawn(world, 0, P(0));
    const mate = spawn(world, 0, P(5));
    emit(world, leader, {
      key: "selfless",
      radius: 9.17,
      affects: "ally",
      includeSelf: false,
      modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 10 }],
    });
    idle(world);
    expect(auraIds(world, leader)).toHaveLength(0);
    expect(auraIds(world, mate)).toHaveLength(1);
  });

  it('affects:"all" reaches both teams; the emitter is in it by default', () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const mate = spawn(world, 0, P(5));
    const foe = spawn(world, 1, P(-5));
    emit(world, src, {
      key: "field",
      radius: 9.17,
      affects: "all",
      modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.PercentAdd, value: -0.2 }],
    });
    idle(world);
    for (const id of [src, mate, foe]) expect(auraIds(world, id)).toHaveLength(1);
  });

  it("stops at the radius edge — 9 units in, 16 out — and is a real distance test", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(9));
    emit(world, src, REIATSU);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
    place(world, foe, LINE_X, Z0.center.z + 16);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("never crosses duel zones (PairedDuels), even at zero distance", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0), 0);
    const other = spawn(world, 1, { x: SKELETON_ARENA.zones[1]!.center.x, z: 0 }, 1);
    emit(world, src, { ...REIATSU, radius: 40 });
    // Same coordinates, different zone: only the zone filter can reject this.
    place(world, other, LINE_X, Z0.center.z);
    idle(world);
    expect(auraIds(world, other)).toHaveLength(0);
  });

  it("two emitters and two auras stack as independent sources", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const a = spawn(world, 0, P(-2));
    const b = spawn(world, 0, P(2));
    const foe = spawn(world, 1, P(0));
    idle(world);
    const baseAs = world.stats.get(foe)!.final[Stat.AttackSpeed];
    // −10 % each rather than 靈壓's −25 %: three stacked 25 % cuts would push
    // thorne under the [0.2, 2.5] AttackSpeed clamp and the test would be
    // measuring the clamp instead of the stacking.
    const light: AuraDef = {
      ...REIATSU,
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: -0.1 }],
    };
    emit(world, a, light);
    emit(world, b, { ...light, key: "r2" }, { ...light, key: "r3" });
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(3);
    // pctAdd is additive across sources: 1 - 3*0.10.
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs * 0.7, 9);
    expect(baseAs * 0.7).toBeGreaterThan(0.2); // guard: not sitting on the clamp
  });
});

// ─────────────────────────────────────────────────────────── 2. REMOVAL PATHS

describe("aura removal — every way membership can end", () => {
  it("walking out restores the stat exactly", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    idle(world);
    const baseAs = world.stats.get(foe)!.final[Stat.AttackSpeed];
    emit(world, src, REIATSU);
    idle(world);
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs * 0.75, 9);

    place(world, foe, LINE_X, Z0.center.z + 16);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs, 9);
  });

  it("a DEAD emitter projects nothing (a corpse has no 靈壓)", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
    world.health.get(src)!.alive = false;
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("a DESTROYED emitter leaves nothing behind — the stateless diff needs no teardown", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
    world.destroy(src);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("a DEAD target drops the aura (aliveOnly), and regains it on revive", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
    world.health.get(foe)!.alive = false;
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
    world.health.get(foe)!.alive = true;
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
  });

  it("detaching the EMITTING source removes the projection (item sold / rank reset)", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    const sourceId = emit(world, src, REIATSU);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
    detachSource(world, src, sourceId);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("an EXPIRED emitting buff stops emitting the same tick it stops applying", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    attachSource(world, src, {
      id: "buff:temporary-aura",
      kind: "buff",
      expiresAtTick: world.tick + 5,
      auras: [REIATSU],
    });
    idle(world, 3);
    expect(auraIds(world, foe)).toHaveLength(1);
    idle(world, 5);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("changing zone drops it", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(1);
    world.transform.get(foe)!.zone = 1;
    idle(world);
    expect(auraIds(world, foe)).toHaveLength(0);
  });

  it("emits auraApply on entry and auraEnd on exit, once each — not every tick", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    const seen: string[] = [];
    for (let k = 0; k < 10; k++) {
      if (k === 5) place(world, foe, LINE_X, Z0.center.z + 16);
      idle(world);
      for (const ev of world.events) {
        if (ev.type === "auraApply" || ev.type === "auraEnd") seen.push(ev.type);
      }
    }
    expect(seen).toEqual(["auraApply", "auraEnd"]);
  });
});

// ──────────────────────────────────────────────────────────── 3. LINGER TAIL

describe("lingerSec — the WC3 aura-buff tail", () => {
  it("keeps applying for exactly lingerSec after leaving, then drops", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, { ...REIATSU, lingerSec: 0.5 }); // 15 ticks @ 30 Hz
    idle(world);
    const baseAs = world.stats.get(foe)!.final[Stat.AttackSpeed];

    place(world, foe, LINE_X, Z0.center.z + 16);
    idle(world, 10);
    // Still debuffed while the tail runs — the source is present AND applying.
    expect(auraIds(world, foe)).toHaveLength(1);
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(baseAs, 9);

    idle(world, 8);
    expect(auraIds(world, foe)).toHaveLength(0);
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeGreaterThan(baseAs);
  });

  it("re-entering during the tail cancels it instead of expiring mid-aura", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, { ...REIATSU, lingerSec: 0.5 });
    idle(world);
    place(world, foe, LINE_X, Z0.center.z + 16);
    idle(world, 5);
    place(world, foe, LINE_X, Z0.center.z + 5);
    idle(world, 30); // well past the original 15-tick deadline
    expect(auraIds(world, foe)).toHaveLength(1);
    expect(activeAuraSources(world, foe)[0]!.expiresAtTick).toBeUndefined();
  });

  it("default (no lingerSec) drops on the very tick it leaves", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    idle(world);
    place(world, foe, LINE_X, Z0.center.z + 16);
    idle(world, 1);
    expect(auraIds(world, foe)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────── 4. abilityRange (#136/#125)

describe("aura radius flows through the combat-env abilityRange factor", () => {
  it("resolveAuraRadius scales the base exactly like an ability AoE", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    world.combatEnv = normalizeCombatEnv({ abilityRange: 0.6 });
    expect(resolveAuraRadius(world, 9.17)).toBeCloseTo(5.502, 9);
  });

  it("a 60% range budget actually shrinks who is inside", () => {
    // 8 units away: inside 9.17, outside 9.17 * 0.6 = 5.502.
    const build = (abilityRange: number): SimWorld => {
      const world = new SimWorld(SKELETON_ARENA, 7);
      world.combatEnv = normalizeCombatEnv({ abilityRange });
      const src = spawn(world, 0, P(0));
      const foe = spawn(world, 1, P(8));
      emit(world, src, REIATSU);
      idle(world);
      return world;
    };
    // entity ids restart per world; the foe is the second spawn.
    const inside = build(1.0);
    const outside = build(0.6);
    const foeOf = (w: SimWorld): EntityId => [...w.stats.keys()][1]!;
    expect(auraIds(inside, foeOf(inside))).toHaveLength(1);
    expect(auraIds(outside, foeOf(outside))).toHaveLength(0);
  });

  it("abilityRange 0 makes the aura reach nobody, including the emitter", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    world.combatEnv = normalizeCombatEnv({ abilityRange: 0 });
    const src = spawn(world, 0, P(0));
    const mate = spawn(world, 0, P(1));
    emit(world, src, {
      key: "command",
      radius: 9.17,
      affects: "ally",
      modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 10 }],
    });
    idle(world);
    expect(auraIds(world, src)).toHaveLength(0);
    expect(auraIds(world, mate)).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────── 5. DETERMINISM

describe("determinism", () => {
  const run = (seed: number, ticks: number): { digests: number[]; rng: number[] } => {
    const world = new SimWorld(SKELETON_ARENA, seed);
    const a = spawn(world, 0, P(-3));
    const b = spawn(world, 1, P(3));
    emit(world, a, REIATSU);
    emit(world, b, {
      key: "aegis",
      radius: 7,
      affects: "ally",
      modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 12 }],
      lingerSec: 0.4,
    });
    const digests: number[] = [];
    const rng: number[] = [];
    for (let k = 0; k < ticks; k++) {
      // let them actually fight so positions (hence membership) churn
      world.nav.get(a)!.attackTarget = b;
      world.nav.get(b)!.attackTarget = a;
      const hp = world.health.get(b)!;
      hp.hp = hp.maxHp;
      world.step(NO_INTENTS);
      digests.push(world.digest());
      rng.push(world.rng.state);
    }
    return { digests, rng };
  };

  it("same seed ⇒ identical digest AND rng.state on every one of 300 ticks", () => {
    const one = run(90210, 300);
    const two = run(90210, 300);
    expect(one.digests).toEqual(two.digests);
    expect(one.rng).toEqual(two.rng);
  });

  it("COUNTER-PROOF: a different seed really does diverge (the test above is not vacuous)", () => {
    const a = run(90210, 300);
    const b = run(11111, 300);
    expect(a.digests).not.toEqual(b.digests);
  });

  it("auraSystem draws NOTHING from the rng", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    emit(world, src, REIATSU);
    const before = world.rng.state;
    for (let k = 0; k < 40; k++) {
      // toggle membership every tick — attach and detach must both be free
      place(world, foe, LINE_X, Z0.center.z + (k % 2 === 0 ? 5 : 16));
      idle(world);
    }
    // A draw here would shift every downstream crit/proc roll and desync replays.
    expect(world.rng.state).toBe(before);
  });

  it("no aura in the world ⇒ digest-identical to a run that never had the field", () => {
    const bare = new SimWorld(SKELETON_ARENA, 4242);
    spawn(bare, 0, P(-3));
    spawn(bare, 1, P(3));
    const armed = new SimWorld(SKELETON_ARENA, 4242);
    const a = spawn(armed, 0, P(-3));
    spawn(armed, 1, P(3));
    // "armed" = the mechanism fully live (an emitter, a query, a diff) with a
    // radius nobody is inside. Same code path, nothing projected ⇒ the world
    // must hash byte-identically to one that has no aura field at all.
    emit(armed, a, { ...REIATSU, radius: 0.0001 });
    for (let k = 0; k < 200; k++) {
      idle(bare);
      idle(armed);
      expect(armed.digest()).toBe(bare.digest());
    }
  });
});

// ──────────────────────────────────────────────── 6. STRUCTURAL GUARANTEES

describe("structural guarantees", () => {
  it("an aura cannot re-broadcast an aura (no contact spreading)", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const mate = spawn(world, 0, P(4));
    const far = spawn(world, 0, P(12));
    emit(world, src, {
      key: "relay",
      radius: 6,
      affects: "ally",
      includeSelf: false,
      modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 1 }],
    });
    idle(world);
    const projected = activeAuraSources(world, mate)[0] as ModifierSource | undefined;
    expect(projected).toBeDefined();
    // (a) the projection never copies the `auras` array off the emitter.
    expect(projected!.auras).toBeUndefined();
    // (b) and even if something else wrote one onto it, `auraSystem` skips every
    //     `kind: "aura"` source when collecting emitters — so `far` (out of
    //     src's 6 but only 8 from mate) is still never reached. Hand-forging the
    //     relay is the only way to exercise that guard, since AuraDef has no
    //     field that could smuggle it through.
    projected!.auras = [
      {
        key: "relayed",
        radius: 9.17,
        affects: "ally",
        modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 1 }],
      },
    ];
    idle(world, 3);
    expect(auraIds(world, far)).toHaveLength(0);
    expect(activeAuraSources(world, mate)).toHaveLength(1);
  });

  it("units with no StatsComp (flowers / neutral furniture) are never given one", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    // A bare neutral body: transform + health only, exactly like a flower.
    const neutral = world.spawn();
    world.transform.set(neutral, {
      pos: P(2),
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.4,
      zone: 0,
    });
    world.health.set(neutral, {
      hp: 10,
      maxHp: 10,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    emit(world, src, { ...REIATSU, affects: "all" });
    expect(() => idle(world, 3)).not.toThrow();
    expect(world.stats.has(neutral)).toBe(false);
  });

  it("the projected source order is stable across replicas (Override/hook order)", () => {
    const order = (seed: number): string[] => {
      const world = new SimWorld(SKELETON_ARENA, seed);
      const a = spawn(world, 0, P(-2));
      const b = spawn(world, 0, P(2));
      const foe = spawn(world, 1, P(0));
      emit(world, b, REIATSU); // attach in the OPPOSITE order to entity id
      emit(world, a, REIATSU);
      idle(world);
      return auraIds(world, foe).map((s) => s.replace(/\d+/g, "#"));
    };
    // Emitters are walked in ascending entity id regardless of attach order.
    expect(order(7)).toEqual(order(999));
    expect(order(7)).toHaveLength(2);
  });

  it("a rank-up swaps the projected payload in place, without a leave/enter cycle", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    const sourceId = emit(world, src, REIATSU);
    idle(world);
    const before = activeAuraSources(world, foe)[0]!;
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(
      world.stats.get(src)!.final[Stat.AttackSpeed] * 0.75,
      9,
    );

    // rank 2 of the same passive: same key, stronger numbers.
    const emitting = world.stats.get(src)!.sources.find((s) => s.id === sourceId)!;
    emitting.auras = [
      {
        ...REIATSU,
        modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: -0.5 }],
      },
    ];
    idle(world);
    const after = activeAuraSources(world, foe)[0]!;
    expect(after).toBe(before); // same object -> no detach/reattach churn
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(
      world.stats.get(src)!.final[Stat.AttackSpeed] * 0.5,
      9,
    );
  });

  it("the emitting source's stacks multiply the projected payload", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const src = spawn(world, 0, P(0));
    const foe = spawn(world, 1, P(5));
    idle(world);
    const baseArmor = world.stats.get(foe)!.final[Stat.Armor];
    attachSource(world, src, {
      id: "buff:stacking",
      kind: "buff",
      stacks: 3,
      auras: [
        {
          key: "corrosion",
          radius: 9.17,
          affects: "enemy",
          modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: -2 }],
        },
      ],
    });
    idle(world);
    expect(world.stats.get(foe)!.final[Stat.Armor]).toBeCloseTo(baseArmor - 6, 9);
  });
});

// ───────────────────────────────────────────── 7. THE CONTENT PATH, END TO END

describe("the shape a content doc will use", () => {
  it("ability@1 passive.ranks[0].auras reaches the target through syncAbilityPassives", () => {
    // A fixture ability doc in exactly the shape 79-00 靈壓 will take once the
    // content lane fills its empty `modifiers: []` block in.
    const ABILITY_ID = "fixture.reiatsu.passive" as AbilityId;
    const def: AbilityDef = {
      id: ABILITY_ID,
      name: "79-00 靈壓 (fixture)",
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      radius: 9.17,
      targetsEnemies: true,
      effects: [],
      passive: {
        name: "79-00 靈壓 (fixture)",
        ranks: [
          {
            // the caster's own half — 「初始法力值較一般人高」
            modifiers: [{ stat: Stat.MaxMana, op: ModOp.Flat, value: 150 }],
            // the projected half — 「範圍500內敵人攻擊速度-25%」
            auras: [REIATSU],
          },
        ],
      },
    };
    Abilities.register(ABILITY_ID, def);
    const base = Champions.get("thorne" as ChampionId);
    const CHAMP_ID = "fixture-ichigo" as ChampionId;
    Champions.register(CHAMP_ID, { ...base, id: CHAMP_ID, passiveAbility: ABILITY_ID });

    const world = new SimWorld(SKELETON_ARENA, 7);
    const ichigo = spawnChampion(world, {
      championId: CHAMP_ID,
      seatId: asSeatId(seat++),
      teamId: asTeamId(0),
      pos: P(0),
      zone: 0,
    });
    const foe = spawn(world, 1, P(5));
    syncAbilityPassives(world, ichigo);
    recomputeStats(world, ichigo);
    idle(world);

    // #248: the champion's real level-1 mana is `championStatBase`, not the raw
    // `baseStats[MaxMana]` — thorne's card says 70 and he has 280 (70 + 15×INT 14).
    const baseMana = championStatBase(Champions.get("thorne" as ChampionId), Stat.MaxMana, 1);
    // ⚠️ `final` 走完 `finalizeStat`,所以它含**基礎加成**(owner 2026-08-12 的全域
    //    初始 MP +600)。⛔ 不要把 600 抄進來 —— 從 world 自己那張表讀,
    //    owner 明天把它調成 800,這條測試要跟著走而不是紅(第二守則:不驗數字)。
    const manaBonus = baseBonusFor(world.baseBonus, Stat.MaxMana);
    expect(world.stats.get(ichigo)!.final[Stat.MaxMana]).toBeCloseTo(baseMana + 150 + manaBonus, 6);
    expect(auraIds(world, foe)).toEqual([
      auraSourceId(ichigo, `abilityPassive:${ABILITY_ID}`, "reiatsu"),
    ]);
    expect(world.stats.get(foe)!.final[Stat.AttackSpeed]).toBeCloseTo(
      world.stats.get(ichigo)!.final[Stat.AttackSpeed] * 0.75,
      9,
    );
  });

  it("an AURA-ONLY passive still attaches — it grants its carrier no stat at all", () => {
    // Regression guard on rankBlock's emptiness test: 靈壓's aura half lives
    // in a block whose `modifiers`/`hooks` may legitimately be absent.
    const ABILITY_ID = "fixture.aura-only.passive" as AbilityId;
    Abilities.register(ABILITY_ID, {
      id: ABILITY_ID,
      name: "aura-only (fixture)",
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      effects: [],
      passive: { ranks: [{ auras: [REIATSU] }] },
    });
    const base = Champions.get("thorne" as ChampionId);
    const CHAMP_ID = "fixture-aura-only" as ChampionId;
    Champions.register(CHAMP_ID, { ...base, id: CHAMP_ID, passiveAbility: ABILITY_ID });

    const world = new SimWorld(SKELETON_ARENA, 7);
    const carrier = spawnChampion(world, {
      championId: CHAMP_ID,
      seatId: asSeatId(seat++),
      teamId: asTeamId(0),
      pos: P(0),
      zone: 0,
    });
    const foe = spawn(world, 1, P(5));
    idle(world);
    expect(
      world.stats.get(carrier)!.sources.some((s) => s.id === `abilityPassive:${ABILITY_ID}`),
    ).toBe(true);
    expect(auraIds(world, foe)).toHaveLength(1);
  });
});
