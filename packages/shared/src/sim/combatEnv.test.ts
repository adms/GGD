/**
 * Combat-env multiplier table (task #28 foundation): every env key doubles (or
 * correctly transforms) its quantity at 2.0 vs the 1.0 baseline, non-default
 * tables stay seed-deterministic, and the normalize/parse seams degrade to the
 * neutral table on bad input.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type ProjectileId,
  type SeatId,
} from "../ids";
import { Stat, STAT_CLAMPS } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import {
  castAbility,
  resolveAbilityRange,
  resolveAbilityRadius,
} from "./abilities/abilitySystem";
import { Abilities } from "./content/registry";
import { runEffects } from "./effects/effectRunner";
import { projectileSystem } from "./systems/ProjectileSystem";
import { flowerRulesFromConfig, spawnFlower } from "./flowers";
import type { IntentFrame } from "./intents";
import {
  COMBAT_ENV_KEYS,
  DEFAULT_COMBAT_ENV,
  STAT_ENV_KEY,
  normalizeCombatEnv,
  parseCombatEnvJson,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "./combatEnv";

beforeAll(() => registerSkeletonContent());

const env = (o: Partial<Record<CombatEnvKey, number>>): CombatEnvMultipliers =>
  normalizeCombatEnv(o);

function makeWorld(seed = 42, table?: CombatEnvMultipliers): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, seed);
  if (table) w.combatEnv = table; // host seam: assigned BEFORE tick 0
  return w;
}

/** Spawn Sela (seat 0/team 0) + Thorne (seat 1/team 1) facing each other. */
function duel(world: SimWorld, gap = 8): { sela: EntityId; thorne: EntityId } {
  const c = SKELETON_ARENA.zones[0]!.center;
  const sela = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - gap / 2, z: c.z + 8 },
    zone: 0,
  });
  const thorne = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + gap / 2, z: c.z + 8 },
    zone: 0,
  });
  world.transform.get(sela)!.facing = { x: 1, z: 0 };
  world.transform.get(thorne)!.facing = { x: -1, z: 0 };
  return { sela, thorne };
}

// ---------------------------------------------------------------- stat table

/**
 * Every stat-mapped env key, exercised through recomputeStats: the stat is
 * PINNED via an Override source (env applies after every layer, Override
 * included) to a value whose double stays inside the stat's clamp.
 */
const STAT_CASES: { key: CombatEnvKey; stat: Stat; pin: number }[] = [
  { key: "defense", stat: Stat.Armor, pin: 30 },
  { key: "defense", stat: Stat.MagicResist, pin: 25 },
  { key: "attackDamage", stat: Stat.AttackDamage, pin: 50 },
  { key: "abilityPower", stat: Stat.AbilityPower, pin: 40 },
  { key: "maxHealth", stat: Stat.MaxHealth, pin: 400 },
  { key: "healthRegen", stat: Stat.HealthRegen, pin: 2 },
  { key: "maxMana", stat: Stat.MaxMana, pin: 200 },
  { key: "manaRegen", stat: Stat.ManaRegen, pin: 3 },
  { key: "moveSpeed", stat: Stat.MoveSpeed, pin: 5 },
  { key: "attackSpeed", stat: Stat.AttackSpeed, pin: 0.8 },
  { key: "critChance", stat: Stat.CritChance, pin: 0.3 },
  { key: "critDamage", stat: Stat.CritDamage, pin: 1.5 },
  { key: "lifesteal", stat: Stat.Lifesteal, pin: 0.2 },
  { key: "attackRange", stat: Stat.AttackRange, pin: 4 },
];

