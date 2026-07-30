/**
 * Helpers shared by more than one effect kind. Everything here was lifted
 * VERBATIM out of the pre-split effectRunner switch (GH#289) — same bodies,
 * same comments, same numbers.
 *
 * A helper used by exactly ONE kind stays in that kind's own module (see
 * `areaCentre` in damageArea.ts): the point of the split is that a lane owns a
 * file, and hoisting single-use helpers here would rebuild the shared surface
 * this refactor exists to dissolve.
 */
import type { EntityId, StatusId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { EffectContext, EffectDef } from "./effect";
import { resolveScaling } from "./effect";
import type { Stat } from "../stats/statTypes";

export function casterStats(ctx: EffectContext): Record<Stat, number> {
  return ctx.world.stats.get(ctx.caster)?.final ?? ({} as Record<Stat, number>);
}

/**
 * Does `id` still carry `statusId` on THIS tick? StatusSystem prunes expired
 * entries at the top of the tick, but it runs before abilities resolve within a
 * tick, so the `> world.tick` re-check is what makes the combo window close on
 * the exact tick the JASS's `TriggerSleepAction(1.00)` would have cleared the
 * marker — one tick either way is a different spell at 30 Hz.
 */
export function hasStatus(world: SimWorld, id: EntityId, statusId: StatusId): boolean {
  const st = world.status.get(id);
  if (!st) return false;
  return st.effects.some((s) => s.statusId === statusId && s.expiresAtTick > world.tick);
}

/**
 * The COMBO-WINDOW addend, resolved against the world AS IT IS RIGHT NOW.
 *
 * "Right now" is the whole point, and it is why the `damage` kind's `bake`
 * exists: in the JASS this term is read at CAST time (`udg_MoonCombo == 2`,
 * j:34189) and added straight into `udg_MoonDamage` (j:34214) — the number is
 * frozen before the 41-tick arc even starts, and the AoE at the far end merely
 * pays out the frozen variable (j:34262). Anything that calls this at PAYOUT
 * time is asking a question the source never asked.
 */
export function comboAddend(
  e: Extract<EffectDef, { kind: "damage" }>,
  ctx: EffectContext,
): number {
  const combo = e.comboBonus;
  if (combo === undefined) return 0;
  if (!hasStatus(ctx.world, ctx.caster, combo.statusId)) return 0;
  return resolveScaling(casterStats(ctx), combo.amount, ctx.rank);
}

/**
 * 存款加成 —— `min(標記帶的數字 × coeff, max)`,只在 CASTER 還持有標記時計入。
 *
 * ⚠️ `magnitude` 缺席時回 0 而不是「照樣加 coeff × 某個預設」:一個沒有數字的
 * 標記代表存款沒有被開出來(或已經過期被 statusExpirySystem 清掉),而那時候
 * 玩家並沒有付出任何法力 —— 給他傷害就是憑空發錢。
 *
 * ⚠️ 用 MAX 而不是 SUM:同一個標記在視窗內只會有一筆(spendMana 每次覆寫),
 * 但 `applyStatus` 的疊加語意允許重複條目存在,取最大值讓「多存一次」不會
 * 意外變成乘法。
 */
export function bankedAddend(
  e: Extract<EffectDef, { kind: "damage" }>,
  ctx: EffectContext,
): number {
  const b = e.bankedBonus;
  if (b === undefined) return 0;
  const st = ctx.world.status.get(ctx.caster);
  if (!st) return 0;
  let banked = 0;
  for (const s of st.effects) {
    if (s.statusId !== b.statusId || s.expiresAtTick <= ctx.world.tick) continue;
    if ((s.magnitude ?? 0) > banked) banked = s.magnitude ?? 0;
  }
  if (banked <= 0) return 0;
  return Math.min(banked * b.coeff, b.max);
}
