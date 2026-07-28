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
 *
 * ---------------------------------------------------------------------------
 * THREE ADDITIVE LAYERS, IN THIS ORDER
 * ---------------------------------------------------------------------------
 * `base` above is itself `baseStats + growth·(level−1)`, so the full law is
 *
 *     stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
 *
 * plus, for maxHealth ONLY, the flat 全英雄 +300 the owner asked for in #265
 * (`CHAMPION_BASE_HEALTH_BONUS` below — level-independent, so it never touches
 * the per-level growth), then item/augment/buff modifiers (statPipeline.ts),
 * then the stat's own combat-env ×factor, then the clamp. THREE additive
 * sources is exactly the shape where a reader silently applies two of the
 * three, which is why the whole sum is computed here and only here.
 *
 * `growth` was NOT deleted when the attributes landed. The owner ruled on it
 * directly —「growth 區塊就是重複來源 => 本來就可以重複沒有衝突」— because the
 * two sources do not represent the same thing: `attributes.*Growth` carries the
 * w3x-faithful part of the curve, `growth` stays the per-hero designer knob laid
 * on top, so a hero's progression is not locked to his three attributes.
 * `growth.mr` is the one row where the attribute term is zero rather than the
 * one row that survived a cull: Warcraft III has no magic-resistance attribute,
 * so 魔抗 is growth-only by nature.
 *
 * SEVEN of those eight coefficients are IMPORTED, not chosen. The source map
 * ships its own gameplay-constants table — `war3mapMisc.txt`, extracted to
 * `tools/w3x-import/out/GoDieEX22s-src/raw/war3mapMisc.txt` — and it OVERRIDES
 * four of Blizzard's: StrHitPointBonus 25→23, StrRegenBonus 0.05→0.04,
 * AgiDefenseBonus 0.30→0.15, IntRegenBonus 0.05→0.07. The one field the map
 * does not touch, AgiAttackSpeedBonus, falls back to Blizzard's 0.02. The
 * per-coefficient table with every file and field name is on
 * `ATTRIBUTE_ENV_DEFAULTS` in ../combatEnv.ts; it is the single provenance
 * record and attributeCoefficients.test.ts re-reads both files to enforce it.
 *
 * Only `intToAbilityPower` is the owner's own design: Warcraft III has no 法強
 * attribute, so 智慧→AP ×1 has no upstream source and is his to re-tune.
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

/** How one stat draws on one attribute. */
export interface AttrStatSource {
  readonly attr: AttrKey;
  /** the combat-env coefficient key that scales it (operator-tunable) */
  readonly key: CombatEnvKey;
  /**
   * "add"       — `base + coef · attr`  (seven of the eight)
   * "scaleBase" — `base × (1 + coef · attr)`  (attack speed only; see above)
   */
  readonly mode: "add" | "scaleBase";
}

/**
 * Stat → attribute derivation. EXHAUSTIVE: a stat absent from this table has no
 * attribute source at all and keeps its authored `baseStats`/`growth` numbers.
 * `mr` is deliberately absent — Warcraft III has no magic-resistance attribute,
 * so 魔抗 is a growth-only stat. That is a property of WC3, not an omission.
 */
export const ATTR_STAT_SOURCE: Partial<Record<Stat, AttrStatSource>> = {
  [Stat.MaxHealth]: { attr: "str", key: "strToMaxHealth", mode: "add" },
  [Stat.HealthRegen]: { attr: "str", key: "strToHealthRegen", mode: "add" },
  [Stat.AttackDamage]: { attr: "str", key: "strToAttackDamage", mode: "add" },
  [Stat.Armor]: { attr: "agi", key: "agiToArmor", mode: "add" },
  [Stat.AttackSpeed]: { attr: "agi", key: "agiToAttackSpeed", mode: "scaleBase" },
  [Stat.MaxMana]: { attr: "int", key: "intToMaxMana", mode: "add" },
  [Stat.ManaRegen]: { attr: "int", key: "intToManaRegen", mode: "add" },
  [Stat.AbilityPower]: { attr: "int", key: "intToAbilityPower", mode: "add" },
};

