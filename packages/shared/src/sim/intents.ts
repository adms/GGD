/**
 * The driver contract. BOTH a networked human seat and an AI brain emit the
 * same per-tick `IntentFrame`; the sim validates and applies them identically.
 * This is the seam that makes Human↔AI takeover a pointer swap.
 */
import type { EntityId } from "../ids";
import type { Vec2 } from "./math/vec2";

/** The four rankable/levelable ability slots. */
export type CoreAbilitySlot = "Q" | "W" | "E" | "R";
/**
 * The five LEARNED slots — the four rankable ones plus "EX", the per-hero
 * ultimate unlocked at the arena EX-unlock point (WC3 level 30, R00R-gated); it
 * is a single-rank ability held in a dedicated `exSlot`, never in the Q/W/E/R
 * record and never in skillOrder.
 *
 * This is the PROGRESSION alphabet: every one of these slots starts unusable
 * and is opened by spending a point (`rankUpAbility`) or by the unlock event
 * (`learnEx`). It is deliberately NOT the castable alphabet — see
 * `CastableSlot`.
 */
export type AbilitySlot = CoreAbilitySlot | "EX";

/**
 * Every slot a cast Command may NAME — the five learned slots plus "PASSIVE",
 * the 天生技 the source map grants from level 1 (ability code `NN-00`, held in
 * the WC3 hero unit's non-learnable `abilities` list). The owner's rule is six
 * slots, not five: 「每個人應該是六種，被動也是包含 slot，我說過他是等級1就獲得」.
 *
 * WHY A SIXTH SLOT NEEDED A NEW TYPE RATHER THAN WIDENING `AbilitySlot`.
 * Of the 108 innates, ~60 are `innateKind: "active"` — real WC3 D-slot casts
 * with a cooldown (`22-00 嗚鎖打!`: 40 s CD, 150 AoE damage + 0.5 s stun). They
 * must be CASTABLE. None of them is ever RANKED: the instance spawns at rank 1
 * and there is no second column to buy.
 *
 * Those are two different alphabets, so they are two different types:
 *
 *   rank-up / unlock  →  `CoreAbilitySlot` (rankUpAbility) and `AbilitySlot`
 *                        (`Command.rankUpAbility`, `Cheat.rankAbility`)
 *   cast              →  `CastableSlot` (`Command.castAbility`, `castAbility`)
 *
 * Because "PASSIVE" never enters `AbilitySlot`, ranking the innate is not
 * "guarded at runtime" — it is UNTYPEABLE. `rankUpAbility` cannot be handed it,
 * `Command.rankUpAbility` cannot carry it, and every `ab.slots[slot]` index in
 * the tree stays exactly as narrow as it was before this slot existed. That is
 * the same guarantee the previous (display-only) shape gave, kept intact while
 * the cast path opens.
 */
export type CastableSlot = AbilitySlot | "PASSIVE";

/**
 * EVERY slot a champion OWNS. Same member list as `CastableSlot` and kept as a
 * distinct name because it answers a different question: `ChampionAbilitySlot`
 * is WHICH SLOT A CONTENT DOC OCCUPIES (`AbilityDef.slot`), `CastableSlot` is
 * WHICH SLOT A COMMAND MAY NAME. They coincide today only because every owned
 * slot happens to be addressable by a cast; a future display-only slot would
 * make them diverge again.
 */
export type ChampionAbilitySlot = CastableSlot;

/** The sixth slot's name, in one place, so no call site spells it by hand. */
export const INNATE_SLOT = "PASSIVE" as const;

/** The four rankable slots, in the fixed order every sweep iterates them. */
export const CORE_ABILITY_SLOTS: readonly CoreAbilitySlot[] = ["Q", "W", "E", "R"];

/**
 * Every slot a cast may name, in the fixed order sweeps/HUDs iterate them.
 * "PASSIVE" goes LAST — it is the sixth button, after the EX.
 */
export const CASTABLE_SLOTS: readonly CastableSlot[] = ["Q", "W", "E", "R", "EX", "PASSIVE"];

/** Narrow a cast slot to the four rankable ones (the only `ab.slots` keys). */
export function isCoreAbilitySlot(slot: CastableSlot): slot is CoreAbilitySlot {
  return slot === "Q" || slot === "W" || slot === "E" || slot === "R";
}

export type CastTarget =
  | { type: "point"; point: Vec2 }
  | { type: "dir"; dir: Vec2 }
  | { type: "entity"; entityId: EntityId }
  | { type: "self" };

export type OrderKind = "move" | "attackMove" | "attackTarget" | "stop" | "hold";

export interface Order {
  kind: OrderKind;
  point?: Vec2;
  entity?: EntityId;
}

/** Discrete, event-like commands (consumed once, in seq order). */
export type Command =
  /**
   * Cast one slot. Carries `CastableSlot`, so it can name the level-1 innate
   * ("PASSIVE") as well as the five learned slots. `Command.rankUpAbility`
   * below deliberately stays on the narrower `AbilitySlot` — an innate is
   * castable but never rankable, and that asymmetry is expressed in the types
   * rather than in a runtime `if`.
   */
  | { kind: "castAbility"; slot: CastableSlot; target: CastTarget }
  | { kind: "useItem"; itemSlot: number; target?: CastTarget }
  | { kind: "recall" }
  | { kind: "buyItem"; itemId: string }
  | { kind: "sellItem"; itemSlot: number }
  /** revert the most recent buy/sell of this shopping session (task #121) */
  | { kind: "undoLastShopStep" }
  | { kind: "pickOffer"; offerId: string }
  | { kind: "rankUpAbility"; slot: AbilitySlot }
  | { kind: "ready" };

/** Per-tick output of ANY driver (human mailbox or AI brain). */
export interface IntentFrame {
  /** Continuous navigation desire; undefined = unchanged, latest wins. */
  order?: Order;
  /** Desired facing (unit vector), streamed while aiming. */
  aim?: Vec2;
  /** Discrete commands issued this tick. */
  commands: Command[];
}

export const EMPTY_INTENT: IntentFrame = { commands: [] };
