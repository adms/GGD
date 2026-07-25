/**
 * ReviveSystem — the revive-circle lifecycle. Runs right after flowerSystem
 * (it consumes this tick's `death` events) and before regen, so a champion
 * revived this tick regenerates and accrues time-alive from this tick on.
 *
 * Per tick, in this fixed order:
 *
 *  1. SPAWN — every CHAMPION death this tick drops a circle on the corpse,
 *     provided the team still holds its round charge, has no circle already
 *     burning, and has at least one living member left in that zone. The
 *     charge gates the SPAWN, so once it is spent later deaths on that team
 *     drop no circle at all — "no circle = no second chance" needs no HUD
 *     explanation. A revived champion who dies again therefore drops nothing,
 *     which is the clause that makes the round terminate.
 *
 *  2. UPDATE — for each live circle (ascending entity id, deterministic):
 *       • the owner's team has been wiped out of the zone → extinguish. The
 *         duel-end check wins unconditionally; a channel at 99% does not save
 *         the round (this runs BEFORE the host's checkCombatEnd, in the same
 *         host tick, so resolution can never race revival).
 *       • collect ELIGIBLE CHANNELLERS: living allies of the owner's team, in
 *         the circle's zone, inside `radius`, not hard-CC'd. Damage NEVER
 *         interrupts (measured: the killer stands 1.29u from the corpse at the
 *         median, so a damage-interrupt rule would cancel ~100% of real
 *         attempts); stun/root/knockdown DOES; leaving the ring cancels; dying
 *         cancels.
 *       • NO STACKING: one timer per circle, +1 tick per tick while >=1 ally
 *         channels, regardless of how many. A second body buys redundancy
 *         (hand-off), never speed.
 *       • CONTEST: an enemy inside the ring HOLDS progress (does not zero it),
 *         so the rescuer's first job is shoving them off rather than being
 *         hard-blocked.
 *       • DECAY: an empty ring drains at `decayMult`x, so a half-second
 *         sidestep survives and a genuine disengage does not. Progress lives
 *         on the CIRCLE, never on a champion, so a hand-off resumes.
 *       • COMPLETE at `channelTicks`: the owner comes back at the CHANNELLER's
 *         feet on partial HP/mana, the team charge is spent (on completion
 *         only — a failed attempt never burns the round's revive), and the
 *         circle is destroyed.
 *
 *     THERE IS NO EXPIRE STEP. A 2x-channel deadline used to sit at the end of
 *     this list; task #196 deleted it — 「復活隊友的圈圈 沒有消失期限直到回合
 *     結束」, which is also LoL Arena's behaviour (no documented timeout on the
 *     downed zone). Every remaining despawn above is a REASON, not a clock, so
 *     a ring that is still standing always means "this rescue is still on".
 *     What used to bound the drama is now the round itself: `endCombatRevives`
 *     on combat exit, and the team-wiped check above.
 *
 * Disarmed worlds (reviveRules null, e.g. the client's prediction shadow
 * world or any unit test that never armed them) skip everything: circles are
 * server entities, interpolated on the client, NEVER predicted — identical to
 * the flower contract.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";
import { pushOutOfObstacle, clampToBoundary } from "../collision/resolve";
import { recordRevive } from "../stats/matchStats";
import { spawnReviveCircle, reviveCircleOfTeam, teamAliveInZone } from "../revive";
import type { ReviveRules } from "../revive";
import { fireRingRadius } from "../fireRing";

/**
 * The fire ring's INNER safe radius in `zone` right now, for a body of
 * `bodyRadius` — or null when no ring is armed / it has not ignited yet.
 *
 * `<= 0` is the fully-closed ring (#195): there is no survivable space at all,
 * so reviving anyone is a griefing loop — they stand up and burn at 20 %/s with
 * nowhere to go, dropping a fresh circle, forever. Live circles expire and no
 * new one may drop from that moment.
 */
function fireRingInnerRadius(world: SimWorld, zone: number, bodyRadius: number): number | null {
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0) return null;
  if (world.fireRingTicks < rules.startTicks) return null;
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0];
  if (!zoneDef) return null;
  const r = fireRingRadius(rules, world.fireRingTicks - rules.startTicks, zoneDef.boundaryRadius);
  return r - bodyRadius;
}

/** Body radius of an entity, defaulting to the champion collision radius. */
function bodyRadiusOf(world: SimWorld, id: EntityId): number {
  return world.transform.get(id)?.radius ?? 0.6;
}

/** Is this entity under hard CC (stun / root / knockdown) right now? */
function hardCCd(world: SimWorld, id: EntityId): boolean {
  if ((world.knockdown.get(id) ?? 0) > 0) return true;
  const st = world.status.get(id);
  if (!st) return false;
  for (const e of st.effects) {
    if (e.expiresAtTick <= world.tick) continue;
    if (e.root || e.stun) return true;
  }
  return false;
}

