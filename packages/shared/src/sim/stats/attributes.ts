/**
 * 三圍 — the Warcraft III STRENGTH / AGILITY / INTELLIGENCE model (task #248).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------
 * Every champion imported from the source map has three attributes and three
 * per-level attribute growths. Until #248 the importer FOLDED them into the
 * stat card (`baseStats.maxHealth` was literally `(w3x_hp + 25·STR) × 0.8`) and
 * threw the attributes away, so the roster carried the CONSEQUENCE of the WC3
 * model without the model itself: eight numbers that could never be re-tuned,
 * an `ap` column that was 0 for all 114 champions, and an attack speed that was
 * hand-clamped into 0.40–1.20 instead of tracking agility.
 *
 * Now the champion doc carries the attributes and `baseStats` carries the RAW
 * w3x values, and the sim adds the attribute term at recompute time:
 *
 *     maxHealth   = base + strToMaxHealth      · STR      (23)  + 300  (#265)
 *     healthRegen = base + strToHealthRegen    · STR      (0.04)
 *     ad          = base + strToAttackDamage   · STR      (1)
 *     armor       = base + agiToArmor          · AGI      (0.15)
 *     as          = base × (1 + agiToAttackSpeed · AGI)   (0.02)
 *     maxMana     = base + intToMaxMana        · INT      (15)
 *     manaRegen   = base + intToManaRegen      · INT      (0.07)
 *     ap          = base + intToAbilityPower   · INT      (1)
 *     mr          = base + intToMagicResist    · INT      (0.6)   ← GH#221
 *
 * ---------------------------------------------------------------------------
 * THREE ADDITIVE LAYERS, IN THIS ORDER
 * ---------------------------------------------------------------------------
 * `base` above is itself `baseStats + growth·(level−1)`, so the full law is
 *
 *     stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
 *
 * then item/augment/buff modifiers (statPipeline.ts), then the stat's own
 * combat-env ×factor, then the 基礎加成 flat grant (sim/baseBonus.ts), then the
 * clamp. Everything up to and including the attribute term is computed here and
 * ONLY here; everything after it is `finalizeStat`. 全英雄初始 +300 生命 (#265)
 * 曾經住在這裡 —— 見 baseBonus.ts 說明它為什麼搬走。
 *
 * `growth` was NOT deleted when the attributes landed. The owner ruled on it
 * directly —「growth 區塊就是重複來源 => 本來就可以重複沒有衝突」— because the
 * two sources do not represent the same thing: `attributes.*Growth` carries the
 * w3x-faithful part of the curve, `growth` stays the per-hero designer knob laid
 * on top, so a hero's progression is not locked to his three attributes.
 *
 * ⚠️ `growth.mr` USED TO BE the one row with no attribute term, and this file
 * said so at length: 「Warcraft III has no magic-resistance attribute, so 魔抗 is
 * growth-only by nature」. That sentence is still TRUE ABOUT WARCRAFT and no
 * longer true about GGD — owner 2026-07-30 (GH#221):「新增 智慧→每 1 點智慧增加
 * 的魔抗 0.6」. 魔抗 is now derived exactly like 法強: an owner-designed axis with
 * no upstream source, riding the same `ATTR_STAT_SOURCE` table as the seven
 * imported ones. `growth.mr` keeps its designer-knob role unchanged.
 *
 * SEVEN of those NINE coefficients are IMPORTED, not chosen. The source map
 * ships its own gameplay-constants table — `war3mapMisc.txt`, extracted to
 * `tools/w3x-import/out/GoDieEX22s-src/raw/war3mapMisc.txt` — and it OVERRIDES
 * four of Blizzard's: StrHitPointBonus 25→23, StrRegenBonus 0.05→0.04,
 * AgiDefenseBonus 0.30→0.15, IntRegenBonus 0.05→0.07. The one field the map
 * does not touch, AgiAttackSpeedBonus, falls back to Blizzard's 0.02. The
 * per-coefficient table with every file and field name is on
 * `ATTRIBUTE_ENV_DEFAULTS` in ../combatEnv.ts; it is the single provenance
 * record and attributeCoefficients.test.ts re-reads both files to enforce it.
 *
 * Only `intToAbilityPower` and `intToMagicResist` are the owner's own design:
 * Warcraft III has neither a 法強 nor a 魔抗 attribute, so 智慧→AP ×1 and
 * 智慧→魔抗 ×0.6 have no upstream source and are his to re-tune.
 * (`strToAttackDamage` used to be labelled design too — it is not; the map and
 * Blizzard both write StrAttackBonus=1.0 verbatim.)
 *
 * Do NOT re-derive these from memory. The numbers a WC3 player "knows" — 25 hp,
 * 0.05 regen, 1/7 armour — are Blizzard's defaults, and this map is not on them.
 *
 * ---------------------------------------------------------------------------
 * WHY ATTACK SPEED IS THE ONE MULTIPLICATIVE ROW
 * ---------------------------------------------------------------------------
 * In WC3 agility does not add attacks/sec, it shortens the attack COOLDOWN:
 * `attacks/sec = (1 + 0.02·AGI) / baseAttackTime`. Since `baseStats.as` stores
 * `1 / baseAttackTime`, the faithful form is `base × (1 + coef·AGI)`, and the
 * agility point is worth twice as much to a 0.5s weapon as to a 1.0s one —
 * which is exactly the WC3 behaviour the roster was flattened out of. Writing
 * it additively instead would give every champion the same +0.02/AGI and lose
 * the whole reason attack speed was worth deriving. `ATTR_STAT_SOURCE.mode`
 * names the two forms so nothing has to guess.
 *
 * ---------------------------------------------------------------------------
 * THE ONE SEAM
 * ---------------------------------------------------------------------------
 * `championStatBase` is the ONLY place the attribute term is computed. The sim
 * (stats/statPipeline.ts), the roguelite mob curve (sim/mobs.ts), the shop
 * preview and the champ-select / codex stat tables all read through it, so a
 * champion's "生命 600 (+43.75/級)" is one number with one definition. Anything
 * that reads `def.baseStats[stat]` raw is showing the w3x hull, not the hero —
 * that is the stale-reader failure #248 was told to design against.
 *
 * A champion doc with NO `attributes` block (the skeleton test content, a
 * hand-authored fixture) contributes nothing and reduces to the pre-#248
 * `base + growth·(level−1)` law exactly.
 */
