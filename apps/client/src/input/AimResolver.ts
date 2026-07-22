/**
 * AimResolver — maps an ability slot's castType (from the SHARED ability defs)
 * plus the current cursor/self state onto the exact CastTarget shape the sim
 * consumes. Quick-cast semantics: resolve at the instant of keydown.
 * Pure TS — unit-testable (client-05).
 */
import { asEntityId } from "@ggd/shared/ids";
import type { AbilitySlot, CastTarget, Command } from "@ggd/shared/sim/intents";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import { add, clampLen, normalize, sub, type Vec2 } from "@ggd/shared/sim/math/vec2";

export type AimAbility = Pick<AbilityDef, "castType" | "range">;

export interface AimContext {
  selfPos: Vec2;
  cursorGround: Vec2;
  /** entity under the cursor (already filtered to valid targets), if any */
  hoveredEntityId?: number | null;
}

/** Resolve a castType into a CastTarget; null = no valid target (don't send). */
export function resolveCastTarget(ability: AimAbility, ctx: AimContext): CastTarget | null {
  switch (ability.castType) {
    case "self":
      return { type: "self" };
    case "skillshot":
    case "dash": {
      const dir = normalize(sub(ctx.cursorGround, ctx.selfPos));
      if (dir.x === 0 && dir.z === 0) return null;
      return { type: "dir", dir };
    }
    case "ground": {
      // clamp to range client-side (LoL behavior; the server clamps too)
      const off = clampLen(sub(ctx.cursorGround, ctx.selfPos), ability.range);
      return { type: "point", point: add(ctx.selfPos, off) };
    }
    case "targeted": {
      if (ctx.hoveredEntityId === null || ctx.hoveredEntityId === undefined) return null;
      return { type: "entity", entityId: asEntityId(ctx.hoveredEntityId) };
    }
  }
}

/** Build the exact castAbility Command for a slot, or null if untargetable. */
export function buildCastCommand(slot: AbilitySlot, ability: AimAbility, ctx: AimContext): Command | null {
  const target = resolveCastTarget(ability, ctx);
  return target ? { kind: "castAbility", slot, target } : null;
}