/** The minimum a caller has to hold to be answered — not the full ChampionDef. */
export interface AttributeCarrier {
  readonly baseStats: Partial<StatBlock>;
  readonly growth: Partial<StatBlock>;
  readonly attributes?: ChampionAttributes;
}

/**
 * 全英雄「初始生命 +300」(#265). Owner:「所有英雄初始 HP 增加300，但是生命倍率
 * 4=>3」—— 兩句是同一次調整的兩半，所以 +300 必須加在 **倍率之前**：
 *
 *     final = (w3x_hp + strToMaxHealth·STR + 300 + growth·(L−1)) × env.maxHealth
 *
 * WHY BEFORE THE MULTIPLIER, NOT AFTER. 若加在倍率後（`base×3 + 300`），中位英雄
 * 會從 2164 掉到 1923 —— 比調整前更脆，和「增加」兩個字相反。加在倍率前是
 * 2164 → 2523 (+17%)，而 4→3 的削弱正好被 +300 抵掉大半，這才是 owner 把兩句話
 * 講在一起的意思。
 *
 * WHY IT IS A FLAT TERM AND NOT A HIGHER MULTIPLIER. 倍率是等比的：它把「基礎
 * 血量本來就很低」的英雄一起壓在地板上。實測 w3x 卡片的 `baseStats.maxHealth`
 * 從 −450（U011 死亡老二）到 4977（H02N 打我阿笨蛋）跨兩個數量級，最脆的
 * 克勞薩先生在 ×4 之下只有 316 點血。+300 這個平移項專門救的就是他們：
 * 316 → 1137，而 20000 血的 H02N 只是從 20000 降到 15900。壓縮差距，不是放大。
 *
 * WHY IT LIVES HERE. `championStatBase` 是全專案唯一算「這個英雄的基礎數值」的
 * 地方（sim 的 recomputeStats、客戶端 championSheet 的選角/圖鑑表、商店預覽、
 * admin quickApproval 全部走這條）。放在這裡，#125「顯示的數字必須是最終值」
 * 自動成立；放在 recomputeStats 就只有戰鬥會漲，選角畫面會少 900 點。
 */
export const CHAMPION_BASE_HEALTH_BONUS = 300;

/** Opt-outs for `championStatBase`. Omitted = the full champion sheet. */
export interface ChampionStatBaseOpts {
  /**
   * false = 不要加 `CHAMPION_BASE_HEALTH_BONUS`。只有 **小兵借用英雄卡當頭像**
   * 的那條路會傳 false（sim/mobs.ts 的 pre-#244 legacy tier）。#244 的規則是
   * 「英雄的數值調整不得移動肉鴿小怪的曲線」—— 喪標麥可同時是可選英雄和 #215
   * 的殭屍，所以英雄加血必須止步於這條界線，否則就把 #244 拆掉的耦合裝回去。
   */
  readonly championHealthBonus?: boolean;
}

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
  opts: ChampionStatBaseOpts = {},
): number {
  const authored = (def.baseStats[stat] ?? 0) + (def.growth[stat] ?? 0) * (Math.max(1, level) - 1);
  // #265 全英雄初始生命 +300。加在 authored 上（倍率之前、成長之外），所以它
  // 是一次性的平移而不是每級都拿一次 —— championStatGrowth 是 base(2)−base(1)，
  // 常數項在相減時抵銷，每級成長完全不受影響。
  const flat =
    stat === Stat.MaxHealth && opts.championHealthBonus !== false ? CHAMPION_BASE_HEALTH_BONUS : 0;
  const src = ATTR_STAT_SOURCE[stat];
  const attrs = def.attributes;
  if (src === undefined || attrs === undefined) return authored + flat;

  const coef = env[src.key];
  const factor = typeof coef === "number" && Number.isFinite(coef) ? coef : 0;
  const value = attributeAtLevel(attrs, src.attr, level);
  // `scaleBase`（只有攻速）永遠不是 MaxHealth，所以 `flat` 在那條路上恆為 0；
  // 寫成 `authored + flat` 只是讓兩條路的形狀一致，不是額外的分支。
  return src.mode === "add"
    ? authored + flat + factor * value
    : (authored + flat) * (1 + factor * value);
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