describe("combat-env stat multipliers (env-01)", () => {
  it("covers every stat-mapped key (table <-> STAT_ENV_KEY in sync)", () => {
    cover("combat-env-stat-map");
    const mapped = new Set(Object.keys(STAT_ENV_KEY));
    expect(new Set(STAT_CASES.map((c) => c.stat))).toEqual(mapped as Set<unknown>);
    // the only env keys WITHOUT a stat mapping are the formula-site ones
    const statKeys = new Set(Object.values(STAT_ENV_KEY));
    const nonStat = COMBAT_ENV_KEYS.filter((k) => !statKeys.has(k));
    expect(nonStat.sort()).toEqual(
      ["cooldown", "damageDealt", "healing", "shield", "abilityRange"].sort(),
    );
  });

  it.each(STAT_CASES)("$key ×2 doubles $stat", ({ key, stat, pin }) => {
    cover("combat-env-stat-multiplier");
    const run = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela } = duel(w);
      attachSource(w, sela, {
        id: "t:pin",
        kind: "buff",
        modifiers: [{ stat, op: ModOp.Override, value: pin }],
      });
      recomputeStats(w, sela);
      return w.stats.get(sela)!.final[stat];
    };
    expect(run()).toBeCloseTo(pin, 6); // baseline: override wins outright
    expect(run(env({ [key]: 2 }))).toBeCloseTo(pin * 2, 6);
    expect(run(env({ [key]: 0.5 }))).toBeCloseTo(pin * 0.5, 6);
  });

  it("clamps still apply AFTER the env factor (env-02)", () => {
    cover("combat-env-clamp-after");
    const w = makeWorld(42, env({ moveSpeed: 2 }));
    const { sela } = duel(w);
    attachSource(w, sela, {
      id: "t:pin",
      kind: "buff",
      modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.Override, value: 10 }],
    });
    recomputeStats(w, sela);
    expect(w.stats.get(sela)!.final[Stat.MoveSpeed]).toBe(STAT_CLAMPS[Stat.MoveSpeed]![1]); // 20 -> 14
  });

  it("maxHealth ×2 preserves the live hp RATIO (env-03)", () => {
    cover("combat-env-maxhp-ratio");
    const w = makeWorld();
    const { sela } = duel(w);
    const hp = w.health.get(sela)!;
    hp.hp = hp.maxHp / 2;
    const maxBefore = hp.maxHp;
    w.combatEnv = env({ maxHealth: 2 });
    recomputeStats(w, sela);
    expect(hp.maxHp).toBeCloseTo(maxBefore * 2, 6);
    expect(hp.hp / hp.maxHp).toBeCloseTo(0.5, 6);
  });
});

// ---------------------------------------------------------- formula-site keys

describe("combat-env formula-site multipliers", () => {
  it("cooldown ×2 doubles the paid cooldown ticks (env-04)", () => {
    cover("combat-env-cooldown");
    const cd = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela } = duel(w);
      expect(castAbility(w, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
      return w.abilities.get(sela)!.slots.Q.cooldownRemainingTicks;
    };
    const base = cd();
    expect(base).toBeGreaterThan(0);
    expect(cd(env({ cooldown: 2 }))).toBe(base * 2);
  });

  it("damageDealt ×2 doubles resolved damage from the one queue (env-05)", () => {
    cover("combat-env-damage");
    const taken = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela, thorne } = duel(w);
      const before = w.health.get(thorne)!.hp;
      w.damageQueue.push({ source: sela, target: thorne, amount: 100, type: "true", crit: false, origin: "t" });
      w.step(new Map());
      return before - w.health.get(thorne)!.hp;
    };
    expect(taken()).toBeCloseTo(100, 0); // regen slack ~0.1
    expect(taken(env({ damageDealt: 2 }))).toBeCloseTo(200, 0);
  });

  it("healing ×2 doubles heal effects (env-06)", () => {
    cover("combat-env-healing");
    const healed = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela } = duel(w);
      const hp = w.health.get(sela)!;
      hp.hp = 100;
      runEffects([{ kind: "heal", amount: { flat: 50 } }], {
        world: w,
        caster: sela,
        rank: 1,
        targets: [sela],
        origin: "t",
        rng: w.rng,
      });
      return hp.hp - 100;
    };
    expect(healed()).toBeCloseTo(50, 6);
    expect(healed(env({ healing: 2 }))).toBeCloseTo(100, 6);
  });

  it("healing ×2 doubles the basic-attack lifesteal restore (env-07)", () => {
    cover("combat-env-lifesteal-restore");
    const restored = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela, thorne } = duel(w);
      attachSource(w, sela, {
        id: "t:ls",
        kind: "buff",
        modifiers: [{ stat: Stat.Lifesteal, op: ModOp.Override, value: 0.5 }],
      });
      recomputeStats(w, sela);
      const hp = w.health.get(sela)!;
      hp.hp = 100;
      w.damageQueue.push({ source: sela, target: thorne, amount: 100, type: "true", crit: false, origin: "basic" });
      w.step(new Map());
      return w.health.get(sela)!.hp - 100;
    };
    expect(restored()).toBeCloseTo(100 * 0.5, 0);
    expect(restored(env({ healing: 2 }))).toBeCloseTo(100 * 0.5 * 2, 0);
  });

  it("healing ×2 doubles the flower burst restore (env-08)", () => {
    cover("combat-env-flower-burst");
    const rules = flowerRulesFromConfig(
      { firstSpawnSec: 15, respawnSec: 25, maxAlivePerZone: 1, hp: 60, healPctMax: 0.1, manaPctMax: 0.1, burstRadius: 6 },
      1 / 30,
    );
    const burst = (table?: CombatEnvMultipliers): { hp: number; mana: number; maxHp: number; maxMana: number } => {
      const w = makeWorld(11, table);
      w.flowerRules = rules;
      const c = SKELETON_ARENA.zones[0]!.center;
      const killer = spawnChampion(w, {
        championId: "sela" as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(0),
        pos: { x: c.x + 8, z: c.z },
        zone: 0,
      });
      const h = w.health.get(killer)!;
      h.hp = h.maxHp * 0.3;
      h.mana = h.maxMana * 0.3;
      const hpBefore = h.hp;
      const manaBefore = h.mana;
      const flowerId = spawnFlower(w, 0, { x: c.x + 12, z: c.z }, rules.hp);
      w.damageQueue.push({ source: killer, target: flowerId, amount: 999, type: "true", crit: false, origin: "basic" });
      w.step(new Map());
      return { hp: h.hp - hpBefore, mana: h.mana - manaBefore, maxHp: h.maxHp, maxMana: h.maxMana };
    };
    const base = burst();
    expect(base.hp).toBeCloseTo(base.maxHp * 0.1, 0);
    expect(base.mana).toBeCloseTo(base.maxMana * 0.1, 0);
    const doubled = burst(env({ healing: 2 }));
    expect(doubled.hp).toBeCloseTo(doubled.maxHp * 0.2, 0);
    expect(doubled.mana).toBeCloseTo(doubled.maxMana * 0.2, 0);
  });

  it("shield ×2 doubles shield effect amounts (env-09)", () => {
    cover("combat-env-shield");
    const shielded = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela } = duel(w);
      runEffects([{ kind: "shield", amount: { flat: 40 }, duration: 3 }], {
        world: w,
        caster: sela,
        rank: 1,
        targets: [sela],
        origin: "t",
        rng: w.rng,
      });
      return w.health.get(sela)!.shields[0]!.amount;
    };
    expect(shielded()).toBeCloseTo(40, 6);
    expect(shielded(env({ shield: 2 }))).toBeCloseTo(80, 6);
  });
});

