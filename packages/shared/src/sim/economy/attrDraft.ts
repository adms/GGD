/**
 * attrDraft — 能力屬性強化 as a 三選一 (#260).
 *
 * owner, 2026-07-28: 「購買能力屬性加成也是三選一 力/敏/智 隨機加點 0.1-2 顯示在
 * 卡片上面，所以有可能你想要的屬性但加很少」.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE CARD PER ATTRIBUTE, NOT THREE RANDOM DRAWS
 * ---------------------------------------------------------------------------
 * The owner's own sentence names the tension he wants: 「有可能你想要的屬性但加
 * 很少」 — the attribute you WANT is on the table, and the disappointment is its
 * SIZE, not its absence. That only reads if all three are always offered, so the
 * card is 力 / 敏 / 智 in fixed order with an INDEPENDENT magnitude rolled for
 * each. Drawing three attributes at random instead would spend most cards
 * offering the same attribute twice and would make the common failure "my stat
 * wasn't there", which is a different (and worse) feeling.
 *
 * ---------------------------------------------------------------------------
 * THE MAGNITUDE IS AN INTEGER ON THE WIRE
 * ---------------------------------------------------------------------------
 * The roll is drawn in TENTHS — a uniform integer 1..20, i.e. 0.1 … 2.0 — and
 * the choice id carries the integer, never a float. Two reasons:
 *   • the card has to PRINT the number (「顯示在卡片上面」), and 0.1·14 formatted
 *     from a float is 1.4000000000000001 territory; tenths make the printed
 *     string and the applied value the same fact.
 *   • the id is the whole payload. `OfferState.choices` is an `ArraySchema<string>`
 *     and there is no per-choice number field on the wire; encoding the roll
 *     INTO the id means the value the player reads is byte-identical to the one
 *     the server applies on the pick, with no parallel array to drift.
 *
 * DETERMINISM: every draw is `world.rng.int` — no Math.random, no clock — so a
 * replay of the same seed and the same purchase order produces the same cards.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { ATTR_KEYS, ATTR_LABEL, type AttrKey } from "../stats/attributes";

/**
 * Pseudo-tier carried on attribute offers, so the host's OfferState projection
 * and the client's card panel stay generic (exactly as ITEM_OFFER_TIER does for
 * weapon cards).
 */
export const ATTR_OFFER_TIER = "attribute";

/** The roll, in TENTHS of an attribute point: 1..20 ⇒ +0.1 … +2.0. */
export const ATTR_ROLL_MIN_TENTHS = 1;
export const ATTR_ROLL_MAX_TENTHS = 20;
/** How many distinct magnitudes the uniform draw spans (20). */
export const ATTR_ROLL_STEPS = ATTR_ROLL_MAX_TENTHS - ATTR_ROLL_MIN_TENTHS + 1;

/** Prefix that marks a draft choice as an attribute pick rather than an id. */
export const ATTR_CHOICE_PREFIX = "attr:";

export interface AttrChoice {
  attr: AttrKey;
  /** the rolled magnitude in tenths (1..20) */
  tenths: number;
  /** the same magnitude as points (tenths / 10) */
  value: number;
  /** 「力量 +1.4」 — the exact string the card prints */
  label: string;
}

/** Render a rolled magnitude as the card's text: one decimal, always. */
export function formatAttrValue(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/** `attr:str:14` — the on-wire id for "+1.4 力量". */
export function encodeAttrChoice(attr: AttrKey, tenths: number): string {
  return `${ATTR_CHOICE_PREFIX}${attr}:${tenths}`;
}

/**
 * Decode a choice id back into the pick it describes, or null when the string
 * is not an attribute choice (every other draft id — augments, weapons — flows
 * through the same `choices` array).
 *
 * REJECTS out-of-range and non-integer magnitudes rather than clamping them: a
 * malformed id can only come from a tampered client or a bug, and applying
 * "attr:str:9999" would hand out 999 strength. The pick is simply refused.
 */
export function parseAttrChoice(choice: string): AttrChoice | null {
  if (!choice.startsWith(ATTR_CHOICE_PREFIX)) return null;
  const parts = choice.slice(ATTR_CHOICE_PREFIX.length).split(":");
  if (parts.length !== 2) return null;
  const attr = parts[0] as AttrKey;
  if (!ATTR_KEYS.includes(attr)) return null;
  const tenths = Number(parts[1]);
  if (!Number.isInteger(tenths)) return null;
  if (tenths < ATTR_ROLL_MIN_TENTHS || tenths > ATTR_ROLL_MAX_TENTHS) return null;
  return {
    attr,
    tenths,
    value: tenths / 10,
    label: `${ATTR_LABEL[attr]} +${formatAttrValue(tenths)}`,
  };
}

/**
 * Roll the 3-choose-1: one card per attribute, in {@link ATTR_KEYS} order, each
 * with its own uniform 0.1–2.0 magnitude. Consumes exactly one rng draw per
 * card, in that order, so the stream is stable.
 */
export function rollAttrChoices(world: SimWorld): string[] {
  return ATTR_KEYS.map((attr) =>
    encodeAttrChoice(attr, ATTR_ROLL_MIN_TENTHS + world.rng.int(ATTR_ROLL_STEPS)),
  );
}

/**
 * Apply an attribute pick — the ONLY writer of `champ.attrBonus`.
 *
 * Marks stats dirty rather than recomputing inline, matching how every other
 * economy grant behaves (`attachSource`), so a pick made mid-tick still lands
 * on the next `statRecomputeSystem` pass and nothing recomputes twice.
 * Returns false on an unknown entity or a malformed choice, so a rejected pick
 * is visible to the caller instead of silently granting nothing.
 */
export function applyAttrPick(world: SimWorld, id: EntityId, choice: string): boolean {
  const parsed = parseAttrChoice(choice);
  if (!parsed) return false;
  const champ = world.champion.get(id);
  if (!champ) return false;
  champ.attrBonus[parsed.attr] += parsed.value;
  const sc = world.stats.get(id);
  if (sc) sc.dirty = true;
  world.emit("attrUpgradePicked", {
    id,
    attr: parsed.attr,
    value: parsed.value,
    total: champ.attrBonus[parsed.attr],
  });
  return true;
}
