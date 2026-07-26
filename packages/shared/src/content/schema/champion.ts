/** champion@1 — mirrors `ChampionDef` in sim/content/defs.ts (abilities embedded). */
import { z } from "zod";
import type { AbilityId, ChampionId, ItemId } from "../../ids";
import {
  zAlpha,
  zCoreAbilitySlot,
  zIdFor,
  zPartialStatBlock,
  zRef,
  zStatModifier,
  zTintRgb,
} from "./common";
import { zHookDef } from "./effect";
import { zAbilityDef, zHitFeel } from "./ability";

/**
 * Per-level numbers off a WC3 ability, keyed by the LEVEL as a string ("1".."4").
 * A MAP, not an array, because the source really is sparse: `A0VG 90-002 超進化!
 * 妙蛙花` only defines levels 1 and 4, and an array would have to invent the
 * holes.
 */
const zPerLevelSeconds = z.record(z.string().regex(/^[1-9]\d?$/), z.number().nonnegative());

/**
 * 變身 — the base⇄alternate FORM LINK, recovered from the source map's WC3
 * Metamorphosis fields `Eme1` (normal-form unit) / `Emeu` (alternate-form unit).
 *
 * DATA ONLY (task #249). Nothing in the sim reads this yet: it records WHICH
 * champion doc is the other half of a transform and WHICH ability performs it,
 * so the mechanic (task #119) can be built without another trip into the .w3x.
 * The owner has not yet decided the auto-trigger conditions for the four
 * passive-slot transforms, so no behaviour is wired here on purpose.
 *
 * WHY IT MATTERS EVEN AS PURE DATA: all 26 transforms in the map are a COMPLETE
 * second unit definition (own model, scale, movement speed, ability list), and
 * the importer dropped `Eme1`/`Emeu` (task #56 — it whitelists ~30 of 180 w3u
 * field codes). Nothing downstream could tell a hero from its transformed body,
 * so 10 of the 50 first-open-roster slots shipped the ALTERNATE form as if it
 * were the hero — including 草泥馬's lying-down 臥 body (w3x movement speed 0).
 *
 * BOTH halves of a pair carry the SAME w3x facts and differ only in `role`, so
 * a doc can be read on its own without loading its counterpart.
 */
const zTransformLink = z
  .object({
    /**
     * Which half of the pair THIS doc is. `"base"` = the hero a player picks;
     * `"alternate"` = the transformed body, which is NOT independently
     * selectable — it is reached only by casting the transform ability
     * (owner ruling 2026-07-26: 「換成本體，變身態改由技能觸發」).
     */
    role: z.enum(["base", "alternate"]),
    /**
     * The champion doc on the OTHER side of the link. ABSENT when that form was
     * never imported — four alternate bodies (H00W 26洨者狀態, O030 30變態紳士,
     * N01B 40萬解, E010 70紮根) still have no champion doc, and an absent
     * counterpart is a recovered fact, not a TODO. The rawcodes below always
     * name both halves, imported or not.
     */
    counterpartId: zRef<ChampionId>("champions").optional(),
    /** `Eme1` — the rawcode of the NORMAL-form unit in war3map.w3u. */
    normalUnitRawcode: z.string().min(4).max(4),
    /** `Emeu` — the rawcode of the ALTERNATE-form unit in war3map.w3u. */
    alternateUnitRawcode: z.string().min(4).max(4),
    /** The transform ability, as the map's own w3a entry describes it. */
    triggerAbility: z
      .object({
        /** w3a rawcode, e.g. "A0VG". The link's provenance, not a content ref. */
        rawcode: z.string().min(4).max(4),
        /** The map's ability name, `NN-0X …` per the task #11 convention. */
        name: z.string().min(1).optional(),
        /**
         * `ahdu` (HERO duration) per level, in seconds. ABSENT = the form does
         * not time out: `A0DZ 20-01 風王結界` and `A0O6 70-00 紮根` are TOGGLES
         * (the body persists until re-cast) and `Aphx 61-00 百連我殺` is a
         * death-state morph (`adur` 0.01s — an instant swap). Three of 26.
         */
        durationSec: zPerLevelSeconds.optional(),
        /** `acdn` per level, in seconds. Absent on the two toggles. */
        cooldownSec: zPerLevelSeconds.optional(),
      })
      .strict(),
  })
  .strict();

