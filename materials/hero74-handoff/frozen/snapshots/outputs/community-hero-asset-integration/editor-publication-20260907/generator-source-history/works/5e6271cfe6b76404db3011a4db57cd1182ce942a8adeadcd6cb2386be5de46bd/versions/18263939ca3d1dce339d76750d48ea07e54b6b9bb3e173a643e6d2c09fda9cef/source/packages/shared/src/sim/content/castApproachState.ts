// Shared leaf: ability execution and replay hashing must read the same pending casts.
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot, Order } from "../intents";

export interface CastApproach {
  suppressCastCredit?: boolean;
  slot: CastableSlot;
  targetId: EntityId;
  /** 按鍵那一格的施法者座標 —— `maxApproachDistance` 從這裡量起。 */
  from: { x: number; z: number };
  /**
   * 我們寫進 `nav.moveTarget` 的**那一個物件**。
   *
   * ⭐ 它是一枚**身分權杖**,不只是一個座標:`OrderSystem` 每次套用一條新指令
   * (玩家的走位、追擊、「卡住就接敵」)都會寫一個**新的**物件進去。所以
   * `nav.moveTarget !== ours` 就是「移動通道被別人接管了」——
   * ⛔ 不必去比對座標值(目標會動,值本來就每 tick 都不一樣)。
   */
  token: { x: number; z: number };
  /** 同上，`nav.order` 的那一枚。 */
  orderToken: Order;
}

export const CAST_APPROACHES = new WeakMap<SimWorld, Map<EntityId, CastApproach>>();
export function approachesOf(world: SimWorld): Map<EntityId, CastApproach> {
  let pending = CAST_APPROACHES.get(world);
  if (!pending) {
    pending = new Map();
    CAST_APPROACHES.set(world, pending);
  }
  return pending;
}