// -------------------------------------------------------- ability range/AoE

describe("combat-env abilityRange (task #136)", () => {
  it("resolveAbilityRange/Radius scale the base by the abilityRange factor", () => {
    cover("combat-env-ability-range");
    const w = makeWorld(42, env({ abilityRange: 0.6 }));
    // the task's worked example: a 12-range ability casts at 7.2
    expect(resolveAbilityRange(w, 12)).toBeCloseTo(7.2, 6);
    expect(resolveAbilityRadius(w, 5)).toBeCloseTo(3, 6);
    // neutral table is a byte-for-byte no-op
    const n = makeWorld(42);
    expect(resolveAbilityRange(n, 12)).toBe(12);
    expect(resolveAbilityRadius(n, 5)).toBe(5);
  });

  it("shrinks the EFFECTIVE cast range at the out-of-range seam", () => {
    cover("combat-env-ability-range");
    Abilities.register("test.reach" as AbilityId, {
      id: "test.reach" as AbilityId,
      name: "Reach",
      slot: "Q",
      castType: "targeted",
      maxRank: 1,
      cooldown: [0.1],
      manaCost: [0],
      range: 12,
      targetsEnemies: true,
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 1 } }],
    });
    // caster ↔ target 10 units apart: inside base 12, OUTSIDE the shrunk 7.2
    const tryCast = (table?: CombatEnvMultipliers): string => {
      const w = makeWorld(42, table);
      const { sela, thorne } = duel(w, 10);
      w.abilities.get(sela)!.slots.Q = {
        abilityId: "test.reach" as AbilityId,
        rank: 1,
        cooldownRemainingTicks: 0,
      };
      return castAbility(w, sela, "Q", { type: "entity", entityId: thorne });
    };
    expect(tryCast()).toBe("ok"); // neutral: 10 ≤ 12
    expect(tryCast(env({ abilityRange: 0.6 }))).toBe("out-of-range"); // 10 > 7.2
  });

  it("scales an ability skillshot's TRAVEL range through the same seam (displayed == actual)", () => {
    cover("combat-env-ability-range");
    // sela.q.bolt is the skeleton skillshot: authored maxRange 14. The spawn
    // site must route that through resolveAbilityRange, the SAME factor the
    // client tooltip applies via displayFinal(range, "abilityRange").
    const spawnRemaining = (table?: CombatEnvMultipliers): number => {
      const w = makeWorld(42, table);
      const { sela } = duel(w, 6);
      runEffects([{ kind: "spawnProjectile", projectileId: "sela.q.bolt" as ProjectileId, onHit: [] }], {
        world: w,
        caster: sela,
        rank: 1,
        targets: [],
        direction: { x: 0, z: 1 }, // fire away from the enemy so nothing is hit
        origin: "ability:sela.q",
        rng: w.rng,
      });
      return [...w.projectile.values()][0]!.remainingRange;
    };
    // neutral table: the missile keeps its authored 14-unit reach (unchanged)
    expect(spawnRemaining()).toBe(14);
    // 0.6: travel range now 14 × 0.6 = 8.4 — matching the ×0.6 the tooltip shows
    expect(spawnRemaining(env({ abilityRange: 0.6 }))).toBeCloseTo(8.4, 6);
  });

  it("the skillshot actually STOPS at the scaled range (0.6 → flies 8.4, not 14)", () => {
    cover("combat-env-ability-range");
    const w = makeWorld(77, env({ abilityRange: 0.6 }));
    const c = SKELETON_ARENA.zones[0]!.center;
    const caster = spawnChampion(w, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x - 4, z: c.z },
      zone: 0,
    });
    const start = { ...w.transform.get(caster)!.pos };
    runEffects([{ kind: "spawnProjectile", projectileId: "sela.q.bolt" as ProjectileId, onHit: [] }], {
      world: w,
      caster,
      rank: 1,
      targets: [], // lone caster: nothing to hit, no boundary within reach
      direction: { x: 0, z: 1 },
      origin: "ability:sela.q",
      rng: w.rng,
    });
    const pid = [...w.projectile.keys()][0]!;
    // advance ONLY the projectile system (deterministic; no champion AI) until
    // the missile expires; it carries its END POINT in the projectileEnd event.
    for (let k = 0; k < 200 && w.projectile.has(pid); k++) projectileSystem(w);
    const end = w.events.filter((e) => e.type === "projectileEnd").at(-1);
    expect(end).toBeDefined();
    const traveled = Math.hypot(
      (end!.data.x as number) - start.x,
      (end!.data.z as number) - start.z,
    );
    expect(traveled).toBeCloseTo(8.4, 4); // scaled 14×0.6, NOT the base 14
    expect(traveled).toBeLessThan(14 - 1);
  });
});

