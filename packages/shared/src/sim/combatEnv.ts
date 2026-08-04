/**
 * CombatEnvMultipliers — the GLOBAL combat-environment multiplier table
 * (task #28: admin 戰鬥系統 dynamic config). Every quantity is a pure factor
 * applied at exactly ONE formula site in the sim:
 *
 *   cooldown      × ability cooldown seconds (abilities/abilitySystem.ts castAbility;
 *                   covers Q/W/E/R AND the EX slot — all pay through that one seam).
 *                   ABILITIES ONLY since #189 — see `itemCooldown` below.
 *   itemCooldown  × an ITEM passive's internal cooldown seconds (effects/hooks.ts
 *                   fireHooks, and ONLY for a source whose `kind === "item"`;
 *                   champion passives, augments, auras and buffs keep their own
 *                   ICDs unscaled). owner 2026-07-28: 道具冷卻要能獨立調,
 *                   既有的 `cooldown` 只管技能.
 *
 *                   ⚠️ IT SHIPS AT 1.0 AND THAT IS NOT A PLACEHOLDER. Before
 *                   #189 an item ICD was scaled by NOTHING at all, so 1.0 is the
 *                   value that keeps every existing item byte-identical; the
 *                   knob exists so the operator can move item cadence WITHOUT
 *                   dragging every ability cooldown with it, which is exactly
 *                   what the single `cooldown` factor used to force.
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
 *   attackRange   × Stat.AttackRange         (statPipeline; BASIC-attack reach only.
 *                   ⚠️ SINCE GH#252 IT IS NOT THE ONLY FACTOR ON THAT ROW: the
 *                   champion's 身體放大倍數 multiplies it at the same seam via
 *                   `finalizeStat`'s `rangeScale` — see sim/bodyScale.ts. This
 *                   key is still the GLOBAL knob; that one is per-champion.)
 *   abilityRange  × ability CAST RANGE + AoE RADIUS (task #136; abilities ONLY,
 *                   never basics — the read seams are abilitySystem.castAbility
 *                   out-of-range + ground clamp/AoE, CastResolveSystem's AoE
 *                   re-query, and the ability projectile hit radius in
 *                   ProjectileSystem, all via resolveAbilityRange/Radius)
 *
 * THE FIVE 金錢發放 FACTORS (owner 2026-08-04「金錢發放有點太浮濫了」) join the
 * same table for the same reason the coefficients did — this IS the project's
 * 系統倍率 mechanism, and a second one would mean a second admin page, a second
 * snapshot path and a second thing to keep in sync:
 *
 *   goldRoundPayout × 回合發放: 開局購物金, arena-rules 的每回合 grantGold 排程,
 *                     回合勝/負/輪空 與決賽的結算金
 *   goldMobKill     × 打一般殭屍: 每隻普通殭屍的 rewardGold, 召喚物賞金,
 *                     以及技能/道具把「非英雄的屍體」變成錢的發放 (鍊金術之盾)
 *   goldEliteKill   × 打特殊殭屍與殭屍王: 特殊殭屍的 rewardGold(含 rewardMult)
 *                     與它的分紅獎池, 殭屍王的分紅獎池
 *   goldHeroKill    × 擊敗英雄: 擊殺獎勵 + 首殺賞金 (#90)
 *   goldQuest       × 完成任務: 守衛塔補刀獎勵 (#89) 等場上目標物
 *
 * ⚠️ WHY 一般 AND 特殊/王 ARE TWO ROWS, NOT ONE (owner 2026-08-04:
 * 「打殭屍 => 0.1x 這樣看起來就好了」+「普通殭屍 的確也可以單獨倍率, 預設改成
 * 0.5」). They are two different economies wearing the same coat: a 一般殭屍 is a
 * per-kill trickle a player farms dozens of, while a 特殊殭屍 or a 殭屍王 is a
 * single lump the size of an item build. One knob cannot make the lump sane and
 * leave the trickle alone, which is exactly the complaint 「太浮濫」 names.
 *
 * ⚠️ 殭屍王 IS `goldEliteKill`, NOT `goldQuest`, and that is a correction, not a
 * preference. It was briefly filed under 完成任務 because #262 calls it the
 * quest's prize — but #262/#263 are both still pending, so NO QUEST PAYS ANY
 * GOLD TODAY, and the king is the single largest gold source in a match. Filing
 * the biggest payout under a knob the owner would never think to turn is how
 * 「我把打殭屍調成 0.1 了, 錢還是很多」 happens. `goldQuest` is not left empty:
 * the 守衛塔 last-hit reward (#89) pays through it.
 *
 * All five apply at ONE seam — `economy/progression.ts grantGold`, whose
 * category argument is REQUIRED so a new payout site cannot compile without
 * naming its bucket. AT 1.0 EACH ONE IS BIT-IDENTICAL BY CONSTRUCTION (the
 * scaler returns the amount untouched when the factor is exactly 1), not by
 * luck of rounding — which is what makes the two rows that ship BELOW 1.0
 * (see content/config/combat-env.json) a deliberate balance change and every
 * other row a no-op.
 *
 * THE NINE 三圍 COEFFICIENTS (task #248, ninth added by GH#221) join the same
 * table rather than inventing a second config surface, so the admin 戰鬥系統 page
 * tunes them with everything else and a match snapshots them exactly like the rest:
 *
 *   strToMaxHealth      力量 → 生命上限        (23)
 *   strToHealthRegen    力量 → 每秒回血        (0.04)
 *   strToAttackDamage   力量 → 攻擊力          (1)
 *   agiToArmor          敏捷 → 護甲            (0.15)
 *   agiToAttackSpeed    敏捷 → 攻速            (0.02, MULTIPLICATIVE — see below)
 *   intToMaxMana        智慧 → 魔力上限        (15)
 *   intToManaRegen      智慧 → 每秒回魔        (0.07)
 *   intToAbilityPower   智慧 → 法術強度        (1)
 *   intToMagicResist    智慧 → 魔法抗性        (0.6, owner 2026-07-30 GH#221)
 *
 * Seven of the nine are IMPORTED, not chosen — see ATTRIBUTE_ENV_DEFAULTS below
 * for the file and field each one comes from. The two that are not
 * (`intToAbilityPower`, `intToMagicResist`) are the owner's own design and have
 * no WC3 source at all: Warcraft III has neither a 法強 nor a 魔抗 attribute axis.
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
 * pre-multiplier sim (all eighteen legacy factors are 1.0), and gives the nine
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
  // #189 — 道具冷卻, independent of the ability `cooldown` above. Appended at
  // the END: `combatenv.Keys` in apps/platform mirrors this array and
  // keysync_test.go compares them element by element.
  "itemCooldown",
  "strToMaxHealth",
  "strToHealthRegen",
  "strToAttackDamage",
  "agiToArmor",
  "agiToAttackSpeed",
  "intToMaxMana",
  "intToManaRegen",
  "intToAbilityPower",
  // GH#221 — 智慧 → 魔抗 0.6 (owner 2026-07-30「目前玩家太容易死了」那一批).
  //
  // Appended at the end as a CONVENTION (it keeps diffs readable and matches
  // how `itemCooldown` landed), NOT because anything enforces the position.
  //
  // ⚠️ CORRECTED 2026-07-30 (稽核 / CLAUDE.md 第三守則). This comment previously
  // claimed 「keysync_test.go compares them positionally, so a key inserted in
  // the middle would fail the Go drift guard」. **THAT IS FALSE, and it is the
  // second time the same false claim has been written here** (the first was
  // retracted in the v0.9.15 round — see docs/_execution-batches.md).
  // `apps/platform/internal/combatenv/keysync_test.go:53` uses
  // `assert.ElementsMatch`, which is ORDER-INDEPENDENT, and no consumer of
  // COMBAT_ENV_KEYS reads it positionally (every one iterates it to build a
  // key→value map). The real drift guard is MEMBERSHIP: a key that exists here
  // and not in `combatenv.Keys` gets dropped by the platform's rebuild-the-map
  // sanitizers, so the operator can never see or change it. Check membership in
  // the Go mirror, `content/config/combat-env.json` and `apps/admin`; do not
  // rely on ordering being protected, because it is not.
  "intToMagicResist",
  // ── 金錢發放倍率 ×5 (owner 2026-08-04「金錢發放有點太浮濫了…分為 回合發放倍率,
  //    打殭屍發放倍率, 擊敗英雄發放倍率, 完成任務發放倍率」+ 同日追加
  //    「普通殭屍 的確也可以單獨倍率, 預設改成 0.5」) ──────────────────────────
  //
  // A THIRD KIND OF ENTRY in this table. The eighteen legacy factors scale a
  // STAT or a DURATION; the nine 三圍 rows are COEFFICIENTS. These five scale a
  // PAYOUT, and they differ from the ×factors in exactly one way that matters:
  // 0 is a legal, meaningful setting (「這一類完全不發」), where a 0 damage
  // multiplier is not. So they get their own band — see isGoldEnvKey /
  // GOLD_FACTOR_MIN / GOLD_FACTOR_MAX below and `combatenv.Bounds` in the Go
  // mirror, which must agree or the console accepts a value the PUT rejects.
  //
  // They are applied at exactly ONE seam, like every other row:
  // `economy/progression.ts grantGold`, which takes a REQUIRED category
  // argument so a new payout site cannot compile without choosing a bucket.
  //
  // ⚠️ 一般 vs 特殊/王 是兩格。elite 收的是 特殊殭屍 + 殭屍王 —— 兩者都是「一次
  // 一大筆」, 而 mob 收的是玩家整場刷幾十次的涓流。用同一格調, 就沒辦法在壓掉
  // 大筆的同時留住涓流, 而那正是 owner 說 0.1 時要的東西。
  "goldRoundPayout",
  "goldMobKill",
  "goldEliteKill",
  "goldHeroKill",
  "goldQuest",
] as const;

export type CombatEnvKey = (typeof COMBAT_ENV_KEYS)[number];

/**
 * The five 金錢發放 factors (owner 2026-08-04). Membership here is what gives a
 * key the [GOLD_FACTOR_MIN, GOLD_FACTOR_MAX] band instead of the ×factor one —
 * the same mechanism `isAttributeEnvKey` uses for the 三圍 coefficients.
 *
 * ⚠️ THE FLOOR IS 0 AND THAT IS THE POINT. 「完全不發」 is a setting the owner
 * asked for; the legacy 0.1 floor exists because a 0× damage multiplier is a
 * broken match, and that reasoning does not transfer to a payout.
 *
 * ⚠️ SPELLED OUT, NOT a `startsWith("gold")` prefix test — the Go mirror's
 * `GoldFactors` says the same thing for the same reason: a future key that
 * merely READS as an economy row must not inherit a 0 floor nobody reviewed.
 * The `GoldEnvKey[]` annotation is what makes a typo a compile error instead of
 * a key that silently keeps the 0.1 floor.
 */
