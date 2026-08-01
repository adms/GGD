/**
 * Shared Zod building blocks. These schemas are the SINGLE SOURCE OF TRUTH:
 * the same objects validate content at load time (server/scripts/content-api)
 * and drive the editor's schema-generated forms (via the zod field-walker).
 *
 * Branded-id compatibility: `zIdFor<ChampionId>()` casts a plain string schema
 * so `z.infer` yields the sim's branded id types — the parsed docs are then
 * structurally identical to the TS shapes in `sim/content/defs.ts`.
 */
import { z } from "zod";
import { Stat } from "../../sim/stats/statTypes";
import { ModOp } from "../../sim/stats/modifiers";

/** filename stem == id; dots allowed for namespaced ids like "sela.q". */
export const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

export const zId = z
  .string()
  .min(1)
  .max(64)
  .regex(ID_RE, "id must be lowercase [a-z0-9] with . _ - separators");

/** Same as zId but typed as a branded id (ChampionId, AbilityId, …). */
export const zIdFor = <T extends string>(): z.ZodType<T, z.ZodTypeDef, string> =>
  zId as unknown as z.ZodType<T, z.ZodTypeDef, string>;

/**
 * `zRef(target)` — an id that must exist in another collection. The target is
 * carried in the schema description ("ref:items" / soft "ref?:vfx") so the
 * editor walker can render a RefSelect and the REFERENCES table stays honest.
 * Soft refs only WARN when dangling (e.g. vfx that hasn't been authored yet).
 */
export const zRef = <T extends string = string>(
  target: string,
  opts?: { soft?: boolean },
  // NoInfer: without it, TS would contextually infer T = any from ZodRawShape
  // when zRef is used inside a z.object() literal without an explicit type arg.
): z.ZodType<NoInfer<T>, z.ZodTypeDef, string> =>
  zId.describe(`${opts?.soft ? "ref?" : "ref"}:${target}`) as unknown as z.ZodType<
    NoInfer<T>,
    z.ZodTypeDef,
    string
  >;

/** Parse a walker-facing description back into ref metadata. */
export function refFromDescription(
  description: string | undefined,
): { target: string; soft: boolean } | null {
  if (!description) return null;
  const m = /^(ref\??):(.+)$/.exec(description);
  if (!m) return null;
  return { target: m[2]!, soft: m[1] === "ref?" };
}

/** The four rankable/levelable slots. */
export const zCoreAbilitySlot = z.enum(["Q", "W", "E", "R"]);
/**
 * All castable slots. "EX" is the per-hero ultimate unlocked at the arena's
 * EX-unlock point (WC3 level 30, gated behind the R00R research). It is a
 * standalone single-rank ability referenced by `champion.exAbility`, never
 * embedded in champion.abilities and never in skillOrder/autoLearn.
 */
export const zAbilitySlot = z.enum(["Q", "W", "E", "R", "EX"]);
/**
 * Every slot a CAST may name — the five learned ones plus "PASSIVE", the level-1
 * 天生技. Mirrors the sim's `CastableSlot`.
 *
 * Deliberately separate from `zAbilitySlot`: the ~60 `innateKind: "active"`
 * innates are castable but NEVER rankable, so rank/unlock surfaces keep the
 * narrower enum and only cast surfaces (e.g. a hook's `abilitySlot` filter) take
 * this one. Same members as `zChampionAbilitySlot`, different question — that
 * one is "which slot does this DOC occupy", this one is "which slot may a cast
 * NAME".
 */
export const zCastableSlot = z.enum(["Q", "W", "E", "R", "EX", "PASSIVE"]);
/**
 * Every slot a champion OWNS — the five castable ones plus "PASSIVE".
 *
 * "PASSIVE" is the 天生技 / innate the source map grants at level 1 (ability
 * code `NN-00`, where NN is the hero 編號 — it lives in the WC3 hero unit's
 * non-learnable `abilities` list, NOT in `hero_abilities` with the learnable
 * NN-01..04). The w3x importer dropped it entirely, so content shipped five
 * slots for years; the owner's rule is six. Like "EX" it is a STANDALONE
 * ability@1 doc (`<championId>.passive`) referenced by the champion via
 * `passiveAbility`, never embedded in `champion.abilities` and never in
 * skillOrder — but unlike EX it is owned from level 1 and is never ranked.
 *
 * Do NOT confuse this with `ability@1.passive` (the rank-indexed permanent
 * modifier block that ANY slot may carry) or with `champion@1.passive` (a
 * legacy per-champion hook block on 7 docs). Those describe HOW an ability
 * behaves; this describes WHICH slot it occupies.
 */
