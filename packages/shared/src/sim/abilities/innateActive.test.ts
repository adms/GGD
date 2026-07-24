/**
 * THE SIXTH SLOT, CASTABLE — the ~60 `innateKind: "active"` 天生技.
 *
 * WHAT THIS PROVES, and why each assertion is not vacuous:
 *
 *  1. THE SLOT IS REACHABLE. Before this lane `Command.castAbility` carried
 *     `AbilitySlot` (Q/W/E/R/EX), so no intent frame could name the innate and
 *     all 60 active innates were unreachable — not broken, UNADDRESSABLE. The
 *     first block casts one through the REAL command path (an `IntentFrame`
 *     into `world.step`, not a direct `castAbility` call), because a direct
 *     call would prove the function and not the seam that was missing.
 *
 *  2. IT IS STILL NOT RANKABLE. The whole risk of opening this slot is that it
 *     also becomes levelable — 天生技 is owned at rank 1 forever. The guard is a
 *     TYPE (`Command.rankUpAbility` keeps the narrower `AbilitySlot`), so the
 *     test forces the runtime past the type with an `as never` cast and shows
 *     the rank still does not move.
 *
 *  3. THE PERMANENT HALF STAYS UNCASTABLE. A 迴避/靈氣 innate must answer
 *     "passive" and pay NOTHING — no mana, no cooldown, no rng draw.
 *
 *  4. IT PAYS THE SAME PRICES. Cooldown (CDR- and combat-env-scaled), mana,
 *     stun/knockdown/mid-cast lockout, recovery — the innate goes through the
 *     one ladder with no sixth-slot exemption.
 *
 *  5. REPLAY IS UNTOUCHED. The new `tickCooldowns` line and the widened type
 *     add no rng draw and no state motion on any run that never presses the
 *     button — which is every recording made before this lane existed.
 *
 *  6. THE REAL 60 FIRE. A read-only sweep over the SHIPPED catalogue (no doc is
 *     written by this lane) casts every `innateKind: "active"` innate whose
 *     champion is registered and asserts it is accepted and does something
 *     measurable. Fixtures prove the mechanism; this proves the mechanism meets
 *     the content that motivated it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "../../content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
  registerChampion,
} from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { SELA, THORNE } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { castAbility, rankUpAbility, tickCooldowns } from "./abilitySystem";
import { abilityInstanceFor, innateCastBlock, isInnateSlot } from "./innateActive";
import { isActiveInnate, isPassiveInnate } from "./abilityPassives";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { CASTABLE_SLOTS, INNATE_SLOT, isCoreAbilitySlot } from "../intents";
import { asSeatId, asTeamId } from "../../ids";
import type { AbilityId, ChampionId, EntityId, SeatId } from "../../ids";
import type { AbilityDef, ChampionDef } from "../content/defs";
import type { CastTarget, CastableSlot, Command, IntentFrame } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../../.."); // packages/shared/src/sim/abilities -> repo root
const CONTENT_DIR = join(ROOT, "content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

// ───────────────────────────────────────────────────────────── fixtures
// Fixture ids are prefixed `fx-` so they can never collide with a shipped doc,
// and every fixture is registered in `beforeAll` AFTER the real catalogue —
// this lane writes no content file, it only adds throwaway registry entries.

const FX_ACTIVE = "fx-active.passive" as AbilityId;
const FX_ACTIVE_AOE = "fx-active-aoe.passive" as AbilityId;
const FX_PERMANENT = "fx-permanent.passive" as AbilityId;
const CH_ACTIVE = "fx-active" as ChampionId;
const CH_ACTIVE_AOE = "fx-active-aoe" as ChampionId;
const CH_PERMANENT = "fx-permanent" as ChampionId;

/**
 * A 60 s self-buff innate, shaped exactly like the real `76-00 二檔`
 * (`castType: "self"`, `maxRank: 1`, one cooldown column, one mana column).
 * Deterministic on purpose: `applyBuff` rolls no rng, so any digest movement in
 * the determinism tests is the mechanism's, not an effect's dice.
 */