export function reviveSystem(world: SimWorld): void {
  const rules = world.reviveRules;
  if (!rules) return;

  spawnCirclesForDeaths(world, rules);

  // ascending entity id — Map iteration order is insertion order == id order
  for (const id of [...world.reviveCircle.keys()]) {
    updateCircle(world, rules, id);
  }
}

/** 1) A champion death this tick drops a circle, if the team may still have one. */
function spawnCirclesForDeaths(world: SimWorld, rules: ReviveRules): void {
  // snapshot: spawnReviveCircle emits an event and would grow the array
  const events = [...world.events];
  for (const ev of events) {
    if (ev.type !== "death") continue;
    const victim = ev.data.id as EntityId;
    if (!world.champion.has(victim)) continue; // flowers/neutrals drop nothing
    const team = world.team.get(victim);
    const t = world.transform.get(victim);
    if (!team || !t) continue;

    // the round charge gates the SPAWN (it is SPENT on completion)
    if ((world.reviveCharges.get(team.teamId) ?? 0) <= 0) continue;
    // at most one live circle per team at a time
    if (reviveCircleOfTeam(world, team.teamId, t.zone) !== null) continue;
    // nobody left to walk to it — the circle would be extinguished next tick
    if (teamAliveInZone(world, team.teamId, t.zone) === 0) continue;
    // the fire ring has closed completely (#195): a revive into a total burn is
    // a griefing loop, so refuse to drop the circle at all.
    const inner = fireRingInnerRadius(world, t.zone, t.radius);
    if (inner !== null && inner <= 0) continue;

    spawnReviveCircle(world, {
      ownerId: victim,
      ownerSeatId: team.seatId,
      teamId: team.teamId,
      zone: t.zone,
      pos: t.pos,
      radius: rules.radius,
    });
  }
}

/** 2) Advance / complete / expire one circle. */
function updateCircle(world: SimWorld, rules: ReviveRules, id: EntityId): void {
  const rc = world.reviveCircle.get(id);
  const ct = world.transform.get(id);
  if (!rc || !ct) return;

  // — owner's seat lost its entity (disconnect / champion swap): nothing was
  //   spent, so the circle simply vanishes and the charge stays unspent.
  const ownerHp = world.health.get(rc.ownerId);
  const ownerT = world.transform.get(rc.ownerId);
  if (!ownerHp || !ownerT) {
    despawn(world, id, rc, ct.pos, "owner-gone");
    return;
  }
  // — owner already alive again by some other means: the circle is moot.
  if (ownerHp.alive) {
    despawn(world, id, rc, ct.pos, "owner-alive");
    return;
  }
  // — EDGE 6: the owner's team is wiped in this zone. The duel-end check wins
  //   unconditionally; extinguish before the host resolves the duel.
  if (teamAliveInZone(world, rc.teamId, rc.zone) === 0) {
    despawn(world, id, rc, ct.pos, "team-wiped");
    return;
  }
  // — #195: the fire ring has closed to nothing. Nobody can stand anywhere
  //   safely, so a completed revive would only feed the burn. Extinguish.
  const innerNow = fireRingInnerRadius(world, rc.zone, ownerT.radius);
  if (innerNow !== null && innerNow <= 0) {
    despawn(world, id, rc, ct.pos, "fire-ring-closed");
    return;
  }

  // — eligible channellers + enemy contest, in one deterministic pass —
  const r2 = rules.radius * rules.radius;
  let channellerId: EntityId | null = null;
  let channellers = 0;
  let contested = false;
  for (const [cid] of world.champion) {
    const hp = world.health.get(cid);
    const t = world.transform.get(cid);
    const team = world.team.get(cid);
    if (!hp?.alive || !t || !team || t.zone !== rc.zone) continue;
    if (distSq(t.pos, ct.pos) > r2) continue;
    if (team.teamId !== rc.teamId) {
      contested = true; // any enemy inside contests, alive-and-present is enough
      continue;
    }
    if (cid === rc.ownerId) continue; // the corpse cannot channel itself
    if (rules.ccInterrupts && hardCCd(world, cid)) continue;
    channellers++;
    if (channellerId === null) channellerId = cid; // lowest id takes the credit
  }

  rc.contested = contested;
  rc.channellerId = channellers > 0 ? channellerId : null;

  if (channellers > 0) {
    // NO STACKING: the count buys redundancy, never speed.
    if (!(contested && rules.contestPauses)) {
      // Channel-START edge (0 → >0): the audio layer plays the reviveChannel
      // 詠唱進行中 bed once as a teammate first commits (audio COMBAT-AUDIO, #84).
      // A channel that decays back to 0 and is picked up again re-fires — one
      // cue per fresh commitment, which is the intent.
      if (rc.progressTicks === 0) {
        world.emit("reviveChannel", {
          id,
          channeller: channellerId,
          ownerId: rc.ownerId,
          teamId: rc.teamId,
          zone: rc.zone,
        });
      }
      rc.progressTicks = Math.min(rules.channelTicks, rc.progressTicks + 1);
    }
  } else if (rc.progressTicks > 0) {
    rc.progressTicks = Math.max(0, rc.progressTicks - rules.decayMult);
  }

  if (rc.progressTicks >= rules.channelTicks && channellerId !== null) {
    completeRevive(world, rules, id, channellerId);
  }
  // …and nothing follows: with the lifetime gone (task #196) a circle that
  // reaches here simply survives to the next tick.
}