const GOLD_ENV_KEYS: readonly GoldEnvKey[] = [
  "goldRoundPayout",
  "goldMobKill",
  "goldEliteKill",
  "goldHeroKill",
  "goldQuest",
];

const GOLD_KEY_SET: ReadonlySet<string> = new Set(GOLD_ENV_KEYS);

/** True when `k` is one of the five 金錢發放 factors. */
export function isGoldEnvKey(k: string): k is GoldEnvKey {
  return GOLD_KEY_SET.has(k);
}

/**
 * The 金錢發放 factor keys. Derived from `CombatEnvKey` so a key that exists
 * here but not in `COMBAT_ENV_KEYS` cannot compile.
 */
export type GoldEnvKey = Extract<
  CombatEnvKey,
  "goldRoundPayout" | "goldMobKill" | "goldEliteKill" | "goldHeroKill" | "goldQuest"
>;

/** 完全不發 is legal for a payout factor (it is not for a damage factor). */
export const GOLD_FACTOR_MIN = 0;
/**
 * Upper bound. NOT decoration — #277 is 「後台打錯一個數字全英雄一開場就死」, and
 * an unbounded payout factor is the same defect wearing an economy's clothes:
 * a mistyped 100 turns one zombie into a full item build.
 */
export const GOLD_FACTOR_MAX = 10;

