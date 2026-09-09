import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { isTimeStopped } from "./timeStop";

// Derived, per-step deduplication only: overlapping fields pause a clock once.
const paused = new WeakMap<SimWorld, { tick: number; ids: Set<EntityId> }>();

/** Explicit clock policy. Local action counters are held by their systems;
 * absolute local deadlines move one tick. Match/round/fire-ring/revive clocks,
 * field deadlines, score timers and historical cast identities are untouched.
 * Ground delayed/chain effects belong to their caster; DoTs to their victim. */
export function pauseTimeStopClocks(world: SimWorld): void {
  if (world.timeStop.size === 0) return;
  let frame = paused.get(world);
  if (!frame || frame.tick !== world.tick) { frame = { tick: world.tick, ids: new Set() }; paused.set(world, frame); }
  const newlyPaused = new Set<EntityId>();
  for (const id of [...world.health.keys()].sort((a, b) => a - b)) {
    if (frame.ids.has(id) || !world.health.get(id)?.alive || !isTimeStopped(world, id)) continue;
    frame.ids.add(id); newlyPaused.add(id);
    for (const s of world.status.get(id)?.effects ?? []) if (s.expiresAtTick > world.tick) s.expiresAtTick++;
    for (const s of world.marks.get(id)?.values() ?? []) if (s.expiresAtTick > world.tick) s.expiresAtTick++;
    for (const s of world.health.get(id)?.shields ?? []) if (s.expiresAtTick > world.tick) s.expiresAtTick++;
    for (const src of world.stats.get(id)?.sources ?? []) {
      if (src.expiresAtTick !== undefined && src.expiresAtTick > world.tick) src.expiresAtTick++;
      if (src.blockLastFired !== undefined && src.blockLastFired >= 0) src.blockLastFired++;
      if (src.hookLastFired) src.hookLastFired = src.hookLastFired.map(n => n >= 0 ? n + 1 : n);
      for (const map of src.hookLastFiredBySlot ?? []) if (map) for (const [key, n] of map) if (n >= 0) map.set(key, n + 1);
      for (const sample of src.hookStillness ?? []) if (sample) { sample.tick++; sample.since++; }
    }
    const ab = world.abilities.get(id);
    if (ab) {
      for (const inst of [...Object.values(ab.slots), ab.exSlot, ab.passiveSlot]) if (inst?.recast) {
        inst.recast.readyAt++; inst.recast.expiresAt++;
      }
      for (const toggle of ab.toggles ?? []) toggle.nextUpkeepTick++;
    }
    for (const grant of world.champion.get(id)?.attrGrantTimed ?? []) if (grant.expiresAtTick > world.tick) grant.expiresAtTick++;
    for (const dot of world.dot.get(id) ?? []) { dot.nextTick++; dot.expiresAtTick++; }
    const form = world.championForm.get(id); if (form && form.expiresTick > world.tick) form.expiresTick++;
    const carried = world.carried.get(id); if (carried && carried.expiresAtTick > world.tick) carried.expiresAtTick++;
    const controlled = world.mindControl.get(id); if (controlled && controlled.expiresAtTick > world.tick) controlled.expiresAtTick++;
    const summon = world.summon.get(id); if (summon && summon.expiresAtTick > world.tick) summon.expiresAtTick++;
    const lock = world.facingLock.get(id); if (lock && lock.untilTick > world.tick) lock.untilTick++;
    const stealth = world.stealth.get(id); if (stealth && stealth.hiddenFromTick > world.tick) stealth.hiddenFromTick++;
    const immunity = world.invulnerable.get(id);
    if (immunity) for (const key of ["physicalUntil", "magicUntil", "trueUntil", "controlUntil"] as const) if (immunity[key] > world.tick) immunity[key]++;
    for (const map of [world.moveOrderNoAggroUntil, world.lastMoveOrderTick, world.lastCommandTick]) {
      const value = map.get(id); if (value !== undefined) map.set(id, value + 1);
    }
  }
  for (const wave of world.delayed) if (newlyPaused.has(wave.caster)) {
    wave.strikes = wave.strikes.map((s, i) => i < wave.next ? s : { ...s, atTick: s.atTick + 1 });
  }
  for (const wave of world.randomArea) if (newlyPaused.has(wave.caster)) {
    wave.impacts = wave.impacts.map((s, i) => i < wave.next ? s : { ...s, atTick: s.atTick + 1 });
  }
  for (const chain of world.chainLightning) if (newlyPaused.has(chain.caster)) {
    for (const strand of chain.strands) if (!strand.done) strand.atTick++;
  }
}
