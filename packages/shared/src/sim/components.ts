/**
 * Simulation components — plain POJOs stored in Map<EntityId, T> stores on the
 * World. NOT Colyseus schema objects (those live in protocol/ and are projected
 * from these at snapshot time).
 */
import type { EntityId, SeatId, TeamId, ChampionId, ItemId, AugmentId, ProjectileId, StatusId } from "../ids";
import type { Vec2 } from "./math/vec2";
import type { CastableSlot, Order } from "./intents";
import type { AttrBonus } from "./stats/attributes";

/** Planar transform: position (x,z), unit facing, collision radius. NO y. */
export interface Transform {
  pos: Vec2;
  /** current velocity (units/sec) — written by MovementSystem */
  vel: Vec2;
  /** unit facing direction (no angles) */
  facing: Vec2;
  radius: number;
  /** which arena zone this entity fights in (PairedDuels) */
  zone: number;
  /**
   * acceleration ramp 0..1 (fraction of full move speed) — written by
   * MovementSystem; optional so hand-built transforms (tests) stay valid.
   */
  accel?: number;
}

export interface Health {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  shields: { amount: number; expiresAtTick: number; sourceId: string }[];
}

export interface TeamComp {
  teamId: TeamId;
  seatId: SeatId;
}

/** Forced linear displacement integrated by MovementSystem with collision. */
export interface DashOverride {
  kind: "dash" | "knockback";
  dir: Vec2;
  speed: number;
  remaining: number;
}

/**
 * A parabolic LEAP in flight (task #247) — integrated by LeapSystem, which runs
 * immediately before MovementSystem and owns the whole arc (planar position,
 * height, and the landing detonation).
 *
 * Absolute-parametric by design: position and height are pure functions of
 * `(from, to, elapsed, ticks)`, never accumulated, so the arc cannot drift and a
 * hitstop freeze / replay seek resumes on exactly the same curve.
 */
export interface LeapOverride {
  kind: "leap";
  /** takeoff position (snapshotted) */
  from: Vec2;
  /** LEGAL landing point, proved at takeoff (movement/leap.ts) */
  to: Vec2;
  /** apex height in integer MILLI-units (determinism — see movement/leap.ts) */
  apexMilli: number;
  /** integer tick budget, derived once from the content's durationSec */
  ticks: number;
  /** integer ticks elapsed, 0..ticks */
  elapsed: number;
  /** effects run on the LANDING tick, centred on `to` */
  onLand: import("./effects/effect").EffectDef[];
  /** rank of the spawning ability (for scaling in onLand) */
  rank: number;
  /** landing burst radius in GGD units (0 = the flyer alone) */
  landRadius: number;
  /** who owns the landing effects (differs from the flyer for thrown targets) */
  casterId: EntityId;
  /** provenance for the landing damage, e.g. "ability:godie-hpb1.e" */
  origin: string;
  /** slot of the spawning ability (for slot-conditioned hooks) */
  slot?: CastableSlot;
}

/** Navigation state driven by OrderSystem, consumed by MovementSystem. */
export interface Navigation {
  order: Order | null;
  /** resolved current move target (or null when idle/arrived) */
  moveTarget: Vec2 | null;
  /**
   * movement override (dash/knockback/leap) — wins over normal movement.
   *
   * `knockback` is a forced impulse applied by a landed hit (combat/damage.ts):
   * identical integration to a dash (moveWithCollision, so it never clips walls)
   * but tagged so the client can play a hurt-slide instead of a dash animation.
   *
   * `leap` (task #247) is a DIFFERENT INTEGRATOR in the SAME SLOT — see
   * movement/leap.ts for why it is not a dash variant (a dash's per-tick body is
   * `moveWithCollision`, which is precisely the call that stops a body at a
   * wall) and why it nevertheless shares the slot (everything already built
   * around "an override exists" — hitstop, root-immunity, ENTITY_FLAG.DASHING,
   * every death/reset path that nulls the override — stays correct for free,
   * and "dash OR leap, never both" becomes true by construction).
   */
  override: DashOverride | LeapOverride | null;
  /** basic-attack target acquired by attack-move / attackTarget orders */
  attackTarget: EntityId | null;
  /**
   * PROVENANCE of `attackTarget` (task #221): true when the sim's auto-acquire
   * rule chose it, false when the SEAT ordered it (a right-click / A-click /
   * gamepad pick, human or bot).
   *
   * Without this flag the two are indistinguishable, and auto-acquire would
   * re-point or leash-drop a target the player deliberately clicked — exactly
   * the "must not override an explicit player action" constraint. Reset
   * wherever `attackTarget` is written or cleared.
   */
  attackTargetAuto: boolean;
}

