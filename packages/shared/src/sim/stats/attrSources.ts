/**
 * attrSources — 裝備給的 三圍, and THE definition of 「總力量／總敏捷／總智慧」.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HOLE THIS FILLS
 *
 * Two of the owner's 49 legendary weapons grant primary attributes outright —
 * 四魂之玉 (godie-i00z) 「力敏智+30」 and 朗基努斯之槍 (godie-i018) 「力量+12
 * 敏捷+12」 — and `item@1` had no way to say it. 力/敏/智 are NOT members of
 * `Stat` (see stats/statTypes.ts); they are the champion attribute model
 * (stats/attributes.ts), and an attribute is not a stat because ONE point of
 * STR feeds maxHealth AND healthRegen AND ad, while one point of AGI feeds
 * armor ADDITIVELY and attack speed MULTIPLICATIVELY off the champion's own
 * base. `StatModifier` cannot carry that, and faking it as a bundle of
 * equivalent stat modifiers would freeze the live combat-env coefficients at
 * equip time — the exact staleness `AttrBonus` was created to avoid.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE GRANT RIDES THE **SOURCE** AND NOT `ChampionComp.attrBonus`
 *
 * `attrBonus` is an ACCUMULATOR: `applyAttrPick` and `grantAttribute` both `+=`
 * into it, and nothing subtracts except `attrGrantExpirySystem` (timed grants
 * only). So "add 30 on equip" has no matching "subtract 30 on sell" that is
 * safe: two copies bought and one sold, a 變身 re-resolve, an undo-of-a-sell
 * (economy/shop.ts) — every one of them is a place to double-add or
 * double-subtract, and the failure is SILENT (you keep the attribute after
 * selling the item).
 *
 * Riding the `ModifierSource` makes the whole class of bug unreachable instead
 * of merely tested-for. `detachSource` already removes an item's payload; the
 * fold below simply stops seeing it. That is the same property `modifiers`,
 * `auras`, `vision` and `flight` already have, and it is why adding this took
 * ONE forward in `economy/itemSource.ts` rather than an unequip hook.
 *
 * ⚠️ AND IT SURVIVES 變身 FOR FREE. `ChampionFormSystem.setBody` calls
 * `syncItemSources`, which mutates `src.modifiers` IN PLACE and never touches
 * `src.attributes` — so a transform can neither drop nor duplicate the grant.
 * `itemAttributes.test.ts` pins both directions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 「總」 vs 「基礎」 — TWO READINGS, AND THE SOURCE MAP USES BOTH ITSELF
 *
 * Blizzard's `GetHeroStatBJ(stat, unit, includeBonuses)` takes the answer as a
 * PARAMETER, and the extracted spells under
 * `tools/w3x-import/out/GoDieEX22s/jass-spells/` use both values:
 *
 *   · `GetHeroStatBJ(0,u,true)*9.` — damage formulas. 「總力量」 = with items.
 *   · `GetHeroStatBJ(1,GetKillingUnit(),false)<$8C` — 蒼月潮 07-00 獸化心靈's
 *     hidden 120-AGI ceiling. Base ONLY: an item cannot switch off that innate.
 *
 * GGD's two accumulators line up with WC3's two exactly:
 *   `ChampionComp.attrBonus` ← 三選一 picks + `grantAttribute` ≡ `ModifyHeroStat`,
 *   which moves the hero's BASE stat.   `ModifierSource.attributes` ← equipment.
 *
 * So {@link AttrBasis} is not a preference this file picked — it is the axis the
 * source data already has, and every caller states which one it means.
 *
 * PURITY (sim/purity.test.ts): no rng, no clock, no trig, no `**`. Iteration is
 * over `StatsComp.sources`, an ARRAY in attach order, so no Map order leaks in.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ModifierSource } from "./modifiers";
import {
  addAttrGrants,
  championAttribute,
  NO_ATTR_BONUS,
  type AttrBasis,
  type AttrBonus,
  type AttrGrant,
  type AttrKey,
} from "./attributes";
import { Champions } from "../content/registry";

/**
 * Every ACTIVE source's 三圍 grant on this stat block, in attach order.
 *
 * Empty for every champion who is not carrying one of the (currently two)
 * items that grant attributes, and {@link addAttrGrants} short-circuits on an
 * empty list — so the feature costs one array allocation per recompute and no
 * arithmetic at all when unused.
 *
 * ⚠️ EXPIRY IS CHECKED THE SAME WAY `computeStat` CHECKS IT (`expiresAtTick <=
 * tick`). A timed buff that granted 三圍 would otherwise keep paying for the
 * one tick between lapse and `buffExpirySystem` sweeping it — a one-frame lie
 * that no panel would ever show.
 */
export function sourceAttrGrants(
  sources: readonly ModifierSource[],
  tick: number,
): AttrGrant[] {
  const out: AttrGrant[] = [];
  for (const src of sources) {
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    if (src.attributes !== undefined) out.push(src.attributes);
    // 疊層 —— the DYNAMIC sibling (甘豆腐之袍 godie-i03f, 「每殺死一名英雄可以額外
    // 獲得 10點智慧，上限 160」). Written by `effects/grantAttribute.ts` under
    // `store: "source"`; folded HERE, next to the static grant, so 「買來就有的
    // 30 力」 and 「打出來的 160 智」 are the same number to everything downstream
    // — the stat pipeline, the shop preview and the codex all read this one
    // list. The expiry skip above covers both, and the ONE line that makes
    // 「賣掉還留著」 unreachable is that `detachSource` removes `src` entirely.
    if (src.attrEarned !== undefined) out.push(src.attrEarned);
  }
  return out;
}

/**
 * The champion's 三圍 BONUS (everything on top of the doc's innate + growth)
 * under `basis`.
 *
 *   · `"base"`  — `ChampionComp.attrBonus` verbatim: the 能力屬性強化 picks and
 *     every `grantAttribute` payout. WC3 `ModifyHeroStat` / `GetHeroStatBJ(…,false)`.
 *   · `"total"` — that plus every equipped source's grant. WC3 `…,true)`.
 *
 * Returns {@link NO_ATTR_BONUS} for a body with no `ChampionComp` (a mob, a
 * summon, a bare test entity): attributes are a CHAMPION model, and answering
 * zero is what `championStatBase` already does for such a body.
 */
export function championAttrBonus(
  world: SimWorld,
  id: EntityId,
  basis: AttrBasis,
): AttrBonus {
  const champ = world.champion.get(id);
  if (!champ) return NO_ATTR_BONUS;
  if (basis === "base") return champ.attrBonus;
  const sc = world.stats.get(id);
  if (!sc) return champ.attrBonus;
  return addAttrGrants(champ.attrBonus, sourceAttrGrants(sc.sources, world.tick));
}

/**
 * THE live 三圍 number for `id` — innate + per-level growth + `basis`'s bonus.
 * This is what 「總敏捷」 means on a weapon's 效能 line, what the condition
 * editor's 力量/敏捷/智慧 dropdown compares, and what `grantAttribute`'s ceiling
 * measures (at `"base"`, faithfully to the JASS).
 *
 * A champion whose doc carries no `attributes` block contributes 0 innate and
 * still counts its bonus — the same rule `championAttribute` states.
 */
export function liveAttribute(
  world: SimWorld,
  id: EntityId,
  attr: AttrKey,
  basis: AttrBasis,
): number | null {
  const champ = world.champion.get(id);
  if (!champ) return null;
  const def = Champions.tryGet(champ.championId);
  const bonus = championAttrBonus(world, id, basis);
  if (def === undefined) return bonus[attr];
  return championAttribute(def, attr, champ.level, bonus);
}
