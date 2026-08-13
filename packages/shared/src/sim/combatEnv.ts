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
 * THE THREE 2026-08-10 ROWS (owner: 「config 加一格 moveSpeedByAttackType 預設為
 * (近戰/遠戰) 0.8/0.6」+「加一格 magicResistMult 預設 0.2」) are the first entries
 * in this table that are NOT one-factor-per-stat — they are a SECOND factor on a
 * row that already had one, and two of them are chosen by WHO the unit is:
 *
 *   moveSpeedMelee   × Stat.MoveSpeed, ONLY for a 近戰 champion (statPipeline)
 *   moveSpeedRanged  × Stat.MoveSpeed, ONLY for a 遠程 champion (statPipeline)
 *   magicResistMult  × Stat.MagicResist, ON TOP OF `defense` (statPipeline)
 *
 * WHY THESE THREE AND NOT A COEFFICIENT TWEAK (measured 2026-08-10 over the
 * shipped bundle — 119 champions, level-10 medians; recorded here so the next
 * reader does not have to re-derive it):
 *   · 護甲 median 11.4 (−10.2% damage) vs 魔抗 median 49.6 (−33.2%) — a 4.4×
 *     gap, and 74/119 cards have ZERO base armour while exactly 1 has zero MR.
 *     Meanwhile `defaultAbilityDamageType` is "magic" (137 magic / 90 physical
 *     ability effects) and a basic attack is 100% physical. Over a 9s window a
 *     champion actually lands 441 from basics vs 294 from one ability — so
 *     「技能傷害太低」 is MAGIC RESIST, not the coefficients, and one global
 *     ×factor on `Stat.MagicResist` is the smallest thing that moves it.
 *   · ranged median attack range 8.2u vs melee 1.6u, while move speed is 5.70 vs
 *     5.90 — a 0.20 u/s gap, i.e. 33 seconds to close, inside a 3-minute round,
 *     and only 2 of 119 champions have a dash. So 「風箏到死」 is the ABSENT
 *     SPEED DIFFERENTIAL, not raw move speed — which is why the knob is split by
 *     attack type instead of moving the existing global `moveSpeed`.
 *
 * ⚠️ ALL THREE DEFAULT TO 1.0 WHEN ABSENT, and that is a hard requirement, not
 * an oversight: a config/overlay written before today has none of these keys and
 * MUST produce byte-identical numbers. The shipped 0.8 / 0.6 / 0.2 are the
 * owner's chosen values and they live in `content/config/combat-env.json` —
 * never here (第一守則: the shipped value has exactly one home).
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
 *   strToAttackDamage   力量 → 攻擊力          (0.4, owner 2026-08-13 從 1 調降)
 *   agiToArmor          敏捷 → 護甲            (0.15)
 *   agiToAttackSpeed    敏捷 → 攻速            (0.01, MULTIPLICATIVE — see below)
 *                                              ⚠️ 暴雪預設是 0.02，owner 2026-08-13
 *                                              砍半，因為等級上限從 30 變 99
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
  // ── 2026-08-10 owner ×3 ──────────────────────────────────────────────────
  // Appended at the END, same convention as `itemCooldown` / `intToMagicResist`
  // (readable diffs; `combatenv.Keys` in apps/platform mirrors this list and
  // keysync_test.go compares MEMBERSHIP, not position).
  //
  // ⚠️ `moveSpeedByAttackType` was the owner's wording; it lands here as TWO
  // scalar keys because `CombatEnvMultipliers` is a flat `Record<key, number>`
  // that the Go mirror, the Zod schema, the admin table and the wire JSON all
  // walk element by element. A nested `{melee, ranged}` object would need a
  // second shape in five places to say what two rows already say — the SEMANTICS
  // are word-for-word the owner's, only the container is the existing one.
  "moveSpeedMelee",
  "moveSpeedRanged",
  "magicResistMult",
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
 * The three 2026-08-10 rows. Membership here is what narrows a key's legal band
 * from the shared `zEnvFactor` 0..100 down to the ×factor band the PLATFORM has
 * always enforced — `combatenv.MinFactor/MaxFactor` = [0.1, 10].
 *
 * ⚠️ WHY A SET AND NOT 「every ×factor」. The 0..100 Zod ceiling exists because
 * the 三圍 coefficients need it (23 hp per STR), and every legacy ×factor has
 * been riding it for free. Retrofitting [0.1, 10] onto all of them is NOT a
 * no-op: `manaRegen` went to **16** in that batch, so a blanket tightening would
 * have made the shipped content tree illegal.
 * ⚠️ UPDATED 2026-08-11 — the owner took `manaRegen` back to **8**（「維持以前的
 * 就好」）. The 50 ceiling STAYS: it was raised knowingly for the whole table's
 * one-stray-zero derivation below, not as a favour to this one key, and lowering
 * it back is its own decision with its own casualty list. Narrowing the band for the whole table is a real decision with a
 * real casualty list and it belongs to the owner, not to this lane — so the
 * three NEW keys get the correct band and the audit of the other eighteen is
 * filed, not smuggled in here.
 *
 * ⚠️ **CORRECTED 2026-08-12 (GH#316 是誤報).** 這裡本來寫著「`manaRegen: 16` 在平台
 * 上超界，PUT 會回 400（`combatenv.Bounds` → MaxFactor 10）」。**那是假的** ——
 * Go 的 `combatenv.MaxFactor` 早在 `ed5f9b91` 就跟著改成 **50.0** 了，三處一致。
 * 我照著這段過期註解開了 GH#316 說「後台整頁存不了」，⛔ 而那件事從來沒發生過。
 *
 * ⚠️ 教訓正是這份 repo 自己的第三守則：**註解會說謊，去讀原始碼**。這一段害人的
 * 地方在於它寫得像量測結果（「answers 400」），而它只是一次沒有跟上的複述。
 *
 * ⚠️ 仍然成立的那一半：三個常數（Go / admin `MAX_FACTOR` / 這裡）**沒有任何測試
 * 把它們關聯起來**。現在剛好都是 50，但下次有人只改一處，一樣不會有東西變紅 ——
 * 那是 `ggd-pairwise-postconditions` 的形狀（每個名詞健康、關係沒人看）。
 *
 * WHY 10 AND NOT SOMETHING TIGHTER (the 「多打一個零」 derivation): shipped is
 * 0.8 / 0.6 / 0.2, so one stray zero is 8 / 6 / 2 — inside any band that still
 * lets an operator double a knob, and therefore not stoppable by a bound. Two
 * stray zeros (80 / 60 / 20) is what a ceiling can catch, and this is the number
 * the platform, the admin console (`MAX_FACTOR`) and the Go mirror already
 * agree on, so it costs no fourth opinion.
 *
 * ⚠️ CORRECTED 2026-08-10. This said 10, and the line below said it "mirrors"
 * the other two — while the other two had just moved to 50 (owner tuned
 * `manaRegen` 8 → 16, which the old ceiling would have answered 400 on every
 * admin save). Three constants that each CLAIM to mirror the others, with no
 * test relating them, is the shape memory `ggd-pairwise-postconditions` names:
 * every noun healthy, the RELATIONSHIP broken. The live consequence was real —
 * an operator typing 20 into `moveSpeedMelee` would be accepted by the console
 * and the platform, then REJECTED by this Zod band when it reached
 * `content/config`, and a content load that fails is fail-open to the skeleton.
 *
 * ⛔ Do not "fix" a drift like this by editing one side. All three move together
 * or the claim of mirroring is the lie, not the number.
 */
export const FACTOR_BAND_MIN = 0.1;
/**
 * @see FACTOR_BAND_MIN — mirrors `combatenv.MaxFactor` (Go) and admin's
 * `MAX_FACTOR`. ⚠️ All three are 50 as of 2026-08-10; changing one alone is a
 * silent split-brain (see the derivation above).
 */
export const FACTOR_BAND_MAX = 50;

/** The keys that take the [FACTOR_BAND_MIN, FACTOR_BAND_MAX] band. */
export type BandedFactorEnvKey = Extract<
  CombatEnvKey,
  "moveSpeedMelee" | "moveSpeedRanged" | "magicResistMult"
>;

const BANDED_FACTOR_KEYS: readonly BandedFactorEnvKey[] = [
  "moveSpeedMelee",
  "moveSpeedRanged",
  "magicResistMult",
];

const BANDED_FACTOR_KEY_SET: ReadonlySet<string> = new Set(BANDED_FACTOR_KEYS);

/** True when `k` takes the tight ×factor band instead of the shared 0..100. */
export function isBandedFactorEnvKey(k: string): k is BandedFactorEnvKey {
  return BANDED_FACTOR_KEY_SET.has(k);
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
  strToAttackDamage: 0.4,
  /** war3mapMisc.txt [Misc] AgiDefenseBonus = 0.15   (Blizzard MiscGame.txt: 0.30) */
  agiToArmor: 0.15,
  /** Blizzard MiscGame.txt AgiAttackSpeedBonus = 0.02 — the map never overrides it */
  // 🔴 2026-08-13 owner：0.02 → **0.01**。
  //
  //   ⚠️ 0.02 是**暴雪的預設**（`AgiAttackSpeedBonus`，地圖沒有覆寫），
  //     而暴雪設計它的時候英雄上限是 **10 級**。地圖拉到 30，GGD 拉到 **99**。
  //   ⭐ 攻速是九條三圍推導裡**唯一的乘法列**（`scaleBase`），所以只有它
  //     在等級外插下是指數放大的：
  //       敏捷中位  L30 = 70 → 倍率 2.39×
  //                L99 = 197 → 倍率 **4.95×**
  //     L99 攻速中位數因此是 **12.2**，而系統上限是 4 —— 超過 3 倍。
  //   ⇒ 0.01 之後 L99 倍率降到 **2.97×**，中位約 7.3。
  //
  //   ⚠️ owner 選 0.01 而不是 0.005，理由是他自己前一則立的規則：
  //     「計算最多取小數點兩位」。0.005 有三位。
  //   ⚠️ 代價是**低等級的敏捷英雄變弱**：L18 倍率從 1.94× 掉到 1.47×。
  agiToAttackSpeed: 0.01,
  /** war3mapMisc.txt [Misc] IntManaBonus = 15.0      (Blizzard MiscGame.txt: 15) */
  intToMaxMana: 15,
  /** war3mapMisc.txt [Misc] IntRegenBonus = 0.07     (Blizzard MiscGame.txt: 0.05) */
  intToManaRegen: 0.07,
  /** OWNER'S DESIGN — no WC3 source exists; Warcraft III has no 法強 attribute */
  // 🔴 2026-08-13 owner：1 → **2**。理由是他量到的落差：
  //   「目前**技能傷害跟普通攻擊傷害落差實在太大了**」
  //
  //   實測（法師 L99）：普攻**每秒 1,328**，而一發技能（多半 8~15 秒冷卻）
  //   的中位傷害只有 **420** —— 一發技能 = 普攻一秒的 **32%**。
  //   係數 2 之後升到 638（48%）。
  //
  //   ⚠️ 代價是**全域的**：121 個傷害節點吃 AP 加成（AP 係數中位 0.60），
  //     它們的 AP 那一項全部翻倍。這是一次真正的平衡改動不是微調。
  //   ⭐ 但它是 `combat-env.json` 的一格，存檔生效、不用部署。
  //
  //   ⚠️ 而且這個落差**有一半不是 AP 的錯**：法師 L99 的攻速被夾在上限 4、
  //     AD 332，所以普攻每秒 1,328。那是攻速上限與 AD 成長的問題。
  //
  //   ⭐ 這是 owner 自己設計的係數（w3x 沒有「法強」這個屬性），
  //     所以調它**不偏離原作**。
  // ═══ 2026-08-13 · 普攻 vs 技能的再平衡（owner 選了最激進的那一組）═══════
  //
  //   owner：「現在的玩法**普通攻擊太有利了**，可以一直輸出，不用卡冷卻 MP 消耗
  //           吟唱，**技能傷害爆發力對於玩家及 NPC 造成不了顯著一擊＝雞肋**」
  //
  //   量到的落差（法師，等級 99）：
  //     普攻 **每秒 1,328**（AD 332 × 攻速上限 4）
  //     技能一發中位 **388**（base 200 + AP 係數 0.60 × AP 314）
  //     ⇒ 一發技能 = **普攻 0.29 秒**，而主力技能冷卻多半 8~15 秒。
  //
  //   ⭐ 關鍵發現：**削 AD 比補 AP 更有效**，因為普攻是乘法（AD × 攻速）而技能是
  //     加法。`strToAttackDamage` 1→0.5 一動就把比值從 0.58 推到 0.76，
  //     比 AP 從 2 拉到 3 的效果還大。所以兩邊一起動。
  //
  //   六組配套算過之後 owner 選了最激進的那一組：
  //     intToAbilityPower 2→4 · strToAttackDamage 1→0.4 · attackDamage 1.0→0.6
  //     ⇒ 法師普攻 1,328 → **566/秒**，技能一發 388 → **954**
  //     ⇒ 一發技能 = **普攻 1.68 秒**（原本 0.29 秒）
  //
  //   ⚠️ 三個代價，都是刻意付的：
  //     ① `strToAttackDamage = 1.0` 是 **w3x 原作逐字匯入的**（地圖寫著
  //        `StrAttackBonus=1.0`）。改它是明確偏離原作 —— 第〇·六守則第 1 層
  //        （新版設計）贏過第 5 層（w3x 原始設定），但這件事要留紀錄。
  //     ② `attackDamage` 倍率影響**每一個人**，包括殭屍與守衛塔的承受端。
  //     ③ AP 係數 4 讓 **121 個傷害節點**的 AP 那一項變 4 倍。那些技能的形狀是
  //        `base 200 + 0.6 × AP`，AP 從 314 變 1,256 之後**係數項（754）遠超過
  //        base 項（200）** —— 技能傷害從此主要由智慧決定，不由作者填的 base 決定。
  //
  //   ⭐ 三格全部是 `combat-env.json`，**存檔生效、不用部署**。不滿意就回頭。
  //   ⚠️ 這一批**只動數值**。owner 點名的「普攻不用卡冷卻/MP/吟唱」是**結構**問題，
  //     數值調整碰不到它 —— 那要另一批（給普攻一個機會成本）。
  // ⚠️ 2026-08-13 第二次調整：4 → **6.5**（owner「int to ap lift to 6.5」）。
  //   4 之後量到 L99 的一發技能 = 普攻 2.01 秒（法師）/ 0.71 秒（射手），
  //   而 owner 要的曲線是「60 級以下技能更強」。6.5 把整條曲線再往技能那一側推。
  intToAbilityPower: 6.5,
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

// ------------------------------------------------- stat → env-key CHAIN ----
/**
 * WHO the factor is being computed for. Everything an env link is allowed to
 * ask about the unit lives here — ONE parameter object, so a future axis
 * (primary attribute, team, form) adds a field and a `kind` below rather than a
 * new argument threaded through `finalizeStat` and every display panel.
 */
export interface StatEnvSubject {
  /**
   * 近戰 / 遠程, read from the champion card (`ChampionDef.attackType`, which is
   * REQUIRED — see sim/content/defs.ts). `undefined` means the caller genuinely
   * cannot know: 小怪 / 守衛塔 / 投射物 have no champion card at all, and a
   * display surface may be rendering a table rather than a unit.
   */
  readonly attackType?: "melee" | "ranged";
}

/**
 * ONE link in a stat's env-multiplier chain.
 *
 * ⭐ WHY THIS SHAPE (第零守則⑨ —— 「第二個東西跟第一個只差參數 ⇒ 先抽模板」).
 * Before 2026-08-10 this table was `Stat → one key`, and today's batch breaks
 * that in two independent ways at once: `Stat.MagicResist` needs a SECOND
 * factor (`defense × magicResistMult`), and `Stat.MoveSpeed` needs a factor
 * whose KEY depends on the unit. Writing `if (stat === MagicResist) …` plus
 * `if (attackType === "melee") …` inside `finalizeStat` would be two special
 * cases for two rows, and the third row (already foreseeable: 近戰/遠程 attack
 * speed, 近戰/遠程 damage taken) would be a third.
 *
 * So the table becomes a CHAIN — an ordered list of links, multiplied
 * left-to-right — and a link is DATA, not a closure:
 *
 *   · `fixed`        — one key, unconditional. Every pre-2026-08-10 row.
 *   · `byAttackType` — the key is picked by `subject.attackType`.
 *
 * Data rather than `(subject) => key` for three concrete reasons:
 *   1. the keys stay ENUMERABLE, so `STAT_ENV_CHAIN_KEYS` can be derived and
 *      the 「every key is either stat-mapped or formula-site」 guard keeps working;
 *   2. `sim/**` bans hidden non-determinism, and a table of literals cannot
 *      smuggle any in;
 *   3. adding an axis is a new `kind` + one arm in `statEnvFactor` — ONE place
 *      that knows how axes resolve, which is the property a per-key `if` loses.
 *
 * ⚠️ A link that cannot resolve returns the NEUTRAL 1, never a guessed key —
 * see `statEnvFactor`.
 */
export type StatEnvLink =
  | { readonly kind: "fixed"; readonly key: CombatEnvKey }
  | { readonly kind: "byAttackType"; readonly melee: CombatEnvKey; readonly ranged: CombatEnvKey };

const fixed = (key: CombatEnvKey): StatEnvLink => ({ kind: "fixed", key });

/**
 * Stat → env-factor chain, consumed by `finalizeStat` (sim/baseBonus.ts).
 * Cooldown is NOT here on purpose: it multiplies the cooldown SECONDS at cast
 * time (a 2.0 factor doubles cooldowns), never the CDR stat.
 *
 * Order inside a chain is the multiplication order and is FIXED, so the answer
 * cannot depend on iteration order. Since every link multiplies and a neutral
 * factor is exactly 1.0, a chain whose extra links are all neutral is
 * bit-identical to the single-factor arithmetic that preceded it.
 */
export const STAT_ENV_CHAIN: Partial<Record<Stat, readonly StatEnvLink[]>> = {
  [Stat.Armor]: [fixed("defense")],
  // 魔抗 = 全域防禦倍率 × 魔抗專屬倍率。TWO links, not a replacement: `defense`
  // still moves armour and MR together (that is what it has always meant), and
  // `magicResistMult` is the extra dial that moves ONLY the magic side — which
  // is the whole point, since the measured armour/MR gap is 4.4×.
  [Stat.MagicResist]: [fixed("defense"), fixed("magicResistMult")],
  [Stat.AttackDamage]: [fixed("attackDamage")],
  [Stat.AbilityPower]: [fixed("abilityPower")],
  [Stat.MaxHealth]: [fixed("maxHealth")],
  [Stat.HealthRegen]: [fixed("healthRegen")],
  [Stat.MaxMana]: [fixed("maxMana")],
  [Stat.ManaRegen]: [fixed("manaRegen")],
  // 移速 = 全域移速倍率 × 這個單位所屬攻擊型態的倍率。`moveSpeed` is still the
  // knob that moves EVERYONE; these two open the 近戰/遠程 gap that the census
  // says is missing (5.90 vs 5.70 = 33 秒才追得上).
  [Stat.MoveSpeed]: [
    fixed("moveSpeed"),
    { kind: "byAttackType", melee: "moveSpeedMelee", ranged: "moveSpeedRanged" },
  ],
  [Stat.AttackSpeed]: [fixed("attackSpeed")],
  [Stat.CritChance]: [fixed("critChance")],
  [Stat.CritDamage]: [fixed("critDamage")],
  [Stat.Lifesteal]: [fixed("lifesteal")],
  // 技能吸血 rides the SAME `lifesteal` env knob on purpose — it is the same
  // notion on the other half of the damage stream, and a second key would have
  // to be mirrored into Go's `combatenv.Keys` (keysync_test.go) to buy the
  // operator a slider he would then have to remember to move in pairs.
  [Stat.SpellVamp]: [fixed("lifesteal")],
  [Stat.AttackRange]: [fixed("attackRange")],
};

/**
 * Resolve ONE link to a factor. The single place that knows how an axis is
 * answered — a new `kind` adds an arm here and nowhere else.
 *
 * ⭐ THE DECISION: an unknown subject answers **1 (neutral)**, not a default
 * side. 小怪 / 守衛塔 / 投射物 have no champion card, so 「they are melee」 would
 * be an invention, and picking either side would silently apply a balance knob
 * to units the owner was talking about heroes when he set. The operator already
 * has the row that moves EVERY unit — the global `moveSpeed` factor — so
 * "neutral when unknown" costs no expressiveness, it just refuses to guess.
 * (Mobs do not go through this path at all today: they build their stats in
 * sim/mobs.ts, never `recomputeStats`. This keeps that true by construction
 * instead of by luck.)
 */
export function statEnvFactor(
  link: StatEnvLink,
  env: CombatEnvMultipliers,
  subject?: StatEnvSubject,
): number {
  if (link.kind === "fixed") return env[link.key];
  const at = subject?.attackType;
  if (at === undefined) return 1;
  return env[at === "melee" ? link.melee : link.ranged];
}

/**
 * Every env key that any chain mentions. Derived, so the 「a key is either
 * stat-mapped or a formula-site key」 guard in combatEnv.test.ts cannot go stale
 * when a chain grows a second link.
 */
export const STAT_ENV_CHAIN_KEYS: ReadonlySet<CombatEnvKey> = new Set(
  Object.values(STAT_ENV_CHAIN).flatMap((links) =>
    (links ?? []).flatMap((l) => (l.kind === "fixed" ? [l.key] : [l.melee, l.ranged])),
  ),
);

/**
 * @deprecated Legacy `Stat → one key` view, DERIVED from `STAT_ENV_CHAIN` so it
 * cannot become a second truth. It answers a stat's UNCONDITIONAL link only, so
 * `Stat.MagicResist` still reads `"defense"` and `Stat.MoveSpeed` still reads
 * `"moveSpeed"` — byte-identical to what every pre-2026-08-10 caller saw. New
 * code should read the chain (or call `finalizeStat`), because this view cannot
 * express a second or a subject-dependent factor.
 */
export const STAT_ENV_KEY: Partial<Record<Stat, CombatEnvKey>> = Object.freeze(
  Object.fromEntries(
    Object.entries(STAT_ENV_CHAIN).flatMap(([stat, links]) => {
      const f = links?.find((l): l is Extract<StatEnvLink, { kind: "fixed" }> => l.kind === "fixed");
      return f ? [[stat, f.key] as const] : [];
    }),
  ),
) as Partial<Record<Stat, CombatEnvKey>>;

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