import type { CombatEnvKey, CombatEnvMultipliers } from "../combatEnv";
import { DEFAULT_COMBAT_ENV } from "../combatEnv";
import { Stat, type StatBlock } from "./statTypes";

/** 主屬性 — which of the three the hero's identity is built on. */
export type PrimaryAttr = "STR" | "AGI" | "INT";

/** Where a champion's attributes came from — provenance, not a TODO. */
export type AttributeSource = "w3x" | "authored";

/** The 三圍 block on a champion doc. Growths are PER LEVEL beyond 1. */
export interface ChampionAttributes {
  readonly str: number;
  readonly agi: number;
  readonly int: number;
  readonly strGrowth: number;
  readonly agiGrowth: number;
  readonly intGrowth: number;
  readonly primary: PrimaryAttr;
  /**
   * "w3x" — resolved from the source map (walking the unit's `base` chain into
   * the Blizzard stock tables when the map never overrode the field).
   * "authored" — no w3x source exists (godie-zombiex, sela, thorne); the
   * numbers were chosen to reproduce that champion's shipped level-1 sheet.
   */
  readonly source: AttributeSource;
}

/** The three attribute slots, as they appear on `ChampionAttributes`. */
export type AttrKey = "str" | "agi" | "int";

/** 力 / 敏 / 智, in the ONE order every surface iterates them in. */
export const ATTR_KEYS: readonly AttrKey[] = ["str", "agi", "int"];

/**
 * 繁中 labels for the three. Lives here, next to the model, so the shop panel,
 * the 三選一 card and the codex can never disagree about which is which.
 */
export const ATTR_LABEL: Readonly<Record<AttrKey, string>> = {
  str: "力量",
  agi: "敏捷",
  int: "智慧",
};

/**
 * A per-ENTITY 三圍 bonus earned during a match (#260 — the 能力屬性強化 三選一).
 *
 * WHY THIS IS NOT A `StatModifier` LIST. An attribute is not a stat: one point
 * of STR feeds maxHealth, healthRegen AND ad, and one point of AGI feeds armor
 * additively but attack speed MULTIPLICATIVELY on the champion's own base
 * (`base × (1 + coef·AGI)`, see the note above). Baking a bought attribute into
 * equivalent stat modifiers would therefore need the champion's authored base
 * and the live combat-env coefficients AT ATTACH TIME, and would go stale the
 * moment an operator retunes `agiToAttackSpeed`. Carrying the ATTRIBUTE instead
 * keeps `championStatBase` the single definition of 三圍 → 數值 — the same seam
 * #248 built — so a bought point behaves exactly like an innate one.
 */
