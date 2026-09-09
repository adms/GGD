import { asSeatId, type EntityId } from "../../ids";
import type { SimWorld } from "../../sim/SimWorld";
import { Abilities } from "../../sim/content/registry";
import type { AbilityDef } from "../../sim/content/defs";
import type { CastableSlot, IntentFrame } from "../../sim/intents";
import { abilityInstanceFor } from "../../sim/abilities/innateActive";
import { learnEx, rankUpAbility } from "../../sim/abilities/abilitySystem";
import { ownedSummonsForSlot } from "../../sim/summons";
import { consumableStatusStacks } from "../../sim/statusConsumption";
import { scenarioResourceCount } from "./scenarioOpponent";

function nodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  return [value as Record<string, unknown>, ...Object.values(value).flatMap(nodes)];
}

/** Bounded admission driver, not game logic. All prerequisites are earned by
 * ordinary inputs and elapsed ticks. Never writes marks, statuses, HP, mana,
 * cooldowns, RNG or evasion outcomes. Explicit manual scenes do not use it.
 */
export function prepareAbilityPrerequisites(world: SimWorld, caster: EntityId, foe: EntityId, ally: EntityId,
  ability: AbilityDef, record: () => void): { ticks: number; actions: string[] } {
  const start = world.tick;
  const limit = start + Math.ceil(180 / world.dt);
  const actions: string[] = [];
  const step = (frames: Map<ReturnType<typeof asSeatId>, IntentFrame> = new Map()) => {
    if (world.tick >= limit) return false;
    world.step(frames); record(); return true;
  };
  const wait = (sec: number) => {
    for (let n = 0; n < Math.ceil(sec / world.dt); n++) if (!step()) break;
  };
  const hold = () => step(new Map([0, 1].map(seat => [asSeatId(seat), { commands: [], order: { kind: "hold" as const } }])));
  const component = world.abilities.get(caster)!;
  const cost = ability.statusCost;
  const selfReady = () => !cost || cost.subject === "target" ||
    scenarioResourceCount(world, caster, foe, ability) >= (cost.count === "all" ? 1 : cost.count);
  const targetReady = () => {
    const required = ability.requiredTargetStatus;
    return (!required || consumableStatusStacks(world, foe, required.statusId, required.appliedBy === "self" ? caster : undefined) >= (required.minStacks ?? 1)) &&
      (!cost || cost.subject !== "target" || scenarioResourceCount(world, caster, foe, ability) >= (cost.count === "all" ? 1 : cost.count));
  };
  const prepareSlot = (id: EntityId, slot: CastableSlot) => {
    const c = world.abilities.get(id)!;
    if (slot === "EX") learnEx(world, id);
    else if (["Q", "W", "E", "R"].includes(slot)) {
      c.unspentPoints = Math.max(c.unspentPoints, 1);
      if (!abilityInstanceFor(c, slot)?.rank) rankUpAbility(world, id, slot as "Q");
    }
    const instance = abilityInstanceFor(c, slot);
    if (!instance) return undefined;
    wait(Math.max(instance.cooldownRemainingTicks, c.cast?.ticksLeft ?? 0) * world.dt + world.dt);
    return Abilities.get(instance.abilityId);
  };
  const cast = (seat: 0 | 1, def: AbilityDef, victim: EntityId): IntentFrame => {
    const p = world.transform.get(victim)!.pos;
    const actor = seat === 0 ? caster : foe;
    const a = world.transform.get(actor)!.pos;
    return { commands: [{ kind: "castAbility", slot: def.slot as CastableSlot, target:
      def.castType === "self" ? { type: "self" } :
      def.castType === "targeted" ? { type: "entity", entityId: def.targetsEnemies === false ? ally : victim } :
      def.castType === "skillshot" ? { type: "dir", dir: { x: p.x - a.x, z: p.z - a.z } } :
      { type: "point", point: { ...p } } }] };
  };

  if (ability.requiredSummonSlot && !ownedSummonsForSlot(world, caster, ability.requiredSummonSlot).length) {
    const prior = prepareSlot(caster, ability.requiredSummonSlot);
    if (prior) {
      actions.push(`cast:${prior.slot}:required-summon`);
      step(new Map([[asSeatId(0), cast(0, prior, foe)]])); wait(1.5);
    }
  }
  if (!selfReady()) {
    actions.push("hold:7s:resource-recovery"); hold(); wait(7);
  }
  // Source-attributed evade resources need a real attack while their producer
  // is active. Discover the producer from its hook graph, never a hero name.
  if (!selfReady() && cost) {
    const producer = (["Q", "W", "E", "R"] as const).map(slot => {
      const instance = abilityInstanceFor(component, slot);
      return instance && Abilities.get(instance.abilityId);
    }).find(def => def && nodes(def).some(hook => hook.on === "onEvade" &&
      nodes(hook.effects).some(effect => effect.kind === "applyStatus" && effect.statusId === cost.statusId)));
    const incoming = (["Q", "W", "E", "R"] as const).map(slot => {
      const instance = abilityInstanceFor(world.abilities.get(foe)!, slot);
      return instance && Abilities.get(instance.abilityId);
    }).find(def => def && def.castType === "targeted" && def.targetsEnemies !== false &&
      nodes(def).some(effect => effect.kind === "damage"));
    if (producer && incoming) for (let attempt = 0; attempt < 16 && !selfReady() && world.tick < limit; attempt++) {
      hold(); prepareSlot(caster, producer.slot as CastableSlot); prepareSlot(foe, incoming.slot as CastableSlot);
      // Initial geometry for a new exchange, as in the ordinary kit fixture.
      // No teleport is used to fake a dodge or a dash-completion event.
      const center = world.arena.zones[0]!.center;
      Object.assign(world.transform.get(caster)!.pos, { x: center.x, z: center.z });
      Object.assign(world.transform.get(foe)!.pos, { x: center.x + 1.8, z: center.z });
      world.rebuildGrid();
      actions.push(`cast:${producer.slot}:evade-exchange:${attempt + 1}`);
      step(new Map([[asSeatId(0), cast(0, producer, foe)]]));
      step(new Map([[asSeatId(1), cast(1, incoming, caster)]])); wait(.5);
    }
  }
  while ((component.cast || (component.recovery?.ticksLeft ?? 0) > 0) && world.tick < limit) step();
  if (!targetReady()) {
    actions.push("attack-target:earn-own-hit");
    step(new Map([[asSeatId(0), { commands: [], order: { kind: "attackTarget", entity: foe } }]]));
    for (let n = 0; n < Math.ceil(4 / world.dt) && !targetReady(); n++) if (!step()) break;
    hold();
  }
  return { ticks: world.tick - start, actions };
}
