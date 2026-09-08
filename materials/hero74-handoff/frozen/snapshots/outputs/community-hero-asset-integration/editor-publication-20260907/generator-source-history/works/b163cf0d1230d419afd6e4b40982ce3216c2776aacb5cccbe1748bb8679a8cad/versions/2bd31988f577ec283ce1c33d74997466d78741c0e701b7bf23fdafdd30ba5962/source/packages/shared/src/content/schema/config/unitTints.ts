import { z } from "zod";
import { zAlpha, zId, zRef, zTintRgb } from "../common";

/**
 * config.unit-tints@1 — the w3x VERTEX-COLOUR PORTING LEDGER
 * (`config/unit-tints.json`, task #49).
 *
 * The champion-facing half of the port lives on the champion docs themselves
 * (`champion.tint` / `champion.alpha`) — that is what the renderer reads. This
 * doc is the COMPLETE extract, and exists because the map tints things GGD has
 * no collection for:
 *
 *   • `units` — every w3x unit whose effective art colour is non-neutral,
 *     keyed by its 4-char rawcode. The 20 that became champions carry
 *     `championId` and MUST agree with that champion doc (regression-tested);
 *     the other 32 are creeps/summons/bosses with no GGD doc yet, and this is
 *     the only place their colour survives until they are modelled.
 *   • `transient` — runtime `SetUnitVertexColorBJ` states a CHAMPION takes on
 *     during a buff (Berserker's red rage) and the restore that ends it. Not
 *     yet driven by the sim; recorded with its `war3map.j` line so the buff
 *     phase can wire it without re-reading the map. Two restores are flagged
 *     `erasesStaticTint` — original-map BUGS that reset the hero to white and
 *     destroy its identity tint for the rest of the match; the port must
 *     restore to `champion.tint`, never to white.
 *
 * Nothing here is read by the sim. Dummy-effect/missile unit tints are
 * deliberately OUT of scope (task #50 owns per-invocation VFX art params).
 */
export const zUnitTintEntry = z
  .object({
    /** the champion doc this w3x unit became; absent = no GGD doc yet */
    championId: zRef("champions").optional(),
    /** the unit's map name (context for a bare rawcode) */
    name: z.string().min(1),
    /** effective vertex-colour multiply; see `zTintRgb` */
    tint: zTintRgb.optional(),
    /** effective opacity; absent = 1 (every static w3u entry is opaque) */
    alpha: zAlpha.optional(),
    /**
     * `w3u-static`  — explicit `uclr/uclg/uclb` mods in `war3map.w3u`;
     * `w3u-base-inherited` — no mods of its own; the colour comes from the
     *                   entry's BASE, which is itself a `war3map.w3u` entry
     *                   (custom OR original table). #49 had no such step and
     *                   lost `U00L` (北斗之鼠) because of it — see task #263;
     * `slk-inherited` — no mods anywhere in the w3u chain; the colour comes
     *                   from the stock `Units\UnitUI.slk` row (43 units here).
     */
    source: z.enum(["w3u-static", "w3u-base-inherited", "slk-inherited"]),
    /** where the number came from, in enough detail to re-derive it */
    evidence: z.string().min(1),
  })
  .strict();

export const zUnitTintState = z
  .object({
    /** champion that takes on this state */
    championId: zRef("champions"),
    /** JASS trigger function the call lives in */
    trigger: z.string().min(1),
    /** line in the UNPROTECTED `GoDieEX22s-src/raw/war3map.j` */
    line: z.number().int().positive(),
    /** what the state is (ability name / "restore") */
    note: z.string().min(1),
    tint: zTintRgb.optional(),
    alpha: zAlpha.optional(),
    /**
     * true = the ORIGINAL MAP restores to white here and permanently erases
     * the champion's static tint. Do NOT reproduce: restore to `champion.tint`.
     */
    erasesStaticTint: z.boolean().optional(),
  })
  .strict();

export const zConfigUnitTintsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.unit-tints@1"),
    /** w3x unit rawcode (4 chars, case-sensitive) -> permanent colour */
    units: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/, "w3x rawcode"), zUnitTintEntry),
    /** runtime buff-state colours, in `war3map.j` line order */
    transient: z.array(zUnitTintState),
  })
  .strict();
export type UnitTintEntry = z.infer<typeof zUnitTintEntry>;
export type UnitTintState = z.infer<typeof zUnitTintState>;
export type ConfigUnitTintsDoc = z.infer<typeof zConfigUnitTintsDoc>;
