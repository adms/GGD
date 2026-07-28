/**
 * Content definition schemas (champion / ability / item / augment / projectile).
 * Pure data shapes — authored as TS literals in the skeleton, migrated to
 * external JSON by the content pipeline (same shapes, Zod-validated).
 */
import type { AbilityId, AugmentId, ChampionId, ItemId, ProjectileId } from "../../ids";
import type { Stat, StatBlock } from "../stats/statTypes";
import type { ChampionAttributes } from "../stats/attributes";
import type { StatModifier, HookDef } from "../stats/modifiers";
import type { AuraDef } from "../aura/aura";
import type { EffectDef } from "../effects/effect";
import type { ChampionAbilitySlot, CoreAbilitySlot } from "../intents";

export type CastType = "targeted" | "skillshot" | "ground" | "self" | "dash";

/**
 * One rank of an ability's PERMANENT passive. WC3 authors passives per ability
 * level, so this is a rank-indexed array rather than a single block: rank N
 * uses `ranks[N-1]` (clamped to the last entry), and rank 0 (unlearned) grants
 * nothing at all.
 */
export interface AbilityPassiveRank {
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  /**
   * AURAS (靈氣) this rank projects — the 「範圍 R 內的敵人/隊友」 half of the
   * WC3 aura family (`AOae` Endurance, `AHab` Devotion, and the innate that
   * drove this: `79-00 靈壓`, −25 % attack speed to enemies within 500). Unlike
   * `modifiers`, which only ever touch the unit carrying the passive, these are
   * applied to OTHER units by proximity. See sim/aura/aura.ts.
   */
  auras?: AuraDef[];
}

/**
 * `ability@1.passive` — the missing half of the ability schema.
 *
 * A large share of the imported WC3 kit is PERMANENT: Critical Strike (`AOcr`),
 * Bash (`AHbh`), Evasion (`AEev`), the aura family (`AOae`/`AHab`), the
 * attribute buttons (`Aamk`). Their native `Cool` is 0 — they are not cast.
 * Without this field the importer had nowhere to put them and every one shipped
 * as an ACTIVATED `self` + `applyBuff` with an invented cooldown and mana cost,
 * i.e. a different ability. A passive ability is attached as a `ModifierSource`
 * the moment its rank goes above 0 and re-attached (at the new rank's values)
 * on every rank-up — the same `attachSource`/`detachSource` path items use.
 */
export interface AbilityPassive {
  /** display name (defaults to the ability's own name) */
  name?: string;
  ranks: AbilityPassiveRank[];
}

export interface AbilityDef {
  id: AbilityId;
  name: string;
  slot: ChampionAbilitySlot;
  /**
   * ONLY on `slot: "PASSIVE"` — whether the level-1 innate (天生技) is a
   * permanent self-buff ("passive", modelled through `passive.ranks[0]`, never
   * castable) or a real cast with a cooldown ("active", the WC3 D-slot).
   * Mirrors `zInnateKind`; absent on every other slot.
   */
  innateKind?: "passive" | "active";
  castType: CastType;
  maxRank: number;
  /** per rank (index rank-1) */
  cooldown: number[]; // seconds
  manaCost: number[];
  range: number;
  /** skillshot width or AoE radius */
  radius?: number;
  targetsEnemies?: boolean;
  effects: EffectDef[];
  /**
   * Permanent passive granted while this ability's rank > 0 (see
   * `AbilityPassive`). An ability with a passive AND an empty `effects` array
   * is passive-ONLY: `castAbility` rejects it with "passive" before paying any
   * cost, exactly as WC3 refuses to cast a passive button.
   */
  passive?: AbilityPassive;
  vfxKey?: string;
  /**
   * WC3-derived per-ability cast sound cue (audio-map SFX key, e.g.
   * "wc3.nocute"). Stamped onto the `abilityCast` event so the client's
   * combat-audio mapper plays the source map's own clip for this cast; absent
   * = the generic castBegin/abilityCast voice. Authored from
   * tools/w3x-import SFX_BINDINGS (owner directive: ability ports include 音效).
   */
  sfxKey?: string;
  /**
   * Cast time (seconds) — the wind-up before effects fire. Default 0 = instant
   * (skeleton behavior). With ct>0 the caster enters a cast state, pays mana +
   * cooldown up-front, and effects resolve `round(ct/dt)` ticks later.
   */
  castTimeSec?: number;
  /** Root the caster for the cast duration (default true). */
  rootWhileCasting?: boolean;
  /**
   * RECOVERY (後搖) — seconds of post-resolve commitment (no cast, no basic
   * attack). Absent = `DEFAULT_RECOVERY_SEC` (0.6 s), not 0. A landed hit on an
   * enemy CANCELS it, which is the whole combo rule. See
   * `sim/abilities/abilityRecovery.ts`.
   */
  recoverySec?: number;
  /** Whether the recovery also roots (default false: output lock only). */
  recoveryRoots?: boolean;
  /**
   * Icon path relative to content/ ("assets/icons/abilities/<id>.png",
   * w3x BLP→PNG). Absent = client falls back to letter-tile rendering.
   */
  icon?: string;
}

