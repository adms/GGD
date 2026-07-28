/**
 * Parameterized hit-feel (task #133) — a champion basic-attack or an ability may
 * carry an optional `hitFeel` block that OVERRIDES individual fields of the
 * damage-derived ImpactProfile; unset fields fall back to the default (scaled by
 * the hit's damage tier). Deterministic (content is a fixed input): same-seed
 * replay of the emitted profile is byte-identical.
 *
 * Split: pure default-curve/merge unit tests (hitFeel.ts) + end-to-end tests
 * that push a hit through combatResolveSystem and read the emitted `hitImpact`
 * profile.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { Abilities, Champions } from "../content/registry";
import type { AbilityDef, ChampionDef } from "../content/defs";
import type { AbilityInstance } from "../stats/statsComp";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { DamageType } from "../effects/effect";
import type { IntentFrame } from "../intents";
import * as V from "../math/vec2";
import {
  deriveCosmetics,
  mergeCosmetics,
  AUTHORED_FLASH_MS_MIN,
  AUTHORED_FLASH_MS_MAX,
  type HitFeelInput,
  type ImpactTier,
} from "./hitFeel";

const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center;
const Y = 14; // pillar-free band (see combatJuice.test.ts)
const empty = (): Map<SeatId, IntentFrame> => new Map();

// --- test content: an ability + a champion that carry an explicit hitFeel, and
// a plain ability with NO hitFeel (the default-fallback control). Registered
// once into the (module-singleton) registries. ---
const HF_ABILITY_ID = "hf-test.ability" as AbilityId;
const PLAIN_ABILITY_ID = "hf-test.plain" as AbilityId;
const HF_CHAMPION_ID = "hf-test.hero" as ChampionId;
/**
 * An EX ability whose id deliberately does NOT end in ".ex", so only the RUNTIME
 * signal (it sits in the source's `exSlot`) can identify it as an EX hit.
 */
const EX_SLOT_ABILITY_ID = "hf-test.super" as AbilityId;
/** The authored EX doc-id shape every shipped hero uses (`champion.exAbility`). */
const EX_SUFFIX_ABILITY_ID = "hf-test.hero.ex" as AbilityId;
/** A castable EX ability for the end-to-end `castAbility(slot "EX")` test. */
const EX_CAST_ABILITY_ID = "hf-test.castable-super" as AbilityId;

const OVERRIDE: HitFeelInput = {
  hitstopTicks: 9,
  hitstunTicks: 15,
  knockbackMag: 5,
  shakeMag: 1.7,
  shakeStyle: "omni",
  sparkKind: "ice",
  flashColor: [0.1, 0.9, 0.8],
  flashMs: 222, // inside the strobe-safe band, so it survives the merge verbatim
  camKick: 1.2,
  exFreeze: 12,
};

beforeAll(() => {
  registerSkeletonContent();
  // Register through a cast: `hitFeel` is a content-schema field the loaded doc
  // carries verbatim; the sim def types don't declare it (read via narrow cast).
  Abilities.register(HF_ABILITY_ID, { id: HF_ABILITY_ID, hitFeel: OVERRIDE } as unknown as AbilityDef);
  Abilities.register(PLAIN_ABILITY_ID, { id: PLAIN_ABILITY_ID } as unknown as AbilityDef);
  // register directly (not via registerChampion, which would iterate .abilities)
  Champions.register(HF_CHAMPION_ID, { id: HF_CHAMPION_ID, hitFeel: OVERRIDE } as unknown as ChampionDef);
  // a castable, damaging EX for the end-to-end cast test (no hitFeel override,
  // so the profile it produces is the pure damage-derived EX default)
  Abilities.register(EX_CAST_ABILITY_ID, {
    id: EX_CAST_ABILITY_ID,
    name: "Test Super",
    slot: "EX",
    castType: "targeted",
    maxRank: 1,
    cooldown: [30],
    manaCost: [0],
    range: 10,
    effects: [{ kind: "damage", damageType: "physical", amount: { flat: 200 } }],
  } as unknown as AbilityDef);
});

