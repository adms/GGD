/**
 * SimWorld — the deterministic authoritative world. A pure function of
 * (seed, ordered intents): no wall-clock, no Math.random, stable iteration
 * (entity ids ascend; stores iterate in insertion order == id order).
 */
import { asEntityId, type EntityId, type ItemId, type SeatId, type TeamId } from "../ids";
import { Rng } from "./math/rng";
import type { IntentFrame } from "./intents";
import type {
  Transform,
  Health,
  TeamComp,
  Navigation,
  ProjectileComp,
  ChampionComp,
  StatusComp,
  FlowerComp,
  ReviveCircleComp,
} from "./components";
import type { FlowerRules } from "./flowers";
import type { ReviveRules } from "./revive";
import { DEFAULT_COMBAT_ENV, type CombatEnvMultipliers } from "./combatEnv";
import type { StatsComp, AbilitiesComp } from "./stats/statsComp";
import type { PlayerMatchStats } from "./stats/matchStats";
import { accumulateTimeAlive } from "./stats/matchStats";
import type { DamagePacket } from "./combat/damage";
import { SpatialHash } from "./collision/spatialHash";
import type { ArenaDef } from "./world/ArenaDef";
import { TICK_MS } from "../constants";
import { orderSystem } from "./systems/OrderSystem";
import { movementSystem } from "./systems/MovementSystem";
import { statRecomputeSystem, buffExpirySystem } from "./stats/statPipeline";
import { commandSystem } from "./systems/CommandSystem";
import { castResolveSystem } from "./systems/CastResolveSystem";
import { basicAttackSystem } from "./systems/BasicAttackSystem";
import { projectileSystem } from "./systems/ProjectileSystem";
import { combatResolveSystem } from "./combat/damage";
import { deathSystem } from "./systems/DeathSystem";
import { flowerSystem } from "./systems/FlowerSystem";
import { reviveSystem } from "./systems/ReviveSystem";
import { regenSystem } from "./systems/RegenSystem";
import { statusExpirySystem } from "./systems/StatusSystem";
import { hitstopDecaySystem } from "./systems/HitstopSystem";

export interface SimEvent {
  type: string;
  tick: number;
  data: Record<string, unknown>;
}

export class SimWorld {
  tick = 0;
  readonly rng: Rng;
  readonly dt = TICK_MS / 1000;

  private nextId = 1;

  // Component stores — Map preserves insertion order; ids ascend, so iteration
  // order is deterministic.
  readonly transform = new Map<EntityId, Transform>();
  readonly health = new Map<EntityId, Health>();
  readonly team = new Map<EntityId, TeamComp>();
  readonly nav = new Map<EntityId, Navigation>();
  readonly projectile = new Map<EntityId, ProjectileComp>();
  readonly champion = new Map<EntityId, ChampionComp>();
  readonly status = new Map<EntityId, StatusComp>();
  readonly stats = new Map<EntityId, StatsComp>();
  readonly abilities = new Map<EntityId, AbilitiesComp>();
  readonly flower = new Map<EntityId, FlowerComp>();
  readonly reviveCircle = new Map<EntityId, ReviveCircleComp>();

  /**
   * Per-player match scoreboard (see stats/matchStats.ts). Part of world state
   * and folded into digest() so two seeded runs produce identical scoreboards
   * and client prediction never diverges on them. An entry is created per
   * champion by spawnChampion(); only champion entities ever accumulate.
   */
  readonly matchStats = new Map<EntityId, PlayerMatchStats>();

  /**
   * Assist bookkeeping: victim -> (enemy attacker -> last tick it damaged the
   * victim). Consulted by DeathSystem to credit assists, cleared on the victim's
   * death. Deterministic (tick-stamped), transient, NOT part of the digest.
   */
  readonly recentDamagers = new Map<EntityId, Map<EntityId, number>>();

  /** Multikill streak bookkeeping per killer (tick of last kill + streak len). */
  readonly killTracking = new Map<EntityId, { lastKillTick: number; streak: number }>();

