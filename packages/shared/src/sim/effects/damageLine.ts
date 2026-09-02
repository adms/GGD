/**
 * `damageLine` — 面前的一條**直線**範圍傷害 (妖狐藏馬 18-00 薔薇荊棘之刃).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT `damageArea` WITH A BIG RADIUS
 *
 * owner, 2026-07-30 (the replacement design for 18-00): 「每次攻擊都造成**面前
 * 直線範圍**傷害（約 3 個身位）」. A circle is not a line, and the difference is
 * the entire play pattern: a 3.6-unit CIRCLE centred on the victim also hits
 * whoever is standing BEHIND and BESIDE 藏馬, so 「站在他背後」 stops being an
 * answer to him. A capsule swept forward from his own body keeps the counter
 * intact — get off the lash's line.
 *
 * The shape already existed and is already deterministic: `collision/shapes.ts`
 * `Capsule` (a thick segment) with `queryOverlap`'s `circleVsCapsule` test,
 * which is what every skillshot beam uses. This kind is the seam that lets an
 * EFFECT — and therefore a hook, an item, a mob, an augment — ask for it. Before
 * this, a line was only reachable by spawning a piercing projectile, which for
 * an on-attack passive means a visible missile and a travel delay that the
 * ability does not have.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION POINTS ARE FIELDS (CLAUDE.md 第一守則, 尤其是決策點)
 *
 * · `length` / `width` — GGD units. 「3 個身位」 is 3 × the champion body
 *   DIAMETER, and a champion's collision radius is 0.6 (`spawnChampion.ts`), so
 *   3 身位 = 3 × 1.2 = **3.6**, and one body wide = **1.2**. That derivation is
 *   written down here rather than left implicit because the owner gave a unit
 *   ("身位") the code does not have.
 * · `aim` — WHERE THE LINE POINTS, and it is a real decision, not an
 *   implementation detail:
 *     "target" (default) — from the caster THROUGH the entity that triggered
 *       this effect. Robust: it does not depend on the facing having finished
 *       turning, which after #275 (瞄準優先) is genuinely not guaranteed on the
 *       tick a swing lands.
 *     "facing" — the body's current facing. The literal reading of 「面前」, and
 *       the right one for a cast with no single victim.
 *   With `aim: "target"` and no target, it falls back to facing rather than
 *   doing nothing — a line effect that silently vanished would be failure shape
 *   ② wearing a config field.
 * · `fromCaster` — does the capsule start at the caster's own body (default,
 *   「面前」) or at the victim (a lash that continues past what it hit)?
 * · `includeOrigin` — does the entity that TRIGGERED the effect eat it again?
 *   Default false, the same double-billing guard `damageArea` documents: on an
 *   `onBasicAttack` hook he has already taken the auto itself.
 * · `maxTargets`, `canCrit` — same meaning and same clamps as `damageArea`.
 *
 * ⚠️ NO `combatEnv.abilityRange` FACTOR, deliberately, and for exactly the
 * reason `damageArea` states: that knob is defined as 「技能的施法距離 / AoE
 * 半徑」 (#136). This is a passive riding a BASIC ATTACK. Scaling it by 0.6
 * behind the author's back would make the shipped number and the real number
 * disagree, which is the #125 rule ("displayed == actual") broken from the
 * inside. Tune the number in the document.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * `queryOverlap` returns ASCENDING entity ids; the victim list is then re-sorted
 * on the TOTAL ORDER (distance² along the line, then id) before `maxTargets`
 * cuts it — the same rule and the same reason as `damageArea`: `canCrit` rolls
 * one rng draw per victim, so the ORDER of the list is part of the seed stream.
 * No trig (direction comes from `normalize`), no `**`, no Map iteration, no
 * clock.
 */
import type { EntityId } from "../../ids";
import type { EffectContext } from "./effect";
import { resolveScaling } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { Stat } from "../stats/statTypes";
import { capsule } from "../collision/shapes";
import { queryOverlap } from "../collision/queries";
import { canSee } from "../stealth";
import { distSq, type Vec2 } from "../math/vec2";
import { aimDirection, casterAttrs, casterDamageStats } from "./effectCommon";
import { resourcePctAmount } from "./dynamicTerms";
import { unscaledFractionOf } from "../combat/apDamageScaling";
import { clampSpreadRadius, clampSpreadTargets } from "./spreadLimits";
import { runOnHitChain, selectVictims } from "./victimFilter";
import { rollAbilityCrit } from "../combat/critStrike";
import { scalingOracle } from "../content/condition";

/**
 * Which way the lash goes. `aim: "target"` degrades to facing, never to nothing.
 *
 * ⭐ 這支的**本體搬去 `effectCommon.ts` 了**（`aimDirection`），因為
 * `delayed.advance.dir` 需要**同一個**答案，而本檔案原本那份私有 `lineDir` 一旦
 * 被抄第二份，兩份分岔的那一天沒有人會發現（第零守則⑨）。這裡只留一個轉呼叫。
 */
function lineDir(e: { aim?: "facing" | "target" }, ctx: EffectContext): Vec2 | undefined {
  return aimDirection(e.aim, ctx);
}

