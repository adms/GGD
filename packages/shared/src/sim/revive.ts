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
 *   radius 2.0      — 1.7x a champion's own diameter (collision radius 0.6),
 *                     1/3 of the flower's burstRadius so the two ground
 *                     effects never read as the same thing.
 *
 * THERE IS NO LIFETIME. The ring used to burn for exactly 2x the channel and
 * then vanish; task #196 removed that clock on the owner's call
 * 「復活隊友的圈圈 沒有消失期限直到回合結束」 — which is also what LoL Arena
 * does: the wiki documents the downed-state zone and the one-revive-per-round
 * cap but no timeout on the zone itself. A circle now ends only for a REASON —
 * the owner came back, the owner's entity went away, the owner's team was
 * wiped out of the zone, or the round ended (`endCombatRevives`). None of this
 * makes revives unlimited: `revivesPerTeamPerRound` still gates that, and the
 * charge is still spent on completion only.
 */
export interface ReviveRules {
  channelTicks: number;
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
  radius: number;
}

/**
 * Spawn a team-owned revive circle: transform ONLY (+ the marker). No health,
 * no TeamComp, no nav, no stats — see the module doc for why that shape is
 * load-bearing rather than an omission.
 *
 * Emits `reviveCircleSpawn` {id, ownerId, seatId, teamId, zone, x, z}. There is
 * no `ticks` on the payload any more: the ring has no lifetime to announce.
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
 *
 * Since task #196 removed the per-circle lifetime this is the ONLY
 * unconditional despawn left, so it is the sole thing standing between a ring
 * and the next round. The match host calls it on every combat EXIT and again on
 * combat ENTRY (through `beginCombatRevives`), so even a path that skipped the
 * exit starts the next round clean.
 */
export function endCombatRevives(world: SimWorld): void {
  for (const id of [...world.reviveCircle.keys()]) world.destroy(id);
  world.reviveCharges.clear();
  world.reviveRules = null;
}