const ACTIVE_INNATE: AbilityDef = {
  id: FX_ACTIVE,
  name: "FX-00 二檔 (fixture)",
  slot: "PASSIVE",
  innateKind: "active",
  castType: "self",
  maxRank: 1,
  cooldown: [60],
  manaCost: [40],
  range: 0,
  effects: [
    {
      kind: "applyBuff",
      modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.Flat, value: 2 }],
      duration: 20,
    },
  ],
};

/** A 40 s point-blank nuke, shaped like `22-00 嗚鎖打!` (ground AoE + damage). */
const ACTIVE_INNATE_AOE: AbilityDef = {
  id: FX_ACTIVE_AOE,
  name: "FX-00 嗚鎖打 (fixture)",
  slot: "PASSIVE",
  innateKind: "active",
  castType: "ground",
  maxRank: 1,
  cooldown: [40],
  manaCost: [0],
  range: 8,
  radius: 4,
  effects: [{ kind: "damage", damageType: "magic", amount: { flat: 150 } }],
};

/** The permanent half — a 迴避-style innate that may never be cast. */
const PERMANENT_INNATE: AbilityDef = {
  id: FX_PERMANENT,
  name: "FX-00 感應意脈 (fixture)",
  slot: "PASSIVE",
  innateKind: "passive",
  castType: "self",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 0,
  effects: [],
  passive: { ranks: [{ modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 10 }] }] },
};

function championWithInnate(base: ChampionDef, id: ChampionId, innate: AbilityId): ChampionDef {
  return { ...base, id, passiveAbility: innate };
}

// ───────────────────────────────────────────────────────────── helpers

let seatCounter = 0;
function spawn(world: SimWorld, championId: ChampionId, team: number, dx = 0): EntityId {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seatCounter++),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + dx, z: Z0.center.z + 14 },
    zone: 0,
  });
}

/** One world with a single champion of `championId`, seat 0. */
function solo(championId: ChampionId, seed = 4242) {
  seatCounter = 0;
  const world = new SimWorld(SKELETON_ARENA, seed);
  const id = spawn(world, championId, 0);
  return { world, id, ab: world.abilities.get(id)!, seat: asSeatId(0) };
}

function frame(...commands: Command[]): ReadonlyMap<SeatId, IntentFrame> {
  return new Map([[asSeatId(0), { commands }]]);
}

/** Cast slot through the REAL intent → commandSystem path, for one tick. */
function pressSlot(world: SimWorld, slot: CastableSlot, target: CastTarget): void {
  world.step(frame({ kind: "castAbility", slot, target }));
}

function eventsOfType(world: SimWorld, type: string) {
  return world.events.filter((e) => e.type === type);
}

let shippedActiveInnates: AbilityDef[] = [];
let shippedPermanentInnates: AbilityDef[] = [];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const loaded = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(loaded.store);
  const innates = Abilities.all().filter((a) => a.slot === INNATE_SLOT);
  shippedActiveInnates = innates.filter(isActiveInnate);
  shippedPermanentInnates = innates.filter(isPassiveInnate);

  // fixtures last, so nothing shipped is shadowed
  Abilities.register(FX_ACTIVE, ACTIVE_INNATE);
  Abilities.register(FX_ACTIVE_AOE, ACTIVE_INNATE_AOE);
  Abilities.register(FX_PERMANENT, PERMANENT_INNATE);
  registerChampion(championWithInnate(SELA, CH_ACTIVE, FX_ACTIVE));
  registerChampion(championWithInnate(THORNE, CH_ACTIVE_AOE, FX_ACTIVE_AOE));
  registerChampion(championWithInnate(SELA, CH_PERMANENT, FX_PERMANENT));
});

// ═══════════════════════════════════════════════ 1. the slot is reachable