export interface AttrBonus {
  str: number;
  agi: number;
  int: number;
}

export function zeroAttrBonus(): AttrBonus {
  return { str: 0, agi: 0, int: 0 };
}

export const NO_ATTR_BONUS: AttrBonus = { str: 0, agi: 0, int: 0 };

/**
 * 三圍 a **ModifierSource** grants while it is attached — an item's 「力敏智+30」.
 *
 * Partial and readonly on purpose. Partial because 朗基努斯之槍 grants 力/敏 and
 * says nothing about 智, and an explicit `int: 0` would be a number somebody
 * later "fixes"; readonly because it is handed straight off the shared
 * `ItemDef` in the content registry — TWO champions holding the same weapon
 * read the same object, so a mutating helper here would corrupt the catalogue
 * for everybody.
 */
export type AttrGrant = Readonly<Partial<Record<AttrKey, number>>>;

/**
 * WHICH 三圍 a reader means (and the source map distinguishes the two ITSELF —
 * this is not a GGD invention).
 *
 * `war3mapMisc`-era Blizzard JASS spells it `GetHeroStatBJ(stat, unit, includeBonuses)`
 * and the extracted spell dumps under `tools/w3x-import/out/GoDieEX22s/jass-spells/`
 * use BOTH values on purpose:
 *
 *   · `…,true)`  — 「總力量」: base + everything equipped. 87 of the extracted
 *     call sites are damage formulas (`I2R(GetHeroStatBJ(0,u,true))*9.` and
 *     friends), i.e. what the weapon's own tooltip means by 總.
 *   · `…,false)` — base ONLY, no items. This is the form 蒼月潮 07-00 獸化心靈's
 *     hidden ceiling uses (`GetHeroStatBJ(1,GetKillingUnit(),false)<$8C` — 120),
 *     and it is the reason an item CANNOT switch off that innate.
 *
 * GGD's two accumulators line up with WC3's two exactly, and that is why the
 * mapping is a definition rather than a guess:
 *   · `ChampionComp.attrBonus`  ← 三選一 picks and `grantAttribute` — WC3
 *     `ModifyHeroStat`, which moves the hero's **base** stat. → `"base"`.
 *   · `ModifierSource.attributes` ← equipment. → only in `"total"`.
 */
export type AttrBasis = "base" | "total";

/**
 * BOUNDS for one authored 三圍 grant on one item (`item@1.attributes.*`).
 *
 * Floor 0: every 三圍 line in the owner's 49 legendary weapons is a GRANT
 * (力敏智+30, 力量+12). A negative one is expressible in WC3 and may well be
 * wanted for a cursed item later, but it must not arrive by accident: attack
 * speed is the one MULTIPLICATIVE row (`base × (1 + agiToAttackSpeed·AGI)`), so
 * a sign error big enough to drive total AGI below −50 silently drops a
 * champion's attack speed to (and past) zero with nothing on screen to explain
 * it. Raising the floor is one number and a guard change, knowingly.
 *
 * Ceiling {@link ATTR_GRANT_MAX}: the mis-parse this catches is a raw w3x
 * ability field or a ×100 typo — 「力敏智+30」 typed as 3000 would, at the
 * SHIPPED coefficients, hand one item +69,000 raw max health before the
 * `maxHealth` env multiplier. 500 is ~16× the largest authored line, so it
 * cannot bite a real design, and it is far below any un-normalised number.
 */
export const ATTR_GRANT_MIN = 0;
export const ATTR_GRANT_MAX = 500;

/**
 * `base` + every attached source's grant, as one {@link AttrBonus}.
 *
 * Pure and allocation-free when `grants` is empty — which is every champion in
 * every match that has not equipped one of the (currently two) items that grant
 * 三圍, so `recomputeStats` pays nothing for a feature it is not using.
 */
export function addAttrGrants(base: AttrBonus, grants: readonly AttrGrant[]): AttrBonus {
  if (grants.length === 0) return base;
  const out: AttrBonus = { str: base.str, agi: base.agi, int: base.int };
  for (const g of grants) {
    for (const k of ATTR_KEYS) {
      const v = g[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] += v;
    }
  }
  return out;
}

