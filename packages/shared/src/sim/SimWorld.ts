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
import { DEFAULT_BODY_SCALE_RULES, type BodyScaleRules } from "./bodyScale";
import { DEFAULT_REGEN_RULES, type RegenRules } from "./regenRules";
import { DEFAULT_COMBAT_FEEL, type CombatFeelRules } from "./combatFeel";
import { DEFAULT_SHIELD_RULES, type ShieldRules } from "./shieldRules";
import { DEFAULT_BLOCK_RULES, type BlockRules } from "./blockRules";
import { DEFAULT_STEALTH_RULES, stealthSystem, type StealthRules } from "./stealth";
import {
  DEFAULT_TAUNT_RULES,
  forgetSuspendedOrdersOn,
  forgetTauntsBy,
  type TauntRules,
} from "./taunt";
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
import { resourceStatSystem } from "./stats/resourceStats";
import { auraSystem } from "./aura/aura";
import { auraCarrierSystem } from "./auraCarrier";
import { nightPactSystem } from "./nightPact";
import { commandSystem } from "./systems/CommandSystem";
import { castResolveSystem } from "./systems/CastResolveSystem";
import { recoveryDecaySystem } from "./systems/RecoverySystem";
import { basicAttackSystem } from "./systems/BasicAttackSystem";
import { projectileSystem } from "./systems/ProjectileSystem";
import { combatResolveSystem } from "./combat/damage";
import { flightSystem } from "./flight";
import { attrGrantExpirySystem } from "./effects/grantAttribute";
import { ccHookSystem } from "./systems/CcHookSystem";
import { dotTickSystem } from "./effects/dotTick";
import { intervalHookSystem } from "./systems/IntervalHookSystem";
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
import { summonSystem } from "./summons";
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
   * 暗夜旗 (71-00 暗夜契約, owner 2026-07-30) — the banners a champion death
   * raises while a 暗夜契約 carrier fights in that zone, each radiating 黑夜靈氣.
   *
   * Transform + this marker ONLY: no TeamComp (one would corrupt
   * `teamAliveInZone` and duel resolution) and no Health (one would make a
   * banner attackable and inject hp into `digest()`), exactly like a dropped
   * coin. It IS kept out of `rebuildGrid` below — that single line is what makes
   * it structurally untargetable for every ability, projectile, auto-acquire and
   * mob-AI query — but UNLIKE an aura carrier it IS published to the wire, as
   * `ENTITY_KIND.NIGHT_FLAG`, because the owner asked for a black circle sized
   * to the aura so players can see where the effect reaches. See sim/nightPact.ts.
   */
  readonly nightFlag = new Map<EntityId, import("./nightPact").NightFlagComp>();

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
   * 戰鬥手感規則 (see combatFeel.ts) —— 擊退法則 (GH#193) + 打就站定開關。
   * 和 `combatEnv` / `baseBonus` / `statCaps` 同一條規矩:開賽前指派一次,
   * 之後不再動,sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**,不是空表 —— 空表會讓擊退/站定兩條規則靜默消失。
   */
  combatFeel: CombatFeelRules = DEFAULT_COMBAT_FEEL;

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
   * 暗夜契約 rules (71-00). null (default) = the mechanic is OFF — unit tests,
   * the client's prediction shadow world and every match whose rules doc has no
   * `nightPact` block — and `nightPactSystem` returns on it before doing
   * anything at all, so a pre-feature world is byte-identical down to the
   * digest AND draws nothing from `world.rng`. The match host arms these via
   * `beginCombatNightPact` / `endCombatNightPact` (see nightPact.ts).
   */
  nightPactRules: import("./nightPact").NightPactRules | null = null;

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
   * 隱形規則 (`config.stealth@1`, see stealth.ts) —— 隱形擋不擋自動索敵／手動
   * 點選／技能 AoE，破隱條件，以及兩個渲染不透明度。和 `combatEnv` / `baseBonus`
   * / `statCaps` / `combatFeel` / `shieldRules` 同一條規矩:開賽前指派一次,
   * 之後不再動,sim 從不讀 config/globals,所以決定性自動成立。
   * 預設是**出貨表**(= WC3 原作行為),不是空物件 —— 空表會讓「擋不擋」全部讀成
   * false,也就是隱形只剩畫面、完全不影響索敵,而畫面上看起來一切正常。
   */
  stealthRules: StealthRules = DEFAULT_STEALTH_RULES;

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
    // task #249: nor a stale 變身 form — a recycled id that inherited one would
    // be dragged back to a PREVIOUS unit's base champion on the next tick.
    this.championForm.delete(id);
    // …nor a stale AURA CARRIER marker. Two directions matter here: destroying
    // the CARRIER must drop its own entry (this line), and destroying a HOST
    // must not leave a carrier following a corpse — the latter is handled by
    // `auraCarrierSystem`'s reconcile, which sees the host's transform vanish
    // and tears the carrier down on the next tick (sim/auraCarrier.ts).
    this.auraCarrier.delete(id);
    // …nor a stale 暗夜旗 marker. A recycled entityId that inherited one would
    // keep radiating 黑夜靈氣 from a body that is now a champion or a projectile.
    this.nightFlag.delete(id);
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
      // 暗夜旗 are BANNERS, not bodies: out of the broad-phase means nothing can
      // target, hit or collide with one, exactly like a revive circle. The night
      // aura costs nothing for it — nightPactSystem reads flag positions straight
      // off `world.transform` and never queries the grid.
      if (this.nightFlag.has(id)) continue;
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
    combatResolveSystem(this); // 8. drain damage queue (mitigation/shields/hooks
    //                             + combat-juice: hitstop/knockback/knockdown)
    ccHookSystem(this); //   8a. 被暈眩時 → `onStunned` hooks (08-00 龍紋記憶).
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
    nightPactSystem(this); // 9c′. 71-00 暗夜契約: raise a 暗夜旗 on this tick's
    //                             champion deaths, reconcile 黑夜靈氣 membership,
    //                             and roll the 附近敵方施法 mana burn (STRICT no-op
    //                             unless armed). Same slot rationale as the
    //                             reviveSystem above it: the flag is raised by a
    //                             DEATH, so it has to read this tick's `death`
    //                             events. The aura it attaches is folded in by
    //                             the NEXT tick's statRecomputeSystem — the same
    //                             one-tick latency aura.ts DECISION 4 documents.
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
