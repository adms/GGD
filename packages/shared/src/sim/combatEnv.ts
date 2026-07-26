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
 *   attackRange   × Stat.AttackRange         (statPipeline; BASIC-attack reach only)
 *   abilityRange  × ability CAST RANGE + AoE RADIUS (task #136; abilities ONLY,
 *                   never basics — the read seams are abilitySystem.castAbility
 *                   out-of-range + ground clamp/AoE, CastResolveSystem's AoE
 *                   re-query, and the ability projectile hit radius in
 *                   ProjectileSystem, all via resolveAbilityRange/Radius)
 *
 * THE EIGHT 三圍 COEFFICIENTS (task #248) join the same table rather than
 * inventing a second config surface, so the admin 戰鬥系統 page tunes them with
 * everything else and a match snapshots them exactly like the rest:
 *
 *   strToMaxHealth      力量 → 生命上限        (23)
 *   strToHealthRegen    力量 → 每秒回血        (0.04)
 *   strToAttackDamage   力量 → 攻擊力          (1)
 *   agiToArmor          敏捷 → 護甲            (0.15)
 *   agiToAttackSpeed    敏捷 → 攻速            (0.02, MULTIPLICATIVE — see below)
 *   intToMaxMana        智慧 → 魔力上限        (15)
 *   intToManaRegen      智慧 → 每秒回魔        (0.07)
 *   intToAbilityPower   智慧 → 法術強度        (1)
 *
 * Seven of the eight are IMPORTED, not chosen — see ATTRIBUTE_ENV_DEFAULTS below
 * for the file and field each one comes from.
 *
 * They differ from the other eighteen in three ways, all deliberate:
 *   1. THEY ARE COEFFICIENTS, NOT FACTORS. Their neutral value is not 1.0 — it
 *      is the shipped coefficient (COMBAT_ENV_DEFAULTS below). 23 hp per point
 *      of strength IS the source map's own number, not a tuning on top of one.
 *   2. THEY APPLY EARLIER. They build the champion's BASE stat (stats/
 *      attributes.ts championStatBase) which the stat-mapped factors above then
 *      multiply, so `strToMaxHealth × maxHealth` is the full HP chain.
 *   3. THEIR RANGE IS WIDER. 0..100 rather than 0.1..10 — 25 and 15 are legal
 *      values here (see ATTRIBUTE_COEF_MAX / the platform's per-key bounds).
 *
 * PURITY: the table is part of SimWorld state (`world.combatEnv`), injected by
 * the host BEFORE tick 0 and never read from globals/config/fetch inside the
 * sim — two worlds with the same seed and the same table stay bit-identical.
 * DEFAULT_COMBAT_ENV leaves every pre-#248 formula byte-identical to the
 * pre-multiplier sim (all eighteen legacy factors are 1.0), and gives the eight
 * coefficients their shipped values so a champion card with attributes resolves
 * correctly even on a host that never loaded a config.
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
  "abilityRange",
  "strToMaxHealth",
  "strToHealthRegen",
  "strToAttackDamage",
  "agiToArmor",
  "agiToAttackSpeed",
  "intToMaxMana",
  "intToManaRegen",
  "intToAbilityPower",
] as const;

export type CombatEnvKey = (typeof COMBAT_ENV_KEYS)[number];

/**
 * The eight 三圍 coefficients (task #248) and their SHIPPED values.
 *
 * PROVENANCE, PER COEFFICIENT — the file and the FIELD each number came from.
 * (#248 originally credited these to `Units\UnitBalance.slk`. That was invented:
 * UnitBalance.slk has 60 columns and not one of them is a coefficient — it is a
 * PER-UNIT table (STR/AGI/INT/STRplus/HP/def/…). The derivation constants live
 * in `Units\MiscGame.txt`, and the SOURCE MAP OVERRIDES FOUR OF THEM. Reading
 * Blizzard's default where the map wrote its own is the same error class #248
 * itself was restarted to fix, one layer up from the w3u.)
 *
 * 「一律以 JASS 實際參數為準」— a map-authored constants table is first-party
 * evidence of the same kind, so THE MAP'S VALUE IS THE DEFAULT. Where the map
 * does not override a field, Blizzard's is the documented fallback.
 *
 *   key                map file / field                     Blizzard  used
 *   ------------------ ------------------------------------ --------- ------
 *   strToMaxHealth     war3mapMisc [Misc] StrHitPointBonus   25        23
 *   strToHealthRegen   war3mapMisc [Misc] StrRegenBonus      0.05      0.04
 *   strToAttackDamage  war3mapMisc [Misc] StrAttackBonus     1.0       1
 *   agiToArmor         war3mapMisc [Misc] AgiDefenseBonus    0.30      0.15
 *   agiToAttackSpeed   (map does NOT override)               0.02      0.02
 *   intToMaxMana       war3mapMisc [Misc] IntManaBonus       15        15
 *   intToManaRegen     war3mapMisc [Misc] IntRegenBonus      0.05      0.07
 *   intToAbilityPower  (no WC3 concept at all)               —         1
 *
 * SEVEN ARE IMPORTED, ONE IS THE OWNER'S. `intToAbilityPower` is the only row
 * with no upstream source: Warcraft III has no 法強 attribute axis, so 智慧→AP
 * ×1 is a GGD design decision the owner made and it is his to re-tune.
 * `strToAttackDamage` was ALSO labelled "this game's design" before — it is not;
 * `StrAttackBonus=1.0` is written verbatim in both the map and Blizzard's table.
 * The value the owner chose and the imported value happen to agree at 1.
 *
 * Two more map constants matter and are deliberately NOT modelled here:
 *   - `AgiDefenseBase` — map 0.0, Blizzard −2. GGD's armour law has no constant
 *     offset term, which reproduces the MAP (0), not Blizzard.
 *   - `AgiMoveBonus`   — map 0.1, Blizzard 0. The map DOES give move speed per
 *     agility; GGD has no agi→移速 axis. Logged for the owner in
 *     docs/_execution-batches.md, not silently invented here.
 *
 * The map file is committed at
 * `tools/w3x-import/out/GoDieEX22s-src/raw/war3mapMisc.txt` and the Blizzard
 * fallback at `tools/w3x-import/out/stock/STOCK_MISCGAME.json`; both are READ
 * by attributeCoefficients.test.ts, which fails if this object drifts from them.
 *
 * Kept as its own literal — the platform's Go mirror parses THIS object to
 * assert it has not drifted (internal/combatenv/keysync_test.go).
 */
