/**
 * `cycleBuff` — 輪替增益: one rotation, one step per application, all steps able
 * to be live at once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INDEX IS DERIVED FROM ABSOLUTE EXPIRY TICKS, NOT FROM A COUNTER
 * ─────────────────────────────────────────────────────────────────────────────
 * CLAUDE.md 硬性技術約束: 「到期一律用**絕對 tick**，不是遞減計數器」, and the
 * lane brief adds 「用絕對 tick 算輪到第幾個，不要用遞減計數器或可變狀態」.
 *
 * A naive rotation keeps an integer per entity ("which one is next"). That is
 * un-derivable state: it has to be spawned, reset between rounds, carried by a
 * replay, and it desyncs the moment two replicas disagree about one proc. This
 * handler keeps NONE. Each step owns its own `ModifierSource`, keyed
 * `buff:cycle:<cycleKey>:<i>`, and a source already remembers the ABSOLUTE tick
 * it dies on. So "whose turn is it" is a pure read of world state:
 *
 *   ① the first step (in AUTHORED ORDER) with no live source     → that one
 *   ② every step live → the one with the SMALLEST `expiresAtTick` → that one
 *      (ties broken by authored order, so the answer is total)
 *
 * Four 1-second steps and a swing every ~0.5 s therefore go AP → AD → 防禦 →
 * 魔抗 → AP → …, and 「可同時存在」 is not a second feature: it is what happens
 * when four independent sources each carry their own deadline.
 *
 * ⚠️ ①'s "no live source" is `expiresAtTick <= world.tick`, matching what
 * `fireHooks`/`recomputeStats` treat as expired, so a step that dies on THIS
 * tick is already "free" and is picked before a step that dies next tick. Using
 * `< world.tick` would leave a one-tick window where the rotation stalls on the
 * same step twice.
 *
 * PURITY: pure reads + `attachSource`. No rng (the rotation is deterministic by
 * construction — that is the point), no clock, no trig, no `**`.
 */
import type { EffectKindSpec } from "./effectKind";
import { attachSource } from "../stats/statPipeline";
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";

/** `buff:cycle:<cycleKey>:<i>` — the id both the picker and the writer use. */
export function cycleStepId(cycleKey: string, index: number): string {
  return `buff:cycle:${cycleKey}:${index}`;
}

/**
 * Which step is next on `target`. EXPORTED because the guard asserts the
 * rotation itself, and re-deriving the rule inside the test would be 失敗形態
 * ⑤ (「被測的不是出貨的那個」).
 */
export function nextCycleStep(
  world: SimWorld,
  target: EntityId,
  cycleKey: string,
  stepCount: number,
): number {
  const sc = world.stats.get(target);
  if (!sc || stepCount <= 0) return 0;
  let oldest = 0;
  let oldestExpiry = Number.POSITIVE_INFINITY;
  for (let i = 0; i < stepCount; i++) {
    const id = cycleStepId(cycleKey, i);
    const src = sc.sources.find((s) => s.id === id);
    const expiry = src?.expiresAtTick;
    // ① a step that is absent (or already expired) is the next one, full stop.
    if (src === undefined || expiry === undefined || expiry <= world.tick) return i;
    // ② otherwise remember the one closest to dying — that continues the ring.
    if (expiry < oldestExpiry) {
      oldestExpiry = expiry;
      oldest = i;
    }
  }
  return oldest;
}

export const cycleBuffEffect: EffectKindSpec<"cycleBuff"> = {
  apply(e, ctx) {
    const { world } = ctx;
    if (e.steps.length === 0) return;
    const subjects = e.applyTo === "target" ? ctx.targets : [ctx.caster];
    for (const subject of subjects) {
      if (!world.stats.get(subject)) continue;
      const i = nextCycleStep(world, subject, e.cycleKey, e.steps.length);
      const step = e.steps[i]!;
      attachSource(world, subject, {
        id: cycleStepId(e.cycleKey, i),
        kind: "buff",
        modifiers: step.modifiers,
        // ABSOLUTE tick, like every other deadline in the sim.
        expiresAtTick: world.tick + Math.round(step.duration / world.dt),
      });
      // Same discrete 增益 cue `applyBuff` fires, so a rotation step sounds like
      // the buff it is instead of being silent.
      world.emit("buffApply", { source: ctx.caster, target: subject, origin: ctx.origin });
    }
  },
};
