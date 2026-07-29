/**
 * TASK #249 — the 變身 primitive (G1). Every guard here is written against
 * BEHAVIOUR the player can feel, not against the fields the implementation
 * happens to keep:
 *
 *   1. STATS — after transforming, `world.stats` resolves the SECOND FORM's
 *      sheet. Asserted by comparing the whole final StatBlock against a
 *      champion spawned directly as the alternate, so no formula is duplicated
 *      here and `championId` is never read as a proxy for "it worked".
 *   2. ABSOLUTE TICK — the form lapses on a tick number, not after N calls of
 *      the system: it does not go home one tick early, and a tick JUMP (replay
 *      seek / paused host) expires it in a single step.
 *   3. DEATH — a corpse is the hero the player picked.
 *   4. NO CRASH — a destination body the registry does not know refuses the
 *      cast, writes nothing, and leaves the id the SNAPSHOT reads every tick
 *      (`Champions.get(champ.championId)`) resolvable. That call throwing is
 *      the whole room going down 30×/second, not a missing model.
 *   5. DIGEST — a transformed world and an untransformed one hash differently
 *      while the form is up, and IDENTICALLY again once it has lapsed (so the
 *      difference is provably the form and nothing that drifted alongside it).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { Stat } from "./stats/statTypes";
import type { StatBlock } from "./stats/statTypes";
import type { IntentFrame } from "./intents";
import type { AbilityDef, ChampionDef } from "./content/defs";
import { Champions, registerChampion } from "./content/registry";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import type { EffectDef } from "./effects/effect";
import {
  FORM_NEVER_EXPIRES,
  FORM_REJECT_REASON,
  championFormIndex,
  endCombatChampionForms,
} from "./systems/ChampionFormSystem";
import { TICK_HZ } from "../constants";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

// ---------------------------------------------------------------------------
// A synthetic w3x-shaped pair: two COMPLETE champion docs linked by
// `transform.counterpartId`, exactly like the map's Eme1/Emeu units.
//
// The two forms deliberately share maxHealth and maxMana and differ only in
// ARMOR and ATTACK RANGE (melee → ranged, which is 40萬解's real difference:
// 100 → 450 wc3 units). That is what makes the digest guard below meaningful:
// a transform that moved a maximum would move `hp` too, and `hp` is already
// hashed — the fold could look load-bearing while carrying nothing.
// ---------------------------------------------------------------------------
const BASE_ID = "form-base" as ChampionId;
const ALT_ID = "form-alt" as ChampionId;
const BROKEN_ID = "form-broken" as ChampionId;
/** Never registered. Stands in for the four forms the importer had not shipped. */
const GHOST_ID = "form-ghost" as ChampionId;

const ALT_ARMOR = 200;
const ALT_RANGE = 9.2;

/** A transform ability in the Q slot (spawns at rank 1, so it is castable). */
function formAbility(id: string, e: EffectDef): AbilityDef {
  return {
    id: id as AbilityId,
    name: "變身",
    slot: "Q",
    castType: "self",
    maxRank: 1,
    cooldown: [0],
    manaCost: [0],
    range: 0,
    effects: [e],
  };
}

function champion(
  id: ChampionId,
  opts: {
    role: "base" | "alternate";
    counterpartId?: ChampionId;
    armor?: number;
    range?: number;
    qEffect: EffectDef;
  },
): ChampionDef {
  return {
    ...THORNE,
    id,
    name: `form ${id}`,
    modelKey: `champ.${id}`,
    baseStats: {
      ...THORNE.baseStats,
      [Stat.Armor]: opts.armor ?? THORNE.baseStats[Stat.Armor],
      [Stat.AttackRange]: opts.range ?? THORNE.baseStats[Stat.AttackRange],
    },
    abilities: {
      ...THORNE.abilities,
      Q: formAbility(`${id}.q`, opts.qEffect),
    },
    transform: {
      role: opts.role,
      ...(opts.counterpartId !== undefined ? { counterpartId: opts.counterpartId } : {}),
      normalUnitRawcode: "H00X",
      alternateUnitRawcode: "H00Y",
      triggerAbility: { rawcode: "A000", name: "99-01 測試變身" },
    },
    skillOrder: ["Q", "E", "W", "R"],
  };
}

