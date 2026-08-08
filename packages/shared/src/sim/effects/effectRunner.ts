/**
 * effectRunner — the ONE interpreter for EffectDef[]. Abilities, item passives,
 * augment hooks, and buffs all execute through here. Handlers mutate the world
 * only via well-defined paths (damage queue, shields, statuses, buff sources,
 * dash overrides, projectile spawns).
 *
 * GH#289 split the 500-line `switch` this used to be into one module per kind,
 * dispatched through {@link EFFECT_HANDLERS}. The handler bodies moved
 * VERBATIM — this file is now only the dispatch and the cast-time baker.
 * **To add a kind, read the header of `effectRegistry.ts`; you do not need to
 * change this file.**
 */
import type { EntityId } from "../../ids";
import type { EffectContext, EffectDef } from "./effect";
import { EFFECT_HANDLERS } from "./effectRegistry";
import type { EffectKindSpec } from "./effectKind";
// ⛔ 這一行是 owner 2026-08-09 裁決的整個重點:效果上的條件與 hook 上的條件走
// **同一個** 求值器、同一組葉子、同一個兩相位 rng 規約。在這裡寫第二套判斷
// (哪怕只是「先看一下有沒有這個 status」) 就是把編輯器上長得一樣的兩格條件
// 做成行為不同的兩件事,而那是最難查的一種缺陷。
import { evaluateCondition } from "../content/condition";
import type { EffectCondition } from "../content/condition";

/** Erase the per-kind narrowing once the tag has already selected the entry. */
type AnyKindSpec = EffectKindSpec<EffectDef["kind"]>;

export function runEffects(effects: readonly EffectDef[], ctx: EffectContext): void {
  for (const e of effects) applyEffect(e, ctx);
}

export function applyEffect(e: EffectDef, ctx: EffectContext): void {
  // ⭐ THE GATE. 見 {@link gateOnCondition} —— 缺席時是零成本、零 rng 的直通,
  // 所以已上架的 1,900 份內容一格不變。
  const gated = gateOnCondition(e.condition, ctx);
  if (gated === undefined) return;
  const spec = EFFECT_HANDLERS[e.kind] as AnyKindSpec;
  spec.apply(e, gated, bakeCastTimeConditionals);
}

/**
 * 「這一段效果要不要發生 / 對誰發生」—— `EffectCommon.condition` 的求值端。
 *
 * 語意是契約層定死的（`effects/effect.ts` 的 `EffectCommon.condition` 檔頭），
 * 這裡只是照著做。摘要與**它們各自守在哪一條斷言上**：
 *
 *   ① 缺席 = 無條件執行。⚠️ 這一格是 early return 而不是「傳一個永真的樹」,
 *      因為後者會讓每一段既有效果都多走一次 `drawChances` —— 那是零次 rng,
 *      但也是一條沒必要的路。行為上的保證是:沒有 `condition` 的效果**連
 *      `world.rng` 的狀態都不會動**。
 *   ② `self` = `ctx.caster`,由 `ConditionContext.self` 承接。
 *   ③ 有目標時**逐一過濾**:每個身體各求值一次,通過的組成新清單。
 *      ⛔ 不是整段全有全無 —— 那在單體技上(N=1)與正確語意完全同形,
 *      所以壞掉的版本在測試與手感上都跟對的一樣,只有 AoE 會安靜地算錯
 *      (CLAUDE.md 失敗形態 ④)。
 *   ④ 目標清單為空時退化成**整段閘**,求值一次且 `target` 缺席。自我增益 /
 *      落點特效 / 發金幣本來就沒有目標,照③過濾會變成永遠不執行。
 *      `subject:"target"` 在這種效果上讀 FALSE(condition.ts DECISION 2),
 *      與 hook 今天在無 target 事件上的行為逐字相同。
 *   ⑤ 一個都沒通過 → 回 `undefined` → handler **完全不被呼叫**。
 *      ⭐ owner 要的「『沒通過條件』與『執行了但沒打到人』要分得開」就是這一格。
 *      ⛔ 不可以改成「傳一個空的 targets 進去」:`applyStatus{applyTo:"self"}`
 *      根本不讀 targets、`damageArea` / `randomArea` 拿到空陣列還是會自己解算
 *      圓圈 —— 兩者都會變成「條件沒通過但效果照發」。
 *
 * ── rng 預算（determinism，不是效能）──────────────────────────────────────
 * 消耗 `conditionChanceCount(cond) × max(1, targets.length)` 次抽籤,而且**與
 * 結果無關** —— `evaluateCondition` 內部永遠先把整棵樹的 `chance` 抽完再算
 * (condition.ts DECISION 1),而這裡的迴圈不 early-break。所以抽籤次數是
 * 「條件樹形狀 × 目標數」的純函數,兩個副本不會因為某個人血量差一點就分叉。
 * ⚠️ `chance` 葉子因此是**每個目標各一枚硬幣**（「每個人各有 50% 機率被燒」）,
 * 這是刻意的,但它是一筆真的預算。
 *
 * ── named gap（不是漏掉）────────────────────────────────────────────────
 * 過濾只作用在 `ctx.targets`。自己重新解算身體的 kind（`damageArea` /
 * `damageLine` / `randomArea` / `leap.onLand` 的落地圈）不逐一過濾;對它們③
 * 只決定「整段跑不跑」。⛔ 不要用這一格假裝有做「範圍內只打有某狀態的人」。
 *
 * ── 為什麼不在 `bakeCastTimeConditionals` 裡求值 ──────────────────────────
 * 延遲 payload（`leap.onLand` / `spawnProjectile.onHit`）在**發射**時被 bake,
 * 但條件問的是「這一刻」——投射物飛行途中目標身上的恐懼可能已經到期。所以
 * bake 原封不動帶著 `condition` 走,等 payload 真的落地、重新流過這裡才求值。
 * (順帶:bake 因此不碰 rng,發射與命中之間的串流位置不會被多動一次。)
 */
