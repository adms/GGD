/**
 * CommandSystem — drains each seat's discrete commands in ascending seat order
 * and dispatches to abilities/shop/draft/progression. Also ticks cooldowns.
 * Shop commands (buy/sell) are gated by the shared `shopAccess` rule — prep is
 * open to all, combat only to a champion already down this round (see
 * economy/shopAccess.ts); casts are always attempted (the sim validates).
 * pickOffer is resolved by the host (offers live outside the sim state) — the
 * sim emits an event for it.
 *
 * EVERY shop refusal is EMITTED, never swallowed (task #60): the out-of-phase
 * drop and each `BuyResult` (no-gold / no-slot / unique-owned / unknown-item)
 * ride `buyRejected`, and a failed sell rides `sellRejected`, so the HUD can
 * say WHY instead of showing a dead button.
 */
import type { SeatId, EntityId, ItemId } from "../../ids";
import type { IntentFrame } from "../intents";
import type { SimWorld } from "../SimWorld";
import { castAbility, rankUpAbility, tickCooldowns } from "../abilities/abilitySystem";
import { buyItem, sellItem, undoShopAction } from "../economy/shop";
import { shopAccess } from "../economy/shopAccess";

export function commandSystem(world: SimWorld, intents: ReadonlyMap<SeatId, IntentFrame>): void {
  tickCooldowns(world);

  const seatIds = [...intents.keys()].sort((a, b) => a - b);
  for (const seatId of seatIds) {
    const frame = intents.get(seatId)!;
    if (frame.commands.length === 0) continue;

    // find this seat's champion entity
    let entity: EntityId | null = null;
    for (const [id, tc] of world.team) {
      if (tc.seatId === seatId && world.champion.has(id)) {
        entity = id;
        break;
      }
    }
    if (entity === null) continue;

    for (const cmd of frame.commands) {
      switch (cmd.kind) {
        case "castAbility": {
          const result = castAbility(world, entity, cmd.slot, cmd.target);
          if (result !== "ok") {
            world.emit("castRejected", { entity, slot: cmd.slot, reason: result });
          }
          break;
        }
        case "buyItem": {
          const access = shopAccess(world, entity);
          if (!access.open) {
            world.emit("buyRejected", { entity, seatId, itemId: cmd.itemId, reason: access.reason });
            break;
          }
          const result = buyItem(world, entity, cmd.itemId as ItemId);
          if (result !== "ok") {
            world.emit("buyRejected", { entity, seatId, itemId: cmd.itemId, reason: result });
          }
          break;
        }
        case "sellItem": {
          const access = shopAccess(world, entity);
          if (!access.open) {
            world.emit("sellRejected", { entity, seatId, itemSlot: cmd.itemSlot, reason: access.reason });
            break;
          }
          if (!sellItem(world, entity, cmd.itemSlot)) {
            world.emit("sellRejected", { entity, seatId, itemSlot: cmd.itemSlot, reason: "empty-slot" });
          }
          break;
        }
        case "undoLastShopStep": {
          // Gated by the SAME rule as buy/sell — the undo cannot be replayed
          // once the shop closes (resolution / match end), which is what stops
          // any cross-round buy→sell→undo cycle from netting gold (task #121).
          const access = shopAccess(world, entity);
          if (!access.open) {
            world.emit("undoRejected", { entity, seatId, reason: access.reason });
            break;
          }
          const result = undoShopAction(world, entity);
          if (result !== "ok") {
            world.emit("undoRejected", { entity, seatId, reason: result });
          }
          break;
        }
        case "rankUpAbility":
          // EX is unlocked, not ranked — only Q/W/E/R are rankable
          if (cmd.slot !== "EX") rankUpAbility(world, entity, cmd.slot);
          break;
        case "pickOffer":
          // offers are host-side state; surface the pick as an event
          world.emit("pickOffer", { entity, seatId, offerId: cmd.offerId });
          break;
        case "ready":
          world.emit("ready", { entity, seatId });
          break;
        case "recall":
        case "useItem":
          // deferred features — accepted but inert in the skeleton
          break;
      }
    }
  }
}
