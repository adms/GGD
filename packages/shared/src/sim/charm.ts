/**
 * 魅惑（GH#1197 阿璃 E）—— `sim/fear.ts` 的鏡像：恐懼把身體推**離**最近的敵人，魅惑把身體拉**向**施加者。
 * 同一個模型：住在 `StatusEffect.charmed` 上（⛔ 不是新元件），每 tick 由 `charmPass` 覆寫 nav，
 * 指令在 OrderSystem 被 `charmDropsOrders` 丟掉。解除（到期／被淨化）那一 tick 起 nav 不再被碰 ⇒ 恢復正常。
 * ⛔ 沒有 Math.random／Date／三角（sim purity）。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/** 現在生效中的魅惑，回它的施加者（多筆時取 applierId 最小的，決定性）。 */
export function charmSourceOf(world: SimWorld, id: EntityId): EntityId | null {
  const st = world.status.get(id);
  if (st === undefined) return null;
  let best: EntityId | null = null;
  for (const e of st.effects) {
    if (e.charmed !== true || e.expiresAtTick <= world.tick || e.applierId === undefined) continue;
    if (best === null || e.applierId < best) best = e.applierId;
  }
  return best;
}

export function isCharmed(world: SimWorld, id: EntityId): boolean {
  return charmSourceOf(world, id) !== null;
}

/** 魅惑中 ⇒ 玩家／bot 的指令這一 tick 一律丟掉（OrderSystem）。 */
export function charmDropsOrders(world: SimWorld, id: EntityId): boolean {
  return isCharmed(world, id);
}

/** 走向施加者：目標就是對方**當下**位置（施加者死了／不在 ⇒ 站住）。 */
export function charmWalk(world: SimWorld, id: EntityId, source: EntityId): void {
  const nav = world.nav.get(id);
  const t = world.transform.get(id);
  if (nav === undefined || t === undefined) return;
  nav.order = null;
  nav.attackTarget = null;
  nav.attackTargetAuto = false;
  world.autoEngaging.delete(id);
  const src = world.transform.get(source);
  const srcHp = world.health.get(source);
  if (src === undefined || srcHp?.alive === false || src.zone !== t.zone) {
    nav.moveTarget = null;
    return;
  }
  nav.moveTarget = { x: src.pos.x, z: src.pos.z };
}

export function charmPass(world: SimWorld): void {
  const ids: EntityId[] = [...world.nav.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const src = charmSourceOf(world, id);
    if (src !== null) charmWalk(world, id, src);
  }
}