function gateOnCondition(
  cond: EffectCondition | undefined,
  ctx: EffectContext,
): EffectContext | undefined {
  if (cond === undefined) return ctx; // ①
  const { world, caster, targets } = ctx;
  if (targets.length === 0) {
    return evaluateCondition(world, cond, { self: caster }) ? ctx : undefined; // ④
  }
  const kept: EntityId[] = [];
  for (const t of targets) {
    if (evaluateCondition(world, cond, { self: caster, target: t })) kept.push(t); // ③
  }
  if (kept.length === 0) return undefined; // ⑤
  // 全員通過時回原本那個 ctx —— 讓「條件成立的 AoE」與「沒有條件的 AoE」
  // 在物件層級也是同一件事,少一個「只有帶條件才會出現」的分岔。
  return kept.length === targets.length ? ctx : { ...ctx, targets: kept };
}

/**
 * CAST-TIME RESOLUTION of a DEFERRED payload (#247 follow-up, the REFUTED claim).
 *
 * THE DEFECT THIS EXISTS TO KILL. `comboBonus` used to be resolved inside the
 * damage handler, i.e. wherever the damage happened to land. For 07-03
 * 列、在、前 that is the END of a 43-tick arc (1.44 s), while the window 07-02
 * 者、皆、陣 opens is 1.00 s (j:34438 → TriggerSleepAction(1.00) → j:34440). The
 * window had therefore ALWAYS lapsed before the damage resolved: the bonus could
 * not fire at any timing, in any real game, and the test that "proved" it worked
 * only ever applied the damage effect on its own, with no flight in between.
 *
 * THE SOURCE'S OWN SHAPE. `Trig_Jump_Start_Actions` computes the complete
 * `udg_MoonDamage` — the `+5.00 × AGI` combo term INCLUDED (j:34211-34216) — in
 * the SPELL_EFFECT action, before `gg_trg_Jump_Effect` is even enabled
 * (j:34226). The periodic trigger then flies 41 ticks and, at
 * `udg_Jump_Index >= 41`, calls `UnitDamageTargetBJ(..., udg_MoonDamage, ...)`
 * (j:34262): the already-baked number. The window expiring mid-flight is
 * irrelevant in WC3 precisely BECAUSE the value was frozen at cast.
 *
 * So a deferred payload is resolved HERE, at the moment the arc/missile is
 * launched, and what travels is the resolved amount — folded into the payload's
 * own `flat` term so nothing downstream has to know a window ever existed.
 *
 * Applied at every point where an EffectDef[] stops being immediate and starts
 * being a promise: `leap.onLand` and `spawnProjectile.onHit`. Recurses, so a
 * leap that spawns a projectile is baked once, at the leap's cast.
 *
 * GH#289: the three-kind `switch` this used to be is now the OPTIONAL `bake`
 * member of each kind's registry entry, so a lane adding a primitive with its
 * own deferred payload declares it in its own file. A kind with no `bake` is
 * the identity — deliberately NOT a throw, because baking a list walks every
 * member of it and an unimplemented kind must not detonate on a list it merely
 * shares.
 */
export function bakeCastTimeConditionals(
  effects: readonly EffectDef[],
  ctx: EffectContext,
): EffectDef[] {
  return effects.map((e) => bakeOne(e, ctx));
}

function bakeOne(e: EffectDef, ctx: EffectContext): EffectDef {
  const spec = EFFECT_HANDLERS[e.kind] as AnyKindSpec;
  return spec.bake === undefined ? e : spec.bake(e, ctx, bakeCastTimeConditionals);
}
