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
      switch (order.kind) {
        case "move":
        case "attackMove":
          nav.moveTarget = order.point ? { x: order.point.x, z: order.point.z } : null;
          // A GROUND order re-points MOVEMENT, not targeting (task #274).
          //   - an EXPLICIT target is superseded, LoL-style: right-clicking the
          //     ground while attacking someone cancels that attack order;
          //   - the SIM'S OWN auto target is left standing. It was never the
          //     player's decision to make, and dropping it here would re-roll it
          //     from scratch on every one of the 30 orders a second an analog
          //     stick emits — defeating the leash/swap hysteresis in
          //     autoAcquirePass and, worse, blanking `attackTarget` for the whole
          //     of a committed wind-up (the A-click case that held a target 86%
          //     of the round and still landed 2 hits).
          if (!nav.attackTargetAuto) nav.attackTarget = null;
          break;
        case "attackTarget":
          nav.attackTarget = order.entity ?? null;
          nav.attackTargetAuto = false; // the seat chose it: hands off (task #221)
          nav.moveTarget = null;
          break;
        case "stop":
        case "hold":
          nav.moveTarget = null;
          nav.attackTarget = null;
          nav.attackTargetAuto = false;
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
    // ---- task #274: A LIVE WALK OWNS THE MOVEMENT CHANNEL ----
    // THIS is the line that actually conflicts with a player's move order —
    // not the acquisition. Having a target only makes you SWING (BasicAttack-
    // System gates on reach alone); it is the chase below that rewrites
    // `moveTarget`. So while an explicit `move` order is still walking, the
    // chase stands down and the destination the player asked for is left
    // exactly as ordered: you swing at whatever you pass, and you keep going
    // where you were going. `attackMove` is deliberately NOT covered — A-click
    // means "engage what you meet", and it is that chase which holds a champion
    // inside its own reach through the wind-up.
    if (nav.order?.kind === "move" && nav.moveTarget !== null) continue;
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
 *   - `move`          acquisition STAYS ON while walking (task #274). What a
 *                     walk suppresses is the CHASE — see the chase loop above —
 *                     so the player keeps the wheel and still swings at whatever
 *                     comes inside reach on the way past. #221 suppressed
 *                     ACQUISITION here instead, which silently switched
 *                     auto-attack off for the whole match for anyone using a
 *                     stick (a fresh move order every frame) or anyone who
 *                     right-clicked one unreachable spot.
 *   - `attackMove`    A-click MEANS "engage what you meet" → acquisition ON AND
 *                     the chase runs, so the champion closes and holds inside
 *                     its own reach through the wind-up.
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

    // ---- #216 × #221: STAND DOWN IN A SETTLED ZONE ----
    // `world.combatActive` is GLOBAL — it only drops once EVERY pairing is
    // decided — so between "my duel ended" and "the last duel ends" this pass
    // would hand a survivor a brand-new target and keep the fight running in a
    // zone whose round is already over. The defeated player is looking at the
    // shop by then (client shopGate), which is the exact 「回到商店…戰鬥沒真正
    // 結束」 report #216 exists to kill: its fire ring has stopped burning
    // (FireRingSystem) and its mobs have dropped aggro (MobSystem), so the
    // SIM-CHOSEN target must go the same way or the survivors would simply
    // switch to farming the stood-down zombies.
    //
    // Only the AUTO target is released. An EXPLICIT order the player gave is
    // left exactly as #216 shipped it — #216 deliberately scoped itself to what
    // the sim does ON THE PLAYER'S BEHALF, and silently cancelling a human's
    // own click here would be a second, unrelated behaviour change.
    if (world.settledZones.has(t.zone)) {
      if (nav.attackTargetAuto) {
        nav.attackTarget = null;
        nav.attackTargetAuto = false;
      }
      continue;
    }

    // A swing is already committed at a specific target: do not RE-POINT it
    // mid-wind-up. The wind-up itself carries its own target and survives
    // `nav.attackTarget` changing (BasicAttackSystem advances `ab.windup`
    // before it ever reads nav), but the CHASE reads nav — so re-pointing here
    // would walk the champion off the enemy it is already swinging at and the
    // blow would whiff.
    //
    // An EMPTY slot is a different thing entirely: it is a vacuum like any
    // other, and refusing to fill it was believed to be half of #274. A ground
    // order blanks `attackTarget`, the pass then skipped every tick of the
    // wind-up, so the chase had nothing to hold the champion in place with and
    // the player's own move order walked it out of its own range before the
    // damage point — 86.3% of ticks holding a target, 2 hits landed.
    //
    // ⚠️ CORRECTION (#274's adversarial pass): the `!== null` half of this
    // condition is currently UNREACHABLE, and the A-click recovery (4% → 75%
    // hit rate) came entirely from the `if (!nav.attackTargetAuto)` gate in the
    // ground-order branch above, NOT from here. Reverting this line to a bare
    // `windup` was measured: 0 tests red, and all five end-to-end scenarios
    // byte-identical. Once ground orders stopped blanking auto targets, the
    // only branch that nulls `attackTarget` mid-wind-up became unreachable, so
    // the vacuum this clause fills can no longer be constructed.
    //
    // It is kept as a cheap invariant, not as a fix — do not cite it as the
    // cause of anything, and do not build on the claim that it fires.
    if (world.abilities.get(id)?.windup && nav.attackTarget !== null) continue;

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
          // NO LONGER A SUPPRESSION (task #274). A walk owns MOVEMENT, and that
          // is enforced where movement is actually decided — the chase above.
          // Acquisition keeps running, so walking past an enemy makes you swing
          // at it without ever taking the wheel off the player.
          //
          // The old `if (nav.moveTarget !== null) continue` made every analog
          // stick a permanent auto-attack OFF switch: GamepadInput synthesises a
          // fresh `{kind:"move"}` order 4 u ahead EVERY FRAME it is deflected
          // (TouchInput does the same), so `moveTarget` was non-null on every
          // tick of the match and this pass skipped the seat forever. One
          // right-click on a spot the body can never stand on — outside the
          // zone, or inside a pillar — did it just as permanently.
          //
          // A FINISHED walk is still consumed here so a spent order does not
          // linger and keep the chase suppressed.
          if (nav.moveTarget === null) nav.order = null;
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
