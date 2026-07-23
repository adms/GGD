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
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { DamageType } from "../effects/effect";
import type { IntentFrame } from "../intents";
import * as V from "../math/vec2";
import { deriveCosmetics, mergeCosmetics, type HitFeelInput, type ImpactTier } from "./hitFeel";

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

const OVERRIDE: HitFeelInput = {
  hitstopTicks: 9,
  hitstunTicks: 15,
  knockbackMag: 5,
  shakeMag: 1.7,
  shakeStyle: "omni",
  sparkKind: "ice",
  flashColor: [0.1, 0.9, 0.8],
  flashMs: 333,
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
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
  world.status.set(id, { effects: [] });
  // only `championId` is read by the basic-attack hitFeel lookup
  if (championId) world.champion.set(id, { championId } as never);
  return id;
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
  it("scales shake / flashMs / camKick with the damage tier", () => {
    cover("cj-hf-default-scales");
    const tiers: ImpactTier[] = ["light", "medium", "heavy", "crit"];
    const shakes = tiers.map((t) => deriveCosmetics(t, "physical", false, false, false).shakeMag);
    const kicks = tiers.map((t) => deriveCosmetics(t, "physical", false, false, false).camKick);
    const flashes = tiers.map((t) => deriveCosmetics(t, "physical", false, false, false).flashMs);
    // strictly increasing across tiers (heavier hit = punchier default)
    for (let i = 1; i < tiers.length; i++) {
      expect(shakes[i]!).toBeGreaterThan(shakes[i - 1]!);
      expect(kicks[i]!).toBeGreaterThan(kicks[i - 1]!);
      expect(flashes[i]!).toBeGreaterThan(flashes[i - 1]!);
    }
  });

  it("derives spark identity + flash colour from type / block / EX", () => {
    cover("cj-hf-default-derive");
    expect(deriveCosmetics("light", "physical", false, false, false).sparkKind).toBe("hit");
    expect(deriveCosmetics("heavy", "physical", false, false, false).sparkKind).toBe("heavy");
    expect(deriveCosmetics("light", "magic", false, false, false).sparkKind).toBe("magic");
    expect(deriveCosmetics("light", "physical", true, false, false).sparkKind).toBe("block");
    // blocked flash is cool blue-white, not damage-red
    expect(deriveCosmetics("light", "physical", true, false, false).flashColor).toEqual([0.6, 0.8, 1.0]);
    expect(deriveCosmetics("light", "physical", false, false, false).flashColor).toEqual([1, 0.25, 0.2]);
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
    expect(merged.flashMs).toBe(base.flashMs); // untouched → default
    expect(merged.camKick).toBe(base.camKick); // untouched → default
    expect(mergeCosmetics(base, undefined)).toEqual(base); // no override → identity
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
    // shakeMag 0.35, and NO shove (< KB_MIN_IMPACT=70). The ability's hitFeel
    // replaces the gameplay + cosmetic fields with the authored values — note it
    // even ARMS a shove on this otherwise-light hit.
    const p = pushAndStep(world, a, b, 50, `ability:${HF_ABILITY_ID}`);
    expect(p.hitstopTicks).toBe(9); // OVERRIDE.hitstopTicks
    expect(p.hitstunTicks).toBe(15); // OVERRIDE.hitstunTicks (>= hitstop)
    expect(p.knockbackMag).toBe(5); // OVERRIDE.knockbackMag (armed despite < KB_MIN_IMPACT)
    expect(p.shakeMag).toBe(1.7);
    expect(p.shakeStyle).toBe("omni");
    expect(p.sparkKind).toBe("ice");
    expect(p.flashColor).toEqual([0.1, 0.9, 0.8]);
    expect(p.flashMs).toBe(333);
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
    expect(p.flashColor).toEqual([1, 0.25, 0.2]); // physical damage-red default
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