/** Destroy a circle without reviving anyone. The team charge is NOT spent. */
function despawn(
  world: SimWorld,
  id: EntityId,
  rc: import("../components").ReviveCircleComp,
  pos: { x: number; z: number },
  reason: string,
): void {
  world.emit("reviveCircleEnd", {
    id,
    ownerId: rc.ownerId,
    seatId: rc.ownerSeatId,
    teamId: rc.teamId,
    zone: rc.zone,
    x: pos.x,
    z: pos.z,
    reason,
  });
  world.destroy(id);
}

/**
 * Bring the owner back at the CHANNELLER's feet.
 *
 * State contract (docs/todo/revive-circles.md): partial HP/mana, keeps items /
 * gold / level / cooldowns, clears status + shields exactly like `enterCombat`,
 * and does NOT rewrite history — the death stays a death and the kill stays a
 * kill (task #25's counters and the S+..C- rating must never be corrupted).
 * The rescue scores on its own line instead: `revivesPerformed` on the
 * channeller, `revivesReceived` on the recipient.
 *
 * Position is the channeller's, not the ring centre — that prevents
 * body-blocking someone into the ring geometry — and is forced onto valid
 * terrain with the same helpers the flowers use.
 */
function completeRevive(
  world: SimWorld,
  rules: ReviveRules,
  id: EntityId,
  channellerId: EntityId,
): void {
  const rc = world.reviveCircle.get(id)!;
  const ownerHp = world.health.get(rc.ownerId)!;
  const ownerT = world.transform.get(rc.ownerId)!;
  const chT = world.transform.get(channellerId)!;

  const zoneDef = world.arena.zones[rc.zone] ?? world.arena.zones[0]!;
  const body = { pos: { x: chT.pos.x, z: chT.pos.z }, radius: ownerT.radius };
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  // #195: a champion may not come back OUTSIDE the fire ring — that is an
  // instant burn they never chose. Pull the spawn point toward the zone centre
  // until the whole body sits inside, with 0.1 u of slack so the very next tick
  // of shrink does not immediately push them out again.
  const inner = fireRingInnerRadius(world, rc.zone, ownerT.radius);
  if (inner !== null && inner > 0) {
    const maxD = inner - 0.1;
    const d2 = distSq(body.pos, zoneDef.center);
    if (maxD > 0 && d2 > maxD * maxD) {
      const d = Math.sqrt(d2);
      const s = d > 0 ? maxD / d : 0;
      body.pos = {
        x: zoneDef.center.x + (body.pos.x - zoneDef.center.x) * s,
        z: zoneDef.center.z + (body.pos.z - zoneDef.center.z) * s,
      };
    }
  }

  ownerT.pos = body.pos;
  ownerT.zone = rc.zone;
  ownerT.vel = { x: 0, z: 0 };
  ownerT.accel = 0;

  ownerHp.alive = true;
  // at least 1 HP: a 0% config must still produce a living champion
  ownerHp.hp = Math.max(1, ownerHp.maxHp * rules.reviveHpPctMax);
  ownerHp.mana = ownerHp.maxMana * rules.reviveManaPctMax;
  ownerHp.shields = [];

  const st = world.status.get(rc.ownerId);
  if (st) st.effects = []; // no pre-death DoT/CC carries through the grave
  const nav = world.nav.get(rc.ownerId);
  if (nav) {
    nav.order = null;
    nav.moveTarget = null;
    nav.attackTarget = null;
    nav.override = null;
  }
  const ab = world.abilities.get(rc.ownerId);
  if (ab) {
    // ability COOLDOWNS are deliberately not reset — they are tick-based and
    // kept running while dead, so you return with whatever happens to be up.
    ab.cast = null;
    ab.windup = null;
  }
  world.hitstop.delete(rc.ownerId);
  world.knockdown.delete(rc.ownerId);

  // the charge is spent HERE, on completion — never on spawn
  const left = world.reviveCharges.get(rc.teamId) ?? 0;
  world.reviveCharges.set(rc.teamId, Math.max(0, left - 1));

  recordRevive(world, channellerId, rc.ownerId);

  world.emit("reviveComplete", {
    id,
    ownerId: rc.ownerId,
    seatId: rc.ownerSeatId,
    channeller: channellerId,
    teamId: rc.teamId,
    zone: rc.zone,
    x: body.pos.x,
    z: body.pos.z,
  });
  world.destroy(id);
}