export interface ChampionDef {
  id: ChampionId;
  name: string;
  role: string;
  attackType: "melee" | "ranged";
  modelKey: string;
  /**
   * The RAW per-champion stat card. Since #248 the attribute-derived rows
   * (maxHealth / healthRegen / ad / armor / as / maxMana / manaRegen / ap) hold
   * the source map's own numbers WITHOUT the 三圍 term — read them through
   * `stats/attributes.ts championStatBase`, never directly, or you are showing
   * a champion 150 hp instead of 575.
   */
  baseStats: Partial<StatBlock>;
  /**
   * Additive per level beyond 1 — the per-hero designer knob. Since #248 it is
   * a deliberate SECOND, additive source alongside `attributes.*Growth`:
   * `stat(L) = baseStats + attr(L)·coef + growth·(L−1)`. `growth.mr` is the one
   * row with no attribute term at all (WC3 has no magic-resist attribute).
   */
  growth: Partial<Record<Stat, number>>;
  /**
   * 三圍 — STR/AGI/INT and their per-level growths, recovered from the source
   * map (task #248). Absent = no attribute derivation at all, which is the
   * pre-#248 behaviour and what the skeleton/test content uses.
   */
  attributes?: ChampionAttributes;
  /**
   * Ranged auto-attack projectile speed (GGD units/sec, ~= WC3 missile speed
   * × the import distance factor). Ignored for melee. Default applied by the
   * BasicAttackSystem when absent.
   */
  missileSpeed?: number;
  /**
   * Wind-up before a basic attack's hit lands (seconds). Melee applies damage
   * at this point; ranged launches its projectile here. Default per attackType.
   */
  attackDamagePoint?: number;
  /**
   * Base attack-cadence multiplier (dimensionless, default 1.0). The real
   * interval = baseAttackTime / attackSpeed; 1.0 reproduces the classic 1/AS.
   */
  baseAttackTime?: number;
  abilities: Record<CoreAbilitySlot, AbilityDef>;
  /**
   * Optional per-hero "EX 技能" ability id (slot "EX"), unlocked at the arena
   * EX-unlock point. Absent = this hero has no EX skill. Resolved via the
   * Abilities registry (standalone ability doc), not embedded above.
   */
  exAbility?: AbilityId;
  /**
   * The per-hero 天生技 / PASSIVE ability id (slot "PASSIVE") — the SIXTH slot,
   * owned from level 1, resolved via the Abilities registry exactly like
   * `exAbility`. Absent = the source map has no NN-00 for this hero (3 of 111).
   * Unrelated to `passive` below, which is a legacy hook block, not a slot.
   */
  passiveAbility?: AbilityId;
  passive?: { name: string; hooks?: HookDef[]; modifiers?: StatModifier[] };
  /**
   * Icon path relative to content/ ("assets/icons/champions/<id>.png",
   * w3x BLP→PNG). Absent = client falls back to text-only rendering.
   */
  icon?: string;
  /**
   * WC3 vertex-colour MULTIPLY `[r,g,b]`, each 0..1 (task #49). Applied by the
   * client per-material as `texture.rgb * tint`; absent = untinted. Purely
   * visual — the sim never reads it, it rides along so registry reads stay
   * typed (same treatment as `icon`).
   */
  tint?: [number, number, number];
  /** Opacity 0..1; absent = 1 (opaque). Visual only, like `tint`. */
  alpha?: number;
  /**
   * 變身 form link recovered from the map's WC3 Metamorphosis fields `Eme1` /
   * `Emeu` (task #249) — see `content/schema/champion.ts` for the full contract
   * and `content/championForms.ts` for the shipped 26-pair table.
   *
   * DATA ONLY: the sim never reads this. It rides along exactly like `icon` and
   * `tint` so registry reads stay typed, and so the transform MECHANIC (task
   * #119) can be built without another trip into the .w3x. `role: "alternate"`
   * marks a body that is NOT independently pickable.
   */
  transform?: {
    role: "base" | "alternate";
    counterpartId?: ChampionId;
    normalUnitRawcode: string;
    alternateUnitRawcode: string;
    triggerAbility: {
      rawcode: string;
      name?: string;
      /** per level, keyed "1".."4"; absent = toggle / death-state morph */
      durationSec?: Record<string, number>;
      cooldownSec?: Record<string, number>;
    };
  };
  /** AI hints (Q/W/E/R only) */
  skillOrder: CoreAbilitySlot[];
  buildPriority: ItemId[];
  tags: string[];
}