  /**
   * Victims (champion entity ids) whose KILL BOUNTY has already been paid (task
   * #90). The one-time bounty is paid to the killer the FIRST time each enemy
   * champion dies; a revived-then-rekilled victim (same entity id across the
   * whole match) is already in this set, so it yields base kill gold but never
   * the bounty again. Deterministic bookkeeping keyed by ascending entity id —
   * like killTracking / recentDamagers its observable effect (goldEarned) is
   * already in the digest, so the set itself stays out of it.
   */
  readonly bountyPaid = new Set<EntityId>();

  /**
   * True only while a combat round is live. Gates time-alive accumulation (and
   * marks the window in which the scoreboard is meaningful). Set by the match
   * host on combat entry/exit; false during champ-select/intermission/settlement.
   */
  combatActive = false;

  /**
   * Combat-juice freeze state (deterministic, part of world state so client
   * prediction replays it identically). See systems/HitstopSystem.ts + combat/
   * damage.ts + docs COMBAT-JUICE notes.
   *
   * hitstop: per-entity remaining ticks of an on-impact FREEZE (both attacker
   *   and victim). While > 0 the entity's movement + attack wind-up advance +
   *   new-swing/cast starts are skipped (its ability/attack COOLDOWN timers keep
   *   ticking, so DPS/cadence — hence balance — is unchanged; hitstop only
   *   injects a brief positional/animation hold). Decremented once per tick by
   *   hitstopDecaySystem, which runs AFTER the movement/attack gates consult it
   *   but BEFORE combatResolveSystem sets a fresh value, so a hit landing on tick
   *   T freezes exactly ticks T+1..T+N (N = the value set).
   * knockdown: per-entity remaining ticks of a PRONE/rooted state from a heavy
   *   unblocked hit (movement rooted, attacks/casts blocked; the knockback slide
   *   still plays). Same decay/exact-N semantics as hitstop.
   * hitstun: per-entity (VICTIM-ONLY) remaining ticks of an action-lock that
   *   OUTLASTS the shared hitstop (>= it) — the attacker recovers first, so the
   *   defender is rooted out of auto/cast (but may still be shoved / walk) while
   *   on the back foot (frame advantage). Gates basicAttack/castResolve, not
   *   movement. Same decay/exact-N semantics as hitstop (see combat/damage.ts).
   */
  readonly hitstop = new Map<EntityId, number>();
  readonly knockdown = new Map<EntityId, number>();
  readonly hitstun = new Map<EntityId, number>();

  /** queued damage, drained by combatResolveSystem in one ordered pass */
  readonly damageQueue: DamagePacket[] = [];

  /** rebuilt each tick before systems run */
  readonly grid = new SpatialHash(4);

  /** events emitted this tick (drained by the host after step) */
  readonly events: SimEvent[] = [];

  /** whether intermission commands (buy/pick/rank) are currently legal */
  economyOpen = true;

  /**
   * Host-armed ITEM ELIGIBILITY predicate — the operator content whitelist,
   * projected into the sim as a pure function (task #82). null (default) means
   * "everything is eligible", which is what unit tests and the client's
   * prediction shadow world see.
   *
   * WHY THE SIM NEEDS IT AT ALL. The 傳說寶玉 rolls its 3-choose-1 INSIDE the
   * sim (it must, so the roll rides `rng` and replays identically), and the
   * pool has to be filtered BEFORE the roll. Post-filtering a rolled offer is
   * precisely the defect task #47 found: the round-2/5 weapon cards roll first
   * and then filter, so a whitelist that empties the table makes the card
   * silently grant nothing. Determinism is unaffected — like `combatEnv` and
   * `flowerRules` this is host CONFIG assigned once before tick 0 and identical
   * on every replica, never mutated by a system.
   */
  itemEligible: ((itemId: ItemId) => boolean) | null = null;

  /**
   * Arena-rules override for the ultimate rank gate. false (default) keeps the
   * classic champion-level 6/11/16 gate in rankUpAbility; the match host sets
   * it true once the configured unlock round is reached (LoL-Arena style).
   */
  ultGateOverride = false;

  /**
   * Current 1-based MATCH ROUND, host-set at each intermission entry from the
   * deterministic phase round (task #104). 0 (default) = NO round tracking —
   * unit tests and the client's prediction shadow world — which the stat-path
   * capstone round-gate treats as "ungated", so those call sites behave exactly
   * as before. Host state like ultGateOverride: assigned identically on every
   * replica from a deterministic source, never mutated by a system, so it stays
   * out of digest().
   */
  round = 0;

