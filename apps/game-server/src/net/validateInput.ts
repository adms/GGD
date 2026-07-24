/**
 * Colyseus INPUT payload validation — THE authoritative ingress gate.
 *
 * The wire types (InputMessage / Command / Order / Vec2 / CastTarget) are
 * COMPILE-TIME only; a hostile client can put any JSON at all on the MSG.INPUT
 * channel. This module coerces an untrusted value into a SAFE InputMessage:
 *
 *   • unknown `cmd.kind` is dropped;
 *   • ability `slot` is whitelisted to a literal set — a prototype-name slot
 *     ('__proto__' / 'constructor' / 'toString' / …) can never survive, so it
 *     can never index `ab.slots[slot]` into a truthy Object.prototype member and
 *     reach `Abilities.get(undefined)`, which THROWS and (via the task-#46 tick
 *     catch) would disconnect the whole match room — a one-message DoS
 *     (finding: prototype-key / payload-injection). TWO sets, because the two
 *     commands speak two different alphabets (see {@link CAST_SLOTS});
 *   • `itemSlot` must be an integer in [0, INVENTORY_SLOTS) — same reasoning for
 *     `champ.items[itemSlot]` -> `Items.get(Array.prototype)`;
 *   • every coordinate must be a FINITE number (no NaN / Infinity poisoning the
 *     deterministic sim);
 *   • the command list is capped at MAX_COMMANDS_PER_MESSAGE (algorithmic-
 *     complexity / event-loop-stall DoS — one message can otherwise carry an
 *     arbitrarily long commands[] processed synchronously in a single tick).
 *
 * Anything that fails validation is DROPPED, never thrown. Pure and
 * dependency-light so it unit-tests without a Colyseus room, and so it adds no
 * per-message allocation beyond the sanitized copy.
 */
import type {
  AbilitySlot,
  CastTarget,
  CastableSlot,
  Command,
  Order,
  OrderKind,
} from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { EntityId } from "@ggd/shared/ids";
import type { InputMessage } from "@ggd/shared/protocol/messages";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";

/** Hard cap on commands accepted from a SINGLE INPUT message (excess dropped). */
export const MAX_COMMANDS_PER_MESSAGE = 64;
/** Hard cap on any client-supplied content id / offer id string length. */
export const MAX_ID_LENGTH = 64;
/** uint16 seq space (matches InputMailbox's wrap-aware acceptance window). */
const SEQ_MODULO = 65536;

// Sets — NOT plain object lookups — so a prototype-name key ('__proto__', …)
// can never test as a member (Set uses SameValueZero, ignores the prototype).

/**
 * The RANKABLE slots — the only thing `rankUpAbility` may name. Deliberately
 * does NOT contain "PASSIVE": the 天生技 is owned at rank 1 from spawn and has no
 * second column to buy, so ranking it is meaningless and stays unreachable from
 * the wire. Mirrors the shared `AbilitySlot` alphabet exactly.
 */
const ABILITY_SLOTS: ReadonlySet<string> = new Set<AbilitySlot>(["Q", "W", "E", "R", "EX"]);

/**
 * The CASTABLE slots — what `castAbility` may name. Mirrors the shared
 * `CastableSlot` alphabet, i.e. `AbilitySlot` PLUS the sixth slot.
 *
 * WHY THIS SET EXISTS AT ALL (the silent drop this fixed): the sim had already
 * opened the innate cast path — `CastableSlot`, `Command.castAbility`,
 * `abilityInstanceFor`, the cooldown tick, the whole ladder — and the 60
 * `innateKind: "active"` 天生技 fire correctly when the command reaches
 * `world.step`. But THIS validator still whitelisted {Q,W,E,R,EX}, so a
 * perfectly well-formed `{ kind: "castAbility", slot: "PASSIVE" }` off a real
 * client was DROPPED HERE, silently, one layer above the code that was ready
 * for it. No throw, no log, no `castRejected` — the player pressed the key and
 * the universe said nothing. Widening the cast set (and only the cast set) is
 * what makes the sixth button reach the sim.
 *
 * The prototype-key guarantee is unchanged: this is still a literal Set, so
 * '__proto__' / 'constructor' / 'toString' remain non-members, and
 * `abilityInstanceFor` additionally resolves every slot by explicit equality —
 * junk can never fall through to `passiveSlot` (innateActive.ts).
 */
const CAST_SLOTS: ReadonlySet<string> = new Set<CastableSlot>(["Q", "W", "E", "R", "EX", "PASSIVE"]);
const ORDER_KINDS: ReadonlySet<string> = new Set<OrderKind>([
  "move",
  "attackMove",
  "attackTarget",
  "stop",
  "hold",
]);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** A finite planar vector, or undefined. Rejects NaN/Infinity and non-objects. */
function toVec2(v: unknown): Vec2 | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (isFiniteNumber(o.x) && isFiniteNumber(o.z)) return { x: o.x, z: o.z };
  return undefined;
}

