/**
 * ModifierSource — THE unifier. Champion passives, items, augments, and
 * temporary buffs all reduce to this one shape: stat modifiers + event hooks +
 * granted abilities. `attachSource`/`detachSource` are the only equip/expire
 * entry points, so no content type ever needs bespoke wiring.
 */
import type { Stat } from "./statTypes";
import type { EffectDef } from "../effects/effect";
import type { AbilityId } from "../../ids";
import type { CastableSlot } from "../intents";
import type { AuraDef, AuraOrigin } from "../aura/aura";

export enum ModOp {
  Flat = "flat",
  PercentAdd = "pctAdd",
  PercentMult = "pctMult",
  Override = "override",
}

export interface StatModifier {
  stat: Stat;
  op: ModOp;
  value: number;
}

/** Game events hooks can react to. */
export type HookEvent =
  | "onAbilityCast"
  | "onAbilityHit"
  | "onBasicAttack"
  | "onDamageDealt"
  | "onDamageTaken"
  | "onKill"
  | "onLevelUp";

export interface HookDef {
  on: HookEvent;
  /** optional condition: restrict to a specific ability slot (incl. "PASSIVE") */
  abilitySlot?: CastableSlot;
  /** effects run with the hook owner as caster and the event target as target */
  effects: EffectDef[];
  /**
   * Who the hook's effects RESOLVE against. Default "event" = the entity the
   * event was about (the unit you hit / killed / were hit by). "self" points
   * them back at the hook's owner, which is the only way to express WC3's very
   * common "on kill, YOU gain X" passives (呂布's 飛將神弓 `A0AU`: +10 attack
   * damage for 15 s per kill) — with the default the buff lands on the corpse.
   */
  target?: "self" | "event";
  /** internal cooldown in seconds (0/undefined = every trigger) */
  internalCooldown?: number;
  /**
   * Proc probability 0..1, rolled on the seeded `world.rng` every time the hook
   * would otherwise fire (absent = always). This is the WC3 proc-chance column
   * (`Hbh1` 狂怒擊機率 for Bash, `Ocr1` 致命一擊機率 for Critical Strike,
   * `War1` 動地跺機率 for Pulverize …) — without it a "10 % chance to deal +75"
   * on-attack passive can only be ported as an unconditional bonus, which is a
   * different ability. Rolled AFTER the internal-cooldown gate, and the ICD
   * clock only starts when the roll SUCCEEDS (WC3 semantics: a failed proc does
   * not consume the cooldown).
   */
  chance?: number;
}

/**
 * `"aura"` is the only kind the sim WRITES rather than content authoring: it
 * marks a source PROJECTED onto a unit by somebody else's `auras` block while
 * that unit stands inside the radius. `auraSystem` owns every one of them and
 * removes them the moment membership lapses — nothing else may create, mutate or
 * detach a source of this kind. See sim/aura/aura.ts.
 */
export type ModifierSourceKind = "champion" | "item" | "augment" | "passive" | "buff" | "aura";

export interface ModifierSource {
  /** unique instance id, e.g. "item:ember-rod#2", "aug:bloodlust", "buff:slow#t123" */
  id: string;
  kind: ModifierSourceKind;
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  grantedAbilities?: AbilityId[];
  /** for buffs: expiry tick (undefined = permanent) */
  expiresAtTick?: number;
  stacks?: number;
  /**
   * Pure PRESENTATION tag (does NOT alter the stat pipeline or any damage
   * number): marks this source as a "damage-reduction / guard" buff. While an
   * active source with this flag is on a target, incoming hits read as
   * `blocked` in the damage/hitImpact events (guard spark + lighter knockback),
   * exactly as a shield-absorb does. Lets content express a defensive buff as a
   * block without inventing a new mitigation mechanic. Default (absent) = off.
   */
  damageReduction?: boolean;
  /**
   * AURAS (靈氣) this source PROJECTS onto other units — the only way a
   * ModifierSource reaches past the unit carrying it. Each entry names a radius,
   * a team filter and a payload; `auraSystem` applies that payload as its own
   * `kind: "aura"` source to everyone inside, every tick, and removes it as they
   * leave or die. Absent on almost everything; see sim/aura/aura.ts for the
   * model. Authored via `ability@1.passive.ranks[N].auras`.
   */
  auras?: AuraDef[];
  /** runtime: last tick each hook fired (internal-cooldown bookkeeping) */
  hookLastFired?: number[];
  /**
   * RUNTIME, `kind: "aura"` only: which emitter/aura projected this source.
   * Written by `auraSystem` when it attaches, read by it when it removes (the
   * linger tail). Never authored, never present on any other kind.
   */
  auraOrigin?: AuraOrigin;
}