/**
 * Apply one 金錢發放倍率 to a configured amount. THE ONLY COPY OF THIS RULE.
 *
 * `sim/economy/progression.scaleGoldPayout` calls it (the payout side) and the
 * ADMIN CONSOLE calls it (the display side, 後台 → 殭屍波系統's 「實發」 column).
 * That second caller is the reason it lives here rather than inside
 * `progression.ts`: this module is a leaf (one import, `Stat`), while
 * `progression.ts` pulls the scoreboard in, and the console page is EAGERLY
 * bundled.
 *
 * ⚠️ WHY THE CONSOLE MUST CALL THIS AND NOT RE-DERIVE IT (owner 2026-08-04
 * 「顯示不說謊 => 顯示真實值，跟其他系統倍率一樣」 —— the same rule as #125).
 * 後台's 殭屍波系統 printed the CONFIGURED 殭屍王獎金池 while a real match paid
 * something else entirely. A second `Math.round(x * f)` written in the page would
 * fix today's number and silently drift the first time the rounding or the
 * fail-safe below changes — the console would be lying again, in a new way, with
 * every test still green.
 *
 * ⚠️ AND THIS FUNCTION ALONE IS NOT THE WHOLE ANSWER FOR THE TWO BOUNTY POOLS.
 * A pool's payout is a RANGE, not a number: `splitBossBounty`'s shipped
 * `lastHitMode: "bonus"` pays the last hitter a second copy of their own share,
 * so the total lands in `[pool, pool × lastHitMultiplier]` BEFORE this factor is
 * applied, and where inside that range depends on the damage split. Quoting one
 * measured figure for it is how the console ended up with three mutually
 * contradictory 「measured」 numbers on 2026-08-04 — they were three points on one
 * range. The console derives both endpoints from those two config fields; see
 * `apps/admin/src/mobWaves.ts` → `goldPoolLastHitBonus`.
 *
 * ROUNDING + the two fail-safes are documented at `scaleGoldPayout`; the
 * `factor === 1` early return is the bit-identical-at-1.0 regression guard.
 */
