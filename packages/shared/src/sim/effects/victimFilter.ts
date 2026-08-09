/**
 * G1 —— 「自己解幾何的 kind」共用的兩支模板：**圈內逐一過濾** 與 **把打到的那群
 * 人交給下游**。
 *
 * ⭐ 為什麼是一支共用檔而不是在兩個 handler 各寫一份（第零守則⑨）：
 * `damageArea`（圓）與 `damageLine`（膠囊）在這一族上是**同一個機制的兩個形狀** ——
 * 解幾何 → 排全序 → 過濾 → 切上限 → 交下游。抄兩份就是兩份會各自腐爛的程式，
 * 而它們之間的分歧（例如只有一邊處理 `maxTargetsCounts`）在畫面上跟「這張卡就是
 * 這樣設計的」分不出來。
 *
 * ⛔ 這裡**沒有第二套條件系統**：求值器是 `effectRunner::gateOnCondition` 用的
 * 同一支 `evaluateCondition`、同一組葉子、同一個兩相位 rng 規約。
 * 兩者的差別只在**問誰**：上游閘問的是 `ctx.targets`（上游交下來的震央），
 * 這裡問的是**這個圓／這條線自己解出來的候選**。
 *
 * ⚠️ 未來任何「自己解幾何 + 要逐一過濾 + 要把打到的人交下游」的 kind
 *（例如 collision-aware 的 `dashOnEnd`）都應該呼叫這兩支，⛔ 不要抄第三份。
 */
import { evaluateCondition } from "../content/condition";
import type { EffectCondition } from "../content/condition";
import type { EffectContext, EffectDef } from "./effect";
import type { RunList } from "./effectKind";
import type { EntityId } from "../../ids";

/**
 * 候選（已排好全序）→ **真的挨打的那群人**。
 *
 * ⛔ `cond` 缺席時一次 `evaluateCondition` 都不呼叫 —— 零 rng draw，所以既有
 * 內容（今天 0 份文件填這一格）逐位元不變。
 *
 * ⚠️ rng 預算是 `conditionChanceCount(cond) × 候選數`，**與 `cap` 無關**
 *（`effects/effect.ts` 的 `victimCondition` 檔頭承諾）：一律跑滿排序後的整份候選、
 * 不 early-break，否則抽籤次數會被「誰剛好站近一點」綁架，兩個副本會分叉。
 */
export function selectVictims<T extends { id: EntityId }>(
  sorted: readonly T[],
  cap: number,
  cond: EffectCondition | undefined,
  counts: "qualified" | "candidates" | undefined,
  ctx: EffectContext,
): T[] {
  if (cond === undefined) return sorted.length > cap ? sorted.slice(0, cap) : [...sorted];
  const ok = sorted.map((v) =>
    evaluateCondition(ctx.world, cond, { self: ctx.caster, target: v.id }),
  );
  // ⚠️ `candidates` 分支靠「pool 是 sorted 的**前綴**，索引對得上 ok[]」——
  // 這是它只走一次迴圈的理由，改動排序位置時要一起看。
  const pool = counts === "candidates" ? sorted.slice(0, cap) : sorted;
  const kept = pool.filter((_, i) => ok[i] === true);
  return counts === "candidates" ? kept : kept.slice(0, cap);
}

/**
 * `effect.target-set-chain@1` —— 把**這一次真的打到的那群人**當成 `ctx.targets`
 * 交給 `onHitTargets`。
 *
 * ⛔ 交的是 `struck`（過濾後、切完 cap 後的那一份），**不是** `ctx.targets`
 *（上游交下來的震央）—— 用後者就是「畫面上打到 A、狀態蓋在 B」。
 *
 * ⛔ **不需要 bake**：這一段與母效果在同一個 tick 執行，不是延遲 payload，
 * 所以 #247 那個「窗口在飛行途中過期」的問題在這裡不存在。
 */
export function runOnHitChain(
  e: {
    onHitTargets?: EffectDef[];
    runOnEmptyHit?: boolean;
    onHitTargetsMode?: "batch" | "perTarget";
  },
  struck: readonly EntityId[],
  ctx: EffectContext,
  runList: RunList,
): void {
  const chain = e.onHitTargets;
  if (chain === undefined) return; // ⛔ 缺席 = 這一段完全不存在 = 今天
  if (struck.length === 0) {
    // 決策欄（第一守則），預設 false ＝ 今天什麼都不會發生的那個語意。
    if (e.runOnEmptyHit === true) runList(chain, { ...ctx, targets: [] });
    return;
  }
  if ((e.onHitTargetsMode ?? "batch") === "perTarget") {
    for (const id of struck) runList(chain, { ...ctx, targets: [id] });
    return;
  }
  runList(chain, { ...ctx, targets: [...struck] });
}