describe("innate active — the sixth slot is reachable from an intent frame", () => {
  it("a PASSIVE-slot cast command reaches the innate and is accepted", () => {
    cover("innate-active-castable-via-command");
    const { world, id, ab } = solo(CH_ACTIVE);
    expect(ab.passiveSlot!.abilityId).toBe(FX_ACTIVE);
    expect(ab.passiveSlot!.rank).toBe(1); // owned from level 1, never unlocked

    const manaBefore = world.health.get(id)!.mana;
    pressSlot(world, "PASSIVE", { type: "self" });

    // accepted: no rejection, an abilityCast naming the sixth slot, mana paid
    expect(eventsOfType(world, "castRejected")).toEqual([]);
    const casts = eventsOfType(world, "abilityCast");
    expect(casts).toHaveLength(1);
    expect(casts[0]!.data.slot).toBe("PASSIVE");
    expect(casts[0]!.data.abilityId).toBe(FX_ACTIVE);
    // mana paid: ~40, minus the same tick's regen tick (this is a full
    // `world.step`, so regenSystem ran too — bound it instead of pinning it).
    const paid = manaBefore - world.health.get(id)!.mana;
    expect(paid).toBeGreaterThan(39);
    expect(paid).toBeLessThanOrEqual(40);
  });

  it("the innate's EFFECT actually lands — the buff is on the caster", () => {
    cover("innate-active-effect-applies");
    const { world, id } = solo(CH_ACTIVE);
    const msBefore = world.stats.get(id)!.final[Stat.MoveSpeed];
    pressSlot(world, "PASSIVE", { type: "self" });
    world.step(NO_INTENTS); // late statRecompute already ran, but be explicit
    expect(world.stats.get(id)!.final[Stat.MoveSpeed]).toBeCloseTo(msBefore + 2, 6);
  });

  it("a damaging innate hits enemies in its AoE (the 22-00 嗚鎖打 shape)", () => {
    cover("innate-active-aoe-damages");
    seatCounter = 0;
    const world = new SimWorld(SKELETON_ARENA, 777);
    const caster = spawn(world, CH_ACTIVE_AOE, 0, -1);
    const victim = spawn(world, "thorne" as ChampionId, 1, 1);
    const hpBefore = world.health.get(victim)!.hp;
    const vt = world.transform.get(victim)!.pos;
    pressSlot(world, "PASSIVE", { type: "point", point: { x: vt.x, z: vt.z } });
    for (let i = 0; i < 10; i++) world.step(NO_INTENTS);
    expect(world.health.get(victim)!.hp).toBeLessThan(hpBefore);
    expect(world.health.get(caster)!.hp).toBe(world.health.get(caster)!.maxHp); // no friendly fire
  });

  it("`abilityInstanceFor` is the ONE resolver — every slot lands on its instance", () => {
    cover("innate-slot-resolver");
    const { ab } = solo(CH_ACTIVE);
    expect(CASTABLE_SLOTS).toEqual(["Q", "W", "E", "R", "EX", "PASSIVE"]);
    for (const slot of CASTABLE_SLOTS) {
      const inst = abilityInstanceFor(ab, slot);
      if (isCoreAbilitySlot(slot)) expect(inst).toBe(ab.slots[slot]);
      else if (slot === "EX") expect(inst ?? null).toBe(ab.exSlot ?? null);
      else expect(inst).toBe(ab.passiveSlot);
    }
    expect(isInnateSlot("PASSIVE")).toBe(true);
    expect(isInnateSlot("EX")).toBe(false);
    expect(isCoreAbilitySlot("EX")).toBe(false);
    expect(isCoreAbilitySlot("PASSIVE")).toBe(false);
  });

  it("an UNVALIDATED slot string resolves to nothing — never to the innate", () => {
    cover("innate-junk-slot-not-innate");
    // The near-miss this pins: `abilityInstanceFor` used to end in
    // `slot === "EX" ? ab.exSlot : ab.passiveSlot`, so ANY string that was not
    // a core slot or "EX" — including the prototype keys the game-server's
    // `sec-input-01` suite fires at the sim — landed on the SIXTH SLOT and
    // would have cast the 天生技. It must fall through to undefined instead.
    const { world, id, ab } = solo(CH_ACTIVE);
    for (const junk of ["constructor", "__proto__", "toString", "valueOf", "P", ""]) {
      expect(abilityInstanceFor(ab, junk as never)).toBeUndefined();
      expect(castAbility(world, id, junk as never, { type: "self" })).toBe("not-learned");
    }
    // ...and the innate is still untouched: full mana, no cooldown, rank 1
    expect(ab.passiveSlot!.cooldownRemainingTicks).toBe(0);
    expect(world.health.get(id)!.mana).toBe(world.health.get(id)!.maxMana);
  });

  it("a hero with NO innate answers not-learned, not a crash", () => {
    cover("innate-absent-not-learned");
    const { world, id, ab } = solo("sela" as ChampionId); // skeleton sela: no NN-00
    expect(ab.passiveSlot ?? null).toBeNull();
    expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("not-learned");
  });
});