export const zChampionDef = z
  .object({
    id: zIdFor<ChampionId>(),
    name: z.string().min(1),
    /**
     * Human-readable champion lore/description recovered from the w3x source
     * (WC3 color codes stripped, line breaks normalized). Optional metadata —
     * absent when the map yields no text. Not consumed by the sim; drives
     * editor/UI display.
     */
    description: z.string().optional(),
    role: z.string().min(1),
    attackType: z.enum(["melee", "ranged"]),
    modelKey: zRef("models"),
    baseStats: zPartialStatBlock,
    /** additive per level beyond 1 */
    growth: zPartialStatBlock,
    /** ranged auto-attack projectile speed (GGD units/sec) */
    missileSpeed: z.number().positive().optional(),
    /** wind-up (seconds) before a basic attack's hit lands */
    attackDamagePoint: z.number().min(0).optional(),
    /** base attack-cadence multiplier (default 1.0) */
    baseAttackTime: z.number().positive().optional(),
    /**
     * Optional BASIC-ATTACK hit-feel override (task #133). Applies to every
     * auto this champion lands (origin "basic"); absent = the sim's
     * damage-derived default. Per-ability feel lives on each ability's own
     * `hitFeel`. Additive & all-optional — see `zHitFeel`.
     */
    hitFeel: zHitFeel.optional(),
    abilities: z
      .object({ Q: zAbilityDef, W: zAbilityDef, E: zAbilityDef, R: zAbilityDef })
      .strict(),
    /**
     * Optional per-hero "EX 技能" — a standalone ability@1 (slot "EX") unlocked
     * at the arena EX-unlock point (WC3 level 30). Absent = this hero has no EX
     * skill (faithful: not every hero has one). Ref into the abilities collection.
     */
    exAbility: zRef<AbilityId>("abilities").optional(),
    /**
     * The per-hero 天生技 / PASSIVE — the SIXTH slot, owned from level 1.
     *
     * A standalone ability@1 with `slot: "PASSIVE"`, id `<championId>.passive`,
     * resolved through the abilities collection exactly like `exAbility`. The
     * source map codes it `NN-00` (NN = the hero 編號) in the WC3 hero unit's
     * non-learnable `abilities` list; the importer dropped it, so every
     * champion shipped with five slots instead of six.
     *
     * Absent = this hero genuinely has no NN-00 in the map. Exactly three do
     * not: godie-h02n 腦包英雄 and godie-u01q 測試英雄 (no abilities at all) and
     * godie-ogld 美白大法師 (has 72-01..04 + 72-002, but no 72-00 exists
     * anywhere in the map). Absence is a recovered fact, never a TODO.
     *
     * NOT to be confused with `passive` below — that is a legacy per-champion
     * hook/modifier block on 7 docs, not a slot.
     */
    passiveAbility: zRef<AbilityId>("abilities").optional(),
    /**
     * w3x portrait icon extracted from the map archive (task #33), path
     * relative to content/, e.g. "assets/icons/champions/godie-e001.png".
     * Absent = Blizzard STOCK art or no WC3 source — client fallback rendering.
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
    /**
     * Per-champion vertex-colour MULTIPLY, `[r,g,b]` 0..1 (see `zTintRgb`).
     * Ported from the w3x unit's `uclr/uclg/uclb` (or the inherited
     * `UnitUI.slk` default). ABSENT = untinted; we never write `[1,1,1]`.
     *
     * WHY IT LIVES ON THE CHAMPION AND NOT ON `model@1`: `modelKey` is a
     * many-to-one ref — `champ.sela` is shared by 18 champion docs and
     * `champ.thorne` by 10 — while the WC3 tint is a per-UNIT art field. A
     * tint on the model doc would repaint every champion sharing the mesh.
     * `model@1.teamTintMaterials` stays the model's business ("which
     * materials accept a tint"); this field is the champion's ("what colour").
     * It also has to live here for the blizzard-overlay champions (incl.
     * 海克力斯 Berserker), whose ModelDoc is SYNTHESIZED at runtime from
     * `data/blizzard-overlay/MANIFEST.json` and has no doc on disk to carry it.
     */
    tint: zTintRgb.optional(),
    /** Opacity 0..1; absent == 1 (opaque). See `zAlpha` for the WC3 inversion. */
    alpha: zAlpha.optional(),
    passive: z
      .object({
        name: z.string().min(1),
        hooks: z.array(zHookDef).optional(),
        modifiers: z.array(zStatModifier).optional(),
      })
      .strict()
      .optional(),
    /**
     * 變身 form link — see `zTransformLink`. Present on both halves of each of
     * the 26 w3x transform pairs; absent on every champion that has no second
     * form. DATA ONLY: no behaviour reads it yet.
     */
    transform: zTransformLink.optional(),
    /** AI hints (Q/W/E/R only; EX is auto-unlocked, never in skill order) */
    skillOrder: z.array(zCoreAbilitySlot),
    buildPriority: z.array(zRef<ItemId>("items")),
    tags: z.array(z.string()),
  })
  .strict();

export const zChampionDoc = zChampionDef
  .extend({ schema: z.literal("champion@1") })
  .strict()
  .superRefine((doc, ctx) => {
    for (const slot of ["Q", "W", "E", "R"] as const) {
      if (doc.abilities[slot].slot !== slot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["abilities", slot, "slot"],
          message: `embedded ability slot must be "${slot}"`,
        });
      }
    }
  });

export type ChampionDoc = z.infer<typeof zChampionDoc>;
