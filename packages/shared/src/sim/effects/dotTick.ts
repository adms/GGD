/**
 * dotTickSystem — the PAYOUT half of 持續傷害 (lane P1, GH#289).
 *
 * `effects/dot.ts` writes an instance into `world.dot`; this is the only thing
 * that ever collects on it. It runs at step slot 7c, IMMEDIATELY before
 * `combatResolveSystem`, and that position is load-bearing in both directions:
 *
 *   · BEFORE the drain, so a payout due this tick is mitigated by armour/MR,
 *     eaten by shields, scored by `recordDamage` and — if it kills — resolved by
 *     `deathSystem` on the SAME tick it was due. Queued after the drain it would
 *     land one tick late, every tick, for the rest of the burn.
 *   · AFTER `hitstopDecaySystem` / `projectileSystem`, so a burn applied by a
 *     projectile that landed THIS tick starts counting from this tick and not
 *     the next one.
 *
 * ── WHY IT LIVES HERE AND NOT IN sim/systems/ ──────────────────────────────
 * Same reason `combatResolveSystem` lives in `sim/combat/damage.ts` and
 * `auraCarrierSystem` in `sim/auraCarrier.ts`: the tick function belongs beside
 * the state it owns. GH#289's whole point is that a primitive lane owns its
 * files; putting the DoT clock in the shared systems folder would put it back
 * in everyone else's way.
 *
 * ── DETERMINISM (sim/purity.test.ts + the #198 desync hunt) ────────────────
 *   · Entities are visited in SORTED id order — `world.dot` is a Map and Map
 *     iteration is insertion order, which two hosts can legitimately differ on.
 *   · Instances are paid in a TOTAL ORDER (`origin`, then `sourceId`). This is
 *     not cosmetic: a DoT that kills feeds the kill-credit / bounty path, so
 *     letting array order decide who lands the last hit is a desync in the
 *     ledger even when the HP numbers agree.
 *   · Every deadline read here is an ABSOLUTE tick. The catch-up `while` is
 *     what makes that true rather than merely stated: if the clock ever jumps
 *     (replay seek, host resync) the schedule is re-derived from `world.tick`,
 *     and a burn whose deadline is already behind us pays NOTHING and is
 *     dropped. A `ticksLeft--` counter would happily pay out its full remaining
 *     schedule minutes after the round it belonged to ended.
 *
 * ── #216 — A SETTLED ZONE DOES NOT BURN ────────────────────────────────────
 * `SimWorld.settledZones`'s own contract: 「Systems must treat a settled zone as
 * "combat is over HERE"」. A player knocked out this round is already looking at
 * the shop, and a poison still draining his team-mates' bars behind the shop
 * card is exactly the bug #216 was filed for (the fire ring's version of it).
 * So the instances are DROPPED, not paused — the round they belonged to is
 * over, and the host's round reset (`MatchController`) clears shields and
 * statuses but knows nothing about `world.dot`, so leaving them parked is how a
 * burn leaks into the NEXT round.
 */
import type { SimWorld } from "../SimWorld";
import type { DotInstance } from "./dot";

/** Total order over instances on ONE victim: origin, then source. */
function compareInstances(a: DotInstance, b: DotInstance): number {
  if (a.origin < b.origin) return -1;
  if (a.origin > b.origin) return 1;
  return a.sourceId - b.sourceId;
}

/**
 * Has this instance lost the caster it is authored to die with? `"continue"`
 * (the default) never asks. `"stop"` DROPS the burn rather than pausing it: a
 * caster who is revived four seconds later did not re-cast the spell, so
 * resuming would be a free second application nobody paid a cooldown for.
 */
function casterLost(world: SimWorld, d: DotInstance): boolean {
  // ABSENT === "continue" (the authored default), so a hand-built instance
  // behaves exactly like the shipped one.
  if (d.onCasterDeath !== "stop") return false;
  const hp = world.health.get(d.sourceId);
  return hp === undefined || !hp.alive;
}