export interface ItemDef {
  id: ItemId;
  name: string;
  cost: number;
  tier: number;
  unique?: boolean;
  modifiers?: StatModifier[];
  passive?: HookDef[];
  iconKey?: string;
  /**
   * Icon path relative to content/ ("assets/icons/items/<id>.png", w3x
   * BLP→PNG). Absent = client falls back to text-only rendering. `iconKey`
   * above is the legacy skeleton-era symbolic key — unrelated.
   */
  icon?: string;
  tags: string[];
  /**
   * Crafting/provenance role, recovered from the source map's TRIGGERS by
   * tools/w3x-import/extract_item_roles.py — NOT inferred from cost or name at
   * runtime (task #70, reopened twice). This is the field the owner's two
   * rules are read off:
   *   - "final"     a crafted end product WITH a 製作書 — the ONLY thing the
   *                 shop may list (rule 1: 只有最終合成武器才能上架, 有製作書的).
   *   - "quest"     obtained by completing a quest — the ONLY thing the
   *                 3-choose-1 draft may offer (rule 2: 隨機三選一…所有任務道具).
   *   - "component" consumed by some recipe (every 製作書 is one). Never sold,
   *                 never drafted.
   *   - "token"     a 兌換/認領/交換 shop token — grants a component, is not one.
   *   - "direct"    sold for gold in the source map, never crafted, never a
   *                 quest reward (the 神器/mercenary shelf).
   *   - "service"   a shop MECHANIC (orb roll / stat tick), payload is code.
   *   - "none"      referenced by no recipe, shop or quest trigger.
   * Absent on legacy docs; treated as "none" everywhere it gates a surface.
   */
  craftRole?: ItemCraftRole;
  /**
   * For a "final" item, the recipe its own trigger implements: the 製作書 that
   * unlocks it and the component items it consumes. Present so the classifier
   * is auditable off the doc and a re-import can reconstruct it. The sim never
   * combines — GGD has no craft step — this is provenance, not mechanics.
   */
  recipe?: ItemRecipe;
  /**
   * WHO this item may be OFFERED to (#189, owner 2026-07-28: 傳說武器三選一
   * 「只出現在近戰英雄」). Absent = everybody, which is every pre-#189 doc.
   *
   * The legendary pool had NO attack-type dimension at all before this: both
   * roll sites (`economy/legendaryOrb.legendaryPool` for the 傳說寶玉 and
   * `economy/draft.offerItems` for the round weapon card) filtered on ownership
   * + operator whitelist + craftRole and nothing else, so a melee-only weapon
   * authored without this field lands on a ranged champion's card and its
   * on-hit design reads as a lie.
   *
   * It gates the OFFER, not the inventory: an item already held keeps working
   * (nothing in the sim re-checks it), because a mid-match champion swap must
   * not silently delete somebody's weapon.
   */
  requiresAttackType?: "melee" | "ranged";
}

export type ItemCraftRole =
  | "final"
  | "component"
  | "quest"
  | "token"
  | "direct"
  | "service"
  | "none";

export interface ItemRecipe {
  /** The 製作書 (recipe book) item, when the recipe uses one. */
  book?: ItemId;
  /** The component items the recipe consumes (excluding the book). */
  components: ItemId[];
}

export type AugmentTier = "silver" | "gold" | "prismatic";

export interface AugmentDef {
  id: AugmentId;
  name: string;
  description: string;
  tier: AugmentTier;
  weight: number;
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  tags: string[];
}

export interface ProjectileDef {
  id: ProjectileId;
  speed: number;
  maxRange: number;
  hitRadius: number;
  pierce?: boolean;
  vfxKey?: string;
  /** RENDER-ONLY 3D body shape for the flying missile (see projectile@1). */
  meshShape?: "bolt" | "orb" | "shard";
}

export interface LootTable {
  id: string;
  entries: { itemId: ItemId; weight: number }[];
}
