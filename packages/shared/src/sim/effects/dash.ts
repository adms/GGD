/**
 * `dash` — forced linear displacement of the CASTER, integrated with collision
 * by MovementSystem.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { startDash } from "../systems/MovementSystem";
import { normalize, sub } from "../math/vec2";

export const dashEffect: EffectKindSpec<"dash"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const t = world.transform.get(ctx.caster);
    if (!t) return;
    const dir =
      e.mode === "toPoint" && ctx.point
        ? normalize(sub(ctx.point, t.pos))
        : ctx.direction ?? t.facing;
    startDash(world, ctx.caster, dir, e.speed, e.maxDistance);
  },
};
