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
  /**
   * 迴避 — chance (0..1) for the DEFENDER to make an incoming BASIC ATTACK miss
   * outright. Rolled on the seeded rng at the moment the hit would land; a
   * dodged attack deals no damage, procs no on-hit hook and feeds no lifesteal.
   *
   * BASIC ATTACKS ONLY, and deliberately so — see sim/combat/evasion.ts for the
   * full model (WC3 `Evasion` fidelity + why it must not touch abilities).
   * 0 (every champion today) = no roll at all, so it is a strict no-op until
   * content opts in.
   */
  Evasion = "evasion", // 0..1
}

export type StatBlock = Record<Stat, number>;

export const ALL_STATS: readonly Stat[] = Object.values(Stat);

export const STAT_CLAMPS: Partial<Record<Stat, [number, number]>> = {
  [Stat.AttackSpeed]: [0.2, 2.5],
  [Stat.CooldownReduction]: [0, 0.45],
  [Stat.CritChance]: [0, 1],
  [Stat.MoveSpeed]: [2, 14],
  [Stat.Lifesteal]: [0, 0.8],
  /**
   * A rate, so the lower bound is the real guard: a NEGATIVE evasion is
   * meaningless (there is no "extra hittable" in this model) and would make
   * `chance()` consume an rng draw that can never succeed. The 0.8 ceiling
   * mirrors Lifesteal's: the strongest authored value in the source map is
   * 0.20 (12-00 感應意脈), so this leaves 4x headroom while still denying a
   * champion who literally cannot be hit by autos. Raise it knowingly if a
   * verified WC3 value ever exceeds it — do not rescale the content.
   */
  [Stat.Evasion]: [0, 0.8],
};

export const zeroStats = (): StatBlock => {
  const b = {} as StatBlock;
  for (const s of ALL_STATS) b[s] = 0;
  return b;
};
