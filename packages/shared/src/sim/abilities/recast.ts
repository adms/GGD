/**
 * 【再次施放】（GH#1187）—— 純函式，⛔ 沒有 Math.random／Date／三角（sim purity）。
 *
 * 一個機制、三支技能（第〇·五守則）：阿璃 R 三段衝刺 · 瑟雷西 Q 命中後沿鉤進場 · 鄂爾 R 撞羊改向。
 * 生命週期住在 `AbilityInstance.recast`（`stats/statsComp.ts`），全部絕對 tick：
 *
 *   首放 ─ armRecast ─▶ 後段窗口 ─ recastPressGate＋consumeRecastCharge ─▶ 次數用完 ─┐
 *                        │                                                          ├─ finishRecast
 *                        └─ 窗口到期／施法者死亡（sweepRecast，每 tick）─────────────┘
 *
 * 住在獨立模組是因為 `combat/damage.ts`（命中歸因）與 `abilities/abilitySystem.ts`（施放）都要用，
 * ⛔ 而它們互相 import 會成環。
 */
import type { CastInstance } from "../content/castInstance";
import type { AbilityInstance, RecastState } from "../stats/statsComp";
import type { AbilityRecast } from "../content/defs";
import type { EntityId } from "../../ids";

/** `ability@1.recast` 的形狀 —— 一個住處（`content/defs.ts`），這裡只讀。 */
export type RecastSpec = AbilityRecast;

/** 首放成功之後開窗。回傳這一次**應該**寫進 cooldownRemainingTicks 的值（`cooldownAt:"end"` ⇒ 0，先暫存）。 */
export function armRecast(inst: AbilityInstance, spec: RecastSpec, nowTick: number, dt: number, cooldownTicks: number): number {
  const deferred = spec.cooldownAt === "end";
  const state: RecastState = {
    untilTick: nowTick + Math.max(1, Math.round(spec.windowSec / dt)),
    chargesLeft: spec.charges,
    hit: false,
    serial: -1, // ⭐ 首段的 castInstance.serial 在 noteAbilityCast 之後才填（bindRecastSerial）
    pendingCooldownTicks: deferred ? cooldownTicks : 0,
  };
  inst.recast = state;
  return deferred ? 0 : cooldownTicks;
}

/** 首段的施放序號 —— 命中歸因只認這一次（⛔ 不然上一次施放的傷害會替這一次開窗）。 */
export function bindRecastSerial(inst: AbilityInstance, serial: number): void {
  if (inst.recast && inst.recast.serial < 0) inst.recast.serial = serial;
}

/**
 * 這一按是不是「後段」？回傳 null = 不是（走正常施放）；回傳字串 = 是後段但被擋（原因）；回傳 "recast" = 放行。
 * ⚠️ 順序刻意：先問「在不在窗口內」，再問 gate —— 窗口外的按鍵就是一次普通施放（會撞冷卻），⛔ 不是永遠卡住。
 */
export function recastPressGate(inst: AbilityInstance, spec: RecastSpec | undefined, nowTick: number): "recast" | "gate" | null {
  const r = inst.recast;
  if (!spec || !r) return null;
  if (nowTick >= r.untilTick || r.chargesLeft <= 0) return null;
  if (spec.gate === "onHit" && !r.hit) return "gate";
  return "recast";
}

/** 後段用掉一次；用完 ⇒ finish。回傳 true = 這是最後一次。 */
export function consumeRecastCharge(inst: AbilityInstance): boolean {
  const r = inst.recast;
  if (!r) return true;
  r.chargesLeft -= 1;
  if (r.chargesLeft <= 0) { finishRecast(inst); return true; }
  return false;
}

/** 階段結束：⭐ 若冷卻被延後（cooldownAt:"end"）就在這裡寫。⛔ 不留任何殘留狀態。 */
export function finishRecast(inst: AbilityInstance): void {
  const r = inst.recast;
  if (!r) return;
  if (r.pendingCooldownTicks > 0) inst.cooldownRemainingTicks = Math.max(inst.cooldownRemainingTicks, r.pendingCooldownTicks);
  delete inst.recast;
}

/** 每 tick：窗口到期／施法者死亡 ⇒ 結束（tickCooldowns 呼叫）。 */
export function sweepRecast(inst: AbilityInstance, nowTick: number, alive: boolean): void {
  const r = inst.recast;
  if (!r) return;
  if (!alive || nowTick >= r.untilTick) finishRecast(inst);
}

/** 傷害封包命中受害者 ⇒ 若它是某槽首段的那一次施放，開窗（`gate:"onHit"`）並記第一個受害者。 */
export function markRecastHit(
  slots: Partial<Record<CastInstance["slot"], AbilityInstance>>,
  ci: CastInstance,
  victim: EntityId,
): void {
  if (victim === ci.caster) return; // 打到自己不算命中（自傷技的首段不能替自己開門）
  const inst = slots[ci.slot];
  const r = inst?.recast;
  if (!inst || !r || r.serial !== ci.serial || r.hit) return;
  r.hit = true;
  r.anchor = victim;
}
