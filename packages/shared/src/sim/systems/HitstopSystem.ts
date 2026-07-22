/**
 * HitstopSystem — ages the combat-juice freeze counters (hitstop + knockdown)
 * by one tick each. Deterministic: integer decrements only, iteration order
 * irrelevant (each entry is independent).
 *
 * Placement matters. This runs in step() AFTER the systems that GATE on the
 * counters (castResolve/tickCooldowns, movement, basicAttack) have read them
 * this tick, but BEFORE combatResolveSystem, which is where a landed hit SETS a
 * fresh counter. Consequence: a hit resolving on tick T sets hitstop=N and that
 * value is untouched until the NEXT tick's decay — so the entity is frozen on
 * exactly ticks T+1..T+N (N ticks), never N-1. See SimWorld.hitstop docs.
 *
 * Entries are deleted when they reach 0 so the maps stay compact (and the
 * digest — which reads them per entity — stays clean).
 */
import type { SimWorld } from "../SimWorld";

function age(map: Map<import("../../ids").EntityId, number>): void {
  for (const [id, ticks] of map) {
    if (ticks <= 1) map.delete(id);
    else map.set(id, ticks - 1);
  }
}

export function hitstopDecaySystem(world: SimWorld): void {
  age(world.hitstop);
  age(world.knockdown);
}
