/**
 * MatchController — the headless authoritative match orchestrator. Owns the
 * SimWorld, Seats, PhaseMachine, PairedDuels pairing, offers, and rewards.
 * The Colyseus MatchRoom is a thin network wrapper around this class, so the
 * whole match flow is unit-testable without sockets.
 */
import {
  SEAT_COUNT,
  TEAM_COUNT,
  TEAM_SIZE,
} from "@ggd/shared/constants";
import { asSeatId, asTeamId, type AugmentId, type ChampionId, type EntityId, type ItemId, type SeatId, type TeamId } from "@ggd/shared/ids";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { DEFAULT_COMBAT_ENV, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { SKELETON_ARENA, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions, Abilities, LootTables } from "@ggd/shared/sim/content/registry";
import { Models } from "@ggd/shared/content";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { grade, perMatchRanks } from "@ggd/shared/sim/stats/rating";
import type { MatchSettlement, SettlementPlayer } from "@ggd/shared/protocol/messages";
import {
  beginCombatFlowers,
  endCombatFlowers,
  flowerRulesFromConfig,
  pickFlowerSpawnPos,
  spawnFlower,
} from "@ggd/shared/sim/flowers";
import {
  beginCombatRevives,
  endCombatRevives,
  reviveRulesFromConfig,
} from "@ggd/shared/sim/revive";
import { DEFAULT_FLOWER_CONFIG } from "@ggd/shared/content";
import type { IntentFrame, AbilitySlot } from "@ggd/shared/sim/intents";
import type { Cheat } from "@ggd/shared/protocol/messages";
import {
  offerAugments,
  applyAugmentPick,
  offerItems,
  applyItemPick,
  ITEM_OFFER_TIER,
  type AugmentOffer,
  type ItemOffer,
} from "@ggd/shared/sim/economy/draft";
import { rollItemReward, grantItemFree } from "@ggd/shared/sim/economy/shop";
import { releaseOrbSlot } from "@ggd/shared/sim/economy/legendaryOrb";
import { rankUpAbility, learnEx } from "@ggd/shared/sim/abilities/abilitySystem";
import {
  grantGold,
  grantLevels,
  grantXp,
  GOLD_REWARDS,
  XP_REWARDS,
  LEVEL_CAP,
  STARTING_GOLD,
} from "@ggd/shared/sim/economy/progression";
import { Seat, type SeatDriver } from "../seat/Seat";
import { AIDriver } from "../ai/Tier0Brain";
import { Whitelist } from "../curation/whitelist";
import { PhaseMachine, type MatchPhase, type PhaseConfig, DEFAULT_PHASE_CONFIG } from "./PhaseMachine";
import { pairTeams, livesLost, type DuelPairing } from "./PairedDuels";
import { DEFAULT_ARENA_RULES, grantForRound, type ArenaRules } from "./arenaRules";

export interface SeatSpec {
  seatId: number;
  teamId: number;
  accountId?: string;
  displayName?: string;
  championId?: string;
  isBot: boolean;
}

/**
 * Outcome of a SELECT_CHAMPION. On rejection the `reason` is surfaced to the
 * client so champ-select can explain WHY (wrong phase / unknown champion /
 * not on the content whitelist), never a silent no-op.
 */
export type SelectReason = "wrong-phase" | "no-seat" | "unknown-champion" | "not-whitelisted";
export type SelectResult = { ok: true } | { ok: false; reason: SelectReason };

export interface TeamResult {
  teamId: number;
  placement: number;
  members: { seatId: number; accountId: string; kills: number; deaths: number; isBot: boolean }[];
}

export interface MatchResult {
  matchId: string;
  mode: "PairedDuels";
  seed: number;
  rounds: number;
  teams: TeamResult[];
}

/**
 * A stored intermission offer: an augment draft OR a free-item ("legendary
 * weapon") draft. Both expose tier/choices/picked, so the OfferState snapshot
 * projection and the AI auto-pick path stay kind-agnostic.
 */
export type StoredOffer = (
  | ({ kind: "augment" } & AugmentOffer)
  | ({ kind: "item" } & ItemOffer)
) & {
  seatId: SeatId;
  createdTick: number;
  /**
   * True for a 傳說寶玉 card, which reserved an inventory slot when it rolled
   * (task #82). `applyPick` releases the reservation as the card resolves.
   */
  reservesSlot?: boolean;
};

export class MatchController {
  readonly world: SimWorld;
  readonly seats = new Map<SeatId, Seat>();
  readonly phase: PhaseMachine;
  readonly lives = new Map<TeamId, number>();
  readonly placements = new Map<TeamId, number>();
  readonly kills = new Map<SeatId, number>();
  readonly deaths = new Map<SeatId, number>();
  /** current round's pairings + bye */
  pairings: DuelPairing[] = [];
  bye: TeamId | null = null;
  /** open intermission offers per seat (offerId -> augment/item offer) */
  readonly offers = new Map<string, StoredOffer>();
  result: MatchResult | null = null;

  /**
   * True once the MATCH outcome is decided (<=1 team left). Set at the end of the
   * final combat round, so it flips during the last `resolution` phase — a few
   * seconds BEFORE matchEnd. While set, tick() STOPS gathering seat intents
   * (human AND AI), so champions idle and the settlement front-view shows a
   * still hero. Deterministic (derived from team lives), so client prediction
   * replays the freeze identically.
   */
  outcomeDecided = false;

  /**
   * The victory-settlement payload (per-player scoreboard + grade + rank +
   * winner), computed once at matchEnd. MatchRoom broadcasts it on MSG.EVENT.
   */
  settlement: MatchSettlement | null = null;

  /**
   * Dev-cheat toggles (offline testing only; MatchRoom hard-gates the channel).
   * Keyed by seatId so they survive champion swaps (which change entityId). The
   * per-tick sustain in tick() honors them AFTER the sim step.
   */
  private readonly godModeSeats = new Set<SeatId>();
  private readonly zeroCdSeats = new Set<SeatId>();

  private specs = new Map<SeatId, SeatSpec>();
  private duelWinners = new Map<number, TeamId>(); // zone -> winner this round

  constructor(
    public readonly matchId: string,
    seed: number,
    seatSpecs: SeatSpec[],
    phaseCfg: PhaseConfig = DEFAULT_PHASE_CONFIG,
    public readonly startingLives = 3,
    /** round-rules table; DEFAULT_ARENA_RULES = exact legacy behavior */
    public readonly rules: ArenaRules = DEFAULT_ARENA_RULES,
    /** map geometry (collision truth); default = built-in skeleton */
    public readonly arena: ArenaDef = SKELETON_ARENA,
    /**
     * Content whitelist snapshot resolved at match creation. Default =
     * allow-all, so every existing call site and unit test is unchanged; the
     * platform-driven path (MatchRoom) passes the fetched whitelist.
     */
    public readonly whitelist: Whitelist = Whitelist.allowAll(),
    /**
     * Global combat-environment multiplier table, resolved BY THE CALLER at
     * match creation (MatchRoom merges the config.combat-env@1 content
     * defaults + the admin 戰鬥系統 override, same pattern as the whitelist —
     * see config/combatEnv.ts). Injected into the SimWorld before tick 0 so
     * determinism holds; the DEFAULT all-1.0 table keeps every existing call
     * site and unit test byte-identical.
     */
    public readonly combatEnv: CombatEnvMultipliers = DEFAULT_COMBAT_ENV,
  ) {
    registerSkeletonContent();
    this.world = new SimWorld(arena, seed);
    this.world.combatEnv = combatEnv;
    // Project the operator whitelist into the sim as a pure predicate. The
    // 傳說寶玉 rolls its 3-choose-1 inside the sim (so the roll rides world.rng
    // and replays identically) and must filter the pool BEFORE rolling — the
    // round-2/5 cards roll first and filter after, which is exactly how task
    // #47's "the card silently grants nothing" bug happened. allowAll leaves
    // this a constant-true, so nothing changes on the default path.
    this.world.itemEligible = this.whitelist.bypass ? null : (itemId) => this.whitelist.allowsItem(itemId);
    this.phase = new PhaseMachine(phaseCfg);

    for (const spec of seatSpecs) {
      const seatId = asSeatId(spec.seatId);
      // The bot's build path is whitelist-aware: a buildPriority entry the
      // operator has not enabled is SKIPPED, not stalled on. Without this the
      // buyItem filter below silently freezes a bot on its first blocked rung.
      const seat = new Seat(
        seatId,
        asTeamId(spec.teamId),
        new AIDriver((itemId) => this.whitelist.allowsItem(itemId)),
      );
      seat.accountId = spec.accountId ?? `bot-${spec.seatId}`;
      seat.displayName = spec.displayName ?? (spec.isBot ? `Bot ${spec.seatId}` : `Player ${spec.seatId}`);
      if (spec.championId) seat.championId = spec.championId;
      this.seats.set(seatId, seat);
      this.specs.set(seatId, spec);
      this.kills.set(seatId, 0);
      this.deaths.set(seatId, 0);
    }
    for (let t = 0; t < TEAM_COUNT; t++) this.lives.set(asTeamId(t), startingLives);
  }

  // ---------- champ select ----------

  selectChampion(seatId: SeatId, championId: string): SelectResult {
    if (this.phase.phase !== "champSelect") return { ok: false, reason: "wrong-phase" };
    const seat = this.seats.get(seatId);
    if (!seat) return { ok: false, reason: "no-seat" };
    if (!Champions.tryGet(championId as ChampionId)) return { ok: false, reason: "unknown-champion" };
    // AUTHORITATIVE whitelist gate: a champion not enabled by the operator can
    // never be selected online (allow-all in dev/bypass leaves this open).
    if (!this.whitelist.allowsChampion(championId)) return { ok: false, reason: "not-whitelisted" };
    seat.championId = championId;
    return { ok: true };
  }

  /**
   * The champion pool a RANDOM/bot pick draws from: content-loaded champions
   * that have a model, intersected with the whitelist. If the whitelist yields
   * an empty pool (fresh/empty install) the server FALLS BACK to the full pool
   * so a botted match still runs — the human empty-state is a champ-select
   * concern on the client, never a crashed match here.
   */
  randomChampionPool(): ChampionId[] {
    const all = Champions.ids();
    const withModel = all.filter((cid) => Models.tryGet(Champions.get(cid).modelKey) !== undefined);
    const base = withModel.length > 0 ? withModel : all;
    const allowed = this.whitelist.filterChampions(base) as ChampionId[];
    if (allowed.length > 0) return allowed;
    if (!this.whitelist.bypass) {
      console.warn(
        `[match ${this.matchId}] whitelist enables no playable champion — bots fall back to the ` +
          `full pool so the match runs. Enable champions in the admin console.`,
      );
    }
    return base;
  }

  private autoPickAndSpawn(): void {
    // uniform pick over the whitelisted, model-backed champion pool (falls back
    // to the full pool when the whitelist would starve the match — see
    // randomChampionPool).
    const pool = this.randomChampionPool();
    for (const [seatId, seat] of this.seats) {
      // Assign a champion when unset, OR when a pre-set one (from the match
      // spec) is no longer whitelisted — so a champion removed from the
      // whitelist after the match was created can never actually spawn.
      if (!seat.championId || !this.whitelist.allowsChampion(seat.championId)) {
        seat.championId = pool[this.world.rng.int(pool.length)]!;
      }
      // spawn at team's eventual side; positions are reset at each combat entry
      const zone = 0;
      const side = seat.teamId % 2;
      const slot = seatId % TEAM_SIZE;
      const spawn = this.arena.zones[zone]!.spawns[side as 0 | 1]![slot]!;
      seat.entityId = spawnChampion(this.world, {
        championId: seat.championId as ChampionId,
        seatId,
        teamId: seat.teamId,
        pos: spawn,
        zone,
      });
      // Starting gold. 600, not 500 (task #82 found the drift): every design
      // document — the shop pacing, starter.go's `startingGold`, the 7600g
      // match-income arithmetic the whole price ladder is derived from —
      // assumes 600. At 500 the turn-1 purse buys ONE 300g SIMPLE item instead
      // of two, which deletes the opening decision the prices exist to create.
      grantGold(this.world, seat.entityId, STARTING_GOLD);
    }
  }

  // ---------- round lifecycle ----------

  private aliveTeams(): TeamId[] {
    return [...this.lives.entries()].filter(([, l]) => l > 0).map(([t]) => t);
  }

  /** seats that still play (spawned + team not eliminated), in map order. */
  private *activeSeats(): Generator<[SeatId, Seat, EntityId]> {
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      if ((this.lives.get(seat.teamId) ?? 0) <= 0) continue;
      yield [seatId, seat, seat.entityId];
    }
  }

  private enterIntermission(): void {
    this.world.economyOpen = true;
    this.world.combatActive = false; // scoreboard time-alive pauses between rounds
    for (const seat of this.seats.values()) seat.ready = false;
    const round = this.phase.round;
    // Project the deterministic round into the sim so the stat-path capstone
    // round-gate (task #104) can withhold 傳說·萬象強化 before 「大約是第五場
    // 之後」. Shop buys happen during this intermission, so setting it here — the
    // one place `round` is already read — is the right seam and timing.
    this.world.round = round;

    // arena rules: once the ult unlock round is reached, R ranks at any level
    if (this.rules.ultUnlockRound !== null && round >= this.rules.ultUnlockRound) {
      this.world.ultGateOverride = true;
    }

    // arena rules: at the EX-unlock round, every active champion that HAS a
    // per-hero EX skill unlocks it (WC3 level-30 gate). learnEx is idempotent
    // and a no-op for heroes without an exSlot; it emits `exUnlock` for the HUD
    // toast + VFX cue. Runs once per champion (rank 0 -> 1). The EX ability is a
    // separately-curated unlockable, so it only unlocks when the ability is on
    // the whitelist (bypass/allow-all lets every EX through, unchanged).
    if (this.rules.exUnlockRound !== null && round >= this.rules.exUnlockRound) {
      for (const [, , entity] of this.activeSeats()) {
        const exId = this.world.abilities.get(entity)?.exSlot?.abilityId;
        if (exId && this.whitelist.allowsAbility(exId)) learnEx(this.world, entity);
      }
    }

    const grant = grantForRound(this.rules, round);

    // 1) deterministic round grants BEFORE offers: levels -> auto-learn -> gold
    if (grant) {
      for (const [, , entity] of this.activeSeats()) {
        if (grant.grantLevels) grantLevels(this.world, entity, grant.grantLevels);
        if (grant.autoLearn) {
          for (const slot of grant.autoLearn) {
            const ab = this.world.abilities.get(entity);
            if (ab && ab.slots[slot].rank === 0) rankUpAbility(this.world, entity, slot);
          }
        }
        if (grant.grantGold) grantGold(this.world, entity, grant.grantGold);
      }
    }

    // 2) augment offers (3-choose-1) on scheduled rounds
    if (grant?.augmentTier) {
      for (const [seatId, , entity] of this.activeSeats()) {
        const offer = offerAugments(this.world, entity, grant.augmentTier, this.rules.offerCount);
        if (offer.choices.length > 0) {
          this.offers.set(`${round}:${seatId}`, {
            kind: "augment",
            ...offer,
            seatId,
            createdTick: this.world.tick,
          });
        }
      }
    }

    // 3) legendary-weapon offers (3-choose-1, granted FREE on pick). The rolled
    //    choices are filtered to the whitelist so a non-enabled item is never
    //    offered; an offer with no whitelisted choices left is dropped.
    if (grant?.weaponLootTable) {
      for (const [seatId, , entity] of this.activeSeats()) {
        const offer = offerItems(this.world, entity, grant.weaponLootTable, this.rules.offerCount);
        offer.choices = this.whitelist.filterItems(offer.choices);
        if (offer.choices.length > 0) {
          this.offers.set(`${round}:${seatId}:w`, {
            kind: "item",
            ...offer,
            seatId,
            createdTick: this.world.tick,
          });
        } else {
          // Task #47's silent failure, now AUDIBLE. Rolling first and filtering
          // after means an under-seeded whitelist turns the free weapon card
          // into nothing at all, with no trace anywhere. (The 傳說寶玉 avoids
          // the class of bug entirely — it filters BEFORE the roll and refuses
          // the purchase rather than charging for an empty card.)
          console.warn(
            `[match ${this.matchId}] round ${round} seat ${seatId}: the ${grant.weaponLootTable} ` +
              `card rolled nothing the whitelist allows — this seat gets NO weapon. Enable more ` +
              `items in the admin console (內容白名單).`,
          );
        }
      }
    }

    // 4) legacy item gacha reward (道具抽卡) for every surviving seat, rolled
    //    only over whitelisted loot entries.
    if (this.rules.gacha && round >= this.rules.gacha.fromRound) {
      const table = this.rules.gacha.lootTable;
      for (const [, , entity] of this.activeSeats()) {
        this.grantGachaReward(entity, table);
      }
    }
  }

  /**
   * One gacha grant, whitelist-aware. In bypass/allow-all this delegates to the
   * shared roll for byte-identical legacy behavior; otherwise it rolls a
   * weighted pick restricted to whitelisted loot entries (skips when none
   * qualify), so a non-enabled item is never granted.
   */
  private grantGachaReward(entity: EntityId, tableId: string): void {
    if (this.whitelist.bypass) {
      rollItemReward(this.world, entity, tableId);
      return;
    }
    const table = LootTables.tryGet(tableId);
    if (!table) return;
    const pool = table.entries.filter((e) => this.whitelist.allowsItem(e.itemId));
    if (pool.length === 0) return;
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let roll = this.world.rng.next() * total;
    let picked = pool[pool.length - 1]!.itemId;
    for (const e of pool) {
      roll -= e.weight;
      if (roll <= 0) {
        picked = e.itemId;
        break;
      }
    }
    grantItemFree(this.world, entity, picked);
  }

  private enterCombat(): void {
    this.world.economyOpen = false;
    this.world.combatActive = true; // scoreboard time-alive accrues during combat
    this.offers.clear();
    this.duelWinners.clear();

    const { pairings, bye } = pairTeams(this.aliveTeams(), this.phase.round);
    this.pairings = pairings;
    this.bye = bye;

    // park everyone dead first; revive the fighters at their duel spawns
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      const hp = this.world.health.get(seat.entityId);
      if (hp) {
        hp.alive = false;
        hp.hp = 0;
      }
      const nav = this.world.nav.get(seat.entityId);
      if (nav) {
        nav.order = null;
        nav.moveTarget = null;
        nav.attackTarget = null;
        nav.override = null;
      }
    }
    for (const pairing of this.pairings) {
      const zoneDef = this.arena.zones[pairing.zone]!;
      for (const [side, teamId] of [
        [0, pairing.sideA],
        [1, pairing.sideB],
      ] as const) {
        let slot = 0;
        for (const seat of this.seats.values()) {
          if (seat.teamId !== teamId || seat.entityId === null) continue;
          const t = this.world.transform.get(seat.entityId)!;
          const spawn = zoneDef.spawns[side]![slot % TEAM_SIZE]!;
          t.pos = { x: spawn.x, z: spawn.z };
          t.zone = pairing.zone;
          t.facing = { x: side === 0 ? 1 : -1, z: 0 };
          const hp = this.world.health.get(seat.entityId)!;
          hp.alive = true;
          hp.hp = hp.maxHp;
          hp.mana = hp.maxMana;
          hp.shields = [];
          const st = this.world.status.get(seat.entityId);
          if (st) st.effects = [];
          slot++;
        }
      }
    }
    // clear stray projectiles between rounds
    for (const [id] of this.world.projectile) this.world.destroy(id);

    // arm the healing-flower schedule for this round's duel zones (despawns
    // any stale flowers first; no-op when the rules doc has no flowers block)
    if (this.rules.flowers) {
      beginCombatFlowers(
        this.world,
        flowerRulesFromConfig(this.rules.flowers, this.world.dt),
        this.pairings.map((p) => p.zone),
      );
    } else {
      endCombatFlowers(this.world);
    }

    // arm the revive circles for this round (task #84). Charges are per TEAM
    // per ROUND, so they are handed out here — to EVERY team still alive,
    // including the bye — and cleared by concludeCombat. Absent block = the
    // mechanic is simply off, exactly like the flowers' legacy-compat rule.
    if (this.rules.reviveCircles) {
      beginCombatRevives(
        this.world,
        reviveRulesFromConfig(this.rules.reviveCircles, this.world.dt),
        this.aliveTeams(),
      );
    } else {
      endCombatRevives(this.world);
    }
  }

  private teamAliveCount(teamId: TeamId, zone: number): number {
    let n = 0;
    for (const seat of this.seats.values()) {
      if (seat.teamId !== teamId || seat.entityId === null) continue;
      const t = this.world.transform.get(seat.entityId);
      const hp = this.world.health.get(seat.entityId);
      if (t?.zone === zone && hp?.alive) n++;
    }
    return n;
  }

  private teamHpPct(teamId: TeamId, zone: number): number {
    let sum = 0;
    for (const seat of this.seats.values()) {
      if (seat.teamId !== teamId || seat.entityId === null) continue;
      const t = this.world.transform.get(seat.entityId);
      const hp = this.world.health.get(seat.entityId);
      if (t?.zone === zone && hp?.alive && hp.maxHp > 0) sum += hp.hp / hp.maxHp;
    }
    return sum;
  }

  /** Check duel outcomes; returns true when every pairing is decided. */
  private checkCombatEnd(timerExpired: boolean): boolean {
    for (const pairing of this.pairings) {
      if (this.duelWinners.has(pairing.zone)) continue;
      const aAlive = this.teamAliveCount(pairing.sideA, pairing.zone);
      const bAlive = this.teamAliveCount(pairing.sideB, pairing.zone);
      if (aAlive === 0 && bAlive === 0) {
        this.duelWinners.set(pairing.zone, this.world.rng.chance(0.5) ? pairing.sideA : pairing.sideB);
      } else if (bAlive === 0) {
        this.duelWinners.set(pairing.zone, pairing.sideA);
      } else if (aAlive === 0) {
        this.duelWinners.set(pairing.zone, pairing.sideB);
      } else if (timerExpired) {
        const aPct = this.teamHpPct(pairing.sideA, pairing.zone);
        const bPct = this.teamHpPct(pairing.sideB, pairing.zone);
        this.duelWinners.set(
          pairing.zone,
          aPct > bPct ? pairing.sideA : bPct > aPct ? pairing.sideB : this.world.rng.chance(0.5) ? pairing.sideA : pairing.sideB,
        );
      }
    }
    return this.duelWinners.size === this.pairings.length;
  }

  private settleRound(): void {
    for (const pairing of this.pairings) {
      const winner = this.duelWinners.get(pairing.zone);
      if (winner === undefined) continue;
      const loser = winner === pairing.sideA ? pairing.sideB : pairing.sideA;
      this.lives.set(loser, Math.max(0, (this.lives.get(loser) ?? 0) - livesLost(this.phase.round)));

      for (const seat of this.seats.values()) {
        if (seat.entityId === null) continue;
        if (seat.teamId === winner) {
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundWin);
          grantXp(this.world, seat.entityId, XP_REWARDS.roundSurvive);
        } else if (seat.teamId === loser) {
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundLose);
          grantXp(this.world, seat.entityId, Math.floor(XP_REWARDS.roundSurvive / 2));
        }
      }
      const winTeamIdx = winner as number;
      void winTeamIdx;
    }
    // bye team gets loser-level gold (didn't fight)
    if (this.bye !== null) {
      for (const seat of this.seats.values()) {
        if (seat.teamId === this.bye && seat.entityId !== null) {
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundLose);
        }
      }
    }

    // eliminations lock placements from the bottom; teams eliminated in the
    // SAME round get distinct consecutive placements (deterministic: lives-map
    // iteration order = ascending team id gets the worse placement first)
    const newlyEliminated = [...this.lives.entries()]
      .filter(([teamId, l]) => l <= 0 && !this.placements.has(teamId))
      .map(([teamId]) => teamId);
    let place = this.aliveTeams().length + newlyEliminated.length;
    for (const teamId of newlyEliminated) this.placements.set(teamId, place--);
  }

  /**
   * Wrap up a finished combat round: despawn flowers, settle lives/placements,
   * stop time-alive accrual, and — if the MATCH is now decided (<=1 team left) —
   * latch outcomeDecided and freeze every champion so the settlement front-view
   * shows a still hero. Shared by the normal combat→resolution transition and
   * the skipPhase cheat.
   */
  private concludeCombat(): void {
    endCombatFlowers(this.world); // round over: all flowers despawn
    endCombatRevives(this.world); // …and every circle + in-flight channel dies
    this.settleRound();
    this.world.combatActive = false;
    if (this.aliveTeams().length <= 1) {
      this.outcomeDecided = true;
      this.freezeControls();
    }
  }

  /**
   * Halt every champion: clear nav orders/targets/overrides and any in-progress
   * cast / basic-attack wind-up. Combined with tick() skipping intent gathering
   * while outcomeDecided is set, this pins each champion idle in place for the
   * victory settlement (still hero, no drift/casts). Deterministic — mutates
   * only world state the sim already owns.
   */
  private freezeControls(): void {
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      const nav = this.world.nav.get(seat.entityId);
      if (nav) {
        nav.order = null;
        nav.moveTarget = null;
        nav.attackTarget = null;
        nav.override = null;
      }
      const t = this.world.transform.get(seat.entityId);
      if (t) {
        t.vel = { x: 0, z: 0 }; // kill residual momentum so the hero stands still
        t.accel = 0;
      }
      const ab = this.world.abilities.get(seat.entityId);
      if (ab) {
        ab.cast = null;
        ab.windup = null;
      }
    }
  }

  /**
   * Assemble the victory-settlement payload: every player's scoreboard, their
   * role-normalised grade (vs the lobby), and their per-match rank 1..N, plus
   * the winning team. Pure read of world.matchStats + the rating module. The
   * ranked ladder deltas (pointsDelta / tier) are left undefined — the platform
   * fills them on the leaderboard screen.
   */
  private buildSettlement(): MatchSettlement {
    const players: SettlementPlayer[] = [];
    const entries: { stats: PlayerMatchStats; role: string }[] = [];
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      const stats = this.world.matchStats.get(seat.entityId) ?? createMatchStats();
      const cdef = Champions.tryGet(seat.championId as ChampionId);
      const role = cdef?.role ?? "fighter";
      entries.push({ stats, role });
      players.push({
        seatId,
        accountId: seat.accountId,
        champ: seat.championId,
        teamId: seat.teamId,
        role,
        grade: "C", // replaced below (kept non-optional for the type)
        rank: 0, // replaced below
        stats,
      });
    }
    const lobby = entries.map((e) => e.stats);
    const ranks = perMatchRanks(entries);
    players.forEach((p, i) => {
      p.grade = grade(entries[i]!.stats, lobby, entries[i]!.role);
      p.rank = ranks[i]!;
    });
    let winnerTeam = -1;
    for (const [teamId, place] of this.placements) if (place === 1) winnerTeam = teamId;
    return { matchId: this.matchId, winnerTeam, perPlayer: players };
  }

  /** Apply an offer pick (augment or free item) and consume the offer. */
  private applyPick(offerId: string, offer: StoredOffer, choiceIdx: number): void {
    const choice = offer.choices[choiceIdx] ?? offer.choices[0]!;
    if (offer.kind === "item") {
      // A 傳說寶玉 card holds an inventory slot from the moment it is rolled
      // (task #82). Release it FIRST so the grant below can use the very slot
      // the reservation was protecting, and release it on every exit path —
      // this method deletes the offer unconditionally, so a reservation that
      // outlived its card would cost the player a slot for the rest of the
      // match.
      if (offer.reservesSlot) releaseOrbSlot(this.world, offer.entity);
      applyItemPick(this.world, offer, choice as ItemId);
    } else {
      applyAugmentPick(this.world, offer, choice as AugmentId);
    }
    this.offers.delete(offerId);
  }

  /**
   * Register the 3-choose-1 card a purchased 傳說寶玉 rolled. Keyed by tick +
   * seat so a player who buys two orbs in one shopping phase gets two distinct
   * cards rather than silently overwriting the first (they paid 4800g).
   *
   * The offer is deliberately shaped exactly like a round-5 weapon offer
   * (`kind: "item"`, `tier: ITEM_OFFER_TIER`), so it inherits the whole
   * existing lifecycle for free: the client's pick message, the AI's
   * auto-pick-after-10-ticks, the "intermission cannot end with an open offer"
   * rule, and the expiry safety net.
   */
  private registerOrbOffer(entity: EntityId, choices: ItemId[]): void {
    const seat = [...this.seats.values()].find((s) => s.entityId === entity);
    if (!seat || choices.length === 0) {
      // The sim already charged 2400g and reserved a slot; if no card can be
      // registered for it, hand the slot back rather than leaking a permanent
      // reservation on top of the lost gold.
      releaseOrbSlot(this.world, entity);
      return;
    }
    this.offers.set(`orb:${this.world.tick}:${seat.seatId}`, {
      kind: "item",
      entity,
      tier: ITEM_OFFER_TIER,
      choices: [...choices],
      picked: null,
      seatId: seat.seatId,
      createdTick: this.world.tick,
      reservesSlot: true,
    });
  }

  private maybeFinish(): boolean {
    const alive = this.aliveTeams();
    if (alive.length > 1) return false;
    if (alive.length === 1) this.placements.set(alive[0]!, 1);
    // outcome is final — freeze input for the settlement (idempotent; normally
    // already latched by concludeCombat one resolution phase earlier)
    this.outcomeDecided = true;
    this.world.combatActive = false;
    this.freezeControls();
    this.phase.end();
    this.result = {
      matchId: this.matchId,
      mode: "PairedDuels",
      seed: this.world.rng.state,
      rounds: this.phase.round,
      teams: [...this.lives.keys()].map((teamId) => ({
        teamId,
        placement: this.placements.get(teamId) ?? 1,
        members: [...this.seats.values()]
          .filter((s) => s.teamId === teamId)
          .map((s) => ({
            seatId: s.seatId,
            accountId: s.accountId,
            kills: this.kills.get(s.seatId) ?? 0,
            deaths: this.deaths.get(s.seatId) ?? 0,
            isBot: this.specs.get(s.seatId)?.isBot ?? s.driverKind === "ai",
          })),
      })),
    };
    // victory settlement (per-player scoreboard + grade + rank), broadcast by
    // MatchRoom on MSG.EVENT for the client's settlement screen
    this.settlement = this.buildSettlement();
    return true;
  }

  // ---------- per-tick ----------

  get allSeatsReady(): boolean {
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      if ((this.lives.get(seat.teamId) ?? 0) <= 0) continue;
      if (!seat.ready) return false;
    }
    return true;
  }

  /**
   * Drop shop `buyItem` commands for non-whitelisted items BEFORE they reach
   * the sim — the authoritative shop-catalogue filter. Allow-all/bypass returns
   * the frame untouched (zero overhead on the default path). Human OR AI, the
   * server never lets a disabled item be purchased.
   */
  private sanitizeIntent(frame: IntentFrame): IntentFrame {
    if (this.whitelist.bypass) return frame;
    if (!frame.commands.some((c) => c.kind === "buyItem" && !this.whitelist.allowsItem(c.itemId))) {
      return frame;
    }
    return {
      ...frame,
      commands: frame.commands.filter((c) => c.kind !== "buyItem" || this.whitelist.allowsItem(c.itemId)),
    };
  }

  /** Advance one tick. Returns the current phase after the tick. */
  tick(): MatchPhase {
    // 1) driver swaps land at the tick boundary
    for (const seat of this.seats.values()) seat.applyPendingDriver();

    // 2) phase timer
    const expired = this.phase.tickTimer();

    // 3) gather intents + step the sim (sim runs in every phase; combat rules
    //    only differ by economyOpen and by who is alive)
    const intents = new Map<SeatId, IntentFrame>();
    // FREEZE: once the match outcome is decided, stop gathering seat intents
    // (human AND AI) so champions idle through the resolution/matchEnd settlement
    // — the front-view shows a still hero. Champions were already halted
    // (freezeControls) when the outcome latched, so the empty map keeps them put.
    if (!this.outcomeDecided && this.phase.phase !== "champSelect" && this.phase.phase !== "matchEnd") {
      for (const [seatId, seat] of this.seats) {
        intents.set(seatId, this.sanitizeIntent(seat.produceIntent(this.world, this.world.tick)));
      }
    }
    this.world.step(intents);

    // 4) drain sim events the controller must act on
    for (const ev of this.world.events) {
      if (ev.type === "pickOffer") {
        // clients pick by "offerId#choiceIdx"; a plain offerId -> first choice
        const raw = ev.data.offerId as string;
        const hash = raw.lastIndexOf("#");
        const offerId = hash >= 0 ? raw.slice(0, hash) : raw;
        const choiceIdx = hash >= 0 ? Number(raw.slice(hash + 1)) : 0;
        const offer = this.offers.get(offerId);
        if (offer && offer.seatId === (ev.data.seatId as SeatId)) {
          this.applyPick(offerId, offer, Number.isInteger(choiceIdx) ? choiceIdx : 0);
        }
      } else if (ev.type === "legendaryOrbRolled") {
        // 傳說寶玉 (task #82): the SIM rolled the 3-choose-1 (so it rides
        // world.rng and replays byte-identically); offers are HOST state, so
        // the card is registered here — the same shape the round-5 weapon card
        // produces, which means the existing pick / AI-autopick / expiry paths
        // handle it with no special cases. The pool was already whitelist-
        // filtered BEFORE the roll (world.itemEligible), so unlike the round
        // cards this can never arrive empty.
        this.registerOrbOffer(ev.data.id as EntityId, ev.data.choices as ItemId[]);
      } else if (ev.type === "ready") {
        const seat = [...this.seats.values()].find((s) => s.seatId === (ev.data.seatId as SeatId));
        if (seat) seat.ready = true;
      } else if (ev.type === "death") {
        const victim = ev.data.id as EntityId;
        const killer = ev.data.killer as EntityId | null;
        // only champion deaths feed the K/D stats — flower (neutral) deaths
        // never award a kill (they reward the HP/MP burst instead)
        const victimIsChampion = [...this.seats.values()].some((s) => s.entityId === victim);
        for (const seat of this.seats.values()) {
          if (seat.entityId === victim) this.deaths.set(seat.seatId, (this.deaths.get(seat.seatId) ?? 0) + 1);
          if (victimIsChampion && killer !== null && seat.entityId === killer)
            this.kills.set(seat.seatId, (this.kills.get(seat.seatId) ?? 0) + 1);
        }
      }
    }

    // 4b) sustain dev cheats AFTER the sim step (god mode / 0-CD). Dev-only and
    //     off by default, so this branch is dead weight in normal play.
    if (this.godModeSeats.size > 0 || this.zeroCdSeats.size > 0) this.sustainCheats();

    // 5) phase transitions
    switch (this.phase.phase) {
      case "champSelect":
        if (expired) {
          this.autoPickAndSpawn();
          this.phase.advance(); // -> intermission (round 1)
          this.enterIntermission();
        }
        break;
      case "intermission": {
        // AI-driven seats auto-pick their first offer (augment OR weapon)
        // after a short delay; also the safety net for offers left unpicked
        // at the timer.
        for (const [offerId, offer] of [...this.offers]) {
          const seat = this.seats.get(offer.seatId);
          const age = this.world.tick - offer.createdTick;
          if ((seat?.driverKind === "ai" && age > 10) || expired) {
            this.applyPick(offerId, offer, 0);
          }
        }
        if (expired || (this.allSeatsReady && this.offers.size === 0)) {
          this.phase.advance(); // -> combat
          this.enterCombat();
        }
        break;
      }
      case "combat":
        if (this.checkCombatEnd(expired)) {
          this.concludeCombat(); // despawn flowers + settle + maybe latch freeze
          this.phase.advance(); // -> resolution
        }
        break;
      case "resolution":
        if (expired) {
          if (!this.maybeFinish()) {
            this.phase.advance(); // -> next intermission
            this.enterIntermission();
          }
        }
        break;
      case "matchEnd":
        break;
    }
    return this.phase.phase;
  }

  // ---------- dev cheats (offline testing) ----------

  /**
   * Re-assert god-mode / zero-cooldown flags each tick, after the sim has run.
   * God mode: top hp/mana back off and revive (so a lethal burst this tick is
   * undone before the snapshot — the client never sees the corpse). Zero-CD:
   * clear ability + basic-attack cooldowns and refill mana so casts never run
   * dry (mana refill is intentional — noted in the cheat contract).
   */
  private sustainCheats(): void {
    for (const seatId of this.godModeSeats) {
      const seat = this.seats.get(seatId);
      if (!seat || seat.entityId === null) continue;
      const hp = this.world.health.get(seat.entityId);
      if (!hp) continue;
      hp.hp = hp.maxHp;
      hp.mana = hp.maxMana;
      hp.alive = true;
    }
    for (const seatId of this.zeroCdSeats) {
      const seat = this.seats.get(seatId);
      if (!seat || seat.entityId === null) continue;
      const ab = this.world.abilities.get(seat.entityId);
      if (ab) {
        for (const slot of ["Q", "W", "E", "R"] as const) ab.slots[slot].cooldownRemainingTicks = 0;
        if (ab.exSlot) ab.exSlot.cooldownRemainingTicks = 0;
        ab.basicAttackCdTicks = 0;
        ab.cast = null;
        ab.windup = null;
      }
      const hp = this.world.health.get(seat.entityId);
      if (hp) hp.mana = hp.maxMana; // spammable casts shouldn't starve on mana
    }
  }

  /**
   * Apply a cheat to `seatId`'s champion. Callers (MatchRoom) resolve seatId
   * from the client's OWN session, so a client can never target a foreign seat;
   * the channel itself is hard-gated to dev mode (see cheatGate.ts). Returns
   * true when the cheat was applied.
   */
  applyCheat(seatId: SeatId, cheat: Cheat): boolean {
    const seat = this.seats.get(seatId);
    if (!seat) return false;

    // toggles are keyed by seat and valid even before an entity exists
    if (cheat.kind === "godMode") {
      if (cheat.enabled) this.godModeSeats.add(seatId);
      else this.godModeSeats.delete(seatId);
    } else if (cheat.kind === "zeroCooldown") {
      if (cheat.enabled) this.zeroCdSeats.add(seatId);
      else this.zeroCdSeats.delete(seatId);
    }
    // grantMCoin is a platform-wallet concept with no in-sim representation —
    // accepted (so the client flow stays uniform) but a graceful no-op.
    if (cheat.kind === "grantMCoin") return true;

    const entity = seat.entityId;

    switch (cheat.kind) {
      case "swapChampion": {
        if (!Champions.tryGet(cheat.championId as ChampionId)) return false;
        return this.swapChampion(seatId, cheat.championId as ChampionId);
      }
      case "godMode":
      case "zeroCooldown":
        // toggle handled above; also seed the effect immediately when entity ready
        if (entity !== null && cheat.kind === "godMode" && cheat.enabled) {
          const hp = this.world.health.get(entity);
          if (hp) {
            hp.hp = hp.maxHp;
            hp.mana = hp.maxMana;
            hp.alive = true;
          }
        }
        return true;
    }

    if (entity === null) return false;

    switch (cheat.kind) {
      case "setLevel": {
        const champ = this.world.champion.get(entity);
        if (!champ) return false;
        const target = Math.max(1, Math.min(LEVEL_CAP, Math.floor(cheat.level)));
        if (target > champ.level) {
          grantLevels(this.world, entity, target - champ.level);
        } else if (target < champ.level) {
          // grantLevels only raises; drop directly for a lower target (dev-only)
          champ.level = target;
          const sc = this.world.stats.get(entity);
          if (sc) sc.dirty = true;
        }
        return true;
      }
      case "grantGold":
        grantGold(this.world, entity, Math.floor(cheat.amount));
        return true;
      case "maxAbilities": {
        const ab = this.world.abilities.get(entity);
        if (!ab) return false;
        for (const slot of ["Q", "W", "E", "R"] as const) {
          const inst = ab.slots[slot];
          inst.rank = Abilities.get(inst.abilityId).maxRank; // R included, no gate
        }
        if (ab.exSlot) learnEx(this.world, entity); // dev "max" also unlocks EX
        return true;
      }
      case "rankAbility":
        return this.cheatRankAbility(entity, cheat.slot);
      case "giveItem":
        return grantItemFree(this.world, entity, cheat.itemId as ItemId) >= 0;
      case "fullHeal": {
        const hp = this.world.health.get(entity);
        if (!hp) return false;
        hp.hp = hp.maxHp;
        hp.mana = hp.maxMana;
        hp.alive = true;
        return true;
      }
      case "resetCooldowns": {
        const ab = this.world.abilities.get(entity);
        if (!ab) return false;
        for (const slot of ["Q", "W", "E", "R"] as const) ab.slots[slot].cooldownRemainingTicks = 0;
        if (ab.exSlot) ab.exSlot.cooldownRemainingTicks = 0;
        ab.basicAttackCdTicks = 0;
        ab.cast = null;
        ab.windup = null;
        return true;
      }
      case "killEnemies":
        return this.cheatKillEnemies(seat.teamId, entity);
      case "spawnFlower":
        return this.cheatSpawnFlower(entity);
      case "skipPhase":
        return this.cheatSkipPhase();
      case "rerollOffers":
        return this.cheatRerollOffers(seatId, entity);
    }
    return false;
  }

  /** Rank one slot for a seat, bypassing the point cost and the R round-gate. */
  private cheatRankAbility(entity: EntityId, slot: AbilitySlot): boolean {
    const ab = this.world.abilities.get(entity);
    if (!ab) return false;
    if (slot === "EX") return false; // EX is unlocked (learnEx), not ranked
    const inst = ab.slots[slot];
    if (inst.rank >= Abilities.get(inst.abilityId).maxRank) return false;
    ab.unspentPoints++; // grant the point this rank-up will consume
    const prevGate = this.world.ultGateOverride;
    if (slot === "R") this.world.ultGateOverride = true; // lift the 6/11/16 gate
    const ok = rankUpAbility(this.world, entity, slot);
    if (slot === "R") this.world.ultGateOverride = prevGate;
    if (!ok) ab.unspentPoints--; // roll the point back if the rank-up was refused
    return ok;
  }

  /** Despawn the seat's champion and respawn as `championId`, same seat/team/pos. */
  private swapChampion(seatId: SeatId, championId: ChampionId): boolean {
    const seat = this.seats.get(seatId);
    if (!seat) return false;
    let pos = { x: 0, z: 0 };
    let zone = 0;
    if (seat.entityId !== null) {
      const t = this.world.transform.get(seat.entityId);
      if (t) {
        pos = { x: t.pos.x, z: t.pos.z };
        zone = t.zone;
      }
      this.world.destroy(seat.entityId);
    }
    seat.championId = championId;
    seat.entityId = spawnChampion(this.world, {
      championId,
      seatId,
      teamId: seat.teamId,
      pos,
      zone,
    });
    return true;
  }

  /**
   * Spawn a healing flower in the caller's zone (dev testing aid). Uses the
   * active flower rules; matches without a flowers block fall back to the
   * contract defaults so the cheat still works for testing. The flower joins
   * the normal burst-on-death flow (FlowerSystem).
   */
  private cheatSpawnFlower(entity: EntityId): boolean {
    const t = this.world.transform.get(entity);
    if (!t) return false;
    if (!this.world.flowerRules) {
      this.world.flowerRules = flowerRulesFromConfig(
        this.rules.flowers ?? DEFAULT_FLOWER_CONFIG,
        this.world.dt,
      );
    }
    const pos = pickFlowerSpawnPos(this.world, t.zone);
    spawnFlower(this.world, t.zone, pos, this.world.flowerRules.hp);
    return true;
  }

  /** Kill every alive enemy champion sharing the caller's zone (fast-forward). */
  private cheatKillEnemies(myTeam: TeamId, myEntity: EntityId): boolean {
    const t = this.world.transform.get(myEntity);
    if (!t) return false;
    for (const [id, team] of this.world.team) {
      if (team.teamId === myTeam) continue;
      if (!this.world.champion.has(id)) continue;
      const et = this.world.transform.get(id);
      const hp = this.world.health.get(id);
      if (et?.zone === t.zone && hp?.alive) {
        hp.hp = 0;
        hp.alive = false; // checkCombatEnd resolves the duel next tick
      }
    }
    return true;
  }

  /** Force the current phase forward: intermission→combat, or end the round. */
  private cheatSkipPhase(): boolean {
    switch (this.phase.phase) {
      case "champSelect":
        this.autoPickAndSpawn();
        this.phase.advance(); // -> intermission (round 1)
        this.enterIntermission();
        return true;
      case "intermission":
        this.offers.clear();
        this.phase.advance(); // -> combat
        this.enterCombat();
        return true;
      case "combat":
        // decide any undecided duels immediately, then settle + resolve
        this.checkCombatEnd(true);
        this.concludeCombat(); // despawn flowers + settle + maybe latch freeze
        this.phase.advance(); // -> resolution
        return true;
      case "resolution":
        if (!this.maybeFinish()) {
          this.phase.advance(); // -> next intermission
          this.enterIntermission();
        }
        return true;
      default:
        return false;
    }
  }

  /** Re-roll this seat's open augment / weapon offers with fresh choices. */
  private cheatRerollOffers(seatId: SeatId, entity: EntityId): boolean {
    let rerolled = false;
    for (const [offerId, offer] of [...this.offers]) {
      if (offer.seatId !== seatId) continue;
      if (offer.kind === "augment") {
        const fresh = offerAugments(this.world, entity, offer.tier, this.rules.offerCount);
        this.offers.set(offerId, { kind: "augment", ...fresh, seatId, createdTick: this.world.tick });
      } else {
        // item offers don't retain their table id; re-roll from the same choices' pool
        const fresh = offerItems(this.world, entity, offer.tier, this.rules.offerCount);
        // offerItems keys off a loot-table id; fall back to keeping choices if empty
        const next = fresh.choices.length > 0 ? fresh.choices : offer.choices;
        this.offers.set(offerId, {
          kind: "item",
          entity,
          tier: offer.tier,
          choices: next,
          picked: null,
          seatId,
          createdTick: this.world.tick,
        });
      }
      rerolled = true;
    }
    return rerolled;
  }
}
