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
import { SKELETON_ARENA, pickRoundArena, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions, Abilities, LootTables } from "@ggd/shared/sim/content/registry";
import { Models } from "@ggd/shared/content";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { grade, perMatchRanks } from "@ggd/shared/sim/stats/rating";
import type { MatchSettlement, SettlementPlayer } from "@ggd/shared/protocol/messages";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
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
import {
  beginCombatFireRing,
  endCombatFireRing,
  fireRingRulesFromConfig,
} from "@ggd/shared/sim/fireRing";
import {
  beginCombatGuardians,
  endCombatGuardians,
  guardianRulesFromConfig,
} from "@ggd/shared/sim/systems/GuardianSystem";
import { DEFAULT_FLOWER_CONFIG, type FireRingConfig } from "@ggd/shared/content";
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
import { rollItemReward, grantItemFree, commitShopSession } from "@ggd/shared/sim/economy/shop";
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
import { Ownership } from "../curation/ownership";
import { PhaseMachine, type MatchPhase, type PhaseConfig, DEFAULT_PHASE_CONFIG } from "./PhaseMachine";
import {
  pairTeams,
  teamHealthLost,
  isHighStakesRound,
  HIGH_STAKES_REWARD,
  DEFAULT_STARTING_TEAM_HEALTH,
  type DuelPairing,
} from "./PairedDuels";
import { DEFAULT_ARENA_RULES, grantForRound, type ArenaRules } from "./arenaRules";

/**
 * Strip the FIGHTING half of a produced intent while combat is not live, so a
 * champion cannot move-to-engage, attack or cast between the moment a round
 * settles and the moment the next round's combat is armed (#100). The economy
 * half — buy / sell / rank / ready / offer picks / recall — is preserved so the
 * intermission shop keeps working with the fighters standing still.
 *
 * Pure and deterministic (a function only of the frame): the caller gates it on
 * `world.combatActive`, host state that flips on combat entry/exit identically
 * on every replica, so client prediction replays the freeze byte-for-byte.
 */
function freezeCombatIntent(frame: IntentFrame): IntentFrame {
  return {
    // An explicit `stop` (not merely a dropped order) so any sticky nav target
    // that survived the settling tick is re-cleared EVERY frame — the OrderSystem
    // chase loop re-derives movement from a persisting attackTarget, so leaving
    // the order undefined would let a champion keep closing on its last foe.
    order: { kind: "stop" },
    // aim intentionally dropped: no need to keep re-facing a corpse.
    commands: frame.commands.filter((c) => c.kind !== "castAbility" && c.kind !== "useItem"),
  };
}

export interface SeatSpec {
  seatId: number;
  teamId: number;
  accountId?: string;
  displayName?: string;
  championId?: string;
  isBot: boolean;
}

/**
 * The match RECORDER seam (task #175). A recorder is attached by MatchRoom and
 * observes the three things a replay cannot re-derive:
 *
 *   - the raw per-seat intent frame, captured BEFORE `sanitizeIntent` and
 *     `freezeCombatIntent` — both of those are pure functions of the frame plus
 *     recorded state, so playback re-applies them itself and re-recording their
 *     output would double-apply the freeze;
 *   - driver swaps at the tick they are APPLIED, because `driverKind` is read by
 *     the intermission offer auto-pick and therefore changes the match;
 *   - a per-tick digest checkpoint, so playback can name the first divergent
 *     tick instead of discovering the problem at the end.
 *
 * The interface is deliberately narrow and the field is optional: with no
 * recorder attached every call site below is one `?.` on a null, and the sim
 * path is byte-identical to before this feature existed.
 */
export interface MatchRecorderSink {
  onIntent(tick: number, seatId: SeatId, frame: IntentFrame): void;
  onDriverSwap(tick: number, seatId: SeatId, kind: "human" | "ai"): void;
  onTickEnd(ctl: MatchController): void;
}

/**
 * Outcome of a SELECT_CHAMPION. On rejection the `reason` is surfaced to the
 * client so champ-select can explain WHY (wrong phase / unknown champion /
 * not on the content whitelist), never a silent no-op.
 */
