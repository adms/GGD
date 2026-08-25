/**
 * 套裝 (item sets) — 「同時裝備 A、B、C，則…」, i.e. a bonus whose condition is
 * WHAT ELSE IS IN THE BACKPACK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CARDS THIS EXISTS FOR
 *
 * owner authored the SAME clause on three legendaries — 死之王的長槍
 * (godie-i01d), 死之王的意志 (godie-i060), 死之王的神盾 (godie-i061):
 *
 *   「額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%」
 *
 * Nothing in the sim could ask the question. `ItemDef.modifiers` is resolved
 * into a flat `StatModifier[]` the moment the item is equipped
 * ({@link ../economy/itemSource}), and the only gate on it — `zClassRequirement`
 * — asks about the WIELDER (attackType / primaryStat), never about inventory.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SET LIVES ON THE ITEM DOCS AND NOT IN CODE (CLAUDE.md 第一守則)
 *
 * 「哪些道具算一套」 is a DECISION, not a number, so it is content:
 * `ItemDef.sets` (schema `item@1.sets`, see content/schema/item.ts). owner can
 * ship a second set — different pieces, different reward, a 2-of-4 partial set —
 * by editing item documents in the 後台, with no code change and no deploy.
 *
 * Three shapes were possible and this is the one that was taken:
 *
 *   · a NEW COLLECTION (`content/item-sets/*.json`) — needs a loader entry, a
 *     registry, a whitelist decision, an admin page and a refs extractor before
 *     one bonus can pay out;
 *   · a `config.item-sets@1` DOC — cheaper, but `packages/shared/src/sim/**`
 *     deliberately never reads the `Configs` registry (determinism: the host
 *     arms `world.combatEnv` / `statCaps` / `shieldRules` before tick 0). Set
 *     membership would then need arming in MatchController AND in the client's
 *     shop preview AND in the editor sandbox — three places to forget, and a
 *     forgotten one is a preview that lies (#106);
 *   · ON THE ITEM — the `Items` registry is ALREADY the sim's item truth and is
 *     already read by `itemSource.ts`, by the shop's stat preview and by the
 *     editor. Authoring the set there means every one of those surfaces sees it
 *     with zero wiring. THAT is why this shape.
 *
 * The clause is repeated on all three docs because owner's PROSE repeats it on
 * all three cards — the data mirrors the text. {@link activeItemSets}
 * de-duplicates by `set.id`, which is also the whole anti-double-count rule
 * (see below).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE SOURCE PER SET — the failure mode this shape makes impossible
 *
 * The obvious implementation is 「give each piece the +100% AP when the set is
 * complete」. Three pieces × `ap pctAdd 1.0` = `pctAdd 3.0` = **+300 % AP**, and
 * it looks right in every per-item test. So the set bonus is NOT a per-item
 * modifier at all: it is ONE `ModifierSource` per SET ID
 * (`item-set:<setId>`), attached to the holder. Holding one piece or all six
 * cannot change how many sources exist, because the id is the set's, not the
 * item's. `itemSets.test.ts` 「三件到齊只加一次」 pins the number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHEN IT IS RE-EVALUATED
 *
 * {@link syncItemSetSources} runs from `attachItemSource` and
 * `detachItemSource` in `economy/itemSource.ts` — the ONE attach/detach seam for
 * an equipped item — so buy / sell / undo-a-buy / undo-a-sell / 三選一 free
 * grant / the shop's stat preview / the editor sandbox all re-evaluate without
 * knowing this file exists. It is idempotent and reconciling (it drops set
 * sources that no longer qualify and refreshes the ones that do), so calling it
 * more often than necessary is free and calling it twice is a no-op.
 *
 * ⚠️ THE INVARIANT IT RIDES ON: `champ.items[slot]` must ALREADY reflect the
 * change when the attach/detach runs. Every existing caller does that (shop.ts
 * writes the slot, then attaches; statPreview.ts writes the slot, then
 * attaches), and `itemSets.test.ts` drives the real `buyItem`/`sellItem`/
 * `undoShopAction`/`grantItemFree` rather than calling this function directly,
 * so a caller that inverted the order would go red here.
 *
 * PURITY (sim/purity.test.ts): no rng, no clock, no trig, no `**`. Iteration is
 * over a fixed-length inventory array by index and over an explicitly SORTED
 * list of set ids, so no Map/Set order can leak into the result.
 */
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ItemSetBonus } from "../content/defs";
import { resolveGatedModifiers } from "../content/requirement";
import { attachSource } from "../stats/statPipeline";
import { Items } from "../content/registry";

