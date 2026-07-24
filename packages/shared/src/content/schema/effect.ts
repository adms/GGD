/**
 * EffectDef + HookDef schemas — mirror `sim/effects/effect.ts` and
 * `sim/stats/modifiers.ts` exactly (compile-time asserted in compat.test.ts).
 * The discriminated union is exported un-lazied too so the editor form walker
 * can render union cards keyed by "kind".
 */
import { z } from "zod";
import type { EffectDef } from "../../sim/effects/effect";
import type { ProjectileId, StatusId } from "../../ids";
import { zCastableSlot, zRef, zScaling, zStatModifier } from "./common";

export const zDamageType = z.enum(["physical", "magic", "true"]);

export const zHookEvent = z.enum([
  "onAbilityCast",
  "onAbilityHit",
  "onBasicAttack",
  "onDamageDealt",
  "onDamageTaken",
  "onKill",
  "onLevelUp",
]);

/** Recursive knot: spawnProjectile.onHit is EffectDef[] again. */
export const zEffectDef: z.ZodType<EffectDef, z.ZodTypeDef, unknown> = z.lazy(
  () => zEffectDefUnion,
) as unknown as z.ZodType<EffectDef, z.ZodTypeDef, unknown>;

export const zEffectDefUnion = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("damage"),
      damageType: zDamageType,
      amount: zScaling,
      canCrit: z.boolean().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("heal"), amount: zScaling }).strict(),
  z
    .object({ kind: z.literal("shield"), amount: zScaling, duration: z.number().min(0) })
    .strict(),
  z
    .object({
      kind: z.literal("applyStatus"),
      statusId: zRef<StatusId>("status-effects", { soft: true }),
      duration: z.number().min(0),
      moveSpeedMult: z.number().positive().optional(),
      root: z.boolean().optional(),
      stun: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("applyBuff"),
      modifiers: z.array(zStatModifier),
      duration: z.number().min(0),
      /** rank-indexed override (index rank-1, clamped) — WC3 buff columns are per level */
      perRank: z
        .array(
          z
            .object({ modifiers: z.array(zStatModifier), duration: z.number().min(0) })
            .strict(),
        )
        .min(1)
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("restore"),
      /** 0..1 of the TARGET's max health (WC3 SetUnitLifePercentBJ) */
      healthPct: z.number().min(0).max(1).optional(),
      /** 0..1 of the TARGET's max mana (WC3 SetUnitManaPercentBJ) */
      manaPct: z.number().min(0).max(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("dash"),
      mode: z.enum(["forward", "toPoint"]),
      speed: z.number().positive(),
      maxDistance: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawnProjectile"),
      projectileId: zRef<ProjectileId>("projectiles"),
      onHit: z.array(z.lazy(() => zEffectDef)),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawnVfx"),
      /** vfx@1 doc id (SOFT ref — the doc may be imported/authored later). */
      vfxId: zRef("vfx", { soft: true }),
      /** where the one-shot plays: caster (default), first target, or the cast point. */
      at: z.enum(["self", "target", "point"]).optional(),
      /** seconds a continuous doc keeps emitting (client hint; optional). */
      durationSec: z.number().min(0).optional(),
    })
    .strict(),
]);

export const zHookDef = z
  .object({
    on: zHookEvent,
    /** restrict to one slot; "PASSIVE" is the level-1 天生技 (zCastableSlot). */
    abilitySlot: zCastableSlot.optional(),
    effects: z.array(zEffectDef),
    internalCooldown: z.number().min(0).optional(),
    /** proc probability 0..1 on the seeded rng (absent = always) */
    chance: z.number().min(0).max(1).optional(),
    /** who the effects resolve against: the event's entity (default) or the owner */
    target: z.enum(["self", "event"]).optional(),
  })
  .strict();

/**
 * One AURA (靈氣) projected by a passive — mirrors `AuraDef` in
 * sim/aura/aura.ts. The 「範圍 R 內的敵人/隊友」 half of the WC3 aura family;
 * `modifiers` above only ever reach the unit carrying the passive.
 */
export const zAuraDef = z
  .object({
    /** stable name, unique within the passive; defaults to the array index */
    key: z.string().min(1).optional(),
    /**
     * BASE radius in sim units, BEFORE the combat-env `abilityRange` factor
     * (#136). The w3x `Area` column converts at the usual rate — 靈壓's 500 WC3
     * units is 9.17 here. The ceiling is a MIS-PARSE guard in the spirit of
     * `ITEM_MODIFIER_LIMITS`, not balance policy: the whole skeleton zone is
     * `boundaryRadius: 24`, so anything past 40 is a map-wide aura and is far
     * more likely to be a raw un-converted WC3 number that leaked through.
     */
    radius: z.number().positive().max(40),
    affects: z.enum(["enemy", "ally", "all"]),
    /** default: true for ally/all, false for enemy (WC3 auras buff the caster) */
    includeSelf: z.boolean().optional(),
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    /** WC3 aura-buff tail: seconds it lingers after leaving. Default 0. */
    lingerSec: z.number().min(0).max(10).optional(),
  })
  .strict()
  .refine((a) => (a.modifiers?.length ?? 0) + (a.hooks?.length ?? 0) > 0, {
    message: "aura must carry at least one modifier or hook",
  });

/** One rank of `ability@1.passive` — mirrors `AbilityPassiveRank`. */
export const zAbilityPassiveRank = z
  .object({
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    auras: z.array(zAuraDef).optional(),
  })
  .strict();

/** `ability@1.passive` — mirrors `AbilityPassive` in sim/content/defs.ts. */
export const zAbilityPassive = z
  .object({
    name: z.string().min(1).optional(),
    ranks: z.array(zAbilityPassiveRank).min(1),
  })
  .strict();