export type SelectReason =
  | "wrong-phase"
  | "no-seat"
  | "unknown-champion"
  | "not-whitelisted"
  | "not-owned";
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
  /**
   * TEAM HEALTH per team — LoL Arena's elimination model (20-point pool, −2/−4/−6
   * per lost duel by round band, +15 to a High Stakes winner, eliminated at 0).
   * Drained in {@link settleRound}; read for elimination, placement and the
   * `aliveTeams` gate everywhere else.
   */
  readonly teamHealth = new Map<TeamId, number>();
  readonly placements = new Map<TeamId, number>();
  /**
   * Teams that won a High Stakes duel and have not yet spent the draft half of
   * that win — GGD's stand-in for Arena's LUCKY DICE (see {@link settleRound}).
   * Cleared as the next augment offer is rolled.
   */
  private readonly highStakesDraftBonus = new Set<TeamId>();

  /**
   * @deprecated Vocabulary alias for {@link teamHealth} — the SAME Map object,
   * so `for…of`, `.get`, `.size` and `new Map(ctl.lives)` all behave identically.
   *
   * It exists because the readers of this field live in lanes this one does not
   * own: `net/snapshot.ts` (→ `TeamState.lives` on the wire), `replay/digest.ts`,
   * `replay/Recorder.ts`, and the client's TeamLivesBar / CouchHudGrid. Renaming
   * the field outright would have been a cross-lane break for a vocabulary win;
   * the alias buys the correct name here and leaves the wire rename to the lane
   * that owns the protocol.
   *
   * ⚠️ HAND-OFF for the client lane: `TeamLivesBar` renders one ❤ per unit of
   * this value. That was a sane 3-8 hearts under the old lives model; it is now
   * a 20-point pool that can reach 35+ after a High Stakes win, so the bar needs
   * to become a BAR (or a number) rather than a row of hearts.
   */
  get lives(): Map<TeamId, number> {
    return this.teamHealth;
  }

  /** @deprecated Vocabulary alias for {@link startingTeamHealth}. */
  get startingLives(): number {
    return this.startingTeamHealth;
  }
  readonly kills = new Map<SeatId, number>();
  readonly deaths = new Map<SeatId, number>();
  /**
   * PER-ROUND kill/death tallies — the same events as `kills`/`deaths`, but
   * ZEROED at every combat entry (see resetRoundTallies). They ride the snapshot
   * (SeatState.roundKills/roundDeaths) so the round-end presentation — the
   * winner model (#143) and the round-end quote VO (#142) — can name THIS
   * round's MVP on the leading team instead of a fixed representative seat.
   * They must stay per-ROUND: a cumulative tally would simply pin the match's
   * overall best killer on screen every round, which is the same bug in a new
   * shape.
   */
  readonly roundKills = new Map<SeatId, number>();
  readonly roundDeaths = new Map<SeatId, number>();
  /**
   * PER-ROUND participation + duel result per TEAM (a ROUND_OUTCOME value), with
   * exactly the roundKills lifetime: NONE for everyone at combat entry, FOUGHT
   * the moment enterCombat places a team's seats into a duel zone, WON/LOST when
   * settleRound resolves the duel — and then readable, unchanged, through the
   * whole `resolution` + shop beat the round-end presentation fires in.
   *
   * It exists because a BYE team is indistinguishable from a wiped one on the
   * rest of the snapshot: enterCombat parks every seat dead and only revives the
   * seats belonging to a pairing, so the bye team ends the round alive:false /
   * roundKills:0 / roundDeaths:0 — and it never even emits a death event, since
   * the parking mutates hp directly. Without this map the presentation would
   * happily pick the standings leader that sat the round out, find no survivors
   * and no scorers, and fall back to its lowest seatId: 「每回合都是同一個英雄」.
   */
  readonly roundOutcome = new Map<TeamId, number>();
  /**
   * MATCH-LIFETIME count of duels this team has won — the edge the client's
   * victory gate (vfx/victoryTrigger) fires the small round-win firework on.
   * Deliberately NOT in `resetRoundTallies`: it is a monotonically rising
   * counter, and the client detects a WIN as `roundWins > lastRoundWins`, so
   * zeroing it every round would either fire nothing or fire on the re-climb.
   *
   * Separate from `roundOutcome` even though settleRound writes both on the
   * same line: roundOutcome answers 「這一回合你做了什麼」 (and is wiped every
   * round), roundWins answers 「你到目前贏了幾場」. Projected as uint8, which
   * caps at 255 — a match is a handful of rounds, so the clamp is unreachable.
   */
  readonly roundWins = new Map<TeamId, number>();
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
   * still hero. Deterministic (derived from team health), so client prediction
   * replays the freeze identically.
   */
  outcomeDecided = false;

  /**
   * The victory-settlement payload (per-player scoreboard + grade + rank +
   * winner), computed once at matchEnd. MatchRoom broadcasts it on MSG.EVENT.
   */
  settlement: MatchSettlement | null = null;

  /**
   * Per-team settlement snapshots queued when a team is ELIMINATED mid-match
   * (task #193). Each entry is the full scoreboard snapshot taken at the moment
   * that team's life hit 0, tagged with the eliminated team id. MatchRoom drains
   * this every tick and broadcasts each on MSG.EVENT (TEAM_SETTLEMENT_EVENT), so
   * a player whose team is out can open their evaluation screen before leaving.
   *
   * NOT part of sim/world state and never serialized — draining it changes no
   * digest, so replays stay deterministic. Only populated for eliminations that
   * do NOT end the match; the deciding elimination is covered by the final
   * matchEnd settlement (maybeFinish), so it is never double-broadcast.
   */
  private eliminationSettlements: { teamId: number; settlement: MatchSettlement }[] = [];

  /**
   * Dev-cheat toggles (offline testing only; MatchRoom hard-gates the channel).
   * Keyed by seatId so they survive champion swaps (which change entityId). The
   * per-tick sustain in tick() honors them AFTER the sim step.
   */
  private readonly godModeSeats = new Set<SeatId>();
  private readonly zeroCdSeats = new Set<SeatId>();

  /**
   * Replay recorder, or null when this match is not being recorded (unit tests,
   * playback itself). See {@link MatchRecorderSink}.
   */
  recorder: MatchRecorderSink | null = null;

  private specs = new Map<SeatId, SeatSpec>();
  private duelWinners = new Map<number, TeamId>(); // zone -> winner this round

  /**
   * The match seed, captured for the DETERMINISTIC per-round arena pick (task
   * #145). Deliberately NOT `world.rng.state` — that advances every tick, so it
   * is not a stable function of (seed, round); the raw seed is. Arena selection
   * hashes (seed, round) independently of world.rng, so it perturbs no sim
   * randomness and same-seed replay stays byte-identical.
   */
  private readonly matchSeed: number;

  constructor(
    public readonly matchId: string,
    seed: number,
    seatSpecs: SeatSpec[],
    phaseCfg: PhaseConfig = DEFAULT_PHASE_CONFIG,
    /**
     * Shared TEAM HEALTH at match start. The CALLER resolves this: MatchRoom
     * from `config.match@1` (`phaseConfig.resolveStartingTeamHealth`), and the
     * replay player from `ReplayHeader.startingLives` — never re-resolved here,
     * so a recording always replays on the reservoir it was recorded with.
     *
     * Positional, so the rename does not reach MatchRoom (which passes it by
     * position). Readers of the old property name get {@link startingLives}.
     */
    public readonly startingTeamHealth = DEFAULT_STARTING_TEAM_HEALTH,
    /** round-rules table; DEFAULT_ARENA_RULES = exact legacy behavior */
    public readonly rules: ArenaRules = DEFAULT_ARENA_RULES,
    /**
     * ACTIVE map geometry (collision truth); default = built-in skeleton. NOT
     * readonly: when `arenaPool` is non-empty this is swapped each combat round
     * to the deterministically-chosen arena (task #145). The champ-select /
     * first-intermission spawn uses whatever is passed here; combat rounds
     * rotate.
     */
    public arena: ArenaDef = SKELETON_ARENA,
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
    /**
     * Round-pacing FIRE RING schedule (task #132), resolved BY THE CALLER from
     * `config.match@1`'s `match.fireRing` block (MatchRoom → resolveFireRing()).
     * `startSec` is the SINGLE SOURCE OF TRUTH for round length — the ring
     * closes in at that combat-elapsed time and burns every living champion with
     * an escalating %-HP true-damage ramp so a stalemate settles by ~3-4 min.
     * null (the default: unit tests, skeleton boot, an operator who authored no
     * ring) leaves the mechanic OFF — enterCombat never arms it, so behavior is
     * byte-identical to the pre-ring sim. Armed on combat entry / disarmed on
     * exit exactly like the flowers; the LIVE-combat gate in FireRingSystem
     * makes it stop the instant a round settles (coordinates with task #100).
     */
    public readonly fireRing: FireRingConfig | null = null,
    /**
     * The per-round arena ROTATION pool (task #145). Empty (the default: unit
     * tests, skeleton boot, any caller that wants a fixed map) leaves the arena
     * pinned to `arena` for the whole match — byte-identical to the pre-#145
     * behaviour. When non-empty, each combat round deterministically selects a
     * map from this pool (see selectRoundArena); the chosen id rides the snapshot
     * so every client agrees. MatchRoom passes the full loaded pool.
     */
    public readonly arenaPool: readonly ArenaDef[] = [],
    /**
     * Per-account champion OWNERSHIP snapshot (task #201). Default = allow-all
     * (every account unenforced), so every existing call site, unit test and the
     * replay player are byte-identical; the platform-driven path (MatchRoom)
     * passes the real per-seat ownership rebuilt from the signed match-create
     * body. Enforced INDEPENDENTLY of the whitelist: a lock-in must be BOTH
     * whitelisted (available) AND owned. See curation/ownership.ts.
     */
    public readonly ownership: Ownership = Ownership.allowAll(),
  ) {
    this.matchSeed = seed;
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
      this.roundKills.set(seatId, 0);
      this.roundDeaths.set(seatId, 0);
    }
    for (let t = 0; t < TEAM_COUNT; t++) {
      this.teamHealth.set(asTeamId(t), startingTeamHealth);
      this.roundOutcome.set(asTeamId(t), ROUND_OUTCOME.NONE);
      this.roundWins.set(asTeamId(t), 0);
    }
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
    // AUTHORITATIVE ownership gate (task #201): a champion the ACCOUNT has not
    // unlocked can never be locked in, MANUAL or RANDOM, even when it is on the
    // whitelist — the two predicates are independent (owned ∩ available). The
    // client filters its roster to the same set, but that filter is bypassable,
    // so this server-side reject is the load-bearing one: a crafted or replayed
    // SELECT_CHAMPION for an unowned champion is refused here. Fail-open for a
    // seat whose ownership we were never told (bots / dev joins), so #130's
    // "always at least the free roster" floor is never turned into a dead seat.
    if (!this.ownership.owns(seat.accountId, championId)) return { ok: false, reason: "not-owned" };
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

  /**
   * A championId that is safe to lock in and spawn: enabled by the whitelist AND
   * a real, loaded champion. Empty (the no-pick seat), stale, or otherwise
   * unknown ids all fail here — including a bogus id that the dev `bypass`
   * whitelist would otherwise wave through (`allowsChampion` is unconditionally
   * true under bypass), which would make `spawnChampion` throw on
   * `Champions.get`. autoPickAndSpawn re-rolls anything that fails into a random
   * ENABLED champion (from the model-backed `randomChampionPool`), so a seat can
   * never drop into round 1 as a broken/un-spawnable 0-HP unit (#130).
   */
  private isEnabledSpawnablePick(championId: string, accountId?: string): boolean {
    if (!championId) return false;
    if (!this.whitelist.allowsChampion(championId)) return false;
    // A carried pick the account does not own is NOT spawnable — re-roll it into
    // an owned champion below (task #201). A seat with unknown ownership (bot /
    // dev join) owns everything, so this is a no-op on that path.
    if (!this.ownership.owns(accountId, championId)) return false;
    return Champions.tryGet(championId as ChampionId) !== undefined;
  }

  private autoPickAndSpawn(): void {
    // uniform pick over the whitelisted, model-backed champion pool (falls back
    // to the full pool when the whitelist would starve the match — see
    // randomChampionPool).
    const pool = this.randomChampionPool();
    for (const [seatId, seat] of this.seats) {
      // AUTO-ASSIGN (the 隨機英雄 path): a seat with no pick, or one carrying a
      // champion that is no longer enabled / no longer a valid model-backed
      // champion / not owned by this account, gets a random champion at lock-in.
      // This is what keeps a player who let the champ-select clock run out from
      // spawning into a confusing dead/spectator state (0 HP, ☠觀戰中) in round 1
      // — they drop in ALIVE as a real character instead (#130).
      if (!this.isEnabledSpawnablePick(seat.championId, seat.accountId)) {
        // The random draw is over the whitelisted pool INTERSECTED with this
        // account's owned set, so a random/timed-out pick can never land on a
        // locked champion (task #201). If ownership would empty the pool (a
        // mis-provisioned account, never a real one thanks to #130's free
        // floor) we fall back to the whitelisted pool so the match still runs —
        // mirroring randomChampionPool's own "the match must not brick" stance.
        const owned = this.ownership.filterOwned(seat.accountId, pool);
        const drawPool = owned.length > 0 ? owned : pool;
        seat.championId = drawPool[this.world.rng.int(drawPool.length)]!;
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
    return [...this.teamHealth.entries()].filter(([, hp]) => hp > 0).map(([t]) => t);
  }

  /** seats that still play (spawned + team not eliminated), in map order. */
  private *activeSeats(): Generator<[SeatId, Seat, EntityId]> {
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      if ((this.teamHealth.get(seat.teamId) ?? 0) <= 0) continue;
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

    // 2) augment offers (3-choose-1) on scheduled rounds — 4-choose-1 for a
    //    team holding an unspent HIGH STAKES draft bonus (the Lucky Dice
    //    stand-in; see settleRound for why it is offer WIDTH and not a reroll).
    if (grant?.augmentTier) {
      const spentBonus = new Set<TeamId>();
      for (const [seatId, seat, entity] of this.activeSeats()) {
        const bonus = this.highStakesDraftBonus.has(seat.teamId) ? 1 : 0;
        if (bonus) spentBonus.add(seat.teamId);
        const offer = offerAugments(this.world, entity, grant.augmentTier, this.rules.offerCount + bonus);
        if (offer.choices.length > 0) {
          this.offers.set(`${round}:${seatId}`, {
            kind: "augment",
            ...offer,
            seatId,
            createdTick: this.world.tick,
          });
        }
      }
      // The bonus is spent by the offer it widened, not by the round it was won
      // in: a High Stakes round is not necessarily an augment round, so the
      // reward waits for the next draft rather than evaporating.
      for (const teamId of spentBonus) this.highStakesDraftBonus.delete(teamId);
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

  /**
   * Choose THIS combat round's arena deterministically from the rotation pool
   * (task #145) and make it active for both the controller (spawn placement) and
   * the sim (collision). Seeded off (matchSeed, round) via a pure hash that never
   * touches world.rng, so:
   *   • server-authoritative + reproducible — every client/replica computes the
   *     same id, and a same-seed replay is byte-identical,
   *   • stable within a round (picked once here, at combat entry — never re-picked
   *     mid-round),
   *   • it varies across rounds (consecutive rounds never repeat; see
   *     pickRoundArena).
   * An empty/singleton pool is a no-op, so a match without rotation keeps its
   * fixed `arena` exactly as before. The chosen id is exposed on the broadcast
   * state as `mapId` (projectSnapshot reads ctl.arena.id), which the client-render
   * agent watches to swap the scene; per-arena guardian identities (#105) and the
   * fire-ring/flower arming below all key off this same active arena.
   */
  private selectRoundArena(): void {
    const picked = pickRoundArena(this.arenaPool, this.matchSeed, this.phase.round);
    if (!picked) return; // empty pool → keep the current (fixed) arena
    this.arena = picked;
    this.world.setArena(picked);
  }

  /**
   * Zero the PER-ROUND presentation inputs: the K/D tallies and every team's
   * roundOutcome. Called at COMBAT ENTRY — deliberately not at concludeCombat —
   * because the round-end beat (the `resolution` phase, and the shop
   * intermission after it) is exactly when the client reads them to present the
   * round's MVP. Resetting on the way OUT of combat would blank the numbers one
   * tick before anyone looks at them; resetting on the way IN keeps the just
   * -finished round's tally readable until the next round actually starts.
   */
  private resetRoundTallies(): void {
    for (const seatId of this.seats.keys()) {
      this.roundKills.set(seatId, 0);
      this.roundDeaths.set(seatId, 0);
    }
    for (const teamId of this.roundOutcome.keys()) this.roundOutcome.set(teamId, ROUND_OUTCOME.NONE);
  }

  private enterCombat(): void {
    this.world.economyOpen = false;
    this.world.combatActive = true; // scoreboard time-alive accrues during combat
    this.offers.clear();
    this.duelWinners.clear();
    this.resetRoundTallies();

    // Per-round arena rotation (task #145): pick THIS round's map deterministically
    // from the pool BEFORE anyone is placed, so fighters spawn into it and the
    // guardian / fire-ring / flower arming below all read the same geometry.
    this.selectRoundArena();

    // COMMIT the shopping session: drop every champion's buy/sell undo history so
    // a purchase made this round can no longer be reversed once combat starts
    // (task #121) — this is the seam that makes a cross-round buy→sell→undo cycle
    // impossible to exploit for gold.
    for (const seat of this.seats.values()) {
      if (seat.entityId !== null) commitShopSession(this.world, seat.entityId);
    }

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
        // THIS is the authoritative "participated this round" seam: a team is
        // marked FOUGHT exactly where its seats are placed into a duel zone. The
        // bye team never reaches this loop, so it stays NONE — the one signal
        // that separates 「輪空」 from 「被團滅」 (both read alive:false, 0/0).
        // settleRound later upgrades this to WON/LOST.
        this.roundOutcome.set(teamId, ROUND_OUTCOME.FOUGHT);
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

    // arm the ROUND-PACING FIRE RING (task #132). Its combat-elapsed counter
    // starts at 0 here and the ring stays dormant until `startSec` — the single
    // source of truth for round length — then closes in with the escalating
    // %-HP true burn. FireRingSystem gates every burn on `world.combatActive`,
    // so the instant a round settles (task #100 flips it false in concludeCombat)
    // the ring stops: a LIVE-combat finish accelerator, never a post-settle
    // grinder. Absent config = OFF, exactly like the flowers' legacy-compat rule.
    if (this.fireRing) {
      beginCombatFireRing(this.world, fireRingRulesFromConfig(this.fireRing, this.world.dt));
    } else {
      endCombatFireRing(this.world);
    }

    // arm the neutral duel-zone GUARDIANS (task #89): one per ACTIVE duel zone
    // (the bye has no pairing, so no guardian). `round` scales guardian HP +
    // volley damage. Cleared by concludeCombat so no post-round PvE farming.
    // Absent config = OFF (same legacy-compat rule as flowers/revives). The
    // guardian is a neutral structure (no team/seat/nav/stats) so duel
    // resolution, team health, placement and the scoreboard stay blind to it.
    if (this.rules.guardianTower) {
      beginCombatGuardians(
        this.world,
        guardianRulesFromConfig(this.rules.guardianTower, this.world.dt),
        this.pairings.map((p) => p.zone),
        this.phase.round,
      );
    } else {
      endCombatGuardians(this.world);
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

  /**
   * Settle every decided duel into TEAM HEALTH, then lock any eliminations.
   *
   * The model is LoL Arena's, which the owner chose over the old lives table:
   *   • the LOSER of each duel drops `teamHealthLost(round)` — −2 (R1-3),
   *     −4 (R4-6), −6 (R7+);
   *   • on a HIGH STAKES round (5, then every 4th) the WINNER gains
   *     `HIGH_STAKES_REWARD` (+15) — the mechanic that lets a winning team
   *     pull far enough ahead that the match has a long tail instead of four
   *     teams dying within a round of each other;
   *   • 0 = eliminated, and placement is locked by elimination order.
   *
   * See `PairedDuels.isHighStakesRound` for why a BYE round pays nobody.
   */
  private settleRound(): void {
    // Same round + same bye for every pairing, so hoist the payout decision out
    // of the loop: a High Stakes round pays EVERY duel winner, or none of them.
    const highStakes = isHighStakesRound(this.phase.round, this.bye !== null);
    for (const pairing of this.pairings) {
      const winner = this.duelWinners.get(pairing.zone);
      if (winner === undefined) continue;
      const loser = winner === pairing.sideA ? pairing.sideB : pairing.sideA;
      // Upgrade FOUGHT → WON/LOST. The round-end presentation prefers a team that
      // actually WON its duel, which also stops it ever naming the round's LOSER
      // — possible on standings alone, because the lives deduction below can
      // still leave the loser above the winner (loser 3→2 outranks winner 1).
      this.roundOutcome.set(winner, ROUND_OUTCOME.WON);
      this.roundOutcome.set(loser, ROUND_OUTCOME.LOST);
      // …and bump the MATCH-lifetime win counter the client's victory gate
      // edge-detects to fire the small round-win firework (#93). Clamped to the
      // uint8 the schema replicates it as; a match never gets near 255 rounds.
      this.roundWins.set(winner, Math.min(255, (this.roundWins.get(winner) ?? 0) + 1));
      this.teamHealth.set(
        loser,
        Math.max(0, (this.teamHealth.get(loser) ?? 0) - teamHealthLost(this.phase.round)),
      );
      if (highStakes) {
        // HIGH STAKES payout. No cap, exactly as in Arena: the whole point is
        // that a team which keeps winning the marquee rounds buys runway no
        // amount of ordinary winning could.
        this.teamHealth.set(winner, (this.teamHealth.get(winner) ?? 0) + HIGH_STAKES_REWARD);
        // …and the DRAFT half of the reward — GGD's stand-in for Arena's Lucky
        // Dice. Arena hands each member of the winning team an extra reroll for
        // their augment/anvil pick. GGD HAS NO PLAYER-FACING REROLL: the only
        // `rerollOffers` in the codebase is a dev cheat (applyCheat, gated
        // behind DEV_CHEATS and exposed solely in CheatConsole), so there is no
        // "extra reroll" to grant and shipping one would mean a new command, a
        // new protocol message and new UI in three lanes this one does not own.
        //
        // The intent of a reroll is AGENCY IN THE DRAFT — a second look at the
        // cards. The smallest thing in GGD that carries that intent is the
        // offer WIDTH, which is already a parameter (`rules.offerCount`): a
        // High Stakes winner's next augment offer is 4-choose-1 instead of
        // 3-choose-1. Same currency (more of the pool visible before you
        // commit), zero new surface, and it is deterministic so replays are
        // unaffected. Flagged in the hand-off as the deliberate substitution it
        // is, not a silent omission.
        this.highStakesDraftBonus.add(winner);
      }

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
    // bye team gets loser-level gold (didn't fight). Its roundOutcome stays NONE
    // — deliberately: "didn't fight" is exactly what the presentation must read,
    // so it never celebrates a team that sat the round out.
    if (this.bye !== null) {
      for (const seat of this.seats.values()) {
        if (seat.teamId === this.bye && seat.entityId !== null) {
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundLose);
        }
      }
    }

    // eliminations lock placements from the bottom; teams eliminated in the
    // SAME round get distinct consecutive placements (deterministic: health-map
    // iteration order = ascending team id gets the worse placement first)
    const newlyEliminated = [...this.teamHealth.entries()]
      .filter(([teamId, l]) => l <= 0 && !this.placements.has(teamId))
      .map(([teamId]) => teamId);
    let place = this.aliveTeams().length + newlyEliminated.length;
    for (const teamId of newlyEliminated) this.placements.set(teamId, place--);

    // #193: the moment a team is knocked out — while the match is STILL RUNNING
    // for the survivors — snapshot the scoreboard and queue it per eliminated
    // team, so their players can open the evaluation screen before they leave.
    // Skip the elimination that DECIDES the match (<=1 team left): maybeFinish
    // broadcasts the authoritative final settlement then, and a duplicate
    // mid-match card would only race it. `buildSettlement()` is a pure read
    // (matchStats + rating), so building it here draws no rng and moves no digest.
    if (newlyEliminated.length > 0 && this.aliveTeams().length >= 2) {
      const snapshot = this.buildSettlement();
      for (const teamId of newlyEliminated) {
        this.eliminationSettlements.push({ teamId, settlement: snapshot });
      }
    }
  }

  /**
   * Drain the per-team elimination settlements queued since the last call
   * (task #193). MatchRoom calls this once per tick and broadcasts each entry.
   * Returns and clears; a second call in the same tick yields nothing.
   */
  takeEliminationSettlements(): { teamId: number; settlement: MatchSettlement }[] {
    if (this.eliminationSettlements.length === 0) return [];
    const drained = this.eliminationSettlements;
    this.eliminationSettlements = [];
    return drained;
  }

  /**
   * Wrap up a finished combat round: despawn flowers, settle team health/placements,
   * stop time-alive accrual, and — if the MATCH is now decided (<=1 team left) —
   * latch outcomeDecided and freeze every champion so the settlement front-view
   * shows a still hero. Shared by the normal combat→resolution transition and
   * the skipPhase cheat.
   */
  private concludeCombat(): void {
    endCombatFlowers(this.world); // round over: all flowers despawn
    endCombatRevives(this.world); // …and every circle + in-flight channel dies
    endCombatFireRing(this.world); // …and the round-pacing fire ring re-idles (#132)
    endCombatGuardians(this.world); // …and every neutral guardian despawns (no post-round farming, #89)
    this.settleRound();
    this.world.combatActive = false;
    // The round is SETTLED: halt every champion RIGHT NOW (#100) — clear the
    // in-flight swing/cast, sticky nav targets and residual momentum — so the
    // scene freezes for the round-win / settlement beat instead of letting the
    // bots keep trading blows through `resolution` and the next shop. From here
    // the intent seam (freezeCombatIntent, gated on combatActive) keeps them
    // frozen until enterCombat re-parks and re-arms combat next round.
    this.freezeControls();
    if (this.aliveTeams().length <= 1) {
      this.outcomeDecided = true;
    }
  }

  /**
   * Halt every champion: clear nav orders/targets/overrides and any in-progress
   * cast / basic-attack wind-up, and zero residual momentum. Called at EVERY
   * round settle (concludeCombat) and again at matchEnd (maybeFinish). Combined
   * with the intent seam refusing to feed combat orders while combat is not live
   * (freezeCombatIntent, gated on world.combatActive) — and, at match end,
   * skipping intent gathering entirely while outcomeDecided is set — this pins
   * each champion idle for the round-win / victory settlement beat (still hero,
   * no drift/casts). Deterministic — mutates only world state the sim already owns.
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
      teams: [...this.teamHealth.keys()].map((teamId) => ({
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
      if ((this.teamHealth.get(seat.teamId) ?? 0) <= 0) continue;
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
    for (const seat of this.seats.values()) {
      // A swap is recorded at the tick it is APPLIED, not requested: that is the
      // tick from which the new driver's `driverKind` is visible to the offer
      // auto-pick, so it is the tick playback must re-apply it on.
      if (seat.applyPendingDriver()) this.recorder?.onDriverSwap(this.world.tick, seat.seatId, seat.driverKind);
    }

    // 2) phase timer — ADVANCED FIRST, before any fallible work, so the visible
    //    countdown can never freeze even if the sim step or a phase transition
    //    below throws. Task #46: an intermittently throwing/stalling tick used to
    //    stop the clock dead — and, after the room-hardening wave, take the whole
    //    room down with it (MatchRoom disconnected the room on a thrown tick), so
    //    a single bad tick permanently froze the match. The clock now moves
    //    regardless of what happens further down the tick.
    const expired = this.phase.tickTimer();

    // 3+4) intents → sim step → event drain → cheat sustain, CONTAINED. A throw
    //    here (a sim edge case, an input that slipped validation, a fire-ring /
    //    flower / guardian corner) must NOT wedge the match: log + recover, then
    //    still run the phase transition below so the round can settle. A single
    //    bad tick is skipped, not fatal; a persistent one keeps the clock moving.
    try {
      this.stepSim();
    } catch (err) {
      this.onTickFault("sim-step", err);
    }

    // 5) phase transitions, CONTAINED with a force-advance failsafe. The normal
    //    path reads only guarded world state so it survives a corrupt/stale sim;
    //    if it ever throws (e.g. enterCombat on a bad arena geometry) we still
    //    push the phase forward on timer expiry, so a persistently faulting match
    //    marches to matchEnd rather than hanging in one phase forever.
    try {
      this.advancePhase(expired);
    } catch (err) {
      this.onTickFault("phase-transition", err);
      if (expired) this.forceAdvanceOnFault();
    }

    // 6) replay checkpoint, LAST — so the digest covers the sim step AND the
    //    phase transition that ran on this tick (team health, placements and round
    //    tallies all move in step 5, and they are host state the sim digest
    //    cannot see).
    this.recorder?.onTickEnd(this);
    return this.phase.phase;
  }

  /**
   * Steps 3–4 of a tick: gather seat intents, advance the deterministic sim one
   * fixed step, drain the sim events the controller must act on, and sustain any
   * dev cheats. Extracted so tick() can CONTAIN a throw here (task #46) and still
   * run the phase transition, keeping the match clock alive.
   */
  private stepSim(): void {
    // gather intents + step the sim (sim runs in every phase; combat rules
    // only differ by economyOpen and by who is alive)
    const intents = new Map<SeatId, IntentFrame>();
    // FREEZE: once the match outcome is decided, stop gathering seat intents
    // (human AND AI) so champions idle through the resolution/matchEnd settlement
    // — the front-view shows a still hero. Champions were already halted
    // (freezeControls) when the outcome latched, so the empty map keeps them put.
    if (!this.outcomeDecided && this.phase.phase !== "champSelect" && this.phase.phase !== "matchEnd") {
      for (const [seatId, seat] of this.seats) {
        // RECORD THE RAW FRAME, before either derived transform below. Both
        // `sanitizeIntent` (whitelist filter — the whitelist is in the replay
        // header) and `freezeCombatIntent` (a pure function of the frame and
        // `world.combatActive`) are re-applied identically during playback.
        const raw = seat.produceIntent(this.world, this.world.tick);
        this.recorder?.onIntent(this.world.tick, seatId, raw);
        let frame = this.sanitizeIntent(raw);
        // ROUND-SETTLE FREEZE (#100): `combatActive` is the single "a duel is
        // LIVE" flag, but nothing on the combat path or this seam ever consulted
        // it — so the sim kept stepping attacks/casts/movement in EVERY phase.
        // A round settles (checkCombatEnd → concludeCombat) while both teams in a
        // timer-decided duel are still alive and adjacent, so the bots brawled on
        // through `resolution` and the next `intermission` (up to ~65s) until
        // enterCombat re-parked them. While combat is not live we strip the
        // FIGHTING half of every produced intent (the move/attack order + any
        // cast / active-item command) and keep the economy half (shop / rank /
        // ready / offer picks), so champions ACTUALLY STOP for the settlement beat
        // yet the intermission shop still works. Deterministic: a pure function
        // of the frame + world.combatActive (host state set on combat entry/exit).
        if (!this.world.combatActive) frame = freezeCombatIntent(frame);
        intents.set(seatId, frame);
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
          if (seat.entityId === victim) {
            this.deaths.set(seat.seatId, (this.deaths.get(seat.seatId) ?? 0) + 1);
            this.roundDeaths.set(seat.seatId, (this.roundDeaths.get(seat.seatId) ?? 0) + 1);
          }
          if (victimIsChampion && killer !== null && seat.entityId === killer) {
            this.kills.set(seat.seatId, (this.kills.get(seat.seatId) ?? 0) + 1);
            // same event, per-ROUND bucket: this is what the round-end MVP
            // presentation reads (reset at the next enterCombat).
            this.roundKills.set(seat.seatId, (this.roundKills.get(seat.seatId) ?? 0) + 1);
          }
        }
      }
    }

    // 4b) sustain dev cheats AFTER the sim step (god mode / 0-CD). Dev-only and
    //     off by default, so this branch is dead weight in normal play.
    if (this.godModeSeats.size > 0 || this.zeroCdSeats.size > 0) this.sustainCheats();
  }

  /**
   * Step 5 of a tick: the phase state-machine transitions. Reads only guarded
   * world state (optional chaining throughout checkCombatEnd / teamAliveCount),
   * so it survives a corrupt or stale sim; tick() still wraps it and force-
   * advances on expiry if it ever throws, so the match can never wedge in a phase.
   */
  private advancePhase(expired: boolean): void {
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
  }

  /**
   * Force the phase machine forward when the NORMAL transition threw (task #46
   * failsafe). Uses ONLY host state — the phase machine, team health, placements
   * and the rng — never the possibly-corrupt sim world, so a match whose sim or
   * enterCombat keeps throwing still converges to matchEnd instead of freezing
   * the countdown. The combat branch charges one life to a deterministically-
   * chosen alive team, so team health strictly decreases across rounds and the match
   * can never cycle phases forever without ending.
   */
  private forceAdvanceOnFault(): void {
    switch (this.phase.phase) {
      case "champSelect":
        try {
          this.autoPickAndSpawn();
        } catch (err) {
          this.onTickFault("auto-pick", err);
        }
        this.phase.advance();
        try {
          this.enterIntermission();
        } catch (err) {
          this.onTickFault("enter-intermission", err);
        }
        break;
      case "intermission":
        this.phase.advance();
        try {
          this.enterCombat();
        } catch (err) {
          this.onTickFault("enter-combat", err);
        }
        break;
      case "combat": {
        // We could not compute the duel outcome; charge one life to a
        // deterministically-chosen alive team so team health still falls and the match
        // converges instead of cycling combat rounds forever.
        const alive = this.aliveTeams();
        if (alive.length > 1) {
          const loser = alive[this.world.rng.int(alive.length)]!;
          // Charge the ROUND'S FULL team-health cost, not a token 1. Under the
          // old lives model 1 WAS the round-1 cost, so the failsafe converged at
          // the normal rate; against a 20-point pool a flat −1 would need twenty
          // faulting rounds to eliminate one team, which is not a failsafe.
          this.teamHealth.set(
            loser,
            Math.max(0, (this.teamHealth.get(loser) ?? 0) - teamHealthLost(this.phase.round)),
          );
          if ((this.teamHealth.get(loser) ?? 0) <= 0 && !this.placements.has(loser)) {
            this.placements.set(loser, this.aliveTeams().length + 1);
          }
        }
        this.phase.advance(); // -> resolution
        break;
      }
      case "resolution": {
        let finished = false;
        try {
          finished = this.maybeFinish();
        } catch (err) {
          this.onTickFault("maybe-finish", err);
        }
        if (!finished) {
          this.phase.advance();
          try {
            this.enterIntermission();
          } catch (err) {
            this.onTickFault("enter-intermission", err);
          }
        }
        break;
      }
      case "matchEnd":
        break;
    }
  }

  /** Total contained tick faults (sim-step / phase-transition) — health telemetry. */
  get faultCount(): number {
    return this.tickFaults;
  }

  private tickFaults = 0;
  private loggedTickFaults = 0;

  /**
   * Record + throttle-log a contained tick fault. The first few faults are
   * logged in full; thereafter only every 300th (~10s at 30Hz), so a
   * DETERMINISTIC fault repeating every tick leaves a clear trail in the log
   * without flooding it.
   */
  private onTickFault(where: string, err: unknown): void {
    this.tickFaults++;
    if (this.loggedTickFaults < 5 || this.tickFaults % 300 === 0) {
      this.loggedTickFaults++;
      console.error(
        `[match ${this.matchId}] contained a ${where} fault in phase ${this.phase.phase} at sim tick ` +
          `${this.world.tick} (fault #${this.tickFaults}); the phase clock keeps advancing so the round ` +
          `can still settle`,
        err,
      );
    }
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