function makeWorld(seed = 7): SimWorld {
  return new SimWorld(SKELETON_ARENA, seed);
}

/** Minimal combat dummy (no stats → mitigation 0 → resolved damage == amount). */
function spawnDummy(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  championId?: ChampionId,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: pos.x, z: pos.z },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 600, maxHp: 600, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  // only `championId` is read by the basic-attack hitFeel lookup
  if (championId) world.champion.set(id, { championId } as never);
  return id;
}

/**
 * Give a dummy an AbilitiesComp, optionally with an ability sitting in its EX
 * slot — the same shape `spawnChampion` builds and `castAbility` fires from when
 * `slot === "EX"`. This is the RUNTIME signal `isEX` is derived from.
 */
function giveAbilities(world: SimWorld, id: EntityId, exAbilityId?: AbilityId): void {
  const inst = (abilityId: string): AbilityInstance => ({
    abilityId: abilityId as AbilityId,
    rank: 1,
    cooldownRemainingTicks: 0,
  });
  world.abilities.set(id, {
    slots: { Q: inst("hf-test.q"), W: inst("hf-test.w"), E: inst("hf-test.e"), R: inst("hf-test.r") },
    exSlot: exAbilityId ? { abilityId: exAbilityId, rank: 1, cooldownRemainingTicks: 0 } : null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
    cast: null,
    windup: null,
  });
}

function profileOf(world: SimWorld, target: EntityId): Record<string, unknown> {
  const ev = world.events.find((e) => e.type === "hitImpact" && e.data.target === target);
  return ev!.data.profile as Record<string, unknown>;
}

function pushAndStep(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  origin: string,
  type: DamageType = "physical",
  crit = false,
): Record<string, unknown> {
  world.damageQueue.push({ source, target, amount, type, crit, origin });
  world.step(empty());
  return profileOf(world, target);
}

