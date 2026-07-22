/**
 * CombatEnvMultipliers — the GLOBAL combat-environment multiplier table
 * (task #28: admin 戰鬥系統 dynamic config). Every quantity is a pure factor
 * applied at exactly ONE formula site in the sim:
 *
 *   cooldown      × ability cooldown seconds (abilities/abilitySystem.ts castAbility;
 *                   covers Q/W/E/R AND the EX slot — all pay through that one seam)
 *   damageDealt   × every DamagePacket amount pre-mitigation (combat/damage.ts
 *                   combatResolveSystem; basics, abilities, item/augment procs
 *                   and DoTs all drain through the one queue)
 *   defense       × Stat.Armor + Stat.MagicResist (stats/statPipeline.ts)
 *   attackDamage  × Stat.AttackDamage        (statPipeline)
 *   abilityPower  × Stat.AbilityPower        (statPipeline)
 *   maxHealth     × Stat.MaxHealth           (statPipeline; hp-ratio preserved)
 *   healthRegen   × Stat.HealthRegen         (statPipeline)
 *   maxMana       × Stat.MaxMana             (statPipeline; mana-ratio preserved)
 *   manaRegen     × Stat.ManaRegen           (statPipeline)
 *   moveSpeed     × Stat.MoveSpeed           (statPipeline, before the [2,14] clamp)
 *   attackSpeed   × Stat.AttackSpeed         (statPipeline, before the [0.2,2.5] clamp)
 *   healing       × heal effects (effects/effectRunner.ts), basic-attack
 *                   lifesteal restore (combat/damage.ts) and flower bursts
 *                   (systems/FlowerSystem.ts)
 *   shield        × shield effect amounts (effects/effectRunner.ts)
 *   critChance    × Stat.CritChance          (statPipeline, before the [0,1] clamp)
 *   critDamage    × Stat.CritDamage          (statPipeline)
 *   lifesteal     × Stat.Lifesteal           (statPipeline, before the [0,0.8] clamp)
 *   attackRange   × Stat.AttackRange         (statPipeline)
 *
 * PURITY: the table is part of SimWorld state (`world.combatEnv`), injected by
 * the host BEFORE tick 0 and never read from globals/config/fetch inside the
 * sim — two worlds with the same seed and the same table stay bit-identical.
 * DEFAULT_COMBAT_ENV (all 1.0) leaves every formula byte-identical to the
 * pre-multiplier sim, so existing tests and the client's prediction shadow
 * world are unchanged.
 */
import { Stat } from "./stats/statTypes";

export const COMBAT_ENV_KEYS = [
  "cooldown",
  "damageDealt",
  "defense",
  "attackDamage",
  "abilityPower",
  "maxHealth",
  "healthRegen",
  "maxMana",
  "manaRegen",
  "moveSpeed",
  "attackSpeed",
  "healing",
  "shield",
  "critChance",
  "critDamage",
  "lifesteal",
  "attackRange",
] as const;

export type CombatEnvKey = (typeof COMBAT_ENV_KEYS)[number];

/** One multiplicative factor per environment quantity (1.0 = neutral). */
export type CombatEnvMultipliers = Readonly<Record<CombatEnvKey, number>>;

const buildDefault = (): Record<CombatEnvKey, number> => {
  const t = {} as Record<CombatEnvKey, number>;
  for (const k of COMBAT_ENV_KEYS) t[k] = 1;
  return t;
};

/** The neutral table — every factor 1.0. Formulae reduce to legacy behavior. */
export const DEFAULT_COMBAT_ENV: CombatEnvMultipliers = Object.freeze(buildDefault());

/**
 * Stat → env-key map consumed by recomputeStats. Cooldown is NOT here on
 * purpose: it multiplies the cooldown SECONDS at cast time (a 2.0 factor
 * doubles cooldowns), never the CDR stat.
 */
export const STAT_ENV_KEY: Partial<Record<Stat, CombatEnvKey>> = {
  [Stat.Armor]: "defense",
  [Stat.MagicResist]: "defense",
  [Stat.AttackDamage]: "attackDamage",
  [Stat.AbilityPower]: "abilityPower",
  [Stat.MaxHealth]: "maxHealth",
  [Stat.HealthRegen]: "healthRegen",
  [Stat.MaxMana]: "maxMana",
  [Stat.ManaRegen]: "manaRegen",
  [Stat.MoveSpeed]: "moveSpeed",
  [Stat.AttackSpeed]: "attackSpeed",
  [Stat.CritChance]: "critChance",
  [Stat.CritDamage]: "critDamage",
  [Stat.Lifesteal]: "lifesteal",
  [Stat.AttackRange]: "attackRange",
};

/**
 * Merge a partial/untrusted table onto the defaults. Unknown keys are ignored;
 * non-finite or negative factors fall back to 1.0. This is the ONE seam both
 * the server (config doc / admin override → MatchController) and the client
 * (MatchState.combatEnvJson → prediction) normalize through, so both sides
 * always agree on the effective table.
 */
export function normalizeCombatEnv(
  partial?: Partial<Record<CombatEnvKey, number>> | null,
): CombatEnvMultipliers {
  if (!partial) return DEFAULT_COMBAT_ENV;
  const t = buildDefault();
  for (const k of COMBAT_ENV_KEYS) {
    const v = partial[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) t[k] = v;
  }
  return Object.freeze(t);
}

/**
 * Parse the wire form (MatchState.combatEnvJson). "" / malformed JSON / any
 * non-object degrade to the neutral table — the client must never throw while
 * decoding a snapshot.
 */
export function parseCombatEnvJson(json: string | null | undefined): CombatEnvMultipliers {
  if (!json) return DEFAULT_COMBAT_ENV;
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return DEFAULT_COMBAT_ENV;
    return normalizeCombatEnv(raw as Partial<Record<CombatEnvKey, number>>);
  } catch {
    return DEFAULT_COMBAT_ENV;
  }
}