export function dotTickSystem(world: SimWorld): void {
  if (world.dot.size === 0) return; // the overwhelmingly common case

  for (const id of [...world.dot.keys()].sort((a, b) => a - b)) {
    const list = world.dot.get(id);
    if (list === undefined || list.length === 0) {
      world.dot.delete(id);
      continue;
    }

    const hp = world.health.get(id);
    const t = world.transform.get(id);
    // A corpse does not burn, and neither does a body in a zone whose duel is
    // already decided (#216). Both drop the whole list: see the header for why
    // parking it would leak into the next round.
    if (hp === undefined || !hp.alive || t === undefined || world.settledZones.has(t.zone)) {
      world.dot.delete(id);
      continue;
    }

    list.sort(compareInstances);
    const keep: DotInstance[] = [];
    for (const d of list) {
      if (casterLost(world, d)) continue;
      // ── THE DEADLINE IS READ FIRST, AND IT IS ABSOLUTE ────────────────────
      // A clock that has moved past `expiresAtTick` means this burn is OVER,
      // however the clock got there. That is the whole difference between an
      // absolute deadline and a `ticksLeft--` countdown: after a replay seek or
      // a host resync the countdown still believes it has 45 ticks to run and
      // pays them out into a round that ended minutes ago.
      if (world.tick > d.expiresAtTick) continue;

      if (d.nextTick <= world.tick) {
        if (d.amountPerTick > 0) {
          world.damageQueue.push({
            source: d.sourceId,
            target: id,
            amount: d.amountPerTick,
            type: d.damageType,
            // A DoT payout never crits: the roll happened (or did not) on the
            // cast that applied it, and re-rolling per payout would make a burn
            // the highest-variance damage in the game.
            crit: false,
            // ⚠️ THE AUTHOR'S ORIGIN, VERBATIM — and it is load-bearing, not
            // bookkeeping. `effects/dot.ts` copied `ctx.origin` onto the
            // instance and this line copies it onto the packet, which is the
            // ENTIRE reason a spell's lingering burn counts as 技能傷害
            // (owner 2026-08-01 「技能留下的延燒…算不算技能傷害? => yes」) and is
            // therefore converted by 惡夢魔王碎片 `scope: "ability"`. Stamping
            // anything of your own here (a `"dot:"` prefix, say) silently takes
            // every burn out of every `scope`-based rule in
            // `combat/damageTypeOverride.ts`. Guarded by the 「技能留下的延燒」
            // block in `combat/damageTypeOverride.test.ts`.
            origin: d.origin,
          });
        }
        // `dotEffect.apply` guarantees >= 1, but a hand-built instance (the
        // seam's fixtures, the editor) is only type-checked, not clamped — and a
        // 0 here would make the re-derivation below divide by zero and poison
        // `nextTick` with NaN, i.e. a burn that never pays and never expires.
        const interval = d.intervalTicks >= 1 ? d.intervalTicks : 1;
        d.nextTick += interval;
        // ── NO ARREARS ────────────────────────────────────────────────────
        // In normal play the line above is the whole story: the system runs
        // every tick, so `nextTick` lands exactly one interval in the future.
        // If the CLOCK jumped, the boundaries in between belong to ticks that
        // never happened for anything else either — nobody moved, nobody swung
        // — so replaying them would invent damage on ticks the rest of the sim
        // skipped, and would dump a whole burn's worth into one frame. Instead
        // the schedule is RE-DERIVED from the absolute clock: snap to the first
        // boundary strictly after `world.tick`, paying exactly the one payout
        // this tick is entitled to.
        if (d.nextTick <= world.tick) {
          const skipped = Math.floor((world.tick - d.nextTick) / interval) + 1;
          d.nextTick += skipped * interval;
        }
      }
      // INCLUSIVE deadline: the payout due exactly on `expiresAtTick` was paid
      // above, and the instance retires on that same tick. See
      // `DotInstance.expiresAtTick` for why inclusive is the shape that makes
      // 「持續 5 秒、每秒一次」 pay five times.
      if (world.tick < d.expiresAtTick) keep.push(d);
    }

    if (keep.length === 0) world.dot.delete(id);
    else world.dot.set(id, keep);
  }
}
