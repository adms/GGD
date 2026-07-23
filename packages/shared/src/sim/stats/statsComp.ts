/** Stats + abilities runtime components (stored on the World). */
import type { AbilityId, ChampionId, EntityId } from "../../ids";
import type { StatBlock } from "./statTypes";
import type { ModifierSource } from "./modifiers";
import type { AbilitySlot, CoreAbilitySlot } from "../intents";
import type { Vec2 } from "../math/vec2";

export interface StatsComp {
  championId: ChampionId;
  /** cached output of the stat pipeline */
  final: StatBlock;
  dirty: boolean;
  /** ONE list: champion passive + items + augments + buffs */
  sources: ModifierSource[];
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
  slot: AbilitySlot;
  abilityId: AbilityId;
  rank: number;
  ticksLeft: number;
  /** resolved targets at cast-begin */
  targets: EntityId[];
  point?: Vec2;
  direction?: Vec2;
  /** caster is rooted (cannot move) for the cast duration */
  rooted: boolean;
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
  slot: AbilitySlot;
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