export const damageLineEffect: EffectKindSpec<"damageLine"> = {
  apply(e, ctx, _bakeList, runList) {
    const { world } = ctx;
    const from = world.transform.get(ctx.caster);
    if (!from) return;
    const dir = lineDir(e, ctx);
    if (!dir) return;

    // Both bounded by the SAME ceiling a spread radius is (`SPREAD_MAX_RADIUS`,
    // 24 today — ⛔ 不要在這裡抄一個字面值，這句話寫「12」的時候常數已經是 24 了): the
    // failure being guarded is identical — a raw w3x `Area` column (200/300/450)
    // pasted in unconverted, which at 54.5 units-per-GGD-unit would be a lash
    // longer than the whole 24-unit duel zone.
    const length = clampSpreadRadius(e.length);
    const width = clampSpreadRadius(e.width);
    if (length <= 0 || width <= 0) return;
    const cap = clampSpreadTargets(e.maxTargets);
    if (cap <= 0) return;

    // WHERE THE LINE STARTS. Default = the caster's own body ("面前"); the
    // victim-anchored form is the lash that carries on past what it caught.
    let start = from.pos;
    if (e.fromCaster === false) {
      const tid = ctx.targets[0];
      const tt = tid !== undefined ? world.transform.get(tid) : undefined;
      if (tt) start = tt.pos;
    }
    const end = { x: start.x + dir.x * length, z: start.z + dir.z * length };

    const selfTeam = world.team.get(ctx.caster);
    const skip = e.includeOrigin === true ? null : new Set(ctx.targets);
    const victims: { id: EntityId; d2: number }[] = [];
    for (const id of queryOverlap(world, capsule(start, end, width / 2), {
      zone: from.zone,
      exclude: new Set([ctx.caster]),
      aliveOnly: true,
    })) {
      if (skip?.has(id)) continue;
      const ht = world.team.get(id);
      // Enemies only — same predicate `enemiesInCircle` applies, spelled out
      // here because this query is on a capsule and cannot reuse that helper.
      if (ht && selfTeam && ht.teamId === selfTeam.teamId) continue;
      // 隱形 (sim/stealth.ts): the SAME shipped answer AoE already gives —
      // `blocksAbilityAoe` is false, so an invisible body standing in the lash
      // is still cut. Routed through the field rather than hard-coded so the two
      // AoE paths can never drift apart.
      if (world.stealthRules.blocksAbilityAoe && !canSee(world, ctx.caster, id)) continue;
      const vt = world.transform.get(id);
      if (!vt) continue;
      victims.push({ id, d2: distSq(start, vt.pos) });
    }
    victims.sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id));
    // ⭐ G1 ① —— 膠囊**內**逐一過濾 + 切上限（`damageArea` 的同一支模板，
    // ⛔ 不是第二份實作）。一定要在 `canCrit` 的擲骰之前，理由同 damageArea。
    const struck = selectVictims(victims, cap, e.victimCondition, e.maxTargetsCounts, ctx);
    if (struck.length === 0) {
      // ⚠️ `emit` 的語意刻意不變:過濾到零 = 今天「一個人都沒打到」的那條路 = 不 emit。
      // 這樣「線畫出來了但沒人挨打」不會變成一個新的、沒有人要求過的視覺狀態。
      runOnHitChain(e, [], ctx, runList);
      return;
    }

    const stats = casterDamageStats(ctx);
    const base = resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx), scalingOracle(ctx.world, ctx.caster, ctx.targets[0]));
    for (const v of struck) {
      let amount = base;
      // ⭐ S2（GH#299）—— 資源百分比項。與 `damage.resourcePct` 共用同一個
      // 讀取器，per-target 解算（分母是**某一個身體**的條，一次範圍技的每個
      // 受害者本來就該算出不同的數字 —— 見 `dynamicTerms.ts` 檔頭）。
      // ⭐ GH#929 —— 真傷的百分比項不吃全域三層乘法。出貨的 59-04 野戰型陽電子砲
      // （`godie-e00r.r`）就是這一條：級距（小/中/大）**照乘**、目標最大生命 10%
      // **不乘**。⛔ 整發豁免會連級距也免掉。見 `combat/apDamageScaling.ts`。
      let resPart = 0;
      if (e.resourcePct !== undefined) {
        resPart = resourcePctAmount(world, ctx.caster, v.id, e.resourcePct, ctx.rank);
        amount += resPart;
      }
      // ⭐ ⑨（2026-08-10）—— 同 `damageArea`：走 `rollAbilityCrit`，一份判定。
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
    // ② the player has to SEE the lash, not just take damage from it. One event
    // per resolution carrying both ends of the segment, so the client can draw
    // the actual line that was tested rather than guess it from the caster's
    // facing a frame later.
    world.emit("damageLine", {
      caster: ctx.caster,
      x: start.x,
      z: start.z,
      x2: end.x,
      z2: end.z,
      width,
      hits: struck.length,
      origin: ctx.origin,
    });
    // ⭐ G1 ② —— emit 在前, 讓客戶端先拿到那一條線, 再收下游的狀態／傷害事件。
    runOnHitChain(
      e,
      struck.map((v) => v.id),
      ctx,
      runList,
    );
  },
};