// ------------------------------------------------------------- determinism

describe("combat-env determinism (env-10)", () => {
  const NON_DEFAULT = env({ damageDealt: 1.5, cooldown: 0.5, attackSpeed: 1.2, healing: 1.3 });

  const run = (seed: number, table: CombatEnvMultipliers): number => {
    const w = makeWorld(seed, table);
    const { thorne } = duel(w, 6);
    for (let k = 0; k < 300; k++) {
      const intents = new Map<SeatId, IntentFrame>();
      if (k === 0) {
        intents.set(asSeatId(0), {
          commands: [{ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: 1, z: 0 } } }],
          order: { kind: "attackTarget", entity: thorne },
        });
        intents.set(asSeatId(1), { commands: [], order: { kind: "attackTarget", entity: 1 as EntityId } });
      }
      if (k === 30) {
        intents.set(asSeatId(1), {
          commands: [{ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: -1, z: 0 } } }],
        });
      }
      w.step(intents);
    }
    return w.digest();
  };

  it("same seed + same non-default table -> identical digest", () => {
    cover("combat-env-determinism");
    expect(run(777, NON_DEFAULT)).toBe(run(777, NON_DEFAULT));
  });

  it("the table actually changes the outcome vs neutral", () => {
    cover("combat-env-effective");
    expect(run(777, NON_DEFAULT)).not.toBe(run(777, DEFAULT_COMBAT_ENV));
  });
});

// -------------------------------------------------------- normalize / parse

describe("combat-env normalize/parse seams (env-11)", () => {
  it("normalize merges sparse tables onto all-1.0 and drops junk", () => {
    cover("combat-env-normalize");
    expect(normalizeCombatEnv(null)).toEqual(DEFAULT_COMBAT_ENV);
    expect(normalizeCombatEnv(undefined)).toEqual(DEFAULT_COMBAT_ENV);
    const t = normalizeCombatEnv({ damageDealt: 2, moveSpeed: -1, cooldown: Number.NaN });
    expect(t.damageDealt).toBe(2);
    expect(t.moveSpeed).toBe(1); // negative rejected -> neutral
    expect(t.cooldown).toBe(1); // NaN rejected -> neutral
    for (const k of COMBAT_ENV_KEYS) expect(Number.isFinite(t[k])).toBe(true);
  });

  it("parseCombatEnvJson round-trips and fails safe to neutral", () => {
    cover("combat-env-parse-json");
    const t = normalizeCombatEnv({ moveSpeed: 1.5, damageDealt: 0.8 });
    expect(parseCombatEnvJson(JSON.stringify(t))).toEqual(t);
    expect(parseCombatEnvJson("")).toEqual(DEFAULT_COMBAT_ENV);
    expect(parseCombatEnvJson(undefined)).toEqual(DEFAULT_COMBAT_ENV);
    expect(parseCombatEnvJson("{not json")).toEqual(DEFAULT_COMBAT_ENV);
    expect(parseCombatEnvJson("[1,2]")).toEqual(DEFAULT_COMBAT_ENV);
  });
});