const TO_ALT: EffectDef = { kind: "championForm", to: "alternate", durationSec: 1 };
const TO_BASE: EffectDef = { kind: "championForm", to: "base" };

beforeAll(() => {
  registerSkeletonContent();
  registerChampion(champion(BASE_ID, { role: "base", counterpartId: ALT_ID, qEffect: TO_ALT }), {
    overrideAbilities: true,
  });
  registerChampion(
    champion(ALT_ID, {
      role: "alternate",
      counterpartId: BASE_ID,
      armor: ALT_ARMOR,
      range: ALT_RANGE,
      qEffect: TO_BASE,
    }),
    { overrideAbilities: true },
  );
  // The pre-G0 world: a link that NAMES a body nobody shipped.
  registerChampion(
    champion(BROKEN_ID, { role: "base", counterpartId: GHOST_ID, qEffect: TO_ALT }),
    { overrideAbilities: true },
  );
});

function mkWorld(seed = 11): SimWorld {
  return new SimWorld(SKELETON_ARENA, seed);
}

function spawn(world: SimWorld, championId: ChampionId, seat = 0): EntityId {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat),
    teamId: asTeamId(seat % 2),
    pos: { x: Z0.center.x + seat * 2, z: Z0.center.z },
    zone: 0,
  });
}

/** Run one effect with the caster as the subject (what a self-cast produces). */
function cast(world: SimWorld, id: EntityId, e: EffectDef): void {
  runEffects([e], {
    world,
    caster: id,
    rank: 1,
    targets: [id],
    origin: "ability:form-base.q",
    abilitySlot: "Q",
    rng: world.rng,
  });
}

const finalOf = (world: SimWorld, id: EntityId): StatBlock => world.stats.get(world.champion.has(id) ? id : id)!.final;

// ---------------------------------------------------------------------------
// 1. THE SECOND FORM'S NUMBERS ACTUALLY APPLY
// ---------------------------------------------------------------------------

describe("championForm — the transformed body's stats are the ones that fight", () => {
  it("resolves the ALTERNATE doc's whole stat sheet, keeping id / level / HP", () => {
    cover("championform-stats");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID, 0);
    // reference: the same champion spawned DIRECTLY as the alternate body
    const reference = spawn(world, ALT_ID, 1);
    world.step(NO_INTENTS);

    const baseSheet = { ...finalOf(world, hero) };
    const altSheet = { ...finalOf(world, reference) };
    // the two forms must genuinely differ, or this whole test proves nothing
    expect(altSheet[Stat.Armor]).not.toBeCloseTo(baseSheet[Stat.Armor], 5);
    expect(altSheet[Stat.AttackRange]).not.toBeCloseTo(baseSheet[Stat.AttackRange], 5);

    const hpBefore = world.health.get(hero)!.hp;
    const levelBefore = world.champion.get(hero)!.level;

    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 30 });
    world.step(NO_INTENTS);

    // READ THE FINAL STATS, not the id: after the swap this body's sheet is
    // byte-identical to a champion that was the alternate all along.
    expect(finalOf(world, hero)).toEqual(altSheet);
    expect(finalOf(world, hero)[Stat.Armor]).toBeCloseTo(altSheet[Stat.Armor], 5);
    // …and it is NOT the base's sheet any more
    expect(finalOf(world, hero)[Stat.Armor]).not.toBeCloseTo(baseSheet[Stat.Armor], 5);
    // 近戰 → 遠程, the 40萬解 case
    expect(finalOf(world, hero)[Stat.AttackRange]).toBeCloseTo(ALT_RANGE, 5);

    // identity is preserved: same entity, same level, same HP (the two forms
    // share a maxHealth, so a preserved ratio is a preserved absolute here)
    expect(world.champion.get(hero)!.level).toBe(levelBefore);
    expect(world.health.get(hero)!.hp).toBeCloseTo(hpBefore, 5);
    expect(world.champion.has(hero)).toBe(true);
    expect(championFormIndex(world, hero)).toBe(1);
  });

  it("goes home to the BASE sheet on an explicit to:\"base\"", () => {
    cover("championform-stats");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    world.step(NO_INTENTS);
    const baseSheet = { ...finalOf(world, hero) };

    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 30 });
    world.step(NO_INTENTS);
    expect(finalOf(world, hero)[Stat.Armor]).not.toBeCloseTo(baseSheet[Stat.Armor], 5);

    cast(world, hero, TO_BASE);
    world.step(NO_INTENTS);
    expect(finalOf(world, hero)).toEqual(baseSheet);
    expect(championFormIndex(world, hero)).toBe(0);
    expect(world.championForm.has(hero)).toBe(false);
  });

  it("toggle flips both ways off ONE authored effect (the w3x 風王結界/紮根 form)", () => {
    cover("championform-stats");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID, 0);
    const reference = spawn(world, ALT_ID, 1);
    world.step(NO_INTENTS);
    const baseSheet = { ...finalOf(world, hero) };
    const altSheet = { ...finalOf(world, reference) };

    const toggle: EffectDef = { kind: "championForm", to: "toggle" };
    cast(world, hero, toggle);
    world.step(NO_INTENTS);
    expect(finalOf(world, hero)).toEqual(altSheet);
    // a toggle carries no `ahdu`, so it never lapses on its own
    expect(world.championForm.get(hero)!.expiresTick).toBe(FORM_NEVER_EXPIRES);

    cast(world, hero, toggle);
    world.step(NO_INTENTS);
    expect(finalOf(world, hero)).toEqual(baseSheet);
  });
});