export const zChampionAbilitySlot = z.enum(["Q", "W", "E", "R", "EX", "PASSIVE"]);

/**
 * Which KIND of innate a `slot: "PASSIVE"` doc is — the source map puts two
 * genuinely different things in the same level-1 slot and both the sim and the
 * HUD have to tell them apart:
 *
 *   "passive"  no cooldown, `[被動]`/`[靈氣]` in the ubertip: auras, evasion,
 *              on-hit procs, regen, per-kill growth. Modelled as the rank-1
 *              entry of `ability@1.passive.ranks` and attached as a permanent
 *              ModifierSource at spawn. `effects` is empty — never castable.
 *   "active"   a real cooldown: the WC3 D-slot nuke / summon / toggle. Has
 *              `effects` and is cast like any other ability, just unlocked at
 *              level 1 instead of being learned.
 *
 * ~51 of the 108 recovered innates are "passive", ~57 are "active".
 */
export const zInnateKind = z.enum(["passive", "active"]);

/** Planar point — the sim has no y. */
export const zVec2 = z.object({ x: z.number().finite(), z: z.number().finite() }).strict();

export const zStat = z.nativeEnum(Stat);
export const zModOp = z.nativeEnum(ModOp);

/** Partial stat table (baseStats / growth). Unknown stat keys are rejected. */
export const zPartialStatBlock = z.record(zStat, z.number()) as unknown as z.ZodType<
  Partial<Record<Stat, number>>,
  z.ZodTypeDef,
  Partial<Record<Stat, number>>
>;

/**
 * ⚠️ `from` 只對 `ModOp.PercentOf` 有意義,而 superRefine 把兩個方向都關死:
 * `percentOf` 缺 `from` 會被拒(否則 `statPipeline` 會靜默丟掉這一條 —— 一個
 * 「防禦力 +50% 攻擊力」的天生技變成完全沒有效果,而文件看起來一切正常),
 * 非 `percentOf` 帶 `from` 也會被拒(那是把一條 op 打錯的證據,留著只會讓下一次
 * 稽核讀成「設定過了」)。同一條規則 `sim/stats/modifiers.ts` 有它的執行期版本。
 */
/**
 * The bare FIELDS of a stat modifier, before any refinement.
 *
 * Exported so a collection that needs to add a field (today: `item@1`, which
 * hangs a 職業限定閘 on each entry — see `zGatedItemStatModifier`) can
 * `.extend()` it and then re-apply the SAME refinements below. `.superRefine`
 * returns a `ZodEffects`, which has no `.extend`, so without this split the only
 * way to widen the shape is to retype the rules — and two copies of
 * 「percentOf 一定要有 from」 is exactly the drift CLAUDE.md 第三守則 warns about.
 */
export const zStatModifierFields = z
  .object({
    stat: zStat,
    op: zModOp,
    value: z.number(),
    from: zStat.optional(),
    /**
     * `percentOf` 的**第二種**來源域:當下的資源,不是另一條屬性。
     * 光魔杖 (godie-i027) 「AP+ (目前MP的 5%)」 = `fromResource: "mp"`。
     *
     * 和 `from` **互斥且二選一**(下面的 refine 兩個方向都關死)。字彙沿用
     * `sim/content/condition.ts` 的 `ResourceStat`,機制寫在
     * `sim/stats/resourceStats.ts`。
     */
    fromResource: z.enum(["hp", "mp"]).optional(),
  })
  .strict();

/**
 * THE `percentOf`↔`from`/`fromResource` rule, as a reusable refinement (see the
 * header above).
 *
 * ⚠️ 三個方向都要關死,而且每一個都擋一種**安靜的**失效:
 *   · `percentOf` 兩個來源都沒有 → `statPipeline` 的第二趟根本不會把這條屬性
 *     排進去,加成是 0,而文件看起來一切正常(失敗形態 ②)。
 *   · 非 `percentOf` 帶著來源 → 那是把 op 打錯的證據,留著會讓下一次稽核
 *     讀成「設定過了」。
 *   · **兩個來源同時出現** → 「最大法力的 5%」和「目前法力的 5%」是兩個不同的
 *     數字,而管線只會採用其中一個(`from` 先判)。同時寫 = 作者以為自己拿到
 *     兩者之一,實際拿到的是另一個。
 */