export function applyGoldFactor(amount: number, factor: number): number {
  if (factor === 1) return amount;
  if (!Number.isFinite(factor) || factor < 0) return amount; // same fail-safe as normalizeCombatEnv
  return Math.round(amount * factor);
}

/**
 * The nine 三圍 coefficients (task #248 shipped eight; GH#221 added the ninth)
 * and their SHIPPED values.
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
 *   intToMagicResist   (no WC3 concept at all)               —         0.6
 *
 * SEVEN ARE IMPORTED, TWO ARE THE OWNER'S. `intToAbilityPower` and
 * `intToMagicResist` are the rows with no upstream source: Warcraft III has
 * neither a 法強 nor a 魔抗 attribute axis, so 智慧→AP ×1 and 智慧→魔抗 ×0.6 are
 * GGD design decisions the owner made and they are his to re-tune.
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
  /**
   * OWNER'S DESIGN (2026-07-30, GH#221「新增 智慧→每 1 點智慧增加的魔抗 0.6」).
   * No WC3 source exists: Warcraft III has no magic-resistance ATTRIBUTE at all
   * (its 魔抗 is a per-unit armour-type table, not a derived stat), so this axis
   * is invented for GGD exactly like `intToAbilityPower` and is the owner's to
   * re-tune from 後台.
   *
   * It lands on `Stat.MagicResist`, which `combat/damage.ts mitigate()` already
   * reads for every non-physical, non-true packet through the SAME
   * `100/(100+resist)` curve as armour — so this coefficient is what finally
   * makes 智慧 a defensive attribute, not a new mitigation mechanic.
   */
  intToMagicResist: 0.6,
} as const;

/** The 三圍 coefficient keys — the subset of the table that is not a factor. */
export type AttributeEnvKey = keyof typeof ATTRIBUTE_ENV_DEFAULTS;

const ATTRIBUTE_KEY_SET: ReadonlySet<string> = new Set(Object.keys(ATTRIBUTE_ENV_DEFAULTS));

/** True when `k` is one of the nine attribute coefficients, not a ×factor. */
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

/** The shipped default for one key (1.0 for a factor, the coefficient for the nine). */
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
