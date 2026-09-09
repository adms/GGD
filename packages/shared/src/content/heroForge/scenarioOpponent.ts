import { asSeatId, type EntityId } from "../../ids";
import type { AbilityDef } from "../../sim/content/defs";
import type { SimWorld } from "../../sim/SimWorld";
import { consumableStatusStacks } from "../../sim/statusConsumption";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../../sim/mobs";
import { Configs } from "../registries";

export type OpponentPreparation = "auto" | "idle" | "attack";
export interface ScenarioResourceCost {
  subject: "self" | "target";
  statusId: string;
  before: number;
  after: number;
}

/** Same live-combat flag and inert-seat driver seam as the practice host.
 * All actions below are explicit intents; empty frames must not auto-acquire
 * extra opponents and silently supply the resource under examination.
 */
export function configureScenarioCombat(world: SimWorld): void {
  world.combatActive = true;
  const arena = Configs.tryGet("arena-rules") as unknown as { mobWaves?: MobWavesConfigLike } | undefined;
  const rules = world.mobRules ?? (arena?.mobWaves ? mobRulesFromConfig(arena.mobWaves, world.dt) : null);
  // Full authoring/import baselines carry the shipped arena rules. A bare
  // skeletal fixture without that config keeps its existing targeting rules.
  if (rules) world.mobRules = { ...rules, autoWaves: false, inertSeats: new Set([
    ...(rules.inertSeats ?? []), asSeatId(0), asSeatId(1), asSeatId(2),
  ]) };
}

/** Exercise a target resource's earning path, never install or credit a status.
 * Three seconds of actual hostile orders is a bounded fixture, not a promise
 * that every kind of target resource can be earned through a basic attack.
 */
export function prepareScenarioOpponent(world: SimWorld, caster: EntityId, ability: AbilityDef,
  mode: OpponentPreparation = "auto", record: () => void): number {
  if (mode === "idle" || (mode === "auto" && ability.statusCost?.subject !== "target")) return 0;
  const ticks = Math.ceil(3 / world.dt);
  for (let tick = 0; tick < ticks; tick++) {
    world.step(tick === 0 ? new Map([[asSeatId(1), { commands: [], order: { kind: "attackTarget" as const, entity: caster } }]]) : new Map());
    record();
  }
  world.step(new Map([[asSeatId(1), { commands: [], order: { kind: "hold" as const } }]]));
  record();
  return ticks + 1;
}

export function scenarioResourceCount(world: SimWorld, caster: EntityId, target: EntityId, ability: AbilityDef): number {
  const cost = ability.statusCost;
  return cost ? consumableStatusStacks(world, cost.subject === "target" ? target : caster, cost.statusId,
    cost.appliedBy === "self" ? caster : undefined) : 0;
}

export function scenarioResourceCost(world: SimWorld, caster: EntityId, target: EntityId, ability: AbilityDef,
  before: number): ScenarioResourceCost | undefined {
  const cost = ability.statusCost;
  return cost ? { subject: cost.subject === "target" ? "target" : "self", statusId: cost.statusId,
    before, after: scenarioResourceCount(world, caster, target, ability) } : undefined;
}