export const refineStatModifierFrom = (
  m: { op: ModOp; from?: Stat; fromResource?: "hp" | "mp" },
  ctx: z.RefinementCtx,
): void => {
  const hasSource = m.from !== undefined || m.fromResource !== undefined;
  if (m.op === ModOp.PercentOf && !hasSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message:
        'op "percentOf" needs `from` (another stat) or `fromResource` ("hp"/"mp", the LIVE resource)',
    });
  }
  if (m.op !== ModOp.PercentOf && hasSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: '`from` / `fromResource` are only meaningful on op "percentOf"',
    });
  }
  if (m.from !== undefined && m.fromResource !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromResource"],
      message:
        '`from` and `fromResource` are mutually exclusive — 最大值 vs 當下值 是兩個不同的數字',
    });
  }
};

export const zStatModifier = zStatModifierFields.superRefine(refineStatModifierFrom);

/**
 * Per-stat sanity band for ONE item modifier, as an absolute magnitude.
 *
 * This exists because the w3x importer mapped item-ability rawcodes by 3-char
 * PREFIX, so a Blink item's 99999 range became `ad +99999` (godie-i062), a
 * regeneration scroll's 1000 heal became `maxHealth +20000` (godie-i035), and
 * four Chain Lightning items became `critChance 2.75..10.0`. Nothing rejected
 * those docs: `ad` and `maxHealth` have no runtime clamp at all, and
 * `STAT_CLAMPS` silently folded the crit values to a permanent 100% crit rate
 * rather than failing. The bug was worked around by hand at the curation layer
 * instead (`I4 sane values` in apps/platform/internal/curation/starter.go),
 * which is why widening the whitelist would have shipped it.
 *
 * The bands are deliberately loose — several times the strongest thing in the
 * catalogue — so they read as "this is not a stat, it is a mis-parse" rather
 * than as balance policy. They bound a SINGLE modifier, not the stacked total.
 * A legitimate item that outgrows one is a one-line change here, made
 * knowingly; that is the trade being bought.
 *
 * ITEMS ONLY. Ability buffs share `zStatModifier` and legitimately carry big
 * short-lived numbers, so they are not gated by this.
 */
