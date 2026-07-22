/**
 * OrderSystem — translates each seat's continuous `order` into concrete
 * navigation state (moveTarget / attackTarget). Runs before MovementSystem.
 * Deterministic: seats are applied in ascending seat id order.
 */
import type { SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";
import { reachTo } from "./BasicAttackSystem";

/** Distance at which a move order counts as arrived. */
const ARRIVE_EPS = 0.05;

/**
 * Fraction of the effective attack reach a chase closes to before stopping.
 * The 10% gap is HYSTERESIS: the unit halts strictly INSIDE its own reach, so
 * separation jitter, a shuffling target or the acceleration ramp can nudge it
 * without immediately dropping it out of range and restarting the chase.
 */
const HOLD_FRACTION = 0.9;

export function orderSystem(world: SimWorld, intents: ReadonlyMap<SeatId, IntentFrame>): void {
  // Apply new orders in ascending seat order (Map iteration is insertion order,
  // so sort explicitly for determinism regardless of host map construction).
  const seatIds = [...intents.keys()].sort((a, b) => a - b);

  // Index: seat -> entity (champions carry TeamComp with their seat).
  for (const seatId of seatIds) {
    const frame = intents.get(seatId)!;
    if (!frame.order && !frame.aim) continue;

    for (const [id, tc] of world.team) {
      if (tc.seatId !== seatId) continue;
      const nav = world.nav.get(id);
      const t = world.transform.get(id);
      if (!nav || !t) continue;

      if (frame.aim) {
        const l2 = frame.aim.x * frame.aim.x + frame.aim.z * frame.aim.z;
        if (l2 > 1e-12) {
          const l = Math.sqrt(l2);
          t.facing = { x: frame.aim.x / l, z: frame.aim.z / l };
        }
      }

      const order = frame.order;
      if (!order) continue;
      nav.order = order;
      switch (order.kind) {
        case "move":
        case "attackMove":
          nav.moveTarget = order.point ? { x: order.point.x, z: order.point.z } : null;
          nav.attackTarget = null;
          break;
        case "attackTarget":
          nav.attackTarget = order.entity ?? null;
          nav.moveTarget = null;
          break;
        case "stop":
        case "hold":
          nav.moveTarget = null;
          nav.attackTarget = null;
          break;
      }
      break; // one entity per seat
    }
  }

  // Resolve attackTarget chase: close only until the target is inside our own
  // ATTACK REACH, then stop. The reach is `reachTo` — the exact same function
  // BasicAttackSystem gates the swing on — so the approach and the attack can
  // never disagree: whenever the chase stops, the auto is guaranteed to fire.
  //
  // Chasing to BODY CONTACT instead (the old behaviour) broke twice over: a
  // range-12 mage walked 10 units past its own range into melee, and a melee
  // unit that halted in the gap between contact (radii + 0.5) and its reach
  // (max(range, radii + 0.1)) could neither attack nor move — soft separation
  // only fires on real overlap, so nothing ever restored it. Stopping at a
  // FRACTION of the reach puts the halt strictly inside the attack window.
  for (const [id, nav] of world.nav) {
    if (!nav.attackTarget) continue;
    const self = world.transform.get(id);
    const tgt = world.transform.get(nav.attackTarget);
    if (!self || !tgt) {
      nav.attackTarget = null;
      continue;
    }
    const sc = world.stats.get(id);
    // Flowers are wide (0.7) STATIC props with no combat identity: keep the
    // legacy "walk up and touch" approach for them (a ranged champ holding at
    // range would otherwise never reach one it is trying to harvest).
    const reach = world.flower.has(nav.attackTarget)
      ? self.radius + tgt.radius + 0.1
      : sc
        ? reachTo(sc, self.radius, tgt.radius)
        : self.radius + tgt.radius + 0.1;
    const stop = reach * HOLD_FRACTION;
    if (distSq(self.pos, tgt.pos) > stop * stop) {
      nav.moveTarget = { x: tgt.pos.x, z: tgt.pos.z };
    } else {
      nav.moveTarget = null;
    }
  }

  // Clear arrived move targets.
  for (const [id, nav] of world.nav) {
    if (!nav.moveTarget) continue;
    const t = world.transform.get(id);
    if (!t) continue;
    if (distSq(t.pos, nav.moveTarget) <= ARRIVE_EPS * ARRIVE_EPS) {
      nav.moveTarget = null;
      if (nav.order && (nav.order.kind === "move" || nav.order.kind === "attackMove")) {
        nav.order = null;
      }
    }
  }
}
