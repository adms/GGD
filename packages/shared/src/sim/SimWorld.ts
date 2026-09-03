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
import {
  SHIPPED_ONE_SHOT_CLAMP,
  type ConfigOneShotClampDoc,
} from "../content/schema/config/oneShotClamp";
import {
  DEFAULT_BASE_BONUS,
  DEFAULT_PER_LEVEL_BONUS,
  type BaseBonusTable,
  type PerLevelBonusTable,
} from "./baseBonus";
import { DEFAULT_STAT_CAPS, type StatCapTable } from "./statCaps";
import { DEFAULT_ECONOMY, type EconomyRules } from "./economy/economyRules";
import { DEFAULT_BODY_SCALE_RULES, type BodyScaleRules } from "./bodyScale";
import { DEFAULT_REGEN_RULES, type RegenRules } from "./regenRules";
import { DEFAULT_MANA_ECONOMY, type ManaEconomy } from "./manaEconomy";
import {
  DEFAULT_CONTROLLER_SCHEME,
  type ControllerSchemeEntry,
} from "../content/schema/config/controllerScheme";
import { DEFAULT_COMBAT_FEEL, type CombatFeelRules } from "./combatFeel";
import { DEFAULT_MARKED_BLINK, type MarkedBlinkRules } from "./movement/markedBlink";
import { DEFAULT_WALL_BLOCK, type WallBlockRules } from "./movement/wallBlock";
import { DEFAULT_SHIELD_RULES, type ShieldRules } from "./shieldRules";
import { DEFAULT_BLOCK_RULES, type BlockRules } from "./blockRules";
import { DEFAULT_CRIT_RULES, type CritRules } from "./critRules";
import type { MarkId, MarkState } from "./marks";
import {
  DEFAULT_AUGMENT_ENEMY_FILTER,
  type AugmentEnemyFilter,
} from "./augmentEnemyFilter";
import { DEFAULT_STEALTH_RULES, stealthSystem, type StealthRules } from "./stealth";
import { DEFAULT_VISION_RULES, type VisionRules } from "./vision";
import { DEFAULT_BERSERK_RULES, type BerserkRules } from "./abilities/berserkRules";
import { DEFAULT_DISPEL_RULES, type DispelRules } from "./dispelRules";
import { DEFAULT_COOLDOWN_RULES, type CooldownRules } from "./cooldownRules";
import { DEFAULT_GRAIL_DRAFT, type GrailDraftRules } from "./economy/grailVocabulary";
import { DEFAULT_CAST_TIME_RULES, type CastTimeRules } from "./castTimeRules";
import { DEFAULT_WOUND_RULES, type WoundRules } from "./grievousWounds";
import { DEFAULT_WEAKNESS_RULES, type WeaknessRules } from "./weakness";
import { DEFAULT_DAMAGE_RULES, type DamageRules } from "./damageRules";
import {
  DEFAULT_AP_DAMAGE_SCALING,
  type ApDamageScaling,
} from "./combat/apDamageScaling";
import { DEFAULT_MITIGATION_RULES, type MitigationRules } from "./combat/penetration";
import { DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES } from "./economy/offerEligibility";
import {
  DEFAULT_TAUNT_RULES,
  forgetSuspendedOrdersOn,
  forgetTauntsBy,
  type TauntRules,
} from "./taunt";
import {
  DEFAULT_SELL_REFUND_PCT,
  LEGENDARY_PRICE_MULTIPLIER,
  LEGENDARY_SHELF_OPEN,
  WEAPON_SHELF_OPEN,
} from "./economy/shopShelf";
import type { StatsComp, AbilitiesComp } from "./stats/statsComp";
import type { PlayerMatchStats } from "./stats/matchStats";
import { accumulateTimeAlive } from "./stats/matchStats";
import type { DamagePacket } from "./combat/damage";
// `pendingReflectHooks` 的 provenance。type-only —— 編譯後整行消失，不成環。
import type { TriggerDamage } from "./effects/effect";
import type { KillComboState } from "./combat/killCombo";
import { SpatialHash } from "./collision/spatialHash";
import type { ArenaDef } from "./world/ArenaDef";
import { gateScheduleOf, type GateSchedule } from "./map/gates";
import { TICK_MS } from "../constants";
import { orderSystem } from "./systems/OrderSystem";
import { movementSystem } from "./systems/MovementSystem";
import { carrySystem } from "./systems/CarrySystem";
import { mindControlExpirySystem } from "./mindControl";
import { leapSystem } from "./systems/LeapSystem";
import { statRecomputeSystem, buffExpirySystem } from "./stats/statPipeline";
import { resourceStatSystem } from "./stats/resourceStats";
import { auraSystem } from "./aura/aura";
import { auraCarrierSystem } from "./auraCarrier";
import { deathWardSystem } from "./deathWard";
import { commandSystem } from "./systems/CommandSystem";
import { castResolveSystem } from "./systems/CastResolveSystem";
import { recoveryDecaySystem } from "./systems/RecoverySystem";
import { basicAttackSystem } from "./systems/BasicAttackSystem";
import { toggleUpkeepSystem } from "./abilities/toggle";
import { projectileSystem } from "./systems/ProjectileSystem";
import { combatResolveSystem } from "./combat/damage";
import { flightSystem } from "./flight";
import { attrGrantExpirySystem } from "./effects/grantAttribute";
import { ccHookSystem } from "./systems/CcHookSystem";
import { reflectHookSystem } from "./systems/ReflectHookSystem";
import { dotTickSystem } from "./effects/dotTick";
import { intervalHookSystem } from "./systems/IntervalHookSystem";
import { randomAreaSystem } from "./effects/randomArea";
import { delayedSystem } from "./effects/delayed";
import { chainLightningSystem } from "./effects/chainLightning";
import { dashOnEndSystem } from "./effects/dashOnEnd";
import { deathSystem } from "./systems/DeathSystem";
import { fireRingSystem } from "./systems/FireRingSystem";
import { flowerSystem } from "./systems/FlowerSystem";
import { reviveSystem } from "./systems/ReviveSystem";
import { coinSystem } from "./systems/CoinSystem";
import { worldHookSystem } from "./systems/WorldHookSystem";
import { regenSystem } from "./systems/RegenSystem";
import { statusExpirySystem } from "./systems/StatusSystem";
import { statusGatedPassiveSystem } from "./statusGatedPassives";
import { hitstopDecaySystem } from "./systems/HitstopSystem";
import {
  guardianSystem,
  type StructureComp,
  type GuardianBuff,
  type GuardianRules,
} from "./systems/GuardianSystem";
import { objectiveSystem, type ObjectiveRules } from "./systems/ObjectiveSystem";
import { mobSystem } from "./systems/MobSystem";
import { summonSystem } from "./summons";
import { championFormSystem } from "./systems/ChampionFormSystem";

export interface SimEvent {
  type: string;
  tick: number;
  data: Record<string, unknown>;
}

