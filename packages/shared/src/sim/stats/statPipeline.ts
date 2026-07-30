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

/**
 * 這個單位身上有沒有任何一條 `ModOp.PercentOf`,如果有,**目的地**是哪幾條屬性。
 *
 * 回 `null` 表示一條都沒有 —— 這是絕大多數單位的情形,而 `recomputeStats` 對
 * `null` 走的是**和這個功能出現之前一模一樣**的單趟路徑。這一點是刻意的:衍生
 * 屬性只有 78-00 銅皮鐵骨一支在用,不能讓所有人多付一趟。
 */
function percentOfTargets(sc: { sources: readonly ModifierSource[] }, tick: number): Set<Stat> | null {
  let out: Set<Stat> | null = null;
  for (const src of sc.sources) {
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    if (!src.modifiers) continue;
    for (const m of src.modifiers) {
      if (m.op !== ModOp.PercentOf || m.from === undefined) continue;
      (out ??= new Set<Stat>()).add(m.stat);
    }
  }
  return out;
}

export function recomputeStats(world: SimWorld, id: EntityId): void {
  const sc = world.stats.get(id);
  const champ = world.champion.get(id);
  /**
   * 召喚物 (GH#289 lane P2) — a summon has a StatsComp but NO ChampionComp, on
   * purpose: `deathSystem` pays kill gold + the once-per-victim kill bounty for
   * anything `world.champion.has()`, and the scoreboard / duel resolution /
   * placement all key off that same store. So the LEVEL it reads its sheet at
   * lives on its SummonComp instead, and this is the one place that has to know.
   *
   * ⚠️ NOT a second stat path. Everything below — `championStatBase`, the
   * modifier fold, `finalizeStat`'s env/baseBonus/clamp chain, the hp/mana ratio
   * preservation — is the champion's own arithmetic, unchanged and unbranched.
   * A summon computing its maxHealth anywhere else is exactly how 「面板寫的和
   * 實際拿到的不一樣」 (#125) comes back.
   */
  const sm = world.summon.get(id);
  if (!sc || (!champ && !sm)) return;

  const def = Champions.get(sc.championId);
  const level = champ ? champ.level : (sm?.level ?? 1);
  const prev = sc.final;
  const next = zeroStats();

  /**
   * 算一條屬性的最終值。`derivedFlat` 是 `ModOp.PercentOf` 在**第二趟**才算得
   * 出來的那一份 flat 加成(第一趟一律 0),它和 `ModOp.Flat` 進同一個位置 ——
   * 「防禦力額外增加攻擊力的 50%」和「防禦力 +11」在管線上是同一種東西,只是
   * 一個的數字是活的。
   */
  const computeStat = (stat: Stat, derivedFlat: number): number => {
    // `champ.attrBonus` — the 三圍 bought this match (#260). It rides into the
    // BASE, not into the modifier loop below, because an attribute is not a
    // stat: see stats/attributes.ts. Passing it here is the ONE wiring that
    // makes a 能力屬性強化 pick move any number at all.
    // `champ?.attrBonus` — a SUMMON has none: 三圍 are bought with the player's
    // own gold in the shop, and a summoned body never went shopping. `undefined`
    // takes `championStatBase`'s `NO_ATTR_BONUS` default, i.e. the hero's innate
    // attributes only, which is the pre-#260 arithmetic exactly.
    const base = championStatBase(def, stat, level, world.combatEnv, champ?.attrBonus);

    let flat = derivedFlat;
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
          case ModOp.PercentOf:
            // 第二趟才算得出來(它要讀別條屬性的 pass-1 值),所以第一趟這裡
            // 什麼都不做。**不要**在這裡 `flat += m.value * next[m.from]` ——
            // `next` 這時候只填到 `stat` 之前的那幾條,讀到的會是 0 或半成品,
            // 而且答案會隨 `ALL_STATS` 的宣告順序改變。
            break;
        }
      }
    }

    const modified = override ?? (base + flat) * (1 + pctAdd) * pctMult;
    // 環境倍率 → 基礎加成 → clamp,全部由 sim/baseBonus.ts finalizeStat 定義。
    // 這三步**不在這裡展開**,是因為顯示面板(championSheet / quickApproval)必須
    // 走同一份順序 —— #125 要求玩家看到的數字就是他實際拿到的數字。
    return finalizeStat(modified, stat, {
      env: world.combatEnv,
      baseBonus: world.baseBonus,
      caps: world.statCaps,
      capRaise: maxCapRaise,
    });
  };

  // ---- 第一趟:忽略 `PercentOf` ----
  for (const stat of ALL_STATS) next[stat] = computeStat(stat, 0);

  // ---- 第二趟:只重算 `PercentOf` 的**目的地**屬性 ----
  //
  // 讀的是第一趟的來源值(`next[from]`,已經過 env/基礎加成/clamp,也就是玩家
  // 面板上看到的那個數字 —— #125),所以「防禦力 += 攻擊力 50%」用的是**最終**
  // 攻擊力,不是某個中間量。
  //
  // `targets === null`(場上幾乎每一個單位)時整段不執行,連 Set 都不配置 ——
  // 這個功能對沒有用到它的單位是逐位元相同的 no-op。
  const targets = percentOfTargets(sc, world.tick);
  if (targets !== null) {
    // 目的地照 `ALL_STATS` 的順序走(不是 Set 的插入順序)——`sim/purity.test.ts`
    // 要的「Map/Set 迭代要先排序」在這裡的等價寫法:一份固定的宣告順序。
    for (const stat of ALL_STATS) {
      if (!targets.has(stat)) continue;
      let derived = 0;
      for (const src of sc.sources) {
        if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
        if (!src.modifiers) continue;
        const stacks = src.stacks ?? 1;
        for (const m of src.modifiers) {
          if (m.op !== ModOp.PercentOf || m.stat !== stat || m.from === undefined) continue;
          derived += m.value * stacks * next[m.from];
        }
      }
      next[stat] = computeStat(stat, derived);
    }
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
