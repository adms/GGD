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
  // 第四個引數是 G1 ② 的接縫（`RunList`）：自己解目標的 kind 用它把**真的打到
  // 的那群人**當成 `ctx.targets` 再跑一段。傳進去而不是讓 handler import，理由與
  // `bakeCastTimeConditionals` 相同（effectKind.ts 檔頭的依賴環）。
  spec.apply(e, gated, bakeCastTimeConditionals, runEffects);
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
 * 過濾只作用在 `ctx.targets`。自己重新解算身體的 kind 在**這一格**上只被③決定
 * 「整段跑不跑」—— 圈**內**要不要逐一過濾是另一格：
 *   · `damageArea` / `damageLine` —— ⭐ 2026-08-10 落地：它們自己解完幾何之後會用
 *     `effects/victimFilter.ts::selectVictims` 逐一求值 `victimCondition`
 *     （**同一支** `evaluateCondition`、同一組葉子），並用 `onHitTargets` 把真的
 *     打到的那群人交給下游。所以「範圍內只打帶〔恐懼〕的敵人」寫得出來，
 *     ⛔ 但要寫在 `victimCondition` 那一格，不是這一格。
 *   · `randomArea` —— 它解的是**落點**不是受害者（`targets: []` + `point`，
 *     `effects/randomArea.ts` 的刻意設計）。「這一波打到誰」由巢狀的 `damageArea`
 *     用 `ctx.point` 當圓心自己解，所以過濾與鏈結寫在那個巢狀 kind 上。
 *     ⛔ 不要在 `randomArea` 自己身上再開一份，那是同一件事的第二個住處。
 *
 * ⭐ `leap.onLand` **不在**這份清單裡（2026-08-10 更正，第三守則）。
 * `systems/LeapSystem.ts::detonate` 把 `enemiesInCircle(...)` 直接餵成
 * `ctx.targets`，所以它走的正是 ③ 那條**逐一過濾**的路。實測：`onLand` 帶
 * `condition:{status,target,fear}` 時只有帶恐懼的身體挨打，乾淨的那個沒有；
 * 拿掉 condition 兩個都挨打。⚠️ 這一行在此之前把它列在這裡，而
 * `effects/effect.ts` 的 `EffectCommon.condition` 抄了同一句 —— 兩份自洽的註解
 * 在同一件事上撒謊，而下一個人會照著去實作一個已經存在的機制。
 * ⚠️ 真的邊界（要記住，不要當成 bug 修）：`landRadius` 省略或 0 時 `targets` 是
 * 空的，此時 `onLand` 上的 condition 退化成整段閘且 `subject:"target"` 讀 FALSE。
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
