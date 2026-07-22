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
}