// -------------------------------------------------------------- DEFAULT CURVE --
describe("hitFeel default curve (deriveCosmetics)", () => {
  it("scales shake / camKick with the damage tier", () => {
    cover("cj-hf-default-scales");
    const tiers: ImpactTier[] = ["light", "medium", "heavy", "crit"];
    const shakes = tiers.map((t) => deriveCosmetics(t, "physical", false, false, false).shakeMag);
    const kicks = tiers.map((t) => deriveCosmetics(t, "physical", false, false, false).camKick);
    // strictly increasing across tiers (heavier hit = punchier default)
    for (let i = 1; i < tiers.length; i++) {
      expect(shakes[i]!).toBeGreaterThan(shakes[i - 1]!);
      expect(kicks[i]!).toBeGreaterThan(kicks[i - 1]!);
    }
    // flashMs is NOT defaulted here — see the flash-ownership test below.
  });

  it("derives spark identity from type / block / EX", () => {
    cover("cj-hf-default-derive");
    expect(deriveCosmetics("light", "physical", false, false, false).sparkKind).toBe("hit");
    expect(deriveCosmetics("heavy", "physical", false, false, false).sparkKind).toBe("heavy");
    expect(deriveCosmetics("light", "magic", false, false, false).sparkKind).toBe("magic");
    expect(deriveCosmetics("light", "physical", true, false, false).sparkKind).toBe("block");
    // EX bumps shake, arms a cosmetic freeze, floors the kick
    const ex = deriveCosmetics("light", "physical", false, false, true);
    const plain = deriveCosmetics("light", "physical", false, false, false);
    expect(ex.shakeMag).toBeGreaterThan(plain.shakeMag);
    expect(ex.exFreeze).toBeGreaterThan(0);
    expect(plain.exFreeze).toBe(0);
  });

  it("mergeCosmetics overrides only the provided fields", () => {
    cover("cj-hf-merge");
    const base = deriveCosmetics("light", "physical", false, false, false);
    const merged = mergeCosmetics(base, { shakeMag: 1.9, sparkKind: "ice" });
    expect(merged.shakeMag).toBe(1.9); // overridden
    expect(merged.sparkKind).toBe("ice"); // overridden
    expect(merged.camKick).toBe(base.camKick); // untouched → default
    expect(mergeCosmetics(base, undefined)).toEqual(base); // no override → identity
  });

  // ------------------------------------------------- FLASH IS AUTHORED-ONLY --
  // The sim used to resolve a full flash palette (FLASH_PHYSICAL/MAGIC/TRUE/
  // BLOCK + a per-tier flashMs curve) that the client threw away and replaced
  // with its own contrast-measured colours — four constants that shipped on
  // every hitImpact and never reached a pixel. The sim now carries ONLY what
  // content asked for, and ABSENCE is the signal the client reads as "use the
  // damage-type default". If these two assertions ever go green with a value
  // in them, the client's override detection has been silently broken.
  it("emits NO flash default — the field is absent unless content authored it", () => {
    cover("cj-hf-flash-authored-only");
    for (const type of ["physical", "magic", "true"] as const) {
      for (const blocked of [false, true]) {
        const c = deriveCosmetics("crit", type, blocked, false, true);
        expect(c.flashColor).toBeUndefined();
        expect(c.flashMs).toBeUndefined();
      }
    }
    // and merging a hitFeel that names no flash leaves it absent too
    const merged = mergeCosmetics(deriveCosmetics("heavy", "magic", false, false, false), {
      shakeMag: 1.1,
    });
    expect("flashColor" in merged).toBe(false);
    expect("flashMs" in merged).toBe(false);
  });

  it("passes an AUTHORED flash through, clamped into the strobe-safe band", () => {
    cover("cj-hf-flash-authored-passthrough");
    const base = deriveCosmetics("light", "physical", false, false, false);
    expect(mergeCosmetics(base, { flashColor: [1, 0.92, 0.6], flashMs: 178 })).toMatchObject({
      flashColor: [1, 0.92, 0.6], // verbatim — the client applies the legibility guard
      flashMs: 178,
    });
    // out-of-band ms is clamped, not honoured: a 4-second flash would hold
    // through the next three autos. zHitFeel rejects it at authoring time; this
    // is the second line of defence for an already-built bundle.
    expect(mergeCosmetics(base, { flashMs: 4000 }).flashMs).toBe(AUTHORED_FLASH_MS_MAX);
    expect(mergeCosmetics(base, { flashMs: 0 }).flashMs).toBe(AUTHORED_FLASH_MS_MIN);
    // components are clamped to 0..1 even if a hand-edited doc slips the schema
    expect(mergeCosmetics(base, { flashColor: [2, -1, 0.5] }).flashColor).toEqual([1, 0, 0.5]);
  });
});

