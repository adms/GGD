/**
 * Revive circles (復活小火圈) — spawn/despawn helpers + the world-level rules
 * and bookkeeping the ReviveSystem runs on. Task #84.
 *
 * THE MECHANIC, in one line: when a champion dies in combat their team drops a
 * team-tinted fire ring on the corpse; a LIVING TEAMMATE who stands in it and
 * channels for `channelSec` brings them back — ONCE per team per round.
 *
 * This is the healing flower's skeleton (zone-scoped, tick-scheduled,
 * radius-based proximity, deterministic, server-authoritative, armed on combat
 * entry and torn down beside `endCombatFlowers`) with a different payload, and
 * it differs in exactly two deliberate ways:
 *
 *   1. A circle has **no health component and no TeamComp seat**. It is ground
 *      area, not a unit: never attackable, never a target, and structurally
 *      invisible to `teamAliveCount` / duel resolution / the scoreboard. Team
 *      ownership lives in `ReviveCircleComp.teamId` instead.
 *   2. It is TEAM-OWNED rather than neutral, so it renders in the team palette
 *      and only that team can drive it.
 *
 * TIMING SOURCE. Everything schedules off the ABSOLUTE `world.tick`, not
 * `world.combatTicks`. `combatTicks` is incremented inside `flowerSystem`,
 * which returns early when `flowerRules` is null — so a match with flowers
 * disabled would freeze the revive clock. `world.tick` is monotonic and
 * unconditional, equally deterministic, and decouples the two mechanics.
 * Combat gating comes from `world.reviveRules` being armed (the match host
 * arms it in `enterCombat` and clears it in `concludeCombat`), so a circle can
 * never exist outside combat and the client's prediction shadow world — which
 * never arms the rules — is a strict no-op.
 *
 * PURITY: no rng, no wall clock, no trig. A circle spawns AT THE CORPSE, so
 * unlike a flower it needs no position sampling at all.
 */
