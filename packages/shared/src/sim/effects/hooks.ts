/**
 * Hook dispatch — event-driven effects from ModifierSources (champion passives,
 * item passives, augments). Hooks run inline at emit time; any damage they
 * produce goes into the damage queue (resolved by combatResolveSystem's bounded
 * multi-pass drain), keeping ordering deterministic.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { HookEvent } from "../stats/modifiers";
import { runEffects } from "./effectRunner";
import type { CastableSlot } from "../intents";

export function fireHooks(
  world: SimWorld,
  owner: EntityId,
  event: HookEvent,
  target?: EntityId,
  abilitySlot?: CastableSlot,
): void {
  const sc = world.stats.get(owner);
  if (!sc) return;
  const ownerHp = world.health.get(owner);
  if (ownerHp && !ownerHp.alive) return;

  for (const src of sc.sources) {
    if (!src.hooks) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!src.hookLastFired) src.hookLastFired = new Array(src.hooks.length).fill(-1e9);

    for (let hi = 0; hi < src.hooks.length; hi++) {
      const hook = src.hooks[hi]!;
      if (hook.on !== event) continue;
      if (hook.abilitySlot && hook.abilitySlot !== abilitySlot) continue;
      // #244 — WHAT died / was hit. Absent or "any" = no filter, so every
      // pre-#244 hook is untouched. An entity-less event never filters.
      if (hook.victim !== undefined && hook.victim !== "any" && target !== undefined) {
        // Positive tests on BOTH sides: a neutral that is neither (a guardian,
        // a flower) matches neither filter, which is the honest reading of the
        // field name.
        const ok = hook.victim === "mob" ? world.mob.has(target) : world.champion.has(target);
        if (!ok) continue;
      }

      // internal cooldown
      if (hook.internalCooldown) {
        const icdTicks = Math.round(hook.internalCooldown / world.dt);
        if (world.tick - src.hookLastFired[hi]! < icdTicks) continue;
      }
      // proc chance (WC3 Hbh1/Ocr1/War1 …) — seeded rng, so a replay of the
      // same seed rolls identically. A failed roll leaves the ICD clock alone.
      if (hook.chance !== undefined && !world.rng.chance(hook.chance)) continue;
      src.hookLastFired[hi] = world.tick;

      const resolveAgainst =
        hook.target === "self" || target === undefined ? [owner] : [target];
      runEffects(hook.effects, {
        world,
        caster: owner,
        rank: 1,
        targets: resolveAgainst,
        origin: `hook:${src.id}`,
        rng: world.rng,
      });
    }
  }
}
