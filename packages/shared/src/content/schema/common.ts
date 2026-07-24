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

export const zStatModifier = z
  .object({ stat: zStat, op: zModOp, value: z.number() })
  .strict();

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
  [Stat.AttackSpeed]: 2.5, // STAT_CLAMPS upper bound
  [Stat.MoveSpeed]: 5, // 1.36
  // A rate, not a count — 0..1. NOTE this band is one of the few that sits on
  // a QUALITATIVE cliff rather than merely a big number: `critChance 1` is not
  // "lots of crit", it is every auto attack critting. Task #82's AEP rescale
  // scaled two legendaries into exactly that and shipped them, so the rescale
  // now treats reaching this value as a failed run (tools/economy/
  // rescale_items.py DEGENERATE_AT), not as an under-budget item.
  [Stat.CritChance]: 1,
  // Raised from 5 knowingly (see the "one-line change" note above). A
  // modifier here is a DELTA on the 1.75 champion base, and 天堂之劍
  // (godie-i01n) is a verified 50x crit -> +48.25: its 「3%機率造成50倍傷害」
  // tooltip, its DataB1, and the stock AIcs default all agree, so it is a real
  // item, not a mis-parse. The trade is explicit — this band no longer catches
  // a bogus critDamage below 48. It is the loosest guard in the table.
  //
  // The AEP rescale prices that item at 226 AEP against a 26-AEP budget and so
  // crushes it back to ~5.5x on every run — it did exactly that once, silently
  // reverting this decision. What keeps the value alive is the RESCALE_EXEMPT
  // entry in tools/economy/rescale_items.py; if this band ever looks unused,
  // check there before lowering it.
  [Stat.CritDamage]: 50, // strongest in catalogue: 48.25 (天堂之劍)
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
 * `zStatModifier` plus the range guard above. Used by item@1 so a mis-parsed
 * stat cannot reach the store through any load path — CI `content:validate`,
 * the content-api, or game-server startup.
 */
export const zItemStatModifier = zStatModifier.superRefine((m, ctx) => {
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
});

/** Rank-aware scaling: flat + per-rank + caster stat ratios. */
export const zScaling = z
  .object({
    flat: z.number().optional(),
    perRank: z.array(z.number()).optional(),
    ratios: z.array(z.object({ stat: zStat, coeff: z.number() }).strict()).optional(),
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
