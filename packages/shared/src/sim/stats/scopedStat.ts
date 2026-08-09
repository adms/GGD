/**
 * ⭐ G9 —— **範圍限定加成**的唯一讀取端（79-04 卍解「[瞬步] 冷卻縮短 50%
 * 持續 8 秒」· 79-002 虛化）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它補的洞（量出來的）
 *
 * 在這一支之前，「只針對一支技能的持續性加成」在引擎裡有兩個半形狀，沒有一個
 * 對得上那句文案：
 *
 *   · `effects/modifyCooldown` —— **一次性**削掉剩餘冷卻量。可以把瞬步的冷卻
 *     圈清掉，但下一次施放照樣是全額 —— 「持續 8 秒」沒有落點。
 *   · `Stat.CooldownReduction` —— **全域**，而且夾在 0.45。掛上去的是「所有
 *     技能都縮短 50%」，那是另一支技能。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是讀取時算，而不是折進 `sc.final`
 *
 * `sc.final` 是**一個**數字，而 scope 的整個意思就是「這條加成對不同的技能
 * 不一樣」。折進去必然要挑一格代表，於是面板、商店預覽、codex 都會顯示一個
 * 沒有任何一支技能真的拿到的數字 —— #125 明確禁止的形狀。
 *
 * 所以分工是：`statPipeline.ts::recomputeStats` 把帶 scope 的 modifier **跳過**
 *（那一行是這個機制的承重線），這裡在**冷卻真的要被算出來的那一刻**把它們
 * 疊回去。⛔ 兩邊都做 = 疊兩份；兩邊都不做 = 這條加成靜默無效。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 純讀取 + 算術。沒有 rng、沒有時鐘（`world.tick` 只用來比對 `expiresAtTick`，
 * 和 `recomputeStats` 逐字相同）、沒有 Map 迭代（只走 `sc.sources` 這個陣列，
 * 順序由 `attachSource` 決定，本來就是決定性的）。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import { ModOp, type StatModifier } from "./modifiers";
import { STAT_CLAMPS, Stat } from "./statTypes";
import { effectiveCap } from "../statCaps";

/** 「這一次求值是在問哪一支技能」。兩格都省略 = 只有全域加成算數。 */
export interface StatScope {
  /** 按下去的是哪一格（Q/W/E/R/EX/天生技）。 */
  slot?: CastableSlot;
  /** 那一格現在裝的是哪一支技能（`AbilityInstance.abilityId`）。 */
  abilityId?: string;
}

/**
 * 這條 modifier 算不算進**這一次**求值。
 *
 * 三種情形，⚠️ 第一種是最容易寫錯的那一種：
 *   ① 沒有 scope = 全域 → **不算**。全域那一份已經在 `sc.final` 裡了，
 *      再算一次就是疊兩份（見檔頭的分工）。
 *   ② `scopeSlot` 對得上這次的槽位 → 算。
 *   ③ `scopeAbilityId` 對得上這次的技能 id → 算。**軟參照**：打錯 id
 *      在這裡就是「匹配不到」，沒有錯誤訊息（`schema/common.ts` 已經把這個
 *      代價寫在明處，⛔ 不要在這裡假裝它會紅）。
 */
function scopeMatches(m: StatModifier, scope: StatScope): boolean {
  if (m.scopeSlot !== undefined) return m.scopeSlot === scope.slot;
  if (m.scopeAbilityId !== undefined) return m.scopeAbilityId === scope.abilityId;
  return false;
}

/**
 * 這個單位的 `stat`，**站在某一支技能的角度**看到的值。
 *
 * = 全域最終值（`sc.final[stat]`，面板上那個數字）疊上所有**指名這一格 /
 * 這一支**的加成，再套一次同一組上下界。
 *
 * ⚠️ 沒有任何 scoped 加成時回傳的**就是** `sc.final[stat]` —— 逐位元相同，
 * 所以全 sim 換成走這一支之後每一份既有錄影不變。
 *
 * ⛔ 不套 `combatEnv` 倍率也不套基礎加成：那兩者已經在 `sc.final` 裡了
 *（`finalizeStat`），這裡再套一次就是第二個真相。上下界要重套，因為疊完之後
 * 可能越界 —— 「三張卡各縮 50%」不可以變成負的冷卻。
 */
export function scopedStat(world: SimWorld, id: EntityId, stat: Stat, scope: StatScope): number {
  const sc = world.stats.get(id);
  if (!sc) return 0;
  const global = sc.final[stat] ?? 0;

  let flat = 0;
  let pctAdd = 0;
  let pctMult = 1;
  let override: number | null = null;
  let any = false;

  for (const src of sc.sources) {
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!src.modifiers) continue;
    const stacks = src.stacks ?? 1;
    for (const m of src.modifiers) {
      if (m.stat !== stat) continue;
      if (!scopeMatches(m, scope)) continue;
      any = true;
      switch (m.op) {
        case ModOp.Flat:
          flat += m.value * stacks;
          break;
        case ModOp.PercentAdd:
          pctAdd += m.value * stacks;
          break;
        case ModOp.PercentMult:
          pctMult *= 1 + m.value * stacks;
          break;
        case ModOp.Override:
          override = m.value;
          break;
        // `PercentOf` / `CapRaise` 帶 scope 在 schema 就被拒了
        // （`refineStatModifierScope`），理由是它們的求值分別住在 `recomputeStats`
        // 的第二趟與上限表，兩者都是全域的一步。這裡不需要第二道檢查。
        default:
          break;
      }
    }
  }
  // 一條都沒對上 = 這個單位對這支技能沒有任何範圍限定加成 = 回全域值本身。
  // ⚠️ 提前回傳而不是走下面的算式，是為了讓「沒有這個功能時」逐位元相同：
  // 走算式會多一次 clamp，而 clamp 對一個已經 clamp 過的值理論上是恆等的，
  // 「理論上」在浮點數上不是保證。
  if (!any) return global;

  const out = override ?? (global + flat) * (1 + pctAdd) * pctMult;
  const clamp = STAT_CLAMPS[stat];
  const lo = clamp ? clamp[0] : Number.NEGATIVE_INFINITY;
  // `capRaise: 0` —— 解鎖上限是全域語意，scope 拿不到（schema 也擋著）。
  const hi = effectiveCap(world.statCaps, stat, 0);
  return Math.max(lo, Math.min(hi, out));
}

/**
 * 技能冷卻要用的那一條 —— 全 sim **唯一**的 cdr 消費點該讀的東西。
 *
 * 存在的理由是讓呼叫端不用自己記得「要傳 slot 也要傳 abilityId」：兩個選擇器
 * 是互斥的（schema 擋），但**讀取**端必須兩個都問，否則作者填了哪一格就決定
 * 功能會不會生效 —— 而那正是失敗形態②。
 */
export function scopedCooldownReduction(
  world: SimWorld,
  id: EntityId,
  slot: CastableSlot,
  abilityId: string,
): number {
  return scopedStat(world, id, Stat.CooldownReduction, { slot, abilityId });
}