  /**
   * Healing-flower rules (ticks). null = flowers disabled (legacy behavior,
   * unit tests, the client's prediction shadow world). The match host arms
   * these via beginCombatFlowers/endCombatFlowers (see flowers.ts).
   */
  flowerRules: FlowerRules | null = null;

  /**
   * Global combat-environment multiplier table (see combatEnv.ts for the
   * per-key formula sites). Host-armed WORLD STATE like ultGateOverride /
   * flowerRules: the match host assigns it once BEFORE tick 0 and never
   * mutates it mid-match except through the same seam on every replica, so
   * determinism holds automatically (the sim never reads config/globals).
   * Defaults to the neutral all-1.0 table — unit tests and the client's
   * prediction shadow world behave byte-identically to the pre-env sim.
   */
  combatEnv: CombatEnvMultipliers = DEFAULT_COMBAT_ENV;

  /**
   * Combat-elapsed ticks driving the flower spawn cadence. -1 = not in combat
   * (FlowerSystem idles). Set to 0 by beginCombatFlowers on combat entry and
   * incremented by FlowerSystem each tick, so the counter is part of the
   * deterministic world state.
   */
  combatTicks = -1;

  /** duel zones armed for flower spawns this combat */
  readonly flowerZones = new Set<number>();

  /** zone -> combatTicks value at which that zone's next flower spawns */
  readonly flowerNextSpawn = new Map<number, number>();

  /**
   * Revive-circle rules (ticks). null = the mechanic is OFF (legacy behavior,
   * unit tests, the client's prediction shadow world). The match host arms
   * these via beginCombatRevives/endCombatRevives (see revive.ts). Unlike the
   * flowers, the revive clock runs off the ABSOLUTE `tick` rather than
   * `combatTicks` — see the revive.ts module doc for why.
   */
  reviveRules: ReviveRules | null = null;

  /**
   * Remaining revive charges this ROUND, per team. Armed to
   * `revivesPerTeamPerRound` on combat entry, spent on a COMPLETED revive
   * (never on spawn), cleared on combat exit. One per team is the largest
   * value that keeps the worst measured duel inside the 90s `combatMaxSec`
   * cap — see docs/todo/revive-circles.md.
   */
  readonly reviveCharges = new Map<TeamId, number>();