/** How one stat draws on one attribute. */
export interface AttrStatSource {
  readonly attr: AttrKey;
  /** the combat-env coefficient key that scales it (operator-tunable) */
  readonly key: CombatEnvKey;
  /**
   * "add"       — `base + coef · attr`  (eight of the nine)
   * "scaleBase" — `base × (1 + coef · attr)`  (attack speed only; see above)
   */
  readonly mode: "add" | "scaleBase";
}

/**
 * Stat → attribute derivation. EXHAUSTIVE: a stat absent from this table has no
 * attribute source at all and keeps its authored `baseStats`/`growth` numbers.
 *
 * `mr` JOINED THIS TABLE ON 2026-07-30 (GH#221) and its arrival is the whole
 * point of that task: `combat/damage.ts mitigate()` has always subtracted
 * `Stat.MagicResist` from every non-physical packet, but 魔抗 had no attribute
 * source, so a caster's own 智慧 bought him nothing defensively. It is the
 * second owner-designed axis here (with `ap`), not an imported one — see
 * ATTRIBUTE_ENV_DEFAULTS in ../combatEnv.ts.
 */
export const ATTR_STAT_SOURCE: Partial<Record<Stat, AttrStatSource>> = {
  [Stat.MaxHealth]: { attr: "str", key: "strToMaxHealth", mode: "add" },
  [Stat.HealthRegen]: { attr: "str", key: "strToHealthRegen", mode: "add" },
  [Stat.AttackDamage]: { attr: "str", key: "strToAttackDamage", mode: "add" },
  [Stat.Armor]: { attr: "agi", key: "agiToArmor", mode: "add" },
  // ⭐ owner 2026-08-22：「每一點**力量** 額外增加 **0.1% 暴擊率**」
  //    「每一點**敏捷** 額外增加 **0.02% 迴避率**」
  // ⚠️ 兩格都是 0..1 的比率（0.001 = 0.1%），⛔ 不是百分點 —— 出貨係數住
  //    `content/config/combat-env.json`，這裡只宣告「哪個屬性餵哪個屬性值」。
  [Stat.CritChance]: { attr: "str", key: "strToCritChance", mode: "add" },
  [Stat.Evasion]: { attr: "agi", key: "agiToEvasion", mode: "add" },
  [Stat.AttackSpeed]: { attr: "agi", key: "agiToAttackSpeed", mode: "scaleBase" },
  [Stat.MaxMana]: { attr: "int", key: "intToMaxMana", mode: "add" },
  [Stat.ManaRegen]: { attr: "int", key: "intToManaRegen", mode: "add" },
  [Stat.AbilityPower]: { attr: "int", key: "intToAbilityPower", mode: "add" },
  [Stat.MagicResist]: { attr: "int", key: "intToMagicResist", mode: "add" },
};

/** The minimum a caller has to hold to be answered — not the full ChampionDef. */
export interface AttributeCarrier {
  readonly baseStats: Partial<StatBlock>;
  readonly growth: Partial<StatBlock>;
  readonly attributes?: ChampionAttributes;
  /**
   * 身體放大倍數 (GH#252)。這個檔案的任何一個函式都**不讀它** —— 它宣告在這裡
   * 只是因為 `ui/championSheet.ts` 拿 `AttributeCarrier` 當「一張英雄卡」的型別,
   * 而那張卡要把體型餵進 `finalizeStat` 的 `rangeScale`,否則面板印的攻擊距離
   * 是卡面值而伺服器給的是放大過的(#125)。缺 = 1.0。
   */
  readonly bodyScale?: number;
}

/*
 * 全英雄「初始生命 +300」(#265) 不在這個檔案裡 —— 它是 sim/baseBonus.ts 的
 * `DEFAULT_BASE_BONUS`,由 `finalizeStat` 在**環境倍率之後**加上去。
 *
 * 為什麼搬走。v0.9.8 把它放在這裡(倍率之前),於是 `maxHealth: 3.0` 也把它乘了
 * 三倍:後台寫 300,玩家實際拿到 900。owner 2026-07-28 定的規則是
 *「初始HP/MP/AP/AD/...增加數值也要放到後台設定 並且不參與倍率計算」——
 * 倍率放大英雄自己掙來的血量,不放大這份系統贈禮。
 *
 * 順帶消失的是 `ChampionStatBaseOpts.championHealthBonus`。它本來是給
 * sim/mobs.ts 的退出口(#244:英雄的數值調整不得移動肉鴿小怪的曲線)。加成搬到
 * `recomputeStats` 之後,那條界線變成**結構性的**:`recomputeStats` 沒有
 * ChampionComp 就提早 return,而小怪從來不走它 —— 所以不再需要一個旗標來說
 * 「這隻不是英雄」。
 */

