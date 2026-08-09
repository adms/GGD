/**
 * itemSource — THE one place an equipped item becomes a `ModifierSource`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * `economy/shop.ts` attaches an item on THREE paths (buy, undo-of-a-sell, free
 * grant) and its own comment already says what a missed one costs: 「an item
 * that projects an aura when bought but not when drafted is a bug that only
 * shows up on the 三選一 path」. That warning was written because it had already
 * happened once, and it was addressed by copy-pasting the same object literal
 * three times — which is the same bet, taken again.
 *
 * `apps/client/src/ui/panels/statPreview.ts` builds the SAME source twice more
 * (the shop's live 「買了會變成怎樣」 preview and the current-block rebuild), so
 * the real count is five, across two packages. The preview is the surface #106
 * exists for — 「a live stat preview that must not lie」 — and a preview that
 * builds the source by hand is a preview that lies the moment the source grows
 * a field.
 *
 * So: ONE builder. Every caller passes (world, holder, itemId, slot, def) and
 * gets the finished source. Adding a field to `ItemDef` is one edit here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE 職業限定閘 IS RESOLVED HERE, AT EQUIP TIME — and that is a real choice
 *
 * `ItemDef.modifiers` entries may carry `requires` (貫雷槍's 「近戰攻擊距離+4；
 * 遠戰攻擊距離+2」). The alternative was to teach `stats/statPipeline.ts` to
 * evaluate the gate inside `computeStat`, which runs per stat per source per
 * modifier on every dirty recompute. Resolving here instead means:
 *
 *   · the hot aggregation loop learns nothing new — `ModifierSource.modifiers`
 *     stays a plain, already-resolved `StatModifier[]`;
 *   · every reader of that array (digest, snapshot, stat preview, codex) sees
 *     the SAME numbers the pipeline folds, with no second concept to know about;
 *   · `content/schema/item.ts` can keep the authoring field on the ITEM's copy
 *     of the modifier schema instead of on the shared `zStatModifier`, so the
 *     editor never offers a 「限近戰」 dropdown on an ability buff, where it
 *     would be a tautology.
 *
 * ⚠️ THE COST, AND WHY IT IS PAID RATHER THAN IGNORED: equip-time resolution
 * FREEZES the answer, and 變身 (#249) changes the answer. MEASURED on the
 * shipped tree (119 champion docs, 52 transform links): THREE pairs really do
 * cross the melee/ranged line — godie-e007↔godie-ewar, godie-n01b↔godie-nman,
 * godie-o02l↔godie-ofar. So a 貫雷槍 bought in the base body would have kept the
 * wrong bonus for the whole transform. {@link syncItemSources} closes that, and
 * `systems/ChampionFormSystem.setBody` — the SOLE writer of the body — calls it,
 * exactly as it already calls `syncAbilityPassives` for the `whileForm` gate.
 * This keeps the item gate's semantics identical to the HOOK gate's, which
 * `content/requirement.ts` documents as 「evaluated at fire time, so a 變身
 * changes what your weapons do」.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 套裝 RIDES THE SAME SEAM
 *
 * A 套裝 bonus (「同時裝備死之王長槍、意志、神盾…」) is a property of the WHOLE
 * inventory, not of one slot, so it cannot live on any item's own source — three
 * pieces each carrying the reward is +300 % where the card says +100 %. It is
 * ONE extra `item-set:<id>` source, reconciled by `economy/itemSets.ts`
 * `syncItemSetSources`, which {@link attachItemSource} and
 * {@link detachItemSource} call. That is the whole wiring: every equip/unequip
 * site in the game already goes through those two.
 *
 * PURITY (sim/purity.test.ts): no rng, no clock, no trig, no `**`. The only
 * iteration is over a fixed-length inventory array by index, so no Map order
 * leaks in.
 */
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ItemDef } from "../content/defs";
import type { ModifierSource } from "../stats/modifiers";
import { resolveGatedModifiers } from "../content/requirement";
import { attachSource, detachSource } from "../stats/statPipeline";
import { sourceGrants } from "../stats/sourceGrants";
import { Items } from "../content/registry";
import {
  addAttrGrants,
  zeroAttrBonus,
  type AttrBonus,
  type AttrGrant,
} from "../stats/attributes";
import { syncItemSetSources } from "./itemSets";

/**
 * THE source id for an item sitting in a slot. Both halves matter: the ITEM so
 * a tooltip can name it, and the SLOT so two copies of a stackable never share
 * one source (and so `detachSource` can remove exactly the one that was sold).
 */
export function itemSourceId(itemId: ItemId, slot: number): string {
  return `item:${itemId}#${slot}`;
}

