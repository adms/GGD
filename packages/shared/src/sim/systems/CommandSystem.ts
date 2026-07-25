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
import { isInnateSlot } from "../abilities/innateActive";
import { buyItem, sellItem, undoShopAction } from "../economy/shop";
import { shopAccess } from "../economy/shopAccess";
import { dropCoinCommand } from "../coins";

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
    if (entity === null) {
      // A seat with no champion drops every command silently — except the coin
      // throw, which owes an answer to the button the player just pressed
      // (task #191 / P7). `dropCoinCommand` emits `no-champion` and nothing else
      // happens; when the mechanic is unarmed it emits nothing at all.
      for (const cmd of frame.commands) {
        if (cmd.kind === "dropCoin") dropCoinCommand(world, null, seatId);
      }
      continue;
    }

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
          // EX is unlocked, not ranked — only Q/W/E/R are rankable. The sixth
          // slot (天生技) is owned at RANK 1 for life, so it is refused here too:
          // `Command.rankUpAbility` carries the narrower `AbilitySlot` and
          // cannot even name it, but "PASSIVE" is now a REAL slot name a client
          // sends on the cast channel, so a mis-routed press must not reach
          // `ab.slots["PASSIVE"]` (which does not exist). Any OTHER junk value
          // is still left to fail loudly — that is validateInput's whitelist to
          // catch, and an existing net test pins it.
          if (cmd.slot !== "EX" && !isInnateSlot(cmd.slot)) rankUpAbility(world, entity, cmd.slot);
          break;
        case "dropCoin":
          // 陣亡投幣 (task #191). Every gate inside emits its own
          // `coinDropRejected`, so a refused press is never silent.
          dropCoinCommand(world, entity, seatId);
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
