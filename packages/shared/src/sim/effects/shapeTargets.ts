/**
 * `shape` 那一格的**唯一**一份解析（E1 硬約束的實作面，#278）。
 *
 * ── 為什麼這要是一支共用函式 ─────────────────────────────────────────────
 * owner 核准的 E1 是「新 kind 一律帶 `shape`」。那句話如果只落在 schema 上，
 * 每一個新 kind 就會**各自手寫一份**「圓怎麼取人」——而它們分歧的那一天沒有
 * 人會發現，因為每一份看起來都對。A4b 的 `dispel` 是第一份，D1 的
 * `shieldBreak` 是第二份，D2/D3 還在路上。
 *
 * ⛔ **全序不是裝飾**：`maxTargets` 正好在排序之後切一刀，所以少了第二關鍵字
 * 就是把「誰被打到」交給 `Array.prototype.sort` 的實作定義行為 —— 那是 #198
 * 那一族 desync 的形狀（理由與 `damageArea.ts` 那一段逐字相同）。
 *
 * ── purity ──────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式。`alliedChampions` 自己已經排序過
 *（`sim/purity.test.ts` 在守 Map 迭代順序）。
 */
import type { EntityId } from "../../ids";
import type { EffectContext } from "./effect";
import { enemiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { alliedChampions } from "./hooks";
import { distSq } from "../math/vec2";

/** 帶 `shape` 的 effect 共有的那幾格。 */
export interface ShapedEffect {
  shape: "single" | "circle";
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
}

/**
 * 把 `shape` 解析成一串目標。
 *
 * `single` = 上游（`target: self|event|allies` 那一層）已經解析好的那些人 ——
 * 這一層**不重新發明目標選擇**。
 *
 * `circle` 回傳按「近的先，同距離時 id 小的先」排好的前 `maxTargets` 個。
 * 半徑無效（≤ 0）或找不到圓心時回傳空陣列 —— 呼叫端因此可以無腦 `for`。
 */
export function shapeTargets(e: ShapedEffect, ctx: EffectContext): EntityId[] {
  const { world } = ctx;
  if (e.shape !== "circle") return [...ctx.targets];

  const radius = resolveAbilityRadius(world, e.radius ?? 0);
  if (radius <= 0) return [];
  const centre =
    (ctx.targets[0] !== undefined ? world.transform.get(ctx.targets[0])?.pos : undefined) ??
    ctx.point ??
    world.transform.get(ctx.caster)?.pos;
  if (!centre) return [];

  let victims: EntityId[];
  if (e.side === "enemies") {
    victims = enemiesInCircle(world, ctx.caster, centre, radius);
  } else {
    // 友方圓 —— 用**同一份** broadphase 的反面：先取全隊英雄，再用半徑濾。
    // ⚠️ 沒有 `alliesInCircle`，而這裡不新造第二套空間查詢：`alliedChampions`
    // 已經是排序過的全序名單，一場最多 12 個人，距離濾是 12 次平方比較。
    const r2 = radius * radius;
    victims = alliedChampions(world, ctx.caster).filter((id) => {
      const t = world.transform.get(id);
      return t !== undefined && distSq(centre, t.pos) <= r2;
    });
  }

  const withD = victims
    .map((id) => ({ id, d2: distSq(centre, world.transform.get(id)!.pos) }))
    .sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id));
  const cap = e.maxTargets ?? withD.length;
  return withD.slice(0, Math.max(0, cap)).map((v) => v.id);
}