/**
 * The finished `ModifierSource` for `itemId` equipped by `holder` in `slot`.
 *
 * `modifiers` is GATE-RESOLVED against the holder; `hooks` and `auras` are
 * forwarded verbatim because their own `requires` is evaluated later, per fire,
 * by `effects/hooks.ts` (an aura-projected hook belongs to the RECIPIENT, not
 * the holder — see requirement.ts).
 */
export function itemModifierSource(
  world: SimWorld,
  holder: EntityId,
  itemId: ItemId,
  slot: number,
  def: ItemDef,
): ModifierSource {
  return {
    id: itemSourceId(itemId, slot),
    kind: "item",
    modifiers: resolveGatedModifiers(world, holder, def.modifiers),
    // 三圍 (力/敏/智) rides the source BY REFERENCE and is never mutated —
    // 四魂之玉 「力敏智+30」, 朗基努斯之槍 「力量+12 敏捷+12」. The only reader is
    // `stats/statPipeline.recomputeStats`, which folds it into the champion's
    // BASE through `championStatBase`, so an item point and a 能力屬性強化 card
    // point pick up the SAME live combat-env coefficients. Forwarding here is
    // the entire wiring: sell / undo-sell / 三選一 grant / 變身 all go through
    // the source lifecycle that already exists, so 「賣掉了三圍還留著」 is
    // unreachable rather than tested-for. See `stats/attrSources.ts`.
    attributes: def.attributes,
    hooks: def.passive,
    auras: def.auras,
    // 隱形/真視 and 飛行 ride the source untouched. `sim/stealth.ts`
    // `syncVisionGrants` and `sim/flight.ts` `syncFlightGrants` each walk EVERY
    // `StatsComp.sources` entry and read these keys without caring about `kind`,
    // so forwarding here is the entire wiring — no new sim branch, and the
    // existing stacking rules (shortest stealth fade wins, largest true-sight
    // radius wins) apply to an item exactly as they do to an ability passive.
    //
    // This is the payoff of collapsing five hand-built sources into this one
    // builder: 至尊魔戒 (隱身), 晨曦之光 (看穿) and 天叢雲劍 (飛昇) went live in
    // ONE edit, and the shop preview / codex cannot drift from the sim because
    // they read the same function.
    vision: def.vision,
    flight: def.flight,
    // 傷害型別轉換 (無視防禦 / 真實傷害) rides the source untouched, for the
    // same reason `vision` / `flight` do: the ONLY reader is
    // `combat/damage.ts`'s queue drain, which walks `StatsComp.sources` and
    // reads this key without caring about `kind`. So forwarding here is the
    // entire wiring for 霸王破甲槍 / 死之王的長槍 / 惡夢魔王碎片 — no new sim
    // branch, no new stat, and the shop's live preview cannot drift from the
    // sim because both build the source through this one function.
    damageTypeOverride: def.damageTypeOverride,
    // 格擋 (奇門盾甲 / 黃金聖鬥衣 / 晨曦之光 / 殺豬刀) 與 [暴擊吸血] (天堂之劍)
    // ride the source untouched, for the same reason every field above does:
    // their ONLY readers walk `StatsComp.sources` WITHOUT caring about `kind`
    // (`combat/block.ts::blockCutFor` from the damage-queue drain;
    // `combat/critStrike.ts::rankedGrants` from the swing point and the
    // lifesteal段). No new sim branch, no new stat, no new event, and the shop's
    // live preview cannot drift from the sim because both build the source
    // through this one function.
    //
    // ⭐ 2026-08-09 (GH#299 第 2 · 6 條): 這兩格不再是道具專屬 —— 天生技被動、
    // 三選一增益卡與 `applyBuff` 的限時來源全部授予得起,而**轉發是一份**
    // (`stats/sourceGrants.ts`)。⛔ 這一行改成展開就是為了讓「誰授予得起」
    // 有且只有一張表:下一個騎在來源上的授予加進 `SourceGrantFields`,
    // 四個建構點自動全部拿到,漏掉一處就不會再是一個畫得出來卻讀不到的欄位。
    ...sourceGrants(def),
  };
}

/**
 * The 三圍 an INVENTORY grants, summed — 「這六格裝備一共給了我幾點力量」.
 *
 * Exists so no surface has to walk `ItemDef.attributes` by hand. The shop's
 * 三圍 panel is the caller that matters (`ui/panels/MerchantShop`): without it
 * that panel would show 天生 ＋ 屬性強化 and silently omit the 30 points the
 * player is WEARING, while the stat rows below it — computed by the real
 * pipeline — already include them. Two numbers on ONE panel that do not add up
 * is exactly the 「面板寫的和實際拿到的不一樣」 defect #125 exists against.
 *
 * ⚠️ DERIVED CLIENT-SIDE FROM THE INVENTORY, deliberately NOT a new wire field.
 * `SeatState.attrBonus` means 「這場買了幾點」 (`economy/statPath.ts`), and folding
 * equipment into it would DOUBLE-COUNT in `ui/panels/statPreview`, which
 * rebuilds the item sources through `attachItemSource` and therefore already
 * carries the grant. The client holds the item registry and the inventory is
 * already on the wire, so nothing new has to be sent — and Colyseus
 * `defineTypes` stays untouched (APPEND-ONLY, 2 spare flag bits).
 *
 * Unknown / empty slots contribute nothing. Iteration is over a fixed-length
 * array by index, so no Map order leaks in (sim/purity.test.ts).
 */