export interface ProjectileComp {
  projectileId: ProjectileId;
  ownerId: EntityId;
  dir: Vec2;
  speed: number;
  remainingRange: number;
  hitRadius: number;
  /** ids already hit (pierce support); single-hit projectiles despawn on first */
  pierce: boolean;
  hitSet: Set<EntityId>;
  /** effects executed on each unit hit (caster = owner) */
  onHit: import("./effects/effect").EffectDef[];
  /** rank of the spawning ability (for scaling in onHit) */
  rank: number;
  origin: string;
  /** slot of the spawning ability (for slot-conditioned onAbilityHit hooks) */
  abilitySlot?: CastableSlot;
  /**
   * Basic-attack projectile (ranged auto). On impact it applies `basicDamage`
   * as origin "basic" (feeds lifesteal) and fires `onBasicAttack` item hooks —
   * i.e. the on-hit pipeline resolves at impact, not at the swing.
   */
  basic?: boolean;
  basicDamage?: number;
  crit?: boolean;
}

/** Marker/state bags filled in by later steps (stats, abilities, …). */
export interface ChampionComp {
  championId: ChampionId;
  level: number;
  xp: number;
  gold: number;
  items: (ItemId | null)[];
  augments: AugmentId[];
  /**
   * 能力屬性強化 progress — CONSECUTIVE stat-tick purchases with no item
   * purchase in between (task #82). This single counter IS the whole
   * "bought nothing else" predicate, because the user's reset rule
   * (「第 19 次時買了普通道具會怎樣——歸零」) zeroes it on ANY gold purchase of a
   * real item. A weapon GRANTED by a 3-choose-1 card does not touch it —
   * 「除了隨機三選一給的武器」 — because free grants never run through buyItem.
   *
   * Keeps counting past {@link STAT_TICK_TARGET}: the tick itself is uncapped,
   * only the capstone is once-per-match.
   */
  statStacks: number;
  /**
   * 三圍 BOUGHT this match — the running sum of every 能力屬性強化 三選一 pick
   * (#260). Owner: 「購買能力屬性加成也是三選一 力/敏/智 隨機加點 0.1-2」.
   *
   * It is an ATTRIBUTE total, not a stat total, and `championStatBase` folds it
   * in exactly where a champion's innate 三圍 goes — so +1 STR pays the same
   * maxHealth/regen/ad it pays an innate point, at the operator's LIVE
   * `strToMaxHealth`, and +1 AGI keeps attack speed's multiplicative form.
   * See stats/attributes.ts for why baking it into StatModifiers would be wrong.
   *
   * SURVIVES the 歸零 reset (`resetStatPath`) exactly like the pre-#260 rolls
   * did: buying an item withdraws progress toward the CAPSTONE, it does not
   * confiscate attributes already paid for.
   */
  attrBonus: AttrBonus;
  /**
   * Rolled magnitude of the 傳說·萬象強化 capstone, 10..100 (percent), or 0
   * when it has not been granted. Doubles as the once-only guard.
   */
  statCapstonePct: number;
  /**
   * Inventory slots RESERVED by 傳說寶玉 rolls that have not been picked yet
   * (task #82).
   *
   * The orb's slot check is EAGER (at purchase) but its grant is DEFERRED (at
   * pick), and the shop stays open in between — so without a reservation a
   * player could buy the orb with one slot left, spend that slot on a 300g
   * item, and have the legendary land nowhere: `grantItemFree` returns -1,
   * the offer is dropped, and 2400g bought nothing. This counter closes that
   * window by making {@link buyItem} treat the reserved slots as already
   * occupied. It is SIM state, not host state, so it replays with the seed and
   * a reconnecting client cannot desync on it.
   */
  pendingOrbSlots: number;
  /**
   * The current shopping session's UNDO HISTORY (task #121). A LIFO stack of
   * the exact buy/sell transactions the player made THIS session, newest last;
   * `undoShopAction` pops the top and reverses it precisely (see shop.ts).
   *
   * WHY A STACK, AND WHY IT MUST STORE THE APPLIED DELTA. The sell refund is a
   * floored 40% (`SELL_REFUND`), so an undo that RE-DERIVED the gold to reverse
   * could drift from what was actually applied and leak/burn a coin per cycle —
   * the exact seam a money exploit lives in. Each entry therefore records the
   * gold delta that was really applied and (for a buy) the stat-streak it reset,
   * so the reversal is byte-exact and a buy→sell→undo→undo round-trip returns to
   * the precise starting gold+inventory. An entry is popped when undone, so the
   * same action can never be undone twice; the stack is CLEARED when combat
   * begins (enterCombat), which commits the round's purchases — you cannot undo
   * across a closed shop, so no cycle can ever net positive gold.
   *
   * SIM state (not host state): it replays with the seed, survives reconnects,
   * and is never touched by `world.rng`, so it perturbs no random stream.
   */
  undoStack: ShopTxn[];
}

