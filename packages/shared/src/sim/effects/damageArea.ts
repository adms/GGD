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
import { casterAttrs, casterStats } from "./effectCommon";
import { clampSpreadFalloff, clampSpreadRadius, clampSpreadTargets } from "./spreadLimits";

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
  apply(e, ctx) {
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
    if (victims.length > cap) victims.length = cap;

    const stats = casterStats(ctx);
    const base = resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx));
    for (const v of victims) {
      // 線性衰減: t=0 (圓心) 吃滿額, t=1 (半徑) 吃 falloff 倍。
      // `enemiesInCircle` 是 BODY-OVERLAP 查詢 (身體邊緣碰到就算), 所以中心
      // 距離可能略大於半徑 —— 夾住 t 讓那些人吃到最低的 falloff 倍, 而不是
      // 讓 (1 - (1-falloff)*t) 掉到負的變成治療。
      let t = Math.sqrt(v.d2) / radius;
      if (t > 1) t = 1;
      let amount = base * (1 - (1 - falloff) * t);
      let crit = false;
      if (e.canCrit) {
        const cc = stats[Stat.CritChance] ?? 0;
        if (cc > 0 && ctx.rng.chance(cc)) {
          crit = true;
          amount *= stats[Stat.CritDamage] || 1.75;
        }
      }
      world.damageQueue.push({
        source: ctx.caster,
        target: v.id,
        amount,
        // 省略 = 後台「傷害規則」頁的預設（出貨 magic）。
        // ⛔ 讀 `world.damageRules` 而不是寫死一個字串 —— 見 sim/damageRules.ts 檔頭。
        type: e.damageType ?? world.damageRules.defaultAbilityDamageType,
        crit,
        origin: ctx.origin,
      });
    }
  },
};