export const ITEM_MODIFIER_LIMITS: Record<Stat, number> = {
  [Stat.MaxHealth]: 2500, // strongest in catalogue: 960
  [Stat.HealthRegen]: 100, // 40
  [Stat.MaxMana]: 2500, // 600
  [Stat.ManaRegen]: 50, // 7.2 flat
  [Stat.AttackDamage]: 400, // 158
  [Stat.AbilityPower]: 400, // 200
  [Stat.Armor]: 150, // 45
  [Stat.MagicResist]: 200, // 100
  [Stat.AttackSpeed]: 4.0, // STAT_CLAMPS upper bound (一般上限,owner 2026-07-28)
  [Stat.MoveSpeed]: 5, // 1.36
  // A rate, not a count — 0..1. NOTE this band is one of the few that sits on
  // a QUALITATIVE cliff rather than merely a big number: `critChance 1` is not
  // "lots of crit", it is every auto attack critting. Task #82's AEP rescale
  // scaled two legendaries into exactly that and shipped them, so the rescale
  // now treats reaching this value as a failed run (tools/economy/
  // rescale_items.py DEGENERATE_AT), not as an under-budget item.
  [Stat.CritChance]: 1,
  // Raised from 5 knowingly (see the "one-line change" note above). A modifier
  // here is a DELTA on the 1.75 champion base.
  //
  // ⚠️ CORRECTED 2026-07-30. This paragraph used to justify the band with 天堂之劍
  // (godie-i01n) being 「a verified 50x crit -> +48.25」 and called it "the
  // strongest in catalogue". BOTH HALVES ARE NOW FALSE ON THE SHIPPED TREE.
  // The w3a reading was right — 致命一擊機率 3, 傷害乘數 50 — but the owner
  // OVERRULED it on 2026-07-30:「天堂之劍 critChance 0.03 + critDamage 48.25 =>
  // 調整 6% 10 倍暴擊，不然太誇張了」. content/items/godie-i01n.json now carries
  // critChance 0.06 / critDamage 8.25 (1.75 + 8.25 = 10.0x), and the SHIPPED
  // maximum across all 219 item docs is that 8.25 — the next three crit items
  // are 斬龍刀 0.448, 龍騎士之劍 0.287, 武聖手鐲 0.286.
  //
  // THE BAND IS DELIBERATELY LEFT AT 50 ANYWAY, and that is a decision, not
  // inertia: this is a MIS-PARSE guard, not a balance statement, and the w3x
  // still genuinely contains 48.25. A re-import must be able to LOAD the source
  // value so the owner can look at it and rescale it again; a band tightened to
  // ~9 would make the importer reject real data and the rescale would look like
  // a parser bug. The cost of leaving it is unchanged and still explicit: this
  // band no longer catches a bogus critDamage below 48, and it is the loosest
  // guard in the table.
  //
  // The AEP rescale prices the ORIGINAL item at 226 AEP against a 26-AEP budget
  // and crushes it on every run — it did exactly that once, silently reverting
  // an owner decision. What keeps whatever value is authored alive is the
  // RESCALE_EXEMPT entry in tools/economy/rescale_items.py; if this band ever
  // looks unused, check there before lowering it.
  [Stat.CritDamage]: 50, // shipped max is 8.25 (天堂之劍, owner-rescaled); band sized for the w3x source value 48.25
  [Stat.CooldownReduction]: 0.45, // STAT_CLAMPS upper bound
  [Stat.Lifesteal]: 1, // a rate, not a count — 0..1
  [Stat.AttackRange]: 5,
  // A rate, not a count — 0..1, and STAT_CLAMPS additionally folds the RESOLVED
  // value to [0, 0.8]. `1` here is the band that catches a mis-parse (an
  // active's 250 range read as a dodge chance), not a balance statement; the
  // strongest authored evasion in the source map is 0.20.
  [Stat.Evasion]: 1,
};

/** Percentage ops are a multiplier delta (0.3 = +30%), so they share one band. */
export const ITEM_PERCENT_LIMIT = 3;

/**
 * The item range guard, as a reusable refinement. Applied by
 * {@link zItemStatModifier} and by `item@1`'s GATED variant
 * (`zGatedItemStatModifier` in ./item.ts) so a mis-parsed stat cannot reach the
 * store through any load path — CI `content:validate`, the content-api, or
 * game-server startup — whichever of the two shapes the doc uses.
 */
export const refineItemModifierBand = (
  m: { stat: Stat; op: ModOp; value: number },
  ctx: z.RefinementCtx,
): void => {
  // `capRaise` IS NOT A MAGNITUDE (GH#286). Its `value` is the ceiling the
  // modifier lifts the stat TO, not the amount it grants — so measuring it
  // against `ITEM_MODIFIER_LIMITS` compares two different units. The table's
  // `as` band is 4.0 *because* 4.0 is the ordinary attack-speed cap, which made
  // this guard reject exactly the item the feature exists for: owner asked for
  // 「搭配特殊條件如技能、**道具**...等效果,可以解鎖最多到 10.0」, and a
  // `capRaise as 10` item failed content validation with "outside the sane
  // range ±4" on every load path (CI, content-api, shard boot).
  //
  // Skipping the band costs nothing the band was buying: a mis-parsed
  // `capRaise 99999` cannot inflate anything, because `sim/statCaps.ts`
  // `effectiveCap` hard-clamps every raise to the table's `unlocked` value
  // (attack speed 10.0). The BAND is not the backstop here — the cap table is,
  // and it is the same one the panel reads. Proven by
  // `sim/statCapsReach.test.ts` (道具真的解得開).
  if (m.op === ModOp.CapRaise) return;
  const percent = m.op === ModOp.PercentAdd || m.op === ModOp.PercentMult;
  const limit = percent ? ITEM_PERCENT_LIMIT : ITEM_MODIFIER_LIMITS[m.stat];
  if (Math.abs(m.value) > limit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message:
        `item modifier ${m.stat} ${m.op} ${m.value} is outside the sane range ` +
        `±${limit} — a value this far out is normally a w3x import mis-map ` +
        `(an active's range/damage/heal read as a stat), not a real item`,
    });
  }
};