import type { EntityId, SeatId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";

/** EntityState.key / model doc id used for revive circles on the wire. */
export const REVIVE_CIRCLE_MODEL_KEY = "prop.revive-circle";

/**
 * Revive rules in TICKS (converted from the config doc's seconds).
 *
 * The tuned contract (see docs/todo/revive-circles.md for the measured
 * derivation of every number):
 *   channelSec 3.0  — long enough that a revive never outpaces a kill (above
 *                     the measured p25 death cadence of 2.00s), short enough
 *                     that the duel still exists when you finish.
 *   lifetimeSec 6.0 — exactly 2x the channel: "one channel's worth of travel
 *                     time", 17.4u of budget vs a max observed ally distance
 *                     of 17.04u. Reachable on instant commitment only.
 *   radius 2.0      — 1.7x a champion's own diameter (collision radius 0.6),
 *                     1/3 of the flower's burstRadius so the two ground
 *                     effects never read as the same thing.
 */
export interface ReviveRules {
  channelTicks: number;
  lifetimeTicks: number;
  radius: number;
  /** progress drain per tick while nobody is channelling (in progress-ticks) */
  decayMult: number;
  revivesPerTeamPerRound: number;
  reviveHpPctMax: number;
  reviveManaPctMax: number;
  /** an enemy inside the ring HOLDS progress (never resets it) */
  contestPauses: boolean;
  /** false: taking damage never interrupts (the measured melee-blob call) */
  damageInterrupts: boolean;
  /** true: stun/root/knockdown cancels the channel */
  ccInterrupts: boolean;
}

/** Seconds-based revive config (mirror of config.arena-rules@1 `reviveCircles`). */
export interface ReviveConfigLike {
  channelSec: number;
  lifetimeSec: number;
  radius: number;
  decayMult: number;
  revivesPerTeamPerRound: number;
  reviveHpPctMax: number;
  reviveManaPctMax: number;
  contestPauses: boolean;
  damageInterrupts: boolean;
  ccInterrupts: boolean;
}

/** Convert the seconds-based config block into tick-based sim rules. */
export function reviveRulesFromConfig(cfg: ReviveConfigLike, dt: number): ReviveRules {
  return {
    channelTicks: Math.max(1, Math.round(cfg.channelSec / dt)),
    lifetimeTicks: Math.max(1, Math.round(cfg.lifetimeSec / dt)),
    radius: cfg.radius,
    decayMult: cfg.decayMult,
    revivesPerTeamPerRound: cfg.revivesPerTeamPerRound,
    reviveHpPctMax: cfg.reviveHpPctMax,
    reviveManaPctMax: cfg.reviveManaPctMax,
    contestPauses: cfg.contestPauses,
    damageInterrupts: cfg.damageInterrupts,
    ccInterrupts: cfg.ccInterrupts,
  };
}

/** Revive charges left for a team this round (0 when unarmed/spent). */
export function reviveChargesFor(world: SimWorld, teamId: TeamId): number {
  return world.reviveCharges.get(teamId) ?? 0;
}

/**
 * The team's live circle in `zone`, if any. At most ONE circle per team is
 * ever alive: a second death while the first ring still burns drops nothing —
 * the existing ring is the team's only chance, and it still revives only its
 * own original owner.
 */
export function reviveCircleOfTeam(world: SimWorld, teamId: TeamId, zone: number): EntityId | null {
  for (const [id, rc] of world.reviveCircle) {
    if (rc.teamId === teamId && rc.zone === zone) return id;
  }
  return null;
}

/** Living champions of `teamId` currently in `zone` (the sim-side alive count). */
export function teamAliveInZone(world: SimWorld, teamId: TeamId, zone: number): number {
  let n = 0;
  for (const [id] of world.champion) {
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const team = world.team.get(id);
    if (t?.zone === zone && hp?.alive && team?.teamId === teamId) n++;
  }
  return n;
}

export interface SpawnReviveCircleArgs {
  ownerId: EntityId;
  ownerSeatId: SeatId;
  teamId: TeamId;
  zone: number;
  pos: Vec2;
  lifetimeTicks: number;
  radius: number;
}

/**
 * Spawn a team-owned revive circle: transform ONLY (+ the marker). No health,
 * no TeamComp, no nav, no stats — see the module doc for why that shape is
 * load-bearing rather than an omission.
 *
 * Emits `reviveCircleSpawn` {id, ownerId, seatId, teamId, zone, x, z, ticks}.
 */
export function spawnReviveCircle(world: SimWorld, args: SpawnReviveCircleArgs): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: args.pos.x, z: args.pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: args.radius,
    zone: args.zone,
  });
  world.reviveCircle.set(id, {
    ownerId: args.ownerId,
    ownerSeatId: args.ownerSeatId,
    teamId: args.teamId,
    zone: args.zone,
    spawnedAtTick: world.tick,
    expiresAtTick: world.tick + args.lifetimeTicks,
    progressTicks: 0,
    channellerId: null,
    contested: false,
  });
  world.emit("reviveCircleSpawn", {
    id,
    ownerId: args.ownerId,
    seatId: args.ownerSeatId,
    teamId: args.teamId,
    zone: args.zone,
    x: args.pos.x,
    z: args.pos.z,
    ticks: args.lifetimeTicks,
  });
  return id;
}

/**
 * Combat entry: arm the revive rules and hand every listed team its round
 * charge. Clears any stale circles first. Charges are keyed by TeamId (not by
 * zone) so they cannot leak across the two independent duels even when the
 * pairings change between rounds.
 */
export function beginCombatRevives(
  world: SimWorld,
  rules: ReviveRules,
  teams: readonly TeamId[],
): void {
  endCombatRevives(world);
  world.reviveRules = rules;
  for (const teamId of teams) {
    world.reviveCharges.set(teamId, rules.revivesPerTeamPerRound);
  }
}

/**
 * Combat exit (round end / phase leave): every circle despawns SILENTLY, every
 * in-flight channel dies with it, and all team charges reset. No revive ever
 * resolves across a phase boundary and no circle survives into resolution,
 * intermission or the settlement scene. Idempotent.
 */
export function endCombatRevives(world: SimWorld): void {
  for (const id of [...world.reviveCircle.keys()]) world.destroy(id);
  world.reviveCharges.clear();
  world.reviveRules = null;
}