/**
 * One reversible shop action (task #121). `goldDelta` is the change that was
 * actually applied to `gold` when the action ran — NEGATIVE for a buy (gold
 * spent), POSITIVE for a sell (refund received) — so an undo is always exactly
 * `gold -= goldDelta`, never a re-derived figure that could disagree with what
 * the player was charged/paid.
 */
export interface ShopTxn {
  kind: "buy" | "sell";
  itemId: ItemId;
  /** the inventory slot the item occupied (buy) or vacated (sell) */
  slot: number;
  /** exact gold change applied by the action; undo does `gold -= goldDelta` */
  goldDelta: number;
  /**
   * For a BUY only: the consecutive stat-streak that the purchase reset to 0
   * (a real weapon 歸零s the 能力屬性強化 streak). Undo restores it so the
   * reversal is total. Always 0 for a sell.
   */
  statStacksBefore: number;
}

export interface StatusEffect {
  statusId: StatusId;
  sourceId: string;
  expiresAtTick: number;
  /** movement-speed multiplier while active (1 = none) */
  moveSpeedMult?: number;
  /** hard CC flags */
  root?: boolean;
  stun?: boolean;
}

export interface StatusComp {
  effects: StatusEffect[];
}

/**
 * Healing-flower marker (LoL-Arena plants). A flower is a NEUTRAL entity:
 * transform + health + this marker only — no seat, no TeamComp, no nav, no
 * stats. It therefore never appears in team/champion iterations (victory,
 * lives, AI perception) by construction. Killed flowers burst HP/MP to the
 * killer's team (FlowerSystem) and are destroyed the same tick.
 */
export interface FlowerComp {
  /** arena zone the flower lives in (duel zone) */
  zone: number;
}

/**
 * Revive-circle marker (task #84 復活小火圈). Dropped where a champion dies;
 * a LIVING TEAMMATE standing inside channels it to bring the owner back once
 * per team per round.
 *
 * Deliberately NOT shaped like a flower: a circle is GROUND AREA, not a unit.
 * It carries transform + this marker and nothing else — **no health component
 * and no TeamComp seat** — so it can never be attacked, never be picked up by
 * an ability query, and can never be counted by `teamAliveCount` / duel
 * resolution. Team ownership rides in `teamId` here instead of a TeamComp
 * precisely so the champion/team iterations stay blind to it.
 *
 * All timing is in ABSOLUTE `world.tick` (not `world.combatTicks`, which only
 * advances while the flower rules are armed — see systems/ReviveSystem.ts).
 */
/**
 * Dropped-gold-coin marker (task #191 陣亡投幣). Thrown by a DEAD player onto
 * the arena floor; the first LIVING champion to walk within `pickupRadius`
 * banks `value` — friend or foe, per the owner's unqualified 「經過的玩家」.
 *
 * Shaped like a revive circle rather than a flower, and for sharper reasons: a
 * coin carries transform + this marker and NOTHING ELSE.
 *   • no {@link TeamComp} — a seat here would put the coin into
 *     `teamAliveInZone` / duel resolution / the alive-champion checks, i.e. a
 *     thrown coin could keep a wiped team "alive". Ownership rides in
 *     `ownerSeatId` instead, purely so the wire can tint/attribute it.
 *   • no {@link Health} — health is what makes an entity attackable AND what
 *     puts hp/mana into `SimWorld.digest()`; a coin is loot, not a target.
 * It is also kept out of the broad-phase grid, `queryOverlap` and both
 * MovementSystem passes, so nothing can target, shove or be shoved by it.
 */