// ---------------------------------------------------------------------------
// 2. ABSOLUTE TICK EXPIRY
// ---------------------------------------------------------------------------

describe("championForm — expiry is an ABSOLUTE tick", () => {
  it("lapses on expiresTick exactly, and NOT one tick early", () => {
    cover("championform-expiry");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    // warm up first, so an implementation that stored a RELATIVE count instead
    // of `world.tick + n` reverts 10 ticks too early and this test says so.
    for (let i = 0; i < 10; i++) world.step(NO_INTENTS);
    expect(world.tick).toBe(10);

    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 1 });
    const form = world.championForm.get(hero)!;
    expect(form.expiresTick).toBe(10 + TICK_HZ);

    // every tick strictly before expiresTick keeps the form
    while (world.tick < form.expiresTick) {
      world.step(NO_INTENTS);
      if (world.tick < form.expiresTick) {
        expect(championFormIndex(world, hero)).toBe(1);
      }
    }
    // world.tick === expiresTick, but the system for THAT tick has not run yet
    expect(world.tick).toBe(form.expiresTick);
    expect(championFormIndex(world, hero)).toBe(1);
    expect(world.champion.get(hero)!.championId).toBe(ALT_ID);

    world.step(NO_INTENTS); // this is the tick the form lapses on
    expect(championFormIndex(world, hero)).toBe(0);
    expect(world.champion.get(hero)!.championId).toBe(BASE_ID);
    expect(world.championForm.has(hero)).toBe(false);
  });

  it("a TICK JUMP expires it in a single step (absolute, not a countdown)", () => {
    cover("championform-expiry");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 10 });
    expect(world.championForm.get(hero)!.expiresTick).toBe(10 * TICK_HZ);

    // a replay seek / a host that resumed far ahead: 300 ticks of duration are
    // gone in one step. A per-tick decrement would need 300 more calls.
    world.tick = 5000;
    world.step(NO_INTENTS);
    expect(world.champion.get(hero)!.championId).toBe(BASE_ID);
    expect(world.championForm.has(hero)).toBe(false);
  });

  it("re-casting REFRESHES the duration instead of bouncing off", () => {
    cover("championform-expiry");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 1 });
    const first = world.championForm.get(hero)!.expiresTick;
    for (let i = 0; i < 5; i++) world.step(NO_INTENTS);
    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 1 });
    expect(world.championForm.get(hero)!.expiresTick).toBe(first + 5);
    expect(world.champion.get(hero)!.championId).toBe(ALT_ID);
    // no `castRejected` — "already in that form" is a refresh, not a refusal
    expect(world.events.filter((e) => e.type === "castRejected")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. FORCED REVERTS: death, combat end
// ---------------------------------------------------------------------------

describe("championForm — forced reverts", () => {
  it("death drags the body home even with 60s of duration left", () => {
    cover("championform-death");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 60 });
    world.step(NO_INTENTS);
    expect(world.champion.get(hero)!.championId).toBe(ALT_ID);

    world.health.get(hero)!.hp = 0;
    world.step(NO_INTENTS); // deathSystem flips `alive`
    expect(world.health.get(hero)!.alive).toBe(false);
    // the form must be gone, so the corpse / #220 dissolve / a revive all use
    // the hero the player actually picked
    world.step(NO_INTENTS);
    expect(world.champion.get(hero)!.championId).toBe(BASE_ID);
    expect(world.championForm.has(hero)).toBe(false);
    expect(world.stats.get(hero)!.championId).toBe(BASE_ID);
  });

  it("endCombatChampionForms sends everybody home, even the never-expiring toggles", () => {
    cover("championform-death");
    const world = mkWorld();
    const a = spawn(world, BASE_ID, 0);
    const b = spawn(world, BASE_ID, 1);
    cast(world, a, { kind: "championForm", to: "toggle" }); // no expiry at all
    cast(world, b, { kind: "championForm", to: "alternate", durationSec: 60 });
    world.step(NO_INTENTS);
    expect(world.championForm.size).toBe(2);

    endCombatChampionForms(world);
    expect(world.championForm.size).toBe(0);
    expect(world.champion.get(a)!.championId).toBe(BASE_ID);
    expect(world.champion.get(b)!.championId).toBe(BASE_ID);
    world.step(NO_INTENTS);
    expect(world.stats.get(a)!.final[Stat.Armor]).toBeCloseTo(
      world.stats.get(b)!.final[Stat.Armor],
      5,
    );
    // idempotent, exactly like endCombatMobs / endCombatGuardians
    expect(() => endCombatChampionForms(world)).not.toThrow();
  });

  it("a destroyed entity leaves no form behind for a recycled id", () => {
    cover("championform-death");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    cast(world, hero, { kind: "championForm", to: "alternate", durationSec: 60 });
    expect(world.championForm.has(hero)).toBe(true);
    world.destroy(hero);
    expect(world.championForm.has(hero)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. AN UNKNOWN BODY REFUSES THE CAST — it does not take the room down
// ---------------------------------------------------------------------------

describe("championForm — an unresolvable body is refused, never thrown", () => {
  /** EXACTLY what apps/game-server/src/net/snapshot.ts does every tick. */
  const snapshotRead = (world: SimWorld, id: EntityId): string =>
    Champions.get(world.champion.get(id)!.championId).modelKey;

  it("a counterpart with no champion doc: no throw, no write, one castRejected", () => {
    cover("championform-reject");
    const world = mkWorld();
    const hero = spawn(world, BROKEN_ID);
    world.step(NO_INTENTS);

    expect(() => cast(world, hero, TO_ALT)).not.toThrow();
    expect(world.champion.get(hero)!.championId).toBe(BROKEN_ID);
    expect(world.stats.get(hero)!.championId).toBe(BROKEN_ID);
    expect(world.championForm.has(hero)).toBe(false);

    const rejects = world.events.filter((e) => e.type === "castRejected");
    expect(rejects).toHaveLength(1);
    expect(rejects[0]!.data).toMatchObject({
      entity: hero,
      slot: "Q",
      reason: FORM_REJECT_REASON,
    });

    // THE ROOM SURVIVES: the snapshot's own `Champions.get` keeps resolving.
    for (let i = 0; i < 5; i++) {
      world.step(NO_INTENTS);
      expect(() => snapshotRead(world, hero)).not.toThrow();
    }
    expect(snapshotRead(world, hero)).toBe(`champ.${BROKEN_ID}`);
  });

  it("a hero with NO transform link at all is refused the same way", () => {
    cover("championform-reject");
    const world = mkWorld();
    const hero = spawn(world, THORNE.id);
    world.step(NO_INTENTS);
    expect(() => cast(world, hero, TO_ALT)).not.toThrow();
    expect(world.champion.get(hero)!.championId).toBe(THORNE.id);
    expect(world.events.filter((e) => e.type === "castRejected")).toHaveLength(1);
    expect(() => snapshotRead(world, hero)).not.toThrow();
  });

  it("to:\"base\" from a body that is already home changes nothing", () => {
    cover("championform-reject");
    const world = mkWorld();
    const hero = spawn(world, BASE_ID);
    world.step(NO_INTENTS);
    const sheet = { ...finalOf(world, hero) };
    expect(() => cast(world, hero, TO_BASE)).not.toThrow();
    expect(world.champion.get(hero)!.championId).toBe(BASE_ID);
    world.step(NO_INTENTS);
    expect(finalOf(world, hero)).toEqual(sheet);
  });
});

// ---------------------------------------------------------------------------
// 5. DIGEST
// ---------------------------------------------------------------------------

describe("championForm — the digest can see the form", () => {
  /** One champion, alone, so nothing else in the world can drift. */
  function soloWorld(): { world: SimWorld; hero: EntityId } {
    const world = mkWorld(2029);
    const hero = spawn(world, BASE_ID);
    return { world, hero };
  }

  it("same seed, one transforms and one does not ⇒ different digest", () => {
    cover("championform-digest");
    const plain = soloWorld();
    const morph = soloWorld();
    // control: identical setups hash identically before anything happens
    expect(plain.world.digest()).toBe(morph.world.digest());

    cast(morph.world, morph.hero, { kind: "championForm", to: "alternate", durationSec: 1 });
    for (let i = 0; i < 10; i++) {
      plain.world.step(NO_INTENTS);
      morph.world.step(NO_INTENTS);
    }

    // NOTHING ELSE MOVED: the two forms share maxHealth/maxMana, so hp, mana and
    // position are equal — the digests can only differ through the form fold.
    expect(morph.world.health.get(morph.hero)!.hp).toBeCloseTo(
      plain.world.health.get(plain.hero)!.hp,
      9,
    );
    expect(morph.world.health.get(morph.hero)!.mana).toBeCloseTo(
      plain.world.health.get(plain.hero)!.mana,
      9,
    );
    expect(morph.world.rng.state).toBe(plain.world.rng.state);
    expect(championFormIndex(morph.world, morph.hero)).toBe(1);

    expect(morph.world.digest()).not.toBe(plain.world.digest());

    // …and once the form lapses the two worlds hash IDENTICALLY again, which is
    // what proves the divergence above was the form and only the form.
    for (let i = 0; i < 40; i++) {
      plain.world.step(NO_INTENTS);
      morph.world.step(NO_INTENTS);
    }
    expect(championFormIndex(morph.world, morph.hero)).toBe(0);
    expect(morph.world.digest()).toBe(plain.world.digest());
  });

  it("two forms armed with DIFFERENT durations diverge on the transform tick", () => {
    cover("championform-digest");
    const short = soloWorld();
    const long = soloWorld();
    cast(short.world, short.hero, { kind: "championForm", to: "alternate", durationSec: 1 });
    cast(long.world, long.hero, { kind: "championForm", to: "alternate", durationSec: 3 });
    short.world.step(NO_INTENTS);
    long.world.step(NO_INTENTS);
    // both are still transformed — only the scheduled expiry differs
    expect(championFormIndex(short.world, short.hero)).toBe(1);
    expect(championFormIndex(long.world, long.hero)).toBe(1);
    expect(short.world.digest()).not.toBe(long.world.digest());
  });

  it("identical transforms replay to identical digests", () => {
    cover("championform-digest");
    const a = soloWorld();
    const b = soloWorld();
    cast(a.world, a.hero, { kind: "championForm", to: "alternate", durationSec: 2 });
    cast(b.world, b.hero, { kind: "championForm", to: "alternate", durationSec: 2 });
    for (let i = 0; i < 90; i++) {
      a.world.step(NO_INTENTS);
      b.world.step(NO_INTENTS);
    }
    expect(a.world.digest()).toBe(b.world.digest());
  });
});
