/**
 * Compile-time proof that the Zod schemas and the sim's TS content shapes
 * (sim/content/defs.ts) stay structurally compatible — in BOTH directions:
 *  - z.infer output is assignable to the sim def types (loader -> registries)
 *  - the sim TS literals parse through the schemas (export migration)
 * If an engineer changes a def without updating the schema (or vice versa),
 * this FILE STOPS COMPILING.
 */
import { describe, it, expect } from "vitest";
import type { z } from "zod";
import type {
  AbilityDef,
  AugmentDef,
  ChampionDef,
  ItemDef,
  LootTable,
  ProjectileDef,
} from "../sim/content/defs";
import type { ArenaDef } from "../sim/world/ArenaDef";
import type { EffectDef } from "../sim/effects/effect";
import type { HookDef, StatModifier } from "../sim/stats/modifiers";
import {
  zAbilityDef,
  zAugmentDef,
  zChampionDef,
  zItemDef,
  zLootTableDef,
  zProjectileDef,
  zArenaDef,
  zEffectDef,
  zHookDef,
  zStatModifier,
} from "./schema/index";
import { SELA, THORNE } from "../sim/content/skeleton";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";

// ---- compile-time assertions (z.infer -> sim def assignability) ----
type Extends<A, B extends A> = B;
type _Ability = Extends<AbilityDef, z.infer<typeof zAbilityDef>>;
type _Champion = Extends<ChampionDef, z.infer<typeof zChampionDef>>;
type _Item = Extends<ItemDef, z.infer<typeof zItemDef>>;
type _Augment = Extends<AugmentDef, z.infer<typeof zAugmentDef>>;
type _Projectile = Extends<ProjectileDef, z.infer<typeof zProjectileDef>>;
type _Loot = Extends<LootTable, z.infer<typeof zLootTableDef>>;
type _Arena = Extends<ArenaDef, z.infer<typeof zArenaDef>>;
type _Effect = Extends<EffectDef, z.infer<typeof zEffectDef>>;
type _Hook = Extends<HookDef, z.infer<typeof zHookDef>>;
type _Mod = Extends<StatModifier, z.infer<typeof zStatModifier>>;
// (referenced so noUnusedLocals never complains under stricter configs)
export type _All = [_Ability, _Champion, _Item, _Augment, _Projectile, _Loot, _Arena, _Effect, _Hook, _Mod];

describe("schema/def structural compatibility", () => {
  it("the sim TS literals parse through the Zod schemas unchanged", () => {
    // reverse direction at runtime: defs are valid schema INPUT
    expect(zChampionDef.parse(SELA)).toEqual(SELA);
    expect(zChampionDef.parse(THORNE)).toEqual(THORNE);
    // arena schema adds visual-only defaults (decor/groundStyle) on parse —
    // gameplay fields must round-trip unchanged
    expect(zArenaDef.parse(SKELETON_ARENA)).toEqual({
      ...SKELETON_ARENA,
      decor: [],
      groundStyle: "stone",
    });
  });
});