/**
 * The prefix every set source id carries. Load-bearing: {@link syncItemSetSources}
 * finds the sources it owns by this prefix, so it can retire a set whose
 * definition has been deleted from content without being told which id to look
 * for. Nothing else in the sim may mint an id starting with it.
 */
export const ITEM_SET_SOURCE_PREFIX = "item-set:";

/** THE source id for an ACTIVE set on a holder. One per set, never per piece. */
export function itemSetSourceId(setId: string): string {
  return `${ITEM_SET_SOURCE_PREFIX}${setId}`;
}

/**
 * Hard bounds on `pieces` / `requiredPieces`, shared with the Zod schema so the
 * two cannot drift (`content/schema/item.ts` imports these).
 *
 * LOWER = 2: a 「set」 of one piece is just a modifier on that item, and
 * allowing it would give operators two different ways to write the same thing —
 * one of which pays out through a code path nobody expects.
 *
 * UPPER = 6 = the inventory size. This is the CEILING that catches a real
 * mis-parse: a set listing 7 pieces (or `requiredPieces: 30` for a typo'd 3)
 * can NEVER complete, and nothing at runtime would say so — the card would
 * simply never pay, which is CLAUDE.md 失敗形態 ② wearing a config value.
 * Rejecting it at load turns a silent dead clause into a loud one.
 *
 * ⚠️ It must equal `economy/shop.ts` `INVENTORY_SLOTS`. It is restated rather
 * than imported because `shop.ts` imports `itemSource.ts` imports this file, and
 * the reverse edge would be a cycle. `itemSets.test.ts` asserts the two numbers
 * are identical, so widening the inventory without widening this goes red.
 */
export const ITEM_SET_MIN_PIECES = 2;
export const ITEM_SET_MAX_PIECES = 6;

/** A set that is currently PAYING OUT on some holder. */
export interface ActiveItemSet {
  /** the set's id — also the `ModifierSource` id, minus the prefix. */
  readonly setId: string;
  /** the winning declaration (the lowest-slot piece's copy — they must agree). */
  readonly bonus: ItemSetBonus;
  /** how many pieces were counted, i.e. what cleared `requiredPieces`. */
  readonly held: number;
}

/** `requiredPieces`, defaulted. Absent = EVERY piece — the strictest reading. */
export function requiredPieces(bonus: ItemSetBonus): number {
  return bonus.requiredPieces ?? bonus.pieces.length;
}

/**
 * How many of `bonus.pieces` this inventory counts toward the set.
 *
 * `countDuplicates` (default FALSE) is the decision this function turns into a
 * field: two copies of 死之王的長槍 are one PIECE of a set, not two, which is
 * the reading 「同時裝備長槍、意志、神盾」 supports and the conservative one —
 * a set can never be completed by stacking one item. Operators who want the
 * other reading (a 「帶兩把同款」 set) flip the flag.
 */
function countHeld(bonus: ItemSetBonus, held: readonly (ItemId | null)[]): number {
  let n = 0;
  for (const piece of bonus.pieces) {
    let copies = 0;
    for (let slot = 0; slot < held.length; slot++) {
      if (held[slot] === piece) copies++;
    }
    if (copies === 0) continue;
    n += bonus.countDuplicates === true ? copies : 1;
  }
  return n;
}