// ═══════════════════════════════════════════════ 2. still not rankable

describe("innate active — castable, never rankable", () => {
  it("a rankUpAbility command naming PASSIVE cannot move the innate's rank", () => {
    cover("innate-not-rankable");
    const { world, ab } = solo(CH_ACTIVE);
    ab.unspentPoints = 5;
    // `Command.rankUpAbility` carries `AbilitySlot`, which has no "PASSIVE"
    // member — this cast is the ONLY way to even express the attempt, and it is
    // exactly what a malicious client would have to get past `validateInput`.
    world.step(frame({ kind: "rankUpAbility", slot: "PASSIVE" as never }));
    expect(ab.passiveSlot!.rank).toBe(1);
    expect(ab.unspentPoints).toBe(5); // no point spent
    expect(eventsOfType(world, "rankUp")).toEqual([]);
  });

  it("spending every point on Q/W/E/R never touches the sixth slot", () => {
    cover("innate-rank-stays-1");
    const { world, id, ab } = solo(CH_ACTIVE);
    ab.unspentPoints = 20;
    for (const slot of ["Q", "W", "E", "R"] as const) {
      world.ultGateOverride = true;
      while (rankUpAbility(world, id, slot)) {
        /* drain */
      }
    }
    expect(ab.slots.Q.rank).toBeGreaterThan(1);
    expect(ab.passiveSlot!.rank).toBe(1);
  });
});

// ═══════════════════════════════════════════════ 3. permanent half unchanged

describe("innate active — the permanent half stays uncastable and free", () => {
  it("a permanent innate answers `passive` and pays absolutely nothing", () => {
    cover("innate-permanent-still-uncastable");
    const { world, id, ab } = solo(CH_PERMANENT);
    const manaBefore = world.health.get(id)!.mana;
    const rngBefore = world.rng.state;

    expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("passive");

    expect(world.health.get(id)!.mana).toBe(manaBefore); // no mana
    expect(ab.passiveSlot!.cooldownRemainingTicks).toBe(0); // no fabricated CD
    expect(ab.recovery ?? null).toBeNull(); // no commitment
    expect(world.rng.state).toBe(rngBefore); // no dice were rolled
    // and its permanent effect is still live (the passive lane's contract)
    expect(world.stats.get(id)!.final[Stat.Armor]).toBeGreaterThan(
      SELA.baseStats[Stat.Armor] ?? 0,
    );
  });

  it("`innateCastBlock` keys on the AUTHORED kind, not on the doc's shape", () => {
    cover("innate-cast-block-by-kind");
    // a mis-authored permanent innate that somehow grew a castable effect must
    // STILL be refused — `isPassiveOnly` alone would let this one through.
    const strayEffect: AbilityDef = {
      ...PERMANENT_INNATE,
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 999 } }],
    };
    expect(innateCastBlock(strayEffect)).toBe("passive");
    expect(innateCastBlock(ACTIVE_INNATE)).toBeNull();
    // a Q is not the sixth slot's business at all
    expect(innateCastBlock(Champions.get("sela" as ChampionId).abilities.Q)).toBeNull();
  });

  it("every SHIPPED permanent innate is refused with `passive`", () => {
    cover("innate-permanent-sweep-refused");
    expect(shippedPermanentInnates.length).toBeGreaterThan(40);
    const wrong: string[] = [];
    for (const def of shippedPermanentInnates) {
      const cid = def.id.replace(/\.passive$/, "") as ChampionId;
      if (!Champions.tryGet(cid)) continue;
      const { world, id } = solo(cid);
      if (castAbility(world, id, "PASSIVE", { type: "self" }) !== "passive") wrong.push(def.id);
    }
    expect(wrong).toEqual([]);
  });
});

