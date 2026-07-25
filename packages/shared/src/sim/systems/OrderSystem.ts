/**
 * OrderSystem — translates each seat's continuous `order` into concrete
 * navigation state (moveTarget / attackTarget). Runs before MovementSystem.
 * Deterministic: seats are applied in ascending seat id order.
 */
import type { EntityId, SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";
import { reachTo } from "./BasicAttackSystem";
import {
  ACQUIRE_LEASH,
  acquireRadius,
  acquireTarget,
  rankOf,
  shouldSwapAutoTarget,
} from "../targeting";

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
      // Every branch below is an EXPLICIT seat action, so `attackTargetAuto`
      // goes false: whatever the target ends up being, the seat chose it and
      // the auto-acquire pass must leave it alone (task #221).
      nav.attackTargetAuto = false;
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

  // task #221: fill the targeting VACUUM (runs before the chase resolve below,
  // so a target acquired this tick both walks a melee hero in and fires the
  // ranged swing on the same tick).
  autoAcquirePass(world);

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
      nav.attackTargetAuto = false;
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

/**
 * AUTO-ACQUIRE (task #221) — the vacuum-filler.
 *
 * 「玩家操控的 近戰跟遠戰英雄 應該都要會自動攻擊附近英雄」. A champion with no
 * live target picks one itself, using the single shared rule in sim/targeting.ts
 * (威脅 → 低血 → 最近, champions before mobs, entity id as the final tiebreak).
 *
 * IT ONLY EVER FILLS A VACUUM. An explicit seat action always wins:
 *   - `attackTarget`  the player clicked THAT enemy → never re-pointed, never
 *                     leashed. Only when the target is gone (dead / despawned,
 *                     so `attackTarget` is already null) does the order get
 *                     consumed — otherwise one manual click that later dies
 *                     would suppress auto-attack for the rest of the match.
 *   - `move`          a right-click walk does NOT auto-attack (LoL semantics).
 *                     Suppression lasts exactly as long as the walk: the arrival
 *                     pass above clears the order, and idle re-acquires.
 *   - `attackMove`    A-click MEANS "engage what you meet" → acquisition ON while
 *                     moving. (It was previously a plain move order for every
 *                     input device — nothing ever acquired for it.)
 *   - `stop`          a real INTERRUPT, then over: the switch above clears the
 *                     targets, this pass skips acquisition for that one tick so
 *                     the press is observable, and clears `nav.order` so idle
 *                     re-acquires from the next tick. Leaving it sticky instead
 *                     would make S a permanent auto-attack OFF switch; skipping
 *                     the clear would make S a no-op.
 *   - `hold`          suppresses the CHASE, not the swing: only candidates
 *                     already inside the hold band are acquired and no
 *                     moveTarget is ever written for them.
 *
 * GATED ON `world.combatActive`. Three reasons, all load-bearing:
 *   1. the castability sweep (#128) steps NO_INTENTS with an adjacent enemy
 *      dummy and verdicts PASS on any damage event — un-gated acquisition would
 *      let a genuinely inert ability report PASS off a basic attack, silently
 *      inflating the ratchet;
 *   2. the round-settle freeze (#100) must stay frozen;
 *   3. it is `false` by default, so every pre-existing sim test that never sets
 *      it keeps hashing byte-identically. Same precedent as MobSystem /
 *      fireRing / coins.
 *
 * Mobs are NOT processed here — MobSystem owns their aggro (they are also not in
 * `world.champion`).
 */
function autoAcquirePass(world: SimWorld): void {
  if (!world.combatActive) return;

  // Explicit ascending-id iteration: `world.champion` is a Map, so its native
  // order is insertion order — an accident of spawn sequence, not a rule.
  const ids: EntityId[] = [...world.champion.keys()].sort((a, b) => a - b);

  for (const id of ids) {
    const nav = world.nav.get(id);
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const sc = world.stats.get(id);
    if (!nav || !t || !hp?.alive || !sc) continue;

    // A swing is already committed at a specific target: do not re-point it
    // mid-wind-up (BasicAttackSystem would cancel it and the hero would never
    // land a blow).
    if (world.abilities.get(id)?.windup) continue;

    // ---- explicit-order suppression ----
    let holdPosition = false;
    const order = nav.order;
    if (order) {
      switch (order.kind) {
        case "attackTarget":
          if (nav.attackTarget !== null) continue; // the player's pick, still live
          nav.order = null; // it died / vanished — back to idle, re-acquire below
          break;
        case "move":
          if (nav.moveTarget !== null) continue; // still walking where told
          nav.order = null;
          break;
        case "attackMove":
          break; // A-click: engage while moving
        case "stop":
          // CONSUME IT, AND SKIP THIS TICK. Consuming matters because a sticky
          // `stop` would make S a permanent auto-attack OFF switch; skipping the
          // tick matters because re-acquiring in the very same tick the player
          // pressed S would make S do nothing observable at all. One tick of
          // idle is the whole difference between "interrupt" and "no-op".
          nav.order = null;
          continue;
        case "hold":
          holdPosition = true;
          break;
      }
    }

    // ---- radius ----
    // Derived from the champion's OWN reach (so a ranged hero opens fire at
    // range and a melee hero closes in) with a floor so melee is not limited to
    // bodies already touching it. `hold` shrinks it to the chase's own hold
    // point, which is what makes hold never produce a moveTarget.
    // `hold` uses tgtRadius = 0 — the SMALLEST reach any target could produce —
    // so the band is conservative and the chase below can never step forward.
    const radius = holdPosition
      ? reachTo(sc, t.radius, 0) * HOLD_FRACTION
      : acquireRadius(sc, t.radius);

    const best = acquireTarget(world, id, radius);

    // ---- keep, swap, or drop the held AUTO target ----
    if (nav.attackTarget !== null && nav.attackTargetAuto) {
      const held = rankOf(world, id, nav.attackTarget);
      const leash = radius + ACQUIRE_LEASH;
      if (held && held.d2 <= leash * leash) {
        // Still legal and inside the leash. Only a CATEGORICALLY better target
        // (an enemy champion over a mob, or the enemy that just started hitting
        // me) takes it away — re-ranking on hp/distance every tick would swap
        // mid-approach and cancel the wind-up over and over.
        if (best && shouldSwapAutoTarget(held, best)) nav.attackTarget = best.id;
        continue;
      }
      nav.attackTarget = null;
      nav.attackTargetAuto = false;
    }

    if (nav.attackTarget !== null) continue; // an explicit target we must not touch
    if (!best) continue;
    nav.attackTarget = best.id;
    nav.attackTargetAuto = true;
  }
}
