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
  CoinComp,
  MobComp,
} from "./components";
import type { FlowerRules } from "./flowers";
import type { CoinRules } from "./coins";
import type { MobRules } from "./mobs";
import type { FireRingRules } from "./fireRing";
import type { ReviveRules } from "./revive";
import { DEFAULT_COMBAT_ENV, type CombatEnvMultipliers } from "./combatEnv";
import { DEFAULT_BASE_BONUS, type BaseBonusTable } from "./baseBonus";
import { DEFAULT_STAT_CAPS, type StatCapTable } from "./statCaps";
import { DEFAULT_COMBAT_FEEL, type CombatFeelRules } from "./combatFeel";
import { WEAPON_SHELF_OPEN } from "./economy/shopShelf";
import type { StatsComp, AbilitiesComp } from "./stats/statsComp";
import type { PlayerMatchStats } from "./stats/matchStats";
import { accumulateTimeAlive } from "./stats/matchStats";
import type { DamagePacket } from "./combat/damage";
import type { KillComboState } from "./combat/killCombo";
import { SpatialHash } from "./collision/spatialHash";
import type { ArenaDef } from "./world/ArenaDef";
import { TICK_MS } from "../constants";
import { orderSystem } from "./systems/OrderSystem";
import { movementSystem } from "./systems/MovementSystem";
import { leapSystem } from "./systems/LeapSystem";
import { statRecomputeSystem, buffExpirySystem } from "./stats/statPipeline";
import { auraSystem } from "./aura/aura";
import { commandSystem } from "./systems/CommandSystem";
import { castResolveSystem } from "./systems/CastResolveSystem";
import { recoveryDecaySystem } from "./systems/RecoverySystem";
import { basicAttackSystem } from "./systems/BasicAttackSystem";
import { projectileSystem } from "./systems/ProjectileSystem";
import { combatResolveSystem } from "./combat/damage";
import { deathSystem } from "./systems/DeathSystem";
import { fireRingSystem } from "./systems/FireRingSystem";
import { flowerSystem } from "./systems/FlowerSystem";
import { reviveSystem } from "./systems/ReviveSystem";
import { coinSystem } from "./systems/CoinSystem";
import { regenSystem } from "./systems/RegenSystem";
import { statusExpirySystem } from "./systems/StatusSystem";
import { hitstopDecaySystem } from "./systems/HitstopSystem";
import {
  guardianSystem,
  type StructureComp,
  type GuardianBuff,
  type GuardianRules,
} from "./systems/GuardianSystem";
import { mobSystem } from "./systems/MobSystem";
import { championFormSystem } from "./systems/ChampionFormSystem";

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
   * Dropped gold coins (task #191 陣亡投幣). Transform + marker only — no
   * TeamComp, no Health — so team/duel/alive iterations and every targeting
   * query are blind to them by construction (see CoinComp). Empty unless the
   * host armed the mechanic (`coinRules !== null`).
   */
  readonly coin = new Map<EntityId, CoinComp>();

  /**
   * Coins each champion may still throw THIS ROUND (task #191). Armed to
   * `coinsPerRound` by `beginCombatCoins` for exactly the entities the host
   * scheduled into the round, decremented per throw, cleared on combat exit.
   * The ABSENCE of an entry is the whole bye/eliminated answer — those seats are
   * parked dead but never scheduled, so they can never throw.
   */
  readonly coinBudget = new Map<EntityId, number>();

  /**
   * Neutral duel-zone GUARDIANS (task #89). A structure carries transform +
   * health + this marker ONLY — no TeamComp/seat/nav/stats/champion — so every
   * team/champion iteration is blind to it by construction (see FlowerComp). It
   * IS in the broad-phase grid (rebuildGrid), so it is a legal ability/auto
   * target. Managed entirely by GuardianSystem; empty unless the host armed the
   * mechanic (`guardianRules !== null`).
   */
  readonly structure = new Map<EntityId, StructureComp>();

  /**
   * Roguelite mobs (task #215 喪標麥可). A mob carries transform + health +
   * this marker + a Navigation + a TeamComp on the sentinel MONSTER team — the
   * guardian/flower NEUTRAL blueprint plus MOVEMENT and MUTUAL HOSTILITY (see
   * MobComp). It is in the broad-phase grid (a legal ability/auto target) and is
   * driven entirely by MobSystem. Empty unless the host armed the mechanic
   * (`mobRules !== null`).
   */
  readonly mob = new Map<EntityId, MobComp>();

  /**
   * Cumulative mob kills per champion (killer championId -> count), task #215.
   * NOT stored on ChampionComp (champion.level/xp/gold are not in worldDigest; a
   * dedicated folded map is the established clean choice, mirroring coinBudget/
   * bountyPaid). On the 30th, 60th, … kill MobSystem triggers grantLevels(1).
   * Empty when the mechanic is off, so a pre-feature world hashes identically.
   */
  readonly mobKills = new Map<EntityId, number>();

  /**
   * 殭屍王傷害帳本 (task #262): boss entity -> (champion entity -> damage that
   * champion has done to it). Read exactly once, when the king dies, to split
   * the bounty in proportion (`splitBossBounty`, sim/mobBoss.ts).
   *
   * WHY A NEW MAP AND NOT `recentDamagers`. `recentDamagers` looks like the
   * right home — it is even called 「誰對誰造成多少傷害」 in conversation — but
   * its value is a TICK, not an amount (`m.set(source, world.tick)` in
   * stats/matchStats.ts), and `targeting.ts` reads it back as a tick for threat
   * memory. It also drops every packet whose TARGET is not a champion, so a
   * king's damage never entered it at all. Overloading it would have silently
   * broken assist credit and bot threat targeting to store a number it cannot
   * hold.
   *
   * Written by `recordDamage` for BOSS mobs only, so an ordinary zombie costs
   * nothing and a world with no king never allocates. Cleared per boss on death
   * (via `destroy`) and wholesale by `endCombatMobs`.
   *
   * OUT OF `digest()`, on the `recentDamagers` / `bountyPaid` precedent: its
   * only observable effect is the gold/xp it grants, and `matchStats.goldEarned`
   * + `champion.gold` are already digested, so a replica that accumulated a
   * different ledger says so on the tick the king dies.
   */
  readonly bossDamage = new Map<EntityId, Map<EntityId, number>>();

  /**
   * Duel zones armed for mob waves this combat (task #215). Host state like
   * `flowerZones`: assigned identically on every replica from a deterministic
   * source (the round's pairings), never mutated by a system, so it stays out of
   * digest(). Empty unless mobs are armed.
   */
  readonly mobZones = new Set<number>();

  /**
   * Active 鎮守之力 buffs (task #89 §8.3): killer entity -> the inherited-volley
   * pulse state. A flat, non-scaling aura, so it lives in its own map rather
   * than as a stat ModifierSource (it changes no stat). Pulsed + expired by
   * GuardianSystem; folded into digest() so a desync surfaces.
   */
  readonly guardianBuffs = new Map<EntityId, GuardianBuff>();

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
   * 連殺 COMBO per killer (owner, 2026-07-27): tick of the last kill + the chain
   * length. ZOMBIES AND CHAMPIONS SHARE THIS ONE NUMBER — see
   * sim/combat/killCombo.ts for the ruling and for why neither `mobKills` nor
   * `killTracking` could carry it.
   *
   * OUT OF `digest()`, on the `killTracking` / `recentDamagers` precedent and
   * for the same reason: this map changes nothing else in the world. It grants
   * no gold, no xp, no level and no stat — its ONLY observable effect is the
   * `killCombo` event, and an event stream that disagreed between replicas would
   * have to come from a kill that disagreed, which every existing digest field
   * (hp/alive/gold/xp/mobKills) already catches at its source. Folding a
   * pure-presentation counter in would add digest churn without adding reach.
   */
  readonly killCombo = new Map<EntityId, KillComboState>();

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
   * Zones whose DUEL IS ALREADY DECIDED this round (task #216).
   *
   * `combatActive` is GLOBAL: it only drops once EVERY pairing is settled, so
   * between "my 3v3 ended" and "the last zone's 3v3 ends" the round is over for
   * me and still live for the world. That window is the #216 bug — the fire
   * ring kept eating the survivors of a finished duel (161 → 39 HP in the
   * playtest), and since a player defeated this round is already looking at the
   * shop (ui/panels/shopGate), the HP was visibly draining behind the shop card.
   *
   * This is RECORDED SIM STATE, not host state: the match host writes a zone in
   * the same instant it records that zone's duel winner (`checkCombatEnd`) and
   * clears the whole set in `enterCombat`, both of which are already
   * deterministic (their only tie-breaks draw from `world.rng`). It is folded
   * into the replay host-digest next to `combatActive`, so a replica that
   * disagrees about which zone finished says so on the tick it happens.
   *
   * Systems must treat a settled zone as "combat is over HERE": no fire-ring
   * burn (FireRingSystem + fireRing.isBurnedByFireRing), no mob aggro/melee and
   * no new mob spawns (MobSystem). It never freezes the ring's shrink CLOCK or
   * radius — those stay global, because the snapshot replicates one radius for
   * the whole arena (protocol/schema.ts) and the still-live zone needs it.
   */
  readonly settledZones = new Set<number>();

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

  /**
   * 面向鎖 (task #264) — entity → 一次「出手」commit 的瞄準方向 + 絕對到期 tick。
   * ABSENT = 沒有出手，面向照舊由移動方向決定。
   *
   * 為什麼要有這張表：`Transform.facing` 原本沒有擁有權模型，MovementSystem 每
   * tick 都無條件把它轉向移動方向，於是 castAbility 在同一 tick 稍早寫進去的施法
   * 面向存活 0 tick，而普攻根本沒有任何一行寫過面向。詳見 `sim/facingLock.ts`。
   *
   * 用絕對 tick 到期（而不是每 tick 遞減）是刻意的：不需要新的 decay system，也
   * 就沒有「arm 與 decay 誰先跑」的順序陷阱。過期項目在 `facingLockDir` 讀到時
   * 順手刪除。
   */
  readonly facingLock = new Map<EntityId, import("./facingLock").FacingLock>();

  /**
   * 瞄準優先 (owner 2026-07-28:「面向是瞄準優先」) —— entity → 最後一次收到
   * **明確瞄準輸入** 的 tick。`aimTick.get(id) === tick` 就是「這一 tick 玩家正在
   * 瞄」,那一 tick 的面向鎖必須讓位。
   *
   * 存 tick 而不是 boolean,是為了不需要一個「每 tick 清空」的步驟 —— 沒有清空
   * 步驟就沒有「誰先跑」的順序陷阱,和 facingLock 用絕對 tick 到期是同一個理由。
   */
  readonly aimTick = new Map<EntityId, number>();

  /**
   * AIRBORNE RENDER STATE (task #247) — entity → { y: GGD units above the arena
   * floor }. ABSENT = grounded.
   *
   * A separate store rather than a field on `Transform`, whose contract is
   * literally "planar … NO y". Absence-means-grounded keeps every non-leaping
   * entity (projectiles, coins, flowers, twelve champions) byte-identical to a
   * pre-#247 world, which is also why the digest folds it in ONLY when present.
   *
   * Created at takeoff, DELETED at landing/cancel — so a nulled `nav.override`
   * and an absent entry always agree about who is in the air.
   *
   * The `scaleMul` companion field #247 shipped alongside `y` is GONE (#247
   * follow-up): every writer set it to a literal 1, so the whole scale lane —
   * this field, the `sc` wire channel, its interpolation and its ChampionView
   * plumbing — was dead. See protocol/schema.ts for the removal note and for the
   * real JASS numbers of the one ability (A0U8 巨神一擊) that would have used it.
   */
  readonly airborne = new Map<EntityId, { y: number }>();

  /**
   * 變身 state (task #249) — entity → which half of its w3x `Eme1`/`Emeu` pair
   * the body currently is, the base id to go home to, and the ABSOLUTE tick the
   * form lapses on. ABSENT = the entity is in its BASE body, which is why a
   * champion that transformed and reverted hashes identically to one that never
   * transformed (see systems/ChampionFormSystem.ts, and `airborne` above for
   * the same absence-means-default contract).
   *
   * NOT named `transform`: {@link SimWorld.transform} is the POSITION component
   * and has been since the skeleton. The 變身 mechanic is `championForm`
   * everywhere — component, system, EffectDef kind — so the two can never be
   * confused at a call site.
   *
   * Written ONLY by ChampionFormSystem (`applyChampionForm` / `revertToBaseForm`),
   * which is also the only writer of the two `championId` copies the body
   * resolves through.
   */
  readonly championForm = new Map<
    EntityId,
    import("./systems/ChampionFormSystem").ChampionFormComp
  >();

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
   * 武器貨架 open/closed (#261) — 「除了能力屬性強化、及傳說寶玉外，其他武器道具
   * 先全部暫時下架無法選擇」.
   *
   * Defaults to the shipped {@link WEAPON_SHELF_OPEN} flag (today: closed), so
   * a match behaves as the owner asked without any host wiring. It is a FIELD
   * rather than a bare import so a caller can run the full catalogue — every
   * weapon-economy test does exactly that, because those rules did not go away
   * when the shelf closed and their guards must keep standing.
   *
   * It gates ONLY `buyItem`. The draft / loot / 傳說寶玉 path never reads it —
   * 「隨機三選一仍然可以隨機到」 — and economy/shopShelf.test.ts pins that split.
   * Host CONFIG assigned before tick 0, never mutated by a system, so it
   * perturbs no rng stream and replays identically.
   */
  weaponShelfOpen: boolean = WEAPON_SHELF_OPEN;

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
   * Fire-ring rules (ticks), tasks #132/#195. null = the round-pacing hazard is
   * OFF (legacy behavior, unit tests, the client's prediction shadow world).
   * The match host arms these via beginCombatFireRing/endCombatFireRing (see
   * fireRing.ts). While armed AND `combatActive`, fireRingSystem contracts the
   * ring and burns every living champion standing OUTSIDE it. The RADIUS is
   * never stored: it is a pure function of these rules and `fireRingTicks`
   * (`currentFireRingRadius`), so it can never drift out of step with the tick.
   */
  fireRingRules: FireRingRules | null = null;

  /**
   * Combat-elapsed ticks for the fire ring. -1 = not armed (fireRingSystem
   * idles). Set to 0 by beginCombatFireRing and incremented by fireRingSystem
   * each LIVE-combat tick, so ignition + the ramp are deterministic world state.
   * Kept SEPARATE from `combatTicks` (which only advances while flowers are
   * armed) so the ring's schedule never depends on whether flowers are enabled.
   */
  fireRingTicks = -1;

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
   * 基礎加成 (see baseBonus.ts) — flat grants added AFTER `combatEnv` scales
   * the stat, so a 3× health multiplier does not also triple the gift.
   * owner 2026-07-28:「並且不參與倍率計算」.
   */
  baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS;

  /**
   * 屬性上限表 (see statCaps.ts) — 一般上限 / 解鎖上限。攻速 4.0 → 最多解鎖到
   * 10.0 (owner 2026-07-28, GH#286)。和 `combatEnv` / `baseBonus` 同一條規矩:
   * 開賽前指派一次,之後不再動 —— sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**,不是空表:空表會讓解鎖靜默失效。
   */
  statCaps: StatCapTable = DEFAULT_STAT_CAPS;

  /**
   * 戰鬥手感規則 (see combatFeel.ts) —— 擊退法則 (GH#193) + 打就站定開關。
   * 和 `combatEnv` / `baseBonus` / `statCaps` 同一條規矩:開賽前指派一次,
   * 之後不再動,sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**,不是空表 —— 空表會讓擊退/站定兩條規則靜默消失。
   */
  combatFeel: CombatFeelRules = DEFAULT_COMBAT_FEEL;

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
   * Guardian rules (ticks), task #89. null (default) = the mechanic is OFF
   * (skeleton boot, unit tests, the client's prediction shadow world) and
   * `guardianSystem` is a strict no-op. The match host arms these via
   * `beginCombatGuardians` / `endCombatGuardians` (see systems/GuardianSystem.ts).
   * Host-armed WORLD STATE like flowerRules: assigned once on combat entry on
   * every replica, never mutated by a system, so determinism holds automatically.
   */
  guardianRules: GuardianRules | null = null;

  /**
   * Dropped-coin rules (task #191). null (default) = the mechanic is OFF — unit
   * tests, the client's prediction shadow world, any match whose rules doc has
   * no `goldDrop` block — and EVERY coin code path opens by returning on it, so
   * a pre-feature world is byte-identical down to the digest. The match host
   * arms these via `beginCombatCoins` / `endCombatCoins` (see coins.ts).
   */
  coinRules: CoinRules | null = null;

  /**
   * Mob-wave rules (ticks), task #215. null (default) = the mechanic is OFF —
   * unit tests, the client's prediction shadow world, any match whose rules doc
   * has no `mobWaves` block, or any round before `mobWaves.fromRound` — and
   * EVERY mob code path opens by returning on it, so a pre-feature world is
   * byte-identical down to the digest. The match host arms these via
   * `beginCombatMobs` / `endCombatMobs` (see systems/MobSystem.ts).
   */
  mobRules: MobRules | null = null;

  /**
   * Combat-elapsed ticks driving the mob wave cadence. -1 = not armed
   * (MobSystem idles). Set to 0 by beginCombatMobs and incremented by MobSystem
   * each LIVE-combat tick, so the schedule is deterministic world state. Kept
   * SEPARATE from `combatTicks` (which only advances while flowers are armed) so
   * the wave schedule never depends on whether flowers are enabled — the exact
   * fireRingTicks rationale. Folded into digest ONLY while armed (>= 0).
   */
  mobTicks = -1;

  /**
   * Remaining revive charges this ROUND, per team. Armed to
   * `revivesPerTeamPerRound` on combat entry, spent on a COMPLETED revive
   * (never on spawn), cleared on combat exit. One per team is the largest
   * value that keeps the worst measured duel inside the 90s `combatMaxSec`
   * cap — see docs/todo/revive-circles.md.
   */
  readonly reviveCharges = new Map<TeamId, number>();

  /**
   * The active map geometry (collision truth). Read by MovementSystem /
   * ProjectileSystem / flowers / guardians / revives every step. NOT readonly:
   * the match host swaps it BETWEEN rounds via {@link setArena} for the per-round
   * arena rotation (task #145). The swap only ever happens outside `step()`, at a
   * deterministic seam driven by the round number, so every replica changes it
   * identically and determinism holds.
   */
  arena: ArenaDef;

  constructor(arena: ArenaDef, seed: number) {
    this.arena = arena;
    this.rng = new Rng(seed);
  }

  /**
   * Swap the active arena between rounds (task #145). Host-driven and
   * deterministic (the caller picks it from the seed + round); never called
   * mid-step, so collision geometry is stable for the whole tick.
   */
  setArena(arena: ArenaDef): void {
    this.arena = arena;
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
    this.coin.delete(id);
    this.coinBudget.delete(id);
    this.structure.delete(id);
    this.guardianBuffs.delete(id);
    // task #215: a recycled entityId must never inherit a stale mob marker or
    // kill counter (mobKills is keyed by CHAMPION id, but registering it here is
    // the same defensive contract every other per-entity store follows).
    this.mob.delete(id);
    this.mobKills.delete(id);
    // #262: the king's damage ledger dies with the king. Two entries to clear —
    // this id AS a boss (the outer key) and this id as a DAMAGER of some other
    // boss (an inner key), because a recycled entityId that inherited a stale
    // contribution would be paid for damage it never did.
    this.bossDamage.delete(id);
    for (const ledger of this.bossDamage.values()) ledger.delete(id);
    this.hitstop.delete(id);
    this.knockdown.delete(id);
    this.hitstun.delete(id);
    // task #264: 回收的 entityId 不得繼承上一個單位的瞄準方向。
    this.facingLock.delete(id);
    this.aimTick.delete(id);
    // task #249: nor a stale 變身 form — a recycled id that inherited one would
    // be dragged back to a PREVIOUS unit's base champion on the next tick.
    this.championForm.delete(id);
    this.matchStats.delete(id);
    this.recentDamagers.delete(id);
    this.killTracking.delete(id);
    // 連殺 combo: a recycled entityId must never inherit a stale chain — the
    // same defensive contract every other per-entity store here follows.
    this.killCombo.delete(id);
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
      // Dropped coins are LOOT lying on the floor, not bodies: out of the
      // broad-phase means structurally untargetable (every ability/projectile
      // query walks this grid) and non-colliding, exactly like a circle.
      if (this.coin.has(id)) continue;
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
    championFormSystem(this); //  0a. 變身 (task #249): expire timed forms and
    //                             force the dead / unresolvable back to their
    //                             base body.
    //
    //                             FIRST, and specifically BEFORE
    //                             statRecomputeSystem (1). A revert rewrites
    //                             `StatsComp.championId` and sets `dirty`, and
    //                             the ONLY thing that turns that into real
    //                             numbers is a recompute. Placed after step 1
    //                             instead, a form lapsing on tick T would leave
    //                             the body fighting that whole tick on the OTHER
    //                             form's sheet — the alternate's move speed at
    //                             movementSystem (5), its attack speed at
    //                             basicAttackSystem (6), its AD/AP in every
    //                             packet drained at combatResolveSystem (8) —
    //                             and only the LATE recompute at step 11 would
    //                             clean it up, one tick after the form was
    //                             already gone. Here, the tick that reverts is
    //                             the first tick that fights as the base hero.
    //
    //                             ENTERING a form is the mirror case and needs
    //                             no slot of its own: casts land at
    //                             commandSystem (3), and step 11's late
    //                             recompute is exactly the seam every other
    //                             same-tick `attachSource` already relies on.
    auraSystem(this); //          0b. reconcile aura membership against the grid
    //                             just rebuilt above, BEFORE the recompute below
    //                             folds it in — so an aura entered this tick
    //                             affects this tick's movement/attacks/casts and
    //                             no second recompute is needed (aura/aura.ts).
    statRecomputeSystem(this); // 1. recompute dirty stats
    buffExpirySystem(this); //    1b. expire timed buff sources
    statusExpirySystem(this); // 2. expire statuses (slows/roots/stuns)
    recoveryDecaySystem(this); // 2a. age the post-resolve RECOVERY commitment.
    //                             BEFORE castResolve so nothing armed this tick
    //                             is aged this tick -> a recovery of N ticks
    //                             blocks exactly N (see RecoverySystem.ts).
    castResolveSystem(this); //   2b. resolve elapsing ability casts (cast time)
    //                             — and ARM recovery at the end of startup
    commandSystem(this, intents); // 3. cast / buy / pick / rank commands
    orderSystem(this, intents); // 4. orders -> nav targets
    leapSystem(this); //     4b. advance parabolic leaps (task #247) — position,
    //                             height and the landing detonation. IMMEDIATELY
    //                             before movementSystem, which then sees the
    //                             `leap` override and leaves the body alone.
    movementSystem(this); // 5. integrate + collide
    basicAttackSystem(this); // 6. autos on attack targets in range
    projectileSystem(this); // 7. advance projectiles, swept hits
    hitstopDecaySystem(this); //  7b. age hitstop/knockdown AFTER their gates ran
    //                             (movement/attack), BEFORE this tick's hits set
    //                             fresh values -> a hit on tick T freezes exactly
    //                             T+1..T+N (see SimWorld.hitstop docs).
    combatResolveSystem(this); // 8. drain damage queue (mitigation/shields/hooks
    //                             + combat-juice: hitstop/knockback/knockdown)
    fireRingSystem(this); //  8b. round-pacing fire ring: escalating %-HP true burn
    //                             (no-op unless armed + combatActive); runs BEFORE
    //                             deathSystem so its kills resolve THIS tick (#132)
    deathSystem(this); // 9. deaths, kill credit, xp/gold
    flowerSystem(this); //   9b. flower burst on death + spawn cadence (no-op unless armed)
    reviveSystem(this); //   9c. revive circles: drop on death, channel, revive/expire
    //                             (no-op unless armed; consumes this tick's deaths)
    guardianSystem(this); // 9d. neutral guardian: threat/wake, AoE volley, last-hit
    //                             payout (no-op unless armed). Runs AFTER deathSystem
    //                             (sees this tick's `death`) and reviveSystem (killer's
    //                             final alive-state is settled before payout).
    mobSystem(this); //      9d′. roguelite mob waves: clock/spawn schedule, AI aim,
    //                             melee queue, +gold/xp payout + every-30 level-up
    //                             (no-op unless armed + combatActive). Same slot
    //                             rationale as the guardian: reads THIS tick's
    //                             `death` events before paying, and queues melee /
    //                             sets nav.attackTarget for next-tick resolve/chase.
    coinSystem(this); //     9e. 陣亡投幣 pickup: a living champion walks onto a
    //                             dropped coin and banks it (no-op unless armed).
    //                             AFTER deathSystem/reviveSystem/guardianSystem so
    //                             this tick's alive-state is final before anyone is
    //                             paid; the throw itself happened back at slot 3.
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
      // Post-resolve RECOVERY (後搖) is authoritative world state — it gates
      // casts, autos and (when `roots`) movement, so a replica that cancelled it
      // on a hit the other did not must surface here rather than as a silent
      // divergence three ticks later. 0 when free, which is the overwhelmingly
      // common case, so a pre-feature world hashes identically.
      mix(this.abilities.get(id)?.recovery?.ticksLeft ?? 0);
      // task #221: the CURRENT auto-attack target is authoritative world state
      // now that the sim PICKS IT ITSELF. A replica that acquired a different
      // enemy must surface here on the acquiring tick rather than three seconds
      // later as a position/HP drift nobody can trace back.
      //
      // Folded in ONLY when a target exists — mixing a `-1` sentinel for the
      // (overwhelmingly common) untargeted entity would change the hash of every
      // pre-feature world and break the #191 disarmed-golden canary for no
      // information gain. `id` is re-mixed alongside so "entity 7 targets 9"
      // can never collide with "entity 9 targets 7".
      const at = this.nav.get(id)?.attackTarget;
      if (at !== null && at !== undefined) {
        mix(id);
        mix(at);
      }
      // task #247: AIRBORNE state is authoritative world state — a replica whose
      // leap is one tick out of phase (or that cancelled one the other did not)
      // must surface HERE, on the tick it happens, rather than as an unexplained
      // position drift three seconds later. Folded in ONLY when the entity is in
      // the air, following the `attackTarget` precedent above verbatim: mixing a
      // 0 for every grounded entity would change the hash of every pre-#247
      // world and break the #191 disarmed-golden canary for no information gain.
      const air = this.airborne.get(id);
      if (air) {
        mix(id);
        mix(air.y);
      }
      // task #249 變身: WHICH BODY this entity is currently resolving through is
      // authoritative world state, and it is otherwise INVISIBLE to this hash.
      // Nothing above walks `this.champion`, so `championId` — the input to
      // `recomputeStats`, to the snapshot's model lookup and to every hit-feel
      // read — could be swapped on one replica and not the other with the digest
      // none the wiser. Two forms of the same hero can share a maxHealth and
      // differ in armor/attack speed/range, in which case not one existing field
      // moves: the desync would surface minutes later as an unexplained damage
      // divergence. (#198 is the open non-determinism hunt this class of blind
      // spot feeds.)
      //
      // `expiresTick` rides along so a replica that armed a DIFFERENT duration
      // says so on the transform tick rather than on the revert tick, the same
      // reason `structure` folds `wakeTick`/`nextVolleyTick`.
      //
      // Folded in ONLY when the entity is out of its base body, following the
      // `attackTarget` / `airborne` precedent above verbatim: absence means base
      // form, so a pre-#249 world (and any world where nobody transformed, and
      // any world where everybody transformed BACK) hashes byte-identically.
      // `id` is re-mixed alongside so "entity 7 is transformed" cannot collide
      // with a different entity's fold.
      const cf = this.championForm.get(id);
      if (cf) {
        mix(id);
        mix(cf.index);
        mix(cf.expiresTick);
      }
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
      mix(rc.contested ? 1 : 0);
    }
    for (const [teamId, charges] of this.reviveCharges) {
      mix(teamId);
      mix(charges);
    }
    // Dropped coins + the per-player throw budget (task #191). This is the ONLY
    // way the DROP side becomes visible to a digest at all: a coin carries no
    // health, and `champion.gold` was never hashed here — so without these folds
    // a replica that spawned a coin the other did not would look identical until
    // somebody walked over it. Both maps are empty when the mechanic is off, so
    // a pre-feature world hashes byte-identically.
    for (const [id, c] of this.coin) {
      mix(id);
      mix(c.value);
      mix(c.zone);
      mix(c.ownerSeatId);
    }
    for (const [id, left] of this.coinBudget) {
      mix(id);
      mix(left);
    }
    // guardians (task #89) are authoritative world state: a wake/volley/threat
    // that advanced on one replica but not another must surface here as a
    // mismatch. When the mechanic is off both maps are empty and the digest is
    // byte-identical to a pre-feature world.
    for (const [id, sc] of this.structure) {
      mix(id);
      mix(sc.wakeTick);
      mix(sc.nextVolleyTick);
      mix(sc.lastDamagedTick);
      mix(sc.volleysFired);
      mix(sc.marks.length);
      let tsum = 0;
      for (const v of sc.threat.values()) tsum += v;
      mix(tsum);
    }
    for (const [id, b] of this.guardianBuffs) {
      mix(id);
      mix(b.expiresAtTick);
      mix(b.nextPulseTick);
      mix(b.round);
    }
    // roguelite mobs (task #215) are authoritative world state: a spawn/aim/
    // melee-cooldown that advanced on one replica but not another must surface
    // here as a mismatch. Transform pos/facing + Health hp/mana are folded
    // generically above (a mob has both), so only the mob-specific fields go
    // here — plus the per-champion kill counter (the every-30 level-up trigger)
    // and the schedule clock. All THREE are empty / -1 when the mechanic is off,
    // so a pre-feature world hashes byte-identically.
    for (const [id, m] of this.mob) {
      mix(id);
      mix(m.target);
      mix(m.attackCdTicks);
      mix(m.zone);
    }
    for (const [id, n] of this.mobKills) {
      mix(id);
      mix(n);
    }
    // Guard the clock: fold it ONLY while armed so a mid-tick schedule desync
    // surfaces the SAME tick (the gold-only-divergence blind spot), while a
    // disarmed / pre-feature world (mobTicks === -1) skips it entirely.
    if (this.mobTicks >= 0) mix(this.mobTicks);
    // THREAT MEMORY (task #221). `recentDamagers` used to be pure assist
    // bookkeeping and was deliberately kept OUT of the digest as transient.
    // It is not transient any more: sim/targeting.ts reads it as the 「優先打
    // 攻擊自己的敵人」 key, so a divergence here silently changes WHO everyone
    // attacks. Both levels are iterated in explicit ASCENDING-ID order — the
    // inner map's own order is first-hit order, which is exactly the kind of
    // Map-insertion accident a digest must not depend on.
    const victims = [...this.recentDamagers.keys()].sort((a, b) => a - b);
    for (const victim of victims) {
      const byAttacker = this.recentDamagers.get(victim)!;
      mix(victim);
      const attackers = [...byAttacker.keys()].sort((a, b) => a - b);
      for (const attacker of attackers) {
        mix(attacker);
        mix(byAttacker.get(attacker)!);
      }
    }
    mix(this.rng.state);
    mix(this.tick);
    return h >>> 0;
  }
}
