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
  /**
   * 2.5 attacks/sec (LoL's ceiling). #267 asked whether melee should be allowed
   * higher; it was measured and the answer was NO — see THE ATTACK-SPEED
   * CEILING below this table for the numbers and for where the real lever is.
   */
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

/*
 * THE ATTACK-SPEED CEILING —— 近戰攻速的真正上限 —— 為什麼 2.5 沒有被拉高 (#267).
 *
 * Owner:「攻速上限分析，近戰攻速可以更高」. 這條上限被實測過，結論是：**它不是
 * 卡住近戰的東西**，拉高它只會讓面板說謊。
 *
 * 量測 A — 這條夾限幾乎不咬人。115 張英雄卡、等級 1..18、不帶任何道具：近戰的
 * 攻速中位數是 lv1 0.70、lv18 1.77，**沒有一位**靠基礎值＋敏捷碰到 2.5。唯一被
 * 夾的是 godie-h02n 腦包英雄，他的 `baseStats.as = 10` 忠實對應原圖的
 * `attack_cooldown = 0.1`（tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json），
 * 是惡搞英雄不是匯入錯誤，而且不在開放名單上。要撞到 2.5 得靠疊攻速裝
 * （lv18 近戰中位數還差 +41%，名刀-天狼一把就是 +123%）。
 *
 * 量測 B — 揮擊管線在 2.4 次/秒就飽和了。`BasicAttackSystem` 一次只揮一刀：
 * 前搖 0.25 s（8 tick）跑完才會放行下一刀，再加上結算那一 tick 本身，以及命中
 * 後 hitstop 會**暫停前搖**。thorne（前搖 0.25 s）在 30 Hz 打不還手的木樁 10 秒：
 *
 *     面板攻速   2.00  2.50  3.00  3.50  4.00
 *     實際次數/秒 2.00  2.30  2.40  2.40  2.40
 *
 * 也就是說 2.5 已經幾乎踩在飽和點上；把夾限拉到 4.0 只多 +4%（2.30 → 2.40），
 * 面板卻會從 2.50 跳成 4.00 —— 對玩家謊報 67%，正面違反 #125「顯示的數字必須
 * 是最終值」。而 82 位近戰裡有 22 位把前搖寫成 0.5 s，他們的真正天花板是
 * 2 次/秒，比這條夾限還低，拉高夾限對他們是完全的 no-op。
 *
 * 所以要讓「近戰攻速可以更高」真的發生，槓桿在 BasicAttackSystem（結算後那一
 * tick 的空窗、以及攻擊者自己的 hitstop 暫停自己的前搖）與 `attackDamagePoint`
 * 的內容值，不在這張表。那是一次會動到全體 DPS 手感的改動，需要 owner 拍板。
 *
 * 如果將來管線修好了、真的要放寬，這裡是唯一的地方：把上界改掉即可，
 * `recomputeStats` 是唯一讀它的人（商店即時預覽跑的也是同一支函式）。
 *
 * END OF THE #267 NOTE — the declaration below is unrelated.
 */

export const zeroStats = (): StatBlock => {
  const b = {} as StatBlock;
  for (const s of ALL_STATS) b[s] = 0;
  return b;
};
