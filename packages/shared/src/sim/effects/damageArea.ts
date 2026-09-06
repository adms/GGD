/**
 * `damageArea` — 擴散 (task #210). 傷害一個圓, 圓心是這次事件的受害者。
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EntityId } from "../../ids";
import type { EffectContext } from "./effect";
import { resolveScaling } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { Stat } from "../stats/statTypes";
import { enemiesInCircle } from "../abilities/abilitySystem";
import { distSq } from "../math/vec2";
import { casterAttrs, casterDamageStats, casterSlotRank } from "./effectCommon";
import { resourcePctAmount } from "./dynamicTerms";
import { unscaledFractionOf } from "../combat/apDamageScaling";
import { clampSpreadFalloff, clampSpreadRadius, clampSpreadTargets } from "./spreadLimits";
import { runOnHitChain, selectVictims } from "./victimFilter";
import { rollAbilityCrit } from "../combat/critStrike";
import { scalingOracle } from "../content/condition";

/**
 * `damageArea` 的圓心, 依序: 事件受害者 → 施法點 → 施法者。
 *
 * 第一順位是受害者而不是施法者, 因為 owner 要的是「近戰**擴散**」: 劍砍在 A
 * 身上, 濺到 A 旁邊的 B。以施法者為圓心的話, 一個 6 單位射程的遠程英雄會濺到
 * 自己腳邊而不是目標身邊 —— 同一份文件在近戰身上看起來對, 在遠程身上完全錯,
 * 而那正是「斷言方向跟缺陷無關」最容易漏掉的一種。
 */
function areaCentre(ctx: EffectContext): { x: number; z: number } | undefined {
  const tid = ctx.targets[0];
  if (tid !== undefined) {
    const t = ctx.world.transform.get(tid);
    if (t) return t.pos;
  }
  if (ctx.point) return ctx.point;
  return ctx.world.transform.get(ctx.caster)?.pos;
}

export const damageAreaEffect: EffectKindSpec<"damageArea"> = {
  apply(e, ctx, _bakeList, runList) {
    const { world } = ctx;
    // 擴散 (task #210). 圓心 = 這次事件的受害者 (`ctx.targets[0]`), 沒有受害者
    // 就退回施法點, 再退回施法者自己 —— 一個 hook 觸發的擴散永遠走第一條,
    // 一個技能觸發的走第二/三條。
    const centre = areaCentre(ctx);
    if (!centre) return;
    const radius = clampSpreadRadius(e.radius);
    if (radius <= 0) return;
    const cap = clampSpreadTargets(e.maxTargets);
    if (cap <= 0) return;
    const falloff = clampSpreadFalloff(e.falloff);

    // 震央那個人預設**不再吃一次** —— 他已經吃過觸發這次擴散的那一擊。
    const epicentre = e.includeOrigin === true ? null : new Set(ctx.targets);
    const victims: { id: EntityId; d2: number }[] = [];
    for (const id of enemiesInCircle(world, ctx.caster, centre, radius)) {
      if (epicentre?.has(id)) continue;
      const vt = world.transform.get(id);
      if (!vt) continue;
      victims.push({ id, d2: distSq(centre, vt.pos) });
    }
    // TOTAL ORDER: 近的先, 完全同距離時 id 小的先。`enemiesInCircle` 已經是
    // 遞增 id (queryOverlap 的保證), 但 sort 必須自己是全序 —— 少了 `a.id -
    // b.id` 這一段, 兩個等距目標的相對順序就交給了 Array.prototype.sort 的
    // 實作, 而 `maxTargets` 正好在那裡切一刀。
    victims.sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id));
    // ⭐ G1 ① —— 圈**內**逐一過濾 + 切上限。用的是 effectRunner 那一支同款求值器
    // (`evaluateCondition`), ⛔ 不是第二套條件系統。
    // ⚠️ 一定要在暴擊迴圈**之前**: `canCrit` 每個受害者擲一次 rng, 被濾掉的人不可以
    // 花掉一枚硬幣, 否則 `victimCondition` 的有無會改變 rng 串流位置 (determinism)。
    const struck = selectVictims(victims, cap, e.victimCondition, e.maxTargetsCounts, ctx);

    const stats = casterDamageStats(ctx);
    const base = resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx), scalingOracle(ctx.world, ctx.caster, ctx.targets[0], ctx.castCommitTick), casterSlotRank(ctx));
    for (const v of struck) {
      // 線性衰減: t=0 (圓心) 吃滿額, t=1 (半徑) 吃 falloff 倍。
      // `enemiesInCircle` 是 BODY-OVERLAP 查詢 (身體邊緣碰到就算), 所以中心
      // 距離可能略大於半徑 —— 夾住 t 讓那些人吃到最低的 falloff 倍, 而不是
      // 讓 (1 - (1-falloff)*t) 掉到負的變成治療。
      let t = Math.sqrt(v.d2) / radius;
      if (t > 1) t = 1;
      let amount = base * (1 - (1 - falloff) * t);
      // ⭐ S2（GH#299）—— 資源百分比項。與 `damage.resourcePct` 共用同一個
      // 讀取器，per-target 解算（分母是**某一個身體**的條，一次範圍技的每個
      // 受害者本來就該算出不同的數字 —— 見 `dynamicTerms.ts` 檔頭）。
      // ⭐ GH#929 —— 真傷的百分比項不吃全域三層乘法。⛔ 記**比例**不是絕對量，
      // 而這一支正是理由：`amount` 上面才剛乘過**距離衰減**，下面還會乘暴擊 ——
      // 絕對量每多一個乘法就要記得同步一次，比例對整發同乘是不變量。
      let resPart = 0;
      if (e.resourcePct !== undefined) {
        resPart = resourcePctAmount(world, ctx.caster, v.id, e.resourcePct, ctx.rank);
        amount += resPart;
      }
      // ⭐ ⑨（2026-08-10）—— 走 `combat/critStrike.ts::rollAbilityCrit`（普攻那一半
      // 的同一支），⛔ 不是第二段就地擲骰。理由與抽籤位置見那支的檔頭。
      let crit = false;
      let critSources: readonly string[] | undefined;
      if (e.canCrit) {
        const cr = rollAbilityCrit(
          world,
          ctx.caster,
          stats[Stat.CritChance] ?? 0,
          stats[Stat.CritDamage] || 1.75,
          ctx.rng,
        );
        crit = cr.crit;
        if (cr.crit) amount *= cr.mult;
        critSources = cr.critSources;
      }
      // 省略 = 後台「傷害規則」頁的預設（出貨 magic）。
      // ⛔ 讀 `world.damageRules` 而不是寫死一個字串 —— 見 sim/damageRules.ts 檔頭。
      const type = e.damageType ?? world.damageRules.defaultAbilityDamageType;
      const unscaledFraction = unscaledFractionOf(world, amount, resPart, type);
      world.damageQueue.push({
        source: ctx.caster,
        target: v.id,
        amount,
        ...(critSources !== undefined ? { critSources } : {}),
        type,
        crit,
        ...(unscaledFraction > 0 ? { unscaledFraction } : {}),
        origin: ctx.origin,
      });
    }
    // ⭐ G1 ② —— `effect.target-set-chain@1`。順序刻意是「先把母效果的封包排進佇列,
    // 再跑下游」: 兩者都在同一 tick 被 `combatResolveSystem` 排空, 順序只影響
    // `damageQueue` 的排列, 而那是決定性的一部分 (同一顆 seed 兩次重播要逐字相同)。
    runOnHitChain(
      e,
      struck.map((v) => v.id),
      ctx,
      runList,
    );
  },
};