export const zItemStatModifier = zStatModifier.superRefine(refineItemModifierBand);

/** Rank-aware scaling: flat + per-rank + caster stat ratios. */
/**
 * 一筆 `attrRatios` 係數的絕對值上界 —— **打錯數字的守衛**,不是平衡政策。
 *
 * MEASURED, not guessed: 抽出來的 JASS(`tools/w3x-import/out/GoDieEX22s/
 * jass-spells/`)裡最大的三圍係數是 `GetHeroStatBJ(0,u,true)*9.`,也就是 9。
 * 20 給了一倍多的餘裕,同時擋住量級打錯 —— `90` 打進該寫 `9.0` 的格子在 diff
 * 裡看不出來,而在場上是一發直接抹掉一條血。
 *
 * 兩端對稱(允許負數),跟 `ratios` 一樣:一個「敏捷越高傷害越低」的詛咒是
 * 寫得出來的東西,不該由這一行否決。
 */
export const ATTR_RATIO_COEFF_MAX = 20;

export const zScaling = z
  .object({
    flat: z.number().optional(),
    perRank: z.array(z.number()).optional(),
    ratios: z.array(z.object({ stat: zStat, coeff: z.number() }).strict()).optional(),
    /**
     * 三圍係數 —— mirrors `Scaling.attrRatios` in sim/effects/effect.ts, where
     * 「為什麼力/敏/智 不能是 `ratios` 的一筆」與 `basis` 兩種讀法的來源
     * (Blizzard `GetHeroStatBJ(…, includeBonuses)`)都寫在那裡。
     *
     * `.min(1)` on the array: 同 `damage.hpPct` / `incomingPct` 的反空欄位規則
     * —— 一個空陣列解算成 0,長得像功能、實際上什麼都不做。
     */
    attrRatios: z
      .array(
        z
          .object({
            attr: z.enum(["str", "agi", "int"]),
            basis: z.enum(["base", "total"]).optional(),
            coeff: z.number().min(-ATTR_RATIO_COEFF_MAX).max(ATTR_RATIO_COEFF_MAX),
          })
          .strict(),
      )
      .min(1)
      .optional(),
  })
  .strict();

/** 0..1 scalar — one colour channel or an opacity. */
export const zUnitInterval = z.number().min(0).max(1);

/**
 * VERTEX TINT — the WC3 per-unit vertex colour, ported 1:1 (task #49).
 *
 * `[r, g, b]`, each 0..1. The value is a per-material **MULTIPLY** against the
 * diffuse texture (`out.rgb = texture.rgb * tint`), exactly like WC3's
 * `SetUnitVertexColor` / the `war3map.w3u` `uclr/uclg/uclb` art fields — it is
 * NOT an overlay, an emissive add, or a replacement colour. `[1,1,1]` is the
 * identity, and an ABSENT `tint` means the same thing (render untinted); we
 * never write `[1,1,1]` just to fill the field.
 *
 * Normalisation of the two WC3 sources (both already applied to the values in
 * `content/`, so consumers never convert):
 *   • static `war3map.w3u` `uclr/uclg/uclb` are 0..255 ints → `v / 255`
 *     (e.g. Berserker's `80` → `0.3137`). A MISSING channel is not implicitly
 *     255: it falls back to the base unit's `Units\UnitUI.slk` row, which is
 *     non-neutral for 193 of the 836 stock rows (`Ecen` ships 255/200/255).
 *   • runtime `SetUnitVertexColorBJ(u, r, g, b, transparency)` takes 0..100
 *     PERCENTAGES → `v / 100`.
 */
export const zTintRgb = z.tuple([zUnitInterval, zUnitInterval, zUnitInterval]);
export type TintRgb = z.infer<typeof zTintRgb>;

/**
 * Opacity, 0..1. `1` = fully opaque, `<1` = translucent (the renderer must put
 * the material into alpha blending); ABSENT == `1`.
 *
 * NOTE the inversion at the WC3 source: `SetUnitVertexColorBJ`'s 4th argument
 * is TRANSPARENCY, not alpha, so `alpha = (100 - transparency) / 100` — a
 * literal `0` there means fully OPAQUE and `99.99` means invisible.
 */
export const zAlpha = zUnitInterval;
