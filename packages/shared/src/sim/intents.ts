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
 * All castable slots. "EX" is the per-hero ultimate unlocked at the arena
 * EX-unlock point (WC3 level 30, R00R-gated); it is a single-rank ability held
 * in a dedicated `exSlot`, never in the Q/W/E/R record and never in skillOrder.
 */
export type AbilitySlot = CoreAbilitySlot | "EX";

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
  | { kind: "castAbility"; slot: AbilitySlot; target: CastTarget }
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
