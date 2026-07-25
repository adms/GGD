/** ability@1 — mirrors `AbilityDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { AbilityId } from "../../ids";
import { zChampionAbilitySlot, zIdFor, zInnateKind, zRef, zTintRgb } from "./common";
import { zAbilityPassive, zEffectDef } from "./effect";

export const zCastType = z.enum(["targeted", "skillshot", "ground", "self", "dash"]);

/**
 * Optional per-source HIT-FEEL override (task #133). Additive & ALL-OPTIONAL:
 * a champion basic-attack or an ability may set any subset to override the
 * damage-derived default that `applyImpact` (sim/combat/damage.ts) otherwise
 * computes for that hit; unset fields fall back to the default (scaled by the
 * hit's damage tier). MIRRORS `HitFeelInput` in `sim/combat/hitFeel.ts` — keep
 * the two in sync (same discipline as defs.ts mirroring the schemas). The
 * gameplay trio (hitstop/hitstun/knockbackMag) tunes the deterministic sim
 * reaction; the rest are cosmetic hints the client consumes. Bounds match the
 * sim's override caps so authored content can't stall the match.
 */
export const zHitFeel = z
  .object({
    /** freeze ticks for BOTH fighters (default: impact-derived). */
    hitstopTicks: z.number().int().min(0).max(20).optional(),
    /** victim-only action-lock ticks (clamped >= the resolved hitstop). */
    hitstunTicks: z.number().int().min(0).max(30).optional(),
    /** push distance in GGD units (default: impact/type-derived). */
    knockbackMag: z.number().min(0).max(8).optional(),
    /** camera shake amplitude hint (default scales with tier). */
    shakeMag: z.number().min(0).max(2).optional(),
    /** shake character (default: directional, omni on crit/EX). */
    shakeStyle: z.enum(["directional", "omni"]).optional(),
    /** hit-spark identity (default derived from tier/type/block). */
    sparkKind: z.enum(["hit", "heavy", "counter", "block", "magic", "ice"]).optional(),
    /**
     * Victim body-flash colour [r,g,b] 0..1 — the ability's ELEMENT tint
     * (holy gold, ice blue, fire orange…). Unset = the client's measured
     * damage-type palette (physical/true red, magic magenta), which is what
     * every basic attack uses.
     *
     * AUTHORING NOTE: pale/near-white values are automatically saturated by
     * the client (`legibleFlashColor` in render/combatFeedback.ts) before they
     * are drawn. The overlay blends with ALPHA_COMBINE, so a washed-out colour
     * is literally invisible on a pale model — the guard keeps your HUE and
     * deepens it. Author the hue you want; don't pre-brighten it.
     */
    flashColor: zTintRgb.optional(),
    /**
     * Victim body-flash duration ms (default scales with tier: 110–185).
     * Ceiling is 260, not "some big number": the flash MUST clear before the
     * next hit or back-to-back autos strobe (收尾精準). Was max 1000, which
     * let content author a value the channel could not honour — and, until
     * this was wired up, could not honour anything at all.
     */
    flashMs: z.number().min(30).max(260).optional(),
    /** one-shot directional camera kick magnitude (default scales with tier). */
    camKick: z.number().min(0).max(2).optional(),
    /** cosmetic client-side EX freeze ticks (default: EX hits only). */
    exFreeze: z.number().int().min(0).max(30).optional(),
  })
  .strict();

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
    /**
     * Same tooltip text as `description`, but with the w3x inline colour codes
     * recovered as SEMANTIC ROLE markup — `[c=role]…[/c]`, role ∈
     * damage|physical|duration|heal|mana|magic|generic (task #114). The
     * importer classifies each `|cAARRGGBB…|r` span into a role and the client
     * renders role→one normalised colour, so the inconsistent source colouring
     * reads uniformly across game tooltips / codex / editor. Additive and
     * optional: absent until the importer re-runs, and the render path treats a
     * plain string (no markup) as an un-tagged paragraph, so nothing breaks in
     * the interim. `description` stays the colour-STRIPPED plain text (kept so
     * the economy tooltip regexes keep matching bare numbers).
     */
    descriptionRoles: z.string().optional(),
    slot: zChampionAbilitySlot,
    /**
     * ONLY on `slot: "PASSIVE"` docs — whether this level-1 innate (天生技) is a
     * permanent self-buff ("passive") or a real cast with a cooldown
     * ("active"). See `zInnateKind`. Required when slot is "PASSIVE", rejected
     * otherwise (enforced by `zAbilityDoc`'s superRefine below), so a consumer
     * can branch on it without also having to re-derive the slot.
     */
    innateKind: zInnateKind.optional(),
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
    /**
     * WC3-derived per-ability cast sound cue — an audio-map SFX key (e.g.
     * "wc3.nocute"), recovered from the source map's gg_snd bindings
     * (tools/w3x-import SFX_BINDINGS.json). The sim stamps it on the
     * `abilityCast` event and the client plays it INSTEAD of the generic cast
     * voice. Absent = generic castBegin/abilityCast handling. Plain string,
     * not a zRef: the audio map is client config, not a content collection.
     */
    sfxKey: z.string().min(1).optional(),
    /** cast time (seconds) before effects fire; default 0 = instant */
    castTimeSec: z.number().min(0).optional(),
    /** root the caster for the cast duration (default true) */
    rootWhileCasting: z.boolean().optional(),
    /**
     * RECOVERY (後搖) — seconds of commitment AFTER the ability resolves, during
     * which the caster may not cast or basic-attack. Absent = the sim's
     * `DEFAULT_RECOVERY_SEC` (0.6 s), NOT zero — see sim/abilities/
     * abilityRecovery.ts for why the default is live rather than opt-in.
     *
     * A LANDED HIT CANCELS IT: damage on >= 1 enemy from this ability frees the
     * caster on the same tick, so combos flow off a connect and a whiff is the
     * only thing that costs. Abilities that cannot whiff (self-casts, dashes)
     * never observe it. Capped at MAX_RECOVERY_SEC (2 s) by the sim.
     */
    recoverySec: z.number().min(0).max(2).optional(),
    /**
     * Whether the recovery also ROOTS the caster (default false). Startup
     * already hard-roots, so the default deliberately locks OUTPUT only (the
     * DOTA/LoL cast-backswing shape): the opponent buys "he can't answer",
     * not "he's a statue". A heavy ultimate can opt into the full lock.
     */
    recoveryRoots: z.boolean().optional(),
    /**
     * w3x button icon extracted from the map archive (task #33), path relative
     * to content/, e.g. "assets/icons/abilities/godie-e001.q.png". Absent =
     * the source used Blizzard STOCK art — client keeps its letter-tile
     * fallback rendering. Applies embedded (Q/W/E/R) AND standalone (.ex).
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
    /**
     * Optional per-ability hit-feel override (task #133). Absent = the sim's
     * damage-derived default. Applies to every hit this ability lands.
     */
    hitFeel: zHitFeel.optional(),
  })
  .strict();

/**
 * `innateKind` and `slot: "PASSIVE"` are two halves of the same fact, so they
 * must never disagree: a PASSIVE doc without a kind leaves the sim and the HUD
 * guessing, and a kind on a Q/W/E/R/EX doc is a mis-edit that would read as an
 * innate. Enforced on the STANDALONE doc only — the embedded champion copies
 * are already pinned to Q/W/E/R by `zChampionDoc`.
 */
function refineInnate(
  doc: { slot: string; innateKind?: string; effects: unknown[] },
  ctx: z.RefinementCtx,
): void {
  if (doc.slot === "PASSIVE") {
    if (doc.innateKind === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["innateKind"],
        message: 'slot "PASSIVE" requires innateKind ("passive" | "active")',
      });
    } else if (doc.innateKind === "active" && doc.effects.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects"],
        message: 'innateKind "active" means a real cast — it must declare effects',
      });
    }
  } else if (doc.innateKind !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["innateKind"],
      message: 'innateKind is only meaningful on slot "PASSIVE"',
    });
  }
}

export const zAbilityDoc = zAbilityDef
  .extend({ schema: z.literal("ability@1") })
  .strict()
  .superRefine(refineInnate);

export type AbilityDoc = z.infer<typeof zAbilityDoc>;