  constructor(
    public readonly arena: ArenaDef,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  spawn(): EntityId {
    return asEntityId(this.nextId++);
  }

  destroy(id: EntityId): void {
    this.transform.delete(id);
    this.health.delete(id);
    this.team.delete(id);
    this.nav.delete(id);
    this.projectile.delete(id);
    this.champion.delete(id);
    this.status.delete(id);
    this.stats.delete(id);
    this.abilities.delete(id);
    this.flower.delete(id);
    this.reviveCircle.delete(id);
    this.hitstop.delete(id);
    this.knockdown.delete(id);
    this.hitstun.delete(id);
    this.matchStats.delete(id);
    this.recentDamagers.delete(id);
    this.killTracking.delete(id);
    this.bountyPaid.delete(id);
  }

  emit(type: string, data: Record<string, unknown>): void {
    this.events.push({ type, tick: this.tick, data });
  }

  /**
   * Rebuild the broad-phase grid from current unit positions. Runs automatically
   * at the top of step(); public so hosts casting abilities OUTSIDE the tick
   * (tests, editor preview) can refresh spatial queries first.
   */
  rebuildGrid(): void {
    this.grid.clear();
    for (const [id, t] of this.transform) {
      // Revive circles are GROUND AREA, not bodies: keeping them out of the
      // broad-phase is what makes them structurally untargetable (every
      // ability/projectile query walks this grid) and non-colliding.
      if (this.reviveCircle.has(id)) continue;
      this.grid.insertCircle(id, t.pos, t.radius);
    }
  }

  /**
   * Advance one fixed tick. `intents` maps seatId -> that seat's IntentFrame
   * (already sequenced by the host). System order is FIXED — the client
   * prediction replays this exact order.
   */
  step(intents: ReadonlyMap<SeatId, IntentFrame>): void {
    this.events.length = 0;
    this.rebuildGrid();

    // FIXED system order — the client prediction replays this exact order.
    statRecomputeSystem(this); // 1. recompute dirty stats
    buffExpirySystem(this); //    1b. expire timed buff sources
    statusExpirySystem(this); // 2. expire statuses (slows/roots/stuns)
    castResolveSystem(this); //   2b. resolve elapsing ability casts (cast time)
    commandSystem(this, intents); // 3. cast / buy / pick / rank commands
    orderSystem(this, intents); // 4. orders -> nav targets
    movementSystem(this); // 5. integrate + collide
    basicAttackSystem(this); // 6. autos on attack targets in range
    projectileSystem(this); // 7. advance projectiles, swept hits
    hitstopDecaySystem(this); //  7b. age hitstop/knockdown AFTER their gates ran
    //                             (movement/attack), BEFORE this tick's hits set
    //                             fresh values -> a hit on tick T freezes exactly
    //                             T+1..T+N (see SimWorld.hitstop docs).
    combatResolveSystem(this); // 8. drain damage queue (mitigation/shields/hooks
    //                             + combat-juice: hitstop/knockback/knockdown)
    deathSystem(this); // 9. deaths, kill credit, xp/gold
    flowerSystem(this); //   9b. flower burst on death + spawn cadence (no-op unless armed)
    reviveSystem(this); //   9c. revive circles: drop on death, channel, revive/expire
    //                             (no-op unless armed; consumes this tick's deaths)
    regenSystem(this); // 10. hp/mana regen
    statRecomputeSystem(this); // 11. late recompute for same-tick attaches
    accumulateTimeAlive(this); // 12. match-stat time-alive (combat-gated)

    this.tick++;
  }

  /**
   * Deterministic state digest for replay/parity tests — hashes every entity's
   * planar state + rng state into a 32-bit value.
   */
  digest(): number {
    let h = 0x811c9dc5;
    const mix = (n: number): void => {
      // quantize floats so the digest is stable against representation noise
      const q = Math.round(n * 4096);
      h ^= q & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= (q >>> 8) & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= (q >>> 16) & 0xff;
      h = Math.imul(h, 0x01000193);
    };
    for (const [id, t] of this.transform) {
      mix(id);
      mix(t.pos.x);
      mix(t.pos.z);
      mix(t.facing.x);
      mix(t.facing.z);
      const hp = this.health.get(id);
      if (hp) {
        mix(hp.hp);
        mix(hp.mana);
      }
      // combat-juice freeze state is part of world state (a desync in either
      // shows up here as well as in the positions it gates)
      mix(this.hitstop.get(id) ?? 0);
      mix(this.knockdown.get(id) ?? 0);
      mix(this.hitstun.get(id) ?? 0);
    }
    // match scoreboard is authoritative world state — a desync here (a counter
    // that fired on one run but not the other) surfaces as a digest mismatch.
    for (const [id, s] of this.matchStats) {
      mix(id);
      mix(s.kills);
      mix(s.deaths);
      mix(s.assists);
      mix(s.damageDealt);
      mix(s.damageTaken);
      mix(s.damageBlocked);
      mix(s.healingDone);
      mix(s.ccAppliedTicks);
      mix(s.goldEarned);
      mix(s.xp);
      mix(s.abilityCasts);
      mix(s.abilityHits);
      mix(s.abilityWhiffs);
      mix(s.basicAttackHits);
      mix(s.flowersEaten);
      mix(s.timeAliveTicks);
      mix(s.killParticipation);
      mix(s.largestSingleHit);
      mix(s.multikills);
      mix(s.revivesPerformed);
      mix(s.revivesReceived);
    }
    // revive circles are authoritative world state: a channel that advanced on
    // one replica but not another shows up here as a digest mismatch.
    for (const [id, rc] of this.reviveCircle) {
      mix(id);
      mix(rc.progressTicks);
      mix(rc.expiresAtTick);
      mix(rc.contested ? 1 : 0);
    }
    for (const [teamId, charges] of this.reviveCharges) {
      mix(teamId);
      mix(charges);
    }
    mix(this.rng.state);
    mix(this.tick);
    return h >>> 0;
  }
}
