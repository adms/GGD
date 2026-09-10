import { z } from "zod";
import { zStatModifier } from "../common";
import {
  CYCLE_BUFF_MAX_STEPS,
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zCycleBuff =
/**
 * cycleBuff — 輪替增益. See the `cycleBuff` member of `sim/effects/effect.ts`
 * for the model and `sim/effects/cycleBuff.ts` for why the rotation index is
 * DERIVED from absolute expiry ticks rather than kept in a counter.
 *
 * Both ends bounded, as always: `.min(2)` because a one-step "rotation" is
 * just `applyBuff` wearing a costume and authoring it here would hide a plain
 * buff behind a mechanic nobody would think to look at, and
 * `.max(CYCLE_BUFF_MAX_STEPS)` because every step is a live ModifierSource on
 * a rotating body.
 */
z
  .object({
    kind: z.literal("cycleBuff"),
    ...EFFECT_COMMON_SHAPE,
    /** namespace for the step source ids — two rings on one body must differ */
    cycleKey: z.string().min(1).max(48),
    applyTo: z.enum(["self", "target"]).optional(),
    steps: z
      .array(
        z
          .object({
            modifiers: z.array(zStatModifier).min(1),
            /**
             * ⚠️ FLOOR IS 0.067 s, NOT 0. `applyStatus`/`applyBuff` convert with
             * `Math.round(duration / dt)` at dt = 1/30, so anything at or under
             * 0.034 s rounds to 0 or 1 tick — both of which are blanks the
             * author cannot tell apart from a working buff. 0.067 s is the
             * shortest window the sim can actually deliver, the same floor
             * `tpl-teleport.travelSec` documents.
             */
            duration: z.number().min(0.067).max(60),
          })
          .strict(),
      )
      .min(2)
      .max(CYCLE_BUFF_MAX_STEPS),
  })
  .strict();
