/** ability@1 — mirrors `AbilityDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { AbilityId } from "../../ids";
import { zAbilitySlot, zIdFor, zRef } from "./common";
import { zAbilityPassive, zEffectDef } from "./effect";

export const zCastType = z.enum(["targeted", "skillshot", "ground", "self", "dash"]);

/** Embedded form (champion.abilities[slot]) — no schema discriminator. */
export const zAbilityDef = z
  .object({
    id: zIdFor<AbilityId>(),
    name: z.string().min(1),
    /**
     * Human-readable ability tooltip recovered from the w3x source (WC3 color
     * codes stripped, line breaks normalized). Optional metadata — absent when
     * the map yields no text. Not consumed by the sim; drives editor/UI display.
     */
    description: z.string().optional(),
    slot: zAbilitySlot,
    castType: zCastType,
    maxRank: z.number().int().min(1).max(6),
    /** per rank (index rank-1), seconds */
    cooldown: z.array(z.number().min(0)).min(1),
    manaCost: z.array(z.number().min(0)).min(1),
    range: z.number().min(0),
    /** skillshot width or AoE radius */
    radius: z.number().positive().optional(),
    targetsEnemies: z.boolean().optional(),
    effects: z.array(zEffectDef),
    /**
     * PERMANENT passive granted while this ability's rank > 0, rank-indexed
     * (WC3 authors passive columns per ability level). An ability with a
     * `passive` and an EMPTY `effects` array is passive-only and can never be
     * cast — which is what the native `Cool = 0` family (Critical Strike
     * `AOcr`, Bash `AHbh`, the aura family, the `Aamk` attribute buttons)
     * actually is. Before this field existed every one of them shipped as an
     * activated `self` + `applyBuff` with an invented cooldown and mana cost.
     */
    passive: zAbilityPassive.optional(),
    vfxKey: zRef("vfx", { soft: true }).optional(),
    /** cast time (seconds) before effects fire; default 0 = instant */
    castTimeSec: z.number().min(0).optional(),
    /** root the caster for the cast duration (default true) */
    rootWhileCasting: z.boolean().optional(),
    /**
     * w3x button icon extracted from the map archive (task #33), path relative
     * to content/, e.g. "assets/icons/abilities/godie-e001.q.png". Absent =
     * the source used Blizzard STOCK art — client keeps its letter-tile
     * fallback rendering. Applies embedded (Q/W/E/R) AND standalone (.ex).
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
  })
  .strict();

export const zAbilityDoc = zAbilityDef.extend({ schema: z.literal("ability@1") }).strict();

export type AbilityDoc = z.infer<typeof zAbilityDoc>;