// ------------------------------------------------------- END-TO-END OVERRIDE --
describe("per-ability / per-champion hitFeel override (end to end)", () => {
  it("an ability with explicit hitFeel overrides the damage-derived default", () => {
    cover("cj-hf-ability-override");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    // amount 50 → default would be tier "light", hitstop 2, spark "hit",
    // shakeMag 0.35, and NO shove (50/600 = 8.3% 的 raw 0.83 減不掉 3 的距離)。
    // The ability's hitFeel replaces the gameplay + cosmetic fields with the
    // authored values — note it even ARMS a shove on this otherwise-light hit.
    const p = pushAndStep(world, a, b, 50, `ability:${HF_ABILITY_ID}`);
    expect(p.hitstopTicks).toBe(9); // OVERRIDE.hitstopTicks
    expect(p.hitstunTicks).toBe(15); // OVERRIDE.hitstunTicks (>= hitstop)
    // GH#193 — 覆寫值是「距離 0 時要推多遠」的 RAW 值,一樣要減掉攻守距離:
    // 5 (authored) − 3 (兩人現在差 3 個單位) = 2。覆寫若跳過這條減法,#193 對
    // 普攻完全無效(114/115 位英雄的普攻都帶著覆寫值),見 sim/combatFeel.afterGap。
    expect(p.knockbackMag).toBe(5 - 3);
    expect(p.shakeMag).toBe(1.7);
    expect(p.shakeStyle).toBe("omni");
    expect(p.sparkKind).toBe("ice");
    expect(p.flashColor).toEqual([0.1, 0.9, 0.8]);
    expect(p.flashMs).toBe(222);
    expect(p.camKick).toBe(1.2);
    expect(p.exFreeze).toBe(12);
    // and the world state matches the overridden freeze/stun
    expect(world.hitstop.get(a)).toBe(9);
    expect(world.hitstop.get(b)).toBe(9);
    expect(world.hitstun.get(b)).toBe(15);
  });

  it("a champion basic-attack hitFeel overrides the default on origin 'basic'", () => {
    cover("cj-hf-basic-override");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, HF_CHAMPION_ID);
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    const p = pushAndStep(world, a, b, 90, "basic");
    expect(p.hitstopTicks).toBe(9);
    expect(p.sparkKind).toBe("ice");
    expect(p.shakeMag).toBe(1.7);
    expect(p.camKick).toBe(1.2);
  });

  it("without hitFeel it falls back to the damage-derived default", () => {
    cover("cj-hf-default-fallback");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    // plain ability (no hitFeel) — identical numbers to a bare origin.
    const p = pushAndStep(world, a, b, 90, `ability:${PLAIN_ABILITY_ID}`);
    expect(p.tier).toBe("medium"); // 90 in [60,120)
    expect(p.hitstopTicks).toBe(3); // 2 + floor(90/55) = default
    expect(p.sparkKind).toBe("hit"); // medium tier → normal "hit" spark (heavy is heavy/crit only)
    expect(p.shakeMag).toBeCloseTo(0.6, 6); // medium default
    expect(p.flashColor).toBeUndefined(); // no override → client picks the damage-type colour
    expect(p.exFreeze).toBe(0);
  });

  it("determinism: same seed + inputs replay a byte-identical profile", () => {
    cover("cj-hf-determinism");
    const run = (): Record<string, unknown> => {
      const world = makeWorld(1234);
      const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
      const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
      return pushAndStep(world, a, b, 90, `ability:${HF_ABILITY_ID}`);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

// ------------------------------------------------------------- EX / SUPER HIT --
// `isEX` used to be read off an `ex:` origin marker that NO content ever emits,
// so the EX branch of the profile (omni shake, floored camKick, cosmetic
// exFreeze) was dead code. It is now derived from two REAL signals: the source's
// own `exSlot` (what castAbility fires for slot "EX") and the authored `.ex`
// doc-id suffix.
describe("EX / super hit-feel fires on a real EX cast (#133)", () => {
  it("an ability in the source's EX slot arms exFreeze + omni shake", () => {
    cover("cj-hf-ex-runtime-signal");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    giveAbilities(world, a, EX_SLOT_ABILITY_ID);

    const ex = pushAndStep(world, a, b, 50, `ability:${EX_SLOT_ABILITY_ID}`);
    expect(ex.isEX).toBe(true);
    expect(ex.exFreeze).toBeGreaterThan(0); // the EX freeze the client holds on
    expect(ex.shakeStyle).toBe("omni"); // radial ring, not a directional nudge
    expect(ex.camKick).toBeGreaterThanOrEqual(0.7); // EX floors the kick

    // CONTROL: same source, same damage, a Q from the same hero → plain hit.
    const plain = pushAndStep(world, a, b, 50, `ability:hf-test.q`);
    expect(plain.isEX).toBe(false);
    expect(plain.exFreeze).toBe(0);
    expect(plain.shakeStyle).toBe("directional");
    expect(ex.shakeMag as number).toBeGreaterThan(plain.shakeMag as number);
    expect(ex.camKick as number).toBeGreaterThan(plain.camKick as number);
  });

  it("the authored `.ex` doc-id suffix also reads as EX (content signal)", () => {
    cover("cj-hf-ex-content-signal");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }); // no abilities comp at all
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    const ex = pushAndStep(world, a, b, 50, `ability:${EX_SUFFIX_ABILITY_ID}`);
    expect(ex.isEX).toBe(true);
    expect(ex.exFreeze).toBeGreaterThan(0);
  });

  it("END TO END: a real castAbility(slot 'EX') hit carries the EX profile", () => {
    cover("cj-hf-ex-end-to-end");
    const world = makeWorld();
    const a = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: ZC.x, z: Y },
      zone: 0,
    });
    const b = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: ZC.x + 1.3, z: Y },
      zone: 0,
    });
    // unlock the hero's EX (what `learnEx` does at the arena EX-unlock point)
    world.abilities.get(a)!.exSlot = {
      abilityId: EX_CAST_ABILITY_ID,
      rank: 1,
      cooldownRemainingTicks: 0,
    };

    // fire it for real — the cast path stamps origin `ability:<abilityId>`
    expect(castAbility(world, a, "EX", { type: "entity", entityId: b })).toBe("ok");
    world.step(empty());

    const p = profileOf(world, b);
    expect(p.isEX).toBe(true);
    expect(p.exFreeze).toBeGreaterThan(0);
    expect(p.shakeStyle).toBe("omni");
  });

  it("basics / DoTs / items / a hero's OTHER abilities are never EX", () => {
    cover("cj-hf-ex-negative");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    giveAbilities(world, a, EX_SLOT_ABILITY_ID);
    for (const origin of ["basic", "item:blade", "aug:burn", `ability:${PLAIN_ABILITY_ID}`]) {
      const p = pushAndStep(world, a, b, 50, origin);
      expect(p.isEX).toBe(false);
      expect(p.exFreeze).toBe(0);
    }
  });
});