/** A non-negative integer EntityId, or undefined. */
function toEntityId(v: unknown): EntityId | undefined {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v as EntityId;
  return undefined;
}

/** An inventory slot index in [0, INVENTORY_SLOTS), or undefined. */
function toItemSlot(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < INVENTORY_SLOTS) return v;
  return undefined;
}

/** A bounded, non-empty content-id string, or undefined. */
function toBoundedString(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH) return v;
  return undefined;
}

/** A valid CastTarget of one of the four shapes, or undefined. */
function toCastTarget(v: unknown): CastTarget | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case "self":
      return { type: "self" };
    case "point": {
      const point = toVec2(o.point);
      return point ? { type: "point", point } : undefined;
    }
    case "dir": {
      const dir = toVec2(o.dir);
      return dir ? { type: "dir", dir } : undefined;
    }
    case "entity": {
      const entityId = toEntityId(o.entityId);
      return entityId !== undefined ? { type: "entity", entityId } : undefined;
    }
    default:
      return undefined;
  }
}

/** Validate a single discrete command; returns a fresh, safe copy or undefined. */
export function sanitizeCommand(raw: unknown): Command | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  switch (c.kind) {
    case "castAbility": {
      if (typeof c.slot !== "string" || !CAST_SLOTS.has(c.slot)) return undefined;
      const target = toCastTarget(c.target);
      if (!target) return undefined;
      return { kind: "castAbility", slot: c.slot as CastableSlot, target };
    }
    case "useItem": {
      const itemSlot = toItemSlot(c.itemSlot);
      if (itemSlot === undefined) return undefined;
      // target is optional; if supplied it must be valid, else drop the command.
      if (c.target === undefined) return { kind: "useItem", itemSlot };
      const target = toCastTarget(c.target);
      return target ? { kind: "useItem", itemSlot, target } : undefined;
    }
    case "recall":
      return { kind: "recall" };
    case "buyItem": {
      const itemId = toBoundedString(c.itemId);
      return itemId !== undefined ? { kind: "buyItem", itemId } : undefined;
    }
    case "sellItem": {
      const itemSlot = toItemSlot(c.itemSlot);
      return itemSlot !== undefined ? { kind: "sellItem", itemSlot } : undefined;
    }
    case "undoLastShopStep":
      return { kind: "undoLastShopStep" };
    case "pickOffer": {
      const offerId = toBoundedString(c.offerId);
      return offerId !== undefined ? { kind: "pickOffer", offerId } : undefined;
    }
    case "rankUpAbility": {
      if (typeof c.slot !== "string" || !ABILITY_SLOTS.has(c.slot)) return undefined;
      return { kind: "rankUpAbility", slot: c.slot as AbilitySlot };
    }
    case "ready":
      return { kind: "ready" };
    default:
      return undefined;
  }
}

/** Validate a continuous navigation order; returns a fresh copy or undefined. */
function sanitizeOrder(raw: unknown): Order | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== "string" || !ORDER_KINDS.has(o.kind)) return undefined;
  const order: Order = { kind: o.kind as OrderKind };
  const point = toVec2(o.point);
  if (point) order.point = point;
  const entity = toEntityId(o.entity);
  if (entity !== undefined) order.entity = entity;
  return order;
}

/**
 * Coerce an untrusted MSG.INPUT payload into a safe InputMessage. Never throws.
 * A malformed/missing payload becomes `{ seq: 0, commands: [] }` (a no-op).
 */
export function sanitizeInputMessage(raw: unknown): InputMessage {
  if (typeof raw !== "object" || raw === null) return { seq: 0, commands: [] };
  const m = raw as Record<string, unknown>;

  const seq =
    typeof m.seq === "number" && Number.isInteger(m.seq) && m.seq >= 0 && m.seq < SEQ_MODULO
      ? m.seq
      : 0;

  const out: InputMessage = { seq };

  const order = sanitizeOrder(m.order);
  if (order) out.order = order;

  const aim = toVec2(m.aim);
  if (aim) out.aim = aim;

  if (Array.isArray(m.commands) && m.commands.length > 0) {
    const commands: Command[] = [];
    // Only ever touch the FIRST MAX_COMMANDS_PER_MESSAGE entries: a
    // 1,000,000-length commands[] costs O(cap), not O(N), here.
    const limit = Math.min(m.commands.length, MAX_COMMANDS_PER_MESSAGE);
    for (let i = 0; i < limit; i++) {
      const cmd = sanitizeCommand(m.commands[i]);
      if (cmd) commands.push(cmd);
    }
    if (commands.length > 0) out.commands = commands;
  }

  return out;
}
