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
import { attackRangeScaleFactor } from "../bodyScale";
import { addAttrGrants, championStatBase } from "./attributes";
import { sourceAttrGrants } from "./attrSources";
import { liveResource } from "./resourceStats";
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
      // 兩個來源域:`from` = 另一條屬性(78-00 銅皮鐵骨)、`fromResource` = 當下的
      // 資源(光魔杖「AP+ (目前MP的 5%)」)。少了第二個判斷,一條資源衍生
      // modifier 的目的地就不會進第二趟,於是那條加成**永遠是 0** —— 而且
      // 第一趟的 `switch` 對 `PercentOf` 什麼都不做,所以它會安靜地消失。
      if (m.op !== ModOp.PercentOf) continue;
      if (m.from === undefined && m.fromResource === undefined) continue;
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
   * 三圍 「總」 — the 能力屬性強化 picks on `champ.attrBonus` PLUS every equipped
   * source's `attributes` grant (四魂之玉「力敏智+30」, 朗基努斯之槍「力量+12
   * 敏捷+12」). Computed ONCE here rather than inside `computeStat`, which runs
   * per stat: the fold is identical for all 15 rows, and doing it per row would
   * walk `sources` fifteen extra times on every dirty recompute.
   *
   * It rides the champion's BASE, not the modifier loop below, for the reason
   * `stats/attributes.ts` gives: an attribute is not a stat. That is also
   * exactly what makes an item's +30 STR and a 三選一 card's +30 STR the same
   * number — both land here, both go through `championStatBase`, both pick up
   * the live `strToMaxHealth` / `agiToAttackSpeed` coefficients. See
   * `stats/attrSources.ts`.
   *
   * A summon has no `ChampionComp` and no inventory, so it keeps
   * `championStatBase`'s `NO_ATTR_BONUS` default — the pre-#260 arithmetic.
   */
  const attrBonus = champ ? addAttrGrants(champ.attrBonus, sourceAttrGrants(sc.sources, world.tick)) : undefined;

  /**
   * 2026-08-10 —— 「這個單位是誰」，餵給 `finalizeStat` 的環境倍率鏈
   * (`STAT_ENV_CHAIN` 的 `byAttackType` 那一格：近戰吃 `moveSpeedMelee`、遠程吃
   * `moveSpeedRanged`)。
   *
   * ⚠️ 來源是**英雄卡的 `attackType`**（`ChampionDef` 的必填欄位），不是「射程 > 3」
   * 這類啟發式 —— 射程是一條會被道具、體型、`attackRange` 倍率動到的**衍生值**，
   * 用它反推身分等於讓一件裝備把近戰變成遠程。
   *
   * ⚠️ 一場算一次，不是每條屬性算一次：`computeStat` 一次 recompute 會跑 16 次
   * (第二趟還會再跑幾次)，在裡面配置物件等於每個 dirty tick 多 16 個垃圾。
   *
   * 召喚物同樣走這裡：它沒有 `ChampionComp` 但 `sc.championId` 指的就是一張真的
   * 英雄卡，所以它跟著本體的攻擊型態 —— 和它讀 `championStatBase` 的理由一致。
   */
  const envSubject = { attackType: def.attackType };

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
    // `attrBonus` — a SUMMON has none: 三圍 are bought with the player's own
    // gold in the shop, and a summoned body never went shopping. `undefined`
    // takes `championStatBase`'s `NO_ATTR_BONUS` default, i.e. the hero's innate
    // attributes only, which is the pre-#260 arithmetic exactly.
    const base = championStatBase(def, stat, level, world.combatEnv, attrBonus);

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
        // ⭐ G9 —— 帶 scope 的加成**完全不參與**全域折疊。這一行就是「scoped」
        // 這個字的定義:它不進 `sc.final`,所以面板 / 商店預覽 / codex / 其他五格
        // 技能一個都拿不到它,不會有第二個真相(#125「顯示的就是拿到的」)。
        // 讀取端只有一個:`stats/scopedStat.ts`,消費者只有技能冷卻。
        // ⛔ 刪掉這一行 = 「瞬步冷卻縮短 50%」變成全部技能都縮短 50%,而且會被
        // `scopedCooldownReduction` 再算一次(疊兩份),兩個症狀都只是「數字不對」。
        if (m.scopeSlot !== undefined || m.scopeAbilityId !== undefined) continue;
        switch (m.op) {
          case ModOp.Flat:
            flat += m.value * stacks;
            break;
          case ModOp.PercentAdd:
            pctAdd += m.value * stacks;
            break;
          case ModOp.PercentMult:
            // 乘 `stacks`,和 `Flat` / `PercentAdd` / `PercentOf` **同一條規矩**
            // (GH#286)。在此之前只有這一個 op 漏掉 —— 於是任何寫成 `pctMult` 的
            // 「每層 +X%」不論疊到幾層都只有一層,而面板 / 商店預覽 / codex 全部
            // 從這一條管線推導,所以三處會**一致地**顯示同一個錯的小數字。
            // 語意是**線性**(3 層 ×10% = +30%),不是複利(×1.331):完整推導與
            // 「怎麼寫才拿得到複利」寫在 `stats/modifiers.ts` 的 `PercentMult`。
            pctMult *= 1 + m.value * stacks;
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
      // 身體放大倍數 → 攻擊距離 (GH#252)。`finalizeStat` 只把它套在
      // `Stat.AttackRange` 上,所以其他 15 條逐位元不變;`def.bodyScale` 缺
      // (113 位裡的 89 位)時 `attackRangeScaleFactor` 回 1。
      rangeScale: attackRangeScaleFactor(def.bodyScale, world.bodyScaleRules),
      // 近戰/遠程移速差 (2026-08-10)。⛔ 刪掉這一行,`byAttackType` 那一格永遠
      // 拿不到身分 → 回中性 1 → 兩個旋鈕對每一位英雄都是死的,而且畫面上跟
      // 「操作者把它設成 1.0」長得一模一樣。
      subject: envSubject,
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
          if (m.op !== ModOp.PercentOf || m.stat !== stat) continue;
          // 屬性來源:讀第一趟的**最終**值(過了 env/基礎加成/clamp),也就是
          // 玩家面板上看到的那個數字。
          if (m.from !== undefined) derived += m.value * stacks * next[m.from];
          // 資源來源 (光魔杖「AP+ (目前MP的 5%)」):讀的是**當下**的 hp/mana,
          // 不是 `next.maxMana` —— 這一條就是 `fromResource` 存在的全部理由。
          // 重算時機由 `stats/resourceStats.ts` 的 `resourceStatSystem` 負責。
          else if (m.fromResource !== undefined) {
            derived += m.value * stacks * liveResource(world, id, m.fromResource);
          }
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
