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
import { requirementScale, scaleEffects } from "../content/requirement";
import { evaluateCondition } from "../content/condition";

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

      // 職業限定閘 (owner 2026-07-30: 近戰專用擴散 / 法師保命 / 坦克衝刺 /
      // 射手百分比傷害). See sim/content/requirement.ts for the axes and why
      // `role` is not one of them.
      //
      // EVALUATED AGAINST `owner`, WHICH IS ALSO THE FIX FOR AURAS. `owner` is
      // whoever CARRIES this source — the item holder for an item passive, and
      // the ALLY STANDING IN THE RADIUS for a hook projected by an `auras`
      // block (auraSystem attaches the payload to the recipient's own
      // `sources`). So one field spells both 「近戰專用」 and 「周圍的近戰友軍」.
      //
      // ORDER IS LOAD-BEARING: this runs BEFORE the internal-cooldown gate and
      // BEFORE the proc roll, so a BLOCKED clause costs its carrier nothing —
      // no ICD burned, no `world.rng` draw consumed. Gating after the roll would
      // make a melee-only proc silently eat the rng stream on every ranged
      // champion's attack, which is both a wasted proc and a determinism trap
      // for anyone reasoning about the seed. `scale` is a pure function of world
      // state, so every replica takes the identical branch.
      //
      // Absent `requires` → scale 1 → both lines below are exact no-ops, which
      // is why no pre-existing hook changes behaviour.
      const scale = requirementScale(world, owner, hook.requires);
      if (scale === 0) continue;

      // Internal cooldown.
      //
      // `combatEnv.itemCooldown` (#189) scales this and ONLY this, and only for
      // an ITEM source: owner asked for 道具冷卻 to be tunable independently of
      // the ability `cooldown` factor, which multiplies ability cast cooldowns
      // in abilities/abilitySystem.ts and has never touched an item.
      //
      // The kind check is what keeps the knob honest — champion passives,
      // augments, auras and timed buffs all reach this same line, and scaling
      // their ICDs from a factor labelled 道具冷卻 in the console would be a
      // number that does not do what it says. Shipped at 1.0, so every existing
      // hook keeps its exact pre-#189 cadence.
      if (hook.internalCooldown) {
        const factor = src.kind === "item" ? world.combatEnv.itemCooldown : 1;
        const icdTicks = Math.round((hook.internalCooldown * factor) / world.dt);
        if (world.tick - src.hookLastFired[hi]! < icdTicks) continue;
      }
      // proc chance (WC3 Hbh1/Ocr1/War1 …) — seeded rng, so a replay of the
      // same seed rolls identically. A failed roll leaves the ICD clock alone.
      if (hook.chance !== undefined && !world.rng.chance(hook.chance)) continue;

      // 觸發條件 (owner 2026-07-30 「on-attack by condition」). See
      // sim/content/condition.ts — the whole model, both determinism decisions
      // and the human-readable renderer live there.
      //
      // ORDER, AND WHY IT IS HERE AND NOT ANYWHERE ELSE:
      //
      //   · AFTER the `requires` class gate and AFTER the internal-cooldown
      //     gate, because both of those are rng-FREE and a condition tree is
      //     not. A melee-only clause on a ranged champion, or a clause still on
      //     cooldown, must cost that carrier nothing — no draw, no stream
      //     movement — for the same reason `requires` is gated before the proc
      //     roll: otherwise every ranged champion's every swing silently
      //     advances the seed on a proc that can never fire.
      //   · AFTER the legacy `chance` roll, so the WC3 proc column keeps its
      //     exact pre-existing draw position and every ported passive's stream
      //     is byte-identical to before this field existed. A condition tree
      //     draws AFTER it, never before.
      //   · BEFORE `hookLastFired`, so a condition that does not hold does NOT
      //     burn the internal cooldown — the same WC3 semantics a failed proc
      //     roll already has ("a failed proc does not consume the cooldown").
      //
      // `target` is passed through as the condition's 敵人 subject: absent on an
      // entity-less event, where every `subject:"target"` leaf reads FALSE by
      // design (condition.ts DECISION 2).
      if (!evaluateCondition(world, hook.condition, { self: owner, ...(target !== undefined ? { target } : {}) })) {
        continue;
      }
      src.hookLastFired[hi] = world.tick;

      const resolveAgainst =
        hook.target === "self" || target === undefined ? [owner] : [target];
      runEffects(scaleEffects(hook.effects, scale), {
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