/** 空的下架清單 —— ⛔ 每個 world 共用同一份，不要每次 new 一個 Set。 */
const EMPTY_RETIRED: ReadonlySet<string> = new Set();

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
   * Written by `recordDamage` for the mob kinds whose reward is SPLIT — the
   * 殭屍王 and, since #288, the 特殊殭屍 with an authored 分紅獎池. An ordinary
   * zombie costs nothing (see the O(n²) note in `recordDamage`) and a world with
   * neither armed never allocates. Cleared per mob on death (via `destroy`) and
   * wholesale by `endCombatMobs`.
   *
   * OUT OF `digest()`, on the `recentDamagers` / `bountyPaid` precedent: its
   * only observable effect is the gold/xp it grants, and `matchStats.goldEarned`
   * + `champion.gold` are already digested, so a replica that accumulated a
   * different ledger says so on the tick the king dies.
   */
  readonly bossDamage = new Map<EntityId, Map<EntityId, number>>();

  /**
   * 這一回合每個戰場已經來過幾隻殭屍王 (#247, owner 2026-08-01 「每回合最多只會
   * 出現一次殭屍王，不會無限出場」).
   *
   * KEY is `bossSpawnCapKey(zone, scope)` — the duel zone, or `-1` for the
   * 「整場」 bucket. Written ONLY by `summonMobBoss` and cleared wholesale by
   * `endCombatMobs`, which is the round boundary the host already calls. So the
   * reset is an EVENT, not a deadline: there is no tick arithmetic here and
   * nothing to drift (sim/purity.test.ts bans the decrementing-counter shape
   * this would otherwise have taken).
   *
   * OUT OF `digest()`, on the `bossDamage` precedent directly above: the only
   * observable effect of this counter is whether a king entity exists, and the
   * king's spawn (its transform, its hp, its `mobSpawn`-side effects) is already
   * digested at its source. A replica that counted differently diverges on the
   * tick a king does or does not appear.
   *
   * NEVER ITERATED — only `get`/`set`/`clear` — so Map insertion order cannot
   * leak into the sim (the sorted-iteration rule).
   */
  readonly bossSpawnsThisRound = new Map<number, number>();

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
   * 具名標記（層數）—— 【試煉】【風王結界】【縮地】共用的同一個機制。
   * 外層 key 是持有者，內層 key 是**一份既有文件的 id**（技能編號 或
   * status-effect id）。整套語意與「為什麼不能用 applyBuff/applyStatus 表達」
   * 寫在 `sim/marks.ts` 的檔頭。
   *
   * ⭐ **它跨回合活著，而且那是免費的**：`SimWorld` 在 `MatchController` 的
   * 建構子裡建，一場比賽只有一個（`MatchController.ts:894`）。所以
   * `resetOn: "match"`（十二道試煉的「跨回合共享 12 次」）**不需要任何程式**，
   * 需要程式的是反過來的 `resetOn: "round"`（`resetMarksForRound`）。
   *
   * 折進 `digest()`：層數決定「這一發會不會殺死你」，一個層數不同步的 replica
   * 會在某個人該死沒死的那一 tick 分岔，而那正是最難反推的一種。
   */
  readonly marks = new Map<EntityId, Map<MarkId, MarkState>>();

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
   * 「一隊全滅之後，這個 zone 不再生新的殭屍」—— owner 2026-08-02
   * 「敵方英雄全死光 或我方英雄全死光 殭屍就不應該再生成」。
   *
   * ⚠️ 為什麼這是一個**獨立**的集合，而不是直接寫進 `settledZones`：
   * `settledZones` 同時代表三件事（不生怪 ⊕ 掉仇恨 ⊕ 火圈不燒），而主機在
   * 「一隊全滅但殭屍王還站著」那一刻**只想要第一件**。把 zone 丟進
   * `settledZones` 會順手讓王掉仇恨，王就變成一個站著不還手的沙包 —— 那不是
   * 「壓住回合是為了讓你去打王」的意思。
   *
   * ⚠️ 它跟 `settledZones` 一起在 `MatchController.enterCombat` 清空。
   * 生成閘門是 `MobSystem` 那一圈的 `settledZones.has(zone) ||
   * spawnHaltedZones.has(zone)`；兩個都是 SIM 狀態（不是主機狀態），所以客戶端
   * 預測重播得到一樣的結果。
   */
  readonly spawnHaltedZones = new Set<number>();

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
   * 卡住就接敵 (GH#216) —— entity → **連續**幾個 tick 手上有走不動的移動指令。
   * ABSENT / 0 = 這個走位正在前進(或根本沒有走位)。
   *
   * 計數器而不是「起始 tick」是刻意的,而且**不違反**「到期一律用絕對 tick」那條
   * 規則:那條規則防的是「每 tick 遞減、誰先跑就差一格」的到期陷阱。這裡是相反
   * 的方向 —— 它是一個**每 tick 由當下速度重新判定**的連續計數,寫在 orderSystem
   * (slot 4)一個地方、讀在同一個 pass 裡,沒有第二個 writer,也就沒有順序陷阱。
   * 存起始 tick 反而會錯:走位卡住→走得動→又卡住,起始 tick 沒有「重新起算」的
   * 語意,而連續性正是這個訊號的全部意義。
   */
  readonly walkStall = new Map<EntityId, number>();

  /**
   * 卡住就接敵的**鎖** (GH#216) —— 裡面的 entity 正在自動接敵,追擊因此可以覆寫
   * 一個走不動的移動指令。
   *
   * 為什麼要鎖:追擊一接手,身體就動了 → 不再算「卡住」→ 追擊立刻放手 → 又撞回
   * 牆上。沒有鎖的話每 `stallTicks` 個 tick 只能前進一個 tick,量到的位移是
   * 3% 的正常速度。
   *
   * ⚠️⚠️ 2026-07-30 更正:這裡原本寫著「鎖住之後,只有『目標沒了』或『玩家下了
   * 別的指令』會解鎖」。對照出貨程式碼那句話是**三重錯的**,而且它是這個
   * 檔案獨立的第二份 —— `combatFeel.ts` 那份改掉的時候漏了它。出貨的解鎖路徑
   * 一共有五條,全部在 `systems/OrderSystem.ts`(下面用**條件式**指路,不用行號
   * —— 這份清單第一版寫的是 `:165-168` / `:405` / `:505` / `:342` / `:368`,
   * 五個**全部**已經飄掉十幾行,而行號飄掉的那天沒有任何東西會紅):
   *
   *   1. `orderSystem` 的 `ae.respectLiveSteering && order.kind === "move"`
   *      —— **主要**路徑,而且是被漏掉的那條:一條**新到的 `move`**(和原本
   *      那條**同一種**指令,不是「別的指令」)當場歸零 `walkStall` 並解鎖。
   *      搖桿每一拍都送一條,所以推著搖桿的人永遠不會被接管。
   *   2. `autoAcquirePass` 的 `order?.kind !== "move"` —— 這才是「玩家下了
   *      別的指令」(A-click / 點名目標 / S / H),或走位結束回到 idle。
   *   3. `autoAcquirePass` 的 `if (!best)` —— 「目標沒了」。解鎖的同時把玩家
   *      原本的 `nav.moveTarget` 還原回去(追擊可能把它設成 null)。
   *   4. `autoAcquirePass` 的 `!hp?.alive` —— 死了 / 沒有身體。
   *   5. `autoAcquirePass` 的 `world.settledZones.has(t.zone)` —— 這個 zone 的
   *      回合已經結算。
   *
   * 只做 has/add/delete,從不迭代 —— Set 的迭代順序是插入順序,那會把主機的
   * spawn 順序帶進 sim。
   */
  readonly autoEngaging = new Set<EntityId>();

  /**
   * ⭐ 打帶跑 (GH#637) —— entity → 自動索敵冷卻到哪一個**絕對 tick**(exclusive:
   * `tick < 值` 才算窗口內)。玩家**點地板**(一次離散的 move 指令,⛔ 不是搖桿流)
   * 落地時由 `OrderSystem.armMoveOrderNoAggro` 寫入;窗口內 `autoAcquirePass`
   * 不索新目標、「誰在打我」的反擊接管不生效、已握的**自動**目標當場放下。
   * 只有 `MobRules.humanSeats` 裡的座位會被寫(bot 一格都不受影響),
   * `manualOrder.moveOrderNoAggroSec` 為 0 時沒有任何寫入端(機制關閉)。
   * 絕對 tick,不是遞減計數器(到期規則);只做 get/set/delete,從不迭代。
   */
  readonly moveOrderNoAggroUntil = new Map<EntityId, number>();
  /**
   * GH#637 —— entity → 上一條 move 指令**落地**的 tick。唯一用途:分辨「離散的
   * 點擊」(間隔 ≥ 幾個 tick)與「搖桿每一拍送一條的流」(間隔 1)。只記
   * `humanSeats` 的英雄;讀寫都在 `OrderSystem.armMoveOrderNoAggro` 一個地方。
   */
  readonly lastMoveOrderTick = new Map<EntityId, number>();
  /**
   * ⭐ 最後一次「玩家指令」的 tick（任何 order 或成功施法）——
   * `idleAutoEngageSec` 的計時器（owner 2026-08-28「沒有任何指令，停頓一段時間
   * 就會自動索敵攻擊」）。⛔ 只由 orderSystem 與 castAbility 寫入。
   */
  readonly lastCommandTick = new Map<EntityId, number>();

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

  /**
   * AURA CARRIERS (虛擬蝗蟲群, owner 2026-07-29) — carrier entity → the champion
   * it shadows. EMPTY unless somebody is standing in a SECOND FORM whose own
   * innate doc declares an `auras` block; see sim/auraCarrier.ts for why a
   * dummy unit is the only way a form-scoped aura can exist at all.
   *
   * A carrier carries transform + stats + THIS MARKER and nothing else — no
   * ChampionComp, no Health, no Navigation — plus a TeamComp on the host's team
   * with the neutral `-1` seat (the aura's 「友軍」 filter resolves through it).
   * That is the flower / guardian / coin blueprint: every champion iteration,
   * every seat iteration and every alive-count is blind to it by construction.
   *
   * It is ALSO kept out of `rebuildGrid` below, which is what makes it
   * structurally untargetable — every ability, projectile, auto-acquire and mob
   * AI query walks that grid — and out of `projectSnapshot`, which is what
   * keeps it off the wire and off the screen.
   */
  readonly auraCarrier = new Map<EntityId, import("./auraCarrier").AuraCarrierComp>();

  /**
   * 【死亡遺留】the persistent aura objects a champion death leaves on the spot
   * while somebody carrying a `deathWard` grant fights in that zone. 71-00
   * 暗夜契約's 暗夜旗 is the shipped one, but the mechanic is now a GRANT —
   * see sim/deathWard.ts for why that matters (第〇·五守則).
   *
   * Transform + this marker ONLY: no TeamComp (one would corrupt
   * `teamAliveInZone` and duel resolution) and no Health (one would make a
   * banner attackable and inject hp into `digest()`), exactly like a dropped
   * coin. It IS kept out of `rebuildGrid` below — that single line is what makes
   * it structurally untargetable for every ability, projectile, auto-acquire and
   * mob-AI query — but UNLIKE an aura carrier it IS published to the wire, as
   * `ENTITY_KIND.NIGHT_FLAG`, because the owner asked for a black circle sized
   * to the aura so players can see where the effect reaches. See sim/deathWard.ts.
   */
  readonly deathWard = new Map<EntityId, import("./deathWard").DeathWardComp>();

  /** queued damage, drained by combatResolveSystem in one ordered pass */
  readonly damageQueue: DamagePacket[] = [];

  /** rebuilt each tick before systems run */
  readonly grid = new SpatialHash(4);

  /** events emitted this tick (drained by the host after step) */
  readonly events: SimEvent[] = [];

  /** whether intermission commands (buy/pick/rank) are currently legal */
  economyOpen = true;

  /**
   * 回合已經結算、中場還沒開始的那一段（`MatchPhase` 的 `"resolution"`）。
   *
   * ⛔ 沒有這一格的話，那一段在商店眼裡與選角／全場結束**完全一樣** ——
   * `economyOpen` 與 `combatActive` 都是 false，所以 `shopAccess` 推導出
   * `"closed"`，連**剛剛被打倒的那個人**都被拒（訊息還是「現在不是備戰時間」）。
   *
   * ⚠️ 而那正是最常撞到的一刻：「只剩一隊存活就立即宣佈回合勝利」（#208）
   * 讓**你被打倒的瞬間往往就是結算的瞬間**，所以陣亡者按下商店時，相位已經
   * 走進那個窗口了。owner 2026-08-06 的規則是「被打倒就可以買，被復活就不行」，
   * 而復活發生在中場，所以這一段必須對陣亡者開著。
   *
   * 兩個既有旗標都是 host 維護的純世界狀態（客戶端照樣重播），這一格同一個
   * 生命週期：`concludeCombat` 設 true，`enterIntermission` / `enterCombat` 清掉。
   */
  roundResolving = false;

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
   * 三選一不可以發哪些 `craftRole`（owner 2026-08-04「49支可被隨機三選一 就好」）。
   *
   * 出貨值與完整理由住在 `economy/offerEligibility.ts` 的
   * {@link DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES}；後台欄位是
   * `config.arena-rules@1` 的 `itemDraft.excludedCraftRoles`。
   *
   * ⚠️ 與 `itemEligible` 同一類：host CONFIG，在 tick 0 之前指派一次、每個複本
   * 相同、**沒有任何 system 會改它**，所以決定性不受影響。
   * ⚠️ 它必須在 roll **之前**過濾（`offerEligibility.itemOfferableTo` 就在那個
   * 位置）—— 事後把抽出來的卡濾掉正是 task #47 的空卡缺陷。
   */
  offerExcludedCraftRoles: readonly string[] = DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES;

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
   *
   * ⭐ **GH#350（2026-08-20）：它現在真的有 production 寫入端了。**
   * 後台欄位是 `config.arena-rules@1` 的 `weaponShelfOpen`（競技場規則那一頁），
   * `arenaRules.rulesFromDoc` 讀它，`MatchController` 在 tick 0 之前指派這一格。
   * ⚠️ 在此之前這段註解說得像已經接好，而 `grep world.weaponShelfOpen` 在
   * production 程式是空的 —— 只有測試在寫（`shopShelf.ts` 2026-08-17 更正過
   * 那句話，第三守則）。守衛：`match/weaponShelfWiring.test.ts`，它驗的是
   * **配對關係**（config 打開 → 商店真的收得到錢），⛔ 不是「欄位有值」。
   */
  weaponShelfOpen: boolean = WEAPON_SHELF_OPEN;

  /**
   * 寶具（傳說武器）貨架 + 2026-08-17 那一則的整組**金流旋鈕**。
   *
   * ⚠️ 與 {@link weaponShelfOpen} 是**兩格**：#261 下架的 70 把普通武器仍然
   * 關著。開錯一格會讓 owner 沒要求的那 70 把一起上架。
   *
   * | 欄位 | owner 的話 |
   * |---|---|
   * | `open` | 「寶具(傳說武器) 可以上架直接販售了」 |
   * | `priceMultiplier` | 「價格統一是隨機抽的 N 倍」（08-17 第二則：6 → **4**） |
   * | `sellRefundPct` | 「賣價一定是**取得價**的 40%（後台可設定）」 |
   * | `randomOnlyTables` | 「仍然可以有寶具是**隨機才能取得**的」（[EX解放] / [EX∅ 根源]） |
   *
   * 後三格不只管寶具（退款率是整間商店的、隨機限定是任何抽獎表的）—— 它們
   * 同住一個區塊，是因為它們是**同一個平衡決定**的四個面（見 shopShelf.ts 的
   * {@link DEFAULT_SELL_REFUND_PCT}）。
   *
   * 出貨值引用 `economy/shopShelf.ts` 的常數；後台欄位是 `config.arena-rules@1`
   * 的 `legendaryShelf`。Host CONFIG，⛔ 沒有任何 system 會改它，所以不擾動
   * rng、replay 完全相同（同 `weaponShelfOpen` / `itemEligible`）。
   *
   * 接線：`arenaRules.rulesFromDoc` 讀 `doc.legendaryShelf`，`MatchController` 在
   * tick 0 之前**整塊**指派給 `world.legendaryShelf`。
   *
   * ⚠️ 這一段有過一段**它自己是假的**的歷史，留著當警告：2026-08-17 這四格
   * 做完了 Zod + 出貨 JSON + 後台頁 + sim 讀取，唯獨**沒有人把它從 config 送進 sim**
   * —— 那時 `grep legendaryShelf apps/game-server` 是空的，而這段註解卻寫著
   * 「由 rulesFromDoc 在 tick 0 之前指派一次」。後台四格全部無效，而畫面上看不出來
   * （商店照樣有價格，只是那個價格永遠是程式常數）。⇒ 失敗形態②。
   * 守衛：`apps/game-server/src/match/legendaryShelfWiring.test.ts` ——
   * 它驗的是**配對關係**（把 config 的倍率換掉 → 商店真的收不同的錢），
   * ⛔ 不是「`rules.legendaryShelf` 有值」這種名詞。
   */
  legendaryShelf: {
    open: boolean;
    priceMultiplier: number;
    sellRefundPct: number;
    randomOnlyTables: string[];
  } = {
    open: LEGENDARY_SHELF_OPEN,
    priceMultiplier: LEGENDARY_PRICE_MULTIPLIER,
    sellRefundPct: DEFAULT_SELL_REFUND_PCT,
    // 出貨**空的**：這一批只做機制，49 把寶具照樣全部上架（owner 說的 50~70 把
    // [EX∅ 根源] 還沒有內容）。填一個表名就開始生效，⛔ 不用改程式。
    randomOnlyTables: [],
  };

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
   * ⭐⭐ **一擊必殺的夾限**（GH#928）—— 與 `combatEnv` **完全同一個形狀**：
   * host 在 tick 0 之前指派一次、⛔ 中途不動 ⇒ determinism 自動成立
   * （sim ⛔ 不讀 config/globals）。
   *
   * ⛔⛔ 量到的（owner 2026-09-02 貼的榜單前 100）：**12 列**打掉單一英雄
   * 超過 **100% 最大生命**，最高 **401%**。⭐ 根因是五級距只管加法項
   * （`傷害 = 級距 + 0.8×AP`，而級距是從**純基礎**血量反推的 ⇒ 那個空間裡 AP＝0）。
   *
   * ⭐⭐ **出貨預設 `enabled: false`** ⇒ ⭐ 這一格今天逐位元 no-op。
   * 它存在是為了讓 owner **改一個下拉選單**就能試，
   * ⛔ 不是為了讓我替他決定要不要夾（第一守則：「可調」≠「我可以轉」）。
   */
  oneShotClamp: ConfigOneShotClampDoc = SHIPPED_ONE_SHOT_CLAMP;

  /**
   * ⭐⭐ **每個座位的劣勢度 D ∈ [0,1]**（GH#897）—— 與 `combatEnv` 同一個形狀：
   * host 在每回合開始時指派，⛔ sim 自己不算（它算不到跨回合的勝場與裝備價值）。
   *
   * owner 2026-09-01（逐字）：
   * > 「隨機能力20次後的額外%加成，根據玩家目前**排名&積分**來做權重調整，
   * >  也就是**越排後的玩家額外%加成越高**，讓劣勢方有機會翻盤」
   *
   * ⭐ D 的算法**重用出貨的** `disadvantageScore()`（`economy/weaponTiers.ts`）——
   * ⛔ 這裡不再寫第二套：那一支已經吃三格後台權重（回合差 · 裝備價值差 · 近況），
   * 而 `MatchController` 早就在為武器階級算同一個值。
   *
   * ⚠️ **空的 Map ⇒ 每個人都是 0 ⇒ 逐位元回到今天**（單元測試與客戶端預測都走這條）。
   */
  seatDisadvantage: Map<EntityId, number> = new Map();

  /**
   * 基礎加成 (see baseBonus.ts) — flat grants added AFTER `combatEnv` scales
   * the stat, so a 3× health multiplier does not also triple the gift.
   * owner 2026-07-28:「並且不參與倍率計算」.
   */
  baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS;

  /**
   * ⭐ **每級加成** —— owner 2026-08-13：「英雄**每等級都會 +1 AP**，
   * 這個參數一樣可在後台設定」。
   *
   * ⚠️ 和 `combatEnv` / `baseBonus` / `statCaps` **同一條規矩**：開賽前指派一次，
   * 之後整場不變。它坐在 `finalizeStat` 裡與 `baseBonus` 完全同一個位置
   * （環境倍率之後、夾限之前），差別只有「乘上 (等級 − 1)」。
   */
  perLevelBonus: PerLevelBonusTable = DEFAULT_PER_LEVEL_BONUS;

  /**
   * 屬性上限表 (see statCaps.ts) — 一般上限 / 解鎖上限。攻速 4.0 → 最多解鎖到
   * 10.0 (owner 2026-07-28, GH#286)。和 `combatEnv` / `baseBonus` 同一條規矩:
   * 開賽前指派一次,之後不再動 —— sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**,不是空表:空表會讓解鎖靜默失效。
   */
  statCaps: StatCapTable = DEFAULT_STAT_CAPS;

  /**
   * ⭐ 一場比賽的錢怎麼流（`config.match@1` 的 `economy`，2026-09-01）——
   * 寶玉價 · 精粹價 · 幾次解鎖頂點 · 第幾回合起解鎖。
   *
   * ⚠️ 後兩格在 CLAUDE.md 裡是**被逐字點名的寫死前科**（「兩個常數乘起來
   * 變成不可能，而且後台一個都改不到」）。和 `statCaps` 同一條規矩：
   * 開賽前指派一次，之後整場不變。讀的時候一律走 `economyRules(world)`。
   */
  economy: EconomyRules = DEFAULT_ECONOMY;

  /**
   * 身體放大倍數 → 攻擊距離 (see bodyScale.ts, `config.body-scale@1`, GH#252)。
   * 和 `combatEnv` / `baseBonus` / `statCaps` 同一條規矩:開賽前指派一次,
   * 之後不再動。預設是**出貨值**(owner 2026-08-01 的斷點表 1→1.0 / 2→1.2 /
   * 3→1.3,中間內插、兩端夾住),不是「關掉」—— 一份載入失敗的文件不應該悄悄
   * 拿走 owner 要的行為。
   * 只作用在 `Stat.AttackRange`(普攻);技能距離走 `combatEnv.abilityRange`,
   * 那是另一個決定,理由寫在 bodyScale.ts 的檔頭。
   */
  bodyScaleRules: BodyScaleRules = DEFAULT_BODY_SCALE_RULES;

  /**
   * 百分比回血**與百分比扣血**規則 (see regenRules.ts, `config.regen@1`, GH#253)。
   * 和 `statCaps` 同一條規矩:開賽前指派一次,之後不再動。
   * 兩族都是「英雄卡有填才啟動」:回血看 `healthRegenPctOfMax`(出貨**沒有人**
   * 填),扣血看 `healthDrainPctOfMax`(出貨只有 `godie-hapm` 的 0.01 ——
   * owner 2026-08-02「每秒損失 1%生命, 直到生命不足1%」)。
   */
  regenRules: RegenRules = DEFAULT_REGEN_RULES;

  /**
   * 回魔的**地板** (see manaEconomy.ts, `config.mana-economy@1`, GH#446)。
   * 和 `regenRules` 同一條規矩:開賽前指派一次,之後不再動。
   * owner 2026-08-19「**平均回魔不超過 15 秒就可以滿魔再一輪**」——
   * 出貨值把每一位英雄的滿魔時間夾在 15 秒內(今天量到的是 47.7 秒)。
   */
  manaEconomy: ManaEconomy = DEFAULT_MANA_ECONOMY;

  /**
   * 戰鬥手感規則 (see combatFeel.ts) —— 擊退法則 (GH#193) + 打就站定開關。
   * 和 `combatEnv` / `baseBonus` / `statCaps` 同一條規矩:開賽前指派一次,
   * 之後不再動,sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**,不是空表 —— 空表會讓擊退/站定兩條規則靜默消失。
   */
  combatFeel: CombatFeelRules = DEFAULT_COMBAT_FEEL;

  /**
   * ⭐ 生效中的**手把操作方案**（`config.controller-scheme@1`，GH#863）。
   * 與 `combatFeel` 同一條規矩：開賽前指派一次、之後不動、sim 從不讀 config/globals。
   *
   * ⚠️ sim 只用得到它的 `combatInput` 那一半（「移動算不算戰鬥輸入」），⛔ 不是按鍵 ——
   * 按鍵是客戶端的事。放整個物件而不是一個 boolean 是刻意的：⛔ 不要在這裡
   * 攤平成第二份資料，那正是第〇·四守則說的第二個住處。
   *
   * ⚠️ **這一格會影響所有真人座位，⛔ 不只是拿手把的**（idle 計時器是座位層級的，
   * sim 看不到輸入裝置，也不該看到）。owner 的話是「手把操作**版本**」——
   * 而「走位算不算戰鬥」正是那個版本的一部分。
   */
  controllerScheme: ControllerSchemeEntry = DEFAULT_CONTROLLER_SCHEME;

  /**
   * 位移的穿牆規則 (see movement/wallBlock.ts, `config.displacement-tiers@1`
   * 的 `wallBlock` 區塊) —— owner 2026-08-21「有許多地圖的牆 瞬移過去」。
   * 和 `combatFeel` 同一條規矩:開賽前指派一次,之後不再動。
   * 預設是**出貨表**（＝修好的那一邊），不是空表 —— 空表等於缺陷回來。
   */
  wallBlock: WallBlockRules = DEFAULT_WALL_BLOCK;

  /**
   * ⭐ GH#448 「標記→順移」規則（`config.displacement-tiers@1` 的 `markedBlink`）——
   * 30-00 攝影機那一族。和 `wallBlock` 同一條規矩：開賽前指派一次,之後不再動。
   * 預設是**出貨值**（＝功能開著），⛔ 不是關掉。
   */
  markedBlink: MarkedBlinkRules = DEFAULT_MARKED_BLINK;

  /**
   * 護盾規則 (see shieldRules.ts) —— 目前只有「多個護盾池誰先被吃掉」一格
   * (`config.shield@1`, GH#289 lane P6)。和 `combatEnv` / `baseBonus` /
   * `statCaps` / `combatFeel` 同一條規矩:開賽前指派一次,之後不再動。
   * 預設是**出貨值**(`specificFirst` = 這條規則變成欄位之前的行為),
   * 不是空物件 —— 空的順序會讓 `absorbOrder` 一個池子都不回傳,於是所有護盾
   * 靜默失效。
   */
  shieldRules: ShieldRules = DEFAULT_SHIELD_RULES;

  /**
   * 格擋規則 (see blockRules.ts) —— 目前只有「多個格擋來源怎麼疊」一格
   * (`config.block@1`)。和 `shieldRules` 同一條規矩:開賽前指派一次,之後不再動。
   * 預設是**出貨值** `independent`(owner 2026-07-31:「獨立判斷兩次,拿第一次
   * 檔掉剩餘繼續算下一次」),不是空物件 —— 一個 undefined 的 stacking 會讓
   * `blockCutFor` 兩條分支都不走,於是格擋整族靜默失效。
   */
  blockRules: BlockRules = DEFAULT_BLOCK_RULES;

  /**
   * 暴擊規則 (see critRules.ts) —— 多條暴擊來源怎麼合成 (`config.crit@1`,
   * GH#302)。和 `blockRules` 同一條規矩:開賽前指派一次,之後不再動。
   * 預設是**出貨值** `multiply` / 總倍率上限 100 / 最多 5 條(owner 2026-08-09:
   * 「每一條暴擊獨立算完傷害再帶入下一條」),不是空物件 —— 一個 undefined 的
   * `stackMode` 會讓 `rollCritStrike` 的分支全部落空,於是暴擊整族靜默失效
   * (暴擊數字照跳、傷害照舊)。
   */
  critRules: CritRules = DEFAULT_CRIT_RULES;

  /**
   * 敵方過濾器的全域覆寫 (see augmentEnemyFilter.ts) —— 目前只有「殭屍算不算
   * `victim: "enemyChampion"` 的敵人」一格 (`config.augment-filter@1`)。
   * 和 `blockRules` / `shieldRules` 同一條規矩:開賽前指派一次,之後不再動。
   *
   * 預設是**出貨值** `mobsCountAsEnemy: false`(＝這個欄位出現之前的字面語意),
   * 所以掛上它不改變任何一場比賽。⚠️ 客戶端的預測影子世界拿的也是這個預設,
   * 而預設等於伺服器的出貨值 —— 兩邊對得起來。
   */
  augmentEnemyFilter: AugmentEnemyFilter = DEFAULT_AUGMENT_ENEMY_FILTER;

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
   * 戰場任務「陣營所屬目標物」的規則（GH#752 mini dota）。null（預設）＝ 機制
   * 整個關著，而 `objectiveSystem` / `duelLoserFromObjectives` 都是嚴格 no-op
   * ⇒ 一場沒有武裝的比賽逐位元等於這條機制不存在。
   * 主機用 `beginCombatObjectives` / `endCombatObjectives` 武裝它
   * （見 systems/ObjectiveSystem.ts）；與 flowerRules 一樣是**主機武裝的世界狀態**。
   */
  objectiveRules: ObjectiveRules | null = null;

  /**
   * Dropped-coin rules (task #191). null (default) = the mechanic is OFF — unit
   * tests, the client's prediction shadow world, any match whose rules doc has
   * no `goldDrop` block — and EVERY coin code path opens by returning on it, so
   * a pre-feature world is byte-identical down to the digest. The match host
   * arms these via `beginCombatCoins` / `endCombatCoins` (see coins.ts).
   */
  coinRules: CoinRules | null = null;

  // ⛔ `nightPactRules` 在 2026-08-19 被刪掉了，而那不是整理：一個「武裝旗標」
  // 就是一種可以被忘記的故障（`MatchController.ts` 自己記錄過那一次 —— 半徑都
  // 建好了而旗標是 null，整支天生技在真的比賽裡什麼都沒做，測試全綠）。
  // 【死亡遺留】現在的開關**就是內容**：場上沒有人帶著 `deathWard` 授予，
  // `deathWardSystem` 的第一個迴圈就走完了。見 sim/deathWard.ts。

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
  /**
   * GH#324 —— 這張地圖的 gate 排程（可開關的幾何）。
   *
   * ⭐ 它**不上 wire**：狀態是 `(schedule, absoluteTick)` 的純函式，
   * 伺服器與客戶端各自用已經複寫的 tick 算出同一個答案 ⇒ 沒有 desync 通道。
   * `undefined` = 這張圖沒有機制（既有 6 張場地的行為）。
   */
  gateSchedule: GateSchedule | undefined = undefined;

  /* ═══════════════════════════════════════════════════════════════════════
   * RESERVED COMPONENT STORES (GH#289) — landed ALL AT ONCE, up front, so the
   * six primitive lanes never have to edit this class body concurrently.
   *
   * WHY ONLY THREE for five reserved effect kinds. The other two already have
   * a home and adding a store for them would have been the real mistake:
   *   • `knockback` writes the EXISTING `nav.override` — `DashOverride.kind`
   *     is literally `"dash" | "knockback"` (components.ts) and
   *     `combatResolveSystem` already drives that branch for hit-feel.
   *   • `evasion` rides the EXISTING `Stat.Evasion` on `stats` (statTypes.ts,
   *     a 0..1 stat with a 0.8 cap), i.e. a timed ModifierSource like any buff.
   *
   * All three below are EMPTY until their lane lands, and each folds into
   * `digest()` only WHEN PRESENT — so today's world hashes byte-identically to
   * a pre-#289 one, exactly like `airborne` / `championForm` before them.
   * `destroy()` clears all three: a recycled entityId must never inherit the
   * previous life's burn, summon link or immunity.
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * 持續傷害 (lane P1) — entity → its live DoT instances. The ONE reserved kind
   * that genuinely needs new storage: a DoT is the only one whose state
   * (payload + cadence + deadline) no existing component can express. Shape and
   * ownership live in sim/effects/dot.ts so P1 changes one file, not this one.
   *
   * ⚠️ ITERATION ORDER. Whoever writes the tick system must sort the instance
   * list on a TOTAL order before paying out (`origin`, then `sourceId`) — a
   * DoT that kills feeds the kill-credit path, so insertion order deciding who
   * lands the last hit is a desync, not a cosmetic detail.
   */
  readonly dot = new Map<EntityId, import("./effects/dot").DotInstance[]>();

  /**
   * 召喚物 (lane P2) — SUMMONED entity → its owner and despawn deadline. Keyed
   * by the summon, not the summoner, following the `auraCarrier` precedent:
   * the marker belongs on the body that has to be cleaned up.
   *
   * ⚠️ A summon is NOT a `mob`: the #215 wave scheduler counts `mob` entries
   * against its own cap and pays 20 gold per kill from that ledger. Putting
   * summons there would quietly rewrite the roguelike economy.
   */
  readonly summon = new Map<EntityId, import("./effects/summon").SummonComp>();

  /**
   * 隨機落點排程（13-04 龍星群「每 0.2 秒隨機地點落下一顆流星，共 10 顆」·
   * 70-04 千年練成「隨機招喚樹精」）。⚠️ 是**陣列不是 Map**：同一位施法者可以
   * 有兩波同時在天上，而 Map 會讓第二次施放把第一波無聲蓋掉。
   *
   * ⭐ 落點在**施法那一刻就抽完**（`randomAreaDrawBudget = 2 × count`），不是
   * 到期才抽。理由是計畫 §13 的決定性要求：draw 次數必須是**輸入的函式** ——
   * 邊落邊抽的話，一波被打斷（施法者死亡、回合結束）就會少抽幾次，
   * 之後所有隨機事件全部位移，同一顆種子的錄影對不上。
   *
   * 不折進 `digest()`：整波的結果（傷害、召喚物）在它們各自的來源已經被折過，
   * 而一個排程不同步的 replica 會在**該落的那一 tick 沒落**時當場分岔。
   * 走 `bossDamage` / `killTracking` 的同一個先例。
   */
  readonly randomArea: import("./effects/randomArea").RandomAreaWave[] = [];

  /**
   * ⭐ G12【延遲序列】的排程佇列（20-002「連續七次斬擊…最後再給予…」）。
   * 與 {@link randomArea} **同一個形狀、同一個理由**是陣列不是 Map（同一位施法者
   * 可以有兩串同時在飛），⛔ 但**語意相反**：這裡的目標在施放那一刻就凍住，
   * 到期不重解。整段論證在 `effects/delayed.ts` 檔頭①。
   */
  readonly delayed: import("./effects/delayed").DelayedWave[] = [];

  /**
   * ⭐ 連鎖閃電**還在飛**的那幾條（GH#451，owner 2026-08-20 的逐跳時間差）。
   * 與 {@link delayed} / {@link randomArea} **同一個形狀、同一個理由**是陣列不是
   * Map（同一位施法者可以有兩次施放同時在飛），⛔ 但目標的來源第三種都不一樣：
   * 這裡是「到期時從**上一個受害者**身上重新**隨機**抽一個」。
   * 整段論證在 `effects/chainLightning.ts` 檔頭①③。
   */
  readonly chainLightning: import("./effects/chainLightning").ChainLightningCast[] = [];

  /**
   * ⭐ S7【衝刺結束才揮出】的待付回呼（52-04「向前衝刺 400 距離後揮出」）。
   * ⚠️ 它**沒有到期 tick** —— 付款條件是「那一次衝刺的 `nav.override` 不見了」，
   * 而那個真相只存在於 `MovementSystem` 的 override 迴圈裡。所以它的系統排在
   * `movementSystem`（5）之後、`combatResolveSystem`（8）之前，⛔ 而不是改
   * `MovementSystem` 或加寬 `DashOverride`。見 `effects/dashOnEnd.ts` 檔頭②。
   */
  readonly dashOnEnd: import("./effects/dashOnEnd").DashOnEndPending[] = [];

  /**
   * 無敵 / 免疫 (lane P3, LANDED) — entity → the ABSOLUTE tick EACH IMMUNITY
   * AXIS lapses. A dedicated map on the `hitstop` / `knockdown` / `hitstun`
   * precedent, because `combatResolveSystem` asks this question of every queued
   * packet and an array scan per packet is the wrong shape. ABSENT = vulnerable.
   *
   * The value grew from a bare expiry tick to a four-axis record when P3 landed:
   * 無敵(all damage)、魔法免疫(magic only) and 免控(CC only) are THREE
   * different mechanics in the shipped content, and two of them can overlap on
   * one body with different deadlines. Shape + rationale live in
   * sim/effects/invulnerable.ts, so P3 owns one file, not this one.
   */
  readonly invulnerable = new Map<EntityId, import("./effects/invulnerable").ImmunityGrant>();

  /**
   * 隱形 (see stealth.ts) — entity → its fade clock. Present ONLY for bodies
   * carrying a `ModifierSource.vision.stealthFadeDelaySec` grant, which today is
   * exactly one champion (小次郎, 27-00 永久性的隱形術), so this map is empty in
   * every other match and the whole feature costs nothing there.
   *
   * Derived state: rebuilt from the attached sources by `stealthSystem` every
   * tick, so it cannot drift from the stat pipeline. `hiddenFromTick` is the
   * only mutable part and it is an ABSOLUTE tick.
   */
  readonly stealth = new Map<EntityId, import("./stealth").StealthState>();

  /**
   * 真視 (see stealth.ts) — entity → the radius inside which it perceives
   * hidden enemies. Same derivation as `stealth` above. Two champions carry it
   * today (夏娜 21-00 灼眼, 陰陽師/通靈者 16-00 通靈能力).
   */
  readonly trueSight = new Map<EntityId, import("./stealth").TrueSightState>();

  /**
   * 飛行 (無視碰撞) — entity → its RESOLVED flight grant this tick, read by
   * MovementSystem's three collision exemptions and by the snapshot's `h`
   * channel.
   *
   * TWO WRITERS, and they own disjoint halves of the key space:
   *   · `flightSystem` (sim/flight.ts) for anything with a `StatsComp` —
   *     DERIVED state, exactly like `stealth`/`trueSight`: reconciled from the
   *     attached `ModifierSource.flight` payloads every tick, so losing the
   *     source (dispel, 變身, round end, death) removes the flight on the next
   *     tick with no teardown path to forget.
   *   · `summonMobBoss` (#247) for the 殭屍王 — a ONE-SHOT grant written at
   *     spawn, because a mob carries no StatsComp and therefore has no
   *     `sources` array to derive from. `flightSystem` skips every id with a
   *     `MobComp`, so the two writers cannot fight over one entry.
   *
   * `destroy` clears the key either way. Empty in every match with no
   * 莉娜因巴斯 and no king, so it costs nothing and perturbs nothing.
   */
  readonly flight = new Map<EntityId, import("./flight").FlightGrant>();

  /**
   * 被暈眩 events waiting to become `onStunned` hooks, drained by
   * `systems/CcHookSystem.ts` (slot 8a).
   *
   * ⚠️ IT IS A DEDICATED QUEUE AND NOT `world.events`, AND THAT IS A REPAIR,
   * NOT A PREFERENCE. `step()` CLEARS `events` on its first line, so anything
   * emitted between two ticks — an effect run by the host, a scripted setup, a
   * future system that lands a stun outside the tick body — is gone before any
   * consumer sees it. `events` is a PRESENTATION log with exactly that
   * lifetime; using it as a control channel would have made 08-00 龍紋記憶 fire
   * "usually", which is the worst possible failure mode for a guard to have to
   * describe. Appended in effect order, drained in order, cleared on drain.
   */
  readonly pendingStunHooks: { victim: EntityId; source: EntityId }[] = [];

  /**
   * 反彈成功 → `onReflectSuccess`（owner 2026-08-05；2026-08-08 補 provenance）。
   * 與 `pendingStunHooks` 同一個形態與同一個理由（見 `systems/ReflectHookSystem.ts`
   * 檔頭）。
   *
   * ⭐ 三個欄位就是計畫 §2.1.1 要的 provenance，名字**照角色取**而不是照位置取
   *（舊名 `victim` 在反彈的語境裡讀起來像「被反彈的人」，實際上是攻擊者）：
   *   · `reflector` = **防禦者**，反彈的那一方，也是 hook 的持有者
   *   · `attacker`  = **攻擊者**，被反彈打到的那一方，也是 hook 的 `target`
   *   · `incoming`  = **反彈傷害**，那一發反彈封包自己的 `TriggerDamage`
   *
   * ⚠️ `incoming` 三個讀數（raw / mitigated / hpLost）都是**真的**，因為這一筆是
   * 在反彈封包**落地的那一格**被 push 的（`combat/damage.ts`），不是在它被排進
   * 佇列的時候。排隊時 mitigated / hpLost 還不存在 —— 在那裡 push 就只能編一個
   * 數字出來，而「7 倍反彈傷害」乘的正是它。
   */
  readonly pendingReflectHooks: {
    reflector: EntityId;
    attacker: EntityId;
    incoming: TriggerDamage;
  }[] = [];

  /**
   * 嘲弄 (see taunt.ts) —— 受害者 → 「誰嘲弄我 + 到哪一絕對 tick 為止」。
   *
   * 自己一張 Map 而**不是** `StatusEffect` 上的一個旗標，理由是量出來的：
   * `StatusComp` 只掛在英雄與召喚物身上，**小怪一個都沒有**，而 `applyStatus`
   * 對沒有 StatusComp 的目標是靜默 `continue`。status 版本的嘲弄會對整波殭屍
   * 完全無效，而卡片上寫著「吸引周圍敵人」—— 失敗形態 ②。
   *
   * 走 `invulnerable` 的形狀：**沒有 system**，到期是讀取時的絕對 tick 比較，
   * 所以一筆過期紀錄是惰性垃圾而不是活著的效果。沒有嘲弄的比賽這張表是空的，
   * 整個機制不花任何成本。
   *
   * 不進 `digest()`，走 `recentDamagers` / `killCombo` 的前例：它自己不改變任何
   * 世界狀態，唯一的可觀測效果是「誰打誰」，而那立刻表現在已經被 digest 的
   * 血量與座標上 —— 一個算錯嘲弄的 replica 在下一 tick 就會在傷害上分家。
   */
  readonly taunt = new Map<EntityId, import("./taunt").TauntState>();

  // ═══════════════════════════════════════════════════════════════════════
  // [EX∅ 根源] 三張表（2026-08-18）—— 由詞彙包一次宣告，lane 只填內容。
  //
  // ⚠️ 三張在**這一版全部是空的**（三支模組的謂詞一律回 false，見它們的
  // ZERO GUARANTEE 檔頭），所以既有 replay 與 digest 逐位元不變。它們現在就
  // 註冊在這裡、而且現在就進 `destroy()`，走的是上面每一張表都遵守的同一條
  // 防禦契約：**一個被回收的 entityId 絕不可以繼承上一條命的狀態**，而
  // 「這張表今天永遠是空的」正是那個在 lane 合併的那一刻停止成立的假設。
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 同型連擊 —— `受害者 → 他現在連續挨的型別與發數`（史萊姆裝）。
   * 形狀與推導在 `combat/typeStreakImmunity.ts`。
   */
  readonly damageStreak = new Map<
    EntityId,
    import("./combat/typeStreakImmunity").DamageStreakState
  >();

  /**
   * 陣營轉換 —— `被借走的那具身體 → 這次捕獲的狀態`（大師球）。
   * 形狀與三個非顯而易見的點在 `mindControl.ts`。
   */
  readonly mindControl = new Map<EntityId, import("./mindControl").MindControlState>();

  /**
   * 這一回合**已經被捕過**的受害者（`oncePerRoundPerVictim` 的記帳）。
   *
   * ⚠️ 它由 `MatchController.enterCombat()` 清空，⛔ 不是 `enterIntermission()`
   * —— 理由與同一段的 `resetMarksForRound` 逐字相同：intermission 可以被
   * `skipPhase` 跳過，而一個「有時候會被清、有時候不會」的計數器比沒有更糟。
   */
  readonly capturedThisRound = new Set<EntityId>();

  /**
   * 背負 —— `乘客 → 他的載具與四根不可選取軸`（禰豆子的木箱）。
   * 形狀在 `carry.ts`。
   */
  readonly carried = new Map<EntityId, import("./carry").CarriedState>();

  /**
   * 嘲弄暫時搶走的**玩家手選目標** —— `受害者 → 他原本點名的那個人`。
   *
   * 只有 `tauntRules.overridesManualOrder` 開著時才會有東西寫進來，而
   * `tauntRules.restoreManualOrderOnLapse`（出貨 true）決定嘲弄退掉之後要不要
   * 把它放回去。
   *
   * ⚠️ 它存在是因為舊實作把「接管」與「歸還」偷渡在**同一個布林值**上：手選
   * 目標被清成 null 之後，OrderSystem 通用那條路會用 `attackTargetAuto = true`
   * 重新填上，也就是一次右鍵點名被**永久**轉成自動目標，嘲弄退了也回不來。
   * 記在這裡而不是 `Navigation` 上，是為了讓「沒有人被嘲弄的比賽」這張表完全
   * 是空的（和 `taunt` 同一個形態），而且不必動一個被三十幾支測試手寫的元件。
   */
  readonly suspendedOrder = new Map<EntityId, EntityId>();

  /**
   * 嘲弄規則 (`config.taunt@1`, see taunt.ts) —— 總開關、要不要蓋掉玩家手選的
   * 目標、小怪吃不吃、衝突怎麼解、全域持續時間倍率。和 `stealthRules` 完全同
   * 一條規矩:開賽前指派一次,之後不再動。
   * 預設是**出貨表**,不是空物件 —— 空表會讓 `enabled` 讀成 undefined(falsy),
   * 也就是嘲弄靜默消失,而道具照樣買得到、描述照樣寫著。
   */
  tauntRules: TauntRules = DEFAULT_TAUNT_RULES;
  /**
   * 淨化規則 (`config.dispel@1`, A4b/#278) —— 【淨化】拔哪幾池、拔幾層、
   * 沒標 `dispellable` 的東西算不算可拔。見 `sim/dispelRules.ts`。
   */
  dispelRules: DispelRules = DEFAULT_DISPEL_RULES;
  /**
   * 冷卻規則 (`config.cooldown-rules@1`) —— 冷卻縮到最短能有多短。
   * owner 2026-08-10：cdr 天花板 0.99，但秒數卡 0.1。見 `sim/cooldownRules.ts`。
   */
  cooldownRules: CooldownRules = DEFAULT_COOLDOWN_RULES;
  /**
   * 聖杯顯現規則 (`config.arena-rules@1` 的 `grailDraft`) —— 靈基適性條件開不開、
   * 三張要不要湊不同的顯現位置、連動加權多少、舊的 31 張純屬性增益進不進卡池。
   *
   * ⚠️ 讀它的**只有開牌那一刻**（`economy/draft.ts::offerAugments`），
   * ⛔ 不是每 tick —— 它決定「哪幾張卡出現在你面前」，不是任何執行期效果。
   */
  grailDraft: GrailDraftRules = DEFAULT_GRAIL_DRAFT;

  /**
   * 吟唱規則（倍率 / 下限 / 上限）。owner 2026-08-13 的三句話，見 `sim/castTimeRules.ts`。
   *
   * ⚠️ 它在**施法的當下**才套用，⛔ 不是在內容產生時烘進 `castTimeSec` ——
   * 烘進去的話後台調了要重跑 `content:build` + 重新部署，而這一格的重點正是
   * 「存檔就生效」（第一守則）。
   */
  castTimeRules: CastTimeRules = DEFAULT_CAST_TIME_RULES;
  /** 【重創】多筆同時在身上時怎麼疊（A6，#278）。 */
  woundRules: WoundRules = DEFAULT_WOUND_RULES;
  /**
   * 【虛弱】的全域定義（GH#301-4）—— 哪個 tag 算虛弱、攻速倍率、造成傷害倍率。
   * 和 `woundRules` / `dispelRules` 完全同一條規矩：開賽前指派一次，之後不再動。
   * 預設是**出貨表**，不是空物件 —— 空表會讓兩個倍率讀成 undefined，
   * 也就是虛弱靜默消失，而技能照樣放得出來、狀態照樣掛得上。
   */
  weaknessRules: WeaknessRules = DEFAULT_WEAKNESS_RULES;
  /** 傷害規則 —— 今天只有「沒寫 `damageType` 時用哪一種」。 */
  damageRules: DamageRules = DEFAULT_DAMAGE_RULES;
  /**
   * AP 傷害加成 (`config.ap-damage-scaling@1`, owner 2026-08-21：
   * 「技能傷害都套用公式 (1+AP*1%)⋯=> 預設 0.5%」)。
   * 同 `damageRules` 的規矩：開賽前指派一次，之後不再動。預設是**出貨表**，
   * ⛔ 不是空物件 —— 空表會讓 `rate` 讀成 undefined，於是 `1 + ap * undefined`
   * 產出 **NaN**，而 NaN 傷害在畫面上等於「這一發沒扣血」，⛔ 一行都不會報錯。
   */
  apDamageScaling: ApDamageScaling = DEFAULT_AP_DAMAGE_SCALING;
  /**
   * 減傷曲線 (`config.mitigation@1`) —— 今天只有「負抗性最多放大到幾倍」。
   * 同 `damageRules` 的規矩：開賽前指派一次，之後不再動。預設是**出貨表**
   * （2.0 = LoL），⛔ 不是空物件 —— 空表會讓 `mitigationMult` 產出 NaN，
   * 而 NaN 傷害在畫面上等於「這一發沒扣血」。見 `combat/penetration.ts`。
   */
  mitigationRules: MitigationRules = DEFAULT_MITIGATION_RULES;

  /**
   * 隱形規則 (`config.stealth@1`, see stealth.ts) —— 隱形擋不擋自動索敵／手動
   * 點選／技能 AoE，破隱條件，以及兩個渲染不透明度。和 `combatEnv` / `baseBonus`
   * / `statCaps` / `combatFeel` / `shieldRules` 同一條規矩:開賽前指派一次,
   * 之後不再動,sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**(= WC3 原作行為),不是空物件 —— 空表會讓「擋不擋」全部讀成
   * false,也就是隱形只剩畫面、完全不影響索敵,而畫面上看起來一切正常。
   */
  stealthRules: StealthRules = DEFAULT_STEALTH_RULES;
  /**
   * ⭐ GH#606 —— **視野規則**（owner 2026-08-23：「理論上這個地圖是**全視野**，
   * 就算牆後也看得到」）。和 `stealthRules` 完全同一個形狀:一份出貨預設住在
   * `sim/`,實際值由 host 在開場從 `config.arena-rules@1` 灌進來。
   *
   * ⚠️ ⛔ **它與隱形是兩件事**:`canSee`（`sim/stealth.ts`）與這一族**零交集** ——
   * 「全視野」打開的是**牆**,⛔ 不是隱形。守衛 `fullVision.test.ts` 兩個方向一起讀。
   */
  visionRules: VisionRules = DEFAULT_VISION_RULES;

  /**
   * ⛔⛔ **已下架的英雄 id** —— owner 2026-08-22:「變身帶來許多問題，
   * 因此我想要**開啟變身態盡可能下架**項目群組」。
   *
   * ── 為什麼這一格必須存在（2026-08-23 稽核抓到的）────────────────────────
   * `content/config/roster.json` 的 `retiredChampions` 有 5 個**變身態**，
   * 而它的消費端**只有選人那一半**（`Whitelist.allowsChampion` ＋ 四個選人面板）。
   * ⭐ 而變身態本來就 `role:"alternate"` **不可被選** ⇒ 對它們而言下架是 **no-op**。
   *
   * ⛔ **入口從來沒有被關過**：{@link destinationFor} 只問 `transform.counterpartId`
   * ＋ `Champions.tryGet`。實測**仍有 4 支技能變得進去**（92-01 臥草泥馬 →
   * `godie-h02u`、04-002 惡夢魔王的碎片 → `godie-h020`、08-002 龍魔人 →
   * `godie-n01c`、38-00 邪眼全開 → `godie-u010`）。
   * ⚠️ `roster.json` 的 `note` **自己承認了**：「⏸ 入口那一半還沒接線⋯
   * ⛔ championForm 入口仍然開著。接線點只有一處、一行」。
   *
   * ── 形狀與 {@link visionRules} 逐字相同 ─────────────────────────────────
   * 一份**空的**預設住在 `sim/`（⇒ 這個檔對 `content/registries` 零依賴），
   * 實際值由 host 在開場從 `config.roster@1` 灌進來。
   * ⚠️ **缺文件 = 空集合 = 沒有人下架**，方向與 `retiredChampionIdsFromDoc`
   * 一致：讀不到時 fail-open 的代價是「一隻該退場的變身態還變得出來」（可回復），
   * fail-closed 的代價是「全部變身一起消失」——那是高一個量級的事故。
   */
  retiredChampionIds: ReadonlySet<string> = EMPTY_RETIRED;

  /**
   * 暴走規則 (`config.berserk@1`, see abilities/berserkRules.ts) —— 主動暴走的
   * 生命門檻(≤15%)與暴走期間的技能冷卻倍率(×2)。和 `stealthRules` 完全同
   * 一條規矩:開賽前指派一次,之後不再動。
   * 預設是**出貨表**(owner 2026-08-03 定稿),不是空物件 —— 空表會讓
   * `castHpPct` 讀成 undefined,於是「快死才放得出來」的閘靜默消失,而按鈕
   * 在畫面上看起來一切正常。
   */
  berserkRules: BerserkRules = DEFAULT_BERSERK_RULES;

  constructor(arena: ArenaDef, seed: number) {
    this.arena = arena;
    this.gateSchedule = gateScheduleOf(arena);
    this.rng = new Rng(seed);
  }

  /**
   * Swap the active arena between rounds (task #145). Host-driven and
   * deterministic (the caller picks it from the seed + round); never called
   * mid-step, so collision geometry is stable for the whole tick.
   */
  setArena(arena: ArenaDef): void {
    this.arena = arena;
    // ⭐ GH#397 —— 排程跟著場地一起換。⛔ 少了這一行，`gateSchedule` 的寫入端
    //    是**零個**（宣告成 `undefined` 之後全 repo 沒有人指派它），於是
    //    `activeObstacles` 一律走「沒有排程 ⇒ 原樣回傳」那條路 ⇒ 門永遠關著。
    this.gateSchedule = gateScheduleOf(arena);
  }

  spawn(): EntityId {
    return asEntityId(this.nextId++);
  }

  /**
   * 這一 tick 要銷毀、但**要等 hook 派發完**的實體 —— GH#296。
   *
   * 空的時候 {@link drainPendingDestroy} 是嚴格 no-op，所以任何沒有小怪的世界
   * （客戶端預測影子世界、骨架、既有測試）逐位元不變。
   */
  private readonly pendingDestroy: EntityId[] = [];

  /**
   * 「這具屍體要銷毀，但**不是現在**」—— 排到本 tick 的 hook 派發之後（slot 9g）。
   *
   * ── 為什麼需要它（量出來的，不是推論）──────────────────────────────────
   * `deathSystem`（slot 9）發 `death` 事件，`worldHookSystem`（9f）才把它派發成
   * `onDeath`。中間的 `mobSystem`（9d′）原本就地 `destroy()` 掉屍體，而
   * `destroy()` 會 `this.stats.delete(id)` —— 於是 9f 跑到時 `fireHooks` 在
   * **第一行**（`const sc = world.stats.get(owner); if (!sc) return;`）就回頭了。
   * ⚠️ 那**不是** GH#293 的存活閘，所以 `firesWhenOwnerDead` 對它完全無效。
   *
   * 2026-08-09 實測（跑真的 `step()`，不是讀程式碼推論）：同一張卡、同一隻小怪，
   * 走 `step()` → 效果**沒有**執行；把派發挪到銷毀之前 → 執行。
   *
   * ── 為什麼是「延後銷毀」而不是另外兩種修法 ────────────────────────────
   * ⛔ **對調 slot 順序**（把 9f 往前搬）：`mobBossSpawn` 是 `mobSystem` 自己在
   *    9d′ 發的（`mobs.ts::summonMobBoss`），`guardianSlain` 在 9d —— 往前搬等於
   *    用【殭屍王出現】【守衛塔倒下】換【死亡時】，換一個壞的回來。
   * ⛔ **銷毀前就地派發**：那會變成第二個「死亡要廣播成什麼」的決定點，而那張表
   *    只有一份（`WorldHookSystem.ts` 的 `WORLD_HOOKS`）。第〇·五守則點名的形狀。
   * ✅ **延後銷毀**，而且**不跨 tick**：屍體只多活 9d′→9g 這一段，期間跑的是
   *    `summonSystem`（讀 `world.summon`）、`coinSystem`（讀 `world.coin` 與活著的
   *    英雄）、`worldHookSystem`（收件人濾掉死人）—— 三支都不看 `world.mob`。
   *    快照在 `step()` 之後才抽，所以渲染、碰撞、`mobsAliveInZone` 的波次上限
   *    看到的東西一個位元都沒變。⚠️ 「多留一個 tick」那個版本會動到這些，
   *    這一版刻意不。
   *
   * 重複排隊或已經被別人銷毀都無害：`destroy()` 的每一格都是 idempotent 的 delete。
   */
  destroyAfterHooks(id: EntityId): void {
    this.pendingDestroy.push(id);
  }

  /**
   * slot 9g —— 把 {@link destroyAfterHooks} 排隊的屍體真的清掉。
   *
   * 順序 = push 順序 = `mobSystem` 走 `world.events` 的順序，而那個陣列由固定的
   * 系統順序追加，所以每個複本清的順序相同（`destroy` 本身也與順序無關）。
   */
  private drainPendingDestroy(): void {
    if (this.pendingDestroy.length === 0) return;
    for (const id of this.pendingDestroy) this.destroy(id);
    this.pendingDestroy.length = 0;
  }

  destroy(id: EntityId): void {
    // #288 — CAPTURED BEFORE `this.champion.delete(id)` fifteen lines down. The
    // `bossDamage` sweep at the bottom needs to know whether this entity could
    // ever have appeared as a DAMAGER, and by the time it runs the component is
    // already gone (which would make the check silently always-false).
    const wasChampion = this.champion.has(id);
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
    // GH#308 — 具名標記（層數）。TWO costs, and neither is a visible defect today,
    // which is exactly why it survived: `world.marks` is keyed by holder and
    // nothing else ever removed a key, so a match grew one bag per zombie for
    // nine rounds and never gave one back. And `resetMarksForRound` walks
    // `world.marks.keys()` — every round boundary re-ticked every corpse's
    // counter and emitted `markChanged` for an entity that no longer exists.
    this.marks.delete(id);
    // GH#308 — 浮空 y. Its contract is "created at takeoff, DELETED at
    // landing/cancel", so anything that dies MID-LEAP leaks one. A recycled
    // entityId inheriting it spawns hovering, and the digest folds `airborne`
    // in whenever it is PRESENT — so the stale entry is a desync source too.
    this.airborne.delete(id);
    // ⭐ GH#897 —— 逐實體，所以 destroy 要清（`destroyClearsEntityStores` 在守）。
    this.seatDisadvantage.delete(id);
    // task #215: a recycled entityId must never inherit a stale mob marker or
    // kill counter (mobKills is keyed by CHAMPION id, but registering it here is
    // the same defensive contract every other per-entity store follows).
    this.mob.delete(id);
    this.mobKills.delete(id);
    // #262: the mob's damage ledger dies with the mob. Two entries to clear —
    // this id AS a ledgered mob (the outer key) and this id as a DAMAGER of some
    // other one (an inner key), because a recycled entityId that inherited a
    // stale contribution would be paid for damage it never did.
    this.bossDamage.delete(id);
    // #288 — THE INNER SWEEP IS CHAMPION-ONLY, and that gate is a real fix, not
    // a micro-optimisation. `recordDamage` writes an inner key ONLY when
    // `world.champion.has(source)`, so a mob, a projectile or a flower can never
    // be one; without this test every mob death walked EVERY live ledger. Once
    // #288 gave 特殊殭屍 their own ledgers that is the one cost in this file that
    // grows with the ledger count — round 9 can hold dozens of them while ~100
    // mob corpses are destroyed per tick, and the sweep is exactly the O(n²)
    // term. Champions die a handful of times a round, so the remaining work is
    // bounded by the thing it is actually proportional to.
    if (wasChampion) for (const ledger of this.bossDamage.values()) ledger.delete(id);
    this.hitstop.delete(id);
    this.knockdown.delete(id);
    this.hitstun.delete(id);
    // task #264: 回收的 entityId 不得繼承上一個單位的瞄準方向。
    this.facingLock.delete(id);
    this.aimTick.delete(id);
    // GH#216: 回收的 entityId 不得繼承上一個單位「卡住多久了 / 正在接敵」的狀態,
    // 否則新單位一生出來就會被判定成卡了一秒、直接把走位權交給追擊。
    this.walkStall.delete(id);
    this.autoEngaging.delete(id);
    // GH#637: 回收的 entityId 不得繼承上一個單位的「點地板冷卻」——否則新單位
    // 一生出來就帶著別人點的那 1 秒不索敵。
    this.moveOrderNoAggroUntil.delete(id);
    this.lastMoveOrderTick.delete(id);
    this.lastCommandTick.delete(id);
    // task #249: nor a stale 變身 form — a recycled id that inherited one would
    // be dragged back to a PREVIOUS unit's base champion on the next tick.
    this.championForm.delete(id);
    // …nor a stale AURA CARRIER marker. Two directions matter here: destroying
    // the CARRIER must drop its own entry (this line), and destroying a HOST
    // must not leave a carrier following a corpse — the latter is handled by
    // `auraCarrierSystem`'s reconcile, which sees the host's transform vanish
    // and tears the carrier down on the next tick (sim/auraCarrier.ts).
    this.auraCarrier.delete(id);
    // …nor a stale 死亡遺留 marker. A recycled entityId that inherited one would
    // keep radiating its aura from a body that is now a champion or a projectile.
    this.deathWard.delete(id);
    this.matchStats.delete(id);
    this.recentDamagers.delete(id);
    this.killTracking.delete(id);
    // 連殺 combo: a recycled entityId must never inherit a stale chain — the
    // same defensive contract every other per-entity store here follows.
    this.killCombo.delete(id);
    this.bountyPaid.delete(id);
    // GH#289 reserved stores. Registered here BEFORE their lanes land, on the
    // same defensive contract every store above follows: a recycled entityId
    // must never inherit the previous life's burn, summon link or immunity —
    // and "the map is always empty today" is exactly the assumption that stops
    // being true the moment P1/P2/P3 merge, at which point nobody would think
    // to come back and add three deletes here.
    this.dot.delete(id);
    this.summon.delete(id);
    this.invulnerable.delete(id);
    // 隱形/真視: same defensive contract. A recycled entityId that inherited a
    // stealth clock would spawn ALREADY INVISIBLE (the deadline is in the past),
    // and one that inherited a true-sight radius would see through everyone.
    // `stealthSystem` would repair both on the next tick, but "repaired one tick
    // later" is a tick in which targeting read the wrong answer.
    this.stealth.delete(id);
    this.trueSight.delete(id);
    this.flight.delete(id);
    // 嘲弄: TWO directions, and the second one is the one that bites. Dropping
    // the victim's own row is the ordinary contract every store above follows.
    // But `world.taunt` is also indexed BY THE TAUNTER, so a dead taunter whose
    // entityId is recycled into a new hostile body would silently keep dragging
    // its old victims onto that new body — and every legality check in
    // `forcedTargetOf` would PASS (alive, same zone, enemy team). See
    // sim/taunt.ts::forgetTauntsBy.
    this.taunt.delete(id);
    forgetTauntsBy(this, id);
    // [EX∅ 根源] 的三張表：同一條防禦契約。一個繼承了連擊紀錄的新身體會**開場
    // 就免疫**、一個繼承了 `carried` 的會**生下來就點不到**、一個繼承了
    // `mindControl` 的會**替錯的隊伍活著**——三個都不會報錯，而且三個都會在
    // 那一 tick 被別的系統讀到。
    // ⚠️ `capturedThisRound` 一開始被寫成「由 `enterCombat()` 整份清掉就好」，
    // 而 `destroyClearsEntityStores` 當場指名了它 —— 那條守衛是對的：這張表的鍵
    // **就是 EntityId**，所以一個被回收的 id 會讓一隻**全新的**殭屍生下來就帶著
    // 「這回合已經被收服過」的標記，於是大師球對它靜靜地失效。回合整份清是
    // **另一件事**（跨回合），⛔ 不是這一件（同一回合內的 id 回收）。
    this.damageStreak.delete(id);
    this.mindControl.delete(id);
    this.carried.delete(id);
    this.capturedThisRound.delete(id);
    // …and the manual order the taunt suspended, in BOTH directions for exactly
    // the same reason: the map is keyed by the VICTIM and VALUED by the target
    // he clicked, so a recycled id would "restore" him onto a body he never
    // picked. See sim/taunt.ts::forgetSuspendedOrdersOn.
    this.suspendedOrder.delete(id);
    forgetSuspendedOrdersOn(this, id);
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
      // Aura carriers are a POSITION, not a body: keeping them out of the
      // broad-phase is what makes them structurally untargetable (every
      // ability / projectile / auto-acquire / mob-AI query walks this grid) and
      // non-colliding, exactly like a revive circle. It costs the aura nothing:
      // `auraSystem` queries the grid for an emitter's NEIGHBOURS and reads the
      // emitter's own position straight off `world.transform`.
      if (this.auraCarrier.has(id)) continue;
      // 死亡遺留物 are MARKERS, not bodies: out of the broad-phase means nothing
      // can target, hit or collide with one, exactly like a revive circle. The
      // aura costs nothing for it — deathWardSystem reads their positions
      // straight off `world.transform` and never queries the grid.
      if (this.deathWard.has(id)) continue;
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
    auraCarrierSystem(this); //  0a′. 虛擬蝗蟲群: create / destroy / re-seat the
    //                             dummy aura carriers a SECOND FORM needs
    //                             (sim/auraCarrier.ts).
    //
    //                             AFTER championFormSystem (0a) so it sees the
    //                             final form state of this tick — a body that
    //                             just reverted on death or expiry must not get
    //                             a carrier for one tick — and BEFORE
    //                             auraSystem (0b) so the carrier is already
    //                             sitting on its host when membership is
    //                             computed. Both neighbours are load-bearing:
    //                             flip either and the aura is one tick stale
    //                             against the very state that owns it.
    auraSystem(this); //          0b. reconcile aura membership against the grid
    //                             just rebuilt above, BEFORE the recompute below
    //                             folds it in — so an aura entered this tick
    //                             affects this tick's movement/attacks/casts and
    //                             no second recompute is needed (aura/aura.ts).
    statusGatedPassiveSystem(this); // 0c. ⭐ M2 —— 狀態閘住的被動 rank
    //                             (`whileStatus`) 掛/卸。
    //
    //                             SLOT IS LOAD-BEARING IN BOTH DIRECTIONS.
    //                             AFTER 0a (championFormSystem) so一次翻面只算
    //                             一遍：形態閘與狀態閘在同一顆 `rankBlock` 裡，
    //                             排在前面就會用上一 tick 的身體去問這一 tick 的
    //                             答案。BEFORE 1 (statRecomputeSystem) 是同一個
    //                             理由 aura 排在它前面 —— 這一 tick 掛上的來源
    //                             就在**這一 tick** 被摺進屬性表,⛔ 不用第二次
    //                             recompute,也不會慢一格。
    //                             它自己會在沒有任何文件用狀態閘時退化成一次
    //                             WeakMap 查表(見 sim/statusGatedPassives.ts)。
    statRecomputeSystem(this); // 1. recompute dirty stats
    buffExpirySystem(this); //    1b. expire timed buff sources
    attrGrantExpirySystem(this); // 1b′. reverse TIMED 三圍 grants whose absolute
    //                             tick arrived (08-00 龍紋記憶's 3-second ×2).
    //                             Beside buffExpiry deliberately: same job, the
    //                             neighbouring accumulator, one idea of "now".
    flightSystem(this); //        1d. 飛行 (sim/flight.ts): re-derive who ignores
    //                             collision, from the grants attached above and
    //                             BEFORE movementSystem (5), its only consumer.
    stealthSystem(this); //       1c. 隱形/真視 (sim/stealth.ts): re-derive the
    //                             grant maps from the sources that exist RIGHT
    //                             NOW and advance the fade clocks.
    //
    //                             SLOT IS LOAD-BEARING IN BOTH DIRECTIONS.
    //                             AFTER 1/1b so a grant that arrived (or a buff
    //                             that expired) this tick is already reflected —
    //                             otherwise the first tick of a true-sight buff
    //                             sees nothing. BEFORE 3/4 (command/order),
    //                             MobSystem's aggro scan and BasicAttackSystem,
    //                             i.e. before EVERY consumer of
    //                             `targeting.canSee`, so all of them read one
    //                             answer computed once this tick instead of
    //                             three answers computed at three different
    //                             points of the frame.
    statusExpirySystem(this); // 2. expire statuses (slows/roots/stuns)
    mindControlExpirySystem(this); // 2′. ⭐ [陣營轉換]（[EX∅ 根源]）—— 把到期的
    //                             借調身體還回原隊。⛔ 不能學嘲弄做成「讀取時
    //                             才判定過期」：這條機制改的是真的 `TeamComp`，
    //                             一筆過期的紀錄不是惰性垃圾，是一隻還在替你打
    //                             的殭屍王。放在這裡（一切索敵之前）是為了讓
    //                             歸位在同一 tick 內就被每一個消費者看到。
    //                             `world.mindControl` 空表時是 early return。
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
    carrySystem(this); //    5a. ⭐ [背負]（[EX∅ 根源]）—— 乘客的座標從載具重建。
    //                             ⚠️ **必須在 movementSystem(5) 之後**：排在前面
    //                             的話乘客拿到的是載具**上一 tick** 的位置，畫面上
    //                             是一個慢半格的抖動。空殼期間 `world.carried` 永遠
    //                             是空的，這一行是零成本的 early return。
    dashOnEndSystem(this); // 5′. ⭐ S7 衝刺結束才揮出（52-04）。
    //                             ⚠️ 位置是硬約束，兩個方向都是：
    //                             · 必須在 movementSystem(5) **之後** —— 「衝刺
    //                               結束了」這個真相只在它的 override 迴圈裡發生，
    //                               排在前面永遠看到 override 還在（一刀不會揮）。
    //                             · 必須在 combatResolveSystem(8) **之前** ——
    //                               揮出來的傷害要在**同一 tick** 被減傷、記分、
    //                               結算，否則整招晚一個 tick 而畫面上看不出來。
    //                             佇列空的時候是 STRICT no-op（effects/dashOnEnd.ts）。
    basicAttackSystem(this); // 6. autos on attack targets in range
    toggleUpkeepSystem(this); // 6a. 【切換】維持成本 + MP 不足自動關閉
    //                             (`abilities/toggle.ts`). 20-01 風王結界
    //                             「開啟時每次攻擊消耗 MP，不足則自動關閉」。
    //
    //                             ⚠️ 位置是硬約束，兩個方向都是：
    //                             · 必須在 basicAttackSystem(6) **之後** —— 它讀
    //                               `this.events` 裡這一 tick 的 `basicAttack`，
    //                               往前搬一格 `perAttack` 就永遠收不到任何一刀，
    //                               而那看起來跟「沒有人開這個技能」一模一樣。
    //                             · 必須在 combatResolveSystem(8) **之前** ——
    //                               自動關閉會跑 onExit（風王鐵槌），那一發傷害
    //                               要在**同一 tick** 被排乾、減傷、計分。
    //
    //                             `AbilitiesComp.toggles` 空的時候是嚴格 no-op，
    //                             所以每一份既有錄影逐位元不變。
    projectileSystem(this); // 7. advance projectiles, swept hits
    hitstopDecaySystem(this); //  7b. age hitstop/knockdown AFTER their gates ran
    //                             (movement/attack), BEFORE this tick's hits set
    //                             fresh values -> a hit on tick T freezes exactly
    //                             T+1..T+N (see SimWorld.hitstop docs).
    dotTickSystem(this); //  7c. 持續傷害 (GH#289 lane P1): queue every DoT payout
    //                             that is DUE on this absolute tick, and retire
    //                             the lapsed / settled-zone ones.
    //
    //                             IMMEDIATELY BEFORE combatResolveSystem, so a
    //                             payout due this tick is mitigated by armor/MR,
    //                             absorbed by shields, scored by recordDamage and
    //                             — when it kills — resolved by deathSystem (9) on
    //                             the SAME tick it came due. Queued after the
    //                             drain it would land one tick late, every tick,
    //                             for the whole burn. See effects/dotTick.ts.
    intervalHookSystem(this); // 7d. 週期觸發 (`onInterval` hooks): 43-00 觀音大士
    //                             每 10 秒的護盾、03-00 相轉移裝甲的常駐魔免、
    //                             52-00 十二道試煉每秒的生命流失。
    //
    //                             AFTER dotTick and IMMEDIATELY BEFORE the drain,
    //                             for the same reason dotTick sits there: a shield
    //                             raised here still catches THIS tick's damage, a
    //                             drain queued here is mitigated/scored/resolved on
    //                             THIS tick, and an immunity refreshed here is
    //                             already written when `refusesDamage` is asked.
    //                             Gated on `combatActive`, so every pre-existing
    //                             replay hashes byte-identically (see that file).
    delayedSystem(this); //   7e′. ⭐ G12 延遲序列：付掉這一 tick 到期的那幾發。
    //                             位置與 `randomArea` **同一個硬約束**（見下一段）：
    //                             排在 drain 之前，第七刀才會在**這一 tick** 被
    //                             減傷、記分、結算。差別只在目標從哪裡來 ——
    //                             這裡是施放時凍住的名單（effects/delayed.ts①）。
    chainLightningSystem(this); // 7e″. ⭐ 連鎖閃電的逐跳時間差（owner 2026-08-20）：
    //                             付掉這一 tick 到期的那幾發閃電。位置與上下兩支是
    //                             **同一個硬約束**（排在排空之前）。差別只在目標從
    //                             哪裡來 —— 這裡是「從上一個受害者身上隨機再抽一個」
    //                             （effects/chainLightning.ts 檔頭①③）。
    randomAreaSystem(this); // 7e. 隨機落點排程：付掉這一 tick 到期的落點。
    //                             ⚠️ 位置是硬約束，理由與 `dotTick` 逐字相同：
    //                             排在排空之前，一顆這一 tick 該落的流星才會在
    //                             **這一 tick** 被減傷、計分、結算。搬到 8 之後
    //                             整波每一發都晚一個 tick，而畫面上看不出來。
    combatResolveSystem(this); // 8. drain damage queue (mitigation/shields/hooks
    //                             + combat-juice: hitstop/knockback/knockdown)
    ccHookSystem(this); //   8a. 被暈眩時 → `onStunned` hooks (08-00 龍紋記憶).
    reflectHookSystem(this); // 8b. 反彈成功時 → `onReflectSuccess` hooks (owner 08-05).
    //                             AFTER the queue drain so a stun applied by an
    //                             on-damage hook is seen THIS tick, BEFORE
    //                             deathSystem so a champion killed on the same
    //                             tick he was stunned does not "awaken" dead.
    fireRingSystem(this); //  8b. round-pacing fire ring: escalating %-HP true burn
    //                             (no-op unless armed + combatActive); runs BEFORE
    //                             deathSystem so its kills resolve THIS tick (#132)
    deathSystem(this); // 9. deaths, kill credit, xp/gold
    flowerSystem(this); //   9b. flower burst on death + spawn cadence (no-op unless armed)
    reviveSystem(this); //   9c. revive circles: drop on death, channel, revive/expire
    //                             (no-op unless armed; consumes this tick's deaths)
    deathWardSystem(this); // 9c′.【死亡遺留】raise a ward on this tick's champion
    //                             deaths for every carrier of a `deathWard`
    //                             grant, then reconcile who stands inside one
    //                             (no-op when nobody carries the grant — the
    //                             switch IS the content, there is no arm flag).
    //                             Same slot rationale as the
    //                             reviveSystem above it: the ward is raised by a
    //                             DEATH, so it has to read this tick's `death`
    //                             events. The aura it attaches is folded in by
    //                             the NEXT tick's statRecomputeSystem — the same
    //                             one-tick latency aura.ts DECISION 4 documents.
    guardianSystem(this); // 9d. neutral guardian: threat/wake, AoE volley, last-hit
    //                             payout (no-op unless armed). Runs AFTER deathSystem
    //                             (sees this tick's `death`) and reviveSystem (killer's
    //                             final alive-state is settled before payout).
    objectiveSystem(this); // 9d⁺. 戰場任務的陣營塔 (GH#752): 把「這一 tick 剛倒下的
    //                             塔」喊成一則事件 (no-op unless armed)。同一個 slot
    //                             理由：它讀的是**這一 tick** 的 `death` 事件，而且
    //                             要排在 guardianSystem 之後 —— 那一支會把中立塔的
    //                             屍體 despawn 掉，兩者共用 `world.structure`。
    mobSystem(this); //      9d′. roguelite mob waves: clock/spawn schedule, AI aim,
    //                             melee queue, +gold/xp payout + every-30 level-up
    //                             (no-op unless armed + combatActive). Same slot
    //                             rationale as the guardian: reads THIS tick's
    //                             `death` events before paying, and queues melee /
    //                             sets nav.attackTarget for next-tick resolve/chase.
    summonSystem(this); //   9d″. 召喚物 (GH#289 lane P2): despawn on the absolute
    //                             deadline / on the body's death / on the owner's
    //                             death, then aim each survivor at its nearest
    //                             enemy. STRICT no-op while `world.summon` is
    //                             empty, so every pre-feature world is unchanged.
    //
    //                             Same slot rationale as the mob one line up: it
    //                             reads THIS tick's settled alive-state (its own,
    //                             and its owner's — including a revive that landed
    //                             this tick) before despawning anything, and the
    //                             target it sets is consumed by NEXT tick's
    //                             orderSystem chase + basicAttackSystem swing.
    coinSystem(this); //     9e. 陣亡投幣 pickup: a living champion walks onto a
    //                             dropped coin and banks it (no-op unless armed).
    //                             AFTER deathSystem/reviveSystem/guardianSystem so
    //                             this tick's alive-state is final before anyone is
    //                             paid; the throw itself happened back at slot 3.
    worldHookSystem(this); // 9f. 事件流 → hook 廣播（`systems/WorldHookSystem.ts`）:
    //                             【死亡時】【復活時】【迴避時】【殭屍王出現】
    //                             【火圈點燃】【守衛塔倒下】。⚠️ 位置是硬約束 ——
    //                             它讀 `this.events`，而那個陣列在 step() 開頭才被
    //                             清空，所以它必須排在**所有發射者之後**：
    //                             evade(8) · fireRingStart(8b) · death(9) ·
    //                             reviveComplete(9c) · guardianSlain(9d) ·
    //                             mobBossSpawn(9d′)。往前搬一格就會有事件收不到，
    //                             而那種漏接**看起來跟「沒有人寫這種卡」一模一樣**。
    //                             它排出來的傷害/狀態與 onStunned·onReflectSuccess 一樣，
    //                             下一 tick 由 combatResolveSystem 結算。
    this.drainPendingDestroy(); // 9g. GH#296：`mobSystem`(9d′) 排隊的屍體在這裡才
    //                             真的消失 —— 它原本就地 destroy()，而 destroy()
    //                             會 stats.delete()，於是上面那一行跑到時小怪的
    //                             【死亡時】在 `fireHooks` 缺 stats 那一句就 return
    //                             了（**不是**存活閘，所以 #293 的修法到不了）。
    //                             理由與另外兩種修法為什麼被否決，見
    //                             `destroyAfterHooks` 的說明。
    //                             ⚠️ 位置是硬約束的**下界**：必須在 9f 之後。
    //                             上界是 regenSystem(10) —— 排得比它晚，一具屍體
    //                             會多吃一次回血掃描。空佇列時嚴格 no-op。
    regenSystem(this); // 10. hp/mana regen
    resourceStatSystem(this); // 10a. 資源衍生屬性 (光魔杖「AP+ (目前MP的 5%)」):
    //                             mark dirty when the LIVE hp/mana a
    //                             `ModOp.PercentOf` + `fromResource` modifier
    //                             reads has actually moved.
    //
    //                             SLOT IS LOAD-BEARING IN BOTH DIRECTIONS.
    //                             AFTER regen (10) so this tick's mana tick is
    //                             already in — and the same scan also picks up
    //                             the mana this tick's `spendMana` burned back
    //                             at slot 8, so ONE pass absorbs both writers.
    //                             BEFORE the late recompute (11) so the new AP
    //                             is folded in the SAME tick it moved, instead
    //                             of waiting a frame for slot 1.
    //
    //                             Costs one `sources` walk per unit and NOTHING
    //                             else while no item authors `fromResource` —
    //                             the same shape stealthSystem/flightSystem
    //                             already pay (sim/stats/resourceStats.ts ②).
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
      // 具名標記（層數）。⚠️ 這一格比它看起來重要：層數決定「這一發會不會殺死
      // 你」（`combat/lethalSave.ts`），所以一個層數不同步的 replica 會在某個人
      // 該死沒死的那一 tick 分岔 —— 而那是最難反推的一族（受害者的 hp 在兩邊都
      // 是對的，直到其中一邊突然歸零）。
      //
      // 折進來的是 `count` 與 `spent` 兩個：`spent` 是永久加成的乘數，兩邊
      // 算出不同的 spent 就是兩個不同強度的英雄，而 `count` 相同時它看不出來。
      // `expiresAtTick` 不折 —— 絕大多數標記是永久的（-1），而會過期的那些，
      // 到期的後果就是 `count` 歸零，在這裡照樣說得出來。
      //
      // 只在**真的持有標記**時折進去，照上面 `attackTarget`/`airborne`/
      // `championForm` 的先例：沒有人用標記的世界（今天的每一場）逐位元不變，
      // #191 的 disarmed-golden canary 不會被打破。
      const bag = this.marks.get(id);
      if (bag !== undefined && bag.size > 0) {
        mix(id);
        for (const markId of [...bag.keys()].sort()) {
          const st = bag.get(markId)!;
          mix(st.count);
          mix(st.spent);
        }
      }
      // GH#289 reserved stores. Folded in NOW, before their lanes land, so that
      // P1/P2/P3 need not reopen this method — the merge conflict the whole
      // split exists to prevent. All three are authoritative world state by
      // construction: a burn that ticked on one replica and not the other, a
      // summon that despawned early, an immunity window off by a tick all
      // change who dies, and none of them moves a field already hashed above.
      //
      // PRESENT-ONLY, following the `attackTarget` / `airborne` / `championForm`
      // precedent verbatim: the maps are empty today, so a post-#289 world
      // hashes byte-identically to a pre-#289 one and the #191 disarmed-golden
      // canary is untouched. `id` is re-mixed per fold so two entities' folds
      // cannot collide.
      const dots = this.dot.get(id);
      if (dots !== undefined && dots.length > 0) {
        mix(id);
        // TOTAL ORDER before hashing: instance order is the tick system's
        // business, but the DIGEST must not depend on it, or two replicas that
        // agree on every burn disagree on the hash.
        for (const d of [...dots].sort((a, b) =>
          a.nextTick !== b.nextTick
            ? a.nextTick - b.nextTick
            : a.origin < b.origin
              ? -1
              : a.origin > b.origin
                ? 1
                : a.sourceId - b.sourceId,
        )) {
          mix(d.sourceId);
          mix(d.amountPerTick);
          mix(d.nextTick);
          mix(d.expiresAtTick);
        }
      }
      const sm = this.summon.get(id);
      if (sm) {
        mix(id);
        mix(sm.ownerId);
        // A permanent summon stores +Infinity, which `Math.round(n * 4096)`
        // turns into NaN and the bit ops then into 0 — deterministic, but it
        // would collide with tick 0. Hash the PERMANENCE as its own -1 marker.
        mix(sm.expiresAtTick === Number.POSITIVE_INFINITY ? -1 : sm.expiresAtTick);
      }
      // 無敵/免疫 (lane P3): authoritative — it decides who dies — so it must be
      // hashed. Folded PER AXIS, and only while the axis is still LIVE: an
      // expired grant is inert (every read is `until > tick`) and nothing sweeps
      // the map, so hashing the raw numbers would make "an immunity that lapsed
      // twelve seconds ago" a visible difference between two replicas that agree
      // on every observable. A body with nothing live folds nothing at all, so a
      // pre-P3 world still hashes identically.
      const inv = this.invulnerable.get(id);
      if (inv !== undefined) {
        const p = inv.physicalUntil > this.tick ? inv.physicalUntil : 0;
        const m = inv.magicUntil > this.tick ? inv.magicUntil : 0;
        const tr = inv.trueUntil > this.tick ? inv.trueUntil : 0;
        const c = inv.controlUntil > this.tick ? inv.controlUntil : 0;
        if (p > 0 || m > 0 || tr > 0 || c > 0) {
          mix(id);
          mix(p);
          mix(m);
          mix(tr);
          mix(c);
        }
      }
      // [EX∅ 根源]：三張表全部是 authoritative（連擊決定誰吃不吃得到傷害、
      // 捕獲決定誰打誰、背負決定誰選得到誰），所以要進 hash。
      //
      // ⭐ **條件式折入**，逐字照上面 dot / summon / invulnerable 的先例：
      // 三張表今天都是空的，所以一份 [EX∅ 根源] 之前的錄影 hash **逐位元不變**，
      // #191 的 disarmed-golden canary 一格都不會動。⛔ 無條件 `mix(0)` 會把
      // 每一份既有錄影的 hash 全部改掉，而那條線斷了不會有人立刻發現。
      const ds = this.damageStreak.get(id);
      if (ds !== undefined) {
        mix(id);
        // 型別是**序數**不是字串：兩個 replica 只在「連的是物理還是魔法」上
        // 分家時，count 與 lastTick 完全相同，少了這一行 hash 會說它們一致。
        mix(ds.type === "physical" ? 1 : ds.type === "magic" ? 2 : 3);
        mix(ds.count);
        mix(ds.lastTick);
      }
      const mc = this.mindControl.get(id);
      if (mc !== undefined) {
        mix(id);
        mix(mc.captor);
        mix(mc.toTeam);
        mix(mc.originalTeam);
        mix(
          mc.expiresAtTick === Number.POSITIVE_INFINITY ? -1 : mc.expiresAtTick,
        );
      }
      const car = this.carried.get(id);
      if (car !== undefined) {
        mix(id);
        mix(car.carrier);
        mix(car.expiresAtTick);
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
      // GH#729 —— 三個新計數器與上面每一格同一個理由：它們是**權威世界狀態**，
      // 一個只在某一份 replica 上跳的計數器要在這裡變成 digest 不符。
      mix(s.guardianDamage);
      mix(s.guardiansSlain);
      mix(s.bountyGold);
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
    //
    // ⚠️ GH#752 的陣營塔也住這格，而 `kind` / `teamId` 刻意**不**摺進來：兩者都在
    // `spawnObjective` 一次寫定、之後沒有任何一行改它們（決定性由擺位本身保證），
    // 摺一個永不變動的常數只會讓既有錄影的 digest 全部作廢卻抓不到任何東西。
    // ⭐ 「塔倒了沒有」**已經**在上面 `mix(hp.hp)` 那一圈被摺過（血量 0 = 倒了）。
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
