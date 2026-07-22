/** Core stats + the aggregated StatBlock. */

export enum Stat {
  MaxHealth = "maxHealth",
  HealthRegen = "healthRegen", // per second
  MaxMana = "maxMana",
  ManaRegen = "manaRegen",
  AttackDamage = "ad",
  AbilityPower = "ap",
  Armor = "armor",
  MagicResist = "mr",
  AttackSpeed = "as", // attacks/sec
  MoveSpeed = "ms", // units/sec
  CritChance = "critChance", // 0..1
  CritDamage = "critDamage", // 1.75 = +75%
  CooldownReduction = "cdr", // 0..1
  Lifesteal = "lifesteal", // 0..1 of basic-attack damage
  AttackRange = "range",
}

export type StatBlock = Record<Stat, number>;

export const ALL_STATS: readonly Stat[] = Object.values(Stat);

export const STAT_CLAMPS: Partial<Record<Stat, [number, number]>> = {
  [Stat.AttackSpeed]: [0.2, 2.5],
  [Stat.CooldownReduction]: [0, 0.45],
  [Stat.CritChance]: [0, 1],
  [Stat.MoveSpeed]: [2, 14],
  [Stat.Lifesteal]: [0, 0.8],
};

export const zeroStats = (): StatBlock => {
  const b = {} as StatBlock;
  for (const s of ALL_STATS) b[s] = 0;
  return b;
};