/** STR/AGI/INT at `level` (level 1 = the base value, no growth applied). */
export function attributeAtLevel(a: ChampionAttributes, which: AttrKey, level: number): number {
  const lv = Math.max(1, level);
  switch (which) {
    case "str":
      return a.str + a.strGrowth * (lv - 1);
    case "agi":
      return a.agi + a.agiGrowth * (lv - 1);
    case "int":
      return a.int + a.intGrowth * (lv - 1);
  }
}

/**
 * THE champion's EFFECTIVE attribute: the doc's innate value at `level` plus
 * everything bought this match ({@link AttrBonus}).
 *
 * The `bonus` term is added even when the champion doc carries NO `attributes`
 * block. A doc-less champion (skeleton fixtures, hand-authored test content) has
 * an innate 0 in all three, and a bought point is a per-ENTITY fact that does not
 * depend on the doc having one — silently discarding it would make 375 gold buy
 * nothing on exactly the champions whose sheets nobody hand-verified. With a
 * zero bonus this is `attributeAtLevel` verbatim, so nothing pre-#260 moves.
 */
export function championAttribute(
  def: AttributeCarrier,
  which: AttrKey,
  level: number,
  bonus: AttrBonus = NO_ATTR_BONUS,
): number {
  const innate = def.attributes === undefined ? 0 : attributeAtLevel(def.attributes, which, level);
  return innate + bonus[which];
}

/**
 * The champion's BASE value for `stat` at `level`, attributes included and
 * combat-env coefficients applied — i.e. everything before item/augment/buff
 * modifiers and before the stat's own combat-env multiplier and clamp.
 *
 * This is the number a stat table should show as 基礎, and the number
 * `recomputeStats` starts from.
 */
export function championStatBase(
  def: AttributeCarrier,
  stat: Stat,
  level: number,
  env: CombatEnvMultipliers = DEFAULT_COMBAT_ENV,
  /**
   * Attributes BOUGHT this match (#260). Defaults to zero, so every pre-#260
   * caller — champ-select, the codex, the mob curve — is byte-identical.
   */
  bonus: AttrBonus = NO_ATTR_BONUS,
): number {
  const authored = (def.baseStats[stat] ?? 0) + (def.growth[stat] ?? 0) * (Math.max(1, level) - 1);
  const src = ATTR_STAT_SOURCE[stat];
  if (src === undefined) return authored;
  // NOTE: no early-out on `def.attributes === undefined` any more. A champion
  // with no 三圍 block still has to be able to SPEND 375 gold on one — see
  // `championAttribute`, which answers 0 + bonus for exactly that case.
  if (def.attributes === undefined && bonus[src.attr] === 0) return authored;

  const coef = env[src.key];
  const factor = typeof coef === "number" && Number.isFinite(coef) ? coef : 0;
  const value = championAttribute(def, src.attr, level, bonus);
  return src.mode === "add" ? authored + factor * value : authored * (1 + factor * value);
}

/**
 * The PER-LEVEL increment of `stat`, attributes included — the "每級成長" a stat
 * table shows. Every row of the model is linear in level (attributes grow
 * linearly and both derivation modes are affine in the attribute), so the exact
 * increment is simply base(2) − base(1) and there is no separate formula to
 * keep in sync.
 */
export function championStatGrowth(
  def: AttributeCarrier,
  stat: Stat,
  env: CombatEnvMultipliers = DEFAULT_COMBAT_ENV,
): number {
  return championStatBase(def, stat, 2, env) - championStatBase(def, stat, 1, env);
}

/** True when `stat` gets any of its value from an attribute on this champion. */
export function isAttributeDerived(def: AttributeCarrier, stat: Stat): boolean {
  return def.attributes !== undefined && ATTR_STAT_SOURCE[stat] !== undefined;
}
