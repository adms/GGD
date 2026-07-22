/**
 * Layered, order-defined stat aggregation:
 *   final = clamp( (base + Σflat) · (1 + ΣpctAdd) · Π(1 + pctMult) )
 * with Override winning outright. Base = championBase + growth·(level−1).
 * `attachSource`/`detachSource` are the ONLY equip/unequip/expire entry points.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { ALL_STATS, STAT_CLAMPS, zeroStats, type Stat, type StatBlock } from "./statTypes";
import { STAT_ENV_KEY } from "../combatEnv";
import { ModOp, type ModifierSource } from "./modifiers";
import { Champions } from "../content/registry";

export function recomputeStats(world: SimWorld, id: EntityId): void {
  const sc = world.stats.get(id);
  const champ = world.champion.get(id);
  if (!sc || !champ) return;

  const def = Champions.get(sc.championId);
  const level = champ.level;
  const prev = sc.final;
  const next = zeroStats();

  for (const stat of ALL_STATS) {
    const base = (def.baseStats[stat] ?? 0) + (def.growth[stat] ?? 0) * (level - 1);

    let flat = 0;
    let pctAdd = 0;
    let pctMult = 1;
    let override: number | null = null;

    for (const src of sc.sources) {
      if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
      if (!src.modifiers) continue;
      const stacks = src.stacks ?? 1;
      for (const m of src.modifiers) {
        if (m.stat !== stat) continue;
        switch (m.op) {
          case ModOp.Flat:
            flat += m.value * stacks;
            break;
          case ModOp.PercentAdd:
            pctAdd += m.value * stacks;
            break;
          case ModOp.PercentMult:
            pctMult *= 1 + m.value;
            break;
          case ModOp.Override:
            override = m.value;
            break;
        }
      }
    }

    let v = override ?? (base + flat) * (1 + pctAdd) * pctMult;
    // Global combat-env factor (world.combatEnv, see combatEnv.ts): the
    // ENVIRONMENT scales the final value — after every modifier layer
    // including Override, before the clamp. All-1.0 default = no-op.
    const envKey = STAT_ENV_KEY[stat];
    if (envKey !== undefined) v *= world.combatEnv[envKey];
    const clamp = STAT_CLAMPS[stat];
    if (clamp) v = Math.max(clamp[0], Math.min(clamp[1], v));
    next[stat] = v;
  }

  sc.final = next;
  sc.dirty = false;

  // Preserve hp/mana RATIO when maxima change (LoL behavior on level/buy).
  const hp = world.health.get(id);
  if (hp) {
    const newMaxHp = next.maxHealth as number;
    const newMaxMana = next.maxMana as number;
    if (prev.maxHealth > 0 && newMaxHp !== prev.maxHealth) {
      hp.hp = newMaxHp * (hp.hp / prev.maxHealth);
    } else if (prev.maxHealth === 0 && newMaxHp > 0) {
      hp.hp = newMaxHp;
    }
    if (prev.maxMana > 0 && newMaxMana !== prev.maxMana) {
      hp.mana = newMaxMana * (hp.mana / prev.maxMana);
    } else if (prev.maxMana === 0 && newMaxMana > 0) {
      hp.mana = newMaxMana;
    }
    hp.maxHp = newMaxHp;
    hp.maxMana = newMaxMana;
  }
}

/** Attach a ModifierSource (item/augment/passive/buff) — marks stats dirty. */
export function attachSource(world: SimWorld, id: EntityId, src: ModifierSource): void {
  const sc = world.stats.get(id);
  if (!sc) return;
  sc.sources.push(src);
  sc.dirty = true;
}

/** Detach by source id — marks stats dirty. Returns true if found. */
export function detachSource(world: SimWorld, id: EntityId, sourceId: string): boolean {
  const sc = world.stats.get(id);
  if (!sc) return false;
  const idx = sc.sources.findIndex((s) => s.id === sourceId);
  if (idx < 0) return false;
  sc.sources.splice(idx, 1);
  sc.dirty = true;
  return true;
}

/** System: recompute all dirty entities (first system each tick). */
export function statRecomputeSystem(world: SimWorld): void {
  for (const [id, sc] of world.stats) {
    if (sc.dirty) recomputeStats(world, id);
  }
}

/** System: expire timed buff sources (marks dirty when one lapses). */
export function buffExpirySystem(world: SimWorld): void {
  for (const [, sc] of world.stats) {
    const before = sc.sources.length;
    for (let i = sc.sources.length - 1; i >= 0; i--) {
      const s = sc.sources[i]!;
      if (s.expiresAtTick !== undefined && s.expiresAtTick <= world.tick) {
        sc.sources.splice(i, 1);
      }
    }
    if (sc.sources.length !== before) sc.dirty = true;
  }
}

export type { Stat, StatBlock };