export interface CoinComp {
  /** gold banked by whoever picks it up (== what the thrower paid) */
  value: number;
  /** duel zone; a coin only ever pays a champion fighting in its own zone */
  zone: number;
  /** the DEAD thrower's seat — presentation only (never a team check) */
  ownerSeatId: SeatId;
}

/**
 * Roguelite mob marker + per-round AI state (task #215 聖杯黑泥醬-喪標麥可). One
 * per live mob, stored in `world.mob`. A mob is built from the guardian/flower
 * NEUTRAL-entity blueprint but with TWO genuinely new capabilities layered on:
 *
 *   1. it MOVES — it carries a {@link Navigation} (guardians/flowers do not), so
 *      OrderSystem + MovementSystem walk it toward its target at the fallback
 *      BASE_MOVE_SPEED (it has NO StatsComp, so it inherits that speed);
 *   2. it is MUTUALLY HOSTILE — it carries a {@link TeamComp} on the sentinel
 *      MONSTER team ({@link MONSTER_TEAM}), a team no champion is ever on, so
 *      `differentTeam` makes it an enemy to EVERY champion without a ChampionComp.
 *
 * A spawned mob therefore carries: Transform + Health + this marker + Navigation
 * + TeamComp(MONSTER). Deliberately NO ChampionComp / seat / StatsComp /
 * AbilitiesComp / matchStats entry, so the scoreboard, duel resolution, team
 * lives and placement all stay blind to it BY CONSTRUCTION (the guardian/flower
 * neutrality contract). All fields here are authoritative + deterministic.
 *
 * `modelKey` is NOT stored — it is presentation-only (resolved client-side from
 * ENTITY_KIND.MOB like the guardian/flower), so it stays out of the digest.
 */
/**
 * 一般殭屍 / 特殊殭屍 / 殭屍王 (task #262).
 *
 * DECLARED HERE, not in sim/mobs.ts, purely so `MobComp` stays importable
 * without dragging the mobs module (and through it SimWorld + collision) into
 * anything that only wants the component shapes. `sim/mobs.ts` re-exports it.
 */
export type MobKind = "normal" | "special" | "boss";

export interface MobComp {
  /** duel zone the mob fights in (a mob only ever chases/attacks in its zone) */
  zone: number;
  /** the sentinel MONSTER team id it is on (always {@link MONSTER_TEAM}) */
  team: TeamId;
  /**
   * 一般殭屍 / 特殊殭屍 / 殭屍王 (task #262). Written ONCE at spawn and never
   * mutated. Everything that differs between them — hp, melee damage, walk
   * speed, body radius, the model on the wire, and what dying pays — is derived
   * from this one field through `mobProfile` (sim/mobs.ts), so a king cannot end
   * up hitting for a zombie's damage because one call site read `rules.x` raw.
   *
   * Authoritative sim state, but NOT digested directly: the observable effects
   * (spawn hp, positions, gold) are all already in the digest at their source,
   * exactly like `MobComp.zone` and `spawnTick`.
   */
  kind: MobKind;
  /** current AI target (nearest enemy champion), resolved each tick; -1 = none */
  target: EntityId | -1;
  /** integer melee-cooldown countdown (0 = ready to swing) */
  attackCdTicks: number;
  /** `mobTicks` value at spawn — presentation/debug only, NOT in the digest */
  spawnTick: number;
}

export interface ReviveCircleComp {
  /** the corpse this circle belongs to (revive target) */
  ownerId: EntityId;
  /** owner's seat — projected on the wire so the HUD can name the dead player */
  ownerSeatId: SeatId;
  /** team allowed to channel it (and whose charge it will spend) */
  teamId: TeamId;
  /** duel zone; a circle only ever affects its own zone */
  zone: number;
  /**
   * world.tick the circle was dropped on. Bookkeeping only — there is NO
   * expiry deadline beside it any more (task #196): the ring burns until the
   * round ends, matching LoL Arena, which documents no timeout on the downed
   * zone either. `endCombatRevives` is what despawns it.
   */
  spawnedAtTick: number;
  /** accumulated channel progress in ticks (0 .. rules.channelTicks) */
  progressTicks: number;
  /** entity credited with driving progress this tick (null = nobody) */
  channellerId: EntityId | null;
  /** an enemy stood inside this tick (progress held, not reset) */
  contested: boolean;
}