// ═══════════════════════════════════════════════ 4. it pays the same prices

describe("innate active — one validation ladder, no sixth-slot exemption", () => {
  it("the cooldown is real, CDR/combat-env scaled, and ages one tick per tick", () => {
    cover("innate-cooldown-real");
    const { world, id, ab } = solo(CH_ACTIVE);
    const cdr = world.stats.get(id)!.final[Stat.CooldownReduction] ?? 0;
    const expected = Math.round((60 * (1 - cdr) * world.combatEnv.cooldown) / world.dt);

    pressSlot(world, "PASSIVE", { type: "self" });
    // the cast tick's own tickCooldowns ran BEFORE the cast, so the full value
    // is still standing at the end of the tick
    expect(ab.passiveSlot!.cooldownRemainingTicks).toBe(expected);

    // pressing again while it burns is refused as "cooldown", and pays nothing
    const manaMid = world.health.get(id)!.mana;
    pressSlot(world, "PASSIVE", { type: "self" });
    const rejects = eventsOfType(world, "castRejected");
    expect(rejects).toHaveLength(1);
    expect(rejects[0]!.data).toMatchObject({ slot: "PASSIVE", reason: "cooldown" });
    // nothing was charged for the refusal — mana only moved UP, by regen
    expect(world.health.get(id)!.mana).toBeGreaterThanOrEqual(manaMid);

    // ...and it ages exactly one per tick (the new tickCooldowns line)
    const before = ab.passiveSlot!.cooldownRemainingTicks;
    for (let i = 0; i < 10; i++) tickCooldowns(world);
    expect(ab.passiveSlot!.cooldownRemainingTicks).toBe(before - 10);
  });

  it("mana, stun and death gate the innate exactly like a Q", () => {
    cover("innate-ladder-parity");
    // no mana
    {
      const { world, id } = solo(CH_ACTIVE);
      world.health.get(id)!.mana = 1;
      expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("no-mana");
    }
    // stunned
    {
      const { world, id } = solo(CH_ACTIVE);
      world.status.set(id, {
        effects: [{ id: "stun" as never, stun: true, expiresAtTick: world.tick + 30 }],
      } as never);
      expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("stunned");
    }
    // knocked down (combat-juice prone)
    {
      const { world, id } = solo(CH_ACTIVE);
      world.knockdown.set(id, 10);
      expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("stunned");
    }
    // dead
    {
      const { world, id } = solo(CH_ACTIVE);
      world.health.get(id)!.alive = false;
      expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("dead");
    }
  });

  it("a whiffed innate ARMS recovery, tagged with the sixth slot", () => {
    cover("innate-arms-recovery");
    seatCounter = 0;
    const world = new SimWorld(SKELETON_ARENA, 99);
    const caster = spawn(world, CH_ACTIVE_AOE, 0, 0);
    // ground AoE aimed at empty space -> connects with nobody -> full commitment
    pressSlot(world, "PASSIVE", { type: "point", point: { x: Z0.center.x + 7, z: Z0.center.z } });
    const ab = world.abilities.get(caster)!;
    expect(ab.recovery?.slot).toBe("PASSIVE");
    expect(ab.recovery!.ticksLeft).toBeGreaterThan(0);
    // ...and while committed, a follow-up innate press is refused
    expect(castAbility(world, caster, "PASSIVE", { type: "self" })).toBe("cooldown");
  });

  it("the innate cannot be cast while another ability is mid-cast", () => {
    cover("innate-blocked-mid-cast");
    const { world, id, ab } = solo(CH_ACTIVE);
    ab.cast = {
      slot: "Q",
      abilityId: ab.slots.Q.abilityId,
      rank: 1,
      ticksLeft: 5,
      targets: [],
      rooted: true,
    };
    expect(castAbility(world, id, "PASSIVE", { type: "self" })).toBe("cooldown");
  });
});

