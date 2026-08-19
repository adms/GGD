import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zEvasion =
z
  .object({
    kind: z.literal("evasion"),
    ...EFFECT_COMMON_SHAPE,
    /**
     * 0..1 BEFORE the ceiling. Both dodge channels are capped at
     * `effectiveCap(statCaps, Stat.Evasion)` — shipping 0.8, editable on the
     * 後台「屬性上限」page. Authoring 1 here does NOT buy invulnerability.
     * (It did until 2026-07-30 on the ability channel; see combat/evasion.ts.)
     */
    chance: z.number().min(0).max(1),
    durationSec: z.number().positive().max(60),
    applyTo: z.enum(["self", "target"]).optional(),
    /**
     * DECISION POINT — dodge ABILITY damage too? Default false = WC3
     * `Evasion` fidelity (basic attacks only), today's shipping behaviour.
     */
    dodgesAbilities: z.boolean().optional(),
    /**
     * DECISION POINT — dodge `type: "true"` damage too? Default false, so
     * the arena fire-ring burn (#270) stays undodgeable unless opted in.
     */
    dodgesTrueDamage: z.boolean().optional(),
  })
  .strict();