export const ATTRIBUTE_ENV_DEFAULTS = {
  /** war3mapMisc.txt [Misc] StrHitPointBonus = 23.0  (Blizzard MiscGame.txt: 25) */
  strToMaxHealth: 23,
  /** war3mapMisc.txt [Misc] StrRegenBonus = 0.04     (Blizzard MiscGame.txt: 0.05) */
  strToHealthRegen: 0.04,
  /** war3mapMisc.txt [Misc] StrAttackBonus = 1.0     (Blizzard MiscGame.txt: 1.0) */
  strToAttackDamage: 1,
  /** war3mapMisc.txt [Misc] AgiDefenseBonus = 0.15   (Blizzard MiscGame.txt: 0.30) */
  agiToArmor: 0.15,
  /** Blizzard MiscGame.txt AgiAttackSpeedBonus = 0.02 — the map never overrides it */
  agiToAttackSpeed: 0.02,
  /** war3mapMisc.txt [Misc] IntManaBonus = 15.0      (Blizzard MiscGame.txt: 15) */
  intToMaxMana: 15,
  /** war3mapMisc.txt [Misc] IntRegenBonus = 0.07     (Blizzard MiscGame.txt: 0.05) */
  intToManaRegen: 0.07,
  /** OWNER'S DESIGN — no WC3 source exists; Warcraft III has no 法強 attribute */
  intToAbilityPower: 1,
} as const;

/** The 三圍 coefficient keys — the subset of the table that is not a factor. */
export type AttributeEnvKey = keyof typeof ATTRIBUTE_ENV_DEFAULTS;

const ATTRIBUTE_KEY_SET: ReadonlySet<string> = new Set(Object.keys(ATTRIBUTE_ENV_DEFAULTS));

/** True when `k` is one of the eight attribute coefficients, not a ×factor. */
export function isAttributeEnvKey(k: string): k is AttributeEnvKey {
  return ATTRIBUTE_KEY_SET.has(k);
}

/**
 * Upper bound for an attribute COEFFICIENT. The eighteen ×factors keep the
 * 0.1..10 band (combatenv.MinFactor/MaxFactor); 25 hp per strength point would
 * be rejected by it, so the coefficients get their own 0..100 band. 0 is legal
 * and means "switch this derivation axis off entirely".
 */
export const ATTRIBUTE_COEF_MAX = 100;

/** One multiplicative factor per environment quantity (1.0 = neutral). */
export type CombatEnvMultipliers = Readonly<Record<CombatEnvKey, number>>;

const buildDefault = (): Record<CombatEnvKey, number> => {
  const t = {} as Record<CombatEnvKey, number>;
  for (const k of COMBAT_ENV_KEYS) {
    t[k] = isAttributeEnvKey(k) ? ATTRIBUTE_ENV_DEFAULTS[k] : 1;
  }
  return t;
};

/**
 * The SHIPPED table: every ×factor 1.0 (formulae reduce to legacy behaviour)
 * and every 三圍 coefficient at its imported (map/Blizzard) or owner-chosen
 * value. This is also the per-key "reset" target the admin page offers — for a
 * factor that is 1.0, for a coefficient it is the number above, because
 * resetting str→hp to 1.0 would not be neutral, it would delete 96% of every
 * champion's health.
 */
export const COMBAT_ENV_DEFAULTS: CombatEnvMultipliers = Object.freeze(buildDefault());

/** @deprecated name kept for the pre-#248 call sites; see COMBAT_ENV_DEFAULTS. */
export const DEFAULT_COMBAT_ENV: CombatEnvMultipliers = COMBAT_ENV_DEFAULTS;

/** The shipped default for one key (1.0 for a factor, the coefficient for the eight). */
export function defaultForKey(k: CombatEnvKey): number {
  return isAttributeEnvKey(k) ? ATTRIBUTE_ENV_DEFAULTS[k] : 1;
}

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
