/**
 * `spawnVfx` — the WC3 "dummy effect unit" idiom as a one-shot cosmetic event.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";

export const spawnVfxEffect: EffectKindSpec<"spawnVfx"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // Cosmetic only: resolve a world point and emit a vfxSpawn event for the
    // client's VfxSystem. No world mutation, no rng → deterministic (two
    // seeded runs emit identical events from identical transforms).
    const at = e.at ?? "self";
    let pos: { x: number; z: number } | undefined;
    if (at === "point") {
      pos = ctx.point;
    } else if (at === "target") {
      const tid = ctx.targets[0];
      pos = (tid !== undefined ? world.transform.get(tid)?.pos : undefined) ?? ctx.point;
    }
    if (!pos) pos = world.transform.get(ctx.caster)?.pos;
    if (!pos) return;
    world.emit("vfxSpawn", {
      vfxId: e.vfxId,
      x: pos.x,
      z: pos.z,
      caster: ctx.caster,
      ...(e.durationSec !== undefined ? { durationSec: e.durationSec } : {}),
    });
  },
};
