/** Stats + abilities runtime components (stored on the World). */
import type { AbilityId, ChampionId, EntityId } from "../../ids";
import type { StatBlock } from "./statTypes";
import type { ModifierSource } from "./modifiers";
import type { CastableSlot, CoreAbilitySlot } from "../intents";
import type { Vec2 } from "../math/vec2";

export interface StatsComp {
  championId: ChampionId;
  /** cached output of the stat pipeline */
  final: StatBlock;
  dirty: boolean;
  /** ONE list: champion passive + items + augments + buffs */
  sources: ModifierSource[];
  /**
   * RUNTIME bookkeeping for 資源衍生屬性 (`stats/resourceStats.ts`): the value
   * of `resourceSignature` at the last recompute this unit was marked dirty
   * FOR. `undefined` = this unit has never carried a `fromResource` modifier,
   * which is every unit in the game except a champion holding 光魔杖.
   *
   * It exists so a champion sitting at FULL mana costs zero recomputes: the
   * signature does not move, so `resourceStatSystem` never sets `dirty`. Not in
   * `digest()` — it is a cache of a value that is itself derived from `hp.mana`,
   * which IS digested, so digesting it too would only be able to disagree.
   */
  resourceSig?: number;
}

export interface AbilityInstance {
  abilityId: AbilityId;
  rank: number; // 0 = not learned
  cooldownRemainingTicks: number;
}

/**
 * An in-progress ability cast (only present when the ability has cast time > 0).
 * Targeting is snapshotted at cast-begin; effects fire deterministically after
 * `ticksLeft` reaches 0 in CastResolveSystem. Mana + cooldown are paid up-front
 * at cast-begin (LoL-style: an interrupted cast loses the mana, not refunded).
 */
export interface CastState {
  /** `CastableSlot`: the sixth slot (天生技) casts through this state too. */
  slot: CastableSlot;
  abilityId: AbilityId;
  rank: number;
  ticksLeft: number;
  /** resolved targets at cast-begin */
  targets: EntityId[];
  point?: Vec2;
  direction?: Vec2;
  /** caster is rooted (cannot move) for the cast duration */
  rooted: boolean;
  /**
   * The caster's HP on the tick this cast BEGAN — the baseline
   * `AbilityDef.interruptOn: "damage"` compares against (CastResolveSystem).
   *
   * Snapshotted here rather than read from a per-entity 「last damaged tick」
   * store because that store does not exist and inventing one would put a new
   * Map on `SimWorld` (and in its digest) for a question only a channelled cast
   * ever asks. Written for EVERY cast, not just the interruptible ones, so the
   * baseline can never be missing on the branch that reads it — a conditional
   * write is how a field becomes 「有時候是 undefined」 and the interrupt
   * silently stops working for whoever set the flag second.
   */
  hpAtStart: number;
}

/**
 * The caster's post-resolve COMMITMENT (後搖) — armed at the END of startup by
 * `armRecovery`, aged by `recoveryDecaySystem`, and CANCELLED the moment the
 * ability lands a hit on an enemy (`noteAbilityConnect`). That hit-cancel is the
 * whole combo system: hit and you flow, whiff and you are committed.
 *
 * Blocks casting a new ability and starting a basic attack. Movement is only
 * blocked when `roots` (per-ability `recoveryRoots: true`) — see the long
 * rationale in abilities/abilityRecovery.ts.
 */
export interface RecoveryState {
  /** `CastableSlot`: an innate that whiffs commits you exactly like a Q. */
  slot: CastableSlot;
  /** which ability's recovery this is — a hit from THIS ability cancels it. */
  abilityId: AbilityId;
  ticksLeft: number;
  /** armed length, so a client/HUD can draw a 0..1 progress without guessing. */
  totalTicks: number;
  /** caster is rooted for the recovery (default false — output lock only). */
  roots: boolean;
}

/**
 * An in-progress basic-attack wind-up. The swing "damage point" lands when
 * `ticksLeft` reaches 0 (melee applies damage; ranged launches a projectile).
 * Interrupted by stun/death/target-loss/leaving range (LoL cancels on move).
 */
export interface AttackWindup {
  target: EntityId;
  ticksLeft: number;
}

export interface AbilitiesComp {
  slots: Record<CoreAbilitySlot, AbilityInstance>;
  /**
   * The per-hero "EX 技能" instance. Present only when the champion has an
   * `exAbility`; `rank` is 0 (locked) until the EX-unlock point, then 1
   * (unlocked). EX is single-rank — it is UNLOCKED, never leveled.
   */
  exSlot?: AbilityInstance | null;
  /**
   * The SIXTH slot — the champion's 天生技 / innate (`slot: "PASSIVE"`,
   * ability code `NN-00`). Present only when the champion doc carries a
   * `passiveAbility`; 3 of 111 heroes genuinely have none.
   *
   * Its `rank` is 1 FROM SPAWN — that is the whole point of the slot
   * (「我說過他是等級1就獲得」). It is never leveled and never unlocked.
   *
   * CASTABLE, for the `innateKind: "active"` half only.
   * `Command.castAbility` carries `CastableSlot`, which includes "PASSIVE", so
   * an intent frame reaches this instance through the ordinary `castAbility`
   * ladder and `cooldownRemainingTicks` is a REAL cooldown that
   * `tickCooldowns` ages (see abilities/innateActive.ts).
   *
   * `Command.rankUpAbility` and `rankUpAbility()` still carry the narrower
   * `AbilitySlot`/`CoreAbilitySlot`, so this instance can be cast but can NEVER
   * be ranked — `rank` stays 1 for the champion's whole life.
   *
   * `innateKind: "passive"` innates are NOT castable (`castAbility` answers
   * "passive") and are live a different way: `syncAbilityPassives` attaches
   * `def.passive.ranks[0]` as a ModifierSource at spawn, exactly like a learned
   * Q's permanent passive.
   */
  passiveSlot?: AbilityInstance | null;
  basicAttackCdTicks: number;
  unspentPoints: number;
  /** active ability cast (cast time > 0); null/undefined when not casting */
  cast?: CastState | null;
  /** active basic-attack wind-up; null/undefined when not winding up */
  windup?: AttackWindup | null;
  /**
   * Post-resolve COMMITMENT after an ability whiffed (see `RecoveryState`).
   * null/undefined when free to act — which is also what a LANDED hit produces,
   * because the hit cancels it.
   */
  recovery?: RecoveryState | null;
}