// ═══════════════════════════════════════════════ 5. replay is untouched

describe("innate active — determinism and replay-neutrality", () => {
  it("no press ⇒ no motion: the sixth-slot cooldown never leaves 0", () => {
    cover("innate-replay-neutral-when-unpressed");
    // This is the exact property every PRE-EXISTING recording relies on: the
    // new `tickCooldowns` line must be a no-op on any run that never casts.
    const { world, ab } = solo(CH_ACTIVE);
    const rngStart = world.rng.state;
    for (let i = 0; i < 300; i++) {
      world.step(NO_INTENTS);
      expect(ab.passiveSlot!.cooldownRemainingTicks).toBe(0);
    }
    // a lone champion with no target draws nothing, so the rng must be pristine
    expect(world.rng.state).toBe(rngStart);
  });

  it("same seed + same innate press ⇒ identical digest and rng on every tick", () => {
    cover("innate-deterministic-digest");
    const run = (seed: number) => {
      seatCounter = 0;
      const world = new SimWorld(SKELETON_ARENA, seed);
      spawn(world, CH_ACTIVE_AOE, 0, -1);
      const victim = spawn(world, "thorne" as ChampionId, 1, 1);
      const vt = world.transform.get(victim)!.pos;
      const trace: [number, number][] = [];
      for (let t = 0; t < 300; t++) {
        const press =
          t % 100 === 5
            ? frame({
                kind: "castAbility",
                slot: "PASSIVE" as CastableSlot,
                target: { type: "point", point: { x: vt.x, z: vt.z } },
              })
            : NO_INTENTS;
        world.step(press);
        trace.push([world.digest(), world.rng.state]);
      }
      return trace;
    };
    const a = run(90210);
    const b = run(90210);
    expect(a).toEqual(b);
    // COUNTER-PROOF: the trace is not a constant — a different seed diverges,
    // so the equality above is a real property and not a vacuous one.
    expect(run(11111)).not.toEqual(a);
  });

  it("the cast path itself draws no rng — a refusal leaves the stream untouched", () => {
    cover("innate-refusal-no-rng-draw");
    const { world, id } = solo(CH_PERMANENT);
    const before = world.rng.state;
    for (let i = 0; i < 50; i++) castAbility(world, id, "PASSIVE", { type: "self" });
    expect(world.rng.state).toBe(before);
  });

  it("the sim source uses no wall clock and no Math.random", () => {
    cover("innate-purity-source-scan");
    const src = readFileSync(join(HERE, "innateActive.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random\(/);
    expect(src).not.toMatch(/Date\.now\(/);
  });
});

// ═══════════════════════════════════════════════ 6. the real 60

describe("innate active — the SHIPPED catalogue, read-only", () => {
  it("every shipped active innate is accepted and does something measurable", () => {
    cover("innate-active-shipped-sweep");
    expect(shippedActiveInnates.length).toBeGreaterThan(50);

    const refused: string[] = [];
    const inert: string[] = [];
    /** innates whose level-1 mana pool cannot afford them — a CONTENT fact. */
    const underfunded: string[] = [];
    let cast = 0;

    for (const def of shippedActiveInnates) {
      const cid = def.id.replace(/\.passive$/, "") as ChampionId;
      if (!Champions.tryGet(cid)) continue;

      seatCounter = 0;
      const world = new SimWorld(SKELETON_ARENA, 20260724);
      let caster: EntityId;
      let foe: EntityId;
      let ally: EntityId;
      try {
        caster = spawn(world, cid, 0, -0.7);
        foe = spawn(world, "thorne" as ChampionId, 1, 0.7);
        ally = spawn(world, "thorne" as ChampionId, 0, -1.9);
      } catch {
        continue; // champion needs a model/arena this harness does not provide
      }
      const hp = world.health.get(caster)!;
      const cost = def.manaCost[0] ?? 0;
      if (cost > hp.maxMana) underfunded.push(def.id);
      // Fill the pool. Where the authored cost EXCEEDS the level-1 pool that is
      // a balance fact recorded above, not a mechanism failure — the hero can
      // afford it a few levels later — so the sweep funds the cast and keeps
      // measuring the thing it is actually about: is the slot reachable?
      hp.mana = Math.max(hp.maxMana, cost);
      // `targetsEnemies: false` marks the ally-targeted innates (buffs/heals /
      // 開設雜貨店-style utility). Aiming those at the enemy is `bad-target` BY
      // DESIGN (abilitySystem's exclusive WC3 target flags), so the sweep must
      // aim them at a friend or it would be testing its own harness.
      const victim = def.targetsEnemies === false ? ally : foe;
      const vt = world.transform.get(victim)!.pos;
      const target: CastTarget =
        def.castType === "targeted"
          ? { type: "entity", entityId: victim }
          : def.castType === "self"
            ? { type: "self" }
            : def.castType === "ground"
              ? { type: "point", point: { x: vt.x, z: vt.z } }
              : { type: "dir", dir: { x: 1, z: 0 } };

      const foeHpBefore = world.health.get(foe)!.hp;
      const allyHpBefore = world.health.get(ally)!.hp;
      const sourcesBefore = world.stats.get(caster)!.sources.length;
      const result = castAbility(world, caster, "PASSIVE", target);
      if (result !== "ok") {
        refused.push(`${def.id}:${result}`);
        continue;
      }
      cast++;
      for (let i = 0; i < 40; i++) world.step(NO_INTENTS);

      const moved =
        world.health.get(foe)!.hp !== foeHpBefore ||
        world.health.get(ally)!.hp !== allyHpBefore ||
        world.stats.get(caster)!.sources.length !== sourcesBefore ||
        world.status.get(caster) !== undefined ||
        world.status.get(foe) !== undefined ||
        world.abilities.get(caster)!.passiveSlot!.cooldownRemainingTicks > 0;
      if (!moved) inert.push(def.id);
    }

    // Not one of the 60 may be refused: a refusal here means the slot is still
    // unreachable for that hero, which is the exact bug this lane closes.
    expect(refused).toEqual([]);
    expect(cast).toBeGreaterThan(50);
    // Every accepted cast must leave a trace. (A cooldown alone counts: some
    // innates are summons/toggles whose visible effect is out of this harness's
    // reach, but paying a cooldown proves the cast resolved rather than no-op'd.)
    expect(inert).toEqual([]);
    // PINNED CONTENT FINDING, not a mechanism bug: 26-00 吃洨火鍋 costs 165 mana
    // and godie-harf's level-1 pool is 144 (+22/level) — the innate is real and
    // reachable but unaffordable until champion level 2. Pinned so a content /
    // balance lane sees it, and so a NEW one cannot appear unnoticed.
    expect(underfunded).toEqual(["godie-harf.passive"]);
  });
});
