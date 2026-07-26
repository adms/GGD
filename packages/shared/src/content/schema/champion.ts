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
    /**
     * The RAW stat card. Since #248 the eight attribute-derived rows hold the
     * source map's own numbers, WITHOUT the 三圍 term — `maxHealth` on
     * godie-e001 is the map's 150, and the sim adds `25 × STR` on top of it
     * (sim/stats/attributes.ts). Read it through `championStatBase`, never
     * directly, or a stat table shows 150 where the hero really has 575.
     */
    baseStats: zPartialStatBlock,
    /**
     * Additive per level beyond 1 — the per-hero DESIGNER KNOB, and since #248
     * a deliberate SECOND source alongside `attributes.*Growth`:
     *
     *     stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
     *
     * The two are summed, not reconciled. That is not double-counting: the
     * attribute term carries the w3x-faithful part of the curve, `growth`
     * carries the tuning laid on top, so a hero's progression is not locked to
     * his three attributes (owner ruling on #248 —「growth 區塊就是重複來源
     * => 本來就可以重複沒有衝突」). `championGrowthLayers.test.ts` pins the
     * three-layer sum so a reader cannot silently apply only two of the three.
     *
     * `growth.mr` is simply the row where the attribute term is zero: Warcraft
     * III has no magic-resistance attribute, so 魔抗 is growth-only by nature,
     * not by omission.
     */
    growth: zPartialStatBlock,
    /**
     * 三圍 — STRENGTH / AGILITY / INTELLIGENCE + per-level growths (task #248),
     * recovered from the source map by walking each unit's `base` chain into
     * the Blizzard stock tables. `source` is provenance: "w3x" for the 111
     * champions the map can answer for, "authored" for the three it cannot
     * (godie-zombiex, sela, thorne), whose numbers were chosen to reproduce
     * their shipped level-1 sheet exactly.
     *
     * OPTIONAL in the schema, REQUIRED in the shipped tree: a doc without it
     * simply gets no attribute term (the pre-#248 law), which keeps hand-written
     * test fixtures valid, and `championAttributes.test.ts` asserts every real
     * champion has one so the roster can never silently lose it.
     */
    attributes: z
      .object({
        str: z.number().finite(),
        agi: z.number().finite(),
        int: z.number().finite(),
        strGrowth: z.number().finite(),
        agiGrowth: z.number().finite(),
        intGrowth: z.number().finite(),
        primary: z.enum(["STR", "AGI", "INT"]),
        source: z.enum(["w3x", "authored"]),
      })
      .strict()
      .optional(),
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