export function inventoryAttrBonus(
  items: readonly (ItemId | string | null | undefined)[] | null | undefined,
): AttrBonus {
  const grants: AttrGrant[] = [];
  // Tolerant of an absent inventory for the same reason
  // `economy/statPath.ts::attrBonusFromArray` is: a seat that has not picked a
  // champion, a legacy snapshot, a hand-built test view. Those read as 「wearing
  // nothing」, which is what they are — a panel must never throw while decoding.
  for (let i = 0; items !== null && items !== undefined && i < items.length; i++) {
    const itemId = items[i];
    if (!itemId) continue;
    const def = Items.tryGet(itemId as ItemId);
    if (def?.attributes === undefined) continue;
    grants.push(def.attributes);
  }
  return addAttrGrants(zeroAttrBonus(), grants);
}

/**
 * Equip `itemId` into `slot` on `holder`. THE only item attach in the sim.
 *
 * ⚠️ `champ.items[slot]` must ALREADY be `itemId` when this is called — the
 * 套裝 re-evaluation below reads the inventory, not the argument. Every caller
 * does that today (shop.ts buy / undo-sell / free grant, the client's shop
 * preview, the editor sandbox), and `itemSets.test.ts` drives the real shop
 * entry points rather than this function, so an inverted caller goes red there.
 */
export function attachItemSource(
  world: SimWorld,
  holder: EntityId,
  itemId: ItemId,
  slot: number,
  def: ItemDef,
): void {
  attachSource(world, holder, itemModifierSource(world, holder, itemId, slot, def));
  // 套裝 (sim/economy/itemSets.ts). Here — not in shop.ts — because the set is a
  // property of the WHOLE inventory, so it has to be re-checked on every equip,
  // and there are five equip sites across two packages. The one that would have
  // been forgotten is the 三選一 free grant, which is exactly the site shop.ts's
  // own comment says 「is a bug that only shows up on the 三選一 path」.
  syncItemSetSources(world, holder);
}

/**
 * Un-equip the item in `slot`. THE only item detach in the sim — the mirror of
 * {@link attachItemSource}, and it exists for the same reason: 套裝 has to be
 * re-checked when a piece LEAVES too, or a completed set keeps paying after the
 * player has sold a piece («賣掉還留著»).
 *
 * ⚠️ Same ordering rule, inverted: `champ.items[slot]` must ALREADY be `null`.
 *
 * Returns whatever `detachSource` returned (false = there was no such source),
 * so callers keep the old signal.
 */
export function detachItemSource(
  world: SimWorld,
  holder: EntityId,
  itemId: ItemId,
  slot: number,
): boolean {
  const removed = detachSource(world, holder, itemSourceId(itemId, slot));
  syncItemSetSources(world, holder);
  return removed;
}

/**
 * Re-resolve the 職業限定閘 on every item this champion is carrying, IN PLACE.
 *
 * Called by `ChampionFormSystem.setBody` after the body has changed. In place —
 * not detach + re-attach — for two reasons, both of which would be silent bugs:
 *
 *   · `hookLastFired` lives on the source. Re-attaching resets it, so a 變身
 *     would refresh every item's internal cooldown, i.e. transforming becomes a
 *     way to double-proc every on-hit weapon you own.
 *   · `auraOrigin` bookkeeping on units standing in this item's aura is keyed to
 *     the emitter source; dropping and re-adding it churns membership for a tick.
 *
 * A champion carrying no gated modifier lands on byte-identical arrays, so this
 * is a no-op for all 218 other item docs — but it still marks `dirty`, which is
 * correct and free: `setBody` already sets `sc.dirty = true` for the base-stat
 * change on the very same line.
 */
export function syncItemSources(world: SimWorld, holder: EntityId): void {
  const champ = world.champion.get(holder);
  const sc = world.stats.get(holder);
  if (!champ || !sc) return;
  for (let slot = 0; slot < champ.items.length; slot++) {
    const itemId = champ.items[slot];
    if (!itemId) continue;
    const def = Items.tryGet(itemId);
    if (!def) continue;
    const src = sc.sources.find((s) => s.id === itemSourceId(itemId, slot));
    if (!src) continue;
    src.modifiers = resolveGatedModifiers(world, holder, def.modifiers);
    sc.dirty = true;
  }
}
