/**
 * Layered, order-defined stat aggregation:
 *   final = clamp( (base + Σflat) · (1 + ΣpctAdd) · Π(1 + pctMult) )
 * with Override winning outright.
 *
 * Base = `championStatBase` (stats/attributes.ts): the authored
 * `baseStats + growth·(level−1)` PLUS the champion's 三圍 contribution
 * (task #248 — `maxHealth = w3x_hp + strToMaxHealth·STR`, and seven more).
 * That helper is the single definition of "this champion's base stat"; nothing
 * here re-derives it, and neither does any UI.
 *
 * `attachSource`/`detachSource` are the ONLY equip/unequip/expire entry points.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { ALL_STATS, zeroStats, type Stat, type StatBlock } from "./statTypes";
import { finalizeStat } from "../baseBonus";
import { championStatBase } from "./attributes";
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
    // `champ.attrBonus` — the 三圍 bought this match (#260). It rides into the
    // BASE, not into the modifier loop below, because an attribute is not a
    // stat: see stats/attributes.ts. Passing it here is the ONE wiring that
    // makes a 能力屬性強化 pick move any number at all.
    const base = championStatBase(def, stat, level, world.combatEnv, champ.attrBonus);

    let flat = 0;
    let pctAdd = 0;
    let pctMult = 1;
    let override: number | null = null;
    /**
     * 這個單位、這條屬性身上最高的一個 `ModOp.CapRaise`。**取 max,不加總**
     * (GH#286):兩個 5.0 / 7.0 的解鎖給的是 7.0,不是 12.0。0 = 沒有任何解鎖
     * 來源 → `effectiveCap` 回一般上限。不乘 `stacks` —— 它是一個目標高度,
     * 不是一份加成。
     */
    let maxCapRaise = 0;

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
          case ModOp.CapRaise:
            if (m.value > maxCapRaise) maxCapRaise = m.value;
            break;
        }
      }
    }

    const modified = override ?? (base + flat) * (1 + pctAdd) * pctMult;
    // 環境倍率 → 基礎加成 → clamp,全部由 sim/baseBonus.ts finalizeStat 定義。
    // 這三步**不在這裡展開**,是因為顯示面板(championSheet / quickApproval)必須
    // 走同一份順序 —— #125 要求玩家看到的數字就是他實際拿到的數字。
    next[stat] = finalizeStat(modified, stat, {
      env: world.combatEnv,
      baseBonus: world.baseBonus,
      caps: world.statCaps,
      capRaise: maxCapRaise,
    });
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