// ------------------------------------------------------------- COUNTER HIT --
// `isCounter` was hardcoded `false`, so the `counter` spark could never play. It
// now comes from the victim's own committed action: an in-progress basic-attack
// wind-up or an in-progress ability cast.
describe("counter hit fires on a committed victim (#133)", () => {
  const champ = (world: SimWorld, seat: number, team: number, x: number): EntityId =>
    spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x, z: Y },
      zone: 0,
    });

  it("hitting a target mid basic-attack WIND-UP is a counter; an idle one is not", () => {
    cover("cj-hf-counter-windup");
    const world = makeWorld();
    const a = champ(world, 0, 0, ZC.x);
    const b = champ(world, 1, 1, ZC.x + 1.3);

    // CONTROL: b is idle (no wind-up, no cast) → a normal hit.
    const idle = pushAndStep(world, a, b, 50, "basic");
    expect(idle.isCounter).toBe(false);
    expect(idle.sparkKind).toBe("hit");

    // b commits to a swing of its own, then eats the blow mid-startup.
    world.abilities.get(b)!.windup = { target: a, ticksLeft: 5 };
    const counter = pushAndStep(world, a, b, 50, "basic");
    expect(counter.isCounter).toBe(true);
    expect(counter.sparkKind).toBe("counter"); // the distinct punish spark
    expect(world.abilities.get(b)!.windup).not.toBeNull(); // really still committed
  });

  it("hitting a target mid ability CAST is a counter too", () => {
    cover("cj-hf-counter-cast");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    giveAbilities(world, b);
    world.abilities.get(b)!.cast = {
      slot: "Q",
      abilityId: PLAIN_ABILITY_ID,
      rank: 1,
      ticksLeft: 5,
      targets: [a],
      rooted: true,
    };
    const p = pushAndStep(world, a, b, 50, "basic");
    expect(p.isCounter).toBe(true);
    expect(p.sparkKind).toBe("counter");
  });

  it("a BLOCKED counter still reads as a block (block spark wins)", () => {
    cover("cj-hf-counter-blocked");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    giveAbilities(world, b);
    world.abilities.get(b)!.cast = {
      slot: "Q",
      abilityId: PLAIN_ABILITY_ID,
      rank: 1,
      ticksLeft: 5,
      targets: [a],
      rooted: true,
    };
    world.health.get(b)!.shields.push({
      amount: 1000,
      expiresAtTick: world.tick + 100,
      sourceId: "t",
    });
    const p = pushAndStep(world, a, b, 50, "basic");
    expect(p.isCounter).toBe(true); // the flag is still true on the wire
    expect(p.sparkKind).toBe("block"); // ...but a guarded hit reads as a guard
  });
});