/**
 * Every set this inventory currently completes, sorted by set id.
 *
 * Only sets DECLARED BY A HELD PIECE are considered — the sim has no set
 * registry to sweep, it reads `ItemDef.sets` off the items in the bag. With the
 * default `requiredPieces` (= all pieces) that is exactly equivalent to sweeping
 * a registry, because a complete set always includes every declaring piece. For
 * a PARTIAL set (`requiredPieces` < `pieces.length`) it means the declaration
 * must be repeated on every piece, or a completion made of the pieces that do
 * not declare it goes unnoticed — `sim/economy/itemSets.test.ts` asserts
 * the shipped tree does repeat it on all of them, and `item@1` refuses a
 * declaration whose `pieces` omits its own document.
 *
 * Pure — takes the inventory array, reads the `Items` registry, mutates nothing.
 */
export function activeItemSets(held: readonly (ItemId | null)[]): ActiveItemSet[] {
  // Slot order, not Map order: the FIRST declaration of a set id wins, and
  // "first" has to mean something deterministic on every replica.
  const declared = new Map<string, ItemSetBonus>();
  for (let slot = 0; slot < held.length; slot++) {
    const itemId = held[slot];
    if (!itemId) continue;
    const def = Items.tryGet(itemId);
    if (!def?.sets) continue;
    for (const bonus of def.sets) {
      if (!declared.has(bonus.id)) declared.set(bonus.id, bonus);
    }
  }

  const ids = [...declared.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out: ActiveItemSet[] = [];
  for (const setId of ids) {
    const bonus = declared.get(setId)!;
    // `enabled` absent = ON. An off switch that defaults to OFF is a mechanism
    // that never happens (失敗形態 ②) — authoring the set must be enough.
    if (bonus.enabled === false) continue;
    const n = countHeld(bonus, held);
    if (n < requiredPieces(bonus)) continue;
    out.push({ setId, bonus, held: n });
  }
  return out;
}

/**
 * Reconcile `holder`'s set sources with what `champ.items` now says.
 *
 * IN PLACE for a set that stays active (not detach + re-attach) for the same
 * reason `syncItemSources` is: re-attaching would churn `auraOrigin` bookkeeping
 * and reset per-source state, so selling an unrelated 7th item must not look
 * like re-equipping the whole set.
 *
 * Returns nothing; marks `sc.dirty` whenever it changed anything, which is what
 * makes the next `recomputeStats` pick the bonus up.
 */
export function syncItemSetSources(world: SimWorld, holder: EntityId): void {
  const champ = world.champion.get(holder);
  const sc = world.stats.get(holder);
  if (!champ || !sc) return;

  const active = activeItemSets(champ.items);
  const wanted = new Set(active.map((a) => itemSetSourceId(a.setId)));

  // Retire every set source that no longer qualifies. Walking backwards so the
  // splice cannot skip an entry; membership is tested with `has`, never by
  // iterating the Set, so no insertion order reaches the result.
  for (let i = sc.sources.length - 1; i >= 0; i--) {
    const s = sc.sources[i]!;
    if (!s.id.startsWith(ITEM_SET_SOURCE_PREFIX)) continue;
    if (wanted.has(s.id)) continue;
    sc.sources.splice(i, 1);
    sc.dirty = true;
  }

  for (const a of active) {
    const id = itemSetSourceId(a.setId);
    const existing = sc.sources.find((s) => s.id === id);
    if (existing) {
      // IN PLACE, so an unrelated buy/sell does not look like re-equipping the
      // whole set. The gate is re-resolved rather than reused because 變身 can
      // change its answer (same reason `syncItemSources` re-resolves).
      existing.modifiers = resolveGatedModifiers(world, holder, a.bonus.modifiers);
      sc.dirty = true;
      continue;
    }
    // ⚠️ WRITTEN AS AN INLINE LITERAL, WITH THE CALL IN THE PROPERTY, ON PURPOSE.
    // `economy/shopAttachSites.test.ts` reads the AST: it recognises a
    // `kind:"item"` source only when the literal is an `attach*Source` ARGUMENT
    // carrying `modifiers`, and it then asserts that property's initializer is
    // `resolveGatedModifiers`. Hoisting this into a local variable or a helper
    // makes the whole file invisible to that guard — which is how a source that
    // forwards the un-resolved (still-gated) array would slip through, exactly
    // the regression the guard was written for. The duplicated call above is the
    // price, and it is one array build on an inventory change.
    attachSource(world, holder, {
      id,
      kind: "item",
      modifiers: resolveGatedModifiers(world, holder, a.bonus.modifiers),
    });
  }
}

// ---------------------------------------------------------------------------
// THE AUDIT — 「這一套真的湊得起來嗎」
// ---------------------------------------------------------------------------

/** One thing wrong with a set declaration, as a human sentence. */
export interface ItemSetProblem {
  readonly setId: string;
  /** the item document the problem was found on ("" = a missing declaration). */
  readonly itemId: string;
  readonly message: string;
}

/**
 * Cross-document checks a single-doc Zod schema structurally cannot make.
 *
 * Pure, takes the item defs, returns findings — so a guard test AND a live page
 * can both use it without a second implementation (the project's 「報告是活頁」
 * rule). Three classes of finding, all of which produce a set that silently
 * never pays out (or pays out inconsistently):
 *
 *   1. a `pieces` id with no item document — the set can never complete;
 *   2. a piece that does NOT repeat the declaration, or repeats it with
 *      different terms. Both matter: the first hides a partial-set completion
 *      from {@link activeItemSets}, the second means WHICH piece you happen to
 *      hold decides what the set pays;
 *   3. a document that declares a set it is not itself a piece of.
 *
 * ⚠️ WHY THIS IS NOT A ZOD REFINE. Rules 1–2 are cross-document and a
 * single-doc schema structurally cannot see them. Rule 3 could be a refine, but
 * adding `.superRefine` to `zItemDef` turns it into a `ZodEffects`, which drops
 * `.extend()` (`zItemDoc` is built that way) and changes what the schema
 * WALKERS see — `content/fieldAdoption.ts` and the editor's form generator both
 * read `.shape`. Keeping all three here costs load-time loudness for rule 3 and
 * buys not breaking two unrelated surfaces; the dangerous half of rule 1 (a
 * typo'd piece id) IS load-time, as a hard ref edge in `content/refs.ts`.
 */
export function auditItemSets(
  defs: readonly { id: string; sets?: readonly ItemSetBonus[] }[],
): ItemSetProblem[] {
  const byId = new Map<string, { id: string; sets?: readonly ItemSetBonus[] }>();
  for (const d of defs) byId.set(d.id, d);

  const out: ItemSetProblem[] = [];
  for (const def of defs) {
    for (const bonus of def.sets ?? []) {
      // 3. the declaring document is not one of its own pieces. With the default
      //    `requiredPieces` this makes the set unreachable-by-this-doc; with a
      //    partial one it silently changes WHICH combinations pay out.
      if (!bonus.pieces.includes(def.id as ItemId)) {
        out.push({
          setId: bonus.id,
          itemId: def.id,
          message: `"${def.id}" declares set "${bonus.id}" but is not listed in its own pieces`,
        });
      }
      for (const piece of bonus.pieces) {
        const other = byId.get(piece);
        if (!other) {
          out.push({
            setId: bonus.id,
            itemId: def.id,
            message: `piece "${piece}" is not an item document — the set can never complete`,
          });
          continue;
        }
        const mirror = (other.sets ?? []).find((b) => b.id === bonus.id);
        if (!mirror) {
          out.push({
            setId: bonus.id,
            itemId: piece,
            message: `piece "${piece}" does not declare set "${bonus.id}" (declared on "${def.id}")`,
          });
          continue;
        }
        if (JSON.stringify(mirror) !== JSON.stringify(bonus)) {
          out.push({
            setId: bonus.id,
            itemId: piece,
            message:
              `piece "${piece}" declares set "${bonus.id}" with DIFFERENT terms than "${def.id}" — ` +
              "which copy wins depends on inventory slot order",
          });
        }
      }
    }
  }
  return out;
}
